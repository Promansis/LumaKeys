import { describe, expect, it } from 'vitest';
import type { TempoChange } from '../game/types';
import { getDominantTempo } from './dominantTempo';

const map = (...entries: Array<[number, number, number]>): TempoChange[] =>
  entries.map(([ticks, bpm, timeSec]) => ({ ticks, bpm, timeSec }));

describe('getDominantTempo', () => {
  it('returns the tempo of a constant-tempo song', () => {
    expect(getDominantTempo(map([0, 96, 0]), 0, 30)).toBe(96);
  });

  it('returns 120 for an empty tempo map', () => {
    expect(getDominantTempo([], 0, 10)).toBe(120);
  });

  it('prefers a long fast body over a short slow intro', () => {
    // 40 BPM for 4 beats (6 s), then 160 BPM for 40 beats (15 s).
    expect(getDominantTempo(map([0, 40, 0], [1920, 160, 6]), 0, 21)).toBe(160);
  });

  it('prefers a long slow body over a short fast intro', () => {
    // 160 BPM for 4 beats (1.5 s), then 60 BPM for 20 beats (20 s).
    expect(getDominantTempo(map([0, 160, 0], [1920, 60, 1.5]), 0, 21.5)).toBe(60);
  });

  it('does not let a tick-0 placeholder win over a later first tempo that lasts longer', () => {
    // 120 BPM placeholder for one bar (2 s), then the real 90 BPM for 16 s.
    expect(getDominantTempo(map([0, 120, 0], [1920, 90, 2]), 0, 18)).toBe(90);
  });

  it('lets the tick-0 placeholder win only when it really lasts', () => {
    // 120 BPM for 8 s, then 90 BPM for the last 2 s.
    expect(getDominantTempo(map([0, 120, 0], [7680, 90, 8]), 0, 10)).toBe(120);
  });

  it('reports the slowest step of an even accelerando, since it lasts the most seconds', () => {
    // 60, 80, 100, 120 BPM for 4 beats each: 4 s, 3 s, 2.4 s, 2 s. Weighting by seconds, not
    // beats, favours the slow step (documented residual risk in PH-MUS-019).
    expect(getDominantTempo(map([0, 60, 0], [1920, 80, 4], [3840, 100, 7], [5760, 120, 9.4]), 0, 11.4)).toBe(60);
  });

  it('ignores a placeholder that ends before the first note', () => {
    expect(getDominantTempo(map([0, 120, 0], [1920, 90, 2]), 2, 12)).toBe(90);
  });

  it('adds up a tempo that returns after another one', () => {
    // 100 for 5 s, 140 for 6 s, 100 for 5 s: 100 BPM is in force for 10 s.
    expect(getDominantTempo(map([0, 100, 0], [800, 140, 5], [1900, 100, 11]), 0, 16)).toBe(100);
  });

  it('merges tempos that only differ by float residue', () => {
    const tempos = map([0, 89.99995, 0], [1920, 140, 5.3333], [3840, 90.00004, 8]);
    expect(getDominantTempo(tempos, 0, 12)).toBeCloseTo(90, 3);
  });

  it('breaks a tie toward the earlier tempo', () => {
    expect(getDominantTempo(map([0, 80, 0], [960, 160, 5]), 0, 10)).toBe(80);
  });

  it('reports the tempo in force at the start for a zero-length span', () => {
    expect(getDominantTempo(map([0, 120, 0], [1920, 60, 2]), 3, 3)).toBe(60);
    expect(getDominantTempo(map([0, 120, 0], [1920, 60, 2]), 0, 0)).toBe(120);
  });
});
