import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Midi } from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { parseMidiFile } from '../midi/midiFileParser';
import { advanceMetronome, getBeatAtSongTime, getBpmAtSongTime, getPulseDurationSec } from './beatClock';
import { GameSession } from './GameSession';
import type { ParsedSong, SessionConfig } from './types';

const PPQ = 480;

function parseFixture(name: string): ParsedSong {
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'midi', 'fixtures', `${name}.mid`);
  const bytes = readFileSync(path);
  return parseMidiFile(new Uint8Array(bytes).buffer, { songId: name, title: name });
}

// A song in one time signature at 120 BPM whose last note ends at `endTick`.
function meterSong(timeSignature: [number, number], endTick: number): ParsedSong {
  const midi = new Midi();
  midi.header.timeSignatures = [{ ticks: 0, timeSignature }];
  midi.header.setTempo(120);
  midi.addTrack().addNote({ midi: 60, ticks: endTick - 240, durationTicks: 240, velocity: 0.8 });
  return parseMidiFile(midi.toArray().slice().buffer, { songId: 'meter', title: 'meter' });
}

// A hand-built 4/4 song: 120 BPM, four bars of 2 s.
function fourFourSong(): ParsedSong {
  return {
    id: 'four-four',
    title: 'four-four',
    ppq: PPQ,
    bpm: 120,
    durationSec: 8,
    tracks: [],
    notes: [],
    tempoMap: [{ ticks: 0, bpm: 120, timeSec: 0 }],
    measureBoundaries: [0, 1, 2, 3].map((bar) => ({
      startTick: bar * 1920,
      endTick: (bar + 1) * 1920,
      startSec: bar * 2,
      endSec: (bar + 1) * 2,
    })),
  };
}

// Song times at which the beat index changes, scanning with a fine song-time step.
function clickTimes(song: ParsedSong, endSec: number, stepSec = 0.005) {
  const clicks: Array<{ timeSec: number; accent: boolean }> = [];
  let last = getBeatAtSongTime(song, 0).beatIndex;
  for (let time = stepSec; time <= endSec; time += stepSec) {
    const beat = getBeatAtSongTime(song, time);
    if (beat.beatIndex !== last) {
      clicks.push({ timeSec: Math.round(time * 1000) / 1000, accent: beat.isDownbeat });
      last = beat.beatIndex;
    }
  }
  return clicks;
}

const sessionBase: SessionConfig = {
  mode: 'learning',
  tempoMultiplier: 1,
  handFilter: 'both',
  loopRange: null,
  waitForInput: false,
  metronomeEnabled: true,
  handSize: 'medium',
  fingeringDisplayMode: 'never',
  pitchBendEnabled: false,
  latencyCompMs: 0,
  hitWindowMs: 100,
  beatsVisible: 8,
  leadInBeats: 0,
};

describe('getBeatAtSongTime', () => {
  it('clicks every beat of a 4/4 120 BPM song and accents each barline', () => {
    const clicks = clickTimes(fourFourSong(), 4.1);

    expect(clicks.map((click) => click.timeSec)).toEqual([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]);
    expect(clicks.filter((click) => click.accent).map((click) => click.timeSec)).toEqual([2, 4]);
    expect(getBeatAtSongTime(fourFourSong(), 0).isDownbeat).toBe(true);
  });

  it.each([
    [0.5, 1],
    [1, 0.5],
    [1.5, 1 / 3],
  ])('clicks once per beat of wall time at practice tempo %s', (tempo, expectedWallGap) => {
    const song = fourFourSong();
    const session = new GameSession(song, { ...sessionBase, tempoMultiplier: tempo });
    session.play(0);

    const wallClicks: number[] = [];
    let last = getBeatAtSongTime(song, session.getCurrentTimeSec(0)).beatIndex;
    for (let nowMs = 5; nowMs <= 6000; nowMs += 5) {
      const beat = getBeatAtSongTime(song, session.getCurrentTimeSec(nowMs));
      if (beat.beatIndex !== last) {
        wallClicks.push(nowMs / 1000);
        last = beat.beatIndex;
      }
    }

    expect(wallClicks.length).toBeGreaterThan(4);
    wallClicks.slice(1).forEach((time, index) => {
      expect(time - wallClicks[index]).toBeCloseTo(expectedWallGap, 1);
    });
  });

  it('accents the first beat of each 6/8 bar and keeps accenting through a change to 3/4', () => {
    const pure68 = clickTimes(parseFixture('pure-6-8'), 4.4);
    expect(pure68.filter((click) => click.accent).map((click) => click.timeSec)).toEqual([1.5, 3]);
    // Compound meter: two dotted-quarter pulses (0.75 s) per 1.5 s bar.
    expect(pure68.map((click) => click.timeSec)).toEqual([0.75, 1.5, 2.25, 3, 3.75]);

    const changed = clickTimes(parseFixture('6-8-then-3-4-reached'), 5.9);
    expect(changed.filter((click) => click.accent).map((click) => click.timeSec)).toEqual([1.5, 3, 4.5]);
    // Two dotted-quarter clicks per 6/8 bar, then three quarter-note clicks per 3/4 bar.
    expect(changed.map((click) => click.timeSec)).toEqual([0.75, 1.5, 2.25, 3, 3.5, 4, 4.5, 5, 5.5]);
  });

  it('doubles the beat spacing after a 120 to 60 BPM change and accents the new barline', () => {
    const song = parseFixture('3-4-to-4-4-tempo');
    const clicks = clickTimes(song, 8.9);

    expect(clicks.map((click) => click.timeSec)).toEqual([
      0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8,
    ]);
    // Barlines at 1.5, 3 and 6 s; the 4/4 bar that starts at 3 s holds a 120 BPM half and a 60 BPM half.
    expect(clicks.filter((click) => click.accent).map((click) => click.timeSec)).toEqual([1.5, 3, 6]);
  });

  it('keeps the beat grid continuous when the first tempo event is after tick 0', () => {
    const song = parseFixture('late-first-tempo');
    const clicks = clickTimes(song, 5.9);

    // 120 BPM for the first bar (beats every 0.5 s), then 60 BPM (beats every 1 s).
    expect(clicks.map((click) => click.timeSec)).toEqual([0.5, 1, 1.5, 2, 3, 4, 5]);
    expect(clicks.filter((click) => click.accent).map((click) => click.timeSec)).toEqual([2]);
  });

  it('falls back to 4/4 at the song bpm for a song without a tempo map or barlines', () => {
    const song: ParsedSong = {
      id: 'bare',
      title: 'bare',
      ppq: PPQ,
      bpm: 60,
      durationSec: 8,
      tracks: [],
      notes: [],
    };
    const clicks = clickTimes(song, 4.1);

    expect(clicks.map((click) => click.timeSec)).toEqual([1, 2, 3, 4]);
    expect(clicks.filter((click) => click.accent).map((click) => click.timeSec)).toEqual([4]);
  });

  it('is monotonic and depends on song time alone', () => {
    const song = parseFixture('3-4-to-4-4-tempo');
    let previous = -Infinity;
    for (let time = 0; time <= 12; time += 0.01) {
      const index = getBeatAtSongTime(song, time).beatIndex;
      expect(index).toBeGreaterThanOrEqual(previous);
      previous = index;
    }
    expect(getBeatAtSongTime(song, 3.25)).toEqual(getBeatAtSongTime(song, 3.25));
  });

  describe('pulse unit from the time signature', () => {
    const gaps = (clicks: Array<{ timeSec: number }>) =>
      clicks.slice(1).map((click, index) => Math.round((click.timeSec - clicks[index].timeSec) * 1000) / 1000);

    it('clicks 3/8 on eighths, evenly, with the accent on each barline', () => {
      const clicks = clickTimes(meterSong([3, 8], 2880), 2.9);

      expect(clicks.map((click) => click.timeSec)).toEqual([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75]);
      expect(new Set(gaps(clicks))).toEqual(new Set([0.25]));
      expect(clicks.filter((click) => click.accent).map((click) => click.timeSec)).toEqual([0.75, 1.5, 2.25]);
    });

    it('clicks 7/8 on eighths with no short gap before the downbeat', () => {
      const clicks = clickTimes(meterSong([7, 8], 5040), 5.1);

      expect(new Set(gaps(clicks))).toEqual(new Set([0.25]));
      expect(clicks.filter((click) => click.accent).map((click) => click.timeSec)).toEqual([1.75, 3.5]);
    });

    it('clicks 9/8 on dotted quarters and 2/2 on halves', () => {
      const nineEight = clickTimes(meterSong([9, 8], 4320), 4.4);
      expect(new Set(gaps(nineEight))).toEqual(new Set([0.75]));
      expect(nineEight.filter((click) => click.accent).map((click) => click.timeSec)).toEqual([2.25]);

      const cutTime = clickTimes(meterSong([2, 2], 7680), 7.7);
      expect(new Set(gaps(cutTime))).toEqual(new Set([1]));
      expect(cutTime.filter((click) => click.accent).map((click) => click.timeSec)).toEqual([2, 4, 6]);
    });

    it('clicks 6/8 twice a bar on the dotted quarter, accent on the barline', () => {
      const clicks = clickTimes(meterSong([6, 8], 4320), 4.4);

      expect(clicks.map((click) => click.timeSec)).toEqual([0.75, 1.5, 2.25, 3, 3.75]);
      expect(clicks.filter((click) => click.accent).map((click) => click.timeSec)).toEqual([1.5, 3]);
    });
  });

  it('does not click again at the last note-off when the last bar is cut to 2.5 beats', () => {
    const song = fourFourSong();
    song.measureBoundaries = [
      { startTick: 0, endTick: 1920, startSec: 0, endSec: 2 },
      { startTick: 1920, endTick: 3120, startSec: 2, endSec: 3.25 },
    ];
    const clicks = clickTimes(song, 5);

    expect(clicks.map((click) => click.timeSec)).toEqual([0.5, 1, 1.5, 2, 2.5, 3]);
    expect(getBeatAtSongTime(song, 3.25)).toEqual(getBeatAtSongTime(song, 3));
    expect(getBeatAtSongTime(song, 5)).toEqual(getBeatAtSongTime(song, 3));
  });
});

describe('getBpmAtSongTime and getPulseDurationSec (PH-MUS-019)', () => {
  const tempoMap = [
    { ticks: 0, bpm: 40, timeSec: 0 },
    { ticks: 1920, bpm: 160, timeSec: 6 },
  ];
  const song = { ppq: 480, bpm: 160, tempoMap, measureBoundaries: undefined };

  it('reads the tempo in force at the song time', () => {
    expect(getBpmAtSongTime(song, 0)).toBe(40);
    expect(getBpmAtSongTime(song, 5.99)).toBe(40);
    expect(getBpmAtSongTime(song, 6)).toBe(160);
  });

  it('falls back to the song bpm without a tempo map and to 120 for an unusable tempo', () => {
    expect(getBpmAtSongTime({ ppq: 480, bpm: 96 }, 3)).toBe(96);
    expect(getBpmAtSongTime({ ppq: 480, bpm: 0 }, 3)).toBe(120);
  });

  it('measures a quarter-note pulse at the tempo in force', () => {
    expect(getPulseDurationSec(song, 0)).toBeCloseTo(1.5, 6);
    expect(getPulseDurationSec(song, 7)).toBeCloseTo(0.375, 6);
  });

  it('measures the pulse of the measure holding the time: dotted quarter in 6/8, half note in 2/2', () => {
    const measure = (pulseTicks: number) => [{ startTick: 0, endTick: 2880, startSec: 0, endSec: 3, pulseTicks }];
    const at120 = [{ ticks: 0, bpm: 120, timeSec: 0 }];
    expect(getPulseDurationSec({ ppq: 480, bpm: 120, tempoMap: at120, measureBoundaries: measure(720) }, 0)).toBeCloseTo(0.75, 6);
    expect(getPulseDurationSec({ ppq: 480, bpm: 120, tempoMap: at120, measureBoundaries: measure(960) }, 0)).toBeCloseTo(1, 6);
  });
});

describe('advanceMetronome on a looping GameSession', () => {
  it('sounds the accented downbeat each time a one-bar loop wraps', () => {
    const song = fourFourSong();
    const session = new GameSession(song, { ...sessionBase, loopRange: { startMeasure: 1, endMeasure: 1 } });
    session.restart(0);
    session.play(0);

    const clicks: Array<{ wallSec: number; accent: boolean }> = [];
    let last: number | null = null;
    for (let nowMs = 0; nowMs <= 6100; nowMs += 25) {
      const step = advanceMetronome(last, getBeatAtSongTime(song, session.getCurrentTimeSec(nowMs)));
      last = step.lastBeatIndex;
      if (step.click) clicks.push({ wallSec: nowMs / 1000, accent: step.click.accent });
    }

    // Loop is song time 2 s to 4 s: beats at 0.5 s, then the wrap downbeat at 2 s, 4 s and 6 s.
    expect(clicks.filter((click) => click.accent).map((click) => click.wallSec)).toEqual([2, 4, 6]);
    expect(clicks.filter((click) => !click.accent).length).toBe(9);
  });

  it('seeds silently, clicks forward beats, and stays quiet on a repeat', () => {
    expect(advanceMetronome(null, { beatIndex: 3, isDownbeat: false })).toEqual({ lastBeatIndex: 3, click: null });
    expect(advanceMetronome(3, { beatIndex: 3, isDownbeat: false })).toEqual({ lastBeatIndex: 3, click: null });
    expect(advanceMetronome(3, { beatIndex: 4, isDownbeat: true })).toEqual({ lastBeatIndex: 4, click: { accent: true } });
    // A seek backwards onto a non-downbeat resets without a click.
    expect(advanceMetronome(7, { beatIndex: 5, isDownbeat: false })).toEqual({ lastBeatIndex: 5, click: null });
  });
});
