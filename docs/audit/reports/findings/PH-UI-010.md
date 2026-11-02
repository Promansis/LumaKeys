# PH-UI-010: Latency Calibration Dialog Is Not Keyboard Operable And Its Escape Leaves Settings

- Lane: UI/accessibility
- Severity: P2
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), mouse control and a second page per symptom (see Challenge Record)
- Verifier: independent verifier recommended
- Affected runtime: both (renderer code, no runtime branch; web, headless Electron, Edge 155 and Firefox 142 proven)
- Coverage rows: RT-008, WF-018, MOD-005
- Related/duplicate findings: same defect class as PH-UI-001 (focus containment) and PH-UI-004 (Escape also navigates). Their Phase 9 fixes covered the Settings confirmation dialog and the immersive session menus, not this dialog. Lead may fold this into a reopened PH-UI-001/004 or keep it separate.
- First observed against: `main` at `4466626` (audit-only commits after it)

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

- Commit/patch identity: `4466626`
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
- Owner sitting run by the agent, 2026-10-20: reproduced in Edge 155 and Firefox 142 in [sitting 3](../phase-11-owner-sittings-2026-10-20.md#sitting-3-edge-and-firefox) item 3(b). Enter on Calibrate opens the dialog but leaves focus on Calibrate, outside it; an immediate Escape closes the dialog and leaves Settings for the main menu. Tab leaves the dialog (over 10 Tab and 4 Shift+Tab presses, 14 of 14 stops outside in Edge, 3 of 14 in Firefox). Enter or Space on the close button starts a measurement instead of closing; Enter or Space on Apply and Try Again do nothing. A mouse click on Apply closes the dialog and saves the latency. In the Firefox focus-matrix run Escape stayed on Settings only because focus had landed in a text input, which the app's Escape handler skips.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20.
- Fix branch/commit/issue: `remediation/p11-s10-dialogs` (slice 10, single commit at the branch tip), implemented 2026-11-02, awaiting independent review; not merged. Base `c1a1fbf`.
- What changed: `LatencyWizard.tsx` now uses `useModalFocusTrap` (open, Escape closes, Tab contained, focus returns to the opening control). The overlay is the trap root (`tabIndex=-1`) and focus moves to the primary button of each phase (Start, Tap, Apply) so it never lands outside when buttons swap. The window Space/Enter shortcut ignores key presses whose target is inside a button, so Enter/Space on the close button, Apply and Try Again act on that button; with no button focused the shortcut still starts and taps. Its own Escape handling was removed because the hook owns it. The Tap button is the one exception to the button guard: a Space or Enter keydown on it is taken by the window handler with `preventDefault`, so a tap is still timed on key press (as before) and the browser's click on release does not count it twice. After the tenth tap focus moves to the dialog itself, not to Apply, so an extra Space or Enter cannot apply the result.
- Tests (`src/renderer/components/LatencyWizard.test.tsx`, new; source identity `c1a1fbf`): `moves focus into the dialog and keeps Tab inside it`, `closes only the dialog on Escape and returns focus to the trigger`, `closes on Enter when the close button has focus instead of starting a measurement` and `applies the measurement from the keyboard and persists it through onApply` failed before the fix (Tab left the dialog, Escape reached the outer listener and focus was not returned, Enter on the close button started the measurement, Apply did not close) and pass after it. `still starts and taps from Space or Enter when no button has focus` and `persists nothing when Escape closes the dialog` pass before and after and guard against over-correcting. Added after review: `counts a tap when Space goes down on the Tap button, before the key is released` (holds Space with `[Space>]`) and `does not apply when Space or Enter is pressed again after the last tap` failed against the first fix and pass now; `counts a keyboard tap on the Tap button once, not again on release` and `persists nothing when Escape closes the dialog after a measurement` pass before and after as guards.
- Driver result: `scripts/audit/browser/latency-wizard-keyboard.mjs` against the built web server, headless Chromium 141: Enter opens with focus on Start inside the dialog; Escape closes only the dialog, Settings stays and focus returns to Calibrate; Tab x6 cycles inside; Enter and Space on the close button close; Enter and Space on Apply close and persist `audio.latencyCompMs`; Enter and Space on Try Again restart the measurement; Escape in the done phase persists nothing; no console errors. Driver step 4a (Escape in the done phase) now runs first on fresh data and prints the saved value before and after plus the measured value (278 ms shown, saved stays null). Review probes on the final build: `probe-tap.mjs` gives 89 ms (Space, no hold), 89 ms (Space, 200 ms hold) and 90 ms (Enter, 200 ms hold), matching base (about 89-110 ms) where the first fix gave 124 and 295 ms; `probe-overrun.mjs` with an 11th Space or Enter leaves the dialog open and saves nothing. The driver step 4 was rewritten because Apply now closes the dialog, which the old driver assumed it did not.
- Proof owed (agent-runnable): Electron `keyboard-walk.mjs` parts (b), (c) and (e) not run, needs the Electron launch lane (`flock /tmp/claude-1000/lumakeys-electron.lock`) and was left to the lead; Edge and Firefox are owner-only (sitting 3 item 3). Human-only: Edge and Firefox pass of the same walk.
- Residual risk: none expected beyond the owed runtime proof. After the last tap focus sits on the dialog container, so a keyboard user presses Tab once to reach Try Again or Apply.
- Revisit trigger: reviewer verification and the runtime proofs above.
