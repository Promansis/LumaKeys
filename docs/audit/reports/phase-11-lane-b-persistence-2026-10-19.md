# Phase 11 Lane B: Persistence And Durability

- Lane owner: Claude Code (acting)
- Reviewer/challenger: Claude Code (acting), second pass on every candidate
- Baseline identity: `main` at `6e549b6` plus audit-only commits (HEAD `6ca051e`); delta base `0bd40f5` (Phase 10)
- Started: 2026-10-19
- Last updated: 2026-10-19
- Status: challenged. Matrix, ledger and user-test changes are proposed at the end for the lead to merge.

## Scope

- Coverage rows: DATA-001 to DATA-017, OP-002, OP-005, OP-007, OP-009, OP-015, MOD-001
- User journeys: first start after updating from a pre-rename build (desktop and web), restart after an interrupted start, operator environment configuration
- Runtimes: web server (`dist/server/index.cjs`, current for this source), Electron (headless, both a throwaway app with the real bundled migration and the packaged `dist/linux-unpacked` build), and function level (real `src/` modules through the repository's tsx loader)
- Data/privileged boundaries: server data-directory resolution, Electron `userData`, legacy profile move, SQLite set rename, browser `localStorage` keys
- Explicit exclusions: the owner's real profiles and deployment data (`~/.config`, `/media/storage/lumakeys`, the repository's `.pianohero-data`) were not opened; Windows; Docker. Lane F rows WF-020 to WF-023 were already proven on the web and were not repeated.

## Method

All data directories, Electron `HOME` and `XDG_*` roots, and fixtures were created
under `$TMPDIR/p11/B/` (`$TMPDIR` is `/tmp/claude-1000`). Every probe refuses a root
outside `$TMPDIR`. The server ran only on port 3798. Legacy databases were built with
the real `AppDatabase`, and the WAL fixture was made by committing with
`wal_autocheckpoint = 0` and killing the writer with SIGKILL, so its last commits
exist only in `pianohero.db-wal`.

Headless Electron runs in the agent sandbox with `--no-sandbox --disable-gpu
--ozone-platform=headless` and an isolated `HOME`. D-Bus errors are printed and are
harmless. Electron sometimes ends with SIGSEGV when the probe sends SIGTERM after the
checks are done; the results are read before that. This contradicts the plan's
Environment Requirements row for Linux Electron (see Observations).

| Probe | What it runs | Output (sha256) |
|---|---|---|
| `scripts/audit/legacy-brand-server-probe.mjs` | built server, one process per case, cases S1 to S8, V1 to V8, J1 | `$TMPDIR/p11/B/legacy-brand-server-probe.out` (`69b71dcb…e253ea`) |
| `scripts/audit/electron-userdata-probe.mjs --packaged` | Electron cases E1 to E5 and packaged cases P1 to P3 | `$TMPDIR/p11/B/electron-userdata-probe.out` (`34ddf3b4…af6d712d`) |
| `scripts/audit/legacy-brand-probe.ts` | function-level interruption cases H0 to H5 | `$TMPDIR/p11/B/legacy-brand-probe.out` (`52d67ba5…6d00bb0a`) |
| `scripts/audit/browser/legacy-filter-presets.mjs` | Chromium 141, legacy `localStorage` preset key | `$TMPDIR/p11/B/legacy-filter-presets.out` (`198d2837…4b235901`) |
| `node_modules/.bin/vitest run src/persistence src/storage` | persistence and storage suites | `$TMPDIR/p11/B/vitest-persistence.out` (`8bd62c50…82e9e3d2`): 7 files, 47 tests passed |

## Evidence Plan

| Surface | Oracle/invariant | Method/fixture | Runtime | Expected artifact |
|---|---|---|---|---|
| Server data-directory fallback | rename contract in `legacyBrandMigration.ts:66-78`; no silent data loss (`CONTEXT.md:114`) | seeded `.pianohero-data`, `.lumakeys-data`, env combinations | web | S and V cases |
| Electron `userData` and profile migration | same | throwaway Electron app per package name; packaged build | Electron | E and P cases |
| Interrupted migration | "Multi-step durable mutations are atomic or leave an explicit recoverable state" (`docs/agents/lumakeys-runtime-data-audit.md:22`) | intermediate states between renames; WAL-only fixture | function level | H cases |
| Browser-side stores | rename contract; DATA-016 | legacy `localStorage` key | web | L and C cases |
| Re-verification | Phase 2 and Phase 4 oracles | suites plus J1 and P3 | both | 47/47; J1; P3 |

## Question 1: Legacy Fallback Scope

The server has no sibling scan. `resolveDataDir` (`src/server/index.ts:21-37`) uses,
in order: a non-blank `LUMAKEYS_DATA_DIR`, then `PIANOHERO_DATA_DIR`, then
`./.lumakeys-data` if it exists, then `./.pianohero-data` if it exists, then
`./.lumakeys-data`. Both directory names are relative to the process working
directory. The database is then renamed in place by `migrateLegacyBrand` with no
`legacyDir` (`src/server/index.ts:46`), so nothing is copied or moved between
directories.

| Case | Setup | Directory used | Data |
|---|---|---|---|
| S1 | only `./.pianohero-data` | `./.pianohero-data` | `pianohero.db` renamed to `lumakeys.db` inside it; the directory keeps its old name |
| S2 | both directories hold a database | `./.lumakeys-data` | legacy left untouched and unused |
| S3 | empty `./.lumakeys-data` plus a legacy database | `./.lumakeys-data` | empty library; legacy silently ignored |
| S4 | `LUMAKEYS_DATA_DIR` set; legacy in cwd | the env directory | empty library; legacy ignored |
| S5 | only `PIANOHERO_DATA_DIR` | the legacy env directory | renamed in place, data intact |
| S6 | both env vars | `LUMAKEYS_DATA_DIR` | empty library; legacy ignored |
| S7 | both database names in one directory | none | server exits with code 1 and prints the "Both ... exist" refusal |
| S8 | server started from an unrelated directory holding a stray `.pianohero-data` | the stray directory | adopted and renamed; `GET /` returns 404 because `dist/web` is also cwd-relative |

Answer: the fallback reads only the working directory, so an unintended directory is
adopted only if the server is started from a directory that holds one (S8). When a
new directory or env var exists the legacy data is ignored without a message (S2,
S3, S4, S6). Data is never copied. Directory names (`.pianohero-data`, the
`PIANOHERO_DATA_DIR` path) are never migrated, so removing the fallback later
strands them unless the operator renames them first.

For Docker the in-container path is `/data` before and after the rename; only the
host path changed (`/media/storage/pianohero` in `489fe45^:docker-compose.yml`,
`/media/storage/lumakeys` now) and the database is renamed in place on first start.
The README has no upgrade note. The host has only `/media/storage/lumakeys`, so the
owner's deployment is already on the new path (directory name checked, contents not
opened).

On desktop the profile mode applies instead (Question 3).

## Question 2: Environment Precedence

| Case | Environment | Result |
|---|---|---|
| V1 | `LUMAKEYS_DATA_DIR=''` | treated as unset: `./.lumakeys-data` |
| V2 | three spaces | treated as unset; no directory named with spaces is created |
| V3 | `rel/data` | resolved against cwd: `./rel/data` |
| V4 | three spaces plus `PIANOHERO_DATA_DIR` | the legacy env directory is used |
| V5 | absolute path with one leading space | not trimmed: creates `./ /tmp/claude-1000/p11/B/legacy-server/V5/abs/lumakeys.db` under cwd; empty library |
| V6 | `''` plus `./.pianohero-data` | `./.pianohero-data` is used |
| V7 | `LUMAKEYS_WEB_ACCESS_TOKEN=''`, `PIANOHERO_WEB_ACCESS_TOKEN` set | access gate disabled: `getAllSongs` returns 200 with no token |
| V8 | only `PIANOHERO_WEB_ACCESS_TOKEN` | gate on: 401 without a token, 200 with the legacy token |

Answer: legacy env precedence survives a blank or whitespace `LUMAKEYS_DATA_DIR`
(V4, V6). Whitespace does not create a literal-space directory (V2), but a
leading space on a real path does create a relative directory whose name starts with
a space (V5). The access token uses `??`, so an empty new token wins over a set
legacy token and the gate turns itself off (V7). Data-directory and token handling
therefore treat blank values differently. V5 and V7 are recorded as observations
(see below); V7 is routed to lane A.

## Question 3: Electron userData After The Rename

Electron names `userData` after `package.json` `productName`, else `name`, and fixes
it before `ready`. The repository has never had a `productName` in `package.json`;
`name` was `piano-hero` until `f371870` (2026-04-29), `luma-keys` until `2c39d72`
(2026-08-07, including the Phase 10 audited identity `0bd40f5`) and `lumakeys`
since. electron-builder 24.13.3 does not copy the builder `productName` into the
packaged `package.json`. `app.setName('LumaKeys')` runs inside `whenReady`
(`src/main/index.ts:96`) and does not move `userData`. The migration looks only in
`<appData>/PianoHero` (`legacyBrandMigration.ts:136-138`), a directory no build wrote.

| Case | Package name | Legacy profile seeded at | `userData` | Result |
|---|---|---|---|---|
| E1 | `lumakeys` | `luma-keys` | `<appData>/lumakeys` | `migrated: false`; no `lumakeys.db`, so the app would create an empty one; legacy profile untouched |
| E2 | `lumakeys` | `piano-hero` | `<appData>/lumakeys` | same |
| E3 | `lumakeys` | `PianoHero` | `<appData>/lumakeys` | migrated (the only case the unit tests cover) |
| E4 | `luma-keys` | none | `<appData>/luma-keys` | confirms the Phase 10 build's directory |
| E5 | `piano-hero` | none | `<appData>/piano-hero` | confirms the earlier builds' directory |
| P1 | packaged build | `luma-keys` | `~/.config/lumakeys` | new `lumakeys.db`, 15 tables, 0 songs, 0 game results, 0 theory results; legacy profile untouched |

Answer: on desktop, data silently disappears from the user's view on update. This is
candidate [PH-DATA-005](findings/PH-DATA-005.md) (P1). The source and config proof
is complete for Linux; the Windows run and the check of the owner's own profiles are
staged below for sittings 0 and 2.

## Question 4: Interrupted Migration

The SQLite set is moved as three separate renames, main database first. States were
constructed exactly as the code leaves them between two renames.

| Case | State on restart | Result |
|---|---|---|
| H0 | uninterrupted, same directory and profile mode (controls) | WAL-only rows survive (marker `wal-only`, scores 7 and 9) |
| H1 | profile move stopped after `midi-files` | restart completes the move; data intact |
| H2 | profile move stopped after `pianohero.db` became `lumakeys.db` | `migrated: false` on every later start; the app opens the database without its WAL; WAL-only rows lost (marker `checkpointed`, score 7 only) with `integrity_check` ok; the WAL stays in the old profile |
| H3 | same-directory rename stopped after the `.db` | refuses with "Back up one and remove the other"; doing that loses the WAL-only rows; finishing the rename by hand keeps them |
| H4 | same-directory rename stopped before the `-shm` | refuses because a stale `pianohero.db-shm` counts as a legacy database; removing it recovers fully |
| H5 | profile entry already exists at the destination (`Local Storage`) | moves `midi-files`, then refuses, and refuses again on every start with the library split across two directories |
| P2 | packaged build, both database names in the profile | no window; process still running after 12 s; refusal printed only as an unhandled rejection on stderr |

A cross-filesystem legacy profile is refused before anything moves (function-level
probe; destination left empty).

Answer: recovery holds for the directory-entry stage (H1) only. H2 to H4 are
candidate [PH-DATA-006](findings/PH-DATA-006.md) (P3). P2 shows that every desktop
refusal is invisible: candidate [PH-OPS-006](findings/PH-OPS-006.md) (P2). The
DATA-017 note "recovers a half-finished move on restart" should be narrowed.

## Question 5: End Of The One-Release Fallback

No end condition exists. The code says "one release" in four places, but the version
is `0.1.0` both at the Phase 10 identity and now, the only tag is
`rebrand-safe-baseline-46b1197`, and no issue, date, version gate or owner is
recorded. Shims in the tree:

| Shim | Location | Removal note in code |
|---|---|---|
| Profile and database migration | `src/persistence/legacyBrandMigration.ts`, called from `src/main/index.ts:100-103` and `src/server/index.ts:46` | "One-release compatibility boundary" (:67) |
| `PIANOHERO_DATA_DIR` and `./.pianohero-data` | `src/server/index.ts:21-37` | comment at :20 says "Legacy-first", but the code is new-first |
| `PIANOHERO_WEB_ACCESS_TOKEN` | `src/server/index.ts:17` | "one-release fallback" (:15) |
| `PIANOHERO_SKIP_ELECTRON_REBUILD` | `scripts/ensure-native-module.cjs:26-27` | "drop ... after migration" |
| `piano-hero` mode alias on the bridge | `src/server/bridgeRouter.ts:94-95`, `:388` | "one-release alias" |
| `game_results.mode` normalization | `src/persistence/database.ts:224` | none; it is a data migration and can stay |
| ignore entries | `.gitignore:16-17`, `.dockerignore:9-10` | none |

Stores the rename changed with no carry-over: the web IndexedDB pack store
(PH-DATA-004), the `localStorage` preset key (candidate
[PH-DATA-007](findings/PH-DATA-007.md)), and the real desktop profile directories
(PH-DATA-005). The answer goes to lane H, which drafts a proposed ADR with an end
condition. A removal date is the owner's decision; the draft proposes a
release-based end that cannot come before PH-DATA-005 is fixed and shipped.

## Re-Verification Records

| Finding | Phase 11 evidence | Result |
|---|---|---|
| PH-DATA-001 | `crossStoreMutations.test.ts` (3), `midiStorage.test.ts` (5), `database.test.ts` (13) pass; SIGKILL against renamed paths: lane F WF-023 (web, `lumakeys.db`) and H0 here (legacy WAL set killed with SIGKILL, migrated with all rows) | holds |
| PH-DATA-002 | lane F WF-022 (full reset clears songs, MIDI directory and `localStorage`); suites pass | holds; PH-DATA-004 stays open for the legacy IndexedDB name |
| PH-DATA-003 | `libraryBackup.test.ts` (6) pass; lane F WF-020 rejects tampered bytes with no change | holds |
| PH-PAR-003 | J1 (web): a legacy `song-metadata.json` with an external source MIDI imports, the file lands under `data/midi-files`, `GET /api/midi/<id>` returns 200 and the bytes match. P3 (packaged Electron, Linux): same result, `song-metadata.json.migrated` written | holds in both runtimes |

`src/main/index.ts` and `src/server/index.ts` were listed in the plan as modified
without a touched test. The E, P, S and V cases above are runtime proof of both
startup paths.

## Working Flows Confirmed

| Coverage row | Evidence | Conditions/limits | Disposition |
|---|---|---|---|
| DATA-017 | S1, S5: legacy directory or env adopted and database renamed in place with all rows | server, Linux | works |
| DATA-017 | S7 and H3: both database names refuse instead of overwriting | refusal text is misleading (PH-DATA-006) | works as designed |
| DATA-017 | E3 and H0 profile control: a profile at `<appData>/PianoHero` migrates with WAL rows | no real user has that directory (PH-DATA-005) | works for the tested path only |
| DATA-017 | cross-filesystem profile refused before any move | function level | works |
| DATA-017 | V1, V2, V4, V6: blank and whitespace `LUMAKEYS_DATA_DIR` are treated as unset | V5 leading space is not trimmed | works |
| DATA-017 | V8: a deployment with only the legacy token keeps its gate | V7 empty new token disables it | works |
| OP-015, MOD-001 | H0: WAL-only commits survive migration; migrated databases open with `integrity_check` ok; 47/47 suites | function level and server | works |
| OP-002, DATA-002 | J1 and P3 (PH-PAR-003) | Linux packaged Electron and web | works |
| DATA-001 to DATA-014 | suites 47/47; lane F WF-020 to WF-023 web proof | no persistence change in the delta beyond the rename | works |

## Findings

| Finding | Why it belongs to this lane | Shared lanes |
|---|---|---|
| [PH-DATA-005](findings/PH-DATA-005.md) | desktop update opens an empty profile; legacy profile lookup misses every real directory | D (parity), G (packaging) |
| [PH-DATA-006](findings/PH-DATA-006.md) | interrupted rename not resumed; WAL-only commits dropped or startup refused | none |
| [PH-OPS-006](findings/PH-OPS-006.md) | desktop startup failures show nothing | D, G |
| [PH-DATA-007](findings/PH-DATA-007.md) | legacy `localStorage` preset key not carried over | E or F (library UI); may merge with PH-DATA-004 |

## Evidence Gaps

| Coverage row | Missing proof | Why blocked | Owner | Next action |
|---|---|---|---|---|
| DATA-017 | whether the owner's own desktop profiles are affected | rule: the agent does not read `~/.config` | owner | sitting 0 item below |
| DATA-017, OP-015 | Windows run of PH-DATA-005 and PH-OPS-006 | Windows | owner | sitting 2 items below |
| DATA-016 | Electron half of PH-DATA-007 | not run; same renderer code | lead | rerun after PH-DATA-005 is fixed |

## Runtime And Failure Coverage

- Electron: Linux, headless, throwaway app and packaged build (E1 to E5, P1 to P3). Windows owed to sitting 2.
- Web: built server, port 3798 (S, V and J1 cases); Chromium for the preset key.
- Loading/empty/disabled: empty `lumakeys.db` created when no legacy data is found (E1, P1, S3, S4).
- Error/retry/recovery: refusals S7, H3, H4, H5, P2; cross-filesystem refusal.
- Destructive/interruption: SIGKILL of a legacy writer (WAL-only fixture); constructed half-moved states H1 to H5.
- Accessibility or hardware proof: not applicable.

## Challenge Summary

- Claims disproved or narrowed: DATA-017 "recovers a half-finished move on restart" holds for H1 only. The plan's "sibling `.pianohero-data`" question: there is no sibling scan, only cwd (S8). "Idempotent" in `legacyBrandMigration.ts` holds for complete states, not partial ones.
- Duplicates merged: none. PH-DATA-007 is a separate store from PH-DATA-004 and is offered for merging.
- Severity changes: PH-DATA-005 P0 considered, P1 kept (bytes intact). PH-DATA-006 P2 considered, P3 kept (narrow trigger). PH-OPS-006 P1 considered, P2 kept (needs an unusual profile state).
- Environmental failures separated: Electron exits 0 on SIGTERM, so liveness was recorded with elapsed time and a killed-by-probe flag; SIGSEGV after SIGTERM in headless mode occurs after results are read; D-Bus errors are harmless; a tsx CLI pipe error in the sandbox was avoided by loading tsx with `node --import`.

## Observations (no finding)

- V5: `resolveDataDir` checks `trim()` for blankness but resolves the untrimmed value, so a leading space makes a relative directory under cwd and an empty library.
- V7: `resolveAccessToken` uses `??`, so an empty `LUMAKEYS_WEB_ACCESS_TOKEN` disables the gate even when the legacy token is set. Needs an operator to set an empty value; routed to lane A, next to PH-OPS-002.
- `src/server/index.ts:20` says "Legacy-first env precedence"; the code is new-first.
- S8: `dist/web` is resolved from cwd (`src/server/index.ts:44`), so a server started from another directory serves 404 at `/`. Routed to lane G.
- The repository root holds `.pianohero-data` and no `.lumakeys-data`. `npm run dev:web` without `LUMAKEYS_DATA_DIR` therefore uses `.pianohero-data` and renames the database inside it on first start. Contents not inspected.
- `scripts/audit/browser/harness.mjs` spawns the server with `cwd` set to the repository and lets `opts.env` override `LUMAKEYS_DATA_DIR`. A blank override (V1, V6) would open the repository's `.pianohero-data`, the owner's development data. Proposed for the lead: the harness should refuse a blank or relative data directory.
- `legacyBrandMigration.test.ts:100-107` ("different filesystem") does not reach the cross-filesystem branch, and `:109-111` asserts the `PianoHero` path, so the suite encodes PH-DATA-005.
- Other renames without carry-over, session-level only: access cookie `pianohero_web_access` and header `x-pianohero-access-token` (users enter the token once more), and `setAppUserModelId('com.pianohero.app')` (Windows groups old taskbar pins separately).
- Headless Electron works in this sandbox (see Method). Sitting 0 item 1 could run here without `xvfb-run`, using the current `out/` and no `npm run build`.
- Eleven zero-byte, read-only dotfiles (`.bashrc`, `.gitconfig`, `.mcp.json`, `.vscode` and others) appeared untracked in the repository root at 22:25:55. They match sandbox mount placeholders, and lane B scripts write only under `$TMPDIR`. They should not be committed.

## Lane Exit Check

- [x] Every assigned coverage row has an owner.
- [x] Every assigned row has evidence and disposition, or an explicit gap.
- [x] All findings link to detailed reports and coverage rows.
- [x] P0/P1 leads were independently challenged.
- [x] Positive/working behavior is recorded.
- [x] Manual and hardware gaps are explicit.
- [ ] Coverage summary counts were updated. Lead action: the proposed statuses below leave the counts unchanged; `recount-coverage.mjs --check` passed on 2026-10-19 (lane H report).

## Sign-Off

- Lane owner/date: Claude Code (acting), 2026-10-19
- Challenger/date: Claude Code (acting), 2026-10-19
- Audit lead/date: pending

## Proposed Matrix Updates

Evidence link text below is relative to `docs/audit/`. `P11-B` means [P11-B](reports/phase-11-lane-b-persistence-2026-10-19.md#re-verification-records) unless another anchor is given.

- DATA-001: covered; P11-B; SQLite lifecycle unchanged and suites pass. Desktop users updating from a pre-rename build cannot reach these rows (PH-DATA-005).
- DATA-002: covered; P11-B; PH-PAR-003 legacy MIDI migration holds in both runtimes (J1 web, P3 packaged Electron); add PH-DATA-005.
- DATA-003: covered; P11-B; unchanged.
- DATA-004: covered; P11-B; unchanged; WF-023 SIGKILL proof against `lumakeys.db` (lane F).
- DATA-005: covered; P11-B; unchanged.
- DATA-006: covered; P11-B; unchanged.
- DATA-007: covered; P11-B; unchanged.
- DATA-008: covered; P11-B; unchanged.
- DATA-009: covered; P11-B; unchanged.
- DATA-010: covered; P11-B; unchanged.
- DATA-011: covered; P11-B; unchanged.
- DATA-012: covered; P11-B; unchanged.
- DATA-013: covered; P11-B; six backup tests and lane F WF-020 hold.
- DATA-014: covered; P11-B; unchanged; the desktop profile move includes `instrument-sample-packs` but never runs for real profiles (PH-DATA-005).
- DATA-015: covered; no lane B change; PH-DATA-004 stays open.
- DATA-016: covered; [P11-B](reports/phase-11-lane-b-persistence-2026-10-19.md#question-5-end-of-the-one-release-fallback); add PH-DATA-007 (legacy `localStorage` preset key not carried over, web reproduced).
- DATA-017: covered; [P11-B](reports/phase-11-lane-b-persistence-2026-10-19.md#question-1-legacy-fallback-scope); replace the note with: "Server fallback is cwd-relative and renames in place; desktop lookup misses every real legacy profile (PH-DATA-005); restart resumes only the directory stage (PH-DATA-006); desktop refusals are invisible (PH-OPS-006); browser stores PH-DATA-004 and PH-DATA-007; no removal date in the repository, end condition drafted as proposed ADR 0002 in lane H."
- OP-002: covered; P11-B; J1 and P3 add Phase 11 runtime proof of legacy load in both runtimes.
- OP-005: covered; P11-B; unchanged; lane F WF-020 web proof, Electron save-dialog path stays with lane F.
- OP-007: covered; P11-B; unchanged; `crossStoreMutations.test.ts` passes.
- OP-009: covered; P11-B; unchanged; lane F WF-022 web proof.
- OP-015: covered; [P11-B](reports/phase-11-lane-b-persistence-2026-10-19.md#question-4-interrupted-migration); add PH-DATA-005, PH-DATA-006, PH-OPS-006; WAL-only commits survive an uninterrupted migration.
- MOD-001: covered; P11-B; `database.ts` delta is the database file name and the mode normalization (`:224`), both tested; no new risk.

## Proposed User-Test Items

| Sitting | Coverage row / finding | Steps (already prepared) | Expected |
|---|---|---|---|
| 0 (host terminal) | DATA-017, PH-DATA-005 | Read-only listing, opens no file: `for d in piano-hero luma-keys PianoHero lumakeys; do echo "== ~/.config/$d"; ls -l ~/.config/$d 2>/dev/null \| grep -E '(pianohero\|lumakeys)\.db(-wal\|-shm)?$\|midi-files'; done` | Shows which profile holds data. `pianohero.db` under `luma-keys` or `piano-hero` means pre-rename desktop data is waiting there. A `lumakeys.db` under `lumakeys` as well means the current build has already opened an empty profile on this machine (PH-DATA-005 confirmed for the owner). Do not practise in the desktop build until the fix lands. |
| 2 (Windows), before the existing item 1 | DATA-017, PH-DATA-005 | 1. `dir "%APPDATA%\piano-hero" "%APPDATA%\luma-keys" "%APPDATA%\PianoHero" "%APPDATA%\lumakeys"`. 2. If `luma-keys` or `piano-hero` exists: `robocopy "%APPDATA%\luma-keys" "%USERPROFILE%\lumakeys-profile-backup" /E` (same for `piano-hero`). 3. Launch the new portable exe, open the library, close the app. 4. Repeat step 1. | The library is empty. `%APPDATA%\lumakeys\lumakeys.db` is new. `%APPDATA%\luma-keys\pianohero.db` is unchanged. Note: the existing item 1 has the same effect on a machine with a pre-rename profile, which is why this item goes first. |
| 2 (Windows), optional, same session | OP-015, PH-OPS-006 | After the item above: copy `%APPDATA%\luma-keys\pianohero.db` into `%APPDATA%\lumakeys\`, launch the portable exe, wait 15 s, check Task Manager, end the LumaKeys process, then delete the copied `%APPDATA%\lumakeys\pianohero.db`. | No window and no message; a LumaKeys process is running (current behaviour). After the fix: an error dialog naming both files, and the process exits. |

## Candidate Findings

| ID | Severity | Summary |
|---|---|---|
| [PH-DATA-005](findings/PH-DATA-005.md) | P1 | Desktop update opens an empty library: `userData` follows the package name (`luma-keys`, earlier `piano-hero`), but the migration looks only in `<appData>/PianoHero` |
| [PH-OPS-006](findings/PH-OPS-006.md) | P2 | A desktop startup failure, including every migration refusal, leaves a running process with no window and the error only on stderr |
| [PH-DATA-006](findings/PH-DATA-006.md) | P3 | An interrupted legacy database rename is not finished on restart; WAL-only commits are dropped or startup is refused |
| [PH-DATA-007](findings/PH-DATA-007.md) | P3 | Library filter presets saved before the rename are no longer offered (`localStorage` key renamed with no carry-over) |

## Files Created

- `docs/audit/reports/phase-11-lane-b-persistence-2026-10-19.md` (this report)
- `docs/audit/reports/findings/PH-DATA-005.md`, `PH-DATA-006.md`, `PH-OPS-006.md`, `PH-DATA-007.md`
- `scripts/audit/legacy-brand-server-probe.mjs`: server data-directory, environment and PH-PAR-003 web cases (port 3798, `$TMPDIR` only)
- `scripts/audit/electron-userdata-probe.mjs`: Electron `userData` and profile-migration cases, optional packaged run
- `scripts/audit/legacy-brand-probe.ts`: function-level interruption cases with a WAL-only fixture
- `scripts/audit/browser/legacy-filter-presets.mjs`: legacy `localStorage` preset key driver
- Scratch only, not in the repository: probe outputs listed under Method, fixtures under `$TMPDIR/p11/B/`
