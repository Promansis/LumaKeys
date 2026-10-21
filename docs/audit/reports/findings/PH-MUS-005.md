# PH-MUS-005: Computer-keyboard notes are ignored whenever an on-screen button has focus

- Lane: MUS
- Severity: P2
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: both (shared renderer code); reproduced in the web build and in Electron
- Coverage rows: WF-003, WF-009, WF-014, WF-015, RT-008
- Related/duplicate findings: PH-UI-001 (its focus-return fix makes this reachable in the game loop)
- First observed against: `main` at source identity `4466626`, Phase 11 lane F, 2026-10-19

## User Impact

A player without a MIDI keyboard plays notes on the computer keyboard. After any
mouse click on a button, that button keeps focus and every note key is silently
dropped until the player clicks somewhere that is not a button. Three common paths
hit this:

- Game: pause with Escape or Menu, then click **Resume**. Focus returns to the Menu
  button (the PH-UI-001 accessibility fix), and the run continues with no input.
  In Learning mode the run waits forever on a note the player is pressing.
- Scale Practice: click **Start Drill**. The drill stays at 0 of 8 while the player
  plays the scale correctly.
- Free Play: any focused HUD button stops the keys from sounding.

There is no message; the app looks frozen or broken. Severity P2: a core practice
workflow fails for computer-keyboard users, with a non-obvious workaround.

## Expected Behavior Or Oracle

Note keys reach the input service regardless of which button has focus. Only keys
that would also activate the focused button (Space, Enter) need suppressing.

## Evidence

Headless Chromium against the web build, isolated data directory (lane F report).

| Path | Focus after the click | Notes scored or sounded |
|---|---|---|
| Learning run, before pausing | body | C4 hit, score 100 |
| Same run after clicking Resume | the Menu button | D4 pressed 30 times, score unchanged |
| Same run after clicking the canvas | body | D4 hit, score 200 |
| Scale Practice after Start Drill | the Start Drill button | 0 of 8 |
| Same drill after blurring the button | body | 8 of 8, "Scale complete. Accuracy 100.0%." |
| Free Play with the HUD button focused | the HUD button | key no longer lights |

Source: `src/lib/input/computerKeyboardInputService.ts` `isEditableTarget` returns
true for `BUTTON` (added in `bce5ade`, 2026-04-02), and `handleKeyDown` returns early
for editable targets. `GameScreen.tsx` passes `menuButtonRef` as the focus-trap
trigger, so closing the overlay focuses that button.

## Root Cause

The editable-target guard treats a focused button like a text field and drops all
keys, not just the activation keys.

## Recommended Remediation Boundary

In `isEditableTarget` (or the caller), treat `BUTTON` as editable only for `Space`
and `Enter`. Keep INPUT, TEXTAREA, SELECT, and contenteditable as they are. Do not
undo the PH-UI-001 focus return.

## Required Regression Proof

- Unit: `computerKeyboardInputService.test.ts` case with a focused button: a note key emits `noteon`; Space and Enter do not.
- Component: GameScreen test that opens and resumes the overlay, then dispatches a note key and expects the session to ingest it.
- Runtime: repeat the lane F pause-and-resume driver; D4 must score immediately after Resume.

## Challenge Record

- Alternative explanation tested: the run was paused or not started. Ruled out by clicking the canvas with no other change, after which the same key scored at once.
- Scope/severity changes: none.
- Electron reproduction, 2026-10-20 (`scripts/audit/electron/workflows.mjs`, `$TMPDIR/p11/EL2/wf.out` sha256 `d5b1a9d2…07911e19`): Learning run, C4 scores (`0 -> 100`); Escape, click Resume; focus is the Menu button; D4 pressed 30 times leaves the score at 100; after clicking the canvas D4 scores (`100 -> 200`). Same sequence and result as the web.
- Challenger conclusion and date: reproduced, 2026-10-19; Electron 2026-10-20
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P2; deduplication: canonical for keys dropped while a control has focus. PH-MUS-012 (input while stopped) and PH-DATA-008 (unbind persistence) have different roots. Accepted.
- Owner sitting run by the agent, 2026-10-20: reproduced on the desktop in [sitting 1](../phase-11-owner-sittings-2026-10-20.md#sitting-1-linux-display-and-speakers) item 5b. On the Soundboard (Animals kit), after clicking Resume, focus is on `button.immersive-menu-btn`; Z, X and C pressed 700 ms apart give a recording with no sound at all. After focus moves to the page body, the same keys sound.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
