# PH-UI-019: Ctrl+0 cannot reset the zoom because the computer keyboard takes Digit0 as a note

- Lane: UI
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-20
- Verifier: TBD
- Affected runtime: both
- Coverage rows: RT-006
- Related/duplicate findings: PH-UI-002 (Settings at desktop zoom), PH-UI-012 (HUD overlaps at zoom); none duplicate
- First observed against: `main` at source identity `4466626`, sitting 1 visual run 2026-10-20

## User Impact

A user who zooms in with Ctrl+= (or Ctrl+Shift+= on the desktop) and presses Ctrl+0 to
go back to 100 % gets a piano note instead, and the zoom stays where it was. Ctrl+0 is
the standard reset in Chrome, Edge, Firefox and Electron, and people who zoom for
readability use it often. The workaround is to step back with Ctrl+- or use the
browser menu, so P3. The same handler also takes every other mapped key with Ctrl held,
so other Ctrl shortcuts on mapped letters are likely blocked too (Ctrl+R was not tested).

## Expected Behavior Or Oracle

Browser and window shortcuts with Ctrl or Meta held reach the browser. The app's own
global handler already treats Ctrl and Meta as shortcuts (`App.tsx:1264`), not notes.

## Evidence

### Environment

- Commit/patch identity: source `4466626`
- OS/runtime/browser: real Chrome 151 and the packaged Linux app (built from HEAD in a
  throwaway copy), on `Xvfb` with `xfwm4`; real key events through XTEST
- Data profile/fixture: fresh profiles under `$TMPDIR/p11/S1V`

### Reproduction

1. Zoom in once (Chrome: Ctrl+= to 125 %; desktop: Ctrl+Shift+= to 120 %).
2. On Settings, Free Play or Library, press Ctrl+0.
3. The zoom stays at 125 % (Chrome) or 120 % (desktop). The page's keydown log shows
   `Digit0` with `ctrl: true` and `defaultPrevented: true`.
4. On the desktop the main menu behaves the same. In Chrome, Ctrl+0 on the main menu
   did reset, but the key never reached the page there, so that screen is inconclusive.

Side observation (desktop only, no finding): Ctrl+= does nothing in the packaged app.
Zoom in works only with Ctrl+Shift+= (a literal +), because the default Electron menu
binds zoom in to `CommandOrControl+Plus`. Its steps are 110, 120, 131, 144, 158, 173,
189 and 207 %.

### Artifacts

- `src/lib/input/computerKeyboardInputService.ts:149-163` (`handleKeyDown`): it looks
  up `event.code` and calls `preventDefault()` with no check for `ctrlKey`, `metaKey`
  or `altKey`.
- `src/lib/input/settings.ts:89`: the default map binds `note-32` to `Digit0`.
- `$TMPDIR/p11/S1V/c-ctrl0.out`, `$TMPDIR/p11/S1V/d-ctrl0.out`.
- Drivers: `scripts/audit/browser/sitting1-visual-chrome.mjs`,
  `scripts/audit/electron/sitting1-visual-desktop.mjs`.

## Root Cause

The computer keyboard input service treats any mapped key as a note, whatever the
modifiers, and stops the browser from acting on it.

## Recommended Remediation Boundary

Return early from `handleKeyDown` (and the matching `handleKeyUp`) when Ctrl, Meta or
Alt is held, before `preventDefault`. Shift stays a velocity modifier.
`src/lib/input/computerKeyboardInputService.ts`.

## Required Regression Proof

- Deterministic unit/integration proof: a keydown of a mapped code with `ctrlKey` or
  `metaKey` emits no note and is not default-prevented; Shift still plays the note
  louder.
- Web proof: `sitting1-visual-chrome.mjs` Ctrl+0 resets 125 % to 100 % on Settings,
  Free Play and Library.
- Electron proof: `sitting1-visual-desktop.mjs` Ctrl+0 resets the zoom factor to 1.
- Broader regression command: `npx vitest run src/lib/input`

## Challenge Record

- Independent reproduction attempt: the lead read the handler and the default map and
  confirmed the path; the keydown logs from both runtimes show the prevented event.
- Alternative explanations tested: the window manager taking the key. The page
  receives the event in both runtimes, and other zoom keys reach the browser.
- Scope/severity changes: none.
- Deduplication decision: new. PH-UI-002 and PH-UI-012 are layout problems at zoom.
- Challenger conclusion and date: accepted at P3, 2026-10-20.

## Resolution

- Accepted/rejected rationale: accepted 2026-10-20.
- Fix branch/commit/issue: none.
- Verification evidence: none yet.
- Residual risk: as stated in User Impact.
- Revisit trigger: the next remediation wave selection.
