# PH-UI-001: Immersive Session Dialogs Do Not Contain Keyboard Focus

- Lane: UI/accessibility
- Severity: P2
- Confidence: high
- Status: fixed
- Owner: Codex (acting)
- Challenger: Codex, fresh Chrome and Electron keyboard challenge
- Verifier: Claude Code (acting), Phase 11 re-verification and runtime lanes
- Affected runtime: both
- Coverage rows: WF-009, WF-015, WF-016, WF-024, RT-008, MOD-003, MOD-006
- Related/duplicate findings: none
- First observed against: `808e6739e55b5186e8a9565f2c4e9267c4894a6c` plus the chartered audit patch identity

## User Impact

Keyboard users opening a gameplay, Free Play, or Soundboard session menu are
left on the background launcher or document body. `Tab` then reaches obscured
background controls rather than the dialog's Resume/Main Menu controls. This
makes active-session navigation unpredictable while the overlay claims to be
modal. Escape still closes the overlay, so the issue is recoverable; it is P2
rather than P1.

## Expected Behavior Or Oracle

The Phase 5 UI profile requires focus order, focus restoration, semantics, and
keyboard Escape. A `role="dialog" aria-modal="true"` overlay must move focus
inside when opened, constrain sequential navigation to its controls, and return
focus to the invoking control when closed. This is a core keyboard-only
operation requirement under ADR 0001 and `PRODUCT.md`.

## Evidence

### Environment

- Commit/patch identity: charter baseline above.
- OS/runtime/browser: Linux x86_64, Chrome 149 built web runtime, and Electron
  30 production renderer under Xvfb.
- Data profile/fixture: isolated `/tmp` web and Electron profiles; disposable
  `ode-to-joy.mid` for gameplay.
- Hardware: none.

### Reproduction

1. Open a Free Play, Soundboard, or Gameplay session.
2. Open its session menu with Menu or Escape.
3. Inspect active focus, then press Tab once.

Observed results:

```text
Free Play web: Menu -> Tab -> .free-play-preset-btn (Subtle)
Soundboard web: Menu -> Tab -> .soundboard-key-map-card-select (Toy Whistle)
Gameplay web: Escape -> Tab -> .immersive-hud-tab (HUD)
Free Play Electron: Escape -> Tab -> .immersive-hud-tab (HUD)
```

### Artifacts

- Free Play dialog: `src/renderer/components/FreePlayScreen.tsx:942` declares
  an `aria-modal` dialog but has no open-time focus or Tab trap.
- Soundboard dialog: `src/renderer/components/NoveltySoundboardScreen.tsx:636`
  has the same pattern.
- Gameplay dialog: `src/renderer/components/GameScreen.tsx:1376` has the same
  pattern.
- The settings confirmation demonstrates the required contrasting behavior:
  `src/renderer/components/SettingsScreen.tsx:444` focuses Cancel and traps Tab.
- Screenshot artifact: `/tmp/lumakeys-audit-p5-freeplay-dialog-focus-escape.png`,
  SHA-256 `5d16809f2518e797149f553cea30c49b4db790617f4a23df3ae651262724c1d7`.
- Full evidence: [Phase 5](../phase-5-ui-accessibility-performance-2026-07-12.md#p5-ui-001-modal-focus).

## Root Cause

Each immersive overlay sets accessibility semantics and has a close helper, but
none owns focus on open or sequential keyboard navigation. The three components
therefore assert modal semantics without providing the corresponding behavioral
invariant.

## Recommended Remediation Boundary

Create or reuse one renderer-level immersive-dialog focus primitive. It should
focus the first meaningful action on open, contain Tab/Shift+Tab, support Escape,
restore the invoking trigger, and make background interaction inert while open.
Adopt it in GameScreen, FreePlayScreen, and NoveltySoundboardScreen.

## Required Regression Proof

- Deterministic unit/integration proof: each overlay moves focus inside, wraps
  Tab/Shift+Tab, and restores its trigger on Resume/Escape.
- Electron proof: menu open/close and keyboard focus work in a fresh profile.
- Web proof: the same test passes in Chrome, Edge, and Firefox.
- Data/recovery proof: Resume preserves the active session; Main Menu follows its
  explicit discard/exit policy.
- Manual hardware/UI proof: a keyboard-only player can reach Resume and Main
  Menu without background controls receiving focus.
- Broader regression command: affected renderer tests, `npm test`, and both builds.

## Challenge Record

- Independent reproduction attempt: [PH-UI-001 challenge](../challenges/PH-UI-001.md).
- Alternative explanations tested: normal Settings modal trapping, fresh web
  profile, and Electron renderer all ruled out a browser-only focus artifact.
- Scope/severity changes: merged Game, Free Play, and Soundboard because they
  share the same missing focus-lifecycle contract.
- Deduplication decision: distinct from the global Escape dispatch issue in PH-UI-004.
- Challenger conclusion and date: accepted as P2, 2026-07-12.

## Resolution

- Accepted/rejected rationale: actual sequential keyboard navigation exits all
  tested `aria-modal` session overlays.
- Fix branch/commit/issue: `d5839aa`, Phase 9 slice 14 ([Phase 9 report](../phase-9-remediation-2026-07-30.md)). This file said "accepted" until the Phase 11 consolidation reconciled it with the ledger on 2026-10-20.
- Verification evidence: Phase 9 added `useModalFocusTrap` for the Game, Free Play and Soundboard overlays. Phase 11: `SettingsScreen.test.tsx` "keeps keyboard focus inside confirmation dialogs" and the Free Play and Soundboard overlay tests pass ([re-verification](../phase-11-reverification-2026-10-19.md)). Over 50 Tab and 4 Shift+Tab presses, 0 stops leave the Free Play, Soundboard or Game overlay or the Settings confirmation, in Chromium ([lane E](../phase-11-lane-e-ui-accessibility-2026-10-19.md)) and in headless Electron (`keyboard-walk.mjs` part (f), [Electron report](../phase-11-electron-runtime-2026-10-20.md)).
- Residual risk: the latency calibration dialog does not contain focus ([PH-UI-010](PH-UI-010.md)). Edge, Firefox and real zoom are not proven; RT-008 stays blocked on the owner's [sitting 3](../phase-11-user-tests.md).
- Revisit trigger, if accepted-risk: not applicable.
