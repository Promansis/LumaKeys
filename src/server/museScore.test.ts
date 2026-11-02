// @vitest-environment node

import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MUSESCORE_QUEUE_LIMIT, convertMuseScoreToMidi } from './museScore';
import { MIDI_FILE_LIMIT_BYTES } from './webSecurity';

describe.skipIf(process.platform !== 'linux')('MuseScore import requirements', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reports when a converter has not been configured', async () => {
    vi.stubEnv('LUMAKEYS_MUSESCORE_PATH', '');

    await expect(convertMuseScoreToMidi(new Uint8Array([1]))).rejects.toThrow('MSCZ import requires MuseScore 4');
  });

  // ADR 0002 item 4: a blank value is unset, and a value is trimmed.
  it('treats a whitespace converter path as not configured', async () => {
    vi.stubEnv('LUMAKEYS_MUSESCORE_PATH', '   ');

    await expect(convertMuseScoreToMidi(new Uint8Array([1]))).rejects.toThrow('MSCZ import requires MuseScore 4');
  });

  it('rejects empty and oversized scores before starting a converter', async () => {
    vi.stubEnv('LUMAKEYS_MUSESCORE_PATH', '/missing/musescore');

    await expect(convertMuseScoreToMidi(new Uint8Array())).rejects.toThrow('non-empty and no larger than 10 MB');
    await expect(convertMuseScoreToMidi(new Uint8Array(MIDI_FILE_LIMIT_BYTES + 1))).rejects.toThrow('no larger than 10 MB');
  });

  it('reports a missing executable and leaves conversion available for a retry', async () => {
    vi.stubEnv('LUMAKEYS_MUSESCORE_PATH', '/missing/musescore');

    await expect(convertMuseScoreToMidi(new Uint8Array([1]))).rejects.toThrow('converter is unavailable');
    await expect(convertMuseScoreToMidi(new Uint8Array([1]))).rejects.toThrow('converter is unavailable');
  });

  // PH-SEC-004: the converter is a one-slot queue, not a reject-if-busy flag.
  // The stub is a shell script run through the real prlimit path; it logs the
  // first input byte on start and end, sleeps, then writes a minimal MIDI header.
  describe('conversion queue', () => {
    const dirs: string[] = [];

    async function makeStub(delaySeconds: string) {
      const dir = await mkdtemp(join(tmpdir(), 'lumakeys-mscz-stub-'));
      dirs.push(dir);
      const log = join(dir, 'log.txt');
      const stub = join(dir, 'stub.sh');
      await writeFile(stub, [
        '#!/bin/sh',
        'out="$2"; in="$3"',
        'tag=$(head -c1 "$in")',
        `echo "start $tag" >> '${log}'`,
        `sleep ${delaySeconds}`,
        `echo "end $tag" >> '${log}'`,
        'printf "MThd\\000\\000\\000\\006\\000\\001\\000\\001\\001\\340" > "$out"',
        '',
      ].join('\n'));
      await chmod(stub, 0o755);
      vi.stubEnv('LUMAKEYS_MUSESCORE_PATH', stub);
      return log;
    }

    const score = (tag: string) => new Uint8Array([tag.charCodeAt(0), 1, 2, 3]);

    afterEach(async () => {
      await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
    });

    it('converts two concurrent scores one after another, in order', async () => {
      const log = await makeStub('0.2');

      const results = await Promise.all([convertMuseScoreToMidi(score('A')), convertMuseScoreToMidi(score('B'))]);

      expect(results.map((midi) => Buffer.from(midi).toString('ascii', 0, 4))).toEqual(['MThd', 'MThd']);
      expect((await readFile(log, 'utf8')).trim().split('\n')).toEqual(['start A', 'end A', 'start B', 'end B']);
    });

    it('fails a request beyond the queue cap with a queue message, and recovers', async () => {
      const log = await makeStub('0.05');
      const tags = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, MUSESCORE_QUEUE_LIMIT + 1);

      const settled = await Promise.allSettled(tags.map((tag) => convertMuseScoreToMidi(score(tag))));

      expect(settled.slice(0, MUSESCORE_QUEUE_LIMIT).map((r) => r.status)).toEqual(
        Array(MUSESCORE_QUEUE_LIMIT).fill('fulfilled'),
      );
      const overflow = settled[MUSESCORE_QUEUE_LIMIT] as PromiseRejectedResult;
      expect(overflow.status).toBe('rejected');
      expect(overflow.reason.message).toMatch(/waiting for the MuseScore converter/);
      expect(overflow.reason.message).not.toMatch(/damaged|unable to convert/i);
      expect((await readFile(log, 'utf8')).match(/^start /gm)).toHaveLength(MUSESCORE_QUEUE_LIMIT);

      await expect(convertMuseScoreToMidi(score('Z'))).resolves.toBeInstanceOf(Uint8Array);
    });

    it('keeps converting after a failed conversion', async () => {
      vi.stubEnv('LUMAKEYS_MUSESCORE_PATH', '/missing/musescore');
      await expect(convertMuseScoreToMidi(score('A'))).rejects.toThrow('converter is unavailable');

      await makeStub('0');
      await expect(convertMuseScoreToMidi(score('B'))).resolves.toBeInstanceOf(Uint8Array);
    });
  });
});
