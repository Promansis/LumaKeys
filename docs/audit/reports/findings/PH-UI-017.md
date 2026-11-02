# PH-UI-017: Settings Confirmation Dialog Drops Focus To The Page Body When It Closes

- Lane: UI/accessibility
- Severity: P3
- Confidence: high in Chrome and Electron; it did not reproduce in Edge 155 or Firefox 142
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), keyboard and focus() trace
- Verifier: independent verifier recommended
- Affected runtime: both (renderer); reproduced in headless Chromium 141, real Chrome 151 and headless Electron 30.5.1; not reproduced in Edge 155 or Firefox 142 (sitting 3, 2026-10-20)
- Coverage rows: RT-008, WF-018, WF-021, WF-022, MOD-005
- Related/duplicate findings: PH-UI-001 and PH-UI-004 are verified for this dialog (containment and Escape hold); this is the third part of the Phase 5 modal oracle, "restore focus on close".
- First observed against: `main` at `4466626`

## User Impact

In Chrome and Electron, after Cancel or Escape closes "Clear learning progress?" or "Delete all user data?", keyboard focus is on `<body>`, not on the button that opened the dialog. The next Tab starts again from the top of the page, so a keyboard user must Tab back through the header, nav, and tab row to reach where they were. P3: recoverable, no data effect.

## Expected Behavior Or Oracle

- Phase 5 modal oracle: a modal must "restore focus on close".
- The component's own intent: `SettingsScreen.tsx` stores `previousActiveElement` and calls `previousActiveElement?.focus()` in the cleanup.
- Free Play, Soundboard, and Game overlays restore focus to the Menu button (measured in this lane).

## Evidence

### Environment

- Commit/patch identity: `4466626`; headless Chromium 141, Playwright 1.56.1, built web server, 1480x960.

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

Sitting 3 supports this. In Chrome 151 the open trace shows `focus(Clear Learning Progress)` before `focus(Cancel)`, which fits a cleanup run while the dialog is open. The triggers are disabled while a dialog is open (`disabled={... || resetTarget !== null}`, `SettingsScreen.tsx` lines 1808 and 1825), so that cleanup cannot refocus the trigger, and the re-run then records the body. Edge 155, also Chromium, showed only `focus(Cancel)` and restored the trigger, which points to a timing race rather than an engine difference.

## Recommended Remediation Boundary

Record the trigger once on mount (empty dependency list, callback through a ref, as `useModalFocusTrap` does) or reuse `useModalFocusTrap`. Owning module: `SettingsScreen.tsx` `ConfirmActionModal`.

## Required Regression Proof

- Deterministic unit/integration proof: after Cancel and after Escape, `document.activeElement` is the trigger button (extend "keeps keyboard focus inside confirmation dialogs"). The test must force a parent re-render while the dialog is open, so the result does not depend on timing.
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
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.
- Owner sitting run by the agent, 2026-10-20 ([sitting 3](../phase-11-owner-sittings-2026-10-20.md#sitting-3-edge-and-firefox) item 3(e)): reproduced in real Chrome 151. The close trace is `focus(BODY)`; the trigger is connected but not active; the next Tab goes to Main, Play, Learn. Not reproduced in Edge 155 or Firefox 142: the open trace has only `focus(Cancel)`, Escape and Cancel both return focus to the trigger, and the next Tab goes to Delete User Data. Severity held at P3.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20.
- Fix branch/commit/issue: `remediation/p11-s10-dialogs` (slice 10, single commit at the branch tip), implemented and independently reviewed 2026-11-02; merged to `main` in `e1a3bf0`; `fixed`, not `verified`: Electron `keyboard-walk.mjs` parts (b), (c) and (e) (lead) and the owner Edge and Firefox pass (sitting 3 item 3) are owed. Base `c1a1fbf`.
- What changed: `ConfirmActionModal` in `SettingsScreen.tsx` records the element that had focus during its first render (a lazy `useState` initialiser), not in an effect, and restores focus to it on close. The trigger button is disabled in the same commit that mounts the modal, and Chromium then moves focus to `body` before any effect runs, so an effect recorded `body`. `busy` and `onCancel` are read through refs, so a parent re-render with new inline callbacks no longer re-runs the effect (it used to re-record the focus and re-focus Cancel).
- Tests (`SettingsScreen.test.tsx > returns focus to the trigger when %s closes a confirmation dialog, even after a re-render`, Cancel button and Escape; source identity `c1a1fbf`): both cases failed before the fix (focus on `body`, not the trigger) and pass after it. jsdom cannot model Chromium's blur of a disabled trigger, so the test covers the unstable-callback re-render only; the web driver covers the blur.
- Driver result: `scripts/audit/browser/confirm-dialog-focus-restore.mjs` against the built web server, headless Chromium 141: before the render-time capture focus was on `body` after Escape and after Cancel; after the fix focus returns to the "Clear Learning Progress" trigger for both.
- Proof owed (agent-runnable): Electron `keyboard-walk.mjs` parts (b), (c) and (e) not run, needs the Electron launch lane (`flock /tmp/claude-1000/lumakeys-electron.lock`) and was left to the lead; Edge and Firefox are owner-only (sitting 3 item 3). Human-only: none.
- Residual risk: other confirm dialogs that capture focus in an effect may have the same defect; this slice did not audit them (lead for triage).
- Revisit trigger: reviewer verification and the runtime proofs above.
