// Phase 11 probe (audit tool; not part of the product build): does GameSession judge note
// input while its transport is not running?
//
// Usage, from the repository root:
//   npx tsx scripts/audit/paused-input-probe.ts
//   (inside the agent sandbox: node --import tsx scripts/audit/paused-input-probe.ts)
//
// Uses the real lesson 1 drill (eight middle-C quarter notes at 72 BPM, first note at 0 s)
// and drives GameSession with explicit millisecond timestamps, the way GameScreen does.
// GameScreen.runCountdown leaves the session paused at 0 s for the 3-2-1 countdown and any
// lead-in beats, and handleInputEvent forwards every note to ingestInputEvent regardless
// of transport state (GameScreen.tsx:448-471).
import { GameSession } from '../../src/lib/game/GameSession';
import { getLessonById } from '../../src/lib/learning/curriculum';
import { buildLessonDrill } from '../../src/lib/learning/drillGenerator';
import type { SessionConfig } from '../../src/lib/game/types';

const step = getLessonById('novice-01-keyboard-map')!.steps[2] as any;
const song = buildLessonDrill(step.title, step.drill);
const config: SessionConfig = {
  mode: 'luma-keys',
  tempoMultiplier: 1,
  handFilter: 'both',
  loopRange: null,
  waitForInput: false,
  metronomeEnabled: false,
  handSize: 'medium',
  fingeringDisplayMode: 'never',
  pitchBendEnabled: false,
  latencyCompMs: 0,
  hitWindowMs: 100,
  beatsVisible: 8,
  leadInBeats: 0,
};
const press = (game: GameSession, ms: number) => {
  game.ingestInputEvent({ type: 'noteon', source: 'computer-keyboard', sourceId: 'kbd', timestamp: ms, note: 60, velocity: 0.8 });
  game.ingestInputEvent({ type: 'noteoff', source: 'computer-keyboard', sourceId: 'kbd', timestamp: ms + 50, note: 60 });
};
const summary = (game: GameSession, ms: number) => {
  const s = game.getSnapshot(ms);
  const sc = s.score;
  return `playing=${s.isPlaying} songTime=${s.currentTimeSec.toFixed(3)} score=${sc.totalScore} perfect=${sc.perfectCount} good=${sc.goodCount} ok=${sc.okCount} miss=${sc.missCount}`;
};
console.log('drill notes (s)', JSON.stringify(song.notes.map((n) => n.startSec)));

// A: session loaded, never started (also the state during the 3-2-1 countdown)
const a = new GameSession(song, config);
console.log('A before any press      ', summary(a, 1000));
press(a, 1000);
console.log('A C4 while not started  ', summary(a, 1100));
press(a, 2000);
console.log('A C4 again, not started ', summary(a, 2100));

// B: paused mid-song 33 ms before note 2, key pressed 4 s into the pause
const b = new GameSession(song, config);
b.play(0);
press(b, 10);
b.pause(800);
console.log('B paused at 0.800 s     ', summary(b, 800));
press(b, 4800);
console.log('B C4 4 s into the pause ', summary(b, 4900));

// C: control, transport running, press 0.4 s away from any note
const c = new GameSession(song, config);
c.play(0);
press(c, 10);
press(c, 420);
console.log('C running, press at 0.42', summary(c, 500));
