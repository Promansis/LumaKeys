# PH-UI-014: Closed HUD Popouts Stay In The Tab Order As aria-hidden, Invisible Controls

- Lane: UI/accessibility
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), per-stop probe plus a pin-path check
- Verifier: independent verifier recommended
- Affected runtime: both (renderer; web, headless Electron, Edge 155 and Firefox 142 proven)
- Coverage rows: RT-008, WF-015, WF-016, MOD-003, MOD-006
- Related/duplicate findings: related to PH-UI-001 (focus on controls the user cannot see) but a different surface (collapsed HUD popouts, not modal dialogs).
- First observed against: `main` at `4466626`

## User Impact

On Free Play, Soundboard, and Game, the collapsed HUD popouts (instrument list, visual-mode list, sound key map, soundboard mode list) are hidden with `opacity: 0`, `pointer-events: none`, and `aria-hidden="true"`, but their buttons stay focusable. Tabbing through the page therefore lands on controls that cannot be seen: 71 of 83 Tab stops on Free Play, 52 of 64 on Soundboard, and 42 of 53 on Game. Focus is invisible on all of them, and screen readers see focusable elements inside `aria-hidden`. A keyboard user does have two ways around it (the Menu overlay holds the visual modes and presets; pressing Enter twice on a popout toggle pins it open, then Tab enters it visibly), neither of which is discoverable. P3.

## Expected Behavior Or Oracle

- WCAG 2.2 SC 2.4.7 Focus Visible and 4.1.2 Name, Role, Value (focusable content must not sit inside `aria-hidden`).
- Phase 5 modal oracle and PH-UI-001: keyboard focus must not move to controls the user cannot see.

## Evidence

### Environment

- Commit/patch identity: `4466626`; headless Chromium 141, Playwright 1.56.1, built web server, 1480x960.

### Reproduction

Drivers: `scripts/audit/browser/hidden-focus-stops.mjs` (330 ms wait per stop so opacity transitions settle) and `scripts/audit/browser/freeplay-popout-pin-path.mjs`.

```text
Free Play:  83 Tab stops before wrapping; inside aria-hidden container 71; effective opacity < 0.1 72
   aria-hidden=free-play-visual-popout op=0: 29 stops (first: Subtle, Balanced, Vivid)
   aria-hidden=panel (instrument popout)  op=0: 42 stops (first: Acoustic Piano, Acoustic Piano info, Electric Piano)
Soundboard: 64 stops; aria-hidden 52; opacity < 0.1 53 (soundboard-key-map-popout op=0: 52 stops)
Game:       53 stops; aria-hidden 42; opacity < 0.1 42
Free Play toggle probe: focus on "Show visual mode controls" -> popout opens (open-class true); Tab -> Menu, popout closes (opacity 0, aria-hidden true);
   Enter #1 on the toggle closes it, Enter #2 pins it open; then Tab reaches Menu, Subtle, Balanced, Vivid, all visible.
```

The first stop of each list ("Show play HUD") is counted as invisible because the HUD tab hides itself when the nav expands; that is by design and is only one stop.

### Artifacts

- `src/renderer/components/FreePlayScreen.tsx:849-856` (`aria-hidden={!isVisualControlsOpen}`), `NoveltySoundboardScreen.tsx:535` and `:594`, `ImmersiveInstrumentControl.tsx:92`.
- `src/renderer/styles.css` `.free-play-visual-popout` (`opacity: 0; pointer-events: none`) has no `visibility: hidden` or `inert`.
- Screenshots: `$TMPDIR/p11/E/shots/E-ghost-free-play-after-tab.png` (SHA-256 prefix `b8c0fd83aaa8929c`).

## Root Cause

The popouts use opacity plus `aria-hidden` for the closed state. Neither removes descendants from the focus order; `visibility: hidden` or `inert` would.

## Recommended Remediation Boundary

Apply `inert` (or `visibility: hidden` after the close transition) to closed popouts and make the toggle button open the popout on Enter in one press. Owning modules: the four popout components and their CSS.

## Required Regression Proof

- Deterministic unit/integration proof: closed popout has `inert` or `visibility: hidden`; no focusable descendant is reachable.
- Electron proof: reproduced headless with `scripts/audit/electron/keyboard-walk.mjs` (agent item A4, 2026-10-20); after the fix the same driver must show the corrected behaviour.
- Web proof: re-run `hidden-focus-stops.mjs`; expect zero stops inside `aria-hidden`.
- Data/recovery proof: none.
- Manual hardware/UI proof: screen-reader pass (sitting 3 or later).
- Broader regression command: `npx vitest run src/renderer`.

## Challenge Record

- Independent reproduction attempt: two runs of the probe (15 ms and 330 ms waits); the aria-hidden counts are independent of the wait. Reproduced in headless Electron 30.5.1 on 2026-10-20 (agent item A4, [Electron runtime report](../phase-11-electron-runtime-2026-10-20.md#agent-items-a1-to-a4)): Free Play had 83 Tab stops before wrapping, 72 of them invisible and 71 of those inside `aria-hidden` popouts, the same counts as the web.
- Alternative explanations tested: transition timing (ruled out by the longer wait); popout opening on focus (it does for the toggle, but closes as soon as focus moves to the next control, which is the next DOM sibling, not the popout).
- Scope/severity changes: P3 because two workarounds exist and the Menu overlay carries the same controls.
- Deduplication decision: new surface.
- Challenger conclusion and date: reproduced, Claude Code (acting), 2026-10-19.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.
- Owner sitting run by the agent, 2026-10-20: reproduced in Edge 155 and Firefox 142 in [sitting 3](../phase-11-owner-sittings-2026-10-20.md#sitting-3-edge-and-firefox) item 3(d). Edge: Free Play 83 Tab stops, 71 inside an `aria-hidden` container and 72 invisible; Soundboard 64, 52 and 53. Firefox: Free Play 85, 73 and 74; Soundboard 81, 69 and 70. The game part timed out in both browsers (the driver did not find "Play Songs"), so the game HUD was not measured there.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: `remediation/p11-s11-hud`, slice 11, implemented 2026-11-02, awaiting independent review; not merged. Commit: see the branch tip.
- What changed: a new helper `src/renderer/components/inertWhenClosed.ts` returns `{ inert: '' }` while a popout is closed and nothing when it is open (React 18 does not type `inert` and drops a boolean). It is spread onto the four popouts: the instrument popout (`ImmersiveInstrumentControl.tsx`, used on Free Play, Soundboard and Game), the Free Play visual-mode popout (`FreePlayScreen.tsx`), and the Soundboard key-map and mode popouts (`NoveltySoundboardScreen.tsx`). The three screen-level toggles now close only a pinned popout (`isVisualControlsPinned`, `isAnimalMapPinned`, `isModeSelectorPinned`) instead of any open one, so the Enter that follows focus (which opens the popout by hover) pins it on the first press. The instrument toggle already worked this way.
- Behaviour change: a mouse user who hovers a Free Play or Soundboard popout open and then clicks the toggle now pins it open, and a second click closes it (as on the instrument popout), where before the click closed it. The test `opens the visual mode popout on hover, pins it on click and closes it on a second click` was updated for this.
- Tests (source identity `c1a1fbf`; all three failed before with `expect(element).toHaveAttribute("inert")`, the element having no `inert` attribute, and pass after): `ImmersiveInstrumentControl > removes the closed instrument popout from the tab order with inert and restores it when open`; `FreePlayScreen > keeps the closed visual popout inert and pins it on the first keyboard press`; `NoveltySoundboardScreen > keeps closed soundboard popouts inert and pins them on the first keyboard press`. `npx vitest run src/renderer` passes (208 tests) and `npm run verify` passes.
- Driver result (headless Chromium, web build of the branch, 2026-11-02): `hidden-focus-stops.mjs` reports Free Play 12 Tab stops (was 83), Soundboard 12 (was 64), Game 11 (was 53), with 0 inside `aria-hidden` on each (was 71, 52, 42). The one remaining ghost stop on each is the "Show play HUD" tab, which is the HUD reveal control, not a popout. Electron `keyboard-walk.mjs` (d) not run; owed to the lead.
- Proof owed: agent-runnable, Electron `keyboard-walk.mjs` (d). Human-only: a screen-reader pass over the pinned and closed popouts.
- Residual risk: while a popout is open by hover or focus only, it sits after the HUD in DOM order, so Tab from the toggle goes to the next HUD control and the popout closes; a keyboard user reaches the popout contents by pressing the toggle (pin), then Tab. That is the intended one-press path, but the popout has no focus handlers of its own.
- Revisit trigger: reviewer verification, the Electron walk, or a new popout added without `inertWhenClosed`.
