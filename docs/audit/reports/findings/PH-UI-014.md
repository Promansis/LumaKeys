# PH-UI-014: Closed HUD Popouts Stay In The Tab Order As aria-hidden, Invisible Controls

- Lane: UI/accessibility
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), per-stop probe plus a pin-path check
- Verifier: independent verifier recommended
- Affected runtime: both (renderer; web and headless Electron proven)
- Coverage rows: RT-008, WF-015, WF-016, MOD-003, MOD-006
- Related/duplicate findings: related to PH-UI-001 (focus on controls the user cannot see) but a different surface (collapsed HUD popouts, not modal dialogs).
- First observed against: `main` at `6e549b6`

## User Impact

On Free Play, Soundboard, and Game, the collapsed HUD popouts (instrument list, visual-mode list, sound key map, soundboard mode list) are hidden with `opacity: 0`, `pointer-events: none`, and `aria-hidden="true"`, but their buttons stay focusable. Tabbing through the page therefore lands on controls that cannot be seen: 71 of 83 Tab stops on Free Play, 52 of 64 on Soundboard, and 42 of 53 on Game. Focus is invisible on all of them, and screen readers see focusable elements inside `aria-hidden`. A keyboard user does have two ways around it (the Menu overlay holds the visual modes and presets; pressing Enter twice on a popout toggle pins it open, then Tab enters it visibly), neither of which is discoverable. P3.

## Expected Behavior Or Oracle

- WCAG 2.2 SC 2.4.7 Focus Visible and 4.1.2 Name, Role, Value (focusable content must not sit inside `aria-hidden`).
- Phase 5 modal oracle and PH-UI-001: keyboard focus must not move to controls the user cannot see.

## Evidence

### Environment

- Commit/patch identity: `6e549b6`; headless Chromium 141, Playwright 1.56.1, built web server, 1480x960.

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

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: none.
- Verification evidence: none yet.
- Residual risk: none.
- Revisit trigger, if accepted-risk: n/a.
