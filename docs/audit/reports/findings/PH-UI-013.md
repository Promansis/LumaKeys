# PH-UI-013: Soundboard Escape Leaves The Screen After The Session Menu Has Been Opened Once

- Lane: UI/accessibility
- Severity: P3
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), keyboard and mouse sequences on Soundboard, Free Play, and Game
- Verifier: independent verifier recommended
- Affected runtime: both (renderer; web, headless Electron, Edge 155 and Firefox 142 proven)
- Coverage rows: RT-008, WF-016, WF-024, MOD-002
- Related/duplicate findings: related to PH-UI-004 (Escape semantics) but a different mechanism: listener ordering, not a missing `preventDefault`.
- First observed against: `main` at `4466626`

## User Impact

On the Soundboard, the first Escape opens the session menu and the second closes it, as on Free Play and Game. The next Escape, with no menu open, exits to the Main Menu instead of opening the menu again. Anyone who presses Escape to bring the menu back is thrown out of the screen. Nothing is lost (the Soundboard keeps no state worth saving) and the screen is one click away, so this is P3.

## Expected Behavior Or Oracle

- `NoveltySoundboardScreen.test.tsx` "opens the immersive overlay with Escape": Escape toggles the overlay.
- Free Play and Game behave that way on every press (measured below).
- PH-UI-004 intent: Escape belongs to the topmost layer, and `App.tsx` already excludes `game`, `free-play`, `lesson-drill`, and `capstone` from the global Escape back action.

## Evidence

### Environment

- Commit/patch identity: `4466626`; headless Chromium 141, Playwright 1.56.1, built web server, 1480x960.

### Reproduction

Driver: `scripts/audit/browser/escape-semantics.mjs` (port 3793).

```text
Soundboard keyboard only: Esc#1 overlay open | Esc#2 session screen, overlay closed | Esc#3 MAIN MENU
Soundboard mouse open (Menu) -> overlay open; Resume click -> closed; then Escape (focus blurred) -> MAIN MENU
Free Play keyboard only: Esc#1 open | Esc#2 closed | Esc#3 open | Esc#4 closed
Free Play mouse open, Resume click, then Escape -> overlay open
Game keyboard only: Esc#1 open | Esc#2 closed | Esc#3 open | Esc#4 closed
```

The Soundboard keyboard sequence was observed in four runs (two matrix runs, two runs of this driver) with the same result; Free Play and Game in two.

### Artifacts

- `src/renderer/components/NoveltySoundboardScreen.tsx:140-153`: the Escape handler is registered on `window` in an effect with dependency `[overlayVisible]`, so it is removed and re-added after every overlay toggle.
- `src/renderer/components/FreePlayScreen.tsx:389-400`: the same handler with dependency `[]`, registered once at mount.
- `src/renderer/App.tsx:1281`: the app-level handler (registered on `[currentScreen]`) checks `event.defaultPrevented`, then treats Escape on any screen except the four listed as "go back". `soundboard` is not excluded.
- Order of execution: at mount the child's listener is added before the parent's re-registration, so the screen handler runs first and calls `preventDefault`. After the first overlay toggle the screen's listener is re-added after the app's, so the app handler runs first, sees an unprevented event, and navigates.

## Root Cause

Listener order depends on effect re-registration. The Soundboard re-registers its window listener on every overlay change, which moves it behind the app-level handler. Free Play avoids this with an empty dependency array. `soundboard` is also missing from the app handler's exclusion list.

## Recommended Remediation Boundary

Register the Soundboard handler once (empty or ref-based dependencies, as Free Play does) and add `soundboard` to the exclusion list in `App.tsx`. The unit test mounts the screen alone, so add an `App`-level test: open Soundboard, press Escape three times, assert the screen stays.

## Required Regression Proof

- Deterministic unit/integration proof: `App.test.tsx` case "lets soundboard own Escape" with three presses.
- Electron proof: reproduced headless with `scripts/audit/electron/keyboard-walk.mjs` (agent item A4, 2026-10-20); after the fix the same driver must show the corrected behaviour.
- Web proof: re-run `escape-semantics.mjs`.
- Data/recovery proof: none.
- Manual hardware/UI proof: none.
- Broader regression command: `npx vitest run src/renderer`.

## Challenge Record

- Independent reproduction attempt: keyboard-only and mouse-open variants; Soundboard four runs, Free Play and Game two. Reproduced in headless Electron 30.5.1 on 2026-10-20 (agent item A4, [Electron runtime report](../phase-11-electron-runtime-2026-10-20.md#agent-items-a1-to-a4)): on the Soundboard the first Escape opened the menu, the second closed it and the third went to the main menu.
- Alternative explanations tested: focus on the Menu button changing behaviour (ruled out: the mouse variant blurs focus before Escape); driver pressing a key twice (ruled out: each press is logged with the resulting state).
- Scope/severity changes: held at P3.
- Deduplication decision: not a duplicate of PH-UI-004 (that fix is verified; this concerns a screen with no modal open).
- Challenger conclusion and date: reproduced, Claude Code (acting), 2026-10-19.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.
- Owner sitting run by the agent, 2026-10-20: reproduced in Edge 155 and Firefox 142 in [sitting 3](../phase-11-owner-sittings-2026-10-20.md#sitting-3-edge-and-firefox) item 3(c). On the Soundboard the third Escape goes to the main menu, and so does Escape after opening the menu with the mouse and clicking Resume. In Free Play and the game every Escape toggles the menu. The first Firefox run stopped on a connection error after the Soundboard row; a second run completed.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20.
- Fix branch/commit/issue: `remediation/p11-s10-dialogs` (slice 10, single commit at the branch tip), implemented and independently reviewed 2026-11-02; merged to `main` in `e1a3bf0`; `fixed`, not `verified`: Electron `keyboard-walk.mjs` parts (b), (c) and (e) (lead) and the owner Edge and Firefox pass (sitting 3 item 3) are owed. Base `c1a1fbf`.
- What changed: the Escape effect in `NoveltySoundboardScreen.tsx` depended on `overlayVisible`, so every toggle re-registered the listener after `App.tsx`'s own Escape listener and the app listener ran first on later presses (it navigated away). The effect now registers once (`[]` dependencies, state read through its setter). `App.tsx` also lists `soundboard` in its Escape exclusion list, as it does for other screens that own Escape. No other App change.
- Tests (source identity `c1a1fbf`): `NoveltySoundboardScreen.test.tsx > handles every Escape before the app-level listener, however often the menu toggles` failed before the fix (the app-style listener saw 4 unhandled Escapes) and passes after it. `App.test.tsx > lets soundboard own Escape` failed before the fix (the first Escape navigated away, "Mock Soundboard" was gone) and passes after it. The App test uses the mocked screen, so real listener ordering is covered by the Soundboard test.
- Driver result: `scripts/audit/browser/escape-semantics.mjs` against the built web server, headless Chromium 141: Escape #1 opens, #2 closes, #3 opens, #4 closes, and the screen stays; mouse-open then Escape opens the overlay; Free Play and Game Escape behaviour unchanged.
- Proof owed (agent-runnable): Electron `keyboard-walk.mjs` parts (b), (c) and (e) not run, needs the Electron launch lane (`flock /tmp/claude-1000/lumakeys-electron.lock`) and was left to the lead; Edge and Firefox are owner-only (sitting 3 item 3). Human-only: none beyond the owner keyboard pass.
- Residual risk: none expected beyond the owed runtime proof.
- Revisit trigger: reviewer verification and the runtime proofs above.
