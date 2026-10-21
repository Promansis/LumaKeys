# Phase 11 Lane F: Library, Tracks, Recording, And MuseScore Upload (web)

- Lane owner: Claude Code (acting), agent tag FB
- Reviewer/challenger: Claude Code (acting), second pass in each finding's Challenge Record
- Baseline identity: `main` at `4466626` (later commits are audit docs only); web build `dist/server/index.cjs` and `dist/web/` from 2026-10-19 17:07, not rebuilt
- Started: 2026-10-19
- Last updated: 2026-10-19
- Status: complete for the web runtime; Electron halves and the Docker conversion half owed (see Evidence Gaps)

## Scope

- Coverage rows: WF-007, WF-008, WF-015, WF-025
- User journeys: library browse, search, filter, sort, edit, folders, playlists, bulk actions; track assignment and one-hand practice; Free Play recording and export; `.mscz` upload without a converter
- Runtimes: web (headless Chromium 141, Playwright 1.56.1, ports 3785 to 3788, Node 24.15.0)
- Data/privileged boundaries: each run used a fresh `LUMAKEYS_DATA_DIR` under `$TMPDIR/p11/FB/`; the real data directories were not touched; the repository was not edited outside `scripts/audit/browser/` and `docs/audit/reports/`
- Explicit exclusions: Electron, audible output, MuseScore conversion and the busy-converter path (Docker, sitting 0), physical MIDI, other browsers

## Evidence Plan

| Surface | Oracle/invariant | Method/fixture | Runtime | Expected artifact |
|---|---|---|---|---|
| Library browse, filters, sort | Expected result computed from the bridge rows (`getAllSongs`) for each query | Five generated MIDI files (titles with mixed case, 60 to 190 BPM, 2 s to 200 s, difficulty 1 to 9) imported through the UI | web | `library-organize-bulk.out` |
| Metadata, folders, playlists, bulk | Reload after every mutation; SQLite rows, bridge rows, and `midi-files` must agree | Same driver, `better-sqlite3` read-only on the live DB | web | same |
| Date Added filter | The calendar date of the import instant in the browser's zone | One song, four browser time zones | web | `library-date-filter-timezone.out` |
| Track assignment, one-hand practice | Notes expected per configuration: 12 both hands, 6 one hand, 6 with one track ignored | Two-track fixture, results screen counts, computer keyboard | web | `track-assignment-one-hand.out` |
| Free Play recording | Notes lit while playing equal notes replayed, in order, within 120 ms | MutationObserver on key `active` classes | web | `freeplay-recording-export.out` |
| WAV render | RIFF header, sample rate, length, energy after each onset | Product `renderRecordingToWav` bundled into Chromium, plus a one-change control | web (engine) | `wav-render-probe.out` |
| `.mscz` upload | HTTP status, body, status line the user sees, no stored file, no temp dir left | Zip, non-zip, empty `.mscz`; four converter configurations | web | `mscz-upload-no-musescore.out` |

Raw output and screenshots stay under `$TMPDIR/p11/FB/` and are not committed.

## Results By Row

| Row | Web result | Evidence summary | Still owed |
|---|---|---|---|
| WF-007 | pass with defect | 86 of 86 checks pass in the library driver (details below); three defects: no delete confirmation (PH-UI-006), date filter time-zone error (PH-UI-007), drag-only playlist reorder (PH-UI-008) | Electron library run (sitting 1 item) |
| WF-008 | pass | 13 of 13 checks; one-hand, reassigned, and ignored-track configurations each expect exactly the right notes; assignment persists, hand filter does not | Electron run (sitting 1 item) |
| WF-015 | partial | Record, stop, capture count, and replay proven (10 of 10 checks). Export and backing track are not offered on the web by design. `renderRecordingToWav` returns silence (PH-MUS-007); web copy promises export (PH-PAR-005) | Electron export, audible output (sitting 1) |
| WF-025 | pass with defect | No-MuseScore and missing-path errors are returned, shown, and leave no file or temp dir; failure text ends with a false instruction (PH-UI-009) | Conversion success and busy-converter (sitting 0 items 2 and 3) |

### WF-007 detail

All evidence lines come from `library-organize-bulk.out`.

- Import: five files through `Upload MIDI / MSCZ` report "Imported 5 songs. Review the metadata before playing."; bridge, SQLite (5 rows), and `midi-files` (5 `.mid`) agree; bpm, duration, and note count match the fixtures (for example `bpm=190.0002850004275 dur=5.0 notes=256 difficulty=9`).
- Search: "alpha", "ETUDE" (case-insensitive), "  march  " (trimmed), "zzzz" (empty state "Widen the filter and try again."), and "a" (substring) all match the expected set. After a metadata edit, search finds a song by artist ("sousa"), genre ("march"), and tag ("parade").
- Sort: Title ascending and descending follow locale order (`charlie etude` between `Bravo` and `Delta`); Difficulty, Date Added, Best Score, Times Played, Last Played order as expected (the last three put the only played song first).
- Filters: Easy, Medium, Hard chips (`[1,2,2]`, `[4]`, `[9]`); duration min, max, and range; date from tomorrow and to yesterday give none; Played State played and unplayed; Best Score min 90 and max 50 (compares best accuracy; unplayed songs count as 0); presets Quick (< 3 min), Unplayed, High Score, Hard; a saved user preset survives reload (localStorage); `Clear` resets advanced filters and tag filter.
- Metadata edit: `More`, then `Edit Metadata`, change title, artist, genre, difficulty (3), and two tags (Enter and comma); the status line reads "Saved metadata for Bravo March (edited)."; values persist across a reload; a blank title falls back to the old title; a tag chip click filters the grid; Mark Favorite persists and lists under Favorites.
- Folders: create two, blank name ignored; bulk move two songs into one (status "Moved 2 songs.", selection cleared, folder view and card label correct after reload); rename follows songs; move to `Unfiled`; deleting a folder that holds a song unfiles the song (no dialog, songs 5 of 5).
- Playlists: create (becomes the active view); bulk add keeps selection order; drag row 3 onto row 1 reorders, matches the database, survives reload; reorder is disabled while a search is active; Remove drops one row; `Play All` starts the first song (Escape overlay title equals the first playlist song) and `Next Song` after the first run loads the second, with no `Next Song` after the last; rename persists; delete keeps the songs and clears `playlist_songs`.
- Bulk: `Select All Visible` selects 5; bulk add tag and remove tag apply to all; bulk delete of two songs (one with a result and a playlist row) removes both files and both database rows plus their dependents (`{"results":2,"playlist":1}` to `{"results":0,"playlist":0}`), keeps the other three songs and files, and leaves no `.import-*` or `.delete-*` staging directory; single delete from the editor and a final select-all delete behave the same, ending on "Upload MIDI or MSCZ to start your setlist." The storage invariant (database ids equal bridge ids equal files, no orphans, no missing files) passes after every mutation and reload.
- Not asserted: the Grid and List toggle, and the compact (mobile) layout.

### WF-008 detail

Fixture "Two Hand Study": track `Melody` (F4 G4 A4 B4 C5 C5) and track `Accompaniment` (C3 E3 G3 C3 E3 G3), names chosen to avoid the LH and RH name patterns. All lines from `track-assignment-one-hand.out`.

- Stored default after import: `{"track-0":"right","track-1":"left"}`; the Track Map in the Escape overlay lists "Melody = Right Hand (Default: Right Hand)" and "Accompaniment = Left Hand (Default: Left Hand)".
- Both hands, Play mode, no input: results `miss 12` (12 notes expected). Left Hand only, no input: `miss 6`.
- Right Hand only, Learning mode, only F4 G4 A4 B4 C5 C5 played (KeyQ KeyW KeyE KeyR KeyT KeyT, after Space and the count-in): `perfect 4, ok 2, miss 0`, final 500 (6 judged).
- Reassign Melody to Left and Accompaniment to Right in the Track Map, then Right Hand: the run expects the low notes. Playing C3 E3 G3 C3 E3 G3 (Comma Slash KeyW with the octave shifted down once) gives `perfect 2, good 1, ok 3, miss 0` (6 judged). Stored assignment `{"track-0":"left","track-1":"right"}`.
- Persistence: after a full page reload and a new session, the Track Map shows the reassigned hands. The hand filter returns to `Both Hands` (session-only; `handFilter` is not saved).
- Ignore: Melody Right, Accompaniment Ignore, Both Hands, no input: `miss 6` (the ignored track is not expected).
- Changing an assignment after notes are judged shows `window.confirm("Changing track assignments restarts this run. Continue?")`.
- Driver note: Space starts playback; the canvas is clicked after Resume (PH-MUS-005 workaround). The scoring counts in this row come from that workaround, not from an unmodified Resume.

### WF-015 detail

- Controls offered on the web (Escape overlay): Record, Play Recording, Metronome, backing Play and Stop (disabled, no Load Track), visual presets. No Export MIDI, Export WAV, or Load Track control; no `download` event during record, stop, or replay. `FreePlayScreen.tsx` gates all three with `!IS_WEB`, and `README.md:213` documents that some export helpers are desktop only. MIDI and WAV file validation therefore could not be done through the web UI.
- Recording: eight notes played (five single, one three-note chord; held 200 to 600 ms). Every pressed key lit its note while playing (`C4@0 E4@505 G4@1001 C4@1602 E4@1638 G4@1671 F4@2526 C5@3003`). Overlay `Captured` shows "8 notes"; status after Stop is "Recording captured. You can replay or export it now."
- Replay: `Play Recording` lit the same eight notes in the same order (`C4@0 E4@499 G4@1044 C4@1602 E4@1646 G4@1657 F4@2513 C5@3005`); the largest difference between replayed and played onset gaps was 49 ms (limit 120). Status ends "Playback finished."
- A new `Record` clears the previous take ("0 notes"); a key held through Stop is closed out (take of A4 plus held B4 gives "2 notes"); an empty take leaves `Play Recording` disabled; the take is lost on reload ("1 note" before, "0 notes" after).
- Note numbers and order were compared through the on-screen keyboard (note names in `title`), not by parsing a saved `.mid`, because no file can be saved on the web.
- WAV: the `wav-render-probe.mjs` run of the product `renderRecordingToWav` returns a valid header (RIFF, PCM 16-bit, 44100 Hz, 2 channels, 5.00 s for a 2 s recording plus the 3 s tail, consistent sizes) but every sample is zero: `peak=0.0000`, no energy at the three note onsets, in 3 of 3 fresh page loads with the live context running. A control copy that schedules on the Offline callback's transport renders audible audio (`peak=0.3911`, energy from the 0.5 s window) in 3 of 3 runs. See PH-MUS-007.
- Backing audio: not offered on the web (see PH-PAR-005). Audible output stays with sitting 1.

### WF-025 detail

Fixtures: a 168 byte zip (`PK` magic) renamed `minimal.mscz`, a 38 byte text file `notzip.mscz`, a 0 byte `empty.mscz`, a `score.mscx` (wrong extension), and a valid `.mid` control. `LUMAKEYS_MUSESCORE_PATH` was removed from the environment for configuration A.

| Configuration | zip `.mscz` | non-zip `.mscz` | empty `.mscz` | `.mscx` |
|---|---|---|---|---|
| A: unset | 200, `errors: [{"filename":"minimal","message":"MSCZ import requires MuseScore 4 on the Linux web server. Use the bundled Docker image."}]` | 200, same message | 200, "The file is empty." | 200, "Only .mid, .midi, and .mscz files can be uploaded." |
| B: `/nonexistent/mscore4` | 200, "The MuseScore converter is unavailable. Check LUMAKEYS_MUSESCORE_PATH or rebuild the Docker image." | same | "The file is empty." | same as A |
| C: stand-in `/bin/true` (not MuseScore) | 200, "MuseScore did not produce a valid MIDI within the 10 MB limit." | same | "The file is empty." | same as A |
| D: stand-in `/bin/false` (not MuseScore) | 200, "Unable to convert this MuseScore score. It may be damaged, too complex, or from a newer MuseScore version." | same | "The file is empty." | same as A |

- All four bodies have `songs: []` and `skipped: 0`; a request with no files gets 400 `{"error":"No files were uploaded."}`.
- A mixed request (valid `.mid` plus zip `.mscz`) returns 200 with the song imported and the `.mscz` error in `errors`; one file stored.
- In the library UI the user sees, for example, "1 failed (minimal: MSCZ import requires MuseScore 4 on the Linux web server. Use the bundled Docker image.). Review the metadata before playing." No song is added, no metadata editor opens, `midi-files` holds only the control song, and no `lumakeys-mscz-*` directory is left in the temp directory.
- Does the message tell the user what to do? It tells the operator what to change (use the Docker image; check the variable) but not the person at the library page, and the closing sentence is wrong (PH-UI-009). Without a converter, the zip and the non-zip file get the same message, so a damaged score cannot be told apart from a good one; both are rejected before the archive is looked at. The empty-file message is clear.
- The configurations C and D use stand-in executables only to exercise the failure messages. They are not MuseScore and prove nothing about conversion.
- The UI keeps advertising conversion: the button reads `Upload MIDI / MSCZ` and the empty library says "MuseScore scores are converted automatically for playback", because the client cannot learn whether the server has a converter (observation).

## Working Flows Confirmed

| Coverage row | Evidence | Conditions/limits | Disposition |
|---|---|---|---|
| WF-007 | Library driver, 86 checks, storage invariant after every mutation and reload | Web only; Grid, List, compact layout not asserted | pass with defect |
| WF-008 | Track driver, 13 checks, counts per configuration | Web only; Learning and Play modes; canvas-click workaround | pass |
| WF-015 | Record, stop, capture, replay with note names and timing | Web only; no export on the web | partial |
| WF-025 | HTTP and UI recorded for four configurations | Web only; conversion not run | pass with defect |

## Findings

| Finding | Why it belongs to this lane | Shared lanes |
|---|---|---|
| [PH-UI-006](findings/PH-UI-006.md) | Library delete is immediate and erases results (WF-007) | DATA |
| [PH-UI-007](findings/PH-UI-007.md) | Date Added filter time-zone error (WF-007) | DATA |
| [PH-UI-008](findings/PH-UI-008.md) | Playlist reorder drag only (WF-007) | UI |
| [PH-MUS-007](findings/PH-MUS-007.md) | WAV render silent (WF-015) | PAR |
| [PH-PAR-005](findings/PH-PAR-005.md) | Web Free Play copy promises export (WF-015) | UI |
| [PH-ARCH-004](findings/PH-ARCH-004.md) | Upload response echoes bytes and server path (WF-004, WF-025) | SEC |
| [PH-UI-009](findings/PH-UI-009.md) | Failed import says "Review the metadata" (WF-025) | PAR |

## Evidence Gaps

| Coverage row | Missing proof | Why blocked | Owner | Next action |
|---|---|---|---|---|
| WF-007 | Library organization and bulk delete in the Electron app | No Electron runtime in the sandbox | sitting 1 | item below |
| WF-008 | Track assignment and one-hand session in Electron | same | sitting 1 | item below |
| WF-015 | MIDI export bytes and WAV export (confirm PH-MUS-007), audible output, backing track | Export is Electron only; audio output needs a person | sitting 1 | item below and existing item 4 |
| WF-025 | Real conversion, busy-converter message | Needs the Docker image with MuseScore | sitting 0 items 2 and 3 | already staged |

## Runtime And Failure Coverage

- Electron: not exercised.
- Web: all four rows driven end to end.
- Loading/empty/disabled: empty library message, no-match panel, `Play Recording` disabled before and after an empty take, reorder disabled while filtered, no-files upload (400).
- Error/retry/recovery: each failing upload leaves the library and files unchanged; a failed file in a mixed batch does not block the good one.
- Destructive/interruption: bulk, single, and select-all delete; folder and playlist delete; mid-run assignment change prompts.
- Accessibility or hardware proof: drag-only reorder noted (PH-UI-008); no hardware.

## Observations (no finding)

- After a multi-file import the metadata editor opens for the first imported song, but it renders below the recommendations and maintenance panels; at 1280 by 800 neither the editor nor any song card is visible without scrolling (screenshot `01-imported.png`).
- Folder delete and playlist delete are also immediate and unconfirmed, but they do not delete songs.
- Songs can be added to a playlist only through the bulk bar; there is no per-card control.
- The Track Map text says "Adjust each track before playback", but it appears only in the Escape overlay of a running session; there is no assignment surface before a session starts.
- The hand filter is session-only and resets to Both Hands; track assignments persist per song.
- Playing the generated 256-note, four-note-chord fixture at 190 BPM logged "[warning] Max polyphony exceeded. Note dropped." repeatedly on the web; the fixture is dense by design, but audible effect is owed to sitting 1.
- `FreePlayScreen.tsx` still contains "available in the desktop app" messages in handlers the web build cannot reach.
- Library `dateAdded` strings are UTC without a zone marker (see PH-UI-007).

## Challenge Summary

- Claims disproved or narrowed: "Silent WAV is a headless artifact" was tested and rejected (control build and a bare Tone repro render audio in the same browser). The first control patch replaced the wrong `tone.Transport` (in `playSong`) and stayed silent; only the patch confined to `renderRecordingToWav` works.
- Duplicates merged: none; PH-UI-009 and PH-ARCH-004 sit near PH-PAR-004 and PH-SEC-004 but are distinct defects.
- Severity changes: PH-MUS-007 confidence set to medium until the Electron file is inspected.
- Environmental failures separated: the brief assumed a bulk-delete confirmation and MIDI/WAV download events; neither exists on the web, so those were recorded as findings and a documented limitation, not driver failures.

## Drivers Created

| Driver (`scripts/audit/browser/`) | Rows | What it proves | Port | Run |
|---|---|---|---|---|
| `midi-fixtures.mjs` | WF-007, WF-008, WF-025 | helper: builds library, two-track, and metadata fixtures with `@tonejs/midi` | none | imported by the drivers |
| `library-organize-bulk.mjs` | WF-007 | import, search, sort, every filter, preset, metadata, favorites, folders, playlists, play queue, bulk actions, delete; storage invariant after every mutation | 3785 | `DATA=... FIX=... PORT=3785 node library-organize-bulk.mjs` |
| `library-date-filter-timezone.mjs` | WF-007, PH-UI-007 | Date Added filter against the import date in four browser time zones | 3786 | `DATA=... FIX=... PORT=3786 node library-date-filter-timezone.mjs` |
| `track-assignment-one-hand.mjs` | WF-008 | Track Map defaults, one-hand, reassign, ignore, persistence, mid-run prompt | 3787 | `DATA=... FIX=... PORT=3787 node track-assignment-one-hand.mjs` |
| `freeplay-recording-export.mjs` | WF-015 | record, stop, capture count, replay order and timing, controls offered, no downloads | 3788 | `DATA=... PORT=3788 node freeplay-recording-export.mjs` |
| `wav-render-probe.mjs` | WF-015, PH-MUS-007 | product `renderRecordingToWav` output and a one-change control (bundles with the repo's esbuild into `$OUT`) | 3788 | `DATA=... OUT=... PORT=3788 node wav-render-probe.mjs` |
| `mscz-upload-no-musescore.mjs` | WF-025 | `.mscz` uploads over HTTP and UI in four converter configurations | 3787 (PORT_BASE) | `DATA=... FIX=... node mscz-upload-no-musescore.mjs` |

All drivers go in `$TMPDIR/pw/` before running (`cp scripts/audit/browser/*.mjs "$TMPDIR/pw/"`) with `PLAYWRIGHT_BROWSERS_PATH=$TMPDIR/pw/browsers`, and write output to a file. Each resets its own data directory.

## Proposed Matrix Updates

- WF-007: `blocked`. Evidence: [P11-F-FB](phase-11-lane-f-library-recording-2026-10-19.md#wf-007-detail). Web pass with defects (PH-UI-006, PH-UI-007, PH-UI-008); Electron library run owed to sitting 1.
- WF-008: `blocked`. Evidence: [P11-F-FB](phase-11-lane-f-library-recording-2026-10-19.md#wf-008-detail). Web pass for one-hand, reassign, ignore, and persistence; Electron run owed to sitting 1.
- WF-015: `blocked`. Evidence: [P11-F-FB](phase-11-lane-f-library-recording-2026-10-19.md#wf-015-detail). Web recording and replay proven; export is Electron only and PH-MUS-007 needs the Electron file; audio and backing track owed to sitting 1.
- WF-025: `blocked`. Evidence: [P11-F-FB](phase-11-lane-f-library-recording-2026-10-19.md#wf-025-detail). No-converter, missing-path, empty, and non-zip paths proven; conversion success and busy-converter owed to sitting 0 items 2 and 3.

## Proposed User-Test Items

Sitting 1 (Linux machine with a display, packaged Electron build with an isolated profile). Fixtures are already generated under `/tmp/claude-1000/p11/FB/`.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 8 | WF-015, PH-MUS-007, PH-PAR-005 | In the desktop app open Free Play, Menu, Record, play C4 E4 G4 then the chord C4 E4 G4 on the computer keyboard (Comma, Slash, KeyW), Stop. Click Export MIDI and Export WAV, save both. Open the `.mid` in a notation or MIDI viewer and the `.wav` in any player or waveform viewer. Also note whether Load Track plays a file you pick | MIDI shows the four notes and the chord in order. WAV: expected today to be silent (PH-MUS-007); record whether you hear the notes | | |
| 9 | WF-007, PH-UI-006 | In the desktop app import the four `.mid` files in `/tmp/claude-1000/p11/FB/fx-lib/` (Alpha Waltz, Bravo March, charlie etude, Delta Scale). Create a folder, tick two songs, move them into it, restart the app and check they are still there. Tick two songs and click Delete | Moves persist across restart. Delete: expected today to remove the songs at once with no confirmation; note whether a prompt appears | | |
| 10 | WF-008 | In the desktop app import `/tmp/claude-1000/p11/FB/fx-wf008/Two Hand Study.mid`, click Learn, press Escape, choose Right Hand, press Resume, click the falling-notes area, press Space, then play F4 G4 A4 B4 C5 C5 (KeyQ KeyW KeyE KeyR KeyT KeyT). Then Escape, Hand Assignment, set Melody to Left Hand, restart the app, start the song again and open Escape | Run completes with 6 judged notes and no misses. After restart the Melody assignment still reads Left Hand and the hand choice is back to Both Hands | | |

## Candidate Findings

| ID | Severity | Summary |
|---|---|---|
| PH-UI-006 | P2 | Deleting songs (bulk, editor, select all) has no confirmation and cascades away results, playlists, and files |
| PH-MUS-007 | P2 | `renderRecordingToWav` schedules on the live Transport inside `Tone.Offline`; the returned WAV is valid but all zeros (Electron export; engine-level reproduction) |
| PH-UI-007 | P3 | Date Added filter parses a UTC string as local time and mixes UTC and local day bounds; wrong day in non-matching zones |
| PH-PAR-005 | P3 | Web Free Play says "replay or export it now" and invites loading a backing track, with neither control present; take lost on reload |
| PH-ARCH-004 | P3 | Web upload response includes `fileData` as an index-keyed object (12 times the upload size) and the absolute `destPath` |
| PH-UI-008 | P3 | Playlist reorder is drag and drop only |
| PH-UI-009 | P3 | A failed import still ends "Review the metadata before playing." |

## Files Created

- `docs/audit/reports/phase-11-lane-f-library-recording-2026-10-19.md`
- `docs/audit/reports/findings/PH-UI-006.md`, `PH-MUS-007.md`, `PH-UI-007.md`, `PH-PAR-005.md`, `PH-ARCH-004.md`, `PH-UI-008.md`, `PH-UI-009.md`
- `scripts/audit/browser/midi-fixtures.mjs`, `library-organize-bulk.mjs`, `library-date-filter-timezone.mjs`, `track-assignment-one-hand.mjs`, `freeplay-recording-export.mjs`, `wav-render-probe.mjs`, `mscz-upload-no-musescore.mjs`
- Outside the repository: `$TMPDIR/p11/FB/*.out`, fixtures under `$TMPDIR/p11/FB/fx*`, screenshots and WAV probes under `$TMPDIR/p11/FB/data-*` and `wav/`
