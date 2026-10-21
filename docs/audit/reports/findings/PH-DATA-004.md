# PH-DATA-004: Web sample packs installed before the rename are orphaned in the browser

- Lane: DATA
- Severity: P3
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: web
- Coverage rows: DATA-015, DATA-017, OP-006, OP-009, MOD-009
- Related/duplicate findings: PH-DATA-002 (reset scope), PH-PAR-003 (legacy migration is Node-side only)
- First observed against: `main` at source identity `4466626`, Phase 11 baseline 2026-10-19

## User Impact

Commit `489fe45` renamed the browser IndexedDB store for instrument sample packs
from `pianohero-instrument-sample-packs` to `lumakeys-instrument-sample-packs`.
`legacyBrandMigration.ts` migrates only the Node-side data directory. A web user who
installed packs before the rename opens the app after it and finds every pack
"not installed"; the old database, which can hold tens of megabytes of samples,
stays in the browser's storage forever, and "Reset all user data" (PH-DATA-002)
deletes only the new name. Recovery is a manual reinstall plus clearing site data
by hand. Severity P3: packs are re-downloadable and the deployment is single-user.

## Expected Behavior Or Oracle

The rename commit's own standard, stated in `legacyBrandMigration.ts`: a
one-release compatibility boundary that carries legacy data into the new layout and
leaves no second copy behind. DATA-015 names browser IndexedDB as a durable store
in scope for migration and reset.

## Evidence

- `src/renderer/webBridge.ts` line 19 declares only the new name; line 174 opens it; line 240 deletes only it on reset.
- `grep -rn "pianohero-instrument" src` returns nothing outside tests, so no code path opens, copies, or deletes the old database.
- `git diff 0bd40f5..HEAD -- src/renderer/webBridge.ts` shows the constant rename with no accompanying migration.

## Root Cause

The brand migration was scoped to filesystem stores; browser-local stores were
renamed without a corresponding one-release carry-over or cleanup.

## Recommended Remediation Boundary

In `webBridge.ts`, on first open of the new database: if `indexedDB.databases()` (or
an open with the old name at its last version) finds the legacy store, copy its
records into the new store, then delete the old database; also delete the old name
during `resetUserData`. Add a `webBridge.test.ts` case with a fake IndexedDB holding
the legacy name. Remove the carry-over in the release after next, matching the
Node-side boundary.

## Required Regression Proof

- Deterministic unit/integration proof: legacy store present, new absent: packs appear installed after startup and the legacy database is gone; reset clears both names.
- Web proof: sitting 1 or 3 with a browser profile that installed a pack on the previous release (owner may not have one; if not, record as not reproducible at runtime).
- Broader regression command: `npx vitest run src/renderer/webBridge.test.ts`

## Challenge Record

- Independent reproduction attempt: static; deterministic from the constant rename.
- Alternative explanations tested: "the web deployment never shipped packs before the rename" would make this moot; the owner should confirm whether any pack was installed on the pre-rename web build.
- Scope/severity changes: none.
- Challenger conclusion and date: reproduced (static), 2026-10-19
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3; deduplication: canonical for the IndexedDB pack store rename. PH-DATA-007 has the same pattern for localStorage filter presets but a different store and carry-over, so both stay and share one remediation slice. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: branch `remediation/p11-s15-browser-legacy` (slice 15; ships in the carry-over release with slice 1): `0890cf4` (fix), `d885390` (Resolutions), then the slice 15 review repairs `7d94c95` (abort the pack copy on a failed put, and test the failure path; this finding), `9e9e458` (filter-preset carry-over in one deletable file; [PH-DATA-007](PH-DATA-007.md)) and `38dc6bc` (Resolutions of both after the review). The review passed after the repairs. Merged to `main` in `8d73767` on 2026-10-21, held until slice 1 merged (`c95586b`). No issue.
- Status: `fixed`, not `verified` (audit lead, 2026-10-21). Rows that have passed: the unit/integration row (the fake-IndexedDB cases, including the failed-copy case added at review), the headless Chromium driver `legacy-sample-packs.mjs` (cases P, E, B, N, R) and the broader command. Still owed: the web row as written, a browser profile that really installed a pack on the pre-rename release (the owner may have none; if so, record it as not reproducible at runtime), which is the optional user test B6 against a build of `main` from `8d73767` or later; and the release gate, which asks for slices 1 and 15 verified in both runtimes before the carry-over release ships.
- Verification evidence:

  What changed: `src/renderer/webBridge.ts` carries packs over once per page, before the pack store is first opened. If the current `lumakeys-instrument-sample-packs` store holds no packs and `pianohero-instrument-sample-packs` exists, its records are copied in one read-write transaction. The legacy database is deleted only after that transaction commits. If both hold packs the current ones win and the legacy database is left untouched until reset. Probing for a missing legacy database aborts its upgrade, so none is created. The copy is atomic: a synchronous `put` error (for example a malformed legacy record) aborts the transaction, so no partial set is committed. A failed carry-over logs a warning, keeps the legacy data and does not block the pack store. `resetUserData` now deletes the legacy name first, then the current one. The carry-over is marked for removal no earlier than 2027-01-31 (owner decision 3).
  Unit tests (`src/renderer/webBridge.test.ts`, with the in-memory IndexedDB in `src/renderer/testUtils/fakeIndexedDb.ts`; `fake-indexeddb` is not a dependency). Failed before the fix, pass after: "installs packs saved under the pre-rename database name and deletes the legacy database", "carries packs into a current database that exists but holds no packs", "deletes a legacy database with no pack store without copying anything", "clears both database names when user data is reset". The failing-path test "keeps the legacy database, warns and copies nothing when the copy transaction fails" (a malformed second legacy record makes `put` throw `DataError`) asserts the legacy database remains, `console.warn` fires and the current store stays empty. It was checked to fail when the legacy delete is moved ahead of the commit and when the `tx.abort()` is removed. Guards that pass before and after: "keeps the current packs and leaves the legacy database untouched when both hold packs", "does not create the legacy database when there is none".
  Driver `scripts/audit/browser/legacy-sample-packs.mjs` (new; headless Chromium via Playwright 1.56.1, isolated data under `$TMPDIR/p11-s15`). Run against `7cf0c62` (product code identical to the audited `4466626`) and against the fix:
  - P, legacy only: before `installed: []` with both databases present; after `installed: [flute, cello]`, only the current database, copied blob 2048 bytes.
  - E, current exists but empty: before `[]`; after `[flute]`, legacy gone.
  - B, both hold packs: before and after `[flute]` (the current one); legacy kept.
  - N, neither: no legacy database is created.
  - R, reset with both: before the legacy database remained; after no database remains.

  Runtime proof on a profile that really installed a pack on the pre-rename release is owed to the owner and is optional (sitting 1 item 9).
- Residual risk: a user who reinstalled a pack after the rename and still has a legacy database keeps both until reset or the removal release, as the slice plan chose. If that user then uninstalls every post-rename pack while the legacy database lingers, the legacy packs reappear at the next start; this is benign. The carry-over reads the legacy pack set into memory (tens of MB) once. A legacy delete blocked by another open tab stays queued in the browser and completes when that tab lets go. A reset in that state rejects as busy, the legacy database is removed later anyway, and a retry finishes the reset.
- Revisit trigger, if accepted-risk:
