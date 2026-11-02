# PH-UI-018: A lesson drill that falls short returns to the lesson with no score and no target

- Lane: UI
- Severity: P3
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-20
- Verifier: TBD
- Affected runtime: both (shared renderer)
- Coverage rows: WF-011
- Related/duplicate findings: PH-MUS-005 (a common reason a computer-keyboard drill scores nothing)
- First observed against: `main` at source identity `4466626`, Phase 11 lane F (FA run 2026-10-19; source trace 2026-10-20)

## User Impact

A learner plays a lesson drill. When it ends below the step's pass mark (70% for most
steps), the app goes straight back to the lesson. The step still reads "IN PROGRESS"
with "Complete the activity to unlock the next step." There is no accuracy, no pass
mark, and no "try again" message, so the learner cannot tell whether they nearly
passed, missed every note, or hit a bug. In the FA run even the auditor could not
tell whether a 71-press attempt had failed on accuracy or on something else.
Severity P3: the learner can retry; the cost is confusion and lost trust.

## Expected Behavior Or Oracle

Song runs end on a Results screen with accuracy. A drill that gates progress should
at least report the accuracy reached and the accuracy needed.

## Evidence

### Environment

- Commit/patch identity: `4466626`, web bundle from `dist/`
- OS/runtime/browser: Linux, headless Chromium 141 (`scripts/audit/browser/lesson-progression.mjs`)

### Reproduction

1. Lesson 1, step 3 "Tap middle C in steady quarter notes", Start Drill, Space, C4 pressed 71 times over 9.8 s: back on the lesson, counter still "2 / 3 STEPS", step "IN PROGRESS", no message.
2. Lesson 2 drill with no input: back on the lesson, "IN PROGRESS", "Complete the activity to unlock the next step.", no accuracy or failure text anywhere on the page.

### Artifacts

- `src/renderer/App.tsx:1053-1071` `handleLearningSessionResult`: compares accuracy with `passAccuracy` and navigates back; the accuracy is not passed on.
- `src/renderer/components/LessonScreen.tsx`: no reference to `passAccuracy` or a last attempt.
- Output: `$TMPDIR/p11/FA/lesson.out` sha256 `5dce8870…17de3e73`; screenshot `$TMPDIR/p11/FA/lesson-after-failed-drill.png`.

## Root Cause

The drill result is consumed for the pass decision and then dropped; the lesson
screen has no slot for it.

## Recommended Remediation Boundary

Carry the last attempt's accuracy into the `lesson` screen state and show it with the
step's pass mark ("72% of 80% needed. Try again.").

## Required Regression Proof

- Deterministic unit/integration proof: App test that finishes a drill at 50% and expects the lesson to show 50% and the target.
- Web proof: rerun the FA failed-drill case.
- Manual hardware/UI proof: none beyond the sitting 1 lesson pass.

## Challenge Record

- Independent reproduction attempt: two drills, one with input and one without.
- Alternative explanations tested: a result panel shown briefly before navigation (no: `handleLearningSessionResult` navigates directly).
- Scope/severity changes: whether a correctly played drill is credited was not separated from this run; source shows it is (`markLessonStepCompleted` when `accuracy >= passAccuracy`).
- Deduplication decision: new.
- Challenger conclusion and date: reproduced, 2026-10-20
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: `remediation/p11-s12-learning`, slice 12 (Learning Flow, with PH-MUS-013, PH-UI-018 and PH-DATA-009 on one branch), implemented and independently reviewed 2026-11-02; merged to `main` in `571571b`; `fixed`, not `verified`: the Electron learning driver run (lead) and owner sitting 1 capstone on a real MIDI keyboard are owed. The commit hash is in the slice hand-back, since a document cannot name its own commit.
- What changed: the `lesson` screen state carries `lastAttempt` (`stepIndex`, `accuracy`, `target`). `handleLearningSessionResult` sets it when a drill misses its pass mark, with the accuracy rounded down so a near miss never reads as a pass, and `LessonScreen` shows "<accuracy>% of <target>% needed. Try again." on that step only (not on tips, and not on another step). A passing drill sets nothing.
- Tests: `src/renderer/App.test.tsx` `lesson drill result > shows the accuracy and the target after a drill that missed its pass mark` failed before (no `lesson-last-attempt` element) and passes after; `shows no failed-attempt message after a drill that passed` passes before and after (guard). `src/renderer/components/LessonScreen.test.tsx` `shows the accuracy and the pass mark on the step that missed it` failed before (text not found, prop did not exist) and passes after; `shows nothing when the attempt belongs to another step or there was none` is the guard. Source identity for the reproduction: product code equal to `ccc68c2`.
- Driver result: `scripts/audit/electron/lesson-pass.mjs` (desktop, `$TMPDIR` profile, one launch at a time) and `scripts/audit/browser/lesson-progression.mjs` (web, `$TMPDIR` data dir, port 3781) were updated and run against this branch through the new `LUMAKEYS_REPO` override (default unchanged). Web: a failed lesson 2 drill with no input returned to the lesson showing "0% of 70% needed. Try again." with the step still IN PROGRESS; a drill spam run that scored 68% showed "68% of 70% needed. Try again." Desktop: the passing drill showed no failed-attempt message.
- Proof owed: agent-runnable: none. Human-only: the wording and placement on the lesson screen at the owner's sitting.
- Residual risk: the message clears when the player leaves the lesson screen; it is not stored. Only the latest attempt is shown.
- Revisit trigger: reviewer verification; if players want an attempt history.
