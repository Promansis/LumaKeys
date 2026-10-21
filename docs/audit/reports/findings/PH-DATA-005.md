# PH-DATA-005: Desktop update opens an empty library because the legacy profile lookup misses every real pre-rename `userData` directory

- Lane: DATA
- Severity: P1
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: Electron (Linux proven; Windows by the same mechanism, owed to sitting 2)
- Coverage rows: DATA-017, OP-015 (on desktop it makes every store in DATA-001 to DATA-014 and DATA-016 unreachable)
- Related/duplicate findings: PH-DATA-004 (browser-side carry-over missing; different store, same rename), PH-PAR-003 (legacy JSON migration; works), PH-DATA-006, PH-OPS-006
- First observed against: `main` at source identity `6e549b6`, Phase 11 lane B, 2026-10-19

## User Impact

A desktop user who practised on any build before the rename updates to the current
build and sees a fresh install: no songs, no results, no streak, no settings, no
installed sample packs, and the first-run guide again. Nothing tells them why. The
old data is not deleted; it sits in `<appData>/luma-keys/` (builds from 2026-04-29 to
2026-08-07) or `<appData>/piano-hero/` (earlier builds), where `<appData>` is
`~/.config` on Linux and `%APPDATA%` on Windows. The new build writes to
`<appData>/lumakeys/`. If the user keeps practising, the new profile accumulates its
own history, and any later automatic migration hits the "both databases exist"
refusal, so recovery gets harder with each session.

Severity P1, not P0: the bytes survive and a person who knows where to look can move
the directory back, but the core library and progress workflows fail for every
pre-rename desktop user, silently, at the moment of updating. Whether it has
already happened to the owner is staged as a sitting 0 and sitting 2 item.

## Expected Behavior Or Oracle

- The rename commit's own contract, `src/persistence/legacyBrandMigration.ts:66-78`:
  a one-release boundary that carries "a legacy `pianohero` profile or database into
  the current `lumakeys` layout at startup".
- `CONTEXT.md:114`, quality priority 1: "No user-data loss, arbitrary file access, or
  unsafe privileged operations."
- `docs/agents/lumakeys-runtime-data-audit.md:52-53` names "schema upgrade from
  supported old states" as a high-risk sequence.

## Evidence

### Environment

- Commit/patch identity: `6e549b6` source; current `out/main/index.js`; packaged
  `dist/linux-unpacked` build from 2026-08-07 whose migration function and
  `whenReady` block are byte-identical to the current `out/main/index.js` (compared
  in the probe session; no persistence or main-process source changed after it
  except one test file).
- OS/runtime: Linux, Electron 30.5.1 run headless (`--ozone-platform=headless
  --no-sandbox --disable-gpu`) with `HOME` and `XDG_*` pointing under
  `$TMPDIR/p11/B/electron-userdata/`; never the real `~/.config`.
- Fixture: seeded legacy profiles (`pianohero.db` plus `midi-files/`).

### Reproduction

1. Which directory released builds wrote. Electron names `userData` after
   `package.json` `productName`, else `name`. `package.json` has never had a
   `productName`; `name` was `piano-hero` until `f371870` (2026-04-29), `luma-keys`
   until `2c39d72` (2026-08-07), and `lumakeys` since. `productName: PianoHero` lived
   only in `packaging/electron-builder.yml`, and electron-builder 24.13.3 does not
   copy it into the packaged `package.json` (`node_modules/app-builder-lib/out/fileTransformer.js`
   `modifyMainPackageJson` merges only `config.extraMetadata`, which this repository
   does not set). The pre-rename Windows build on disk confirms it:
   `dist/win-unpacked/PianoHero.exe` carries an `app.asar` whose `package.json` is
   `{"name":"luma-keys"}` with no `productName`, no `setName` call, and
   `pianohero.db` as the database name. The last audited identity, `0bd40f5`
   (Phase 10), has the same `name`, no `setName` and `pianohero.db`, so every desktop
   install of the audited build keeps its data in `<appData>/luma-keys/pianohero.db`.
2. Which directory the current build uses. `src/main/index.ts:96` calls
   `app.setName('LumaKeys')` inside `whenReady`, after Chromium has already resolved
   and cached `userData`. Probe case E1 to E3: `nameAfterSetName` is `LumaKeys` but
   `userData` is `<appData>/lumakeys`. Cases E4 and E5 confirm the old names give
   `<appData>/luma-keys` and `<appData>/piano-hero`.
3. Where the migration looks. `src/main/index.ts:100-103` passes
   `defaultLegacyProfileDir(app.getPath('appData'))`, which is `<appData>/PianoHero`
   (`legacyBrandMigration.ts:136-138`). No build in git history wrote that directory.
4. Result with the real migration code in Electron (`scripts/audit/electron-userdata-probe.mjs`):
   - E1, legacy profile at `luma-keys`: `migrated: false`; the legacy profile keeps
     `midi-files` and `pianohero.db`; `lumakeys.db` does not exist, so the app
     creates an empty one.
   - E2, legacy profile at `piano-hero`: same.
   - E3, legacy profile at `PianoHero`: migrated. This is the only case the unit
     tests exercise, and no real user has it.
5. Result with the packaged build (case P1): after launch, `~/.config/lumakeys/`
   holds a new `lumakeys.db` with 15 tables and 0 songs, 0 game results, 0 theory
   results, plus a new `Local Storage`; `~/.config/luma-keys/pianohero.db` and its
   `midi-files/` are untouched.
6. Repeat count: probe run three times on 2026-10-19 with the same result.

### Artifacts

- File/line: `src/main/index.ts:95-103`; `src/persistence/legacyBrandMigration.ts:135-138`; `src/persistence/legacyBrandMigration.test.ts:109-111` (asserts the `PianoHero` path, so the suite encodes the wrong assumption); `packaging/electron-builder.yml:2`; `package.json` `name`.
- Command: `node scripts/audit/electron-userdata-probe.mjs --packaged`; output `$TMPDIR/p11/B/electron-userdata-probe.out` (sha256 `34ddf3b4…af6d712d`, cases E1 to E5, P1 to P3).
- Durable-state before/after: P1 legacy `pianohero.db` before and after: 1 marker row; new `lumakeys.db` after: 0 songs.

## Root Cause

The migration's source location was derived from the packaging `productName`, but
Electron derives `userData` from `package.json` at startup, before `whenReady`. The
owning boundary is the Electron main startup sequence in `src/main/index.ts` plus
`defaultLegacyProfileDir`; no test runs the lookup against the directory a released
build actually used.

## Recommended Remediation Boundary

In `src/main/index.ts`, pin the profile explicitly before `ready`
(`app.setPath('userData', join(app.getPath('appData'), 'lumakeys'))` at module top
level, keeping the directory the current build already uses) and replace the single
legacy directory with an ordered candidate list: `luma-keys`, `piano-hero`,
`PianoHero`. Migrate from the one candidate holding `pianohero.db`; refuse with a
visible message (see PH-OPS-006) if more than one does. Handle users who already ran
the current build: a destination `lumakeys.db` with no user rows (songs, results,
practice days, achievements) is replaceable after backing it up; anything else needs
an explicit choice. Remove `app.setName` from `whenReady` or move it before `ready`.

## Required Regression Proof

- Deterministic unit/integration proof: `legacyBrandMigration.test.ts` cases for each candidate name, for two candidates holding data, and for an empty pre-existing `lumakeys.db`.
- Electron proof: `scripts/audit/electron-userdata-probe.mjs --packaged` on a rebuilt package: P1 must show the legacy song count in `lumakeys/lumakeys.db` and an empty legacy directory.
- Data/recovery proof: interrupted-migration cases from PH-DATA-006 rerun against the new candidate list.
- Manual proof: sitting 2, Windows portable update over a real `%APPDATA%\luma-keys` profile.
- Broader regression command: `npx vitest run src/persistence`.

## Challenge Record

- Independent reproduction attempt: three independent routes agree: git history of `package.json`, the pre-rename Windows `app.asar` on disk, and two Electron runtime probes (throwaway app with the real bundled migration, and the packaged build).
- Alternative explanations tested: (a) "`app.setName` changes `userData`": disproved at runtime (E1 to E3). (b) "electron-builder injects `productName` into the packaged `package.json`": disproved by the packaged `app.asar` contents (`productName` absent in both the Linux and Windows builds) and by the app-builder-lib source. (c) "some build overrode `userData` with `setPath`": `git log -S setPath -- src/main` shows only an unrelated asset helper; `git log -S "getPath('userData')"` shows the call unchanged since `4d7681f`. (d) Headless mode as the cause of the empty library: the same headless run migrates correctly when the legacy directory is named `PianoHero` (E3), so the lookup, not the environment, decides.
- Scope/severity changes: P0 considered and rejected because the legacy bytes are intact and recoverable by hand; P1 because every pre-rename desktop user loses access to all durable state on update.
- Lead check of this host, 2026-10-19 (directory names and metadata only, contents not read): `~/.config/PianoHero/` exists holding `pianohero.db` (180 KB) and `midi-files/`, every entry stamped 2026-08-08 01:08:43, which looks like a single copy rather than app use; `~/.config/piano-hero`, `luma-keys`, `lumakeys`, and `LumaKeys` do not exist. So on this Linux host the current build would find and migrate that copy (case E3), and the title's "no build wrote" should read "no build's default `userData`". The defect still hits any real install, including the August Windows portable build (`%APPDATA%\luma-keys`), which sitting 2 checks.
- Deduplication decision: distinct from PH-DATA-004 (browser IndexedDB name, web only) and PH-PAR-003 (legacy JSON metadata, which migrates correctly in both runtimes, cases J1 and P3).
- Challenger conclusion and date: reproduced, 2026-10-19.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P1. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: branch `remediation/p11-s01-desktop-migration`, commit `3ee10c2` (Phase 11 remediation slice 1, with [PH-DATA-005](PH-DATA-005.md), [PH-DATA-006](PH-DATA-006.md) and [PH-OPS-006](PH-OPS-006.md)). Not yet reviewed or merged.
- Verification evidence:
  - Change: `src/main/index.ts` pins `userData` to `<appData>/lumakeys` at module top level, before `ready` (`desktopProfileDir` in the new `src/main/desktopStartup.ts`), and calls `app.setName` there instead of inside `whenReady`. `legacyProfileDirs(appData)` in `src/persistence/legacyBrandMigration.ts` replaces `defaultLegacyProfileDir` and lists `luma-keys`, `piano-hero` and `PianoHero`. The migration takes the one candidate holding `pianohero.db`. Two or more candidates are refused with a message naming both and saying which file to rename. A `lumakeys.db` with no user rows (songs, game results, theory results, practice days, unlocked achievements, folders, playlists) is moved to `before-legacy-migration-<time>/` in the profile and replaced. One with user rows opens a question dialog (Use earlier library, Keep current library, Quit; Quit is the default). Keep current is stored in `legacy-library-choice.json`, so the question is not asked again. Profile entries in the way, such as `Local Storage`, go into the same backup folder instead of stopping the migration.
  - Tests that failed before the fix and pass after, in `src/persistence/legacyBrandMigration.test.ts` under `desktop profile lookup (PH-DATA-005)`: `lists the profile directories released builds used, newest first`; `carries a profile left at <appData>/luma-keys|piano-hero|PianoHero into <appData>/lumakeys` (3 cases); `refuses to choose between two earlier profiles, names both and moves nothing`; `backs up an empty lumakeys.db from the current build and replaces it`; `asks before replacing a lumakeys.db that holds …` (7 cases, one per kind of user row); `uses the earlier library when chosen and keeps the current one as a backup`; `keeps the current library when chosen and does not ask again`; `backs up a destination entry that is in the way instead of refusing`. In the new `src/main/desktopStartup.test.ts`: `pins the profile to <appData>/lumakeys`, `names both directories and offers to quit by default`, `maps each button to its choice`. Before the fix these failed because the new API did not exist (`legacyProfileDirs is not a function`; 24 failed, 4 passed in `$TMPDIR/p11-s01/before/unit-legacyBrandMigration.out`). The baseline behavior is shown by the Electron probe below.
  - Electron proof, throwaway app (`scripts/audit/electron-userdata-probe.mjs` part one: the real migration code bundled from `src/`, headless, own HOME and XDG dirs). Before: E1 (`luma-keys`) and E2 (`piano-hero`) give `migrated:false`. After: E1, E2 and E3 migrate into `.config/lumakeys` and leave the earlier directory empty; E4 and E5 (package names `luma-keys` and `piano-hero`) still open `.config/lumakeys`. Output `$TMPDIR/p11-s01/after/electron-userdata-probe-part1.out` (sha256 `c1e80e80…ce0a2f00`).
  - Function-level probe (`scripts/audit/legacy-brand-probe.ts`): cases H0 to H5 all keep the WAL-only commit (theory scores [7, 9]) with `integrity_check` `ok`. Output `$TMPDIR/p11-s01/after/legacy-brand-probe.out` (sha256 `9e9f9a35…6cd8cbde`).
  - Packaged proof (P1 on a rebuilt package): not done. The packaged app takes the new single-instance lock, which needs a Unix socket, and the agent sandbox blocks `socket()`, so every packaged launch aborts before startup runs (`FATAL:process_singleton_posix.cc(289)] Check failed: . socket() failed: Operation not permitted`, `$TMPDIR/p11-s01/after/manual-launch/sandboxed-launch.out`, sha256 `53b213c9…809c27f3`). Running the probe outside the sandbox was refused. A Linux `--dir` package of the fix exists in a private copy (`app.asar` sha256 `baafc670…6b67de89`). The baseline packaged P1 (0 songs in the new database, the earlier profile untouched) is in `$TMPDIR/p11-s01/before/electron-userdata-probe-packaged.out` (sha256 `f38f7216…5c449db6`).
  - Validation on the fix commit: `npx vitest run` 67 files passed, 1 skipped (391 tests passed, 1 skipped, the existing `museScore.integration.test.ts`); `npx tsc --noEmit` and `npx tsc --noEmit -p tsconfig.server.json` exit 0; `npm run build` and `npm run build:web` exit 0. Node v24.15.0, Electron 30.5.1.
- Residual risk: the packaged P1 run and the Windows check in sitting 2 (portable build over a real `%APPDATA%\luma-keys` profile) are still owed, and the question dialog has not been seen on a real display. Hidden `.midi-files-reset-*` and `.instrument-sample-packs-reset-*` directories in an earlier profile are not moved. Migrated songs keep the old absolute path in `songs.file_path`; reads go by song id, so this has no visible effect.
- Revisit trigger, if accepted-risk:
