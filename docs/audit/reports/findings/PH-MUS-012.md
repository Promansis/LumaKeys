# PH-MUS-012: Notes pressed while the song is not playing (before Space, during the count-in, or while paused) are judged against the frozen clock and score

- Lane: MUS
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-20
- Verifier: TBD
- Affected runtime: both (shared `GameSession` and `GameScreen`); reproduced in the Electron build and in a deterministic engine probe
- Coverage rows: WF-009, WF-011, WF-014, MOD-003, MOD-011
- Related/duplicate findings: none
- First observed against: `main` at source identity `4466626`, Phase 11 Electron runtime run, 2026-10-20

## User Impact

A player warming up on middle C before pressing Space, or during the 3-2-1 count-in,
gets the song's first note scored as Perfect before the song has started. Their real
on-time press then lands as an unscored extra. A player who pauses with Space just
before a note can press it while the screen stands still and still be credited, as
long as the frozen clock is within the hit window of that note. Results, accuracy,
lesson drill passes and capstone accuracy can therefore include notes the player
did not play in time. Severity P3: the effect is at most a note or two per start or
pause, it only ever raises the score, and nothing is lost or corrupted. It also
makes timing harnesses unreliable unless they wait for the count-in to end (the
audit's own lesson driver hit it).

## Expected Behavior Or Oracle

- The game's timing model (`CONTEXT.md`, "Design Patterns", "Time-based gameplay"; `GameSession` owns
  "timing, scoring, combo, note matching (hit window)"): a judgement measures a press
  against the moving song clock. While the session is not playing, that clock is
  frozen (`GameSession.getCurrentTimeSec`, `src/lib/game/GameSession.ts:143-147`), so
  a judgement made against it measures nothing.
- The count-in exists to give the player lead-in time before the first note; a press
  during it should sound but not score.

## Evidence

### Environment

- Commit/patch identity: working tree at `4466626` plus audit-only files.
- OS/runtime: Linux; Electron 30.5.1 headless harness (`scripts/audit/electron/`);
  Node 22 with `tsx` for the engine probe.
- Fixture: lesson 1 ("Keyboard map") step 3 drill, eight middle-C quarter notes at
  72 BPM, the first at 0 s.

### Reproduction

1. Engine probe, `node --import tsx scripts/audit/paused-input-probe.ts`, explicit
   timestamps, no UI:
   - A: session created, never played. A C4 `noteon` scores 100 (1 Perfect) at song
     time 0. A second C4 adds nothing.
   - B: played, then paused at 0.800 s. A C4 4 s into the pause scores Good against
     the 0.833 s note (score 100 to 175).
   - C (control): while playing, a C4 at 0.42 s, outside every window, changes nothing.
2. Desktop app, `scripts/audit/electron/paused-input.mjs`, on the lesson 1 drill:
   - Count-in: after Space, with the overlay showing "2", one C4 (`Comma`) moves the HUD
     from Score 0, Combo 0 to Score 100, Combo 1, and the overlay still shows "2".
   - Before Space: with the drill loaded and no count-in, one C4 moves the HUD to
     Score 100, Combo 1. A second C4 leaves it at 100.
3. Repeat count: engine probe once (deterministic); desktop driver twice with the
   same HUD values.

### Artifacts

- File/line: `src/lib/game/GameSession.ts:176-200` (`ingestInputEvent` has no
  `isPlaying` check) and `:326-345` (`matchNote`); `src/renderer/components/GameScreen.tsx:448-471`
  (`handleInputEvent` forwards every note event); `:869-897` (`runCountdown` keeps the
  session stopped at 0 s until `game.play(now)`); `:905-920` (Space pauses with
  `game.pause`).
- Command: `node --import tsx scripts/audit/paused-input-probe.ts` (output
  `paused-probe.out`, sha256 `0b4e581e…58aee527`); `scripts/audit/electron/paused-input.mjs`
  (output `paused.out`, sha256 `e208116e…e4b821ae`). See
  [the Electron runtime report](../phase-11-electron-runtime-2026-10-20.md).
- Durable-state before/after: not applicable (no write until the session ends).

## Root Cause

`GameSession.ingestInputEvent` converts the event timestamp with
`getCurrentTimeSec`, which returns the frozen time while the session is stopped,
and passes the result straight to `matchNote`. Neither checks `isPlaying`, and
`GameScreen.handleInputEvent` forwards input in every state so that the note still
sounds. The boundary is `GameSession`'s input path.

## Recommended Remediation Boundary

In `GameSession.ingestInputEvent`, keep the held-note and sustain bookkeeping but
skip `matchNote` while `isPlaying` is false. Learning mode's wait-for-input blocks the
clock while the session is still playing, so it is unaffected.
`GameScreen` keeps forwarding events so presses still sound.

## Required Regression Proof

- Deterministic unit/integration proof: `GameSession.test.ts` cases for a press
  before `play`, a press after `pause` near the next note, and the control press
  while playing; all three as in `scripts/audit/paused-input-probe.ts`.
- Electron proof: `scripts/audit/electron/paused-input.mjs` shows Score 0 after the
  count-in and pre-Space presses.
- Manual proof: none needed.
- Broader regression command: `npx vitest run src/lib/game`.

## Challenge Record

- Independent reproduction attempt: two routes agree, the engine probe with explicit
  timestamps and the real desktop app driven by key presses.
- Alternative explanations tested: (a) "the count-in starts the song clock early":
  disproved; the probe's case A never calls `play` and still scores, and in the app
  the overlay still shows "2" after the score. (b) "it is the pressed key's audio
  preview, not a judgement": the HUD combo moves to 1 and accuracy stays at 100 %.
  (c) "any press scores": the control press while playing, outside the window,
  changes nothing.
- Scope/severity changes: P3, because the gain is bounded by the hit window at the
  frozen time (one note per start or pause in the drill) and only raises the score.
- Deduplication decision: new; no earlier finding covers judging while stopped.
- Challenger conclusion and date: reproduced, 2026-10-20.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: `remediation/p11-s04-input`, slice 4, commit `418d6fe`; implemented 2026-11-02, awaiting independent review; not merged.
- What changed: `GameSession.ingestInputEvent` still records held-note and sustain state for every event, but judges a note-on only while `isPlaying` is true (new `judgePress`, which wraps `matchNote`). `GameScreen` is unchanged and keeps forwarding events, so a press before Space, during the count-in or while paused still sounds and lights the keyboard. Learning mode's wait-for-input holds the clock while the session is still playing, so it is unaffected. Stored results from before the fix are left as they are.
- Judging rule settled by this slice (slice 12 capstone accuracy depends on it): a press is judged only against a running song clock. While the transport is stopped (before Space, during the 3-2-1 count-in and lead-in, while paused) a press sounds, lights the keyboard and updates held-note and sustain state, but is never judged, so it cannot add score, combo or accuracy, and a pending note stays pending for the real press. While playing, a press is matched against the note within the hit window of the song clock; in a loop, a press up to one hit window before the loop end also answers a note at the start of the loop, at the wrapped time, with the same timing tiers.
- Tests (`GameSession.test.ts`, `input while the transport is stopped`): `does not judge a press before the song has started or during the count-in` failed before the fix (`expected 1 to be +0`, perfectCount) and `does not judge a press made while paused next to a note` failed before it (`expected 50 to be +0`, totalScore); both pass after. `keeps the pressed note active while stopped so the keyboard still lights`, `still judges the same note on time once the song runs` and `still judges a press while playing, and ignores one far from any note` pass before and after. The existing GameScreen test `requires confirmation before structural controls restart a judged run` relied on a pre-start press scoring, so it now starts the transport before pressing. Source identity for the reproduction: `1180731`.
- Driver result: `node --import tsx scripts/audit/paused-input-probe.ts`, run. Before the fix: case A scores 100 (1 Perfect) on a never-started session, case B scores 175 (Good added) 4 s into a pause, case C unchanged. After the fix: A stays 0 for both presses, B stays 100 (only the press made while playing), C unchanged at 100.
- Electron driver `paused-input.mjs`: not run, needs a rebuilt Electron and browser run outside this worktree. `scripts/audit/electron/*.mjs` launch `/media/storage/LumaKeys/out` (the harness hard-codes the main checkout), so they would not exercise this branch, and they need an Electron-ABI `better-sqlite3` (`LK_SQLITE_MODULE`) and a Playwright install. The lead runs the drivers named under Proof owed.
- Proof owed (agent-runnable, needs the lead): Electron `paused-input.mjs` shows Score 0 after the count-in and pre-Space presses. Human-only: none needed.
- Residual risk: a press made in the final hit window before a pause is judged only if it landed while playing; one made after the pause is not. Rhythm-clap drills still need the transport running for a clap to score.
- Revisit trigger: reviewer verification and the Electron proof above.
