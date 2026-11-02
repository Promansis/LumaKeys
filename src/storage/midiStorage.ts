import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  getAppOwnedMidiStoragePath,
  getSafeMidiStorageFilename,
  isPathContainedInRoot,
} from '../lib/storage/storageSafety';

export interface MidiStorageStagedFile {
  finalPath: string;
  commit: () => Promise<void>;
  rollback?: () => Promise<void>;
  discard: () => Promise<void>;
}

export interface MidiStorageSnapshot {
  files: Array<{ relativePath: string; data: Uint8Array }>;
}

export interface MidiStorageAdapter {
  getPathForSong: (songId: string) => string;
  read: (songId: string) => Promise<Uint8Array>;
  write: (songId: string, data: Uint8Array) => Promise<string>;
  delete: (songId: string) => Promise<void>;
  stage: (songId: string, data: Uint8Array) => Promise<MidiStorageStagedFile>;
  reset: () => Promise<void>;
  snapshot?: () => Promise<MidiStorageSnapshot>;
  restoreSnapshot?: (snapshot: MidiStorageSnapshot) => Promise<void>;
  stageDelete?: (operationId: string, songIds: string[]) => Promise<void>;
  commitDelete?: (operationId: string) => Promise<void>;
  rollbackDelete?: (operationId: string) => Promise<void>;
  stageRestore?: (operationId: string, songId: string, data: Uint8Array) => Promise<MidiStorageStagedFile>;
  commitRestore?: (operationId: string) => Promise<void>;
  rollbackRestore?: (operationId: string) => Promise<void>;
  stageReset?: (operationId: string) => Promise<void>;
  commitReset?: (operationId: string) => Promise<void>;
  rollbackReset?: (operationId: string) => Promise<void>;
}

export class FileSystemMidiStorageAdapter implements MidiStorageAdapter {
  constructor(private readonly rootDir: string) {}

  getPathForSong(songId: string): string {
    const path = getAppOwnedMidiStoragePath(this.rootDir, songId);
    if (!path) {
      throw new Error(`Unsafe song id: ${songId}`);
    }
    return path;
  }

  async read(songId: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.getPathForSong(songId)));
  }

  async write(songId: string, data: Uint8Array): Promise<string> {
    await mkdir(this.rootDir, { recursive: true });
    const path = this.getPathForSong(songId);
    await writeFile(path, data);
    return path;
  }

  async delete(songId: string): Promise<void> {
    const path = getAppOwnedMidiStoragePath(this.rootDir, songId);
    if (!path) {
      return;
    }
    await rm(path, { force: true });
  }

  async stage(songId: string, data: Uint8Array): Promise<MidiStorageStagedFile> {
    await mkdir(this.rootDir, { recursive: true });
    const finalPath = this.getPathForSong(songId);
    const stagingDir = this.createStagingDir();
    await mkdir(stagingDir, { recursive: true });
    const stagingPath = this.getStagingPath(stagingDir, songId);
    await writeFile(stagingPath, data);
    let backupPath: string | undefined;
    let committed = false;

    return {
      finalPath,
      commit: async () => {
        try {
          if (await this.pathExists(finalPath)) {
            backupPath = join(stagingDir, '.previous');
            await rename(finalPath, backupPath);
          }
          await rename(stagingPath, finalPath);
          committed = true;
        } catch (error) {
          await this.restoreCommittedFile(finalPath, backupPath);
          backupPath = undefined;
          throw error;
        }
      },
      rollback: async () => {
        if (!committed) {
          return;
        }
        await this.restoreCommittedFile(finalPath, backupPath);
        committed = false;
        backupPath = undefined;
      },
      discard: async () => {
        await rm(stagingDir, { recursive: true, force: true });
      },
    };
  }

  async reset(): Promise<void> {
    await rm(this.rootDir, { recursive: true, force: true });
    await mkdir(this.rootDir, { recursive: true });
  }

  async snapshot(): Promise<MidiStorageSnapshot> {
    const files: MidiStorageSnapshot['files'] = [];
    await this.collectFiles(this.rootDir, '', files);
    return { files };
  }

  async restoreSnapshot(snapshot: MidiStorageSnapshot): Promise<void> {
    await this.reset();
    for (const file of snapshot.files) {
      const path = join(this.rootDir, file.relativePath);
      if (!isPathContainedInRoot(this.rootDir, path)) {
        throw new Error(`Unsafe MIDI snapshot path: ${file.relativePath}`);
      }
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.data);
    }
  }

  async stageDelete(operationId: string, songIds: string[]): Promise<void> {
    const stagingDir = this.getDeleteStagingDir(operationId);
    await mkdir(stagingDir, { recursive: true });
    for (const songId of [...new Set(songIds)]) {
      const finalPath = this.getPathForSong(songId);
      if (await this.pathExists(finalPath)) {
        await rename(finalPath, join(stagingDir, basename(finalPath)));
      }
    }
  }

  async commitDelete(operationId: string): Promise<void> {
    await rm(this.getDeleteStagingDir(operationId), { recursive: true, force: true });
  }

  async rollbackDelete(operationId: string): Promise<void> {
    const stagingDir = this.getDeleteStagingDir(operationId);
    for (const entry of await readdir(stagingDir, { withFileTypes: true }).catch(() => [])) {
      if (entry.isFile()) {
        await rename(join(stagingDir, entry.name), join(this.rootDir, entry.name));
      }
    }
    await rm(stagingDir, { recursive: true, force: true });
  }

  async stageRestore(operationId: string, songId: string, data: Uint8Array): Promise<MidiStorageStagedFile> {
    await mkdir(this.rootDir, { recursive: true });
    const finalPath = this.getPathForSong(songId);
    const stagingDir = join(this.getRestoreStagingDir(operationId), songId);
    await mkdir(stagingDir, { recursive: true });
    const stagingPath = join(stagingDir, basename(finalPath));
    if (!isPathContainedInRoot(stagingDir, stagingPath)) {
      throw new Error(`Unsafe MIDI restore staging path for ${songId}.`);
    }

    await writeFile(stagingPath, data);
    const readyPath = join(stagingDir, '.ready');
    const backupPath = join(stagingDir, '.previous');
    await writeFile(readyPath, '');

    return {
      finalPath,
      commit: async () => {
        let movedAside = false;
        try {
          if (await this.pathExists(finalPath)) {
            await rename(finalPath, backupPath);
            movedAside = true;
          }
          await rename(stagingPath, finalPath);
        } catch (error) {
          // Only undo a move this commit made: whatever still stands at finalPath (a
          // file or a directory) is not ours to remove, and the first error is the one
          // that explains the failure.
          if (movedAside) {
            await this.restoreCommittedFile(finalPath, backupPath).catch(() => undefined);
          }
          throw error;
        }
      },
      rollback: async () => {
        await this.rollbackStagedRestoreFile(stagingDir, finalPath, stagingPath, backupPath);
      },
      discard: async () => {
        await rm(stagingDir, { recursive: true, force: true });
      },
    };
  }

  async commitRestore(operationId: string): Promise<void> {
    await rm(this.getRestoreStagingDir(operationId), { recursive: true, force: true });
  }

  async rollbackRestore(operationId: string): Promise<void> {
    const operationDir = this.getRestoreStagingDir(operationId);
    for (const entry of await readdir(operationDir, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory()) {
        continue;
      }
      const songId = entry.name;
      const finalPath = this.getPathForSong(songId);
      const stagingDir = join(operationDir, songId);
      await this.rollbackStagedRestoreFile(
        stagingDir,
        finalPath,
        join(stagingDir, basename(finalPath)),
        join(stagingDir, '.previous'),
      );
    }
    await rm(operationDir, { recursive: true, force: true });
  }

  async stageReset(operationId: string): Promise<void> {
    const backupDir = this.getResetStagingDir(operationId);
    await rm(backupDir, { recursive: true, force: true });
    if (await this.pathExists(this.rootDir)) {
      await rename(this.rootDir, backupDir);
    }
    await mkdir(this.rootDir, { recursive: true });
  }

  async commitReset(operationId: string): Promise<void> {
    await rm(this.getResetStagingDir(operationId), { recursive: true, force: true });
  }

  async rollbackReset(operationId: string): Promise<void> {
    const backupDir = this.getResetStagingDir(operationId);
    if (!(await this.pathExists(backupDir))) {
      return;
    }
    await rm(this.rootDir, { recursive: true, force: true });
    await rename(backupDir, this.rootDir);
  }

  private async collectFiles(
    directory: string,
    relativeDirectory: string,
    files: MidiStorageSnapshot['files'],
  ): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const relativePath = join(relativeDirectory, entry.name);
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await this.collectFiles(path, relativePath, files);
      } else if (entry.isFile()) {
        files.push({ relativePath, data: new Uint8Array(await readFile(path)) });
      }
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await readdir(path);
      return true;
    } catch {
      try {
        await readFile(path);
        return true;
      } catch {
        return false;
      }
    }
  }

  private async restoreCommittedFile(finalPath: string, backupPath: string | undefined): Promise<void> {
    await rm(finalPath, { force: true });
    if (backupPath) {
      await rename(backupPath, finalPath).catch(() => undefined);
    }
  }

  private createStagingDir(): string {
    return join(this.rootDir, `.import-${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}`);
  }

  private getDeleteStagingDir(operationId: string): string {
    return join(this.rootDir, `.delete-${operationId}`);
  }

  private getRestoreStagingDir(operationId: string): string {
    return join(this.rootDir, `.restore-${operationId}`);
  }

  private async rollbackStagedRestoreFile(
    stagingDir: string,
    finalPath: string,
    stagingPath: string,
    backupPath: string,
  ): Promise<void> {
    if (!(await this.pathExists(join(stagingDir, '.ready')))) {
      return;
    }
    if (await this.pathExists(stagingPath)) {
      return;
    }
    await rm(finalPath, { force: true });
    if (await this.pathExists(backupPath)) {
      await rename(backupPath, finalPath);
    }
  }

  private getResetStagingDir(operationId: string): string {
    return join(dirname(this.rootDir), `.${basename(this.rootDir)}-reset-${operationId}`);
  }

  private getStagingPath(stagingDir: string, songId: string): string {
    const filename = getSafeMidiStorageFilename(songId);
    if (!filename) {
      throw new Error(`Unsafe song id: ${songId}`);
    }

    const stagingPath = join(stagingDir, basename(filename));
    if (!isPathContainedInRoot(stagingDir, stagingPath)) {
      throw new Error(`Unsafe MIDI staging path for ${songId}.`);
    }
    return stagingPath;
  }
}
