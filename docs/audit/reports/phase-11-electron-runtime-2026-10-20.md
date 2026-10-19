# Phase 11 Lane F: Electron Runtime Half

- Status: complete for the rows below; the limits section lists what this run cannot prove.
- Source identity: `main` at `6e549b6` plus audit-only commits. Desktop build: the existing
  `out/` bundle (built 2026-10-19 17:07, after the last source commit); the audit did not
  rebuild it.
- Runner: Claude Code (acting)
- Date: 2026-10-20
- Drivers: [`scripts/audit/electron/`](../../../scripts/audit/electron/README.md)
- Companion reports: [lane F web workflows](phase-11-lane-f-workflows-2026-10-19.md),
  [lane F library and recording](phase-11-lane-f-library-recording-2026-10-19.md),
  [lane F setup and settings](phase-11-lane-f-setup-settings-2026-10-19.md)

## Why This Run Exists

Earlier Phase 11 notes said the Electron runtime could not run in the agent sandbox, so
every desktop half of the workflow matrix was staged for the owner (sittings 0 to 2).
A headless harness now runs the real desktop app (`out/main`, `out/preload`,
`out/renderer`) under Playwright. With it, the agent proved the desktop rows itself,
and the owner's batch keeps only what needs a person or other hardware.

## Harness

- Electron 30.5.1 from `node_modules/electron`, launched by Playwright 1.56.1
  `_electron.launch` with `--no-sandbox --disable-gpu --ozone-platform=headless`.
- `launcher.cjs` is the app entry. It refuses to start unless `LK_PROFILE` is under
  `$TMPDIR`. It pins `appData` and `userData` inside that profile and sets
  `app.getAppPath()` to the repository root, which an unpackaged run would otherwise
  report as the launcher directory. Then it imports `out/main/index.js` unchanged.
- `hooks.mjs` (ESM loader hooks) redirects two imports of the main bundle and nothing
  else:
  - `electron` goes to `electron-shim.mjs`, whose `BrowserWindow` forces `show: false`
    and `offscreen: true`. A visible window crashes Electron with no display.
  - `better-sqlite3` goes to an Electron-ABI copy under
    `$TMPDIR/p11/EL/electron-modules/`. It was built with `prebuild-install` for
    Electron 30, so the repository's Node-ABI build stays untouched.
- Native dialogs are replaced in the main process (`dialog.showOpenDialog`,
  `showSaveDialog`, `showMessageBox`) through `app.evaluate`. Each stub returns a fixed
  path or a cancel. All other IPC handlers, file writes, and SQLite calls are the
  app's own.
- `electron-harness.mjs` provides relaunch and SIGKILL relaunch on the same profile,
  plus dialog stubs and page-text helpers.
- Node-side checks open the profile's `lumakeys.db` read-only with the repository's
  Node-ABI `better-sqlite3`.

### What the harness changes and therefore cannot prove

- `userData` is pinned. The real path selection is what
  [PH-DATA-005](findings/PH-DATA-005.md) is about, so that finding keeps its own probe
  and its Windows sitting item.
- Windows render offscreen, so nothing here proves real pixels on a display, GPU paths,
  focus between OS windows, or window-manager behaviour.
- No audio device is attached, so the audio here is either Tone's offline render
  (WAV export) or engine log lines. Nothing here was listened to.
- No MIDI devices are attached. Electron grants the MIDI permission by default (the app
  sets no permission handler), so the web-only prompt finding
  [PH-PAR-007](findings/PH-PAR-007.md) does not apply here.
- The dialog stubs skip the OS file picker, so filters and default paths in the picker
  are not covered.

## Results By Row

All runs used fresh profiles under `$TMPDIR/p11/EL2/`. Every driver ended with no page
errors and no console errors. Two exceptions are expected: the sample-pack removal
errors described under WF-019, and Electron's insecure-CSP warning (observation 5).

| Row | Desktop result | Evidence summary | Driver |
|---|---|---|---|
| WF-001 | pass with defect | First launch shows the setup guide with defaults Off and Medium. "Skip for now" and "Start Practice" both store the guide's choices and land on the main menu, and relaunch goes straight to the main menu. Three runs covered reminder 10, 20 and 30 minutes and hand size small, medium and large, one through a Keyboard Setup round trip that keeps the choices. Each value survives a relaunch and reads back in the guide (reopened from the main-menu card) and in Settings. Skipping with the default stores `practice.postureReminderMinutes = "off"` ([PH-ARCH-003](findings/PH-ARCH-003.md)) | `workflows.mjs`, `setup-guide-choices.mjs` |
| WF-003 | pass with defect | Keyboard Setup: "C4 set to K."; after relaunch the mapping still has C4 on `KeyK` and pressing K in Free Play lights C4. The unbind defect [PH-DATA-008](findings/PH-DATA-008.md) is in shared settings code, so it applies to the desktop too | `ipc-workflows.mjs` |
| WF-004 | pass with defect | Two valid files: "Imported 2 songs." Duplicate: "1 already in library." Empty, corrupt and `.txt` files: "3 failed (empty: undefined; corrupt: Cannot read properties of undefined (reading 'forEach'); notes.txt: undefined)" ([PH-PAR-004](findings/PH-PAR-004.md)). Cancel: "Import canceled." Two content-addressed files on disk | `workflows.mjs` |
| WF-005 | pass with defect | Folder import recurses into subfolders and accepts `.MIDI`: "3 songs imported, 1 already in library, 1 failed (bad: …forEach)". It does not follow a symlink loop. Missing folder: "No MIDI files found in that folder." Cancel: "Import canceled." | `workflows.mjs` |
| WF-006 | pass | Missing file: the library card gives no hint. Play shows "PRACTICE UNAVAILABLE" with the raw IPC error (observation 1) and Menu, Retry, Main Menu. Reattach with another song's file: "1 failed (minuet-in-g: Selected MIDI does not match this song.)". The right file: "Reattached 1 MIDI file.", after which the song loads. Cancel: "Reattach canceled." | `backup-reset-restore.mjs` |
| WF-007 | pass | Folder, tags, favourite and playlist set through the preload bridge all survive a relaunch. The library screens themselves were proven on the web (lane F library report) | `ipc-workflows.mjs` |
| WF-008 | pass | `trackAssignments` changed from `{"track-0":"right","track-1":"left"}` to the reverse and survives a relaunch | `ipc-workflows.mjs` |
| WF-009 | pass with defect | Learning: four computer-keyboard notes score 375 (3 perfect, 1 good). Play: 325 (2 perfect, 1 good, 1 ok). [PH-MUS-005](findings/PH-MUS-005.md) reproduces exactly: after Escape and Resume, focus is on the Menu button and 30 D4 presses score nothing; after one canvas click D4 scores | `workflows.mjs` |
| WF-010 | pass | Both runs reach Results (93.8 % and 81.3 % accuracy). The stored rows are `["luma-keys",325,2,1,1,0]` and `["learning",375,3,1,0,0]` | `workflows.mjs` |
| WF-011 | pass with defect | Two lesson tips give "2 / 3 STEPS", and that survives a relaunch. `loadCurriculumMidi('ode-to-joy.mid')` returns 614 bytes, matching the file on disk. `'../../package.json'` is reduced to `....package.json` and fails with ENOENT inside `public/curriculum-midis`. Lesson 1's step 3 drill played on time (eight C4 presses timed from the end of the count-in) scores eight Perfects and returns to the lesson at "3 / 3 STEPS"; "Complete Lesson" then stores the lesson. With all six tier-1 lessons stored and gating on, the first Beginner lesson is locked. The Ode to Joy capstone (learning mode, right hand, 90 % tempo) played note by note judges all 62 notes, stores `capstoneResults {"novice":100}`, returns to the hub and unlocks the first Beginner lesson, which is still unlocked after a relaunch. A C4 pressed before Space or during the count-in scores the drill's first note ([PH-MUS-012](findings/PH-MUS-012.md)) | `ipc-workflows.mjs`, `lesson-pass.mjs`, `paused-input.mjs` |
| WF-012 | pass | Chord quiz saved as `["quiz",8,10]` | `ipc-workflows.mjs` |
| WF-013 | pass | Interval session reaches its 10-question summary; saved as `["interval-trainer",3,10]` | `ipc-workflows.mjs` |
| WF-014 | pass | C major drill scores 7 of 8 with C4 remapped to K, as expected | `ipc-workflows.mjs` |
| WF-015 | pass with defect | Export MIDI and Export WAV are disabled until something is recorded. Four played notes are captured. Export MIDI: "Saved recording to …take.mid"; the file holds C4, E4, G4, C5 with onset gaps of 502, 497 and 601 ms against 500, 500 and 600 played. Cancel: "MIDI export cancelled." Export WAV: "WAV saved to …take.wav"; the file is 6.26 s, 16-bit stereo 44.1 kHz with every sample zero ([PH-MUS-007](findings/PH-MUS-007.md)). The same renderer, offline-rendering a plain Tone synth, writes non-silent audio (peak 0.58), so the silence comes from the product code path | `freeplay-export.mjs` |
| WF-017 | pass with defect | The dashboard renders streak, practice time, songs and accuracy from stored rows. Trouble-spot measures read "Measures 0–0" ([PH-UI-005](findings/PH-UI-005.md) on the desktop too). The odd accuracy in this run came from the seed data, not the app | `ipc-workflows.mjs` |
| WF-018 | pass | Settings: "Changes saved."; theme light and volume 55 both survive a relaunch | `ipc-workflows.mjs` |
| WF-019 | pass | Flute, then Install Better Sounds: "Flute Enhanced Pack ready."; 10 files appear under `<userData>/instrument-sample-packs/flute/`. The resolved base URL is `file:////…/flute/` (four slashes); fetching `C4.mp3` from it returns 190,962 bytes. No sampler errors after install or after a relaunch. Remove: "Flute reverted to bundled audio."; the directory is gone and the built-in sampler loads (observation 2). The web half fails: [PH-PAR-006](findings/PH-PAR-006.md) | `sample-pack.mjs` |
| WF-020 | pass | Export Library writes `backup.json` (version, exportedAt, songs, folders, playlists, fingerings, settings, and `midiFiles` with base64 bytes). Garbage file: "Invalid library backup file." One flipped base64 character: "MIDI backup content does not match <id>." with 0 songs written. Valid file: "Imported 3 songs, 0 folders, 0 playlists, and 3 MIDI files." Cancel changes nothing | `backup-reset-restore.mjs` |
| WF-021 | pass | The reset dialog takes focus; Escape and Cancel both close it. Confirming clears game results and keeps all 3 songs | `backup-reset-restore.mjs` |
| WF-022 | pass | Delete all data leaves 0 songs, an empty `midi-files`, and empty localStorage; relaunch shows the setup guide again | `backup-reset-restore.mjs` |
| WF-023 | pass | SIGKILL right after a result write and a settings write, then relaunch: 3 songs, 1 result, setting `"0.42"`; `PRAGMA integrity_check` ok; journal mode WAL | `backup-reset-restore.mjs` |
| WF-024 | pass | All nine main-menu destinations return to the main menu. Keyboard Setup has no back button and returns through the top-nav "Main" | `workflows.mjs` |
| MOD-014 | reproduced defects | A Soundboard credit link opens an in-app window on the remote page. Inside it `window.appBridge` and `require` are undefined, `opener` is null, and the window is sandboxed, but it can navigate freely ([PH-SEC-005](findings/PH-SEC-005.md), now reproduced). The main window is sandboxed by Electron's default (no explicit `sandbox` option) with context isolation on, and runs with no CSP ([PH-SEC-003](findings/PH-SEC-003.md), scope widened) | `window-open.mjs`, `setup-guide-choices.mjs` |

Not run on the desktop, and why:

- WF-002: no MIDI hardware.
- WF-016: soundboard audio needs a listener.
- WF-025: MuseScore conversion is a web-server feature, and its Docker half is in
  sitting 0.
- WF-026: the main-menu video and reduced-motion behaviour are covered on the web by
  lane E. The OS reduced-motion setting is in sitting 1.

## Web Cross-Check

`scripts/audit/browser/sample-pack-engine-log.mjs` installed the Flute pack on the web
build and reloaded three times. Every load logs "[AudioEngine] Failed to load custom
sampler: TypeError: Failed to fetch" and then loads the built-in sampler. This is the
runtime proof for [PH-PAR-006](findings/PH-PAR-006.md).

## Observations (no finding)

1. The desktop error copy shows raw IPC wrapper text, for example "Unable to load song:
   Error invoking remote method 'file:load-midi': Error: ENOENT: no such file or
   directory, open '<full path>'". Library import errors do the same ("Import failed:
   Error invoking remote method 'library:import': Error: …"). Lane D already records this
   as an observation; it is noted here because these runs show it on four screens.
2. Removing an installed pack briefly asks for the deleted files before falling back:
   10 `ERR_FILE_NOT_FOUND`, "Failed to load custom sampler", "Failed to load sampler",
   and "Using synth fallback", then the built-in sampler loads. `App.tsx:760-780` calls
   `setInstrument` before `clearCustomSampler`. The user sees only the success message,
   and playback ends on the built-in sampler, so this is not raised.
3. The pack's base URL is built as `` `file:///${path}` `` with backslashes turned into
   slashes (`instrumentSamplePackStore.ts:101,139`). On Linux that gives four slashes,
   which Chromium accepts (the C4 fetch above). On Windows it gives the standard
   `file:///C:/…/` form. Windows was not run.
4. Export Library's cancel leaves the previous status message on screen, so a cancel
   looks like a repeat of the last export (`LibraryScreen.tsx:432-435` sets a message
   only when a result comes back).
5. Every launch logs Electron's "Insecure Content-Security-Policy" warning. The drivers
   filter it from their error lists except `setup-guide-choices.mjs`, which keeps it as
   the evidence now cited in PH-SEC-003.
6. With no window-open handler, a click on a credit link in headless Electron kills the
   app process (`NO_HANDLER=1`, two runs). Any visible window does this without a
   display, so it says nothing about the product on a desktop.
7. The right-hand capstone includes the bridge's low G3 (midi 55) at 38.3 s. The parser marks
   that note left-handed by the C4 split, but `filterSongByHand` uses the track assignment, and
   the file's single track is assigned `right`, so the note stays and learning mode waits for it.
   That is musically right (the phrase ends on that G). On the computer keyboard it is `B`
   (note-7). The audit's first lesson driver left it out and stalled there; the stall was the
   driver's, not the app's.

## Evidence

Raw output stays in `$TMPDIR/p11/EL2/` and is not committed.

| Driver | Output | sha256 |
|---|---|---|
| `workflows.mjs` | `wf.out` | `d5b1a9d2…07911e19` |
| `backup-reset-restore.mjs` | `brr.out` | `9b0383b6…02809da9` |
| `freeplay-export.mjs` | `fpx.out` | `e90f6f8d…5d98fe8e` |
| `freeplay-export.mjs` WAV | `fpx/take.wav` | `317fde61…dcc7eef44` |
| `sample-pack.mjs` | `pack.out` | `3ed28ada…ff788f1c82` |
| `ipc-workflows.mjs` | `ipc.out` | `2b13fb7b…6b84561f` |
| `setup-guide-choices.mjs` | `setup.out` | `4b4b4d6a…f135462e` |
| `window-open.mjs` | `wo.out` | `2136a3e1…1ffb90a63` |
| `window-open.mjs` with `NO_HANDLER=1` | `wo-nh.1.out`, `wo-nh.2.out` | `48cd343c…836acb4` (both) |
| `browser/sample-pack-engine-log.mjs` | `web-pack.out` | `bbd7ad2d…fbeb0860` |
| `lesson-pass.mjs` | `lesson.out`, `lesson.2.out` (press timings differ; outcomes match) | `78a27bdf…4934d445`, `1820c613…8e37d757` |
| `paused-input.mjs` | `paused.out`, `paused.2.out` | `e208116e…e4b821ae` (both) |
| `../paused-input-probe.ts` (engine, `node --import tsx`) | `paused-probe.out` | `0b4e581e…58aee527` |
| `../capstone-accuracy-probe.ts` (engine, [PH-MUS-013](findings/PH-MUS-013.md)) | `capstone-probe.1.out`, `.2.out` | `3250f768…469166c5` (both) |

## Effect On The User Batch

These runs supersede the following owner items:

- Sitting 0, item 1 (window-open probe).
- Sitting 1, item 6 (PH-MUS-005 in Electron).
- The Electron halves of WF-001, WF-004, WF-005, WF-007, WF-008 and WF-015 in sittings
  1 and 2, except anything that needs real audio or a Windows path.
- The capstone pass for WF-011, which no sitting had to carry because the drill and
  capstone run headless.

Items that still need a person are listed in
[phase-11-user-tests.md](phase-11-user-tests.md).
