// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { convertMuseScoreToMidi } from './museScore';
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
});
