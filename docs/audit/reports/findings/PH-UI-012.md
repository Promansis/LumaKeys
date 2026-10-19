# PH-UI-012: Immersive HUD Bar Collides With Its Own Controls At Emulated 150 And 175 Percent Zoom

- Lane: UI/accessibility
- Severity: P2
- Confidence: medium (emulated zoom; real zoom owed to sitting 1)
- Status: reproduced (emulation)
- Owner: remediation owner TBD
- Challenger: Claude Code (acting), reachability sweeps at five sizes
- Verifier: user sitting 1 with real zoom
- Affected runtime: both (layout depends only on CSS pixel width); web emulation proven
- Coverage rows: RT-006, RT-003, MOD-007
- Related/duplicate findings: same class as PH-UI-002 (required-zoom layout failure), different component. PH-UI-002 itself holds (see lane report).
- First observed against: `main` at `6e549b6`

## User Impact

At 150 percent and 175 percent browser or Electron zoom of the default 1480x960 window, the expanded HUD bar on Free Play, Soundboard, and Game overlaps itself. The navigation strip is drawn over the left status cards ("Mode / Harmony / Session" text collides with MAIN, PLAY, LEARN) and the right-hand instrument toggle sits on top of SETTINGS and PROGRESS, so the Settings button's centre point hits "Electric Piano" instead. 150 to 200 percent is a charter-required condition ([charter](../../charter.md) support matrix). The Menu overlay offers Back to Main Menu, and Tab still reaches the covered button, so no screen is a dead end; this is a P2 layout failure, not P1.

## Expected Behavior Or Oracle

- Charter support matrix: 125 to 200 percent zoom must keep controls visible and reachable (PH-UI-002 oracle).
- `PRODUCT.md` line 35: legible UI while playing.
- RT-006 in the coverage matrix.

## Evidence

### Environment

- Commit/patch identity: `6e549b6`
- Runtime: headless Chromium 141, Playwright 1.56.1. **This is emulation**: the CSS viewport was shrunk to the size real zoom would give and `deviceScaleFactor` raised to match. Layout depends on CSS pixels, so the same collision is expected under real zoom, but that stays unproven until sitting 1.
- Sizes: 1180x780@1, 1184x768@1.25, 987x640@1.5, 846x549@1.75, 740x480@2

### Reproduction

Driver: `scripts/audit/browser/zoom-hud-overlap.mjs` (port 3794). Focus the "Show play HUD" tab to expand the HUD, then hit-test the centre of every nav button and test HUD elements against the nav strip's rectangle:

```text
1180x780@1    Free Play / Soundboard / Game: covered nav buttons none, overlapping HUD elements none
1184x768@1.25 Free Play / Soundboard / Game: none, none
987x640@1.5   Free Play: covered ["Settings <- Electric Piano"]; overlaps "Mode Classic Piano Harmony" 89x30 px, instrument toggle 37x30 px
987x640@1.5   Soundboard: covered none; overlaps status card 84x30 px, Menu 13x30 px
987x640@1.5   Game: none, none
846x549@1.75  Free Play: covered ["Settings <- Electric Piano"]; overlaps 160x30, 107x30, 107x30 px
846x549@1.75  Soundboard: covered ["Settings <- immersive-menu-btn"]; overlaps 155, 83, 52, 23 px
846x549@1.75  Game: covered ["Settings <- Electric Piano"]; overlaps "Score Combo Accuracy" 53x30, instrument toggle 47x30 px
740x480@2     all three screens: none (layout changes below 780 px)
```

Screenshot comparison `$TMPDIR/p11/E/shots/E-zoom-hud-compare.png` (SHA-256 prefix `82c6e05810d6c540`; top 1184 wide clean, middle 987 and bottom 846 show the collision).

### Artifacts

- Nav strip is `.immersive-hud-nav` with a fixed 555 px natural width (`scrollWidth 555`), so at 987 and 846 px it no longer fits between the status cards and the actions and overflows into both.
- `src/renderer/components/ImmersiveHud.tsx` and `styles.css` `.immersive-hud*` rules own the layout.

## Root Cause

The HUD grid has no breakpoint between the 1180 px comfortable width and the 780 px compact query, so the 555 px nav strip overlaps its neighbours in between. The two failing widths are exactly the 150 and 175 percent equivalents of the default window.

## Recommended Remediation Boundary

Add a HUD breakpoint (for example collapse status cards or wrap the nav) for roughly 780 to 1100 px. Owning module: `styles.css` HUD rules.

## Required Regression Proof

- Deterministic unit/integration proof: none possible in jsdom (layout).
- Electron proof: sitting 1, set zoom 150 and 175 percent, expand the HUD on Free Play, Soundboard, and Game, and confirm no overlap and that Settings is clickable.
- Web proof: re-run `zoom-hud-overlap.mjs`; expect no covered nav button at any size.
- Data/recovery proof: none.
- Manual hardware/UI proof: real zoom in Chrome, Edge, Firefox (sitting 3).
- Broader regression command: `npx vitest run`.

## Challenge Record

- Independent reproduction attempt: first seen in the generic reachability sweep (`zoom-emulation-hit-test.mjs`), then isolated and measured by a dedicated driver and a screenshot.
- Alternative explanations tested: hit test artefact from `scrollIntoView` centring (this is how the library "covered by sidebar" result arose and was rejected, see lane report); here the geometry is static and the screenshot shows the overlap directly.
- Scope/severity changes: held at P2; the confidence is medium only because real zoom was not available.
- Deduplication decision: new component, same oracle as PH-UI-002.
- Challenger conclusion and date: reproduced under emulation, Claude Code (acting), 2026-10-19.

## Resolution

- Accepted/rejected rationale: pending lead.
- Fix branch/commit/issue: none.
- Verification evidence: none yet.
- Residual risk: none.
- Revisit trigger, if accepted-risk: n/a.
