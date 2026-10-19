#!/usr/bin/env bash
# Captures the automated audit baseline as Markdown that drops into
# docs/audit/templates/baseline-report.md. Read-only with respect to the repository:
# it never installs, repairs, or updates dependencies.
#
# Usage: scripts/audit/baseline.sh [--out FILE] [--with-builds] [--skip-audit]
#   --out FILE      write Markdown to FILE instead of stdout
#   --with-builds   also run `npm run build` and `npm run build:web` (writes out/ and dist/, both ignored)
#   --skip-audit    skip `npm audit` (use when the registry is unreachable)
set -uo pipefail

cd "$(dirname "$0")/../.."
OUT=""
WITH_BUILDS=0
SKIP_AUDIT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --with-builds) WITH_BUILDS=1; shift ;;
    --skip-audit) SKIP_AUDIT=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

LOG_DIR="${TMPDIR:-/tmp}/lumakeys-baseline-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$LOG_DIR"

rows=()
LAST_STATUS=0
run_check() {
  # run_check <label> <command...>; sets LAST_STATUS and appends a table row.
  # Must not be called inside $(...): the row append has to happen in this shell.
  local label="$1"; shift
  local log="$LOG_DIR/$(echo "$label" | tr ' /()' '____').log"
  local start end duration summary
  start=$(date +%s)
  "$@" > "$log" 2>&1
  LAST_STATUS=$?
  end=$(date +%s)
  duration=$((end - start))
  if [ $LAST_STATUS -eq 0 ]; then summary="pass"; else summary="FAIL (exit $LAST_STATUS)"; fi
  rows+=("| ${label} | \`$*\` | ${summary} | ${duration}s | \`${log}\` |")
}

run_check "Typecheck (main)" npm run typecheck; typecheck_status=$LAST_STATUS
run_check "Typecheck (server)" npx tsc --noEmit -p tsconfig.server.json; server_typecheck_status=$LAST_STATUS
run_check "Tests" npx vitest run; test_status=$LAST_STATUS
test_summary=$(grep -E '^\s*(Test Files|Tests)\s' "$LOG_DIR/Tests.log" | sed 's/^ *//' | tr '\n' ';' | sed 's/;$//')

if [ $WITH_BUILDS -eq 1 ]; then
  run_check "Desktop build" npm run build; build_status=$LAST_STATUS
  run_check "Web build" npm run build:web; web_build_status=$LAST_STATUS
else
  rows+=("| Desktop build | \`npm run build\` | not run (pass --with-builds) | | |")
  rows+=("| Web build | \`npm run build:web\` | not run (pass --with-builds) | | |")
fi

audit_summary="not run"
if [ $SKIP_AUDIT -eq 0 ]; then
  npm audit --json > "$LOG_DIR/npm-audit-all.json" 2>"$LOG_DIR/npm-audit-all.err"
  npm audit --json --omit=dev > "$LOG_DIR/npm-audit-prod.json" 2>"$LOG_DIR/npm-audit-prod.err"
  audit_summary=$(node -e '
    const fs = require("node:fs");
    const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")).metadata.vulnerabilities; } catch { return null; } };
    const all = read(process.argv[1]); const prod = read(process.argv[2]);
    const fmt = (v) => v ? `${v.total} (critical ${v.critical}, high ${v.high}, moderate ${v.moderate}, low ${v.low})` : "unavailable (registry unreachable?)";
    console.log(`all: ${fmt(all)}; production: ${fmt(prod)}`);
  ' "$LOG_DIR/npm-audit-all.json" "$LOG_DIR/npm-audit-prod.json")
  rows+=("| Package audit | \`npm audit --json\` / \`--omit=dev\` | recorded | | ${audit_summary}; raw JSON in \`${LOG_DIR}\` |")
else
  rows+=("| Package audit | \`npm audit\` | skipped | | |")
fi

dirty_count=$(git status --porcelain | wc -l | tr -d ' ')
if [ "$dirty_count" = "0" ]; then
  dirty="clean"
else
  tracked_hash=$(git diff HEAD | sha256sum | cut -c1-16)
  dirty="${dirty_count} path(s) dirty/untracked; tracked diff sha256 prefix ${tracked_hash}"
fi
electron_version=$(node -p "require('./node_modules/electron/package.json').version" 2>/dev/null || echo "not installed")
sqlite_probe=$(node -e "const D=require('better-sqlite3'); new D(':memory:').close(); console.log('better-sqlite3 loads under Node')" 2>&1 | tail -1)

{
  echo "## Identity"
  echo
  echo "- Source branch/worktree: \`$(git rev-parse --abbrev-ref HEAD)\` at \`$(pwd)\`"
  echo "- Commit SHA: \`$(git rev-parse HEAD)\`"
  echo "- Dirty patch identity or \`clean\`: ${dirty}"
  echo "- OS/architecture: $(uname -srm)"
  echo "- Node/npm versions: $(node --version) / npm $(npm --version)"
  echo "- Electron version: ${electron_version}"
  echo "- Captured: $(date -Iseconds)"
  echo
  echo "## Dependency Health"
  echo
  echo "- Install method and lockfile state: \`package-lock.json\` $(git diff --quiet HEAD -- package-lock.json && echo 'unchanged from HEAD' || echo 'MODIFIED from HEAD')"
  echo "- Native binary checks: ${sqlite_probe}; esbuild $(npx esbuild --version 2>/dev/null || echo 'unavailable')"
  echo "- Dependency repair performed before this baseline: none by this script"
  echo
  echo "## Automated Baseline"
  echo
  echo "| Check | Exact command | Result | Duration | Evidence/summary |"
  echo "|---|---|---|---:|---|"
  for row in "${rows[@]}"; do echo "$row"; done
  echo
  echo "Test summary: ${test_summary:-unavailable}"
  echo
  echo "Logs: \`${LOG_DIR}\` (outside the repository; copy summaries into the report, not raw logs)."
} > "$LOG_DIR/baseline.md"

if [ -n "$OUT" ]; then
  cp "$LOG_DIR/baseline.md" "$OUT"
  echo "Wrote $OUT (logs in $LOG_DIR)"
else
  cat "$LOG_DIR/baseline.md"
fi

overall=0
for s in "$typecheck_status" "$server_typecheck_status" "$test_status" "${build_status:-0}" "${web_build_status:-0}"; do
  [ "$s" != "0" ] && overall=1
done
exit $overall
