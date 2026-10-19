# Phase 11 Lane F: Workflow Runtime Matrix (interim)

- Status: in progress. This file records the web half of the matrix run so far.
- Source identity: `main` at `6e549b6` plus audit-only commits; web build from `npm run build:web`
- Runner: Claude Code (acting)
- Date: 2026-10-19
- Drivers: [`scripts/audit/browser/`](../../../scripts/audit/browser/README.md)

## Method

Headless Chromium 141 (Playwright 1.56.1) drove the built web server on ports
3777 to 3780. Each run used a fresh `LUMAKEYS_DATA_DIR` under `$TMPDIR/laneF/`, never
the real data. Fixtures were the bundled curriculum MIDIs plus two generated files:
a four-note song (C4 to F4, 120 BPM) and a 6/8-then-3/4 meter-change song. Raw
output and screenshots stay under `$TMPDIR/laneF/` and are not committed.

Not exercised here: the Electron runtime, real audio output, physical MIDI devices,
browser zoom, and any browser other than Chromium. Those halves stay owed to the
user batch sittings.

## Results By Row

| Row | Web result | Evidence summary | Still owed |
|---|---|---|---|
| WF-001 | pass with defect | Setup guide on first load; "Skip for now" persists across reload; guide returns after full reset. Setup writes `"off"` into an integer setting | Electron first run (sitting 2). PH-ARCH-003 |
| WF-004 | pass with defect | Two-file upload imports 2 and stores two content-addressed files; duplicate reports "already in library"; empty and wrong-extension files get clear messages; corrupt file reports "corrupt: undefined" | Electron import (sitting 2). PH-PAR-004 |
| WF-006 | pass | Missing file: GET returns 404; Play shows "Practice unavailable. Could not start this session. Unable to load MIDI: 404" with Retry and Main Menu. Reattach with another song's file is rejected; the right file restores it (GET 200); cancel reports "Reattach canceled." and leaves no file input behind | Library card gives no missing-file hint before Play (observation) |
| WF-009 | pass with defect | Space starts the run after a count-in; computer keys score in Learning (275, 1 perfect, 1 good, 2 ok) and Play (350, 2 perfect, 2 good); Escape opens the session overlay with focus inside; second Escape closes it. After clicking Resume, keys stop scoring | Audio, MIDI device, latency (sittings 1 and 4). PH-MUS-005 |
| WF-010 | pass | Run ends on Results; one row per run persists with mode, hits, misses, duration; three rows in order after three runs | Electron |
| WF-012 | pass | Chord ID quiz completes 10 questions with a per-question review; result saved as `quiz` 5/10 | none for web |
| WF-013 | pass | Interval session completes 10 questions with a summary; result saved as `interval-trainer` | audio (sitting 1) |
| WF-014 | pass with defect | C major drill scores 8 of 8, "Scale complete. Accuracy 100.0%", once focus leaves the Start Drill button; 0 of 8 while it keeps focus | PH-MUS-005 |
| WF-015 | partial | Free Play opens, keys light the keyboard, HUD exit works; a focused HUD button silences keys. Recording and export not yet run | recording/export (next session); audio (sitting 1) |
| WF-016 | partial | Soundboard opens and exits; keys light pads | audio (sitting 1) |
| WF-017 | pass with defect | Dashboard empty state reads "Nothing to chart yet" with Go to Library; after runs shows streak, sessions, accuracy average, top song, trouble spots, achievement. Trouble-spot measures are zero-based | PH-UI-005 |
| WF-020 | pass | Export downloads `lumakeys-library-2026-10-19.json` (version, songs, folders, playlists, fingerings, settings, midiFiles); garbage restore: "Invalid library backup file."; tampered MIDI bytes: "MIDI backup content does not match <id>." with no change; valid restore brings back 2 songs and 2 files | Electron save-dialog path |
| WF-021 | pass | Confirm dialog takes focus; Escape and Cancel close it with no change; confirm clears game results and keeps songs | Electron |
| WF-022 | pass | Confirm then delete: 0 songs, MIDI directory empty, localStorage empty, main menu shows "No songs yet"; reload shows the first-run guide again | Electron; PH-DATA-004 covers the legacy IndexedDB name |
| WF-023 | pass | Server killed mid-session: game shows "Practice data unavailable". SIGKILL right after a result write and a settings write, then restart: both present, `PRAGMA integrity_check` ok | Docker restart (sitting 0) |
| WF-024 | pass | Every main-menu destination has an exit: Back to Main Menu on library, lessons, theory, progress, settings; HUD then Main on game, Free Play, soundboard; top-nav Main on the setup guide | Electron |
| WF-026 | partial | Main menu video loads (`mainmenu-neonbackground.webm`, muted, looping, autoplaying, readyState 4) | reduced motion and missing-asset fallback (next session); OS setting (sitting 1) |

Not yet run on the web: WF-002, WF-003, WF-007, WF-008, WF-011, WF-018, WF-019,
WF-025 (no-MuseScore error path). WF-005 is Electron-only and stays with sitting 2.

## Findings Raised

| ID | Severity | Summary |
|---|---|---|
| [PH-MUS-005](findings/PH-MUS-005.md) | P2 | Computer-keyboard notes are dropped while any button has focus, including after clicking Resume and Start Drill |
| [PH-PAR-004](findings/PH-PAR-004.md) | P3 | Corrupt MIDI import reports "undefined" because the parser throws a string |
| [PH-UI-005](findings/PH-UI-005.md) | P3 | Progress dashboard shows zero-based trouble-spot measures |
| [PH-ARCH-003](findings/PH-ARCH-003.md) | P3 | First-run setup stores `"off"` in an integer setting |

## Observations (no finding)

- The falling-notes canvas keeps the label "Drag and drop a MIDI file here or use the import button" during gameplay and behind the "Practice unavailable" banner.
- Library cards run duration and BPM together ("0:5372 BPM"): `.song-card-meta` sets `gap` but no `display: flex`, so the gap does nothing. Pre-existing.
- The main-menu card titled "Keyboard Setup" opens the first-practice setup guide, which then links to Keyboard Setup.
- Progress labels three sessions of one song as "Songs played 3".
- Space is both the game's play toggle and the default sustain binding; the game handler calls `stopPropagation`, which does not stop the input service's own window listener.

## Next Steps For This Lane

1. Run the remaining web rows listed above, plus reduced-motion and missing-video checks for WF-026.
2. Feed the meter-change fixture through the parser for the PH-MUS-002 proof gap.
3. Recount the matrix and close lane F with each row covered or blocked by a named sitting.
