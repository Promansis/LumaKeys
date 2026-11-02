import type { TempoChange } from '../game/types';

const FALLBACK_BPM = 120;

/**
 * The tempo a song spends the most time at, for the one BPM number the Library shows and the
 * difficulty score uses. The tempo map stays the timing source; this only names its main tempo.
 *
 * Each tempo's weight is the song time it is in force inside the span `[spanStartSec, spanEndSec]`
 * (the span of the notes, so a 120 BPM placeholder before the first real tempo only counts for the
 * stretch where notes actually play under it). Entries that agree to two decimals share one weight,
 * so a tempo that is restated or only differs by float residue is not split. The heaviest wins; a tie
 * goes to the earlier tempo. A span with no length reports the tempo in force at its start.
 */
export function getDominantTempo(
  tempoMap: readonly TempoChange[],
  spanStartSec: number,
  spanEndSec: number,
): number {
  if (tempoMap.length === 0) {
    return FALLBACK_BPM;
  }

  const start = Number.isFinite(spanStartSec) ? spanStartSec : 0;
  const end = Number.isFinite(spanEndSec) ? spanEndSec : start;

  if (!(end > start)) {
    let inForce = tempoMap[0];
    for (const change of tempoMap) {
      if (change.timeSec <= start) inForce = change;
      else break;
    }
    return inForce.bpm;
  }

  const weights = new Map<number, { bpm: number; seconds: number }>();
  tempoMap.forEach((change, index) => {
    const segmentStart = Math.max(change.timeSec, start);
    const segmentEnd = Math.min(tempoMap[index + 1]?.timeSec ?? Infinity, end);
    const seconds = segmentEnd - segmentStart;
    if (!(seconds > 0)) return;
    const key = Math.round(change.bpm * 100);
    const entry = weights.get(key);
    if (entry) entry.seconds += seconds;
    else weights.set(key, { bpm: change.bpm, seconds });
  });

  let best: { bpm: number; seconds: number } | null = null;
  for (const entry of weights.values()) {
    // Map iteration follows insertion order, so a strict comparison keeps the earlier tempo on a tie.
    if (!best || entry.seconds > best.seconds) best = entry;
  }
  return best?.bpm ?? tempoMap[0].bpm;
}
