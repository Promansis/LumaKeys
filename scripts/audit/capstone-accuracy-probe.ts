// Phase 11 probe (audit tool; not part of the product build): can the tier-1 capstone's
// 85 % accuracy gate fail for a player who finishes it?
//
// Usage, from the repository root:
//   npx tsx scripts/audit/capstone-accuracy-probe.ts
//   (inside the agent sandbox: node --import tsx scripts/audit/capstone-accuracy-probe.ts)
//
// Builds the session the way App.startCapstone and GameScreen do: ode-to-joy.mid parsed,
// filtered to the right hand, and the run setup from getCapstoneRunSetup (Play mode, no
// wait-for-input, the capstone's tempo and hand), 100 ms window. Before PH-MUS-013 the capstone
// ran in Learning mode with wait-for-input; the L-scenarios below keep that setup as `legacy`
// so the two can be compared.
// Each scenario drives GameSession with explicit timestamps and polls getSnapshot every
// millisecond, as the render loop does once per frame.
import fs from 'node:fs';
import { GameSession } from '../../src/lib/game/GameSession';
import { parseMidiFile } from '../../src/lib/midi/midiFileParser';
import { filterSongByHand } from '../../src/lib/game/songUtils';
import { TIERS_BY_ID } from '../../src/lib/learning/curriculum';
import { getCapstoneRunSetup } from '../../src/lib/learning/learningProgress';
import type { SessionConfig } from '../../src/lib/game/types';

const capstone = TIERS_BY_ID.get('novice')!.capstone!;
const bytes = fs.readFileSync(`public/curriculum-midis/${capstone.songFileName}`);
const parsed = parseMidiFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { songId: 'capstone-novice', title: capstone.displayTitle } as any);
const song = filterSongByHand(parsed, capstone.handFilter);
const base: SessionConfig = {
  ...getCapstoneRunSetup(capstone),
  metronomeEnabled: false,
  handSize: 'medium',
  fingeringDisplayMode: 'never',
  pitchBendEnabled: false,
  latencyCompMs: 0,
  hitWindowMs: 100,
  beatsVisible: 8,
  leadInBeats: 0,
};
const key = (game: GameSession, ms: number, note: number) => {
  game.ingestInputEvent({ type: 'noteon', source: 'computer-keyboard', sourceId: 'kbd', timestamp: ms, note, velocity: 0.8 });
  game.ingestInputEvent({ type: 'noteoff', source: 'computer-keyboard', sourceId: 'kbd', timestamp: ms + 5, note });
};
// Waits until the song clock has reached `targetSec` (in learning mode it then stands there),
// then `offsetMs` more (negative: before it gets there), and plays the note.
const play = (config: SessionConfig, offsetMs: number, wrongBefore: number) => {
  const game = new GameSession(song, config);
  let ms = 0;
  game.play(ms);
  for (const note of song.notes) {
    const leadMs = offsetMs < 0 ? -offsetMs * config.tempoMultiplier : 0;
    while (game.getSnapshot(ms).currentTimeSec < note.startSec - leadMs / 1000 - 1e-6) ms += 1;
    ms += Math.max(0, offsetMs);
    game.getSnapshot(ms);
    for (let i = 0; i < wrongBefore; i++) key(game, ms + i, note.midi + 1);
    key(game, ms + wrongBefore, note.midi);
    ms += wrongBefore + 10;
  }
  for (let i = 0; i < 2000 && game.getSnapshot(ms).isPlaying; i++) ms += 10;
  const r = game.getFinalResult();
  return `accuracy=${r.accuracy} perfect=${r.perfectHits} good=${r.goodHits} ok=${r.okHits} miss=${r.misses} wall=${(ms / 1000).toFixed(1)}s`;
};

const legacy: SessionConfig = { ...base, mode: 'learning', waitForInput: true };

console.log(`capstone ${capstone.songFileName}: ${song.notes.length} notes, threshold ${capstone.accuracyThreshold} %, tempo ${capstone.tempoPercent} %, hand ${capstone.handFilter}`);
console.log(`run setup: mode=${base.mode} waitForInput=${base.waitForInput}`);
console.log('L1 capstone, each note on time                          ', play(base, 0, 0));
console.log('L2 capstone, each note 2 s late, 3 wrong keys before it ', play(base, 2000, 3));
console.log('L3 capstone, each note 40 ms early                      ', play(base, -40, 0));
console.log('L4 capstone, each note 80 ms early                      ', play(base, -80, 0));
console.log('legacy Learning + wait, each note 2 s late, 3 wrong keys', play(legacy, 2000, 3));
