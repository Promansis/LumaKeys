# PH-ARCH-002: Keyboard Mapping Reports Success Before Its Durable Write Settles

- Lane: architecture
- Severity: P2
- Confidence: high
- Status: fixed
- Owner: Codex (acting)
- Challenger: Codex, isolated renderer failure challenge
- Verifier: Claude Code (acting), Phase 11 re-verification and runtime lanes
- Affected runtime: both
- Coverage rows: WF-003, WF-018, BR-054, MOD-002, MOD-005
- Related/duplicate findings: none
- First observed against: `808e6739e55b5186e8a9565f2c4e9267c4894a6c` plus the chartered audit patch identity

## User Impact

When persistence rejects a keyboard mapping update, the new mapping is active
for the current process but Keyboard Setup reports it as completed. The next
load reads the stored mapping, so the user can lose the configuration on restart
without ever being told to retry. This is a recoverable P2 configuration failure
that affects users who rely on computer-keyboard input.

## Expected Behavior Or Oracle

Settings that are read from the typed AppBridge at startup must distinguish a
durable save from a session-only change. SettingsScreen already tells users that
a failed write is active for the session only. Keyboard Setup needs equivalent
truthful feedback for its persisted mapping.

## Evidence

### Environment

- Commit/patch identity: charter baseline above.
- OS/runtime/browser: Linux x86_64, Node 24, Vitest 2.1.9 with jsdom; the
  relevant renderer code is shared by Electron and web.
- Data profile/fixture: disposable in-memory computer-keyboard input adapter;
  no user database or device.

### Reproduction

1. Mount production KeyboardSetupScreen with the default mapping.
2. Make `window.appBridge.setSetting(...)` reject with `write failed`.
3. Select `Bind C3 to Z`, then press KeyA.
4. Observe that C3 changes to A and the status says `C3 set to A.`.
5. Observe that no persistence-failure message is shown.

The controlled assertion for a save-error message failed after 1.14 seconds.
The temporary harness was removed after the evidence was recorded.

### Artifacts

- Keyboard Setup updates the live service before starting the write at
  `src/renderer/components/KeyboardSetupScreen.tsx:112` through `:118`, then
  reports success at line 120.
- Clear/reset follow the same fire-and-forget pattern at lines 189 through 209.
- A subsequent mount treats bridge storage as the source of truth at lines 73
  through 85.
- SettingsScreen has a visible `setSetting` failure path at
  `src/renderer/components/SettingsScreen.tsx:819` through `:850`, while its
  unmount flush also bypasses that policy at lines 626 through 638.
- Other renderer-owned writes are likewise detached in App, GameScreen, and
  FreePlayScreen; they are remediation-scope evidence rather than separately
  reproduced symptoms.
- Full disposable-fixture result:
  [Phase 6 evidence](../../evidence/phase-6-probes-2026-07-12.md#keyboard-mapping-write-failure).

## Root Cause

The renderer has no single settings-write owner. SettingsScreen implements one
success/failure policy, while KeyboardSetupScreen and several app-owned callers
write through AppBridge directly. That shallow spread makes a caller responsible
for storage error semantics and loses locality for session state, durability, and
user feedback.

## Recommended Remediation Boundary

Create one renderer-owned setting-persistence operation that reports whether the
value is durable or session-only, then route Keyboard Setup and the other direct
writers through it. Preserve immediate input responsiveness, but surface a retry
or non-persisted status whenever a write rejects. Do not alter database semantics
as part of this slice.

## Required Regression Proof

- Deterministic unit/integration proof: rejected keyboard bind, clear, reset,
  input-mode, and representative Game/Free Play setting writes show truthful
  feedback and do not create an unhandled rejection.
- Electron proof: force a setting-write failure in a disposable profile and
  verify the mapping is not reported durable.
- Web proof: force a failing settings RPC and verify the same outcome.
- Data/recovery proof: restart/read-back proves either the saved mapping or an
  explicit session-only state.
- Manual hardware/UI proof: keyboard-only remapping remains usable while an
  error/retry message is visible.
- Broader regression command: KeyboardSetupScreen, SettingsScreen, App,
  GameScreen, and FreePlayScreen tests; `npm test`; both builds.

## Challenge Record

- Independent reproduction attempt:
  [PH-ARCH-002 challenge](../challenges/PH-ARCH-002.md).
- Alternative explanations tested: the mapping is read from storage on mount,
  so it is not intentionally session-only; SettingsScreen provides a contrasting
  managed failure path.
- Scope/severity changes: observed keyboard mapping behavior is accepted; other
  detached settings writes are a shared remediation boundary pending their own
  regression cases.
- Deduplication decision: distinct from cross-store atomicity in PH-DATA-001.
- Challenger conclusion and date: accepted as P2, 2026-07-12.

## Resolution

- Accepted/rejected rationale: a rejected write is presented as a successful
  durable configuration change.
- Fix branch/commit/issue: `d5839aa`, Phase 9 slice 18 ([Phase 9 report](../phase-9-remediation-2026-07-30.md)). This file said "accepted" until the Phase 11 consolidation reconciled it with the ledger on 2026-10-20.
- Verification evidence: Phase 9 added a shared `saveSetting` that returns `{ saved }`, and every renderer setting writer awaits and catches it. Phase 11: `saveSetting.test.ts`, the `KeyboardSetupScreen.test.tsx` rejected-binding read-back and the GameScreen session-only fingering test pass ([re-verification](../phase-11-reverification-2026-10-19.md)). A failed save says "Save failed. The change is active for this session only.", and saved settings read back after a server restart on the web (WF-018, [lane F](../phase-11-lane-f-setup-settings-2026-10-19.md)) and after a relaunch on the desktop (WF-003 and WF-018, [Electron report](../phase-11-electron-runtime-2026-10-20.md)).
- Residual risk: none known for this fix. The key-unbind defect in the same settings code is a separate finding, [PH-DATA-008](PH-DATA-008.md).
- Revisit trigger, if accepted-risk: not applicable.
