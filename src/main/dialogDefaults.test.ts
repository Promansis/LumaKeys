import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lastDirectory, rememberPath, resetDialogDefaults, saveDefaultPath } from './dialogDefaults';

let root: string;

beforeEach(() => {
  resetDialogDefaults();
  root = mkdtempSync(join(tmpdir(), 'lumakeys-dialog-defaults-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeDir(name: string): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('lastDirectory and rememberPath', () => {
  it('returns nothing before any pick', () => {
    expect(lastDirectory('midiFile')).toBeUndefined();
  });

  it('remembers the folder of a picked file', () => {
    const dir = makeDir('midi');
    rememberPath('midiFile', join(dir, 'song.mid'));

    expect(lastDirectory('midiFile')).toBe(dir);
  });

  it('remembers the picked folder itself for folder kinds', () => {
    const dir = makeDir('packs');
    rememberPath('samplePackFolder', dir);
    rememberPath('midiFolder', dir);

    expect(lastDirectory('samplePackFolder')).toBe(dir);
    expect(lastDirectory('midiFolder')).toBe(dir);
  });

  it('keeps kinds independent', () => {
    const midiDir = makeDir('midi');
    const audioDir = makeDir('audio');
    rememberPath('midiFile', join(midiDir, 'a.mid'));
    rememberPath('audioFile', join(audioDir, 'b.mp3'));

    expect(lastDirectory('midiFile')).toBe(midiDir);
    expect(lastDirectory('audioFile')).toBe(audioDir);
    expect(lastDirectory('libraryJson')).toBeUndefined();
    expect(lastDirectory('midiFolder')).toBeUndefined();
    expect(lastDirectory('midiExport')).toBeUndefined();
    expect(lastDirectory('wavExport')).toBeUndefined();
  });

  it('replaces the remembered folder with the latest pick', () => {
    const first = makeDir('first');
    const second = makeDir('second');
    rememberPath('midiFile', join(first, 'a.mid'));
    rememberPath('midiFile', join(second, 'b.mid'));

    expect(lastDirectory('midiFile')).toBe(second);
  });

  it('ignores a remembered folder that no longer exists', () => {
    const dir = makeDir('gone');
    rememberPath('midiFile', join(dir, 'a.mid'));
    rmSync(dir, { recursive: true, force: true });

    expect(lastDirectory('midiFile')).toBeUndefined();
  });

  it('ignores a remembered path that is a file, not a folder', () => {
    const dir = makeDir('folder');
    const file = join(dir, 'not-a-folder');
    writeFileSync(file, 'x');
    rememberPath('samplePackFolder', file);

    expect(lastDirectory('samplePackFolder')).toBeUndefined();
  });

  it('remembers nothing for a cancelled dialog and keeps the earlier folder', () => {
    const dir = makeDir('midi');
    rememberPath('midiFile', undefined);
    expect(lastDirectory('midiFile')).toBeUndefined();

    rememberPath('midiFile', join(dir, 'a.mid'));
    rememberPath('midiFile', undefined);
    rememberPath('midiFile', '');

    expect(lastDirectory('midiFile')).toBe(dir);
  });

  it('does not remember a bare file name with no folder', () => {
    rememberPath('midiFile', 'song.mid');

    expect(lastDirectory('midiFile')).toBeUndefined();
  });
});

describe('saveDefaultPath', () => {
  it('keeps the bare suggested name when nothing is remembered', () => {
    expect(saveDefaultPath('midiExport', 'tune.mid')).toBe('tune.mid');
  });

  it('joins the remembered folder with the suggested name as an absolute path', () => {
    const dir = makeDir('exports');
    rememberPath('midiExport', join(dir, 'earlier.mid'));

    const result = saveDefaultPath('midiExport', 'tune.mid');

    expect(result).toBe(join(dir, 'tune.mid'));
    expect(isAbsolute(result)).toBe(true);
    expect(dirname(result)).toBe(dir);
  });

  it('falls back to the bare name when the remembered folder is gone', () => {
    const dir = makeDir('exports');
    rememberPath('wavExport', join(dir, 'earlier.wav'));
    rmSync(dir, { recursive: true, force: true });

    expect(saveDefaultPath('wavExport', 'tune.wav')).toBe('tune.wav');
  });

  it('does not use another kind\'s folder', () => {
    const dir = makeDir('exports');
    rememberPath('midiExport', join(dir, 'earlier.mid'));

    expect(saveDefaultPath('wavExport', 'tune.wav')).toBe('tune.wav');
  });

  it('shares the library folder between backup export and restore', () => {
    const dir = makeDir('backups');
    rememberPath('libraryJson', join(dir, 'lumakeys-library-2026-10-21.json'));

    expect(lastDirectory('libraryJson')).toBe(dir);
    expect(saveDefaultPath('libraryJson', 'lumakeys-library-2026-10-22.json')).toBe(
      join(dir, 'lumakeys-library-2026-10-22.json'),
    );
  });

  it('keeps only the file name of a suggestion that carries folder parts', () => {
    const dir = makeDir('exports');
    rememberPath('midiExport', join(dir, 'earlier.mid'));

    expect(saveDefaultPath('midiExport', join('..', 'elsewhere', 'tune.mid'))).toBe(join(dir, 'tune.mid'));
  });
});
