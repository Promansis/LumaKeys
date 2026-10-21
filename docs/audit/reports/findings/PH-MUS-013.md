# PH-MUS-013: Capstone accuracy in wait-for-input mode rewards waiting and penalises anticipation, so the tier gate does not measure timing

- Lane: MUS
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-20
- Verifier: TBD
- Affected runtime: both (shared `GameSession`, `ScoringEngine` and curriculum); reproduced in a deterministic engine probe and consistent with the Electron capstone run
- Coverage rows: WF-011, MOD-011
- Related/duplicate findings: PH-MUS-012 (a press before the count-in ends also scores the first note)
- First observed against: `main` at source identity `4466626`, Phase 11 Electron runtime run, 2026-10-20

## User Impact

Each curriculum tier unlocks the next only when its capstone reaches an accuracy
threshold ("Reach 85% accuracy to unlock the Beginner tier"). Capstones run in
learning mode, where the song stops at each note until it is played. A press
after the note has arrived is judged at zero offset, so it is always Perfect, and
wrong keys cost nothing. A player who waits for every note, however long, and hits
wrong keys on the way, scores 100 %. A player who plays ahead of the line, as a
player keeping rhythm tends to, is graded Good or OK on every note and can fail:
40 ms early on every note gives 75.4 %, below the 85 % gate. The gate therefore
passes everyone who finishes by waiting and can only fail people who anticipate,
which is the opposite of what an accuracy threshold suggests. Severity P3: the
curriculum still works and nothing is lost, but the progression signal is
misleading; P2 is arguable because it is the curriculum's only skill gate.

## Expected Behavior Or Oracle

- The capstone copy (`src/lib/learning/curriculum.ts:135-141` and the three later
  tiers): an accuracy threshold is the unlock condition, which implies accuracy
  reflects how well the passage was played.
- `CONTEXT.md:56` lists "curriculum capstones, and learning progression" among the
  core workflows the practice engine must keep correct.
- Scoring tiers are symmetric around the note (`ScoringEngine.judgeTiming`,
  `src/lib/game/ScoringEngine.ts:31-43`), so a scoring model that cannot see lateness
  but does see earliness is asymmetric by accident, not by design.

## Evidence

### Environment

- Commit/patch identity: working tree at `4466626` plus audit-only files.
- OS/runtime: Linux, Node 22 with `tsx`; Electron 30.5.1 headless harness for the
  real-app run.
- Fixture: `public/curriculum-midis/ode-to-joy.mid`, filtered to the right hand
  (62 notes), learning mode, wait-for-input, 90 % tempo, 100 ms window, exactly as
  `App.startCapstone` (`src/renderer/App.tsx:1098-1118`) and `GameScreen` build it.

### Reproduction

1. `node --import tsx scripts/audit/capstone-accuracy-probe.ts`, explicit timestamps,
   snapshot polled every millisecond like the render loop:
   - L1, every note on time: 100 % (62 Perfect).
   - L2, every note 2 s after it reaches the line, three wrong keys before each:
     100 % (62 Perfect), 183.7 s for a 59.3 s passage.
   - L3, every note 40 ms early: 75.4 % (1 Perfect, 61 Good), below the 85 % gate.
   - L4, every note 80 ms early: 50.8 % (1 Perfect, 61 OK).
   - P1 (control), the same 2 s-late presses in Play mode: 0.8 % (61 misses), so
     the same engine does measure lateness when the clock keeps moving.
   The single Perfect in L3 and L4 is the first note at 0 s, which cannot be pressed
   early once the song is playing.
2. Desktop app (`scripts/audit/electron/lesson-pass.mjs`, two runs): the driver
   retried presses that did not register (3 and 4 extra presses) and the stored
   result was `capstoneResults {"novice":100}` both times, consistent with L2.
3. Repeat count: probe twice, byte-identical output.

### Artifacts

- File/line: `src/lib/game/GameSession.ts:143-170` (`getCurrentTimeSec` clamps to the
  blocking note) and `:447-465` (`getBlockingTimeSec`); `:326-345` (`matchNote`, no
  penalty for an unmatched press); `src/lib/game/ScoringEngine.ts:31-43, 81`
  (symmetric tiers, accuracy over judged notes only); `src/renderer/App.tsx:132`
  (learning mode forces `waitForInput`); `src/lib/learning/learningProgress.ts:122-170`
  (gate check).
- Command: `node --import tsx scripts/audit/capstone-accuracy-probe.ts` (output
  `capstone-probe.1.out` and `.2.out`, sha256 `3250f768…469166c5`). See
  [the Electron runtime report](../phase-11-electron-runtime-2026-10-20.md).
- Durable-state before/after: real-app run stored `capstoneResults {"novice":100}`.

## Root Cause

Learning mode stops the clock at the next pending note, so after the note arrives
`eventSongTime` equals the note time and the timing delta is zero. Early presses
are still judged with their real delta. Unmatched presses are dropped without
penalty in every mode. Accuracy is the mean of judged notes only, so it measures
only how early the player was.

## Recommended Remediation Boundary

Decide what the capstone gate should measure; this is a product decision for the
owner. Options, in `GameSession` and the curriculum, not in the UI:

1. Run capstones in Play mode at the capstone tempo, so lateness counts.
2. Keep wait mode but judge against wall-clock lateness: record when the clock
   blocked and grade the press by how long the player took.
3. Count wrong-key presses (extra `noteon`s that match nothing) as a separate
   accuracy term for capstones.

Whichever is chosen, early and late presses should be graded symmetrically.

Owner decision, 2026-10-20: option 1. Capstones run in Play mode, so the song keeps
moving and does not wait for each note. They still use the capstone's tempo (90 % for
the novice tier). `App.startCapstone` (`src/renderer/App.tsx:1098-1118`) builds the
session with `buildSessionConfig('luma-keys', …)` and `waitForInput: false`, keeping
the capstone's `tempoMultiplier` and `handFilter`.

The fix must also stop the player from undoing that mid-run. A capstone uses the
normal game overlay, and the overlay's session toolbar can switch the mode back to
Learning, change the hand or set a loop (`GameScreen.tsx:220-224, 229-245, 250-256, 299`). Its tempo
control can change the tempo live (`:966-985`, `:1426`).
`onLessonDrillFinished` then stores the accuracy whatever the final setup was
(`App.tsx:1747-1752`). This was found by reading the code and was not run. Either
hide those controls when the source is a capstone, or store the result only when the
finished run still used the capstone's mode, tempo, hand and full range.

## Required Regression Proof

- Deterministic unit/integration proof: rerun `scripts/audit/capstone-accuracy-probe.ts`
  against the new capstone config. On-time presses (L1) must still pass. Presses 2 s
  late (L2) must fall below the gate, as the Play-mode control P1 does today (0.8 %).
  Add an `App` or curriculum test showing that `startCapstone` builds a Play-mode
  config with `waitForInput: false`, and that a run whose mode, tempo, hand or range
  was changed is not stored.
- Electron proof: `scripts/audit/electron/lesson-pass.mjs`, with presses timed against
  the moving clock instead of waiting for each note, still stores a passing result
  and unlocks the next tier.
- Manual proof: the owner plays the novice capstone once after the fix (sitting 1).
- Broader regression command: `npx vitest run src/lib/game src/lib/learning`.

## Challenge Record

- Independent reproduction attempt: the engine probe and the real desktop capstone
  agree (100 % with extra presses).
- Alternative explanations tested: (a) "the probe's late presses happen after the
  clock resumes": no, L2 takes 183.7 s of wall time for a 59.3 s passage, so the
  clock stood at each note for 2 s. (b) "the engine cannot judge lateness at all":
  disproved by the Play-mode control P1. (c) "early presses outside the window are
  penalised": no, they match nothing and the player can press again once the note
  arrives; L3 and L4 stay inside the window on purpose.
- Scope/severity changes: lane C recorded the late-press-is-Perfect mechanic for
  WF-009 as expected wait-mode behaviour; this finding is about its effect on the
  capstone gate, which no earlier lane traced.
- Deduplication decision: new; related to PH-MUS-012 only in that both let a score
  include notes not played in time.
- Challenger conclusion and date: reproduced, 2026-10-20.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted for fixing; the owner chose option 1 (Play-mode capstones) on 2026-10-20
- Fix branch/commit/issue:
- Verification evidence:
- Residual risk:
- Revisit trigger, if accepted-risk:
