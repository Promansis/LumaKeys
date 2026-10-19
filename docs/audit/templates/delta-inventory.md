# Delta Inventory: <old identity> -> <new identity>

Use this when re-auditing after the source moved past the last audited identity.
Generate the raw file list with `scripts/audit/delta-inventory.sh <old> <new>` and
file it under `evidence/`; this template records the audit decisions about it.

- Last audited identity (commit, date, report):
- New identity (commit, date):
- Generated inventory:
- Prepared by / date:

## New Surfaces

Every new source module, route, env var, asset path, or workflow gets a coverage row
before evidence collection. Record the row ID here.

| New surface | Kind (module / route / env / asset / workflow) | Coverage row added | Lane |
|---|---|---|---|
| | | | |

## Changed Surfaces With Existing Rows

For each modified area, name the coverage rows whose evidence predates the change and
whether the change invalidates that evidence.

| Changed area | Rows affected | Evidence still valid? | Why |
|---|---|---|---|
| | | | |

## Fixed Findings Near The Delta

List every `fixed`/`verified` finding whose owning modules appear in the delta. Each
needs a `templates/reverification-record.md`.

| Finding | Modules in delta | Re-verification record |
|---|---|---|
| | | |

## Modified Without A Touched Test

From the generated inventory. Decide per file: covered by an existing test, needs a
new deterministic proof, or runtime-only.

| File | Decision | Owner |
|---|---|---|
| | | |

## Removed Or Renamed

Confirm each removed path has no live reference (docs, scripts, Docker, packaging)
and that renamed data paths carry a migration with an end date.

| Path | Verified no live reference | Migration / end date |
|---|---|---|
| | | |
