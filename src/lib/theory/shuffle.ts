/**
 * Fisher-Yates shuffle: every permutation is equally likely, unlike
 * `sort(() => Math.random() - 0.5)`, whose bias depends on the engine's sort.
 * `random` returns a number in [0, 1) and is injectable for tests.
 */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
