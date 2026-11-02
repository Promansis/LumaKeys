# PH-DATA-009: Lesson progress that fails to save is lost without a message

- Lane: DATA
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-20
- Verifier: TBD
- Affected runtime: both (shared renderer)
- Coverage rows: WF-011, DATA-016
- Related/duplicate findings: none
- First observed against: `main` at source identity `4466626`, Phase 11 lane F (FA run 2026-10-19; source trace 2026-10-20)

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

- Commit/patch identity: `4466626`, web bundle from `dist/`
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
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: `remediation/p11-s12-learning`, slice 12 (Learning Flow, with PH-MUS-013, PH-UI-018 and PH-DATA-009 on one branch), implemented 2026-11-02, awaiting independent review; not merged. The commit hash is in the slice hand-back, since a document cannot name its own commit.
- What changed: `updateLearningProgressState` in `src/renderer/App.tsx` no longer saves from inside a state updater. It computes the next progress from a ref outside any updater, sets state, and awaits `saveLearningProgress` through a serial chain so two quick changes write in order. If the write fails it logs, shows the same session-only message Settings uses ("Lesson progress is active for this session only. Save failed; try again.") and pushes an error toast "Lesson progress not saved". Callers use `void`, so a rejected write is no longer an unhandled rejection. The Strict Mode double-run of an updater can no longer save twice.
- Tests: `src/renderer/App.test.tsx` `lesson drill result > tells the player when progress could not be saved, without an unhandled rejection` failed before (no "Lesson progress not saved" text) and passes after; it also asserts the session-only banner and that no `unhandledRejection` fires. Source identity for the reproduction: product code equal to `ccc68c2`.
- Driver result: `scripts/audit/electron/lesson-pass.mjs` (desktop, `$TMPDIR` profile, one launch at a time) and `scripts/audit/browser/lesson-progression.mjs` (web, `$TMPDIR` data dir, port 3781) were updated and run against this branch through the new `LUMAKEYS_REPO` override (default unchanged). Web: with `setSetting` forced to return 500, Complete Tip showed the "Startup Defaults Active / Lesson progress is active for this session only" banner and the "Lesson progress not saved" error toast, the step stayed IN PROGRESS for the session, and a reload showed the lesson unchanged.
- Proof owed: agent-runnable: none. Human-only: none.
- Residual risk: the session-only banner reuses the "Startup Defaults Active" label that already exists for settings failures. `handleDeveloperUnlockAll` keeps its own save path unchanged. A failed write is not retried automatically; the next successful change writes the full state.
- Revisit trigger: reviewer verification; if a retry or a persistent save indicator is wanted.
