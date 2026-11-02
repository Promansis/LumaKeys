import type { ParsedSong } from './types';

export interface BeatPosition {
  /** Ordinal of the metronome pulse, counted from the start of the song. Never decreases with song time. */
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
 * Beats follow the song's tempo map and count pulses from the start of each measure in
 * `measureBoundaries` (pulse unit per `getPulseTicks`), so meter and tempo changes both move the click.
 */
export function getBeatAtSongTime(song: BeatClockSong, songTimeSec: number): BeatPosition {
  const ppq = song.ppq > 0 ? song.ppq : 480;
  let tick = songTimeToTick(song, songTimeSec);
  if (tick < 0) {
    return { beatIndex: Math.floor(tick / ppq), isDownbeat: false };
  }

  const measures = song.measureBoundaries;
  if (!measures?.length) {
    // No barlines (the learning drills): an endless 4/4 grid of quarter notes.
    const beatIndex = Math.floor(tick / ppq);
    return { beatIndex, isDownbeat: beatIndex % 4 === 0 };
  }
  const pulseOf = (measure: { pulseTicks?: number }) =>
    measure.pulseTicks && measure.pulseTicks > 0 ? measure.pulseTicks : ppq;
  const pulsesIn = (measure: { startTick: number; endTick: number; pulseTicks?: number }) =>
    Math.max(1, Math.ceil((measure.endTick - measure.startTick) / pulseOf(measure) - TICK_EPSILON));

  // The measure grid ends at the last note-off. At or past it, stay on the last pulse so a song that
  // ends off the beat does not sound one more click.
  const last = measures[measures.length - 1];
  if (tick >= last.endTick) {
    tick = Math.max(last.startTick, last.endTick - 2 * TICK_EPSILON);
  }

  const measureIndex = findMeasureIndex(measures, tick);
  const measure = measures[measureIndex];
  let beatsBefore = 0;
  for (let index = 0; index < measureIndex; index += 1) {
    beatsBefore += pulsesIn(measures[index]);
  }
  const beatInMeasure = Math.min(
    pulsesIn(measure) - 1,
    Math.floor((tick - measure.startTick) / pulseOf(measure)),
  );
  return { beatIndex: beatsBefore + beatInMeasure, isDownbeat: beatInMeasure === 0 };
}

/**
 * Ticks per metronome pulse for a time signature. Compound meters (an eighth or sixteenth
 * denominator with a numerator that is a multiple of 3 above 3: 6/8, 9/8, 12/8) click on the dotted
 * unit, three denominator notes. Every other meter clicks on the denominator note (4/4 quarters,
 * 3/8 and 7/8 eighths, 2/2 halves). Pulses are then evenly spaced and a full bar holds a whole number.
 */
export function getPulseTicks(ppq: number, numerator: number, denominator: number): number {
  const unit = (ppq * 4) / (denominator > 0 ? denominator : 4);
  const compound = (denominator === 8 || denominator === 16) && numerator > 3 && numerator % 3 === 0;
  return compound ? unit * 3 : unit;
}

export interface MetronomeStep {
  lastBeatIndex: number;
  click: { accent: boolean } | null;
}

/**
 * Decides whether the metronome clicks for the current beat. The first call only seeds the counter.
 * A forward step clicks; accents follow the downbeat flag. When the beat index goes backwards (a loop
 * wrap or a seek) the counter resets, and the click sounds only if the new beat is a downbeat, so a
 * looping bar still sounds its accent.
 */
export function advanceMetronome(lastBeatIndex: number | null, beat: BeatPosition): MetronomeStep {
  if (lastBeatIndex === null || beat.beatIndex === lastBeatIndex) {
    return { lastBeatIndex: lastBeatIndex === null ? beat.beatIndex : lastBeatIndex, click: null };
  }
  if (beat.beatIndex < lastBeatIndex) {
    return { lastBeatIndex: beat.beatIndex, click: beat.isDownbeat ? { accent: true } : null };
  }
  return { lastBeatIndex: beat.beatIndex, click: { accent: beat.isDownbeat } };
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
