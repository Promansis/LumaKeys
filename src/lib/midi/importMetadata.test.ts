import { describe, expect, it } from 'vitest';
import { Midi } from '@tonejs/midi';
import type { ParsedNote, ParsedSong } from '../game/types';
import { calculateDifficulty, computeSongMetadata } from './importMetadata';

describe('imported song titles', () => {
  it.each(['Piano', 'Electric Drum Kit', 'Original embedded title'])('keeps the filename title instead of "%s" metadata', (label) => {
    const midi = new Midi();
    midi.header.name = label;
    const track = midi.addTrack();
    track.name = label;
    track.addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 });

    expect(computeSongMetadata(midi.toArray(), 'Let it Go').title).toBe('Let it Go');
  });

  it('uses embedded metadata only when no filename title is available', () => {
    const midi = new Midi();
    midi.header.name = 'Embedded song title';

    expect(computeSongMetadata(midi.toArray(), '  ').title).toBe('Embedded song title');
  });

  it('uses Untitled when neither source provides a title', () => {
    expect(computeSongMetadata(new Midi().toArray(), '').title).toBe('Untitled');
  });
});

describe('imported song tempo (PH-MUS-019)', () => {
  it('stores the dominant tempo of a slow intro and a longer fast body, not the first tempo', () => {
    const midi = new Midi();
    midi.header.tempos.push({ ticks: 0, bpm: 40 }, { ticks: 1920, bpm: 160 });
    midi.header.update();
    const track = midi.addTrack();
    for (let index = 0; index < 24; index += 1) {
      track.addNote({ midi: 60 + (index % 5), ticks: index * 480, durationTicks: 480, velocity: 0.8 });
    }

    expect(computeSongMetadata(midi.toArray(), 'Slow intro').bpm).toBe(160);
  });

  it('stores a 190 BPM file as exactly 190, not 190.0002850004275', () => {
    const midi = new Midi();
    midi.header.tempos.push({ ticks: 0, bpm: 190 });
    midi.header.update();
    const track = midi.addTrack();
    for (let index = 0; index < 8; index += 1) {
      track.addNote({ midi: 60 + (index % 5), ticks: index * 480, durationTicks: 480, velocity: 0.8 });
    }

    expect(computeSongMetadata(midi.toArray(), '190').bpm).toBe(190);
  });
});

function makeNote(overrides: Partial<ParsedNote>): ParsedNote {
  return {
    id: overrides.id ?? 'n',
    trackId: overrides.trackId ?? 'right',
    midi: overrides.midi ?? 60,
    name: overrides.name ?? 'C4',
    velocity: overrides.velocity ?? 0.8,
    startSec: overrides.startSec ?? 0,
    durationSec: overrides.durationSec ?? 0.5,
    hand: overrides.hand ?? 'right',
  };
}

function makeSong(notes: ParsedNote[], durationSec: number, bpm = 120): ParsedSong {
  return {
    id: 'test',
    title: 'test',
    ppq: 480,
    bpm,
    durationSec,
    tracks: [],
    notes,
  };
}

describe('calculateDifficulty (v2 weighted heuristic)', () => {
  it('returns 1 for empty song', () => {
    expect(calculateDifficulty(makeSong([], 0))).toBe(1);
  });

  it('scores a sparse, slow, narrow-range piece as low', () => {
    const notes = Array.from({ length: 4 }, (_, i) =>
      makeNote({ id: `n${i}`, startSec: i * 2, midi: 60 + i }),
    );
    const difficulty = calculateDifficulty(makeSong(notes, 10, 60));
    expect(difficulty).toBeLessThanOrEqual(3);
  });

  it('rewards dense, wide-range, chordy, fast pieces with higher difficulty', () => {
    const notes: ParsedNote[] = [];
    for (let i = 0; i < 200; i++) {
      notes.push(makeNote({ id: `a${i}`, startSec: i * 0.05, midi: 40 + (i % 48) }));
      notes.push(makeNote({ id: `b${i}`, startSec: i * 0.05 + 0.005, midi: 44 + (i % 48) }));
      notes.push(makeNote({ id: `c${i}`, startSec: i * 0.05 + 0.01, midi: 48 + (i % 48) }));
    }
    const difficulty = calculateDifficulty(makeSong(notes, 10, 180));
    expect(difficulty).toBeGreaterThanOrEqual(7);
  });

  it('clamps result between 1 and 10', () => {
    const notes: ParsedNote[] = [];
    for (let i = 0; i < 10000; i++) {
      notes.push(makeNote({ id: `n${i}`, startSec: i * 0.001, midi: 21 + (i % 88) }));
    }
    const difficulty = calculateDifficulty(makeSong(notes, 10, 300));
    expect(difficulty).toBeGreaterThanOrEqual(1);
    expect(difficulty).toBeLessThanOrEqual(10);
  });
});
