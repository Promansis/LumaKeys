import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { MIDI_FILE_LIMIT_BYTES } from './webSecurity';

const run = promisify(execFile);
// ponytail: one converter at a time; use a job queue if multi-user imports are needed.
let converting = false;

export async function convertMuseScoreToMidi(bytes: Uint8Array): Promise<Uint8Array> {
  // A blank or whitespace path counts as unset, like the other LUMAKEYS_* variables.
  const converterPath = process.env.LUMAKEYS_MUSESCORE_PATH?.trim();
  if (!converterPath || process.platform !== 'linux') {
    throw new Error('MSCZ import requires MuseScore 4 on the Linux web server. Use the bundled Docker image.');
  }
  if (bytes.length === 0 || bytes.length > MIDI_FILE_LIMIT_BYTES) {
    throw new Error('MuseScore files must be non-empty and no larger than 10 MB.');
  }
  if (converting) {
    throw new Error('Another MuseScore score is being converted. Please try again in a moment.');
  }

  converting = true;
  let dir: string | undefined;
  try {
    await access(converterPath, constants.X_OK).catch(() => {
      throw new Error('The MuseScore converter is unavailable. Check LUMAKEYS_MUSESCORE_PATH or rebuild the Docker image.');
    });
    dir = await mkdtemp(join(tmpdir(), 'lumakeys-mscz-'));
    const inputPath = join(dir, 'score.mscz');
    const outputPath = join(dir, 'score.mid');
    await writeFile(inputPath, bytes);

    try {
      await run('prlimit', [
        '--as=2147483648',
        '--cpu=30',
        `--fsize=${MIDI_FILE_LIMIT_BYTES}`,
        '--', converterPath, '-o', outputPath, inputPath,
      ], {
        cwd: dir,
        timeout: 45000,
        killSignal: 'SIGKILL',
        maxBuffer: 64 * 1024,
        env: {
          PATH: process.env.PATH,
          LANG: 'C.UTF-8',
          HOME: dir,
          XDG_CONFIG_HOME: dir,
          XDG_CACHE_HOME: dir,
          XDG_DATA_HOME: dir,
          XDG_RUNTIME_DIR: dir,
          QT_QPA_PLATFORM: 'offscreen',
          MU_QT_QPA_PLATFORM: 'offscreen',
        },
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('The MuseScore converter is unavailable. Rebuild the bundled Docker image.');
      }
      throw new Error('Unable to convert this MuseScore score. It may be damaged, too complex, or from a newer MuseScore version.');
    }

    const output = await stat(outputPath).catch(() => null);
    if (!output || output.size < 14 || output.size > MIDI_FILE_LIMIT_BYTES) {
      throw new Error('MuseScore did not produce a valid MIDI within the 10 MB limit.');
    }
    const midi = await readFile(outputPath);
    if (midi.toString('ascii', 0, 4) !== 'MThd') {
      throw new Error('MuseScore did not produce a valid MIDI file.');
    }
    return midi;
  } finally {
    try {
      if (dir) {
        await rm(dir, { recursive: true, force: true });
      }
    } finally {
      converting = false;
    }
  }
}
