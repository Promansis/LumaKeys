# PH-UI-003: Immersive Canvases Ignore Reduced-Motion Preference

- Lane: UI/accessibility
- Severity: P2
- Confidence: high
- Status: fixed
- Owner: Codex (acting)
- Challenger: Codex, Chrome and Electron reduced-motion pixel challenge
- Verifier: Claude Code (acting), Phase 11 re-verification and runtime lanes
- Affected runtime: both
- Coverage rows: WF-015, WF-016, RT-009, MOD-006
- Related/duplicate findings: none
- First observed against: `808e6739e55b5186e8a9565f2c4e9267c4894a6c` plus the chartered audit patch identity

## User Impact

Users requesting reduced motion still receive continuous animated Free Play and
Soundboard stage backgrounds. These stages are not necessary to communicate idle
status and keep redrawing despite the preference. The user can leave the stage,
so this is a recoverable P2 accessibility failure rather than a P1 block.

## Expected Behavior Or Oracle

`PRODUCT.md` requires reduced-motion support. The UI audit profile requires
reduced motion without removing essential status feedback, and `DESIGN.md`
requires non-essential choreography to be removed by the existing reduced-motion
path. Background scene movement should stop or become static while direct note
and state feedback remains understandable.

## Evidence

### Environment

- Commit/patch identity: charter baseline above.
- OS/runtime/browser: Linux x86_64, Chrome 149 built web runtime and Electron
  30 production renderer under Xvfb.
- Data profile/fixture: isolated fresh profiles; idle Free Play and Soundboard.
- Motion condition: CDP-emulated `prefers-reduced-motion: reduce`, confirmed by
  `matchMedia` before each capture.

### Reproduction

1. Open Free Play or Soundboard.
2. Enable reduced motion.
3. Sample the canvas RGB bytes, wait 750 ms, and sample again without input.

```text
Chrome Free Play: reduce=true, 1585659063 -> 1095833635
Chrome Soundboard: reduce=true, 3605353602 -> 700695514
Electron Free Play: reduce=true, 3882716736 -> 1593986054
```

Each distinct hash proves visible canvas pixels changed while the preference was
active.

### Artifacts

- Free Play schedules every subsequent frame unconditionally at
  `src/renderer/components/FreePlayCanvasScene.tsx:2939` and `:3024`.
- Soundboard does the same at
  `src/renderer/components/AnimalSoundboardCanvas.tsx:264` and `:393`.
- The stylesheet's reduced-motion rules affect DOM transitions but do not pass a
  motion preference into either canvas scene.
- Screenshot artifact: `/tmp/lumakeys-audit-p5-freeplay-reduced-motion.png`,
  SHA-256 `ba3798aabffc3b4b17081f34f00f9886440dee7f4e79410391d00d62db4bd072`.
- Full evidence: [Phase 5](../phase-5-ui-accessibility-performance-2026-07-12.md#p5-ui-003-reduced-motion).

## Root Cause

The canvas components own perpetual `requestAnimationFrame` loops with no motion
preference input or `matchMedia` decision. CSS can suppress DOM animations but
cannot suspend JavaScript canvas redraws.

## Recommended Remediation Boundary

Add a shared renderer motion-preference hook and pass its reduced state into each
immersive canvas. Render a static idle scene under reduction, pause decorative
frame loops, and retain direct note/status feedback through bounded draws.

## Required Regression Proof

- Deterministic unit/integration proof: reduced motion does not schedule a
  perpetual decorative frame loop, while a note event still produces an
  understandable bounded feedback draw.
- Electron proof: Free Play and Soundboard pixel hashes remain stable at idle
  with reduced motion.
- Web proof: same in Chrome, Edge, and Firefox.
- Data/recovery proof: changing motion preference does not alter recording,
  backing-track, or saved setting state.
- Manual hardware/UI proof: MIDI/computer-key note feedback remains usable with
  reduced motion enabled.
- Broader regression command: canvas/component tests, `npm test`, and both builds.

## Challenge Record

- Independent reproduction attempt: [PH-UI-003 challenge](../challenges/PH-UI-003.md).
- Alternative explanations tested: DOM Settings motion rule reduces transitions;
  Free Play and Soundboard pixels still move with no input in both runtimes.
- Scope/severity changes: Free Play and Soundboard share the missing canvas-motion
  propagation contract.
- Deduplication decision: distinct from a performance regression because the
  idle trace has no new long tasks; the violation is preference honoring.
- Challenger conclusion and date: accepted as P2, 2026-07-12.

## Resolution

- Accepted/rejected rationale: verified reduced-motion preference and changing
  pixels demonstrate that decorative canvas animation continues.
- Fix branch/commit/issue: `d5839aa`, Phase 9 slice 15 ([Phase 9 report](../phase-9-remediation-2026-07-30.md)). This file said "accepted" until the Phase 11 consolidation reconciled it with the ledger on 2026-10-20.
- Verification evidence: Phase 9 added `usePrefersReducedMotion` to the Free Play and Soundboard canvases. Phase 11: with reduced motion emulated, both canvases make 0 animation-frame calls per second when idle (46 and 24 without it), and key feedback still draws (RT-009, [lane E](../phase-11-lane-e-ui-accessibility-2026-10-19.md)).
  [Sitting 1](../phase-11-owner-sittings-2026-10-20.md#sitting-1-linux-display-and-speakers) item 3, 2026-10-20, run by the agent on X11 through the OS path, once with GTK `settings.ini` `gtk-enable-animations=false` and once with an XSETTINGS daemon publishing `Gtk/EnableAnimations=0`. Real Chrome 151 and the packaged app both report `reduce` at startup: no main-menu video element, 0 % pixel change over 3 s, and Free Play idles at 0 animation frames per second with 1 distinct frame; holding Z X C V gives 8 to 9 distinct frames and lights 1 key. With no setting the video plays and Free Play idles at 30 to 40 frames per second. A live flip of the setting does not reach an open page: Chrome needs a new tab (a reload is not enough) and the desktop app needs a restart.
- Residual risk: no automated test covers the two canvases under reduced motion (slice 0; a proof gap named in the [re-verification](../phase-11-reverification-2026-10-19.md)). The setting on real GNOME or Wayland is still owed ([user test B3](../phase-11-user-tests.md)).
- Slice 0 (2026-10-21, `remediation/p11-s00-ci`, merged to `main` in `d49b8a6`, run by the agent): the owed canvas tests are added, which supersede the residual risk above except for the GNOME and Wayland setting (user test B3). `src/renderer/components/FreePlayCanvasScene.reducedMotion.test.tsx` and `src/renderer/components/AnimalSoundboardCanvas.test.tsx` mock `matchMedia('(prefers-reduced-motion: reduce)')` and spy on `requestAnimationFrame`. With reduce, each canvas draws on mount and schedules no frame (`schedules no decorative animation frame when reduced motion is preferred`); with no preference, each schedules one (`keeps the animation loop running when reduced motion is not preferred`, which proves the spy can see the call). Local mutation check, not committed: replacing the `if (!reducedMotion)` guard with `if (true)` in each canvas fails the first test in both files. Both guards were restored afterwards.
- Revisit trigger, if accepted-risk: not applicable.
