// Phase 11 probe (audit tool; not part of the product build): can the tier-1 capstone's
// 85 % accuracy gate fail for a player who finishes it?
//
// Usage, from the repository root:
//   npx tsx scripts/audit/capstone-accuracy-probe.ts
//   (inside the agent sandbox: node --import tsx scripts/audit/capstone-accuracy-probe.ts)
//
// Builds the session the way App.startCapstone and GameScreen do: ode-to-joy.mid parsed,
// filtered to the right hand, learning mode with wait-for-input, 90 % tempo, 100 ms window.
// Each scenario drives GameSession with explicit timestamps and polls getSnapshot every
// millisecond, as the render loop does once per frame.
import fs from 'node:fs';
import { GameSession } from '../../src/lib/game/GameSession';
import { parseMidiFile } from '../../src/lib/midi/midiFileParser';
import { filterSongByHand } from '../../src/lib/game/songUtils';
import { TIERS_BY_ID } from '../../src/lib/learning/curriculum';
import type { SessionConfig } from '../../src/lib/game/types';

const capstone = TIERS_BY_ID.get('novice')!.capstone!;
const bytes = fs.readFileSync(`public/curriculum-midis/${capstone.songFileName}`);
const parsed = parseMidiFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { songId: 'capstone-novice', title: capstone.displayTitle } as any);
const song = filterSongByHand(parsed, capstone.handFilter);
const base: SessionConfig = {
  mode: 'learning',
  tempoMultiplier: capstone.tempoPercent / 100,
  handFilter: capstone.handFilter,
  loopRange: null,
  waitForInput: true,
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

console.log(`capstone ${capstone.songFileName}: ${song.notes.length} notes, threshold ${capstone.accuracyThreshold} %, tempo ${capstone.tempoPercent} %, hand ${capstone.handFilter}`);
console.log('L1 learning, each note on time                          ', play(base, 0, 0));
console.log('L2 learning, each note 2 s late, 3 wrong keys before it ', play(base, 2000, 3));
console.log('L3 learning, each note 40 ms early                      ', play(base, -40, 0));
console.log('L4 learning, each note 80 ms early                      ', play(base, -80, 0));
const playMode = { ...base, mode: 'luma-keys' as const, waitForInput: false };
console.log('P1 control, Play mode, each note 2 s late               ', play(playMode, 2000, 0));
