// Phase 11 lane C metronome replay probe (audit tool; not part of the product build).
//
// Usage, from the repository root:
//   npx tsx scripts/audit/metronome-replay-probe.ts <file.mid> [more.mid ...]
//   (inside the agent sandbox: node --import tsx scripts/audit/metronome-replay-probe.ts ...)
//
// Replays the in-game metronome interval from src/renderer/components/GameScreen.tsx
// (the useEffect around lines 590-615 at 4466626; the beat computation is copied verbatim
// below) against the real GameSession clock with a controlled 25 ms time source, at practice
// tempos 1.0, 0.5, and 1.5. For each run it prints the wall-clock and song-time of every click,
// which clicks are accented, and the song's barlines from parseMidiFile. Compare by hand with
// the song's quarter-note beats (60 / tempo-map BPM, in song seconds) divided by the practice
// tempo for wall time; accents belong on barlines. If GameScreen changes, re-copy the block.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { GameSession } from '../../src/lib/game/GameSession';
import { parseMidiFile } from '../../src/lib/midi/midiFileParser';
import type { SessionConfig } from '../../src/lib/game/types';

const base: SessionConfig = {
  mode: 'learning',
  tempoMultiplier: 1,
  handFilter: 'both',
  loopRange: null,
  waitForInput: false,
  metronomeEnabled: true,
  handSize: 'medium',
  fingeringDisplayMode: 'never',
  pitchBendEnabled: false,
  latencyCompMs: 0,
  hitWindowMs: 100,
  beatsVisible: 8,
  leadInBeats: 0,
};
const round = (value: number) => Number(value.toFixed(3));

for (const file of process.argv.slice(2)) {
  const bytes = readFileSync(file);
  const sessionSong = parseMidiFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { songId: 'm', title: 'm' });
  const barlinesSongSec = (sessionSong.measureBoundaries ?? []).map((b) => round(b.startSec));
  for (const tempo of [1, 0.5, 1.5]) {
    const sessionConfig = { ...base, tempoMultiplier: tempo };
    const game = new GameSession(sessionSong, sessionConfig);
    game.play(0);
    let metronomeLastBeatRef: number | null = null;
    const clicks: Array<{ wallSec: number; songSec: number; accent: boolean }> = [];
    const endMs = Math.min((sessionSong.durationSec / tempo) * 1000, 12000);
    for (let now = 0; now <= endMs; now += 25) {
      // --- verbatim from GameScreen.tsx metronome effect (sessionSong, sessionConfig, game as there) ---
      const currentTimeSec = game.getCurrentTimeSec(now);
      const beatsPerSecond = (sessionSong.bpm * Math.max(sessionConfig.tempoMultiplier, 0.01)) / 60;
      const beatIndex = Math.floor(currentTimeSec * beatsPerSecond);
      if (metronomeLastBeatRef === null) { metronomeLastBeatRef = beatIndex; continue; }
      if (beatIndex < metronomeLastBeatRef) { metronomeLastBeatRef = beatIndex; continue; }
      if (beatIndex > metronomeLastBeatRef) {
        metronomeLastBeatRef = beatIndex;
        clicks.push({ wallSec: now / 1000, songSec: round(currentTimeSec), accent: beatIndex % 4 === 0 });
      }
      // --- end verbatim ---
    }
    console.log(JSON.stringify({
      file: basename(file),
      songBpm: sessionSong.bpm,
      practiceTempo: tempo,
      barlinesSongSec,
      clickWallSec: clicks.map((c) => c.wallSec),
      clickSongSec: clicks.map((c) => c.songSec),
      accentSongSec: clicks.filter((c) => c.accent).map((c) => c.songSec),
    }));
  }
}
