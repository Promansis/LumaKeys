import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Midi } from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { getLoopRangeSeconds, getMeasureCount, getMeasureIndexForTime } from '../game/songUtils';
import { parseMidiFile } from './midiFileParser';

// The fixtures are byte copies of the Phase 11 lane C files in
// scripts/audit/fixtures/midi/, with the hand-written expectations from
// measure-fixtures.oracle.json (120 BPM, 480 ticks per quarter note).
function parseFixture(name: string) {
  const bytes = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', `${name}.mid`));
  return parseMidiFile(new Uint8Array(bytes).buffer, { songId: name, title: name });
}

// Builds a 480-ppq file with the given tempo events and `noteCount` quarter notes from tick 0.
function buildTempoFile(tempos: Array<[ticks: number, bpm: number]>, noteCount: number): ArrayBuffer {
  const midi = new Midi();
  for (const [ticks, bpm] of tempos) {
    midi.header.tempos.push({ ticks, bpm });
  }
  midi.header.update();
  const track = midi.addTrack();
  for (let index = 0; index < noteCount; index += 1) {
    track.addNote({ midi: 60 + (index % 5), ticks: index * 480, durationTicks: 480, velocity: 0.8 });
  }
  return midi.toArray().slice().buffer;
}

function parseTempoFile(tempos: Array<[ticks: number, bpm: number]>, noteCount: number) {
  return parseMidiFile(buildTempoFile(tempos, noteCount), { songId: 'tempo', title: 'Tempo' });
}

function boundaryTuples(song: ReturnType<typeof parseFixture>) {
  return (song.measureBoundaries ?? []).map((b) => [b.startTick, b.endTick, b.startSec, b.endSec]);
}

describe('parseMidiFile', () => {
  it('extracts bpm, tracks, and note metadata', () => {
    const midi = new Midi();
    midi.header.setTempo(96);
    const leftTrack = midi.addTrack();
    leftTrack.name = 'Left Hand';
    leftTrack.addNote({
      midi: 48,
      time: 0,
      duration: 0.5,
      velocity: 0.7,
    });

    const rightTrack = midi.addTrack();
    rightTrack.name = 'Right Hand';
    rightTrack.addNote({
      midi: 72,
      time: 1,
      duration: 0.25,
      velocity: 0.8,
    });

    const midiBytes = midi.toArray();
    const parsed = parseMidiFile(midiBytes.slice().buffer, {
      songId: 'song-1',
      title: 'Etude',
    });

    expect(parsed.bpm).toBe(96);
    expect(parsed.tracks).toHaveLength(2);
    expect(parsed.tracks[0].assignment).toBe('left');
    expect(parsed.tracks[1].assignment).toBe('right');
    expect(parsed.notes[0]).toMatchObject({
      midi: 48,
      name: 'C3',
      hand: 'left',
    });
    expect(parsed.notes[1]).toMatchObject({
      midi: 72,
      name: 'C5',
      hand: 'right',
    });
  });

  it('preserves MIDI meter and does not create a terminal phantom measure', () => {
    const midi = new Midi();
    midi.header.timeSignatures = [{ ticks: 0, timeSignature: [3, 4] }];
    midi.header.setTempo(120);
    const track = midi.addTrack();
    track.addNote({ midi: 60, ticks: 1440, durationTicks: 240, velocity: 0.8 });

    const parsed = parseMidiFile(midi.toArray().slice().buffer, { songId: 'metered', title: 'Metered' });

    expect(parsed.measureBoundaries).toHaveLength(2);
    expect(parsed.measureBoundaries?.[1]).toMatchObject({ startTick: 1440 });
  });

  describe('meter fixtures', () => {
    it('splits a pure 6/8 song into 1.5 s measures', () => {
      const song = parseFixture('pure-6-8');

      expect(boundaryTuples(song)).toEqual([
        [0, 1440, 0, 1.5],
        [1440, 2880, 1.5, 3],
        [2880, 4320, 3, 4.5],
      ]);
      expect(getMeasureCount(song)).toBe(3);
      expect(song.notes.map((note) => getMeasureIndexForTime(song, note.startSec))).toEqual([
        ...Array(6).fill(0),
        ...Array(6).fill(1),
        ...Array(6).fill(2),
      ]);
      expect(getLoopRangeSeconds(song, { startMeasure: 1, endMeasure: 1 })).toEqual({ startSec: 1.5, endSec: 3 });
    });

    it('moves the measure boundary when 6/8 changes to 3/4', () => {
      const song = parseFixture('6-8-then-3-4-reached');

      expect(boundaryTuples(song)).toEqual([
        [0, 1440, 0, 1.5],
        [1440, 2880, 1.5, 3],
        [2880, 4320, 3, 4.5],
        [4320, 5760, 4.5, 6],
      ]);
      // The last 6/8 note (tick 2640) is still in measure 1; the first 3/4 note (tick 2880) opens measure 2.
      const measureOf = (tick: number) => {
        const note = song.notes.find((candidate) => candidate.ticks === tick);
        return note ? getMeasureIndexForTime(song, note.startSec) : -1;
      };
      expect(measureOf(2640)).toBe(1);
      expect(measureOf(2880)).toBe(2);
      expect(measureOf(4320)).toBe(3);
      expect(getLoopRangeSeconds(song, { startMeasure: 2, endMeasure: 3 })).toEqual({ startSec: 3, endSec: 6 });
    });

    it('follows 3/4 then 4/4 with a tempo change inside a measure', () => {
      const song = parseFixture('3-4-to-4-4-tempo');
      const boundaries = boundaryTuples(song);

      // Tempo drops from 120 to 60 BPM at tick 3840, in the middle of the first 4/4 measure.
      expect(boundaries.map(([startTick, endTick]) => [startTick, endTick])).toEqual([
        [0, 1440],
        [1440, 2880],
        [2880, 4800],
        [4800, 6240],
      ]);
      const seconds = boundaries.map(([, , startSec, endSec]) => [startSec, endSec]);
      [[0, 1.5], [1.5, 3], [3, 6], [6, 9]].forEach(([startSec, endSec], index) => {
        expect(seconds[index][0]).toBeCloseTo(startSec, 6);
        expect(seconds[index][1]).toBeCloseTo(endSec, 6);
      });
      // The final measure stops at the last note-off (tick 6240), not at the 4/4 barline (tick 6720).
      expect(song.durationSec).toBeCloseTo(9, 6);
      expect(getMeasureCount(song)).toBe(4);
    });
  });

  describe('first tempo event after tick 0', () => {
    // late-first-tempo.mid: 4/4, no tempo at tick 0, 60 BPM at tick 1920, quarter notes from tick 0.
    // SMF keeps 120 BPM until the first Set Tempo event, so bar 1 is 2 s and bar 2 is 4 s (PH-MUS-008).
    it('keeps 120 BPM until the first tempo event and times the notes continuously', () => {
      const song = parseFixture('late-first-tempo');
      const noteAt = (ticks: number) => song.notes.find((note) => note.ticks === ticks);

      // The song spends 2 s at 120 BPM and 4 s at 60 BPM, so 60 is its tempo (PH-MUS-019).
      expect(song.bpm).toBe(60);
      expect(noteAt(1440)?.startSec).toBeCloseTo(1.5, 6);
      expect(noteAt(1440)?.durationSec).toBeCloseTo(0.5, 6);
      expect(noteAt(1920)?.startSec).toBeCloseTo(2, 6);
      expect(noteAt(2400)?.startSec).toBeCloseTo(3, 6);
      expect(noteAt(3360)?.startSec).toBeCloseTo(5, 6);
      expect(boundaryTuples(song)).toEqual([
        [0, 1920, 0, 2],
        [1920, 3840, 2, 6],
      ]);
      expect(song.durationSec).toBeCloseTo(6, 6);
    });

    it('carries the continuous tempo map on the parsed song', () => {
      const song = parseFixture('late-first-tempo');

      expect(song.tempoMap).toEqual([
        { ticks: 0, bpm: 120, timeSec: 0 },
        { ticks: 1920, bpm: 60, timeSec: 2 },
      ]);
    });

    it('carries a single 120 BPM entry when the file has no tempo event', () => {
      const midi = new Midi();
      midi.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 });
      const song = parseMidiFile(midi.toArray().slice().buffer, { songId: 'no-tempo', title: 'No tempo' });

      expect(song.bpm).toBe(120);
      expect(song.tempoMap).toEqual([{ ticks: 0, bpm: 120, timeSec: 0 }]);
    });

    it('leaves a file with a tick-0 tempo unchanged', () => {
      const song = parseFixture('3-4-to-4-4-tempo');

      // The tempo map is untouched; the song tempo is the longer-lasting 60 BPM (PH-MUS-019).
      expect(song.bpm).toBe(60);
      expect(song.tempoMap).toEqual([
        { ticks: 0, bpm: 120, timeSec: 0 },
        { ticks: 3840, bpm: 60, timeSec: 4 },
      ]);
    });
  });
  describe('song tempo (PH-MUS-019)', () => {
    it('reports the dominant tempo of a slow intro and a longer fast body, not the first tempo', () => {
      // 40 BPM for 4 beats (6 s), then 160 BPM for 20 beats (7.5 s).
      const song = parseTempoFile([[0, 40], [1920, 160]], 24);

      expect(song.tempoMap?.map((tempo) => tempo.bpm)).toEqual([40, 160]);
      expect(song.bpm).toBe(160);
    });

    it('reports the longer slow body of a fast intro', () => {
      const song = parseTempoFile([[0, 160], [1920, 60]], 24);

      expect(song.bpm).toBe(60);
    });

    it('does not let the inserted 120 BPM placeholder win over a later first tempo that lasts', () => {
      // 120 BPM until tick 1920 (2 s), then 90 BPM for the other 20 beats.
      const song = parseTempoFile([[1920, 90]], 24);

      expect(song.tempoMap?.[0]).toMatchObject({ ticks: 0, bpm: 120 });
      expect(song.bpm).toBeCloseTo(90, 3);
    });

    it('keeps a constant tempo as is', () => {
      expect(parseTempoFile([[0, 96]], 8).bpm).toBe(96);
    });
  });
  describe('several tempo events at the same tick (PH-MUS-019)', () => {
    it('uses the later of a 120 then 90 BPM pair at tick 0 as the one tempo', () => {
      const song = parseTempoFile([[0, 120], [0, 90]], 16);

      expect(song.bpm).toBeCloseTo(90, 3);
      expect(song.tempoMap).toHaveLength(1);
      expect(song.tempoMap?.[0]).toMatchObject({ ticks: 0, timeSec: 0 });
      expect(song.tempoMap?.[0].bpm).toBeCloseTo(90, 3);
      // 16 quarter notes at 90 BPM: the song clock and the stored tempo agree.
      expect(song.durationSec).toBeCloseTo(16 * (60 / 90), 3);
    });

    it('uses the later tempo when the order is reversed (90 then 120)', () => {
      const song = parseTempoFile([[0, 90], [0, 120]], 16);

      expect(song.bpm).toBeCloseTo(120, 3);
      expect(song.tempoMap).toHaveLength(1);
      expect(song.tempoMap?.[0]).toMatchObject({ ticks: 0, timeSec: 0 });
      expect(song.tempoMap?.[0].bpm).toBeCloseTo(120, 3);
      expect(song.durationSec).toBeCloseTo(8, 3);
    });

    it('collapses duplicates at a later tick and keeps the tempo map continuous', () => {
      const song = parseTempoFile([[0, 100], [1920, 60], [1920, 120]], 16);

      expect(song.tempoMap?.map((tempo) => tempo.ticks)).toEqual([0, 1920]);
      expect(song.tempoMap?.[1].bpm).toBeCloseTo(120, 3);
      expect(song.tempoMap?.[1].timeSec).toBeCloseTo(4 * (60 / 100), 3);
    });
  });
});
