# PH-UI-002: Settings Tabs Are Clipped At Required Desktop Zoom

- Lane: UI/accessibility
- Severity: P1
- Confidence: high
- Status: verified
- Owner: Codex (acting)
- Challenger: Codex, fresh Chrome and Electron zoom challenge
- Verifier: Claude Code (acting), sitting 3 run 2026-10-20
- Affected runtime: both
- Coverage rows: WF-003, WF-018, WF-019, WF-021, WF-022, RT-006, RT-008, MOD-005, MOD-007
- Related/duplicate findings: none
- First observed against: `808e6739e55b5186e8a9565f2c4e9267c4894a6c` plus the chartered audit patch identity

## User Impact

At the required 150%, 175%, and 200% desktop zoom equivalents, Settings tabs
collapse into a few visible pixels. The user sees only accent slivers, cannot
pointer-select Visual, Gameplay, Input, or Practice, and receives no usable
visible focus target while moving tabs by keyboard. This blocks preference,
MIDI-input, sample-pack, and reset workflows at a documented supported desktop
condition, making it P1.

## Expected Behavior Or Oracle

ADR 0001, the audit charter, and the LumaKeys UI profile require 125%, 150%,
175%, and 200% desktop zoom with controls contained, visible, and keyboard
operable. `DESIGN.md` additionally requires five equal Settings tabs with visible
icons and labels. A scrollable tab row may scroll horizontally, but it may not
clip its own controls to an unreachable 4 px scrollport.

## Evidence

### Environment

- Commit/patch identity: charter baseline above.
- OS/runtime/browser: Linux x86_64, Chrome 149 built web runtime and Electron
  30 production renderer under Xvfb.
- Data profile/fixture: isolated fresh profiles; no destructive action taken.
- Zoom method: CSS viewport equivalents for a 1480x960 desktop, including
  150% `987x640`, 175% `846x549`, and 200% `740x480`.

### Reproduction

1. Open Settings at the default desktop window.
2. Apply the effective 150% desktop zoom viewport (`987x640`).
3. Inspect the tablist and pointer hit target at the center of Visual.

Chrome result:

```text
tablist client size: 894x4
tablist scroll size: 894x50
overflow: auto/auto
Visual rect: [226.6,147.8,396.6,193.8]
elementFromPoint(Visual center): Audio settings group, not a tab
```

Electron independently produced a `879x4` tablist with a `890x56` scroll area
and the same null tab hit test. At 175% and 200%, the Chrome tablist remained
4 px high and clipped the labels.

### Artifacts

- Base row rule: `src/renderer/styles.css:8027` gives `.settings-tab-row`
  `min-height: 0`.
- The panel grid has `auto auto minmax(0, 1fr)` tracks and clips overflow at
  `src/renderer/styles.css:8218`.
- The <=1180 px rule turns horizontal overflow on at
  `src/renderer/styles.css:9444`; computed overflow becomes `auto/auto`,
  clipping the collapsed row.
- Chrome screenshot: `/tmp/lumakeys-audit-p5-settings-150zoom-effective.png`,
  SHA-256 `c7600ffc930a0b3572e95e7a162e9d31c8936a28ce41404d70762fc142c60284`.
- Electron screenshot: `/tmp/lumakeys-audit-p5-electron-settings-150zoom-effective.png`,
  SHA-256 `e43787a0f5e99829acb42afdc7c21326259f0d3acd1eefafeab0bea171985fd4`.
- Full evidence: [Phase 5](../phase-5-ui-accessibility-performance-2026-07-12.md#p5-rt-001-layout-conditions).

## Root Cause

The Settings panel's grid permits the tab row to contribute zero height through
`min-height: 0`. At the zoom breakpoint, `overflow-x: auto` computes an auto
vertical overflow mode, converting the zero-height row into a clipped scrollport.
The tab buttons still lay out outside that 4 px area but are no longer painted or
pointer-hit-testable.

## Recommended Remediation Boundary

Make the tab row reserve its actual control height at every supported zoom. Keep
horizontal scrolling only if necessary, ensure vertical overflow remains visible
or non-scrolling, and add a deterministic visual/layout assertion that every tab
has a hit-testable center at 125-200% zoom in both runtimes.

## Required Regression Proof

- Deterministic unit/integration proof: tablist reports a client height at least
  the tab control height; every tab center resolves to that tab at each zoom.
- Electron proof: 150%, 175%, and 200% Settings tabs are visible, pointer
  reachable, and keyboard operable in a fresh renderer profile.
- Web proof: same conditions in Chrome, Edge, and Firefox.
- Data/recovery proof: switching Input/Practice at zoom retains settings values;
  reset confirmation remains explicit and cancelable.
- Manual hardware/UI proof: a user can select MIDI Input and back out at 200%
  without horizontal/vertical clipping.
- Broader regression command: affected renderer tests, `npm test`, and both builds.

## Challenge Record

- Independent reproduction attempt: [PH-UI-002 challenge](../challenges/PH-UI-002.md).
- Alternative explanations tested: minimum/default/large main-menu layouts,
  125% Settings layout, fresh Chrome profile, and fresh Electron renderer.
- Scope/severity changes: remains one Settings layout root cause; it is not split
  by individual tab or preference category.
- Deduplication decision: distinct from modal focus and Escape dispatch defects.
- Challenger conclusion and date: accepted as P1, 2026-07-12.

## Resolution

- Accepted/rejected rationale: live hit testing demonstrates that required zoom
  hides the actual Settings navigation controls in both runtimes.
- Verified rationale: all five Settings tabs open by click at every zoom step tried in real Chrome, the packaged desktop app, Edge and Firefox (sittings 1 and 3, below).
- Fix branch/commit/issue: `d5839aa`, verified implementation in `d4ba395`.
- Verification evidence: Settings tests, independent CSS/source review, and Linux package launch pass; actual 125-200% Electron/Chrome/Edge/Firefox hit-testing remains in [Phase 10](../phase-10-verification-2026-08-07.md).
  Owner sittings run by the agent, 2026-10-20. [Sitting 1](../phase-11-owner-sittings-2026-10-20.md#sitting-1-linux-display-and-speakers) item 2: in real Chrome 151, real Ctrl+= reached exactly 125, 150, 175 and 200 % (devicePixelRatio confirmed), and all 5 tabs opened by real clicks at each step. In the packaged desktop app (zoom in is Ctrl+Shift+=), all 5 tabs opened at 110, 120, 131, 144, 158, 173, 189 and 207 %. [Sitting 3](../phase-11-owner-sittings-2026-10-20.md#sitting-3-edge-and-firefox) item 2: all 5 tabs opened at 150 and 200 % in Edge 155 (emulated zoom), Firefox 142 (emulated) and Firefox 142 (genuine `layout.css.devPixelsPerPx`).
- Residual risk: Edge's own browser zoom was not used ([user test D1](../phase-11-user-tests.md)); it is the same Chromium zoom proven in Chrome 151. The HUD buttons covered at 150 to 189 % are a separate finding, [PH-UI-012](PH-UI-012.md).
- Revisit trigger: before accessibility sign-off or release readiness.
