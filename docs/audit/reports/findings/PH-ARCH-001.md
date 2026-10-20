# PH-ARCH-001: Practice-Session Prerequisite Failures Leave The Session Loading

- Lane: architecture
- Severity: P2
- Confidence: high
- Status: fixed
- Owner: Codex (acting)
- Challenger: Codex, isolated renderer failure challenge
- Verifier: Claude Code (acting), Phase 11 re-verification and runtime lanes
- Affected runtime: both
- Coverage rows: WF-008, WF-009, BR-015, BR-032, BR-053, MOD-003
- Related/duplicate findings: none
- First observed against: `808e6739e55b5186e8a9565f2c4e9267c4894a6c` plus the chartered audit patch identity

## User Impact

When settings, baseline stats, or saved fingerings fail to load while opening a
practice session, the session never mounts and keeps its loading status. The
status is only visible after the user opens the Escape menu, and the rejected
promise is unhandled. The user can leave the session, so this is a recoverable
P2 workflow failure rather than data loss, but it blocks practice without an
actionable error or retry state.

## Expected Behavior Or Oracle

`CONTEXT.md` defines a practice session as a configured gameplay run, and the
audit charter prioritizes recoverable errors. A bridge failure needed to
configure that run must settle in a visible error/retry or back state. The
existing MIDI-byte load path already follows this rule by reporting
`Unable to load song: ...`.

## Evidence

### Environment

- Commit/patch identity: charter baseline above.
- OS/runtime/browser: Linux x86_64, Node 24, Vitest 2.1.9 with jsdom; the
  failing code is shared renderer logic used by both host adapters.
- Data profile/fixture: disposable lesson-drill fixture with no user database,
  MIDI storage, or hardware.

### Reproduction

1. Mount the production GameScreen with a valid lesson-drill source and its
   normal dependency interfaces.
2. Reject `window.appBridge.getSetting(...)` with `storage unavailable`.
3. Open the session overlay with Escape and inspect its Status card.
4. Observe `Loading song from the library.` instead of the expected
   `Unable to load song: storage unavailable`.

The controlled assertion for the expected error failed after 1.08 seconds, and
Vitest reported the rejected promise as unhandled. It was reproduced once with
an isolated harness; the temporary harness was removed after its result was
recorded.

### Artifacts

- Prerequisite reads precede the local error boundary:
  `src/renderer/components/GameScreen.tsx:624` through `:636`.
- The only loading error handler starts later at
  `src/renderer/components/GameScreen.tsx:661` and only wraps MIDI/session
  mounting work.
- The async loader is intentionally detached at
  `src/renderer/components/GameScreen.tsx:676`.
- The initial status is `Loading song from the library.` at line 394 and is
  rendered only in the Escape-controlled session overlay at lines 1375 and
  1444 through 1447.
- Full disposable-fixture result:
  [Phase 6 evidence](../../evidence/phase-6-probes-2026-07-12.md#game-preflight-failure).

## Root Cause

GameScreen owns both bridge preflight and session mounting, but its failure seam
begins after preflight. The caller must therefore know that some bridge calls
are recoverable and some can escape as an unhandled rejection; the module does
not provide one practice-loading outcome with locality for state, error, and
retry behavior.

## Recommended Remediation Boundary

Concentrate practice-session preflight and mounting behind one renderer-owned
operation that returns a visible loading success or failure state. It should
cover prerequisite reads and later MIDI/session work together, retain a back or
retry action, and avoid optimistic persistence messages for failed mutations.
Add failure tests before changing the existing music-rule owners.

## Required Regression Proof

- Deterministic unit/integration proof: rejected `getSetting`, `getUserStats`,
  and `getCustomFingerings` each show a recoverable session error; a rejected
  `loadMidiFileData` retains its current error behavior.
- Electron proof: a disposable profile with a forced bridge preflight failure
  displays the same recovery state.
- Web proof: a forced RPC failure displays the same state in Chrome, Edge, and
  Firefox.
- Data/recovery proof: failed preflight creates no game result, fingering,
  track-assignment, or practice-time mutation.
- Manual hardware/UI proof: the error can be read and exited with keyboard only.
- Broader regression command: GameScreen tests, `npm test`, and both builds.

## Challenge Record

- Independent reproduction attempt:
  [PH-ARCH-001 challenge](../challenges/PH-ARCH-001.md).
- Alternative explanations tested: the fixture has no durable-data dependency,
  the current suite/builds pass, and the failure is in shared renderer logic.
- Scope/severity changes: narrowed to session prerequisite reads; it does not
  replace PH-MUS-001/003/004 or PH-UI-001.
- Deduplication decision: distinct asynchronous failure/recovery root cause.
- Challenger conclusion and date: accepted as P2, 2026-07-12.

## Resolution

- Accepted/rejected rationale: a controlled bridge rejection leaves a core
  practice flow stuck and reports an unhandled error.
- Fix branch/commit/issue: `d5839aa`, Phase 9 slice 17 ([Phase 9 report](../phase-9-remediation-2026-07-30.md)). This file said "accepted" until the Phase 11 consolidation reconciled it with the ledger on 2026-10-20.
- Verification evidence: Phase 9 moved the GameScreen load into one try block with a Retry and Back panel. Phase 11: an injected failure of each prerequisite (`getUserStats`, `getCustomFingerings`, `getSetting`) shows the panel with Retry and Main Menu, on the web (HTTP 500) and in a real Electron renderer (IPC rejection) ([lane D](../phase-11-lane-d-runtime-parity-2026-10-19.md)).
  [Sitting 3](../phase-11-owner-sittings-2026-10-20.md#sitting-3-edge-and-firefox) item 1, 2026-10-20, run by the agent: an uploaded song (`pmus-16`) loads and its canvas animates in Edge 155 and Firefox 142 (15 of 24 sampled frames distinct). No bridge failure was forced in that run, so it shows the normal load path only, not the recovery panel.
- Residual risk: the automated GameScreen test that Phase 9 named is not in the suite (slice 0: `getSong` rejects, then Retry and Back; a proof gap named in the [re-verification](../phase-11-reverification-2026-10-19.md)), so a regression would show only in a runtime run. The recovery panel has been seen on the web only in Chromium; a forced RPC failure in Edge and Firefox is still owed.
- Revisit trigger, if accepted-risk: not applicable.
