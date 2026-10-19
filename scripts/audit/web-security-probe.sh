#!/usr/bin/env bash
# Read-only HTTP probes for the web runtime's security surface (coverage rows OP-010
# through OP-014 and OP-016 through OP-018). Run against an ISOLATED server started
# with a throwaway LUMAKEYS_DATA_DIR, never against a production deployment.
#
# Usage: scripts/audit/web-security-probe.sh [BASE_URL]
#   BASE_URL defaults to http://127.0.0.1:3001
#   LUMAKEYS_WEB_ACCESS_TOKEN (env, optional): the token the server was started with,
#     used only to document token transport behavior.
#
# Every probe is a GET, a HEAD, or a POST that the server rejects before mutation
# (unknown method, oversize body, empty upload). Output lines are PASS, WARN, or INFO
# with the observed status; a WARN is a lead to investigate, not a finding.
set -uo pipefail

BASE="${1:-http://127.0.0.1:3001}"
TOKEN="${LUMAKEYS_WEB_ACCESS_TOKEN:-}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
warns=0

status_of() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
headers_of() { curl -s -D - -o /dev/null "$@"; }
report() { # report <PASS|WARN|INFO> <message>
  [ "$1" = WARN ] && warns=$((warns + 1))
  printf '%-4s %s\n' "$1" "$2"
}
expect() { # expect <label> <expected-regex> <observed>
  if [[ "$3" =~ ^($2)$ ]]; then report PASS "$1: $3"; else report WARN "$1: expected $2, observed $3"; fi
}

echo "# Web security probe against ${BASE} on $(date -Iseconds)"
echo

root_status=$(status_of "$BASE/")
if [ "$root_status" != 200 ]; then
  echo "Server did not answer 200 on / (got ${root_status}). Start the web build first." >&2
  exit 2
fi

echo "## Response headers on /"
hdrs=$(headers_of "$BASE/")
for h in Content-Security-Policy X-Content-Type-Options Referrer-Policy Permissions-Policy X-Frame-Options Cache-Control; do
  if echo "$hdrs" | grep -qi "^$h:"; then
    report PASS "$h present: $(echo "$hdrs" | grep -i "^$h:" | head -1 | cut -d' ' -f2- | tr -d '\r')"
  else
    report WARN "$h missing on HTML document"
  fi
done
if echo "$hdrs" | grep -qi '^Cache-Control:.*no-store'; then report PASS "HTML is no-store"; else report WARN "HTML Cache-Control is not no-store"; fi
echo

echo "## Static path containment"
for p in '/../package.json' '/..%2f..%2fpackage.json' '/assets/../../package.json' '/%2e%2e/%2e%2e/etc/passwd' '/assets/..%5c..%5cpackage.json'; do
  s=$(status_of "$BASE$p")
  # SPA fallback may legitimately serve index.html (200) for extension-less paths; a
  # traversal only succeeds if the body is NOT the SPA shell.
  body=$(curl -s "$BASE$p" | head -c 200)
  if [ "$s" = 404 ]; then
    report PASS "traversal $p -> 404"
  elif [ "$s" = 200 ] && echo "$body" | grep -qi '<!doctype html\|<html'; then
    report PASS "traversal $p -> 200 SPA shell (not a file)"
  else
    report WARN "traversal $p -> $s with non-SPA body"
  fi
done
echo

echo "## Range handling (video/audio byte serving)"
asset=$(curl -s "$BASE/" | grep -oE '/assets/[^"]+\.js' | head -1)
asset="${asset:-/favicon.ico}"
expect "Range bytes=0-9 on $asset" "206" "$(status_of -H 'Range: bytes=0-9' "$BASE$asset")"
expect "Range bytes=999999999- on $asset" "416" "$(status_of -H 'Range: bytes=999999999-' "$BASE$asset")"
expect "Multi-range ignored (200)" "200" "$(status_of -H 'Range: bytes=0-1,3-4' "$BASE$asset")"
ctype=$(headers_of "$BASE$asset" | grep -i '^Content-Type:' | tr -d '\r')
report INFO "$asset $ctype"
echo

echo "## API access gate"
access_status=$(status_of "$BASE/api/access")
if [ "$access_status" = 200 ]; then
  report WARN "/api/access is open without a token (expected only when LUMAKEYS_WEB_ACCESS_TOKEN is unset AND an upstream gate such as Cloudflare Access exists)"
elif [ "$access_status" = 401 ]; then
  report PASS "/api/access requires a token (401)"
else
  report WARN "/api/access unexpected status $access_status"
fi
if [ -n "$TOKEN" ]; then
  expect "header token accepted" "200" "$(status_of -H "x-lumakeys-access-token: $TOKEN" "$BASE/api/access")"
  q=$(headers_of "$BASE/api/access?access_token=$TOKEN")
  if echo "$q" | grep -q '^HTTP/[0-9.]* 200'; then
    report INFO "query-string token accepted; note it will appear in proxy/tunnel access logs (OP-018 lead)"
  fi
  if echo "$q" | grep -qi '^Set-Cookie:.*HttpOnly'; then report PASS "cookie is HttpOnly"; else report WARN "access cookie not HttpOnly or not set"; fi
  if echo "$q" | grep -qi '^Set-Cookie:.*SameSite=Strict'; then report PASS "cookie is SameSite=Strict"; else report WARN "access cookie not SameSite=Strict"; fi
  if echo "$q" | grep -qi '^Set-Cookie:.*Secure'; then report PASS "cookie is Secure"; else report INFO "cookie lacks Secure (expected on plain http; verify behind TLS)"; fi
  expect "wrong token rejected" "401" "$(status_of -H 'x-lumakeys-access-token: definitely-wrong' "$BASE/api/access")"
fi
echo

echo "## Bridge RPC input handling"
auth=()
[ -n "$TOKEN" ] && auth=(-H "x-lumakeys-access-token: $TOKEN")
expect "unknown method rejected (4xx, not 500)" "40[0-9]" "$(status_of "${auth[@]}" -X POST -H 'Content-Type: application/json' -d '{"args":[]}' "$BASE/api/bridge/notARealMethod")"
expect "malformed JSON rejected (4xx)" "40[0-9]" "$(status_of "${auth[@]}" -X POST -H 'Content-Type: application/json' -d '{nope' "$BASE/api/bridge/getAllSongs")"
head -c 300000 /dev/zero | tr '\0' 'a' > "$TMP/big.json"
expect "oversize bridge body -> 413" "413" "$(status_of "${auth[@]}" -X POST -H 'Content-Type: application/json' --data-binary "@$TMP/big.json" "$BASE/api/bridge/getAllSongs")"
get_bridge=$(status_of "${auth[@]}" "$BASE/api/bridge/getAllSongs")
get_bridge_body=$(curl -s "${auth[@]}" "$BASE/api/bridge/getAllSongs" | head -c 200)
if [[ "$get_bridge" =~ ^(404|405)$ ]]; then
  report PASS "GET on bridge route rejected: $get_bridge"
elif [ "$get_bridge" = 200 ] && echo "$get_bridge_body" | grep -qi '<!doctype html\|<html'; then
  report INFO "GET /api/bridge/<method> falls through to the SPA shell (200); no data exposed, but /api/* is not method-scoped"
else
  report WARN "GET on bridge route returned $get_bridge with a non-SPA body"
fi
echo

echo "## Upload handling"
expect "empty multipart upload rejected (4xx)" "40[0-9]" "$(status_of "${auth[@]}" -X POST -F 'nothing=1' "$BASE/api/midi/upload")"
printf 'not a midi' > "$TMP/fake.mid"
expect "non-MIDI .mid rejected or reported (2xx with errors / 4xx)" "20[0-9]|40[0-9]" "$(status_of "${auth[@]}" -X POST -F "files=@$TMP/fake.mid" "$BASE/api/midi/upload")"
printf 'PK\003\004garbage' > "$TMP/fake.mscz"
expect "garbage .mscz does not 500" "20[0-9]|40[0-9]|50[1-9]" "$(status_of "${auth[@]}" -X POST -F "files=@$TMP/fake.mscz" "$BASE/api/midi/upload")"
echo

echo "## Error disclosure"
err_body=$(curl -s "${auth[@]}" -X POST -H 'Content-Type: application/json' -d '{"args":["../../x"]}' "$BASE/api/bridge/getSong")
if echo "$err_body" | grep -qE '/(home|app|data|media)/|node_modules|\.ts:[0-9]+'; then
  report WARN "error body leaks a filesystem path or stack location: $(echo "$err_body" | head -c 160)"
else
  report PASS "error body does not leak paths: $(echo "$err_body" | head -c 120)"
fi
echo
echo "Done: ${warns} WARN line(s). Each WARN is a lead for a finding record, not a finding."
exit 0
