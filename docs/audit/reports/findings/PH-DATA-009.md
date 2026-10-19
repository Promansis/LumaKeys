# PH-DATA-009: Lesson progress that fails to save is lost without a message

- Lane: DATA
- Severity: P3
- Confidence: high
- Status: reproduced
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-20
- Verifier: TBD
- Affected runtime: both (shared renderer)
- Coverage rows: WF-011, DATA-016
- Related/duplicate findings: none
- First observed against: `main` at source identity `6e549b6`, Phase 11 lane F (FA run 2026-10-19; source trace 2026-10-20)

## User Impact

If the settings store cannot be written (web server error, disk full, desktop file
locked), completing a lesson step looks normal and the lesson advances. On the next
launch the step is not complete. Settings and keyboard mapping in the same situation
show "Save failed" and an error toast; lesson progress shows nothing, and the
rejection surfaces only as an uncaught page error. Severity P3: needs a storage
failure, and the learner can redo the step.

## Expected Behavior Or Oracle

`CONTEXT.md` quality priority 1, no user-data loss; and the app's own pattern for
other durable writes (settings, keyboard mapping), which tells the user the change is
for this session only.

## Evidence

### Environment

- Commit/patch identity: `6e549b6`, web bundle from `dist/`
- OS/runtime/browser: Linux, headless Chromium 141; `POST /api/bridge/setSetting` answered with HTTP 500 `{"error":"disk full (audit)"}` through `page.route`

### Reproduction

1. Open lesson 3; route `setSetting` to fail; click **Complete Tip**.
2. Observed: no toast and no alert; console shows four HTTP 500s and `[pageerror] disk full (audit)`.
3. Remove the route and reload: lesson 3 reads "0 / …" steps.

### Artifacts

- `src/renderer/App.tsx:1033-1039`: `void saveLearningProgress(...)` inside the state updater; the promise is never handled.
- `src/lib/learning/learningProgress.ts:61-73`: four `setSetting` writes in `Promise.all`.
- Output: `$TMPDIR/p11/FA/lesson.out` sha256 `5dce8870…17de3e73`.

## Root Cause

The learning-progress write path skips the save-result handling that the other
settings writers use.

## Recommended Remediation Boundary

Move the save out of the state updater, await it, and on failure show the same
session-only message and toast that settings use.

## Required Regression Proof

- Deterministic unit/integration proof: App test with a rejecting `setSetting`; completing a step shows the error toast and logs no unhandled rejection.
- Web proof: rerun the FA save-failure case.

## Challenge Record

- Independent reproduction attempt: source trace matches the runtime trail (unhandled rejection, no toast).
- Alternative explanations tested: the step was never marked (no: it advanced in-session; only the write failed).
- Scope/severity changes: none.
- Deduplication decision: new.
- Challenger conclusion and date: reproduced, 2026-10-20

## Resolution

- Accepted/rejected rationale: pending consolidation
- Fix branch/commit/issue:
- Verification evidence:
- Residual risk:
- Revisit trigger, if accepted-risk:
