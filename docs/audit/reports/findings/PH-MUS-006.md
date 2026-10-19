# PH-MUS-006: In-game metronome applies the practice tempo twice and ignores the song's meter and tempo changes

- Lane: MUS
- Severity: P2
- Confidence: high
- Status: reproduced
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), lane C, 2026-10-19
- Verifier: TBD
- Affected runtime: both (shared renderer code in `GameScreen.tsx`); reproduced in the web build in headless Chromium and by replaying the code on the real `GameSession` clock
- Coverage rows: WF-009, MOD-011
- Related/duplicate findings: PH-MUS-002 (measure map; this consumer reads neither `measureBoundaries` nor the tempo map, so its root cause is independent); PH-MUS-001 (tempo changes mid-run)
- First observed against: `main` at source identity `6e549b6`, Phase 11 lane C. The code dates from `e37c612` (2026-05-27) and is not part of the 0bd40f5..6e549b6 delta

## User Impact

A player who turns on Settings, Gameplay, "Start With Metronome" hears a click track
during song practice. Slowing a song down with the metronome on is the usual way to
practise a hard passage, and that is where the click is wrong:

- At 50 percent tempo it clicks every second beat (one click per 2.0 s of wall time
  at 120 BPM, where the beat is 1.0 s).
- At any other tempo below or above 100 percent it drifts against the beat (at
  150 percent: a click every 0.225 s where the beat is 0.333 s; at 75 percent: 1.125
  clicks per second where the beat rate is 1.5).
- The accented click falls on every fourth click, not on the barline, so in 3/4, 6/8,
  or after any meter change the accent lands mid-bar; at a practice tempo other than
  100 percent it is also off in 4/4.
- It uses only the song's first BPM, so after a tempo change in the file it keeps the
  old beat (a 120 to 60 BPM change clicks twice per beat afterwards).

At 100 percent tempo in a 4/4 song with one tempo, it is correct. The metronome is
off by default, does not affect scoring or saved data, and the player can turn it off,
so this is a meaningful but recoverable music-correctness error in a practice aid (P2).
The lead may weigh P1 under "material music-correctness error" if the metronome is
considered part of the core practice workflow.

## Expected Behavior Or Oracle

Music rule: a metronome clicks on every beat of the music as it is being played, and
its accent marks the first beat of each bar. At practice tempo `t`, a beat of the
song lasts `60 / (bpm × t)` seconds of wall time, where `bpm` is the tempo in force
at that point of the tempo map. The product already uses this formula for lead-in
beats (`GameScreen.tsx` `runCountdown`, `beatMs = 60 / (song.bpm × tempoMultiplier)`).

## Evidence

### Environment

- Commit/patch identity: `6e549b6` (audited source); web build in `dist/` from that source
- OS/runtime/browser: Linux; Node 24 with tsx for the replay; headless Chromium 141 (Playwright 1.56.1) for the runtime run
- Data profile/fixture: isolated data dir `$TMPDIR/p11/C/data-metro`; `scripts/audit/fixtures/midi/metro-3-4-late-note.mid` (3/4, 120 BPM, one note at 30 s) for the browser run; `pmus-16.mid`, `6-8-then-3-4-reached.mid`, `3-4-to-4-4-tempo.mid` for the replay
- Hardware, if applicable: none (click times read from the Web Audio API, not by ear)

### Reproduction

1. Runtime, web build: `scripts/audit/browser/metronome-and-quiz.mjs` part B. It sets
   `gameplay.metronomeDefault=true` and `gameplay.leadInBeats=0` through the bridge,
   uploads the fixture, opens it in Learning mode, sets the tempo slider in the session
   overlay (Escape, slider, Resume, blur), presses Space, and logs every
   `OscillatorNode.start` for 12 s.
2. Observed at 100 percent: count-in clicks at 0.01, 1.01, 2.01 s (the fixed 3-2-1
   countdown), then playback clicks from 3.53 s every 0.50 s (16 gaps of 0.50 s).
3. Observed at 50 percent: the same countdown, then playback clicks at 5.03, 7.03, 9.03,
   11.03 s (gaps of 2.00 s). Expected gaps: 1.00 s.
4. Replay: `node --import tsx scripts/audit/metronome-replay-probe.ts` on three fixtures
   copies the effect's beat computation verbatim and drives `GameSession` with a 25 ms
   clock. At tempo 1.5 clicks fall at 0.225 s wall intervals; in
   `6-8-then-3-4-reached.mid` (barlines 0, 1.5, 3, 4.5 s) accents fall at 2, 4, 6 s;
   in `3-4-to-4-4-tempo.mid` (120 to 60 BPM at 4.0 s) clicks continue every 0.5 s of
   song time after 4.0 s, where beats are 1.0 s apart. Every run gave the same result.

### Artifacts

- File/line: `src/renderer/components/GameScreen.tsx:599-600` computes
  `beatsPerSecond = (sessionSong.bpm × tempoMultiplier) / 60` and
  `beatIndex = floor(currentTimeSec × beatsPerSecond)`, but `currentTimeSec` comes from
  `GameSession.getCurrentTimeSec`, which already advances song time at
  `elapsed × tempoMultiplier` (`src/lib/game/GameSession.ts:148-150`). Line 614 accents
  `beatIndex % 4 === 0`.
- Test/command output summary: `$TMPDIR/p11/C/metronome-and-quiz.out` (part B lines),
  `$TMPDIR/p11/C/metronome-replay.out` (9 runs)
- Screenshot/video/trace path and hash: none; click times are the artifact
- Durable-state before/after comparison: not applicable (no data written besides the isolated settings)

## Root Cause

The metronome converts tempo-scaled song time into beats with a tempo-scaled beat
rate, so the practice tempo enters twice (clicks per wall second = bpm × t² / 60). It
also derives beats from a single `song.bpm` and accents a fixed every-fourth count,
instead of reading the tempo map and `measureBoundaries` that the parser already
provides. Owning boundary: the metronome effect in `GameScreen.tsx`.

## Recommended Remediation Boundary

Move the beat computation into a pure helper in `src/lib/game/` that maps song time to
a beat index and a downbeat flag from the song's tempo map (`ParsedSong` would need to
carry it; today it has only the first `bpm`) and `measureBoundaries`, with song time as
the only clock input (no second tempo factor). Have the effect call it. The count-in and lead-in code can stay as is.

## Required Regression Proof

- Deterministic unit/integration proof: helper test asserting click song-times for a 4/4 120 BPM song at practice tempo 0.5, 1, and 1.5 (wall gaps 1.0, 0.5, 0.333 s); accents on barlines for 3/4, 6/8, and a 6/8-to-3/4 change; beat spacing after a 120-to-60 BPM change
- Electron proof: shared code; one listen in sitting 1 if the lead wants audible proof
- Web proof: re-run `scripts/audit/browser/metronome-and-quiz.mjs` part B; 50 percent gaps must be 1.00 s
- Data/recovery proof: not applicable
- Manual hardware/UI proof: optional audible check with speakers (sitting 1 or 4)
- Broader regression command: `npm run test`

## Challenge Record

- Independent reproduction attempt: two methods agree. The replay of the verbatim code on the real clock predicted 2.0 s gaps at 50 percent; the browser run against the built app measured 2.00 s gaps.
- Alternative explanations tested: the slider did not apply (ruled out: it showed "50%", and the countdown and click spacing changed); the 1 s count-in clicks are the fixed 3-2-1 countdown (`runCountdown` waits 1000 ms per count) and were excluded from the playback gaps; the first beat at song time 0 is skipped because the first tick only seeds the counter, which is minor and not part of this finding. Oscillator frequency could not distinguish accents (every click read 440 Hz at `start()`), so the accent claim rests on the code and the replay, not on the browser run.
- Scope/severity changes: the meter and tempo-map parts were kept in this finding because they share the consumer and the remedy; the lead may split them under PH-MUS-002 if preferred, but PH-MUS-002's fix does not touch this code.
- Deduplication decision: no existing ledger entry or Phase 3 note mentions the metronome; distinct from PH-MUS-002 (independent root cause, per the ledger rule for distinct measure-map consumers).
- Challenger conclusion and date: reproduced, 2026-10-19

## Resolution

- Accepted/rejected rationale: pending consolidation
- Fix branch/commit/issue:
- Verification evidence:
- Residual risk:
- Revisit trigger, if accepted-risk:
