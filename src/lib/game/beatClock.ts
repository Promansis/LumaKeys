import type { ParsedSong } from './types';

export interface BeatPosition {
  /** Ordinal of the quarter-note beat, counted from the start of the song. Never decreases with song time. */
  beatIndex: number;
  /** True on the first beat of a measure. */
  isDownbeat: boolean;
}

type BeatClockSong = Pick<ParsedSong, 'ppq' | 'bpm' | 'tempoMap' | 'measureBoundaries'>;

// Float error allowed when snapping a computed tick to a whole tick.
const TICK_EPSILON = 1e-6;

/**
 * Maps song time to the quarter-note beat being played and whether it opens a measure.
 *
 * Song time is the only clock input. It is already scaled by the practice tempo (GameSession
 * advances it at `elapsed * tempoMultiplier`), so the tempo multiplier must not be applied again.
 * Beats follow the song's tempo map and count from the start of each measure in
 * `measureBoundaries`, so meter changes and tempo changes both move the click.
 */
export function getBeatAtSongTime(song: BeatClockSong, songTimeSec: number): BeatPosition {
  const ppq = song.ppq > 0 ? song.ppq : 480;
  const tick = songTimeToTick(song, songTimeSec);
  if (tick < 0) {
    return { beatIndex: Math.floor(tick / ppq), isDownbeat: false };
  }

  const measures = song.measureBoundaries?.length
    ? song.measureBoundaries
    : [{ startTick: 0, endTick: ppq * 4, startSec: 0, endSec: 0 }];
  const beatsIn = (lengthTicks: number) => Math.ceil(lengthTicks / ppq - TICK_EPSILON);

  let measureIndex: number;
  let measureStart: number;
  let beatsBefore = 0;
  const last = measures[measures.length - 1];
  if (tick < last.endTick) {
    measureIndex = findMeasureIndex(measures, tick);
    measureStart = measures[measureIndex].startTick;
  } else {
    // Past the final barline (the grid ends at the last note-off): keep counting in bars as long as the last one.
    const lastLength = Math.max(last.endTick - last.startTick, ppq);
    const extraBars = Math.floor((tick - last.endTick) / lastLength);
    measureIndex = measures.length;
    measureStart = last.endTick + extraBars * lastLength;
    beatsBefore = extraBars * beatsIn(lastLength);
  }
  for (let index = 0; index < measureIndex; index += 1) {
    beatsBefore += beatsIn(measures[index].endTick - measures[index].startTick);
  }

  const beatInMeasure = Math.floor((tick - measureStart) / ppq);
  return { beatIndex: beatsBefore + beatInMeasure, isDownbeat: beatInMeasure === 0 };
}

function findMeasureIndex(measures: Array<{ startTick: number }>, tick: number): number {
  let low = 0;
  let high = measures.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measures[middle].startTick <= tick) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

function songTimeToTick(song: BeatClockSong, songTimeSec: number): number {
  const ppq = song.ppq > 0 ? song.ppq : 480;
  const tempoMap = song.tempoMap?.length ? song.tempoMap : [{ ticks: 0, bpm: song.bpm, timeSec: 0 }];
  let segment = tempoMap[0];
  for (const change of tempoMap) {
    if (change.timeSec <= songTimeSec) segment = change;
    else break;
  }
  const bpm = segment.bpm > 0 ? segment.bpm : 120;
  const tick = segment.ticks + ((songTimeSec - segment.timeSec) * bpm * ppq) / 60;
  // Snap a tick that is within float error of a whole tick so a beat or barline is not missed by a hair.
  const nearest = Math.round(tick);
  return Math.abs(tick - nearest) < TICK_EPSILON ? nearest : tick;
}
