# ADR 0002: Legacy PianoHero Compatibility Window And Its End Condition

- Status: accepted
- Date: 2026-10-21
- Deciders: repository owner
- Supersedes: none

The owner settled the date floor and the release order on 2026-10-20 (Phase 11 owner
decision 3). The draft this ADR comes from is in
[lane H](../audit/reports/phase-11-lane-h-documentation-2026-10-19.md). This ADR was
written on 2026-10-21 from the 2026-10-20 decision. Its `accepted` status first rested
on decision 3's wording "as in lane H's draft ADR"
([consolidation](../audit/reports/consolidation-2026-10-20.md), decision 3). On
2026-11-02 the owner confirmed items 3 to 7 as written and placed items 3, 4, 6 and 7
(Phase 11 owner decisions 9 and 8, in the
[user tests](../audit/reports/phase-11-user-tests.md#owner-decisions-not-tests)).

## Context

On 2026-08-07 (`489fe45`, `2c39d72`, `090658e`, `e7c066c`) PianoHero was renamed
LumaKeys. Persisted names changed:

- `pianohero.db` to `lumakeys.db`.
- `.pianohero-data` to `.lumakeys-data`.
- `PIANOHERO_DATA_DIR`, `PIANOHERO_WEB_ACCESS_TOKEN` and
  `PIANOHERO_SKIP_ELECTRON_REBUILD` to `LUMAKEYS_*`.
- The desktop profile from `<appData>/luma-keys` (earlier `piano-hero`) to
  `<appData>/lumakeys`.
- The stored game mode `piano-hero` to `luma-keys`.
- The browser stores `pianohero-instrument-sample-packs` (IndexedDB) and
  `pianohero-filter-presets` (`localStorage`) to `lumakeys-*`.

Compatibility code exists for some of these. Its comments say it lasts "one release"
(`src/persistence/legacyBrandMigration.ts`, `src/server/index.ts`,
`src/server/bridgeRouter.ts`, `scripts/ensure-native-module.cjs`). But `package.json`
`version` was `0.1.0` before and after the rename, and no version gate, date or owner
exists.

The Phase 11 audit found, on `main` at `7cf0c62`:

- The server fallback works.
- The desktop migration never finds a real legacy profile
  ([PH-DATA-005](../audit/reports/findings/PH-DATA-005.md)).
- A partial move is not resumed
  ([PH-DATA-006](../audit/reports/findings/PH-DATA-006.md)).
- Desktop startup refusals are invisible
  ([PH-OPS-006](../audit/reports/findings/PH-OPS-006.md)).
- The browser stores are not carried over
  ([PH-DATA-004](../audit/reports/findings/PH-DATA-004.md),
  [PH-DATA-007](../audit/reports/findings/PH-DATA-007.md)).

Slice 1 (merge `c95586b`) and slice 15 (merge `8d73767`) fixed these five on `main` on
2026-10-21. The desktop lookup now covers `luma-keys`, `piano-hero` and `PianoHero`,
finishes an interrupted move, asks before replacing a library that holds data and shows a
startup failure in a dialog; the browser stores are carried over. The findings are `fixed`,
not `verified`: a packaged run with the real single-instance lock, the owner's real-display
checks and the Windows sitting are still owed (see the
[remediation plan](../audit/reports/phase-11-remediation-plan-2026-10-20.md#proof-owed-by-fixed-findings)),
so decision 2's first condition is not met yet.

Directory names are never migrated. Removing the fallback while a deployment still
runs from `.pianohero-data` or `PIANOHERO_DATA_DIR` would start it with an empty
library and no message.

## Decision

1. The compatibility window ends by release and by date, never by date alone. The
   first release that bumps `package.json` `version` after this ADR (proposed
   `0.2.0`, the carry-over release) ships working carry-over for every renamed store.
   Removal happens in a later release (proposed `0.3.0`, the removal release), never
   in the same one.
2. The removal release may ship only when all of these hold:
   - PH-DATA-005, PH-DATA-006, PH-OPS-006, PH-DATA-004 and PH-DATA-007 are fixed in
     the carry-over release and verified in both runtimes.
   - The owner's own installs (Linux and Windows desktop profiles, the Docker
     deployment) are confirmed migrated.
   - The carry-over release has been the current release for at least one full
     release cycle.
   - The date is **2027-01-31 or later**. This is a floor, not a schedule.
3. During the window, startup logs one line naming the resolved data location and
   whether a legacy name was used. It warns when any `PIANOHERO_*` variable or a
   `.pianohero-data` directory is in use.
4. During the window, environment handling is uniform. Blank or whitespace is unset
   for every `LUMAKEYS_*` variable, including the access token. Values are trimmed.
   `LUMAKEYS_DATA_DIR` must be absolute, or startup fails with a message.
5. The removal release deletes the shims, except two. The `game_results.mode`
   normalization is a data migration and stays. A small tombstone check replaces the
   migration: if a legacy database or directory is found where data is expected and
   the new database has no user rows, startup stops with a visible message naming
   the path instead of opening an empty library.
6. Every shim carries the marker `legacy-brand: remove in 0.3.0 (ADR 0002)` in place
   of the current "one release" and "ponytail" comments, so
   `grep -rn "legacy-brand:"` lists them all. The repository owner owns the window
   and the removal.
7. `README.md` gains an upgrade note: the Docker host path (`/media/storage/pianohero`
   became `/media/storage/lumakeys`), the environment names, and the desktop profile
   location.

The owner settled items 1 and 2 on 2026-10-20 and confirmed items 3 to 7 on
2026-11-02. Items 3, 4, 6 and 7 gate the removal release only (owner decision 8,
2026-11-02): the carry-over release may ship without them, but each must ship in a
release before the removal release, and item 3's warning must have been in the
current release for at least one full release cycle before removal. The Phase 11
remediation plan does not schedule them yet. Item 5 (the tombstone check) is the
removal release's own work.

## Consequences

### Positive

- The end of the fallback is checkable, not a comment.
- No supported old state ends in a silent empty library, before or after removal.
- Operators see a warning for a full release before anything is removed.

### Negative

- Compatibility code lives at least one release, and at least until 2027-01-31,
  longer than the comments promised.
- Releases must bump the version for the window to mean anything.
- The tombstone check is permanent, small code.

## Alternatives Considered

### End By Calendar Date Only

A date says nothing about whether the carry-over works. On `7cf0c62` it does not on
desktop, so a date alone would strand every pre-rename desktop profile. The date is
kept only as a floor.

### Keep The Fallback Indefinitely

It keeps the cwd-relative adoption of a stray `.pianohero-data` (lane B case S8) and
the inconsistent blank-token handling (case V7) for good, and it leaves the broken
desktop path in place. It would be acceptable only together with the fixes in
decision 2.

### Remove It Now

It strands every pre-rename desktop profile and any deployment still on legacy names,
which contradicts [`CONTEXT.md`](../../CONTEXT.md) quality priority 1 ("No user-data
loss").

## Verification

- `grep -rn "legacy-brand:"` matches the shim inventory, and the removal release's
  diff deletes exactly those lines.
- Unit tests cover every legacy profile name, an empty pre-existing `lumakeys.db`, a
  partial move, and the tombstone check.
- `scripts/audit/legacy-brand-server-probe.mjs`,
  `scripts/audit/electron-userdata-probe.mjs --packaged` and
  `scripts/audit/legacy-brand-probe.ts` pass on the carry-over release. On the
  removal release, cases S1 and S5 must stop with a visible message, not adopt legacy
  data.
- The removal release's pull request cites a date on or after 2027-01-31.
