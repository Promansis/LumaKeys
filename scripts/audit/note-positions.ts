// Computes where GameSession draws notes when paused at session start, for clicking them in the UI.
// Usage, from the repository root: node --import tsx scripts/audit/note-positions.ts scripts/audit/fixtures/midi/pmus-16.mid > positions.json
// (input for scripts/audit/browser/practice-runtime-proofs.mjs, env POS).
import { readFileSync } from 'node:fs';
import { GameSession } from '../../src/lib/game/GameSession';
import { parseMidiFile } from '../../src/lib/midi/midiFileParser';
const bytes = readFileSync(process.argv[2]);
const song = parseMidiFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { songId: 's', title: 's' });
const cfg = { mode: 'learning', tempoMultiplier: 1, handFilter: 'both', loopRange: null, waitForInput: true, metronomeEnabled: false, handSize: 'medium', fingeringDisplayMode: 'learning-only', pitchBendEnabled: true, latencyCompMs: 0, hitWindowMs: 100, beatsVisible: 8, leadInBeats: 0 } as const;
const out: Record<string, unknown> = { measures: song.measureBoundaries };
for (const [name, loopRange] of [['full', null], ['loop2', { startMeasure: 1, endMeasure: 1 }]] as const) {
  const s = new GameSession(song, { ...cfg, loopRange: loopRange as never });
  out[name] = s.getSnapshot(0).visibleNotes.map((n) => ({ id: n.id, label: n.label, scheduledIndex: n.scheduledIndex, finger: n.finger, x: n.xRatio, w: n.widthRatio, top: n.topRatio, h: n.heightRatio }));
}
console.log(JSON.stringify(out));
