# PH-MUS-001: Live Session Controls Erase Judged Practice State

- Lane: music correctness
- Severity: P1
- Confidence: high
- Status: fixed
- Owner: Codex (acting)
- Challenger: Codex, fresh isolated-fixture challenge
- Verifier: independent fresh-context verification agent; runtime proof pending
- Affected runtime: both
- Coverage rows: WF-009, WF-010, MOD-003, MOD-011
- Related/duplicate findings: none
- First observed against: `808e6739e55b5186e8a9565f2c4e9267c4894a6c` plus the chartered audit patch identity

## User Impact

While a scored song is in progress, changing the tempo slider clears the player's
score, combo, judgements, and measure accuracy. The note that was already hit becomes
pending again, so it can be replayed and scored a second time. Other live session
controls rebuild the session at its current time and turn already-past notes into
misses. This corrupts a normal core practice result without an explicit restart or
warning.

## Expected Behavior Or Oracle

Tempo changes alter playback rate, not historical performance already judged during
the same run. Product principle 5 requires scores and trouble spots to direct the
learner; a user-adjustable tempo control must not silently discard those inputs.
The Phase 3 practice profile also requires tempo and mode differences not to lose
or double-count session results.

## Evidence

### Environment

- Commit/patch identity: charter baseline above.
- OS/runtime: Linux x86_64, Node v24.15.0.
- Data profile/fixture: in-memory ParsedSong and GameSession only; no user data.
- Hardware: none.

### Reproduction

1. Construct a two-note scoreable song with a 100 ms hit window.
2. Start the GameSession at time zero and hit the first note perfectly at 1,000 ms.
3. Call `updateSessionConfig` with only `tempoMultiplier` changed from 1 to 0.8.
4. Read the snapshot at the same clock time.

The fresh probe printed:

```text
{"before":{"perfect":1,"total":100,"judged":1},"after":{"perfect":0,"total":0,"judged":0},"resetNoteJudgement":"pending"}
```

The production tempo handler performs exactly that update before replaying audio.

### Artifacts

- `GameSession.updateSessionConfig` calls `resetScheduledNotes`, which resets the
  ScoringEngine: `src/lib/game/GameSession.ts:58-65` and `src/lib/game/GameSession.ts:243-264`.
- `GameScreen.handleTempoChange` invokes `updateSessionConfig` for the normal tempo
  control: `src/renderer/components/GameScreen.tsx:974-998`.
- Other toolbar changes call `rebuildForSessionConfig`, creating a fresh GameSession
  and seeking to the prior time: `src/renderer/components/GameScreen.tsx:802-842`.
- The focused Phase 3 suite passed 18 files and 76 tests, but none changed tempo
  after a scored hit; see the Phase 3 report.

## Root Cause

The only configuration-update path is also a full schedule-and-score reset path.
The session has no state-preserving update for tempo or display-only controls, and
the renderer treats mutable controls as safe to apply during a run.

## Recommended Remediation Boundary

Separate non-structural session updates from schedule rebuilds. Tempo, metronome,
latency display, and fingering-display changes should preserve score, judgements,
combo, active inputs, and the current transport anchor. For controls that truly
change the scheduled note set, either transfer state by stable note identity or make
restart/score reset an explicit confirmed action. Keep the change within GameSession,
GameScreen orchestration, and focused tests.

## Required Regression Proof

- Deterministic unit/integration proof: hit a note, change tempo, and assert its
  judgement, score, combo, and measure bucket remain unchanged; repeat for every
  non-structural control.
- Electron proof: change tempo during a disposable desktop session and complete it;
  the saved result retains pre-change score.
- Web proof: same desktop-browser flow returns the same result fields.
- Data/recovery proof: one result and its measure-accuracy history persist, with no
  duplicate or reset note outcome.
- Manual hardware/UI proof: tempo slider is changed during a MIDI and computer-keyboard run without a visible score reset.
- Broader regression command: `npm test`, `npm run build`, and `npm run build:web`.

## Challenge Record

- Independent reproduction attempt: fresh two-note fixture, not the existing test
  song, reproduced the reset once with deterministic output.
- Alternative explanations tested: audio state is not involved; the score changes
  before AudioEngine is invoked. The result follows directly from the reset call.
- Scope/severity changes: broadened from tempo-only to all live non-structural
  session configuration paths that reuse this reset behavior.
- Deduplication decision: distinct from PH-MUS-003; this concerns transient scored
  state, while PH-MUS-003 concerns durable fingering identity.
- Challenger conclusion and date: accepted by Codex, 2026-07-11; independent
  verifier required before a P1 fix is marked verified.

## Resolution

- Accepted rationale: a normal live tempo adjustment destroys core practice data and can reopen an already played note.
- Fix branch/commit/issue: `d5839aa`, completed by `d4ba395`.
- Verification evidence: deterministic tempo/config tests and independent source review pass; [Phase 10](../phase-10-verification-2026-08-07.md) records remaining real-input/runtime proof. Phase 11, 2026-10-20: on the web (lane C) and in headless Electron (agent item A1, [Electron runtime report](../phase-11-electron-runtime-2026-10-20.md#agent-items-a1-to-a4)) a tempo change keeps score and combo, and a structural change asks first. The Electron run then finishes at 75 % and saves 16 judged notes, 0 misses, tempo 0.75 and max combo 16, matching the Results screen.
  [Sitting 4](../phase-11-owner-sittings-2026-10-20.md#sitting-4-midi-keyboard) item 4, 2026-10-20, run by the agent with a scripted Web MIDI device "Audit Keys 61" on the web and the desktop: Play mode on `pmus-16`, 8 MIDI notes, Space pauses at song time 4.75 s, the HUD holds 800 | 8 through a 2 s pause, then resume and 16 of 16 perfect. Results shows 1,660, 100.0 % and max combo 16; the stored row matches (score 1660, accuracy 100, 16 perfect, 0 misses).
- Residual risk: pause and resume on a real MIDI keyboard is still owed ([user test C3](../phase-11-user-tests.md)). The scripted device proves the app path, not the driver or OS path.
- Revisit trigger: before the next practice-engine remediation or release readiness review.
