# Phase 11 Lane F: Workflow Runtime Matrix

- Status: complete. This file records the web half of the rows below. The other web
  rows are in [library and recording](phase-11-lane-f-library-recording-2026-10-19.md)
  (WF-007, WF-008, WF-015, WF-025) and [input, settings, packs and lessons](phase-11-lane-f-setup-settings-2026-10-19.md)
  (WF-002, WF-003, WF-011, WF-018, WF-019). The desktop half of every row is in the
  [Electron runtime report](phase-11-electron-runtime-2026-10-20.md) (2026-10-20).
- Source identity: `main` at `4466626` plus audit-only commits; web build from `npm run build:web`
- Runner: Claude Code (acting)
- Date: 2026-10-19
- Drivers: [`scripts/audit/browser/`](../../../scripts/audit/browser/README.md)

## Method

Headless Chromium 141 (Playwright 1.56.1) drove the built web server on ports
3777 to 3780. Each run used a fresh `LUMAKEYS_DATA_DIR` under `$TMPDIR/laneF/`, never
the real data. Fixtures were the bundled curriculum MIDIs plus two generated files:
a four-note song (C4 to F4, 120 BPM) and a 6/8-then-3/4 meter-change song. Raw
output and screenshots stay under `$TMPDIR/laneF/` and are not committed.

Not exercised here: real audio output, physical MIDI devices, browser zoom, and any
browser other than Chromium. The Electron runtime was first marked owed to the
owner; the headless Electron harness added on 2026-10-20 proved it instead (last
column).

## Results By Row

| Row | Web result | Evidence summary | Desktop half and what is still owed |
|---|---|---|---|
| WF-001 | pass with defect | Setup guide on first load; "Skip for now" persists across reload; guide returns after full reset. Setup writes `"off"` into an integer setting | [desktop](phase-11-electron-runtime-2026-10-20.md) proven; Windows first run (sitting 2). PH-ARCH-003 on both |
| WF-004 | pass with defect | Two-file upload imports 2 and stores two content-addressed files; duplicate reports "already in library"; empty and wrong-extension files get clear messages; corrupt file reports "corrupt: undefined" | [desktop](phase-11-electron-runtime-2026-10-20.md) proven, same PH-PAR-004 copy; Windows import (sitting 2) |
| WF-006 | pass | Missing file: GET returns 404; Play shows "Practice unavailable. Could not start this session. Unable to load MIDI: 404" with Retry and Main Menu. Reattach with another song's file is rejected; the right file restores it (GET 200); cancel reports "Reattach canceled." and leaves no file input behind | [desktop](phase-11-electron-runtime-2026-10-20.md) proven (raw IPC error text, observation). Library card gives no missing-file hint before Play (observation) |
| WF-009 | pass with defect | Space starts the run after a count-in; computer keys score in Learning (275, 1 perfect, 1 good, 2 ok) and Play (350, 2 perfect, 2 good); Escape opens the session overlay with focus inside; second Escape closes it. After clicking Resume, keys stop scoring | [desktop](phase-11-electron-runtime-2026-10-20.md) proven, PH-MUS-005 reproduces; audio, MIDI device, latency (sittings 1 and 4) |
| WF-010 | pass | Run ends on Results; one row per run persists with mode, hits, misses, duration; three rows in order after three runs | [desktop](phase-11-electron-runtime-2026-10-20.md) proven |
| WF-012 | pass | Chord ID quiz completes 10 questions with a per-question review; result saved as `quiz` 5/10 | [desktop](phase-11-electron-runtime-2026-10-20.md) proven |
| WF-013 | pass | Interval session completes 10 questions with a summary; result saved as `interval-trainer` | [desktop](phase-11-electron-runtime-2026-10-20.md) proven; audio (sitting 1) |
| WF-014 | pass with defect | C major drill scores 8 of 8, "Scale complete. Accuracy 100.0%", once focus leaves the Start Drill button; 0 of 8 while it keeps focus | [desktop](phase-11-electron-runtime-2026-10-20.md) proven; PH-MUS-005 |
| WF-015 | partial | Free Play opens, keys light the keyboard, HUD exit works; a focused HUD button silences keys. Recording and export not yet run | recording and export: [library report](phase-11-lane-f-library-recording-2026-10-19.md) and [desktop](phase-11-electron-runtime-2026-10-20.md) (PH-MUS-007); audio (sitting 1) |
| WF-016 | partial | Soundboard opens and exits; keys light pads | audio (sitting 1) |
| WF-017 | pass with defect | Dashboard empty state reads "Nothing to chart yet" with Go to Library; after runs shows streak, sessions, accuracy average, top song, trouble spots, achievement. Trouble-spot measures are zero-based | [desktop](phase-11-electron-runtime-2026-10-20.md) proven; PH-UI-005 on both |
| WF-020 | pass | Export downloads `lumakeys-library-2026-10-19.json` (version, songs, folders, playlists, fingerings, settings, midiFiles); garbage restore: "Invalid library backup file."; tampered MIDI bytes: "MIDI backup content does not match <id>." with no change; valid restore brings back 2 songs and 2 files | [desktop](phase-11-electron-runtime-2026-10-20.md) proven (save and open dialogs stubbed) |
| WF-021 | pass | Confirm dialog takes focus; Escape and Cancel close it with no change; confirm clears game results and keeps songs | [desktop](phase-11-electron-runtime-2026-10-20.md) proven |
| WF-022 | pass | Confirm then delete: 0 songs, MIDI directory empty, localStorage empty, main menu shows "No songs yet"; reload shows the first-run guide again | [desktop](phase-11-electron-runtime-2026-10-20.md) proven; PH-DATA-004 covers the legacy IndexedDB name |
| WF-023 | pass | Server killed mid-session: game shows "Practice data unavailable". SIGKILL right after a result write and a settings write, then restart: both present, `PRAGMA integrity_check` ok | [desktop](phase-11-electron-runtime-2026-10-20.md) SIGKILL proven; Docker restart (sitting 0) |
| WF-024 | pass | Every main-menu destination has an exit: Back to Main Menu on library, lessons, theory, progress, settings; HUD then Main on game, Free Play, soundboard; top-nav Main on the setup guide | [desktop](phase-11-electron-runtime-2026-10-20.md) proven |
| WF-026 | partial | Main menu video loads (`mainmenu-neonbackground.webm`, muted, looping, autoplaying, readyState 4) | reduced motion and missing asset: [lane E](phase-11-lane-e-ui-accessibility-2026-10-19.md); OS setting (sitting 1) |

The rows missing from this table were run later and are reported in the two companion
reports named above. WF-005 (folder import) is desktop-only and is in the Electron
runtime report.

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

None. The lane is closed. The rows that still need a person are in
[phase-11-user-tests.md](phase-11-user-tests.md). The meter-change fixture went to lane C
(PH-MUS-002 proof).
