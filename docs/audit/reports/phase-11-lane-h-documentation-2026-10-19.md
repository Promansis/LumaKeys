# Phase 11 Lane H: Documentation And Governance

- Lane owner: Claude Code (acting)
- Reviewer/challenger: Claude Code (acting)
- Baseline identity: `main` at `6e549b6` plus audit-only commits (HEAD `6ca051e`)
- Started: 2026-10-19
- Last updated: 2026-10-19
- Status: challenged. Document edits are proposed, not made; the lead or the owner applies them.
- Applied 2026-10-21 (remediation task D1): the draft ADR is now [ADR 0002](../../adr/0002-legacy-pianohero-compatibility-window.md) with the removal floor set to 2027-01-31, and the architecture and runtime content of the local, gitignored CLAUDE.md is in [CONTEXT.md](../../../CONTEXT.md) ("Runtime Architecture") and [ADR 0001](../../adr/0001-supported-runtimes-and-desktop-ui.md). The tables below are the audit-time record and are not rewritten.

## Scope

- Coverage rows: none. This lane checks the audit's own instruments.
- Documents: `CLAUDE.md`, `CONTEXT.md`, `README.md`, `docs/agents/*.md`, `docs/adr/*.md`, `docs/audit/*.md`, `docs/audit/reports/*.md`, `docs/audit/templates/*.md`
- Questions: do these documents name only paths that exist; do `CLAUDE.md` and ADR 0001 describe the layout and runtimes after the delta (MuseScore import, `src/server/staticFiles.ts`, video main menu, rename); does the matrix summary match its rows; does the legacy PianoHero fallback need an ADR with an end condition
- Explicit exclusions: no document was edited. `CLAUDE.md` and `AGENTS.md` are local, gitignored files and were read in place.

## Evidence Plan

| Surface | Oracle/invariant | Method/fixture | Runtime | Expected artifact |
|---|---|---|---|---|
| Paths and links in audit documents | plan exit gate: "no document the audit depends on names a path that does not exist" | `scripts/audit/doc-path-check.mjs` (new, read-only) | none | classified reference list |
| `CLAUDE.md`, ADR 0001, `CONTEXT.md`, `docs/agents/*` | they describe the current module layout and runtime support | statements checked against source at `6e549b6` | none | stale-statement table |
| Coverage summary | charter rule: update counts from the tables | `node scripts/audit/recount-coverage.mjs --check` | none | exit code and message |
| Legacy fallback governance | `docs/adr/README.md:15-17`: an ADR is required when work changes persisted data or migration strategy | lane B evidence | none | proposed ADR draft |

## Task 1: Path And Link Check

`scripts/audit/doc-path-check.mjs` reads the document set above and extracts three
kinds of reference:

- Markdown links, with the heading anchor checked using GitHub's slug rules;
- code spans that look like repository paths, with brace and glob expansion and a
  check that `file:line` citations are inside the file;
- bare module names such as `staticFiles.ts`, matched by basename.

Link syntax inside a code span is ignored, because it is not rendered as a link.
Links under a `## Proposed Matrix Updates` heading are resolved from `docs/audit/`,
because the lead pastes them into `coverage-matrix.md`; this also checks their
anchors against the target report. References are classified as `ok`, `untracked`,
`generated` (build output), `shorthand` (exists under `src/` or `scripts/audit/`),
`git-ref` (a branch name), `placeholder`, `runtime` (host paths), or the actionable
classes `missing`, `missing-anchor` and `stale-line`. The script never writes.
`--strict` exits 1 on actionable items outside templates, and `--all` and `--json`
print everything. Self-test documents under `$TMPDIR/p11/B/doccheck/` cover good
and bad anchors, same-file anchors, brace and glob paths, code-span links, and the
matrix-section rule.

Final run on 2026-10-19 at 22:53 (+08:00), after the lane C and D reports landed:
49 documents, 1246 references. Counts: generated 59, git-ref 5, missing 10, ok 1030,
placeholder 5, runtime 8, shorthand 2, untracked 127. No `missing-anchor` and no
`stale-line`. Output: `$TMPDIR/p11/B/doc-path-check.out` (sha256
`3e563367…6e8ad87b`). Most untracked references point at lane reports, findings and
drivers that are not committed yet; they become `ok` when the lead commits them.
Earlier runs at 22:44 and 22:50 (45 and 46 documents) had the same five historical
or external misses.

### Missing

Missing names are written without code formatting in this report so that it does
not trip the checker itself.

| Document:line | Reference | Triage |
|---|---|---|
| `docs/audit/reports/phase-11-lane-a-web-security-2026-10-19.md:27`, `:41`, `:72` | guest-window-manager.ts | Electron's own source file (lib/browser/guest-window-manager.ts in Electron 30.5.1), not a repository path. The text already says "Electron 30.5.1 source". Accepted; optional wording: give the full Electron path so readers do not search the repository. |
| `docs/audit/reports/phase-11-plan-2026-10-19.md:57` | src/main/database.ts | Deliberate: the sentence records that the file moved to `src/persistence/`. Accepted. |
| `docs/audit/reports/phase-8-remediation-plan-2026-07-30.md:180` | SessionToolbar.tsx | No file of that name has ever existed (`git log --all -- '*SessionToolbar*'` is empty). Historical plan; leave as is or add "(planned, not created)". |
| `docs/audit/reports/phase-11-lane-d-runtime-parity-2026-10-19.md:113` | app.asar/out/renderer/curriculum-midis/ode-to-joy.mid | A path inside the packaged archive, not the repository. Accepted. |
| `docs/audit/reports/phase-11-lane-f-library-recording-2026-10-19.md:169-172` | phase-11-lane-f-library-recording-2026-10-19.md#wf-007-detail (and WF-008, WF-015, WF-025) | Real defect in a proposal: the proposed matrix links lack the `reports/` prefix, so they break when pasted into `coverage-matrix.md`. The anchors exist. Lead: add `reports/` when merging. |

### Untracked

| Reference | Where | Triage |
|---|---|---|
| `CLAUDE.md` | plan `:57`, `:139` | gitignored (`.gitignore:3`); see Governance |
| `AGENTS.md` | `docs/agents/README.md:24`, `docs/agents/lumakeys-full-audit.md:8` | gitignored (`.gitignore:4`); see Governance |
| `.codex-audits/codebase` | `CONTEXT.md:79`, `docs/agents/lumakeys-full-audit.md:13` | gitignored (`.gitignore:12`), local history only; acceptable because `CONTEXT.md` labels it historical |
| `scratch/` | `docs/audit/reports/baseline-2026-10-19.md:12`, lane G report `:32` | the reports describe it as an untracked local directory; accepted |
| `public/assets/main-menu/bck.jpg` | lane G report `:52` | same; accepted |
| new findings, lane reports and drivers | lane F, lane B | become `ok` when the lead commits them |

### Extra Run Outside The Default Set

Findings, evidence files and `scripts/audit/README.md` (69 documents, 352
references; output `$TMPDIR/p11/B/doc-path-check-extra.out`). All missing items are
external or historical:

- `docs/audit/evidence/phase-11-delta-inventory-2026-10-19.md:51-55`: the old docs/agents/pianohero-*.md names, in the list of renamed files.
- `findings/PH-OPS-005.md:17`: .github/workflows, which the finding proposes to add.
- `findings/PH-PAR-003.md:39`: midi-files/legacy-migrated-song.mid, a runtime path inside a data directory.
- `findings/PH-SEC-005.md:50`: lib/browser/guest-window-manager.ts, which is Electron source.
- `findings/PH-MUS-009.md:47`: quiz-position-probe.ts, a lane C probe that is not in the repository. Lane C should name its location (`$TMPDIR/...`) or add it under `scripts/audit/`.

One lane B reference to an electron-builder file was corrected to its
`node_modules/` path before this run.

Limitation: a line number inside the file's length does not prove that the cited
code is still on that line. The check catches files that moved or shrank, not
drift within a file.

Exit gate: met after triage. No document the audit depends on names a missing
repository path, apart from the accepted historical and external names above. The
gap is governance: two documents the audit depends on are not versioned.

## Task 2: Layout And Runtime Statements After The Delta

### `CLAUDE.md`

| Line | Statement | Current fact (source at `6e549b6`) |
|---|---|---|
| 41 | "loads MIDI files" | The web runtime also imports `.mscz` through MuseScore (`src/server/museScore.ts`, `README.md:208-211`); Electron imports MIDI only. The runtime difference is not mentioned. |
| 53 | "~60 IPC handlers" | 68 `ipcMain.handle` registrations in `src/main/index.ts`. |
| 58 | `PORT` "default `3000`" | `3100` (`src/server/index.ts:40`). |
| 58 | `LUMAKEYS_DATA_DIR` "defaults to `${cwd}/.lumakeys-data`" | Order is `LUMAKEYS_DATA_DIR`, `PIANOHERO_DATA_DIR`, existing `./.lumakeys-data`, existing `./.pianohero-data`, then `./.lumakeys-data` (`src/server/index.ts:21-37`). This checkout has only `.pianohero-data`, so `npm run dev:web` uses it. |
| 58 | "A catch-all route serves the built SPA ... with a SPA fallback" | `createStaticFileHandler` in `src/server/staticFiles.ts` serves files with explicit MIME types and single byte ranges (for the menu video); the web root is resolved from cwd (`src/server/index.ts:44`, `:71`). The access gate (`src/server/webSecurity.ts`) and `GET /api/access` are not mentioned. |
| 59 | routers: `bridgeRouter` and `midiRouter` `GET /api/midi/:songId` | `midiRouter` also has `POST /upload` (MIDI and `.mscz`) and `POST /:songId/reattach`; `libraryRouter` has `GET /export` and `POST /import`. |
| 60 | "`desktopStubNames`" | Replaced by `WEB_STUB_BRIDGE_METHODS` in `src/shared/bridgeMethods.ts:164` (since `242d3e6`). |
| 62 | `tsconfig.server.json` includes "selected `src/lib/` subtrees" | Includes `src/persistence/**`, `src/storage/**`, `src/shared/**`, `src/lib/achievements/**`, `src/lib/game/**`, `midiFileParser.ts`, `importMetadata.ts`, `src/lib/recommendations/**`. Close enough to keep; listing them avoids guesswork. |
| 70 | Electron DB path `${app.getPath('userData')}/lumakeys.db` | Correct, but `userData` is `<appData>/lumakeys` (before the rename `luma-keys`, earlier `piano-hero`), and the legacy profile migration is not mentioned (it is also broken; PH-DATA-005). |
| 77 | Dockerfile summary | Omits the MuseScore Studio 4.7.5 AppImage download with sha256 check and `LUMAKEYS_MUSESCORE_PATH`. |
| 81 | screen map | Omits `NoveltySoundboardScreen` and the main-menu video background (`MainMenuScreen.tsx:295`, `/assets/main-menu/mainmenu-neonbackground.webm`). |
| 109 | "lesson progress persistence via localStorage" | Lesson progress is stored through bridge settings (`src/lib/learning/learningProgress.ts:17-40`); `developerUnlocks.ts` is not listed. |
| 93-109 | key library modules table | No row for `src/persistence/legacyBrandMigration.ts`, `src/server/museScore.ts`, `src/server/staticFiles.ts` or `src/server/webSecurity.ts`. |

### ADR 0001

| Line | Statement | Current fact |
|---|---|---|
| 33 | "The supported minimum desktop window once confirmed in the audit charter." | Confirmed: `docs/audit/charter.md:41` records `1180x780`. The ADR can state the value. |
| 55 | "The minimum supported desktop window still needs an explicit measured value." | Stale for the same reason. |
| whole ADR | runtime support | The runtime capability split added in the delta is not recorded: `.mscz` import works only on the web runtime and only where MuseScore is installed (Docker image or `LUMAKEYS_MUSESCORE_PATH`), and Electron imports MIDI only. `CONTEXT.md:96` requires such differences to be explicit. |

### Other documents

| Document:line | Statement | Proposed change |
|---|---|---|
| `CONTEXT.md:106-108` | isolation "through `LUMAKEYS_DATA_DIR`" | Require a non-blank absolute path. A blank value falls back to the repository's `.pianohero-data`, the owner's development data (lane B cases V1 and V6). |
| `docs/agents/lumakeys-runtime-data-audit.md:47-48` | "Never reuse production or the owner's normal `.lumakeys-data`." | Also name `.pianohero-data`, which is what this checkout actually uses. |
| `README.md` | Docker setup | No upgrade note for the rename: host path `/media/storage/pianohero` became `/media/storage/lumakeys`, env names changed, and desktop profiles move (once PH-DATA-005 is fixed). |

Correct as written: `CONTEXT.md`'s module ownership map (`:66-79`) and runtime list
(`:13-16`); every path in `docs/agents/*.md`; the MuseScore section of `README.md`.

## Task 3: Coverage Recount

`node scripts/audit/recount-coverage.mjs --check` at 22:44 (+08:00) on HEAD
`6ca051e`, with `coverage-matrix.md` sha256 `e577121d…ea1acb3`, printed "Summary
table matches the rows" and exited 0. Runs at 22:33 and 22:52 gave the same result with the same matrix hash.
Totals: workflows 26 (0 covered, 26 gap or blocked), runtime/UI 12 (6, 6), durable
stores 17 (17, 0), bridge methods 69 (69, 0), privileged operations 18 (16, 2),
modules 14 (12, 2). The owner sign-off column reads "Phase 11 pending" or "in
progress" in every row; no person has signed. Lane B's proposed statuses leave the
counts unchanged. `--write` was not run.

## Governance

- `CLAUDE.md` and `AGENTS.md` are gitignored (`.gitignore:3-4`) but are cited by the
  plan, `docs/agents/README.md` and `docs/agents/lumakeys-full-audit.md`. The plan's
  "corrected on 2026-10-19" edit to `CLAUDE.md` is not versioned, and a fresh clone
  or another agent's checkout has neither file. Owner decision: track them, or move
  the parts the audit relies on into tracked documents.
- `docs/adr/README.md:15-17` requires an ADR when work changes persisted data or
  migration strategy. The PianoHero to LumaKeys rename changed database, directory,
  profile, environment and browser-store names and added a migration, with no ADR.
  A draft follows.

## Proposed ADR 0002 (draft, not under `docs/adr/`)

> # ADR 0002: Legacy PianoHero Compatibility Window And Its End Condition
>
> - Status: proposed
> - Date: 2026-10-19
> - Deciders: repository owner
> - Supersedes: none
>
> ## Context
>
> On 2026-08-07 (`489fe45`, `2c39d72`, `090658e`, `e7c066c`) PianoHero was renamed
> LumaKeys. Persisted names changed: `pianohero.db` to `lumakeys.db`;
> `.pianohero-data` to `.lumakeys-data`; `PIANOHERO_DATA_DIR`,
> `PIANOHERO_WEB_ACCESS_TOKEN` and `PIANOHERO_SKIP_ELECTRON_REBUILD` to `LUMAKEYS_*`;
> the desktop profile from `<appData>/luma-keys` (earlier `piano-hero`) to
> `<appData>/lumakeys`; the stored game mode `piano-hero` to `luma-keys`; and the
> browser stores `pianohero-instrument-sample-packs` (IndexedDB) and
> `pianohero-filter-presets` (`localStorage`).
>
> Compatibility code exists for some of these and is described as lasting "one
> release" in four places, but the version was `0.1.0` before and after, and no
> version gate, date or owner exists. The Phase 11 audit found that the server
> fallback works, but the desktop migration never finds a real legacy profile
> (PH-DATA-005), a partial move is not resumed (PH-DATA-006), desktop refusals are
> invisible (PH-OPS-006), and the browser stores are not carried over (PH-DATA-004,
> PH-DATA-007). Directory names are never migrated, so removing the fallback
> while a deployment still runs from `.pianohero-data` or `PIANOHERO_DATA_DIR` would
> start it with an empty library and no message.
>
> ## Decision
>
> 1. The compatibility window is measured in releases, not by the calendar. The
>    first release that bumps `package.json` `version` after this ADR (proposed
>    `0.2.0`, the carry-over release) ships working carry-over for every renamed
>    store. Removal happens in a later release (proposed `0.3.0`, the removal
>    release), never in the same one.
> 2. The removal release may ship only when all of these hold:
>    - PH-DATA-005, PH-DATA-006, PH-OPS-006, PH-DATA-004 and PH-DATA-007 are fixed in
>      the carry-over release and verified in both runtimes;
>    - the owner's own installs (Linux and Windows desktop profiles, the Docker
>      deployment) are confirmed migrated;
>    - the carry-over release has been the current release for at least one full
>      release cycle;
>    - not before an owner-chosen calendar floor (suggested 2027-01-31).
> 3. During the window, startup logs one line naming the resolved data location and
>    whether a legacy name was used, and warns when any `PIANOHERO_*` variable or a
>    `.pianohero-data` directory is in use.
> 4. During the window, environment handling is uniform: blank or whitespace is unset
>    for every `LUMAKEYS_*` variable, including the access token; values are trimmed;
>    `LUMAKEYS_DATA_DIR` must be absolute or startup fails with a message.
> 5. The removal release deletes the shims, except two. The `game_results.mode`
>    normalization is a data migration and stays. A small tombstone check replaces
>    the migration: if a legacy database or directory is found where data is
>    expected and the new database has no user rows, startup stops with a visible
>    message naming the path instead of opening an empty library.
> 6. Every shim carries the marker `legacy-brand: remove in 0.3.0 (ADR 0002)` in
>    place of the current "one release" and "ponytail" comments, so
>    `grep -rn "legacy-brand:"` lists them all. The repository owner owns the window
>    and the removal.
> 7. `README.md` gains an upgrade note: Docker host path, environment names, and
>    desktop profile location.
>
> ## Consequences
>
> ### Positive
>
> - The end of the fallback is checkable, not a comment.
> - No supported old state ends in a silent empty library, before or after removal.
> - Operators see a warning for a full release before anything is removed.
>
> ### Negative
>
> - Compatibility code lives at least one release longer than the comments promised.
> - Releases must bump the version for the window to mean anything.
> - The tombstone check is permanent, small code.
>
> ## Alternatives Considered
>
> ### End by calendar date only
>
> A date says nothing about whether the carry-over works. Today it does not on
> desktop, so any date would strand every pre-rename desktop profile.
>
> ### Keep the fallback indefinitely
>
> It keeps the cwd-relative adoption of a stray `.pianohero-data` (lane B case S8)
> and the inconsistent blank-token handling (case V7) for good, and it leaves the
> broken desktop path in place. It would be acceptable only together with the
> fixes in item 2.
>
> ### Remove it now
>
> It strands every pre-rename desktop profile and any deployment still on legacy
> names, which contradicts `CONTEXT.md:114` ("No user-data loss").
>
> ## Verification
>
> - `grep -rn "legacy-brand:"` matches the shim inventory, and the removal release's
>   diff deletes exactly those lines.
> - Unit tests cover every legacy profile name, an empty pre-existing `lumakeys.db`,
>   a partial move, and the tombstone check.
> - `scripts/audit/legacy-brand-server-probe.mjs`,
>   `scripts/audit/electron-userdata-probe.mjs --packaged` and
>   `scripts/audit/legacy-brand-probe.ts` pass on the carry-over release. On the
>   removal release, cases S1 and S5 must stop with a visible message, not adopt
>   legacy data.

Proposed ADR index row for `docs/adr/README.md`, once accepted:
`| [0002](0002-legacy-pianohero-compatibility-window.md) | proposed | Legacy PianoHero fallback ends by release, after carry-over is verified, with a tombstone check |`

## Proposed `scripts/audit/README.md` Rows

Lane H does not edit the README. Rows for the lead to add:

| Script | Purpose | Feeds |
|---|---|---|
| `doc-path-check.mjs [--all] [--json] [--strict] [docs...]` | Lists paths, links, anchors and `file:line` citations in audit documents that do not exist; read-only | lane H exit gate |
| `legacy-brand-server-probe.mjs` | Starts the built server once per case with seeded legacy and new data directories and environment combinations under `$TMPDIR` (port 3798) | DATA-017, OP-015 |
| `electron-userdata-probe.mjs [--packaged]` | Headless Electron: which `userData` each package name gets and whether the legacy profile migrates; optional packaged run | DATA-017, OP-015 |
| `legacy-brand-probe.ts` | Function-level interrupted-migration cases with a WAL-only legacy database (run with `node --import <repo>/node_modules/tsx/dist/loader.mjs`) | DATA-017, OP-015 |

And for `scripts/audit/browser/README.md`: `legacy-filter-presets.mjs`, which checks
whether a legacy `localStorage` filter preset is still offered (DATA-016).

## Working Flows Confirmed

| Coverage row | Evidence | Conditions/limits | Disposition |
|---|---|---|---|
| none (instrument check) | Matrix summary matches its rows | `--check` only | holds |
| none | All `docs/agents/*.md` paths resolve; no stale `file:line` citations in the default set | in-range line numbers only | holds |
| none | `CONTEXT.md` ownership map and runtime list match the tree | | holds |

## Findings

None raised by lane H. Documentation drift is recorded above as proposed edits. Lane
B's candidates (PH-DATA-005, PH-DATA-006, PH-OPS-006, PH-DATA-007) feed the ADR draft.

## Evidence Gaps

| Coverage row | Missing proof | Why blocked | Owner | Next action |
|---|---|---|---|---|
| none | whether `CLAUDE.md`/`AGENTS.md` should be tracked | owner decision | owner | end-of-discovery review |
| none | the ADR end date | owner decision | owner | accept, amend or reject the draft |

## Runtime And Failure Coverage

- Electron: not applicable.
- Web: not applicable.
- Loading/empty/disabled: not applicable.
- Error/retry/recovery: not applicable.
- Destructive/interruption: not applicable.
- Accessibility or hardware proof: not applicable.

## Challenge Summary

- Claims disproved or narrowed: the plan's Baseline Summary says `CLAUDE.md` was "corrected on 2026-10-19". It no longer names src/main/database.ts, but twelve other statements are stale or incomplete (Task 2), and the correction is unversioned.
- Duplicates merged: none.
- Severity changes: not applicable.
- Environmental failures separated: the first checker runs gave false positives for test-file spans, branch names, `src/`-relative shorthand, build output, absolute links and code-span links. Each became its own class or was fixed before triage.

## Lane Exit Check

- [x] Every assigned coverage row has an owner (no rows assigned).
- [x] Every assigned row has evidence and disposition, or an explicit gap.
- [x] All findings link to detailed reports and coverage rows (none raised).
- [x] P0/P1 leads were independently challenged (none in this lane).
- [x] Positive/working behavior is recorded.
- [x] Manual and hardware gaps are explicit (owner decisions only).
- [x] Coverage summary counts were updated (`--check` passes; nothing to write).

## Sign-Off

- Lane owner/date: Claude Code (acting), 2026-10-19
- Challenger/date: Claude Code (acting), 2026-10-19
- Audit lead/date: pending

## Proposed Matrix Updates

None. Lane H owns no coverage rows. The DATA-017 note proposed by lane B points to
the ADR draft above.

## Proposed User-Test Items

None. The two open items, the ADR end date and tracking `CLAUDE.md`/`AGENTS.md`,
are owner decisions for the end-of-discovery review, not tests.

## Candidate Findings

| ID | Severity | Summary |
|---|---|---|
| none | | Lane H raised no findings; see lane B for PH-DATA-005 (P1), PH-OPS-006 (P2), PH-DATA-006 (P3), PH-DATA-007 (P3) |

## Files Created

- `docs/audit/reports/phase-11-lane-h-documentation-2026-10-19.md` (this report)
- `scripts/audit/doc-path-check.mjs`
- Scratch only: `$TMPDIR/p11/B/doc-path-check.out`, `$TMPDIR/p11/B/doc-path-check-extra.out`, self-test documents under `$TMPDIR/p11/B/doccheck/`
