# PH-MUS-009: Theory quiz and interval trainer place the correct answer first or last more often than chance

- Lane: MUS
- Severity: P3
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), lane C, 2026-10-19
- Verifier: TBD
- Affected runtime: both; the size of the bias depends on the JavaScript engine (largest in the shipped Electron 30 runtime and in Node; smaller in current Chromium)
- Coverage rows: WF-012, WF-013
- Related/duplicate findings: none
- First observed against: `main` at source identity `4466626`, Phase 11 lane C. The shuffle dates from `b112c95` (2026-04-02) and is not part of the 0bd40f5..4466626 delta

## User Impact

Theory Trainer quizzes (note reading, intervals, scales, chords, mixed) and the
Interval Trainer score the player's knowledge and save the result to Progress. The
position of the correct answer carries information: in the desktop app a player who
always picks the first button is right 36 percent of the time instead of 25 percent,
and the first or last button holds the answer 67 percent of the time. On the hardest
interval level (6 choices) the first button is right 29 percent of the time instead of
17 percent. A guessing player gets inflated scores and a learner can pick up a
positional habit. Questions and answers are otherwise correct, nothing is lost, and
the effect is statistical, so this is a bounded issue with observable impact (P3).

## Expected Behavior Or Oracle

Assessment rule: in a multiple-choice question the position of the correct answer must
carry no information; each position should hold it with probability 1/n (n = number of
choices). `sort(() => Math.random() - 0.5)` is a known non-uniform shuffle because sort
algorithms assume a consistent comparator.

## Evidence

### Environment

- Commit/patch identity: `4466626`
- OS/runtime/browser: Linux. Node 24.15 (V8 13.6) for the real-code probes; Electron 30.5.1 (V8 12.4, the version in `node_modules/.bin/electron` that the desktop build ships) run as Node; headless Chromium 141 (V8 14.1) for the browser run
- Data profile/fixture: isolated data dir `$TMPDIR/p11/C/data-metro` for the browser run
- Hardware, if applicable: none

### Reproduction

1. Real-code probe: `$TMPDIR/p11/C/quiz/extract-quiz.mjs` extracts the question
   builders and `shuffle` from `TheoryQuizScreen.tsx` as text (no edits), and
   `quiz-position-probe.ts` generates 20,000 questions per quiz type and records where
   the correct answer lands. The interval trainer was probed the same way.
2. Observed correct-answer position (positions 1 to 4), 20,000 questions each:

   | Quiz | 1 | 2 | 3 | 4 | Chi-square (df 3) |
   |---|---|---|---|---|---|
   | Chord ID | 35.6% | 16.9% | 15.9% | 31.6% | 2432 |
   | Intervals | 35.5% | 17.1% | 15.9% | 31.5% | 2382 |
   | Scales | 35.8% | 17.0% | 15.6% | 31.6% | 2501 |
   | Note reading | 36.1% | 17.2% | 15.7% | 30.9% | 2449 |
   | Mixed | 35.9% | 17.0% | 15.7% | 31.4% | 2478 |
   | Interval Trainer easy (4 choices) | 35.9% | 17.6% | 15.6% | 31.0% | 2370 |

   Interval Trainer medium and hard (6 choices): 28.8/16.2/10.8/10.9/14.0/19.4 percent
   and 29.0/15.9/9.9/11.7/14.6/19.0 percent, against 16.7 percent each.
3. Engine check (`scripts/audit/shuffle-bias-probe.cjs`, run with `node` and with
   `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron`): the same shuffle on `[0, 1, 2, 3]`
   200,000 times puts element 0 (where
   every builder places the correct answer before shuffling) at positions
   36.0/17.2/15.7/31.2 percent under Electron 30.5.1 and 36.0/17.1/15.5/31.3 under
   Node 24. Under Chromium 141 it gives 28.2/28.1/25.0/18.8 percent.
4. Browser run (Chromium 141, built web app): 40 Chord ID quizzes answered by always
   clicking the first option scored 109 of 400 (27.3 percent), consistent with the
   Chromium matrix. The earlier lane F result of 5 of 10 is within chance under either
   engine (P(at least 5 of 10) is 0.08 at p = 0.25, 0.12 at p = 0.28, and 0.27 at p = 0.36),
   so it was not evidence on its own; the probes are.
5. Distractors: no question in any sample had a duplicated choice, a missing correct
   answer, or the answer twice; every quiz question had 4 choices.

### Artifacts

- File/line: `src/renderer/components/TheoryQuizScreen.tsx:82` and `src/renderer/components/IntervalTrainerScreen.tsx:28` (`return [...items].sort(() => Math.random() - 0.5)`); builders put the answer first before shuffling (`TheoryQuizScreen.tsx:100, 134, 158, 182`; `IntervalTrainerScreen.tsx:39`)
- Test/command output summary: `scripts/audit/shuffle-bias-probe.cjs` (engine check, reproducible); `$TMPDIR/p11/C/quiz-probe.out`, `$TMPDIR/p11/C/interval-probe.out`, `$TMPDIR/p11/C/electron-shuffle.out`, `$TMPDIR/p11/C/node-shuffle.out`, `$TMPDIR/p11/C/metronome-and-quiz.out` (parts A and C)
- Screenshot/video/trace path and hash: none
- Durable-state before/after comparison: not applicable

## Root Cause

Both screens shuffle with a random comparator passed to `Array.prototype.sort`, which
does not produce a uniform permutation; the bias pattern follows the engine's sort
implementation. Owning boundary: the `shuffle` helper duplicated in the two screens.

## Recommended Remediation Boundary

Replace both helpers with one Fisher-Yates shuffle (for example in `src/lib/theory/`)
and use it for choices and distractor selection.

## Required Regression Proof

- Deterministic unit/integration proof: shuffle test with an injected seeded random source asserting a known permutation, plus a statistical test (for example 20,000 shuffles of 4 items, each position within 1.5 percentage points of 25 percent)
- Electron proof: covered by the unit test (engine-independent once Fisher-Yates is used)
- Web proof: optional re-run of `metronome-and-quiz.mjs` part C
- Data/recovery proof: not applicable
- Manual hardware/UI proof: none
- Broader regression command: `npm run test`

## Challenge Record

- Independent reproduction attempt: three independent measurements (real builders in Node, raw shuffle in Electron and Chromium, and the UI run) agree with each other per engine.
- Alternative explanations tested: the extraction could differ from the product code (ruled out: it copies the source text of the builders and `shuffle` and imports the real theory tables); the earlier 5/10 was chance (confirmed: it does not prove bias by itself). Only 20 of the 40 browser quiz results were saved; the driver navigates away immediately after the last answer, which likely aborts the asynchronous save. This was not pursued as a product issue.
- Scope/severity changes: none
- Deduplication decision: no ledger entry, Phase 3 note, or other candidate covers choice order
- Challenger conclusion and date: reproduced, 2026-10-19
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge. Owner decision 15 (2026-11-02) puts slice 17 in wave 3.
- Fix branch/commit: `remediation/p11-s17-small`, commit `fc1fa7c`; implemented and independently reviewed 2026-11-02; merged to `main` in `750bb42`; `fixed`, not `verified`: no agent or owner proof is owed beyond review.
- What changed: new `src/lib/theory/shuffle.ts` exports `shuffle<T>(items, random = Math.random)`, a Fisher-Yates shuffle that returns a new array and never mutates its input. The local `sort(() => Math.random() - 0.5)` helpers in `src/renderer/components/TheoryQuizScreen.tsx` and `IntervalTrainerScreen.tsx` were removed and both import `shuffle`. No stored data changes.
- Tests (`src/lib/theory/shuffle.test.ts`, 5 tests): the scripted-permutation test and the 20,000-shuffle uniformity test (4 items, every item and position within 1.5 points of 25%, seeded) failed against the biased comparator (`expected [ 'd', 'c', 'b', 'a' ] to deeply equal [ 'b', 'c', 'd', 'a' ]`; `item 0 at position 0: 34.8%`) and pass after the fix. The permutation, no-mutation, empty/single-item and default-`Math.random` tests guard the helper. Source identity for the reproduction: the biased comparator of `cc40b63`.
- Driver result: `scripts/audit/shuffle-bias-probe.cjs` is a standalone copy of the old algorithm, so it cannot verify the fix; it still prints the old bias under Node 24.15 (element 0 lands at 36, 17.3, 15.6 and 31.1 percent). A probe that imports the fixed `shuffle.ts` (`node --import tsx`, 200,000 shuffles of 4) gave about 25.0% in every cell (24.9 to 25.2). Not run under Electron.
- Proof owed: agent-runnable, none. Human-only: none required.
- Main-build proof, 2026-11-02 (`c170bc3`): `metronome-and-quiz.mjs` with `FIXTURE=scripts/audit/fixtures/midi/metro-3-4-late-note.mid`: the always-first answer rate was 0.24 against 0.25 expected over 400 questions; exit 0 (only "Max polyphony exceeded" warnings).
- Residual risk: the quiz and trainer order is only as random as `Math.random`.
- Revisit trigger: reviewer verification.
