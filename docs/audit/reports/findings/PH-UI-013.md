# PH-UI-013: Soundboard Escape Leaves The Screen After The Session Menu Has Been Opened Once

- Lane: UI/accessibility
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), keyboard and mouse sequences on Soundboard, Free Play, and Game
- Verifier: independent verifier recommended
- Affected runtime: both (renderer; web and headless Electron proven)
- Coverage rows: RT-008, WF-016, WF-024, MOD-002
- Related/duplicate findings: related to PH-UI-004 (Escape semantics) but a different mechanism: listener ordering, not a missing `preventDefault`.
- First observed against: `main` at `6e549b6`

## User Impact

On the Soundboard, the first Escape opens the session menu and the second closes it, as on Free Play and Game. The next Escape, with no menu open, exits to the Main Menu instead of opening the menu again. Anyone who presses Escape to bring the menu back is thrown out of the screen. Nothing is lost (the Soundboard keeps no state worth saving) and the screen is one click away, so this is P3.

## Expected Behavior Or Oracle

- `NoveltySoundboardScreen.test.tsx` "opens the immersive overlay with Escape": Escape toggles the overlay.
- Free Play and Game behave that way on every press (measured below).
- PH-UI-004 intent: Escape belongs to the topmost layer, and `App.tsx` already excludes `game`, `free-play`, `lesson-drill`, and `capstone` from the global Escape back action.

## Evidence

### Environment

- Commit/patch identity: `6e549b6`; headless Chromium 141, Playwright 1.56.1, built web server, 1480x960.

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

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: none.
- Verification evidence: none yet.
- Residual risk: none.
- Revisit trigger, if accepted-risk: n/a.
