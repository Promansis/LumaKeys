# Phase 11 Lane F: Input, Settings, Sample Packs, And Lessons (web)

- Status: complete for the web half of WF-002, WF-003, WF-011, WF-018 and WF-019. The
  desktop half is in the [Electron runtime report](phase-11-electron-runtime-2026-10-20.md).
- Source identity: `main` at `6e549b6` plus audit-only commits; web build from `npm run build:web`
- Runner: agent FA (Sonnet) ran the drivers on 2026-10-19 on ports 3781 to 3784. It
  stopped before writing a report. The lead (Claude Code, acting) wrote this report
  on 2026-10-20 from FA's output, after checking every defect claim against source.
  Two of FA's claims were corrected on the way (see Challenge Summary).
- Drivers: [`scripts/audit/browser/`](../../../scripts/audit/browser/README.md)
  `midi-permission-fallback.mjs`, `keyboard-remap-persistence.mjs`,
  `settings-roundtrip.mjs`, `sample-pack-lifecycle.mjs`, `lesson-progression.mjs`, and
  the shared helpers in `setup-common.mjs`

## Method

The method is the same as the [lane F web workflows report](phase-11-lane-f-workflows-2026-10-19.md):

- headless Chromium (Playwright 1.56.1)
- the built web server started in-process
- a fresh `LUMAKEYS_DATA_DIR` per run under `$TMPDIR/p11/FA/`

Two drivers needed extra setup:

- **MIDI.** `navigator.requestMIDIAccess` is replaced before page scripts run
  (`addInitScript`) by a stub with seven states:
  - API absent
  - permission rejected
  - prompt pending (never answered until released)
  - granted with no devices
  - granted with one device (`Fake Piano 88`)
  - device unplugged and replugged mid-song
  - the saved device gone while another (`Fake Second Keys`) is present

  Stub inputs send note-on and note-off messages through `onmidimessage`.
- **Save and load failures.** These come from Playwright routes that answer
  `/api/bridge/setSetting` or `getSetting` with HTTP 500, or abort the connection.

Raw output and screenshots stay in `$TMPDIR/p11/FA/`.

## Results By Row

| Row | Web result | Evidence summary | Desktop half |
|---|---|---|---|
| WF-002 | pass with defects | **With the API absent or permission rejected:** Settings shows "LumaKeys cannot access your MIDI keyboard. Check browser or system permission, then try again." with Try MIDI Again; the game lists "No devices detected"; the computer keyboard scores.<br>**Granted:** with no devices, the card reads "Any connected device"; one device is listed by name in Settings and the game, and its note 60 scores. After a rejection, plugging a device changes nothing until Try MIDI Again, which then lists it.<br>**Defects:** while the permission prompt is unanswered the whole app waits on "Loading services..." ([PH-PAR-007](findings/PH-PAR-007.md)). Unplugging or replugging a device mid-song restarts the song, whether the stub drops the port from `inputs` or keeps it marked `disconnected` (browsers do either) ([PH-MUS-010](findings/PH-MUS-010.md)). A saved device that is gone keeps filtering input while Settings reads "Any connected device": 45 notes from the other device score nothing, and clearing the filter fixes it ([PH-MUS-011](findings/PH-MUS-011.md)) | needs hardware: sitting 4 |
| WF-003 | pass with defect | Remap C4 to K: "C4 set to K."; K scores in the game and Comma does not; the binding survives a reload and a server restart. Shift, CapsLock and Control are refused ("ShiftLeft is not supported. Try another key."); Escape cancels with "Binding canceled." Reset restores the defaults. A failed save (HTTP 500 or abort) says "Mapping active for this session only. Save failed; try again." with a toast, and a reload reverts the binding. Binding a key that is already used moves it and shows the old note as Unbound, but after a reload the old note gets its default back, so one key plays two notes; "Clear" has the same problem ([PH-DATA-008](findings/PH-DATA-008.md)) | proven ([Electron report](phase-11-electron-runtime-2026-10-20.md)) |
| WF-011 | pass with defects | The hub shows 0 of 30 lessons in 5 tiers. Two tips in lesson 1 give "2 / 3 STEPS", stored through the bridge in `learning.completedSteps`, and that survives a reload and a server restart. With gating on, lessons 2 and 3 are disabled. The tier capstone stays disabled until all six tier-1 lessons are complete, then opens; an attempt with no input stays in the game with Resume and Back to Learn Hub, and stores nothing. A drill that falls short of the pass mark returns to the lesson with "IN PROGRESS" and no score or target ([PH-UI-018](findings/PH-UI-018.md)). When the progress save fails, the step looks done, no message appears, and a reload loses it ([PH-DATA-009](findings/PH-DATA-009.md)) | proven (tips, persistence, curriculum MIDI) |
| WF-018 | pass | One setting per tab was changed (metronome sound, volume, theme, hit window, input mode, daily goal). Each applies at once, and each reads back the same from the UI and the settings table after a reload and after a server restart. A failed save says "Save failed. The change is active for this session only." with a toast, and a reload restores the stored value. A load failure says "Some saved settings could not be loaded. Defaults are active for this session." Delete user data empties the table and restores the defaults | proven |
| WF-019 | fail ([PH-PAR-006](findings/PH-PAR-006.md)) | Install stores 10 assets (1,767,518 bytes) in IndexedDB; the status says "Flute Enhanced Pack ready." and the card says "installed". This survives a reload and a server restart. Every sampler load then requests 10 `undefinedblob:` URLs and falls back to the built-in sounds. The failure paths work: manifest 404, manifest not JSON, wrong manifest shape, one asset 404, aborted connection and offline each give "Flute Enhanced Pack could not be installed." with a toast, and a retry succeeds. Remove clears the store. Delete user data deletes the IndexedDB database | proven working |

## Findings Raised

| ID | Severity | Summary |
|---|---|---|
| [PH-PAR-006](findings/PH-PAR-006.md) | P2 | Web "Install Better Sounds" stores the pack but never plays it |
| [PH-MUS-010](findings/PH-MUS-010.md) | P2 | Connecting or disconnecting any MIDI device restarts the song being played |
| [PH-MUS-011](findings/PH-MUS-011.md) | P2 | A saved MIDI device that is gone keeps filtering input while Settings reads "Any connected device" |
| [PH-PAR-007](findings/PH-PAR-007.md) | P2 | The web app stays on "Loading services..." until the MIDI permission prompt is answered |
| [PH-DATA-008](findings/PH-DATA-008.md) | P3 | Unbinding a key does not survive a reload, so remapped keys come back doubled |
| [PH-UI-018](findings/PH-UI-018.md) | P3 | A lesson drill that falls short returns to the lesson with no score and no target |
| [PH-DATA-009](findings/PH-DATA-009.md) | P3 | Lesson progress that fails to save is lost without a message |

## Observations (no finding)

- **Unusual keys can be bound.** Tab, F5, Enter and ArrowLeft are all accepted, and the
  bound key's default action is then prevented everywhere. A Tab binding stops Tab
  from moving focus on every screen. The user has to choose this, Reset fixes it, and
  only the browser refresh key is at real risk.
- **After a failed save, Settings shows the stored value.** Reopening Settings in the
  same session shows the stored value in the select while the page still uses the
  unsaved one (for example, select "light" while the theme is dark).
- **One bad pack record resets the session's settings.** If one installed-pack record
  in IndexedDB lacks its asset list, startup fails into the `App.tsx:478` catch and
  every setting falls back to its default for the session. The stored theme "warm"
  showed as dark, with the load-failure message. "Use Built-in Sounds" removes the
  record and the next load is clean. Normal use cannot write that record, so this is
  noted for robustness only.
- **Undecodable pack audio fails silently.** Pack audio that does not decode starts
  with no error at all. The pack still reads "installed", which is the same silent
  fallback as PH-PAR-006.
- **The input-mode change shows a different status line.** It reports "Ready. Changes
  save automatically." where the other settings say "Changes saved."; the value is
  stored either way.
- **MIDI-only mode can leave the player with no input.** With the Web MIDI API absent,
  MIDI-only mode ignores the computer keyboard as designed. The game overlay says
  "INPUT MODE MIDI" and "No devices detected", and nothing explains why the keys do
  nothing.
- **Lesson drills do not write game results.** No `game_results` row is written for
  a lesson drill, so drills never appear in Progress.
- **The project docs name the wrong store for lesson progress.** Progress lives in the
  settings table (`learningProgress.ts:61-73`), not in localStorage as `CLAUDE.md`
  says. Lane H already records this (row 109).

## Challenge Summary

- FA's "passing drill" (71 mashed C4 presses) did not reach the pass mark, so the step
  stayed open. The lead re-read `App.tsx:1053-1071`: a drill counts only at
  `passAccuracy` (70 % by default). That makes the shortfall path the observed one
  and the basis of PH-UI-018, not a failure to record a pass. A real pass on the web
  was not driven. On the desktop the curriculum MIDI path and step persistence were
  proven instead.
- FA's notes said the gone-device state in PH-MUS-011 could not be repaired in
  Settings. The source shows any choice in the select writes a new value
  (`SettingsScreen.tsx:1705-1713`), so the finding says the select shows blank and
  choosing any option repairs it.
- The MIDI states are a stub, not a browser permission flow. PH-PAR-007 is grounded in
  source (`App.tsx:389-406`: `setMidiReady` runs only in `finally`, and
  `midiInputService.ts:37` has no timeout). The first-visit prompt on a real browser
  is staged for the owner (sitting 3).
- PH-MUS-010 was checked against the render path: the device list lives in `App`
  state, `source={{…}}` is rebuilt on each render at `App.tsx:1657/1685/1727`, and
  `GameScreen.tsx:692` reloads the song when `source` changes.

## Evidence

| Driver | Output | sha256 |
|---|---|---|
| `midi-permission-fallback.mjs` | `midi.final.out` | `759061f4…607308e9` |
| `keyboard-remap-persistence.mjs` | `kbd.final.out` | `58475bf8…9e180a35` |
| `settings-roundtrip.mjs` | `settings.final.out` | `888383dd…19ec5189` |
| `sample-pack-lifecycle.mjs` | `pack.final.out` | `391c4497…44d0dccb` |
| `lesson-progression.mjs` | `lesson.out` | `5dce8870…17de3e73` |
