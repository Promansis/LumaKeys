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

`play-short-song.mjs` expects a `short-4-notes` song already in the library. Make the
fixture with `@tonejs/midi` (four quarter notes C4 to F4 at 120 BPM) and upload it.
The drivers were written during discovery; they favour evidence over polish.
