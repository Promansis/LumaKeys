import { describe, expect, it } from 'vitest';
import { shuffle } from './shuffle';

// Small deterministic generator so the distribution test cannot flake.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scripted(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

describe('shuffle', () => {
  it('produces a known permutation from a scripted random source', () => {
    // Fisher-Yates from the end: j = floor(r * (i + 1)), swap i and j.
    expect(shuffle(['a', 'b', 'c', 'd'], scripted([0, 0, 0]))).toEqual(['b', 'c', 'd', 'a']);
    expect(shuffle(['a', 'b', 'c', 'd'], scripted([0.5, 0.5, 0.5]))).toEqual(['a', 'd', 'b', 'c']);
    expect(shuffle(['a', 'b', 'c', 'd'], scripted([0.99, 0.99, 0.99]))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns a new array holding the same items and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input, mulberry32(7));
    expect(result).not.toBe(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect([...result].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles empty and single-item lists without touching the random source', () => {
    const never = () => {
      throw new Error('random source should not be used');
    };
    expect(shuffle([], never)).toEqual([]);
    expect(shuffle(['only'], never)).toEqual(['only']);
  });

  it('uses Math.random by default and still returns a permutation', () => {
    const result = shuffle([1, 2, 3, 4]);
    expect([...result].sort()).toEqual([1, 2, 3, 4]);
  });

  it('places every item in every position within 1.5 points of uniform (20,000 shuffles of 4)', () => {
    const runs = 20000;
    const counts = Array.from({ length: 4 }, () => Array<number>(4).fill(0));
    const random = mulberry32(20251102);
    for (let run = 0; run < runs; run += 1) {
      shuffle([0, 1, 2, 3], random).forEach((item, position) => {
        counts[item][position] += 1;
      });
    }
    for (let item = 0; item < 4; item += 1) {
      for (let position = 0; position < 4; position += 1) {
        const percent = (100 * counts[item][position]) / runs;
        expect(Math.abs(percent - 25), `item ${item} at position ${position}: ${percent.toFixed(1)}%`).toBeLessThanOrEqual(1.5);
      }
    }
  });
});
