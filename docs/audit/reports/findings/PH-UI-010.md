# PH-UI-010: Latency Calibration Dialog Is Not Keyboard Operable And Its Escape Leaves Settings

- Lane: UI/accessibility
- Severity: P2
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), mouse control and a second page per symptom (see Challenge Record)
- Verifier: independent verifier recommended
- Affected runtime: both (renderer code, no runtime branch; web and headless Electron proven)
- Coverage rows: RT-008, WF-018, MOD-005
- Related/duplicate findings: same defect class as PH-UI-001 (focus containment) and PH-UI-004 (Escape also navigates). Their Phase 9 fixes covered the Settings confirmation dialog and the immersive session menus, not this dialog. Lead may fold this into a reopened PH-UI-001/004 or keep it separate.
- First observed against: `main` at `6e549b6` (audit-only commits after it)

## User Impact

A keyboard-only user who opens Settings, Audio, "Calibrate..." cannot use the dialog:

1. Focus does not move into the dialog. It stays on the "Calibrate..." button behind it.
2. Tab walks into the page behind the modal ("Show Advanced Options", then the dialog's two buttons, then the top navigation).
3. Escape closes the dialog and also navigates from Settings to the Main Menu.
4. Enter or Space on the focused close button (the "x") starts the measurement instead of closing.
5. After a measurement, Enter or Space on "Apply NNN ms" or "Try Again" does nothing, so a keyboard user can never apply the result.

Latency compensation is an optional setting and a pointer user is unaffected, so this is P2 rather than P1. It is a WCAG 2.1.1 Keyboard failure (point 5, point 4) and a 2.4.3 Focus Order failure (points 1, 2).

## Expected Behavior Or Oracle

- Phase 5 modal oracle ([Phase 5](../phase-5-ui-accessibility-performance-2026-07-12.md#evidence-plan)): a modal must move focus inside, contain Tab, restore focus on close, and Escape must cancel only the active dialog.
- The dialog itself declares `role="dialog" aria-modal="true"` (`src/renderer/components/LatencyWizard.tsx:116`).
- `DESIGN.md` line 314: modal focus-trap behavior is the Settings modal contract.
- PH-UI-004 oracle: Escape from a modal must not invoke the global Settings back shortcut.

## Evidence

### Environment

- Commit/patch identity: `6e549b6`
- OS/runtime/browser: Linux, headless Chromium 141, Playwright 1.56.1, built web server (`dist/server/index.cjs`), 1480x960
- Data profile/fixture: empty isolated data directory under `$TMPDIR/p11/E/data`
- Hardware: none (a real audio output is not needed to reproduce)

### Reproduction

Driver: `scripts/audit/browser/latency-wizard-keyboard.mjs` (port 3793). Output lines:

```text
1 opened by Enter on Calibrate: focus "BUTTON Calibrate... inDialog=false", dialog true, onSettings true
1 immediate Escape -> focus body, dialog false, onSettings false          (Settings was left)
2 Tab x6 trail: Show Advanced Options (inDialog=false) > x (true) > Start (true) > body > Main (false) > Play (false)
3 Enter on focused close button -> dialog still open, phase text "Warming up - keep tapping... TAP"
3b Space on focused close button -> dialog still open, "Warming up - keep tapping... TAP"
4 (Enter) after 10 Space taps, buttons ["x","Try Again","Apply 281 ms"]; Enter on "Apply 281 ms" -> unchanged, dialog open
4 (Enter) Enter on "Try Again" -> unchanged
4 (Space) Space on "Apply 277 ms" and on "Try Again" -> unchanged
5 control: mouse click "Try Again" -> phase restarts; mouse click "Apply" -> dialog closes, getSetting audio.latencyCompMs = "300"
```

The mouse control in step 5 rules out broken buttons. The five Space taps are driven by the harness, so the measured value itself (about 280 ms) is meaningless; only whether the buttons activate matters.

### Artifacts

- `src/renderer/components/LatencyWizard.tsx:100-111`: one `window` keydown handler calls `preventDefault()` on every Enter and Space, then starts or taps depending on phase, and calls `onClose()` on Escape without `preventDefault()` or `stopPropagation()`.
- `src/renderer/App.tsx:1281`: the global keydown handler runs `handleBackNavigation()` for Escape on every screen except `game`, `free-play`, `lesson-drill`, and `capstone`, after an `event.defaultPrevented` check. The wizard never sets `defaultPrevented` for Escape, so both run.
- No `useModalFocusTrap` or equivalent is used in `LatencyWizard.tsx` (the hook is used by the Free Play, Soundboard, and Game overlays).
- Screenshot `$TMPDIR/p11/E/shots/E-latency-wizard-open.png`, SHA-256 prefix `7e75e75ca198ac7a`.

## Root Cause

The wizard predates the shared modal hook and handles keys with a window-level listener that both swallows Enter and Space (which cancels native button activation) and leaves Escape unhandled for the app-level back shortcut. It has no focus move, trap, or restore.

## Recommended Remediation Boundary

Use `useModalFocusTrap` for the dialog (focus first control, contain Tab, restore focus, handle Escape with `stopPropagation`), and limit the Space/Enter shortcut to the tapping phase when focus is not on a button, so native button activation still works. Owning module: `LatencyWizard.tsx` only.

## Required Regression Proof

- Deterministic unit/integration proof: Testing Library test in `SettingsScreen.test.tsx` or a new `LatencyWizard.test.tsx`: open, assert focus inside, Escape closes only the dialog and the settings screen stays, Enter on the close button closes, Enter on Apply applies.
- Electron proof: reproduced headless with `scripts/audit/electron/keyboard-walk.mjs` (agent item A4, 2026-10-20); after the fix the same driver must show the corrected behaviour.
- Web proof: re-run `latency-wizard-keyboard.mjs`.
- Data/recovery proof: Apply by keyboard persists `audio.latencyCompMs`.
- Manual hardware/UI proof: audible click calibration is a sitting 1 or 4 item and is not needed for this defect.
- Broader regression command: `npx vitest run src/renderer/components`.

## Challenge Record

- Independent reproduction attempt: run twice (the dedicated driver and the matrix driver `keyboard-focus-matrix.mjs` part `dialogs`), each from a fresh page; Escape navigated away both times; focus escape measured as 14 of 14 stops outside the dialog in the matrix run. Reproduced in headless Electron 30.5.1 on 2026-10-20 (agent item A4, [Electron runtime report](../phase-11-electron-runtime-2026-10-20.md#agent-items-a1-to-a4)): Enter on Calibrate left focus on the Calibrate button outside the dialog, and Escape closed the dialog and left Settings for the main menu.
- Alternative explanations tested: driver error (Enter pressed on the wrong element) ruled out by logging the focused element before each press; broken Apply ruled out by the mouse control; audio dependence ruled out because the dialog state machine runs without sound.
- Scope/severity changes: held at P2 because the setting is optional and a pointer workaround exists. A reviewer could argue P3.
- Deduplication decision: not a duplicate of PH-UI-001 or PH-UI-004 (different component; both fixes verified on their own surfaces in this phase).
- Challenger conclusion and date: reproduced, Claude Code (acting), 2026-10-19.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P2. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: none.
- Verification evidence: none yet.
- Residual risk: none beyond the above.
- Revisit trigger, if accepted-risk: n/a.
