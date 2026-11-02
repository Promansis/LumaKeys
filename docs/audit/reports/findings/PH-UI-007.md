# PH-UI-007: The library "Date Added" filter mixes UTC and local time and misplaces songs by up to a day

- Lane: UI
- Severity: P3
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-19
- Verifier: TBD
- Affected runtime: both (renderer logic)
- Coverage rows: WF-007
- Related/duplicate findings: none
- First observed against: `main` at source identity `4466626`, Phase 11 lane F (FB), 2026-10-19

## User Impact

The Advanced Filters `Date Added From` and `Date Added To` fields select songs by the
calendar day they were imported. Outside a narrow band of time zones the result is wrong:
west of UTC, `Date Added To` set to the import day excludes songs imported that day (the
filter ends the previous local day); east of UTC, songs imported in the first hours of a
local day are treated as belonging to the previous day. Workaround: pick the day after for
`To`. Sorting by date is not affected (the same shift applies to every song). Severity P3:
one optional filter, wrong at day boundaries, no data affected.

## Expected Behavior Or Oracle

A filter labelled "Date Added" must match the calendar date on which the song was added, in
the user's time zone. Data invariant: `songs.date_added` is `datetime('now')`, UTC, with no
zone marker (`"2026-10-19 14:24:46"`), so the renderer must parse it as UTC.

## Evidence

### Environment

- Commit/patch identity: `4466626` web build
- OS/runtime/browser: headless Chromium 141, server host zone Australia/Perth (UTC+8); browser contexts created with an explicit `timezoneId`
- Data profile/fixture: one song imported at 2026-10-19 14:24:46 UTC

### Reproduction

1. `scripts/audit/browser/library-date-filter-timezone.mjs` imports one song and reads the raw `date_added`.
2. For each zone it computes the song's local calendar date from the UTC instant, then filters `From = To = that date`, then the days before and after.
3. Observed (`$TMPDIR/p11/FB/library-date-filter-timezone.out`):
   - Pacific/Kiritimati (UTC+14): song imported on local 2026-10-20; same-day filter shows 0 cards (want 1), previous-day filter shows 1 (want 0). The renderer parses the raw string as `Mon Oct 19 2026 14:24:46 GMT+1400`.
   - Pacific/Pago_Pago (UTC-11): local 2026-10-19; same day 0 (want 1), next day 1 (want 0).
   - America/Los_Angeles: local 2026-10-19; same day 0 (want 1), previous day 0, only `To = Oct 20` would match.
   - Australia/Perth: same day 1, neighbors 0 (passes; the instant 14:24 UTC is 22:24 local, inside the same day either way).
4. Repeat count: one run of all four zones; the two parsing causes are visible in `LibraryScreen.tsx` and confirmed by the `parsedAs` strings.

### Artifacts

- File/line or contract evidence: `src/renderer/components/LibraryScreen.tsx:128-140` (`new Date(date)` on a zone-less SQLite string is read as local time; `new Date('YYYY-MM-DD')` from the date input is read as UTC midnight, then `setHours(23, 59, 59, 999)` runs in local time); `src/persistence/database.ts:79`
- Test/command output summary: three of four zones FAIL as listed
- Screenshot/video/trace path and hash: none (counts are the evidence)
- Durable-state before/after comparison: none

## Root Cause

Two parsing mismatches: the stored timestamp is UTC but parsed as local; the filter's date
inputs are parsed as UTC but their end-of-day is computed in local time.

## Recommended Remediation Boundary

Parse `date_added` as UTC (append `Z` after normalising the space) and build the `From` and
`To` bounds from the input's local-date parts (`new Date(y, m - 1, d)` and end of that local
day). Owner: `LibraryScreen.tsx` helper `withinDateRange`.

## Required Regression Proof

- Deterministic unit/integration proof: a test of `withinDateRange` with `TZ` set to a western and an eastern zone.
- Electron proof: none beyond the unit test.
- Web proof: re-run `library-date-filter-timezone.mjs`; all four zones PASS.
- Data/recovery proof: not applicable.
- Manual hardware/UI proof: none.
- Broader regression command: `npm test`.

## Challenge Record

- Independent reproduction attempt: four zones, with the expected local date computed independently by `Intl.DateTimeFormat`.
- Alternative explanations tested: driver clock error (the raw timestamp was compared to `new Date().toISOString()` and matched within one second); date-input fill format (`YYYY-MM-DD`, the format the input requires).
- Scope/severity changes: none; the project's own host zone (UTC+8) is partly affected (songs added 00:00 to 08:00 local), which the Perth run did not hit because the import time was 22:24.
- Deduplication decision: not in the ledger.
- Challenger conclusion and date: reproduced, Claude Code (acting), 2026-10-19.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge. Owner decision 15 (2026-11-02) puts slice 17 in wave 3.
- Fix branch/commit: `remediation/p11-s17-small`, commit `7b72c72`; implemented and independently reviewed 2026-11-02; merged to `main` in `750bb42`; `fixed`, not `verified`: the lead's web `library-date-filter-timezone.mjs` rerun on `main` is owed.
- What changed: `withinDateRange` in `src/renderer/components/LibraryScreen.tsx` (now exported) parses a zone-less SQLite `date_added` as UTC (`parseDateAddedUtc`) and builds the filter bounds from the local calendar date parts (`localDayStart`): a day runs from its local midnight up to, but not including, the next day's local midnight. A song added in the evening or just after midnight now falls in the local calendar day it was added on, which is the day the user picks in the filter. No stored data changes.
- Tests (`src/renderer/components/LibraryScreen.test.tsx`, `describe('withinDateRange')`, 3 `it.each` cases just after local midnight, midday and just before local midnight, plus a UTC-parse case and a no-bounds case; stored strings are built from local wall-clock time so they hold in any zone): run with `TZ` set to `Pacific/Kiritimati`, `America/Los_Angeles`, `Pacific/Pago_Pago`, `Australia/Perth` and `UTC`. Against the old logic, 4 failed in Kiritimati, Los_Angeles and Pago_Pago and 2 (after-midnight and midday) in Perth; all 22 tests in the file passed in every zone after the fix. Source identity for the reproduction: product code equal to `cc40b63`.
- Driver result: `library-date-filter-timezone.mjs` (web build of this branch, throwaway data directory) passed in all four zones (Pacific/Kiritimati, Pacific/Pago_Pago, Australia/Perth, America/Los_Angeles): same day gives 1 card, next day 0, previous day 0.
- Proof owed: agent-runnable, none. Human-only: none required.
- Residual risk: a song with a `date_added` that already carries a zone (an ISO string with `Z`) is parsed as written; only the zone-less SQLite form is treated as UTC. Daylight-saving days are covered because the end bound is the next day's local start, not a fixed 23:59:59.999 (see the review follow-up). A song added during a skipped or repeated hour still lands on the day `Date` assigns it.
- Revisit trigger: reviewer verification, or a user report of a wrong day bucket.
- Review follow-up, 2026-11-02 (lead): the independent review found that the first version's end bound, `new Date(y, m-1, d, 23, 59, 59, 999)`, fails where DST ends at local midnight. In America/Santiago on 2026-04-05 the clock goes from 00:00 back to 23:00, so 4 April has a second 23:00-23:59; the fixed end bound resolves to the first pass and dropped songs added in the repeated hour (8 probe cases). `withinDateRange` now rejects a value at or after the start of the next local day (`localDayStart(to, 1)`). New test `withinDateRange > keeps the repeated last hour of a day when DST ends at local midnight` sets `TZ=America/Santiago` inside the test and checks the second 23:30 on 4 April (`2026-04-05 03:30:00` UTC) is in 4 April and next midnight (`04:00:00` UTC) is not. It failed on the first version and passes after; all 31 tests in `LibraryScreen.test.tsx` and `PlaylistView.test.tsx` pass. The earlier Resolution text said the song "lands on the local day shown on its card"; no library card shows a date, so it was reworded.
