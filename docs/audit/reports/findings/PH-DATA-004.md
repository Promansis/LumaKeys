# PH-DATA-004: Web sample packs installed before the rename are orphaned in the browser

- Lane: DATA
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: web
- Coverage rows: DATA-015, DATA-017, OP-006, OP-009, MOD-009
- Related/duplicate findings: PH-DATA-002 (reset scope), PH-PAR-003 (legacy migration is Node-side only)
- First observed against: `main` at source identity `6e549b6`, Phase 11 baseline 2026-10-19

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
