import * as MidiPackage from '@tonejs/midi';
import { getPulseTicks } from '../game/beatClock';
import { getDominantTempo } from './dominantTempo';
import { defaultAssignmentForNotes, defaultHandForMidi, noteNumberToName } from '../game/songUtils';
import type { ParsedNote, ParsedSong, ParsedTrack, TempoChange } from '../game/types';

interface MidiTrackNote {
  midi: number;
  name?: string;
  velocity: number;
  time: number;
  duration: number;
  ticks: number;
  durationTicks: number;
}

interface MidiTrack {
  name?: string;
  notes: MidiTrackNote[];
}

interface MetaEvent {
  text: string;
  type: string;
  ticks: number;
}

interface MidiInstance {
  header: {
    ppq: number;
    tempos: Array<{ bpm: number; ticks: number; time?: number }>;
    timeSignatures: Array<{ ticks: number; timeSignature: number[] }>;
    ticksToSeconds: (ticks: number) => number;
    update: () => void;
    name?: string;
    meta?: MetaEvent[];
  };
  tracks: MidiTrack[];
  duration: number;
}

type MidiConstructor = new (arrayBuffer: ArrayBuffer) => MidiInstance;

function resolveMidiConstructor(): MidiConstructor {
  const moduleValue = MidiPackage as {
    Midi?: MidiConstructor;
    default?: { Midi?: MidiConstructor };
  };

  const constructor = moduleValue.Midi ?? moduleValue.default?.Midi;
  if (!constructor) {
    throw new Error('Unable to resolve Midi constructor from @tonejs/midi.');
  }

  return constructor;
}

const MidiCtor = resolveMidiConstructor();

export interface MidiSourceMeta {
  songId: string;
  title: string;
}

export interface MidiFileMeta {
  suggestedTitle?: string;
  suggestedArtist?: string;
}

export function extractMidiMeta(arrayBuffer: ArrayBuffer): MidiFileMeta {
  const midi = new MidiCtor(arrayBuffer);
  const result: MidiFileMeta = {};

  const rawName = midi.header.name?.trim();
  if (rawName) result.suggestedTitle = rawName;

  for (const event of midi.header.meta ?? []) {
    const text = event.text?.trim();
    if (!text) continue;
    if (event.type === 'copyright' && !result.suggestedArtist) {
      result.suggestedArtist = text;
    } else if ((event.type === 'trackName' || event.type === 'text') && !result.suggestedTitle) {
      result.suggestedTitle = text;
    }
  }

  return result;
}

export function parseMidiFile(arrayBuffer: ArrayBuffer, meta: MidiSourceMeta): ParsedSong {
  const midi = new MidiCtor(arrayBuffer);
  // SMPTE time division counts ticks per frame, not per quarter note, so tempo, barlines and the beat
  // clock have no meaning in it. Refuse it up front: the import path reports the throw as an import error.
  if (!Number.isFinite(midi.header.ppq) || midi.header.ppq <= 0) {
    throw new Error('SMPTE time division is not supported');
  }
  dropMalformedTempos(midi);
  collapseSameTickTempos(midi);
  ensureTempoAtTickZero(midi);
  const tempoMap = buildTempoMap(midi);

  const tracks: ParsedTrack[] = midi.tracks.map((track: MidiTrack, index: number) => {
    const trackId = `track-${index}`;
    const trackName = track.name?.trim() || `Track ${index + 1}`;
    const assignment = defaultAssignmentForNotes(track.notes, trackName);
    return {
      id: trackId,
      name: trackName,
      sourceTrackIndex: index,
      defaultAssignment: assignment,
      assignment,
    };
  });

  const notes: ParsedNote[] = midi.tracks.flatMap((track: MidiTrack, trackIndex: number) =>
    track.notes.map((note: MidiTrackNote, noteIndex: number) => ({
      id: `track-${trackIndex}-note-${noteIndex}`,
      trackId: `track-${trackIndex}`,
      midi: note.midi,
      name: note.name || noteNumberToName(note.midi),
      velocity: note.velocity,
      startSec: note.time,
      durationSec: note.duration,
      ticks: note.ticks,
      durationTicks: note.durationTicks,
      hand: defaultHandForMidi(note.midi),
    })),
  );

  const sortedNotes = notes.sort((left, right) => left.startSec - right.startSec || left.midi - right.midi);
  // The song's tempo is the one it spends the most time at while notes play. The tempo map stays the
  // timing source; only this number, which the Library shows and the difficulty score reads, is a summary.
  const spanStartSec = sortedNotes.length > 0 ? sortedNotes[0].startSec : 0;
  const spanEndSec = sortedNotes.reduce((end, note) => Math.max(end, note.startSec + note.durationSec), spanStartSec);
  // Rounded to 2 decimals so the float residue of whole-microsecond tempos (89.99995, 190.00028) reads as 90 and 190.
  const bpm = Math.round(getDominantTempo(tempoMap, spanStartSec, spanEndSec) * 100) / 100;

  return {
    id: meta.songId,
    title: meta.title,
    ppq: midi.header.ppq,
    bpm,
    durationSec: midi.duration,
    tracks,
    notes: sortedNotes,
    measureBoundaries: buildMeasureBoundaries(midi),
    tempoMap,
  };
}

// A Set Tempo of 0 microseconds per beat reads as an infinite BPM, which makes every later time
// Infinity or NaN. A tempo that is not a finite positive number carries no timing, so it is dropped and
// the usual 120 BPM default (SMF's own until the first tempo) applies.
function dropMalformedTempos(midi: MidiInstance) {
  const valid = midi.header.tempos.filter((tempo) => Number.isFinite(tempo.bpm) && tempo.bpm > 0);
  if (valid.length !== midi.header.tempos.length) {
    midi.header.tempos.splice(0, midi.header.tempos.length, ...valid);
    midi.header.update();
  }
}

// Exports often carry a default 120 BPM "setup" tempo beside the real one, or one in every track, so
// several Set Tempo events can share a tick. The last one in file order is the tempo in force from that
// tick (the clock reads the last entry at a tick), so the earlier ones are dropped and the stored BPM,
// the tempo map, the beat clock and the metronome all see the same single tempo. The sort is stable, so
// file order (track by track, event by event) survives among equal ticks.
function collapseSameTickTempos(midi: MidiInstance) {
  const sorted = [...midi.header.tempos].sort((left, right) => left.ticks - right.ticks);
  const collapsed = sorted.filter((tempo, index) => sorted[index + 1]?.ticks !== tempo.ticks);
  if (collapsed.length !== midi.header.tempos.length) {
    midi.header.tempos.splice(0, midi.header.tempos.length, ...collapsed);
    midi.header.update();
  }
}

// SMF keeps 120 BPM until the first Set Tempo event. @tonejs/midi times that first event as if its
// own tempo had applied from tick 0, so a file whose first tempo is later leaves a jump. Giving the
// map an explicit 120 BPM entry at tick 0 and recomputing the header makes the times continuous.
function ensureTempoAtTickZero(midi: MidiInstance) {
  const first = midi.header.tempos[0];
  if (first && first.ticks > 0) {
    midi.header.tempos.unshift({ ticks: 0, bpm: 120 });
    midi.header.update();
  }
}

function buildTempoMap(midi: MidiInstance): TempoChange[] {
  if (midi.header.tempos.length === 0) {
    return [{ ticks: 0, bpm: 120, timeSec: 0 }];
  }
  return midi.header.tempos.map((tempo) => ({
    ticks: tempo.ticks,
    bpm: tempo.bpm,
    timeSec: tempo.time ?? midi.header.ticksToSeconds(tempo.ticks),
  }));
}

function buildMeasureBoundaries(midi: MidiInstance) {
  const endTick = Math.max(
    0,
    ...midi.tracks.flatMap((track) => track.notes.map((note) => note.ticks + note.durationTicks)),
  );
  if (endTick === 0) {
    return [{ startTick: 0, endTick: 0, startSec: 0, endSec: 0 }];
  }

  const signatures = midi.header.timeSignatures.length > 0
    ? [...midi.header.timeSignatures].sort((left, right) => left.ticks - right.ticks)
    : [{ ticks: 0, timeSignature: [4, 4] }];
  if (signatures[0].ticks > 0) {
    signatures.unshift({ ticks: 0, timeSignature: [4, 4] });
  }

  const boundaries: Array<{ startTick: number; endTick: number; startSec: number; endSec: number; pulseTicks: number }> = [];
  let tick = 0;
  let signatureIndex = 0;
  while (tick < endTick) {
    while (signatureIndex + 1 < signatures.length && signatures[signatureIndex + 1].ticks <= tick) {
      signatureIndex += 1;
    }
    const [numerator = 4, denominator = 4] = signatures[signatureIndex].timeSignature;
    const measureTicks = midi.header.ppq * numerator * 4 / denominator;
    const nextSignatureTick = signatures[signatureIndex + 1]?.ticks;
    const end = Math.min(
      endTick,
      tick + measureTicks,
      nextSignatureTick !== undefined && nextSignatureTick > tick ? nextSignatureTick : endTick,
    );
    boundaries.push({
      startTick: tick,
      endTick: end,
      startSec: midi.header.ticksToSeconds(tick),
      endSec: midi.header.ticksToSeconds(end),
      pulseTicks: getPulseTicks(midi.header.ppq, numerator, denominator),
    });
    tick = end;
  }
  return boundaries;
}
