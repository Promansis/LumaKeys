# Headless Electron Drivers

Playwright drivers that run the real desktop app (`out/main`, `out/preload`,
`out/renderer`) with no display. Each one launches Electron on a throwaway profile
under `$TMPDIR`, drives the renderer, and prints evidence lines. The Phase 11
[Electron runtime report](../../../docs/audit/reports/phase-11-electron-runtime-2026-10-20.md)
records what they proved and what they cannot prove.

## How It Works

- `launcher.cjs` is the app entry (`package.json` here points at it). It exits unless
  `LK_PROFILE` is under `$TMPDIR`, pins `appData` and `userData` inside that profile,
  reports the repository root as `app.getAppPath()`, and then imports
  `out/main/index.js` unchanged.
- `hooks.mjs` redirects two imports of the main bundle and nothing else: `electron` to
  `electron-shim.mjs`, whose `BrowserWindow` forces `show: false` and
  `offscreen: true` (a visible window crashes Electron 30 without a display), and
  `better-sqlite3` to an Electron-ABI copy outside the repository.
- `electron-harness.mjs` exports `withElectron(profile, fn)`. The callback gets `app`,
  `page`, `errors` (console errors, warnings and page errors), `relaunch({ kill })`
  (close or SIGKILL, then launch again on the same profile), `stubOpen(paths)`,
  `stubSave(file)` and `stubMessage(response)` (replace the native dialogs in the main
  process; an empty list or no file means Cancel), `userData` and `profile`. It also
  exports `text(page)` and `REPO`.

Node-side checks open the profile's `lumakeys.db` read-only with the repository's own
Node-ABI `better-sqlite3`.

## Setup (outside the repository)

Needs the browser drivers' Playwright install (see `../browser/README.md`) and an
existing `out/` build. Do not run `npm run build` for an audit: it rewrites the shared
`out/`.

```bash
# Electron-ABI copy of better-sqlite3; the repository's Node-ABI build stays as it is.
M="$TMPDIR/p11/EL/electron-modules/node_modules"
mkdir -p "$M"
cp -r node_modules/better-sqlite3 node_modules/bindings node_modules/file-uri-to-path "$M/"
(cd "$M/better-sqlite3" && npm_config_cache="$TMPDIR/npm-cache" \
  node /media/storage/LumaKeys/node_modules/prebuild-install/bin.js --runtime electron --target 30.5.1)

# Drivers run next to the Playwright install so `import 'playwright'` resolves.
cp scripts/audit/electron/*.mjs "$TMPDIR/pw/"
```

The `prebuild-install` step downloads from `github.com` once; later runs use the cache.

## Run

```bash
cd "$TMPDIR/pw"
PROFILE="$TMPDIR/p11/EL2/wf" LK_SQLITE_MODULE="$TMPDIR/p11/EL/electron-modules/node_modules/better-sqlite3" \
  timeout 300 node workflows.mjs > "$TMPDIR/p11/EL2/wf.out" 2>&1
```

Give each run a new, empty `PROFILE`: only `lesson-pass.mjs`, `paused-input.mjs` and
`setup-guide-choices.mjs` clear it themselves, and the others expect a first launch. Write output to a file: a pipe holds everything until the process exits.
Every launch logs Electron's "Insecure Content-Security-Policy" warning; most drivers
filter it out of their error list.

| Driver | Rows | What it proves |
|---|---|---|
| `workflows.mjs` | WF-001, WF-004, WF-005, WF-009, WF-010, WF-024, PH-MUS-005 | setup guide exits, file and folder import matrix, Learning and Play scoring, Results rows, every main-menu exit, keys ignored after Resume |
| `setup-guide-choices.mjs` | WF-001, PH-SEC-003 | each reminder and hand-size choice is stored, survives a relaunch and reads back in the guide and Settings |
| `ipc-workflows.mjs` | WF-003, WF-007, WF-008, WF-011, WF-012, WF-013, WF-014, WF-017, WF-018 | changes made through the preload bridge or the UI survive a relaunch |
| `backup-reset-restore.mjs` | WF-006, WF-020, WF-021, WF-022, WF-023 | missing-file recovery and reattach, export, garbage and tampered restore, both resets, SIGKILL after writes |
| `freeplay-export.mjs` | WF-015, PH-MUS-007 | record in Free Play, export MIDI and WAV through the save handler, read both files back. Optional `WAV_BUNDLES`: a directory with the PH-MUS-007 probe's `audio-engine.{product,control}.bundle.js`, rendered in the same page as a control |
| `sample-pack.mjs` | WF-019 | install the Flute pack, load the copied files, relaunch, remove, check `userData` |
| `window-open.mjs` | MOD-014, PH-SEC-005 | a Soundboard credit link opens no app window: the https: URL reaches a stubbed `shell.openExternal`, an http: link does not, a navigation attempt leaves the main window on the app, and the sandbox is on (PASS or FAIL lines). `ALLOW_OFFSCREEN=1` replays the Phase 11 baseline for a build with no handler (what a child window is and can reach). `NO_HANDLER=1` shows the headless crash instead |
| `lesson-pass.mjs` | WF-011 | lesson 1 drill on time, Complete Lesson, gating, the novice capstone note by note, Beginner unlock across a relaunch |
| `paused-input.mjs` | WF-011, PH-MUS-012 | a note pressed during the count-in or before Space scores |
| `practice-proofs.mjs` | WF-008, WF-009, WF-010, PH-MUS-001, PH-MUS-003 | a tempo change keeps the judged notes and the finished run saves them, a structural change asks first, a fingering set inside a loop is stored on the right note through IPC. Needs `POS` (see the file header) |
| `library-one-hand.mjs` | WF-007, WF-008, PH-UI-006 | a library-screen folder move survives a relaunch, bulk Delete has no prompt at any layer, a one-hand Learn session judges six notes, and a track reassignment survives a relaunch. Needs `FIX_LIB` and `FIX_TWO` from `../browser/midi-fixtures.mjs` |
| `keyboard-walk.mjs` | RT-008, PH-UI-001, PH-UI-010, PH-UI-011, PH-UI-013, PH-UI-014, PH-UI-017 | lane E's keyboard walk: top-bar focus, the Calibrate dialog's Escape, Soundboard's Escape sequence, invisible Free Play Tab stops, focus after the Settings confirmation closes; part (f) checks PH-UI-001 focus containment in four dialogs |
| `reset-with-pack.mjs` | WF-022, PH-DATA-002 | Delete User Data with the Flute pack installed removes the pack directory, and the pack does not resolve after a relaunch |
| `pack-removal-containment.mjs` | OP-006, PH-SEC-001 | Crafted ids sent to `removeInstrumentSamplePack` over IPC remove nothing outside the pack root and leave the stored pack list unchanged; removing Flute leaves Cello |

## Limits

- `userData` is pinned, so the real profile lookup (PH-DATA-005) is not exercised.
- Windows render offscreen: no real pixels on a display, GPU paths, OS window focus or
  window-manager behaviour.
- No audio device and no MIDI device. Audio is checked only as rendered files or engine
  log lines.
- The dialog stubs skip the OS picker, so its filters and default paths are untested.
- The packaged build (`app.asar`) is not run; the drivers use `out/` from the
  repository.
- Timed input starts from the end of the count-in, because input during the count-in is
  judged (PH-MUS-012).
