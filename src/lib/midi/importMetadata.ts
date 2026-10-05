import { createHash } from 'node:crypto';
import type { TrackAssignment } from '../game/types';
import type { ParsedSong } from '../game/types';
import { getTrackAssignments } from '../game/songUtils';
import { extractMidiMeta, parseMidiFile } from './midiFileParser';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function createSongId(buffer: Uint8Array): Promise<string> {
  return createHash('sha256').update(buffer).digest('hex');
}

export function calculateDifficulty(song: ParsedSong): number {
  const { notes, durationSec, bpm } = song;
  if (notes.length === 0) return 1;

  const safeDuration = Math.max(durationSec, 1);
  const density = notes.length / safeDuration;
  const densityScore = Math.min(10, density * 1.2);

  const midiValues = notes.map((n) => n.midi);
  const pitchRange = Math.max(...midiValues) - Math.min(...midiValues);
  const rangeScore = Math.min(10, pitchRange / 8);

  let maxSimultaneous = 1;
  for (let i = 0; i < notes.length; i++) {
    const start = notes[i].startSec;
    let count = 1;
    for (let j = i + 1; j < notes.length && notes[j].startSec - start < 0.05; j++) {
      count++;
    }
    if (count > maxSimultaneous) maxSimultaneous = count;
  }
  const chordScore = Math.min(10, (maxSimultaneous - 1) * 2.5);

  const tempoScore = Math.min(10, (Math.max(bpm, 40) / 120) * 10);

  const beatWindowSec = 60 / Math.max(bpm, 40);
  const independenceWindows = new Map<number, { left: number[]; right: number[] }>();
  for (const note of notes) {
    const beatIndex = Math.floor(note.startSec / beatWindowSec);
    const bucket = independenceWindows.get(beatIndex) ?? { left: [], right: [] };
    if (note.hand === 'left') {
      bucket.left.push(note.midi);
    } else if (note.hand === 'right') {
      bucket.right.push(note.midi);
    }
    independenceWindows.set(beatIndex, bucket);
  }

  let divergenceTotal = 0;
  let divergenceCount = 0;
  for (const bucket of independenceWindows.values()) {
    if (bucket.left.length === 0 || bucket.right.length === 0) {
      continue;
    }
    const leftAvg = bucket.left.reduce((sum, midi) => sum + midi, 0) / bucket.left.length;
    const rightAvg = bucket.right.reduce((sum, midi) => sum + midi, 0) / bucket.right.length;
    divergenceTotal += Math.min(60, Math.abs(rightAvg - leftAvg));
    divergenceCount += 1;
  }
  const independenceScore =
    divergenceCount === 0 ? 0 : Math.min(10, (divergenceTotal / divergenceCount) / 6);

  const raw =
    densityScore * 0.4 +
    rangeScore * 0.2 +
    chordScore * 0.2 +
    tempoScore * 0.1 +
    independenceScore * 0.1;
  return Math.max(1, Math.min(10, Math.round(raw)));
}

export interface ComputedSongMetadata {
  artist: string;
  bpm: number;
  difficulty: number;
  durationSec: number;
  noteCount: number;
  title: string;
  trackAssignments: Record<string, TrackAssignment>;
}

export function computeSongMetadata(
  buffer: Uint8Array,
  title: string,
  existingTrackAssignments: Record<string, TrackAssignment> = {},
): ComputedSongMetadata {
  const midiMeta = extractMidiMeta(toArrayBuffer(buffer));
  // MIDI track names often identify instruments rather than the song.
  const effectiveTitle = title.trim() || midiMeta.suggestedTitle || 'Untitled';
  const parsedSong = parseMidiFile(toArrayBuffer(buffer), { songId: 'preview', title: effectiveTitle });
  const defaultAssignments = getTrackAssignments(parsedSong);

  return {
    artist: midiMeta.suggestedArtist ?? '',
    bpm: parsedSong.bpm,
    difficulty: calculateDifficulty(parsedSong),
    durationSec: parsedSong.durationSec,
    noteCount: parsedSong.notes.length,
    title: effectiveTitle,
    trackAssignments: {
      ...defaultAssignments,
      ...existingTrackAssignments,
    },
  };
}
