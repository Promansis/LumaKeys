# PH-UI-020: The song-load error panel does not take focus, and Retry is about 54 Tab presses away

- Lane: UI
- Severity: P3
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-21
- Verifier: TBD
- Affected runtime: both
- Coverage rows: WF-009, RT-008, MOD-003
- Related/duplicate findings: PH-ARCH-001 (the panel itself, fixed; this is the focus behaviour it left), PH-UI-017 (focus drops to the page body in another dialog), PH-UI-014 (invisible controls in the Tab order); none duplicate
- First observed against: `main` at `d208ee2` (source identity `4466626`), agent proof run for PH-ARCH-001, 2026-10-20

## User Impact

When a practice session cannot load (a failed settings, stats, fingering or MIDI request),
the "Could not start this session." panel appears with Retry and Main Menu. Focus stays on
the page body. A keyboard-only user presses Tab about 54 times (Edge and Chromium) or 55
(Firefox) before reaching Retry, and Main Menu is one or two presses further, behind the
HUD controls. The screen-reader alert (`role="alert"`) announces the message, but the
actions are not reachable without a long walk. The panel is recoverable and the failure is
rare, so P3.

## Expected Behavior Or Oracle

A panel that appears in place of the expected view and offers the only way forward moves
focus to its primary action, or to its heading, so a keyboard user can act at once. The
Phase 5 modal oracle ("restore focus on close", focus moves in on open) and the
PH-ARCH-001 required proof ("the error can be read and exited with keyboard only") apply.

## Evidence

### Environment

- Commit/patch identity: `main` at `d208ee2`; no product source changed since `4466626`.
- OS/runtime/browser: web build in Edge 155.0.4283.62 (unpacked, isolated HOME and
  profile), Playwright Firefox 142.0.1 and Playwright Chromium 141.0.7390.37, headless,
  Linux. The panel is shared renderer code, so Electron runs the same markup; it was not
  measured there.
- Data profile/fixture: throwaway data directory; one fault at a time injected with
  Playwright `page.route` (HTTP 500 on `getSetting`, `getUserStats`,
  `getCustomFingerings`; a 500 and an abort on `/api/midi/:id`).

### Reproduction

1. Start a practice session with one of the faults above active.
2. The panel with Retry and Main Menu shows at once. The active element is `<body>`.
3. Press Tab repeatedly. Retry takes focus after 54 presses in Edge and Chromium and 55 in
   Firefox (`getSetting` fault). Main Menu follows at 55 to 56.

The panel showed in all three browsers for all five faults; the Tab counts are for the
`getSetting` fault.

### Artifacts

- `src/renderer/components/GameScreen.tsx:1341-1353`: the `loadError` panel renders with
  `role="alert"` and two buttons, and no focus is moved to it.
- Evidence: `$TMPDIR/p11/PF/browsers/{edge,firefox,chromium}/` (`result.json`, `shots/`,
  `server.log`); the check "keyboard Tab reaches Retry" records the Tab count and the
  focus-visible outline on Retry. Driver:
  `scripts/audit/browser/proof-ph-arch-001-recovery.mjs`.

## Root Cause

The error panel is rendered inside `immersive-canvas-area`, after the HUD controls in the
document order, and nothing focuses it when `loadError` is set.

## Recommended Remediation Boundary

Move focus to the Retry button (or the panel heading) when `loadError` becomes set, and
return it sensibly on Retry. `src/renderer/components/GameScreen.tsx`.

## Required Regression Proof

- Deterministic unit/integration proof: a `GameScreen` test where a rejected preflight
  leaves focus inside the panel.
- Web proof: `proof-ph-arch-001-recovery.mjs` reaches Retry in one press or none in
  Chromium, Edge and Firefox.
- Broader regression command: `npx vitest run src/renderer/components/GameScreen.test.tsx`

## Challenge Record

- Independent reproduction attempt: the three browser runs on 2026-10-20 gave 54, 54 and 55
  presses with the same fault.
- Alternative explanations tested: headless focus behaviour. Retry did take focus with a
  visible outline after the walk, so Tab order works; only the starting point is wrong.
- Scope/severity changes: none.
- Deduplication decision: new. PH-ARCH-001 fixed the stuck "Loading" state; this is the
  focus placement of its panel.
- Challenger conclusion and date: accepted at P3, 2026-10-21.

## Resolution

- Accepted/rejected rationale: accepted 2026-10-21.
- Fix branch/commit/issue: `remediation/p11-s10-dialogs` (slice 10, single commit at the branch tip), implemented and independently reviewed 2026-11-02; merged to `main` in `e1a3bf0`; `fixed`, not `verified`: the owner Edge and Firefox pass (sitting 3 item 3) and a screen-reader read of the error panel are owed. Base `c1a1fbf`.
- What changed: `GameScreen.tsx` keeps a ref on the load-error Retry button and an effect on `loadError` focuses it when the error panel appears and again after a failed retry. No state or load logic changed.
- Tests (`GameScreen.test.tsx > moves focus to Retry when the load fails and again after a failed retry`; source identity `c1a1fbf`): failed before the fix (focus stayed on `body`) and passes after it.
- Driver result: `scripts/audit/browser/proof-ph-arch-001-recovery.mjs` against the built web server, headless Chromium 141: 83 pass, 0 fail. Its older `keyboard Tab reaches Retry` and `Retry shows focus-visible` checks pass only because the driver Tabs 56 times around the page back to Retry, so they do not prove the initial focus. This slice added one real check, `focus is on Retry when the panel first shows, before any Tab`, which passes in all five failure scenarios. The unit test above is the fail-before proof.
- Proof owed: no agent-runnable item left. Owner: Edge and Firefox (sitting 3 item 3). Human-only: screen-reader announcement of the error panel. (Correction 2026-11-02: the earlier owed Electron `keyboard-walk.mjs` parts (b), (c) and (e) cover the Calibrate dialog, Soundboard Escape and Clear Learning Progress focus, not this recovery panel, so they were never this finding's proof; they passed on the main build anyway, see PH-UI-010 and PH-UI-017.)
- Main-build proof, 2026-11-02 (`d393474`): `scripts/audit/browser/proof-ph-arch-001-recovery.mjs`, built web server, headless Chromium 141, passed 83 of 83 with 0 page errors, including `focus is on Retry when the panel first shows, before any Tab` in all five failure scenarios (`getSetting`, `getUserStats`, `getCustomFingerings` and MIDI bytes 500, MIDI network abort). Programmatic focus on Retry reports `focusVisible: false` in this mouse-driven headless run; the ring after keyboard arrival is covered by the driver's Tab checks. Not exercised in Electron.
- Residual risk: none expected beyond the owed runtime proof.
- Revisit trigger: reviewer verification and the runtime proofs above.
