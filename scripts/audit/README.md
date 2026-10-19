# Audit Helper Scripts

Read-only helpers for the staged audit under `docs/audit/`. None of them install,
repair, or update dependencies, and none of them write inside the repository unless
you pass an explicit output path. Logs go to `$TMPDIR`.

| Script | Purpose | Feeds |
|---|---|---|
| `baseline.sh [--out FILE] [--with-builds] [--skip-audit]` | Captures source identity, environment, typecheck (both TS projects), Vitest, optional builds, and `npm audit` counts as Markdown | `docs/audit/templates/baseline-report.md` |
| `delta-inventory.sh [BASE] [HEAD]` | Lists commits and changed files since the last audited identity, grouped by audit surface, with new modules and modified-without-test files called out | `docs/audit/templates/delta-inventory.md` |
| `recount-coverage.mjs [--check\|--write]` | Recounts the Lane Completion Summary in `coverage-matrix.md` from actual rows | charter rule "update counts from the tables" |
| `dependency-triage.mjs [--out FILE] [--from all.json --from-prod prod.json]` | Splits `npm audit` into production, shipped-desktop-runtime (Electron), and build-chain advisories | security/operations lanes |
| `web-security-probe.sh [BASE_URL]` | Non-mutating HTTP probes of headers, path containment, byte ranges, the access gate, RPC input handling, uploads, and error disclosure | OP-010 through OP-018 |

## Typical Phase Start

```bash
# 1. Baseline (writes logs to $TMPDIR, Markdown to the path you choose)
scripts/audit/baseline.sh --with-builds --out "$TMPDIR/baseline.md"

# 2. What changed since the last audited identity
scripts/audit/delta-inventory.sh 0bd40f5 HEAD > docs/audit/evidence/phase-N-delta-inventory-YYYY-MM-DD.md

# 3. Dependency leads
node scripts/audit/dependency-triage.mjs --out docs/audit/evidence/phase-N-dependency-triage-YYYY-MM-DD.md

# 4. Web surface probes against an ISOLATED server
D="$TMPDIR/probe-data"; mkdir -p "$D"
PORT=3777 LUMAKEYS_DATA_DIR="$D" LUMAKEYS_WEB_ACCESS_TOKEN=probe-token node dist/server/index.cjs &
LUMAKEYS_WEB_ACCESS_TOKEN=probe-token scripts/audit/web-security-probe.sh http://127.0.0.1:3777
kill %1; rm -rf "$D"

# 5. Keep the coverage summary honest
node scripts/audit/recount-coverage.mjs --check
```

The probe must never target a production deployment: it sends a wrong token, an
oversize body, and garbage uploads, all of which are rejected before mutation but
still appear in access logs.

## Evidence Rules

Script output is evidence only when the report records the exact command, the source
identity, and the environment. A `WARN` from the probe or an advisory from the triage
is a lead; it becomes a finding only through `docs/audit/templates/finding.md`.
