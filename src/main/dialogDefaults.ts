import { statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';

// Electron 43 stopped restoring each dialog's last folder, so the main process keeps its own.
// The folders live in memory only: they are forgotten when the app closes and never persisted.

export type DialogKind =
  | 'midiFile'
  | 'midiFolder'
  | 'libraryJson'
  | 'audioFile'
  | 'samplePackFolder'
  | 'midiExport'
  | 'wavExport';

// Folder pickers remember the picked folder; file pickers and save dialogs remember the file's folder.
const FOLDER_KINDS: ReadonlySet<DialogKind> = new Set<DialogKind>(['midiFolder', 'samplePackFolder']);

const remembered = new Map<DialogKind, string>();

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function lastDirectory(kind: DialogKind): string | undefined {
  const directory = remembered.get(kind);
  return directory !== undefined && isDirectory(directory) ? directory : undefined;
}

export function rememberPath(kind: DialogKind, pickedPath: string | undefined): void {
  if (!pickedPath || !isAbsolute(pickedPath)) {
    return;
  }

  remembered.set(kind, FOLDER_KINDS.has(kind) ? pickedPath : dirname(pickedPath));
}

export function saveDefaultPath(kind: DialogKind, suggestedName: string): string {
  const directory = lastDirectory(kind);
  return directory === undefined ? suggestedName : join(directory, basename(suggestedName));
}

export function resetDialogDefaults(): void {
  remembered.clear();
}
