import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseMidiFile } from '../midi/midiFileParser';
import { getBeatAtSongTime } from './beatClock';
import { GameSession } from './GameSession';
import type { ParsedSong, SessionConfig } from './types';

const PPQ = 480;

function parseFixture(name: string): ParsedSong {
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'midi', 'fixtures', `${name}.mid`);
  const bytes = readFileSync(path);
  return parseMidiFile(new Uint8Array(bytes).buffer, { songId: name, title: name });
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
    // Three quarter-note beats per 1.5 s bar.
    expect(pure68.map((click) => click.timeSec)).toEqual([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]);

    const changed = clickTimes(parseFixture('6-8-then-3-4-reached'), 5.9);
    expect(changed.filter((click) => click.accent).map((click) => click.timeSec)).toEqual([1.5, 3, 4.5]);
    expect(changed.map((click) => click.timeSec)).toEqual([
      0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5,
    ]);
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
});
