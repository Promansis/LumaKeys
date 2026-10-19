# Phase 11 Web Security Probe Evidence

Command: `scripts/audit/web-security-probe.sh http://127.0.0.1:3777` against `node dist/server/index.cjs` built from `6e549b6`, isolated empty `LUMAKEYS_DATA_DIR` under `$TMPDIR`, `LUMAKEYS_WEB_ACCESS_TOKEN` set to a throwaway value. Every WARN and INFO line is a lead in the [Phase 11 plan](../reports/phase-11-plan-2026-10-19.md#leads-register), not a finding.

```text
# Web security probe against http://127.0.0.1:3777 on 2026-10-19T17:16:51+08:00

## Response headers on /
WARN Content-Security-Policy missing on HTML document
WARN X-Content-Type-Options missing on HTML document
WARN Referrer-Policy missing on HTML document
PASS Permissions-Policy present: midi=(self)
WARN X-Frame-Options missing on HTML document
PASS Cache-Control present: no-cache, no-store, must-revalidate
PASS HTML is no-store

## Static path containment
PASS traversal /../package.json -> 404
PASS traversal /..%2f..%2fpackage.json -> 404
PASS traversal /assets/../../package.json -> 404
PASS traversal /%2e%2e/%2e%2e/etc/passwd -> 200 SPA shell (not a file)
PASS traversal /assets/..%5c..%5cpackage.json -> 404

## Range handling (video/audio byte serving)
PASS Range bytes=0-9 on /assets/index-CBSMnebP.js: 206
PASS Range bytes=999999999- on /assets/index-CBSMnebP.js: 416
PASS Multi-range ignored (200): 200
INFO /assets/index-CBSMnebP.js content-type: text/javascript; charset=utf-8

## API access gate
PASS /api/access requires a token (401)
PASS header token accepted: 200
INFO query-string token accepted; note it will appear in proxy/tunnel access logs (OP-018 lead)
PASS cookie is HttpOnly
PASS cookie is SameSite=Strict
INFO cookie lacks Secure (expected on plain http; verify behind TLS)
PASS wrong token rejected: 401

## Bridge RPC input handling
PASS unknown method rejected (4xx, not 500): 404
PASS malformed JSON rejected (4xx): 400
PASS oversize bridge body -> 413: 413
INFO GET /api/bridge/<method> falls through to the SPA shell (200); no data exposed, but /api/* is not method-scoped

## Upload handling
PASS empty multipart upload rejected (4xx): 400
PASS non-MIDI .mid rejected or reported (2xx with errors / 4xx): 200
PASS garbage .mscz does not 500: 200

## Error disclosure
PASS error body does not leak paths: {"result":null}

Done: 4 WARN line(s). Each WARN is a lead for a finding record, not a finding.
```
