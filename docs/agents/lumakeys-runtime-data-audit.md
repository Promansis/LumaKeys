# LumaKeys Runtime And Data Audit

Use for persistence, storage, AppBridge parity, runtime adapters, security,
backup/restore, destructive operations, and operational recovery. These concerns
share evidence because a single trust or transaction boundary often affects all of
them.

## Load First

- Full-audit governance and current baseline.
- `src/shared/ipc.ts`, `src/shared/bridgeMethods.ts`, and `src/shared/dbTypes.ts`.
- `src/persistence/*`, `src/storage/*`, and relevant tests.
- `src/main/index.ts`, `src/main/preload.ts`.
- `src/renderer/webBridge.ts` and `src/server/*`.
- Library backup/import and sample-pack modules only when their rows are assigned.

## Invariants

- Renderer input cannot select arbitrary server or desktop filesystem paths.
- App-owned IDs and filenames remain within configured storage roots.
- SQLite foreign keys and WAL remain enabled; schema initialization is idempotent.
- Multi-step durable mutations are atomic or leave an explicit recoverable state.
- Reset/delete operations affect exactly the stated data and app-owned files.
- Backup export is internally consistent; import validates before committing and has
  defined partial-failure/rollback behavior.
- Every AppBridge method has validated input, deliberate runtime category, compatible
  result/error semantics, and an explicit UI story for unavailable capabilities.
- Web privileged routes have an explicit deployment trust model, method allowlist,
  body/rate limits where needed, and no path traversal.
- Electron exposes only required capabilities through an isolated preload boundary.

## Evidence Matrix Per Operation

For every assigned entity, bridge method, or privileged operation record:

| Dimension | Required proof |
|---|---|
| Contract | Input/output/error and runtime category |
| Validation | Invalid, missing, oversized, malicious, and stale input |
| Success | Durable state and user-visible outcome |
| Failure | Before-write, mid-operation, and after-write interruption |
| Recovery | Restart, retry, rollback, cleanup, and idempotence |
| Parity | Electron versus web outcome or accepted exception |
| Security | Trust boundary, attacker capability, containment/access control |
| Regression | Targeted test plus required runtime/build proof |

Use fresh isolated data roots per destructive scenario. Never reuse production or the
owner's normal `.lumakeys-data` or `.pianohero-data`. A checkout that only has
`.pianohero-data` uses it when `LUMAKEYS_DATA_DIR` is blank.

## High-Risk Sequences

Prioritize backup/import with embedded MIDI, full reset, learning reset, song/bulk
delete, reattach, sample-pack install/remove, schema upgrade from supported old
states, corrupted/missing files, concurrent/interrupted writes, web RPC dispatch,
multipart uploads, and server startup with missing/unwritable data roots.

## Finding Ownership

- Root cause in DB transaction/schema: `DATA`.
- Root cause in validation/trust boundary: `SEC`.
- Root cause is incompatible runtime behavior: `PAR`.
- Root cause is packaging/deployment/recovery: `OPS`.

Cross-link affected lanes rather than duplicating the finding.

## Exit Gate

Every durable entity, AppBridge row, and privileged operation assigned to this lane
has success/failure/recovery evidence and a parity/security disposition. Hardware or
platform gaps are explicit. All P0/P1 data/security leads have independent challenge.
