# PH-UI-004: Escape Exits Settings While Cancelling A Destructive Confirmation

- Lane: UI/accessibility
- Severity: P2
- Confidence: high
- Status: verified
- Owner: Codex (acting)
- Challenger: Codex, Chrome and Electron confirmation challenge
- Verifier: Claude Code (acting), sitting 3 run 2026-10-20
- Affected runtime: both
- Coverage rows: WF-018, WF-021, WF-022, WF-024, RT-008, MOD-002, MOD-005
- Related/duplicate findings: none
- First observed against: `808e6739e55b5186e8a9565f2c4e9267c4894a6c` plus the chartered audit patch identity

## User Impact

When a user opens `Delete User Data` and presses Escape, the confirmation closes
but the app also navigates from Settings to Main Menu. The user loses the current
settings context instead of receiving a local dialog cancel. No reset occurred in
the isolated probe, and the user can reopen Settings, so the defect is P2.

## Expected Behavior Or Oracle

The UI profile requires keyboard Escape and preservation or deliberate discard of
work in progress. Escape in a destructive confirmation should cancel that active
dialog only. A global back shortcut must honor an already-handled modal event.

## Evidence

### Environment

- Commit/patch identity: charter baseline above.
- OS/runtime/browser: Linux x86_64, Chrome 149 built web runtime and Electron
  30 production renderer under Xvfb.
- Data profile/fixture: isolated fresh profiles; no confirmation action was
  accepted and no user data was reset.

### Reproduction

1. Open Settings > Practice > Delete User Data.
2. Confirm the dialog title is `Delete all user data?` and that Cancel owns focus.
3. Press Escape once.

Both runtimes landed on Main Menu. The expected result is Settings with the
dialog dismissed and focus restored to `Delete User Data`.

### Artifacts

- The confirmation handler calls `preventDefault()` then `onCancel()` at
  `src/renderer/components/SettingsScreen.tsx:448` but does not stop the
  app-wide handler.
- The app-wide `Escape` handler navigates back from Settings at
  `src/renderer/App.tsx:1267` without checking `event.defaultPrevented`.
- The confirmation's focus trap otherwise works at
  `src/renderer/components/SettingsScreen.tsx:464`.
- Screenshot artifact before Escape:
  `/tmp/lumakeys-audit-p5-settings-escape-before.png`, SHA-256
  `635554b2fab12f9d4e9a9fc97ad51635c4940590b8e2a6621b2b75d2375c2407`.
- Full evidence: [Phase 5](../phase-5-ui-accessibility-performance-2026-07-12.md#p5-ui-004-confirmation-escape).

## Root Cause

The modal and app shell both subscribe to `window` keydown. The app-level handler
does not treat `defaultPrevented` as an ownership boundary, so it performs
contextual back navigation before or alongside the dialog cancel behavior.

## Recommended Remediation Boundary

Make global shortcut handling return when `event.defaultPrevented` is true, or
have the active modal stop propagation through a shared modal-keyboard utility.
Add a regression test for every destructive confirmation and for non-modal
Settings Escape navigation.

## Required Regression Proof

- Deterministic unit/integration proof: Escape closes the confirmation, restores
  the trigger, and leaves the Settings tab selected; outside a dialog, Escape
  retains the documented Back behavior.
- Electron proof: delete/reset confirmation behavior passes in a fresh profile.
- Web proof: same in Chrome, Edge, and Firefox.
- Data/recovery proof: Escape causes no reset bridge call, durable mutation, or
  save flush beyond the active settings state.
- Manual hardware/UI proof: keyboard-only user can cancel then continue editing
  the same Settings tab.
- Broader regression command: Settings/App tests, `npm test`, and both builds.

## Challenge Record

- Independent reproduction attempt: [PH-UI-004 challenge](../challenges/PH-UI-004.md).
- Alternative explanations tested: dialog focus/Tab behavior passes; the same
  Escape navigation occurs in web and Electron fresh profiles.
- Scope/severity changes: one global key-dispatch root cause covers progress and
  full-data confirmation dialogs.
- Deduplication decision: distinct from modal focus containment in PH-UI-001.
- Challenger conclusion and date: accepted as P2, 2026-07-12.

## Resolution

- Accepted/rejected rationale: a single Escape has the observable side effect of
  leaving Settings while cancelling the modal in both runtimes.
- Verified rationale: Escape closes each Settings confirmation and stays on Settings in Chromium, Electron, Edge and Firefox (sitting 3, below).
- Fix branch/commit/issue: `d5839aa`, Phase 9 slice 16 ([Phase 9 report](../phase-9-remediation-2026-07-30.md)). This file said "accepted" until the Phase 11 consolidation reconciled it with the ledger on 2026-10-20.
- Verification evidence: Phase 9 moved modal Escape handling to the capture phase, with a `defaultPrevented` guard in `App.tsx`. Phase 11: `SettingsScreen.test.tsx` "cancels confirmation dialogs with Escape" and `App.test.tsx` "lets free play own Escape" pass ([re-verification](../phase-11-reverification-2026-10-19.md)). Escape closes only the Settings confirmation and leaves Settings open in Chromium ([lane E](../phase-11-lane-e-ui-accessibility-2026-10-19.md)), on the web (WF-021, [lane F](../phase-11-lane-f-workflows-2026-10-19.md)) and in headless Electron (WF-021 and agent item A4 (e), [Electron report](../phase-11-electron-runtime-2026-10-20.md)).
  [Sitting 3](../phase-11-owner-sittings-2026-10-20.md#sitting-3-edge-and-firefox) item 3, 2026-10-20, run by the agent in Edge 155 and Firefox 142: Escape on the Clear Learning Progress and Delete User Data confirmations gives no open dialog, Settings still shown, and focus on the trigger. `sitting3-confirm-dialog-focus-restore.mjs` shows Escape and Cancel each close the dialog and focus the trigger in both browsers.
- Residual risk: three adjacent defects stay open. Escape in the latency calibration dialog also leaves Settings ([PH-UI-010](PH-UI-010.md)), now seen in Edge and Firefox too. The third Escape on the Soundboard exits it ([PH-UI-013](PH-UI-013.md)). After a confirmation closes, focus drops to the page body in Chrome and Electron, not in Edge or Firefox ([PH-UI-017](PH-UI-017.md)).
- Revisit trigger, if accepted-risk: not applicable.
