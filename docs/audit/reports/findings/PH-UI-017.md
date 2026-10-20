# PH-UI-017: Settings Confirmation Dialog Drops Focus To The Page Body When It Closes

- Lane: UI/accessibility
- Severity: P3
- Confidence: high
- Status: reproduced
- Owner: remediation owner TBD
- Challenger: Claude Code (acting), keyboard and focus() trace
- Verifier: independent verifier recommended
- Affected runtime: both (renderer; web and headless Electron proven)
- Coverage rows: RT-008, WF-018, WF-021, WF-022, MOD-005
- Related/duplicate findings: PH-UI-001 and PH-UI-004 are verified for this dialog (containment and Escape hold); this is the third part of the Phase 5 modal oracle, "restore focus on close".
- First observed against: `main` at `6e549b6`

## User Impact

After Cancel or Escape closes "Clear learning progress?" or "Delete all user data?", keyboard focus is on `<body>`, not on the button that opened the dialog. The next Tab starts again from the top of the page, so a keyboard user must Tab back through the header, nav, and tab row to reach where they were. P3: recoverable, no data effect.

## Expected Behavior Or Oracle

- Phase 5 modal oracle: a modal must "restore focus on close".
- The component's own intent: `SettingsScreen.tsx` stores `previousActiveElement` and calls `previousActiveElement?.focus()` in the cleanup.
- Free Play, Soundboard, and Game overlays restore focus to the Menu button (measured in this lane).

## Evidence

### Environment

- Commit/patch identity: `6e549b6`; headless Chromium 141, Playwright 1.56.1, built web server, 1480x960.

### Reproduction

Driver: `scripts/audit/browser/confirm-dialog-focus-restore.mjs` (port 3793).

```text
Escape       open -> BUTTON "Cancel"; focus() calls while open: focus(Clear Learning Progress button), focus(Cancel)
Escape       closed -> focus: body | trigger still connected: true | trigger is activeElement: false | focus() on close: focus(BODY)
CancelButton open -> BUTTON "Cancel"; closed -> focus: body | trigger still connected: true | focus() on close: focus(BODY)
```

The same result was seen for "Delete User Data" in the matrix driver (`keyboard-focus-matrix.mjs`, part `dialogs`, "Escape -> ... focus=body").

### Artifacts

- `src/renderer/components/SettingsScreen.tsx:432-491`: the saved element is captured inside an effect whose dependencies are `[busy, onCancel]` (line 491). Each call site passes a new inline arrow for `onCancel` (lines 1863, 1875, 1887), so the effect re-runs on re-render and can capture the dialog's own Cancel button or the body instead of the trigger. The trace shows the closing cleanup focusing `BODY`.

## Root Cause

Probable, not isolated: the effect that records and restores the previously focused element is re-run on parent re-renders because its dependencies include an unstable callback, so the recorded element is not the trigger when the dialog finally unmounts. Next diagnostic: log the recorded `previousActiveElement` on every effect run.

## Recommended Remediation Boundary

Record the trigger once on mount (empty dependency list, callback through a ref, as `useModalFocusTrap` does) or reuse `useModalFocusTrap`. Owning module: `SettingsScreen.tsx` `ConfirmActionModal`.

## Required Regression Proof

- Deterministic unit/integration proof: after Cancel and after Escape, `document.activeElement` is the trigger button (extend "keeps keyboard focus inside confirmation dialogs").
- Electron proof: reproduced headless with `scripts/audit/electron/keyboard-walk.mjs` (agent item A4, 2026-10-20); after the fix the same driver must show the corrected behaviour.
- Web proof: re-run the driver.
- Data/recovery proof: none.
- Manual hardware/UI proof: none.
- Broader regression command: `npx vitest run src/renderer/components/SettingsScreen.test.tsx`.

## Challenge Record

- Independent reproduction attempt: two drivers, three dialogs (two confirmation dialogs plus the repeat). Reproduced in headless Electron 30.5.1 on 2026-10-20 (agent item A4, [Electron runtime report](../phase-11-electron-runtime-2026-10-20.md#agent-items-a1-to-a4)): Escape closed the Clear Learning Progress confirmation with focus on the page body while the trigger was still connected, and the next Tab landed on the top bar's "Main".
- Alternative explanations tested: trigger removed from the DOM (ruled out: `isConnected` true); focus restored then stolen (the trace shows only a `focus(BODY)` call on close).
- Scope/severity changes: held at P3.
- Deduplication decision: part of the same oracle as PH-UI-001 but a separate defect with its own root cause.
- Challenger conclusion and date: reproduced, Claude Code (acting), 2026-10-19.

## Resolution

- Accepted/rejected rationale: pending lead.
- Fix branch/commit/issue: none.
- Verification evidence: none yet.
- Residual risk: none.
- Revisit trigger, if accepted-risk: n/a.
