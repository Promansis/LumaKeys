# PH-SEC-004: One MuseScore conversion blocks every other import for up to 45 seconds

- Lane: SEC
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: web
- Coverage rows: OP-017, WF-025, MOD-013
- Related/duplicate findings: none
- First observed against: `main` at source identity `6e549b6`, Phase 11 baseline 2026-10-19

## User Impact

`convertMuseScoreToMidi` keeps a module-level `converting` boolean. While one
`.mscz` converts (bounded at 45 s by the timeout, plus `prlimit` CPU 30 s), every
other `.mscz` in the same or any other upload request fails with "Another MuseScore
score is being converted." A multi-file upload containing several `.mscz` files
therefore imports only the first and reports the rest as errors, because the
router converts files sequentially inside one request but the flag is global and
the rejection is immediate rather than queued. Anyone who can reach `/api/midi/upload`
can keep the converter busy by looping uploads. The README calls the deployment
single-user, so the practical impact is a confusing partial import and a self-inflicted
denial; severity is P3 on that basis and would be P2 for a shared deployment.

## Expected Behavior Or Oracle

Product expectation from WF-004 and WF-025: a batch upload imports every valid file or
reports a per-file reason that the user can act on. The code comment itself states
the intended fix ("use a job queue if multi-user imports are needed").

## Evidence

### Environment

- Commit/patch identity: source `6e549b6`
- OS/runtime/browser: static analysis; MuseScore binary not present outside Docker

### Reproduction

1. Read `src/server/museScore.ts`: `let converting = false;` at module scope; `if (converting) throw new Error('Another MuseScore score is being converted...')` before any work; reset in the inner `finally`.
2. Read `src/server/midiRouter.ts`: the upload loop awaits `convertMuseScoreToMidi` per file, so within one request the second `.mscz` only starts after the first finishes and would pass. The cross-request case (two browser tabs, or a retry while a long conversion runs) hits the rejection.
3. Runtime reproduction with two parallel uploads is staged for the owner in [user batch sitting 0](../phase-11-user-tests.md) item 3, because the converter runs only in the Docker image.

### Artifacts

- File/line or contract evidence: `src/server/museScore.ts` lines 11 to 24 and the `finally` block; `src/server/midiRouter.ts` upload loop.
- Test/command output summary: `museScore.test.ts` has no busy-flag case.

## Root Cause

Concurrency control is a global reject-if-busy flag instead of a queue, and the
rejection is surfaced as a per-file import error indistinguishable from a bad file.

## Recommended Remediation Boundary

Replace the flag with a one-slot promise queue (await the previous conversion, then
run) with a per-request cap, and add a unit test that two concurrent calls both
succeed in order. `museScore.ts` and `museScore.test.ts` only; the router's error
reporting already propagates messages.

## Required Regression Proof

- Deterministic unit/integration proof: two concurrent `convertMuseScoreToMidi` calls with a stubbed converter both resolve; a third beyond any cap fails with a queue-specific message.
- Web proof: two parallel `.mscz` uploads in Docker both import (sitting 0 item 3 after the fix).
- Broader regression command: `npx vitest run src/server`

## Challenge Record

- Independent reproduction attempt: source is deterministic; runtime confirmation pending owner.
- Alternative explanations tested: "sequential loop makes it a non-issue" rejected because the flag is process-wide across requests.
- Scope/severity changes: P3 per single-user README; revisit if multi-user.
- Challenger conclusion and date: reproduced (static), 2026-10-19
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3; deduplication: none; this is the only import-concurrency finding. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
