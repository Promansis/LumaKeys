import { beforeEach, describe, expect, it, vi } from 'vitest';

// A small fake of the parts of Tone the engine uses. Two behaviors are copied from the real library
// because the findings depend on them:
// - Sampler options are merged like Tone's deepMerge: an explicit `baseUrl: undefined` replaces the
//   default '' and each sample URL becomes `baseUrl + url`, so "undefined" + "blob:..." is a bad URL.
// - Tone.Transport (the global export) is bound to the live context. Events scheduled on it never run
//   inside Tone.Offline; only the transport of the context the Offline callback receives renders.
const fake = vi.hoisted(() => {
  const state = {
    samplers: [] as Array<{
      options: Record<string, unknown>;
      resolvedUrls: string[];
      disposed: boolean;
    }>,
    globalTransportSchedules: 0,
    offlineTransportSchedules: [] as number[],
    offlineTransportStarts: 0,
    offlineBuffer: null as Float32Array | null,
    sampleRate: 1000,
  };

  const chainable = {
    toDestination() {
      return this;
    },
    connect() {
      return this;
    },
    dispose() {},
  };

  class Sampler {
    options: Record<string, unknown>;
    resolvedUrls: string[];
    disposed = false;
    loaded = true;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      const baseUrl = 'baseUrl' in options ? options.baseUrl : '';
      this.resolvedUrls = Object.values(options.urls as Record<string, string>).map(
        (url) => `${baseUrl}${url}`,
      );
      state.samplers.push(this);
    }
    toDestination() {
      return this;
    }
    connect() {
      return this;
    }
    dispose() {
      this.disposed = true;
    }
    triggerAttack() {}
    triggerRelease() {}
    triggerAttackRelease(_note: string, duration: number, time: number) {
      fillEnergy(time, duration);
    }
  }

  class PolySynth {
    constructor(..._args: unknown[]) {}
    toDestination() {
      return this;
    }
    connect() {
      return this;
    }
    dispose() {}
    triggerAttack() {}
    triggerRelease() {}
    releaseAll() {}
    triggerAttackRelease(_note: string, duration: number, time: number) {
      fillEnergy(time, duration);
    }
  }

  function fillEnergy(time: number, duration: number): void {
    const data = state.offlineBuffer;
    if (!data) {
      return;
    }
    const from = Math.round(time * state.sampleRate);
    const to = Math.min(data.length, Math.round((time + duration) * state.sampleRate));
    for (let i = from; i < to; i++) {
      data[i] = 0.5;
    }
  }

  class Node {
    volume = { value: 0 };
    roomSize = { value: 0 };
    dampening = 0;
    toDestination() {
      return this;
    }
    connect() {
      return this;
    }
    dispose() {}
  }

  function Offline(
    callback: (context: { transport: unknown }) => Promise<void> | void,
    duration: number,
  ) {
    const scheduled: Array<{ callback: (time: number) => void; time: number }> = [];
    const transport = {
      schedule(cb: (time: number) => void, time: number) {
        state.offlineTransportSchedules.push(time);
        scheduled.push({ callback: cb, time });
      },
      start() {
        state.offlineTransportStarts += 1;
        for (const event of scheduled) {
          event.callback(event.time);
        }
      },
    };
    const length = Math.round(duration * state.sampleRate);
    const data = new Float32Array(length);
    state.offlineBuffer = data;
    return Promise.resolve(callback({ transport }))
      .then(() => ({
        get: () => ({
          numberOfChannels: 1,
          sampleRate: state.sampleRate,
          length,
          getChannelData: () => data,
        }),
      }))
      .finally(() => {
        state.offlineBuffer = null;
      });
  }

  const tone = {
    Sampler,
    PolySynth,
    Synth: class extends Node {},
    AMSynth: class {},
    FMSynth: class {},
    MonoSynth: class {},
    Volume: Node,
    Freeverb: Node,
    Offline,
    Transport: {
      schedule() {
        state.globalTransportSchedules += 1;
      },
      start() {},
    },
    Frequency: (midi: number) => ({ toNote: () => `N${midi}` }),
    gainToDb: (gain: number) => 20 * Math.log10(gain),
    start: () => Promise.resolve(),
    loaded: () => Promise.resolve(),
    now: () => 0,
    getContext: () => ({ rawContext: { state: 'running' }, lookAhead: 0 }),
  };

  return { state, tone, chainable };
});

vi.mock('tone', () => fake.tone);

import { AudioEngine } from './audioEngine';

const BLOB_URLS = { C4: 'blob:http://127.0.0.1/abc', E4: 'blob:http://127.0.0.1/def' };

function readWavSamples(bytes: Uint8Array): { rate: number; samples: Int16Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rate = view.getUint32(24, true);
  const count = view.getUint32(40, true) / 2;
  const samples = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = view.getInt16(44 + i * 2, true);
  }
  return { rate, samples };
}

function windowHasEnergy(samples: Int16Array, rate: number, fromSec: number, toSec: number): boolean {
  for (let i = Math.floor(fromSec * rate); i < Math.ceil(toSec * rate); i++) {
    if (samples[i] !== 0) {
      return true;
    }
  }
  return false;
}

beforeEach(() => {
  fake.state.samplers.length = 0;
  fake.state.globalTransportSchedules = 0;
  fake.state.offlineTransportSchedules.length = 0;
  fake.state.offlineTransportStarts = 0;
  fake.state.offlineBuffer = null;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('AudioEngine custom sampler base URL (PH-PAR-006)', () => {
  it('loads a pack with no base URL without prefixing "undefined" onto the sample URLs', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const engine = new AudioEngine();
    await engine.setCustomSampler(BLOB_URLS, null);
    await engine.init();

    expect(fake.state.samplers).toHaveLength(1);
    const [sampler] = fake.state.samplers;
    expect(sampler.resolvedUrls).toEqual(Object.values(BLOB_URLS));
    expect(sampler.resolvedUrls.some((url) => url.startsWith('undefined'))).toBe(false);
    expect('baseUrl' in sampler.options).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('keeps a base URL when the pack has one', async () => {
    const engine = new AudioEngine();
    await engine.setCustomSampler({ C4: 'C4.mp3' }, 'file:///packs/flute/');
    await engine.init();

    expect(fake.state.samplers[0].resolvedUrls).toEqual(['file:///packs/flute/C4.mp3']);
  });

  it('renders a WAV from a pack with no base URL without "undefined" URLs', async () => {
    const engine = new AudioEngine();
    await engine.setCustomSampler(BLOB_URLS, null);
    await engine.renderRecordingToWav([{ midi: 60, velocity: 0.8, startTimeSec: 0.5, durationSec: 0.3 }], 1);

    expect(fake.state.samplers).toHaveLength(1);
    expect(fake.state.samplers[0].resolvedUrls.some((url) => url.startsWith('undefined'))).toBe(false);
    expect('baseUrl' in fake.state.samplers[0].options).toBe(false);
  });
});

describe('AudioEngine.renderRecordingToWav (PH-MUS-007)', () => {
  it('renders sound after each note onset by scheduling on the offline transport', async () => {
    const engine = new AudioEngine();
    const bytes = await engine.renderRecordingToWav(
      [
        { midi: 60, velocity: 0.8, startTimeSec: 0.5, durationSec: 0.3 },
        { midi: 64, velocity: 0.8, startTimeSec: 1.0, durationSec: 0.3 },
      ],
      2,
    );

    const { rate, samples } = readWavSamples(bytes);
    expect(samples.length).toBe(5 * rate);
    expect(windowHasEnergy(samples, rate, 0, 0.4)).toBe(false);
    expect(windowHasEnergy(samples, rate, 0.5, 0.8)).toBe(true);
    expect(windowHasEnergy(samples, rate, 1.0, 1.3)).toBe(true);
    expect(fake.state.offlineTransportSchedules).toEqual([0.5, 1.0]);
    expect(fake.state.offlineTransportStarts).toBe(1);
    expect(fake.state.globalTransportSchedules).toBe(0);
  });
});

describe('AudioEngine custom sampler release (PH-MUS-015)', () => {
  it('gives the live custom sampler the instrument release', async () => {
    const engine = new AudioEngine();
    await engine.setInstrument('flute');
    await engine.setCustomSampler(BLOB_URLS, null);
    await engine.init();

    // Select by the requested sample URLs, not the resolved ones, so this test does not depend on
    // the PH-PAR-006 base-URL fix to find the sampler.
    const custom = fake.state.samplers.filter((sampler) =>
      Object.values(sampler.options.urls as Record<string, string>).some((url) => url.startsWith('blob:')),
    );
    expect(custom.at(-1)?.options.release).toBe(1.1);
  });

  it('gives the offline custom sampler the instrument release', async () => {
    const engine = new AudioEngine();
    await engine.setInstrument('flute');
    await engine.setCustomSampler(BLOB_URLS, null);
    await engine.renderRecordingToWav([{ midi: 60, velocity: 0.8, startTimeSec: 0.5, durationSec: 0.3 }], 1);

    expect(fake.state.samplers).toHaveLength(1);
    expect(fake.state.samplers[0].options.release).toBe(1.1);
  });

  it('passes no sampler-level release for an instrument without a numeric release', async () => {
    const engine = new AudioEngine();
    await engine.setInstrument('warm-pad');
    await engine.setCustomSampler(BLOB_URLS, null);
    await engine.init();

    expect('release' in fake.state.samplers[0].options).toBe(false);
  });
});
