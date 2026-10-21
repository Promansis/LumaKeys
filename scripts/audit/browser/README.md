# Browser Drivers For Lane F

Playwright drivers used by the Phase 11 workflow matrix. Each one starts the built
web server (`dist/server/index.cjs`) on its own port with an isolated
`LUMAKEYS_DATA_DIR`, drives headless Chromium, and prints evidence lines. They
never touch the real data directory.

The server must start inside the same process as the browser (`harness.mjs` does
this), because sandboxed shells kill detached background processes.

## Setup (outside the repository)

```bash
npm run build:web
mkdir -p "$TMPDIR/pw" && cd "$TMPDIR/pw"
npm_config_cache="$TMPDIR/npm-cache" npm install playwright@1.56.1
PLAYWRIGHT_BROWSERS_PATH="$TMPDIR/pw/browsers" npx playwright install chromium
cp /media/storage/LumaKeys/scripts/audit/browser/*.mjs "$TMPDIR/pw/"
```

## Run

```bash
cd "$TMPDIR/pw"
DATA="$TMPDIR/laneF/data" SHOTS="$TMPDIR/laneF/shots" FIX="$TMPDIR/laneF/fixtures" \
  PLAYWRIGHT_BROWSERS_PATH="$TMPDIR/pw/browsers" node tour.mjs > "$TMPDIR/laneF/tour.out" 2>&1
```

Write output to a file, not through `head`: a pipe buffers everything until exit.

| Driver | Rows | What it proves |
|---|---|---|
| `harness.mjs` | all | server plus browser lifecycle, console and request-failure capture, `restart()` |
| `tour.mjs` | WF-024, WF-026 | every main-menu destination opens without console errors and has an exit path |
| `backup-reset-restore.mjs` | WF-020, WF-021, WF-022 | export, confirm dialogs, both resets, garbage and tampered restore |
| `reattach-and-overlay.mjs` | WF-006, WF-024 | missing-file recovery, reattach wrong, right, and cancel, game overlay Escape |
| `sigkill-restart.mjs` | WF-023 | writes survive SIGKILL; `integrity_check` is ok after restart |
| `play-short-song.mjs` | WF-009, WF-010 | Space starts, keyboard scores, results persist (`MODE=Learn` or `Play`) |
| `pause-resume-focus.mjs` | WF-009, PH-MUS-005 | keys stop scoring after clicking Resume |
| `scale-drill-focus.mjs` | WF-014, PH-MUS-005 | drill scores only after the Start Drill button loses focus |
| `freeplay-focus.mjs` | WF-015, WF-016, PH-MUS-005 | focused HUD button silences keys |
| `theory-trainers.mjs` | WF-012, WF-013, WF-014 | interval and quiz sessions complete and persist |
| `keyboard-remap-persistence.mjs` | WF-003, PH-DATA-008 | remap, reload and server restart, reset, duplicate, clear, rejected key, save failure |
| `midi-permission-fallback.mjs` | WF-002, PH-MUS-010, PH-MUS-011, PH-PAR-007 | MIDI permission denied or absent, scripted devices connecting and disconnecting, keyboard fallback |
| `lesson-progression.mjs` | WF-011, PH-UI-018 | lesson 1 drill, step persistence, failed drill, save failure, capstone reachability |
| `settings-roundtrip.mjs` | WF-018 | one setting per tab: apply, save, reload, server restart, read-back, reset default, save and load failures |
| `sample-pack-lifecycle.mjs` | WF-019 | web pack in IndexedDB: install, select, reload, remove, reset, corrupt record |
| `sample-pack-engine-log.mjs` | WF-019, PH-PAR-006 | which sampler the audio engine loads after "Install Better Sounds" |
| `pack-removal-web.mjs` | OP-006, PH-SEC-001 | the server refuses the pack methods; crafted ids leave both IndexedDB packs; removing Flute leaves Cello |
| `library-organize-bulk.mjs` | WF-007, PH-UI-006, PH-UI-008 | search, filter, sort, edit, folders, playlists and bulk actions against the database |
| `library-date-filter-timezone.mjs` | WF-007, PH-UI-007 | "Date Added" filter against the calendar date of import |
| `track-assignment-one-hand.mjs` | WF-008 | one-hand, reassigned and ignored-track sessions schedule exactly the expected notes |
| `freeplay-recording-export.mjs` | WF-015, PH-PAR-005 | record and replay, and which export and backing-track controls the web shows |
| `wav-render-probe.mjs` | WF-015, PH-MUS-007 | the product's offline WAV render returns silence |
| `mscz-upload-no-musescore.mjs` | WF-025, PH-UI-009, PH-ARCH-004 | `.mscz` upload with no MuseScore or a missing path |
| `legacy-filter-presets.mjs` | DATA-016, DATA-017, PH-DATA-007 | filter presets saved before the rename are offered again, moved to the current key (case L lists "Legacy Preset") |
| `legacy-sample-packs.mjs` | DATA-015, DATA-017, PH-DATA-004 | packs in the pre-rename IndexedDB are installed and the old database is deleted; both-present keeps the current pack; reset clears both names |
| `practice-runtime-proofs.mjs` | PH-MUS-001, PH-MUS-003 | judged state kept across a tempo change; fingering in a loop binds to the right note |
| `metronome-and-quiz.mjs` | PH-MUS-006, PH-MUS-009 | metronome click rate at 100 and 50 percent tempo; quiz shuffle and first-option run |
| `lane-d-parity.mjs` | BR rows in the delta | runtime-parity evidence that needs no Electron |

Lane E drivers (UI, accessibility and motion). Zoom drivers emulate zoom by shrinking
the viewport and raising `deviceScaleFactor`; headless Chromium has no real zoom.

| Driver | Rows | What it proves |
|---|---|---|
| `mainmenu-video-states.mjs` | WF-026, RT-012 | menu video under reduced motion, missing asset, hidden tab, throttled bandwidth |
| `canvas-raf-reduced-motion.mjs` | RT-009, PH-UI-003 | animation frames per second and canvas changes in Free Play and Soundboard, with and without reduced motion |
| `reduced-motion-redraw-probe.mjs` | RT-009 | when the canvases redraw after key taps under reduced motion |
| `reduced-motion-css-animations.mjs` | RT-009 | running CSS animations per screen, with and without reduced motion |
| `keyboard-focus-matrix.mjs` | RT-008, PH-UI-001, PH-UI-004 | keyboard walk with a focus-indicator check, dialog containment, Escape (`PART` picks parts) |
| `focus-hud-nav-visual.mjs` | RT-008, PH-UI-011 | the HUD nav strip with and without keyboard focus |
| `latency-wizard-keyboard.mjs` | RT-008, PH-UI-010 | keyboard behaviour of the Latency Calibration dialog |
| `hidden-focus-stops.mjs` | RT-008, PH-UI-014 | Tab stops inside closed HUD popouts |
| `freeplay-popout-pin-path.mjs` | RT-008, PH-UI-014 | whether the visual-mode popout can be reached and pinned by keyboard |
| `confirm-dialog-focus-restore.mjs` | RT-008, PH-UI-017 | where focus lands after the Settings confirmation closes |
| `escape-semantics.mjs` | RT-008, PH-UI-013 | Escape on Soundboard, Free Play and Game after the overlay was opened once |
| `zoom-emulation-hit-test.mjs` | RT-003, RT-004, RT-006, PH-UI-002 | Settings tab hit tests and overflow on 14 screens at six sizes |
| `zoom-hud-overlap.mjs` | RT-006, PH-UI-012 | expanded HUD nav hit tests and overlaps at five sizes |
| `zoom-library-sticky-sidebar.mjs` | RT-006 | an artefact check for one library control |
| `color-state-evidence.mjs` | RT-010, PH-UI-015 | note-state screenshots in both palettes, results screen, quiz review |
| `grade-badge-contrast.mjs` | RT-010, PH-UI-016 | computed grade badge colours |
| `palette-cvd-distance.py` | RT-010, PH-UI-015 | simulated colour-vision distance between state colours (not a calibrated review) |

Shared helpers: `harness.mjs` (above), `midi-fixtures.mjs` (small MIDI fixtures built
with `@tonejs/midi`, including the library and "Two Hand Study" sets) and
`setup-common.mjs` (helpers for the setup, settings, pack and lesson drivers).
Most drivers take `DATA`, and some `SHOTS` and `FIX`, like `tour.mjs`; each file's
first lines name its variables and port.

The desktop app has its own drivers in `../electron/`.

`play-short-song.mjs` expects a `short-4-notes` song already in the library. Make the
fixture with `@tonejs/midi` (four quarter notes C4 to F4 at 120 BPM) and upload it.
The drivers were written during discovery; they favour evidence over polish.
