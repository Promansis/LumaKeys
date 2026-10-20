# Phase 11: Agent Proof Runs

- Status: done for everything this host can run. The proof each `fixed` finding still
  owed on the agent's side, and the OP-017 limits residual, ran on 2026-10-20 and
  2026-10-21. One proof failed (PH-DATA-001). Hardware, speaker, colour-vision and Windows
  checks stay with the owner ([user tests](phase-11-user-tests.md)).
- Source identity: `main` at `d28a028` (source `6e549b6` plus audit-only commits). No
  product source changed.
- New findings: [PH-MUS-017](findings/PH-MUS-017.md) (P2),
  [PH-DATA-010](findings/PH-DATA-010.md) (P3) and [PH-UI-020](findings/PH-UI-020.md) (P3).
  [PH-DATA-001](findings/PH-DATA-001.md) was reopened at P2.
- Runner: Claude Code (acting), with parallel agent sessions per proof
- Dates: 2026-10-20 to 2026-10-21
- Plan: the [proof-owed table](phase-11-remediation-plan-2026-10-20.md#proof-owed-by-fixed-findings)

## Scope And Safety

- Every run used a throwaway profile, data directory or container under `$TMPDIR`.
- No run touched a real profile, production storage or the running container. No run
  rebuilt the product.
- No product source changed. The drivers are new files under `scripts/audit/`.
- Failures were injected with `chmod`, Playwright `page.route`, an IPC handler override and
  SQLite triggers on throwaway databases. No source edit injected a fault.
- A Windows `.exe` cross-build also ran. It is held pending the owner's decision and is not
  part of this evidence.

Tools: Node v24.15.0, Playwright 1.56.1 with Chromium 141.0.7390.37 and Firefox 142.0.1,
Edge 155.0.4283.62, Electron 30.5.1 (Chromium 124.0.6367.243) on the existing `out/` build,
and the built `dist/server/index.cjs`.

## Results

| Proof | Finding or row | Result | Status change |
|---|---|---|---|
| Unplayable legacy rows | PH-PAR-003 | Pass, desktop and web | `verified` |
| MuseScore limits | OP-017, MOD-013 | All three limits fire | residual closed |
| Load-failure recovery | PH-ARCH-001 | Pass, 78 of 78 in three browsers | stays `fixed` |
| Setting-write failure | PH-ARCH-002 | Pass, 19 of 19 for two methods | `verified` |
| Fingering save and restore | PH-MUS-003 | Pass, 24 of 24 | `verified` |
| Reset removes packs | PH-DATA-002 | Defect gone on both runtimes | `verified` |
| Forced filesystem failures | PH-DATA-001 | Failed | reopened, `accepted` at P2 |

## PH-PAR-003: Unplayable Legacy Rows

Result: pass on desktop and web, in the first-run and the startup-repair path.

- Fixture: a legacy profile with six songs: valid, hash-mismatched, unreadable (`chmod 000`),
  missing, no `sourcePath`, and a corrupt file whose hash matches. Two variants: first-run
  `song-metadata.json`, and startup repair of rows that still hold an external path plus
  `song-metadata.json.migrated`. Each variant restarts once.
- Desktop ran the Electron main-process sequence in-process (`migrateFromJson`,
  `midiStorage.read`, `recomputeAllSongDifficulties`); Electron itself was not launched. Web
  ran `dist/server/index.cjs` over `/api/bridge` and `/api/midi/:id`.
- The hash-mismatched, unreadable, missing and no-source rows keep an empty `filePath`, get
  no `midi-files` entry, return 404 (ENOENT on the desktop read) and add one recompute error
  each. The valid row is copied with identical bytes, the legacy sources are untouched, and
  a restart leaves the same state.
- Residual (not a finding): the startup-repair path does not parse bytes. A source whose
  hash matches but whose bytes are corrupt is copied in and served with 200; the first-run
  path rejects it. It fails to parse the same way in both runtimes, so parity holds.
- Driver: `scripts/audit/proof-par003-unplayable-legacy.mjs`. Evidence:
  `$TMPDIR/p11/PF/probes/par003/report.json`.

## OP-017: MuseScore Limits

Result: all three limits fired through real `.mscz` uploads against `dist/server`, with
fake converters in place of MuseScore.

| Limit | Fake converter | Wall time | Outcome |
|---|---|---:|---|
| 45 s timeout | `sleep` | 45.1 s | clean error, child gone, temp dir gone, server serving |
| 30 s CPU | busy loop | 30.1 s | the same; the rlimit fired before the timeout |
| 10 MB output | writes 20 MB | 0.1 s | the same; SIGXFSZ ends it at 10,485,760 bytes |

- The error is "Unable to convert this MuseScore score. It may be damaged, too complex, or
  from a newer MuseScore version." During the first two runs a second upload got the busy
  message and `getAllSongs` answered in 2 to 3 ms. A valid `.mid` upload after each run
  succeeded. An stdout flood past `maxBuffer` also ended cleanly.
- The real MuseScore binary was not used; the limit mechanisms (`prlimit`, `execFile`
  timeout and `maxBuffer`) are the real ones. The memory limit was proven earlier in the
  image.
- Driver: `scripts/audit/proof-op017-musescore-limits.mjs`. Evidence:
  `$TMPDIR/p11/PF/probes/OP-017.md` and `$TMPDIR/p11/PF/probes/op017-work/results.json`.

## PH-ARCH-001: Load-Failure Recovery In Three Browsers

Result: pass, 78 of 78 checks in each of Edge 155.0.4283.62 (unpacked, isolated HOME and
profile), Firefox 142.0.1 and Chromium 141.0.7390.37, headless, on a throwaway data directory.

- Faults: HTTP 500 on `getSetting`, `getUserStats`, `getCustomFingerings` and `/api/midi/:id`,
  and a network abort on `/api/midi/:id`, one at a time.
- In every browser, for every fault, the Retry and Main Menu panel (`role="alert"`, "Unable to
  load song: ...") showed at once. Keyboard Retry with the fault on re-ran the load and the
  panel stayed usable. Retry after the fault cleared mounted the session and the canvas
  painted. Main Menu left to the menu and a normal session then loaded. No mutating bridge
  call was made and there was no uncaught page error.
- Observation, raised as [PH-UI-020](findings/PH-UI-020.md): focus stays on the page body when
  the panel appears, and Retry is 54 Tab presses away in Edge and Chromium and 55 in Firefox.
- Status: stays `fixed`. The browser half of the owed proof is done; the slice 0 GameScreen
  unit test is still owed.
- Driver: `scripts/audit/browser/proof-ph-arch-001-recovery.mjs`. Evidence:
  `$TMPDIR/p11/PF/browsers/{edge,firefox,chromium}/` (`result.json`, `shots/`, `server.log`).

## PH-ARCH-002: Setting-Write Failure In Electron

Result: pass, 19 of 19 checks for each of two injection methods, each on its own fresh
profile, in Electron 30.5.1.

- Method 1 replaced the main-process `settings:set` handler (`METHOD=ipc`). Method 2 added
  SQLite `BEFORE INSERT` and `BEFORE UPDATE` triggers on `settings` while the app was closed
  (`METHOD=trigger`). The insert trigger skips the `fingering.handSize` seed, because a
  `BEFORE INSERT` trigger fires even for `INSERT OR IGNORE`, and the app then never opened a
  window.
- Settings said "Save failed. The change is active for this session only." with a "Setting
  not saved" toast for Theme and for the debounced Master Volume. Keyboard Setup said
  "Mapping active for this session only. Save failed; try again." for a bind and for Reset
  Mapping. Stored values did not change, re-opened screens read back the stored values, and
  they survived a relaunch. With the fault removed the same Theme change saved.
- After a failed Theme write the live page keeps the new theme until the next launch, as the
  "active for this session only" message says.
- Driver: `scripts/audit/electron/proof-arch-002.mjs`. Evidence:
  `$TMPDIR/p11/PF/electron/ipc/` and `trigger/`, with `ipc.out` and `trigger.out`.

## PH-MUS-003: Fingering Save And Restore

Result: pass, 24 of 24 checks, in Electron 30.5.1 with no injection.

- Fixture: "Two Hand Study". One finger was saved through the UI in each of five views: Right
  Hand only, Left Hand only, a loop with both hands, the same loop with Left Hand only, and
  the full song. Each row was stored by note id, not view index.
- After re-opening from the library, each finger sat on its own note in the full, right-only,
  left-only, loop and loop-left views, and every other note kept its first value. The export
  held five fingerings. In a fresh profile, Import Library brought back the same song id and
  the same five rows with the same fingers on the same notes.
- Observation, raised as [PH-MUS-017](findings/PH-MUS-017.md): changing a track assignment
  deletes every saved fingering for the song, with no prompt.
- Driver: `scripts/audit/electron/proof-mus-003.mjs`. Evidence:
  `$TMPDIR/p11/PF/electron/mus1/` (source profile, `backup.json`, `positions.json`,
  `shots/`), `mus1b/` (restored profile) and `mus1.out`.

## PH-DATA-002: Reset Removes Packs And Its Copy

Result: the defect, packs left behind, is gone on both runtimes. The copy gap is a new
finding.

- Seeded a library on each runtime (3 songs, a folder, a playlist, a result, an achievement,
  a fingering, settings, and the Flute pack), confirmed Delete User Data, and compared
  inventories. Web: `dist/server` with Chromium 141 plus a second browser context. Electron:
  `out/` with a relaunch.
- Removed on both: songs and their MIDI files, folders and playlists, results and measure
  history, trouble spots, practice days, fingerings, every settings row, unlocked
  achievements, localStorage keys, and the installed pack (the Electron pack directory and
  the web IndexedDB database). `integrity_check` was `ok`.
- Copy, identical on both: title "Delete all user data?", body "This removes songs, playlists,
  folders, results, achievements, and saved settings from this device." It never names packs,
  practice history, fingerings or trouble spots. On the web "from this device" is wrong,
  because the data is server-side: the second context loaded an empty library while its own
  localStorage key stayed. Raised as [PH-DATA-010](findings/PH-DATA-010.md).
- Driver: `scripts/audit/browser/proof-data002-web.mjs` and
  `scripts/audit/electron/proof-data002-electron.mjs`. Evidence: `$TMPDIR/p11/PF/data/web002/`
  and `el002/`.

## PH-DATA-001: Forced Filesystem Failures

Result: the proof failed. The finding was reopened.

Faults, by `chmod` only: `midi-files` read-only; a locked directory where the 2nd song file
goes (single delete, bulk delete of 3, restore of 4); an unreadable backup file (Electron);
the data directory or userData read-only (reset); `midi-files` read-only at reset time; a
locked sample-pack directory (Electron reset). After each failure the driver compared DB
rows, the durable-operations table and the files on disk, then restored permissions and
retried.

| Criterion | Result |
|---|---|
| (a) The error names a safe retry | Fails for delete and restore. They show raw OS errors (`EACCES ... mkdir '.delete-<id>'`), and a restore that fails on the 2nd file shows a misleading `EISDIR`. Reset names a retry |
| (b) Single delete, bulk delete and restore leave the old library intact | Pass: rows and files are byte-identical, and the 1st file is rolled back when the 2nd fails. Reset with a failure after the database commit is **not** rolled back: the DB is wiped and the old files sit in a hidden `.midi-files-reset-<id>` directory |
| (c) Retry after permissions are restored | Pass: every retry succeeded and `integrity_check` was `ok`. Restart recovery cleared the leftover once permissions were back |

Defects found:

1. A second confirm with the fault still present says "User data deleted" while the old
   files remain in the hidden directory.
2. A restart with that directory still locked: the web server exits with code 1 (`EACCES ...
   unlink`), and Electron stays running with no window (`UnhandledPromiseRejectionWarning`).
   The windowless process is [PH-OPS-006](findings/PH-OPS-006.md); the evidence line is
   added there.
3. Harmless: a failed restore leaves a `restore-library:prepared` row in `durable_operations`
   until restart. Recovery rolls back nothing.

Not covered: a fault timed between two commits, Windows, macOS, and a real full disk.

- Driver: `scripts/audit/browser/proof-data001-web.mjs` and
  `scripts/audit/electron/proof-data001-electron.mjs`, with helpers
  `proof-data-common.mjs` and `proof-electron-harness.mjs`. Evidence:
  `$TMPDIR/p11/PF/data/web001/` and `el001/`.

## Status Changes

- Moved to `verified` (2026-10-21, verifier "Claude Code (acting), agent proof run
  2026-10-21"): PH-PAR-003, PH-ARCH-002, PH-MUS-003, PH-DATA-002.
- PH-ARCH-001 stays `fixed`.
- PH-DATA-001: `fixed` to `reproduced` (failed re-verification, per
  `templates/reverification-record.md`) to `accepted` the same day, after the lead's
  challenge, at P2 (lowered from P1). The data-loss path is fixed: delete, bulk delete and
  restore roll back with byte-identical files and rows. What is left is the error wording
  without retry guidance, a reset retry that reports success while old files remain hidden,
  and a startup that stops while the leftover is locked. None loses data the user meant to
  keep. It moves to new slice 19 "Destructive-operation failures", wave 2. Required proof:
  rerun `proof-data001-web.mjs` and `proof-data001-electron.mjs`.
- [PH-OPS-006](findings/PH-OPS-006.md) gains one evidence line: this run reproduced a
  windowless Electron process after a failed reset recovery at startup.
- Counts: 69 findings. Verified 10 (P0 1, P1 2, P2 7), fixed 7 (P1 3, P2 4), accepted 51
  (P0 1, P1 2, P2 16, P3 32), accepted-risk 1 (P3). Coverage stays 154 of 156.

## New Findings

| ID | Severity | Title | Slice |
|---|---|---|---|
| [PH-MUS-017](findings/PH-MUS-017.md) | P2 | Changing a track assignment silently deletes every saved fingering for the song | 20 "Fingering preservation", wave 2 |
| [PH-DATA-010](findings/PH-DATA-010.md) | P3 | The reset confirmation does not name packs, practice history or fingerings, and on the web says "from this device" for server-side data | 8 "Delete confirmation" |
| [PH-UI-020](findings/PH-UI-020.md) | P3 | The song-load error panel does not take focus, and Retry is about 54 Tab presses away | 10 "Dialogs and Escape" |

## Residual Observations (Not Findings)

- OP-017 timeout and grandchildren: the 45 s timeout kills only the direct child. A converter
  that forks would leave its worker alive (`ONLY=timeout-grandchild`). The Docker image runs
  `/opt/musescore/bin/mscore4portable` from the extracted AppImage, not AppRun, so this
  probably does not apply. Unchecked.
- OP-017 masked output limit: a converter that ignores SIGXFSZ and exits 0 leaves exactly
  10 MiB, which passes the `> limit` check. The user then sees a raw "Cannot read properties
  of undefined (reading 'forEach')" (`ONLY=output-masked`). No song row, temp directory or
  process is left.
- PH-PAR-003 repair path: a hash-matching legacy source with corrupt bytes is copied and
  served with 200 (see above).
- The harmless `restore-library:prepared` row left by a failed restore (see PH-DATA-001).

## Evidence

All under `$TMPDIR/p11/PF/`:

- `probes/par003/`, the `probes` report for OP-017 and `probes/op017-work/`
- `browsers/{edge,firefox,chromium}/`
- `electron/{ipc,trigger,mus1,mus1b}/` with `ipc.out`, `trigger.out` and `mus1.out`
- `data/{web001,el001,web002,el002}/`

Drivers (new, untracked until committed): `scripts/audit/browser/proof-*.mjs`,
`scripts/audit/electron/proof-*.mjs`, `scripts/audit/proof-par003-unplayable-legacy.mjs` and
`scripts/audit/proof-op017-musescore-limits.mjs`.
