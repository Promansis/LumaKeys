# PH-OPS-002: Default web deployment exposes `/api/*` with no app-level gate

- Lane: OPS
- Severity: P0 (raised from P2 on 2026-10-20 by sitting 0 item 4; see the challenge record)
- Confidence: high that the default is open; high that the live host serves the app with no login to another network (the owner's phone on mobile data, 2026-10-20) and answers unauthenticated `/api/*` calls from this host's address
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: web
- Coverage rows: OP-014
- Related/duplicate findings: PH-SEC-002 (token transport once a gate exists)
- First observed against: `main` at source identity `6e549b6`, Phase 11 baseline 2026-10-19

## User Impact

`docker-compose.yml` ships with `LUMAKEYS_WEB_ACCESS_TOKEN` commented out, and
`createApiAccessGate` passes every request through when the token is unset. The
README says to put the hostname behind Cloudflare Access first, so the intended
posture is "Access or token." If Access is misconfigured, expires, or the tunnel is
pointed at the service before Access is applied, the whole library (import, delete,
reset, export) is open to the internet with no second line of defense.

On 2026-10-20 the live hostname served the app and answered unauthenticated `/api/*`
calls with no Cloudflare login (sitting 0 item 4, below). Unless an Access policy lets
only this host's own address through, anyone who knows the hostname can import, delete,
reset or export the owner's library.

## Expected Behavior Or Oracle

Charter: privileged operations reachable from the internet require an explicit trust
boundary with a stated attacker capability. The README's own smoke checklist is the
oracle: a private window must redirect to Cloudflare login, and
`/api/bridge/getAllSongs`, `/api/midi/upload`, `/api/library/import` must not be
reachable without Access.

## Evidence

### Environment

- Commit/patch identity: source `6e549b6`
- OS/runtime/browser: static analysis; live hostname probed with `curl` from this host on 2026-10-20 (sitting 0 item 4)

### Reproduction

1. `docker-compose.yml`: token line is a comment.
2. `src/server/webSecurity.ts` `createApiAccessGate`: `if (!expectedSecret) { await next(); return; }`.
3. Probe with no token configured would show `/api/access` 200 (the probe's WARN branch); the 2026-10-19 probe ran with a token and showed 401, which is the gated behavior.
4. Live check, [sitting 0](../phase-11-owner-sittings-2026-10-20.md#sitting-0-docker-image-and-live-host)
   item 4, 2026-10-20 03:12 UTC, run by the agent at the owner's request. The hostname
   `piano.a173d20e27.com` maps to `http://localhost:3001` in `/etc/cloudflared/config.yml`
   and has no `/etc/hosts` entry. Unauthenticated requests, bodies discarded:
   - `GET /`: 200, no redirect
   - `POST /api/bridge/getAllSongs`: 200
   - `GET /api/access`: 200
   - `POST /api/midi/upload` with no file: 500 from the app
   - `POST /api/library/import` with no file: 400 from the app

   The item expects a redirect to the Cloudflare login and 302 or 403 from `/api/*`.
5. Owner check, user tests A1, 2026-10-20: on a phone over mobile data, the hostname
   opened the app with no Cloudflare login. The owner said it looks like an old version.
   Read-only image metadata (`docker image inspect`, `docker ps`; nothing changed): the
   image `lumakeys-lumakeys` was built 2026-10-06 16:47:35 +08:00, 13 seconds after
   commit `6e549b6`, and the running container was created from it the same minute.
   Since `6e549b6` only audit docs have changed, so the live host runs the code this
   audit tested. Why it looks old is not known; a page cached on the phone or at
   Cloudflare is one possibility.

### Artifacts

- File/line or contract evidence: `docker-compose.yml` environment block; `webSecurity.ts` gate.
- README section 5a documents both layers.

## Root Cause

The app-level gate is opt-in and the compose default does not force a choice. A
server that starts without any gate and without an explicit "I rely on Cloudflare
Access" setting cannot tell a misconfiguration from an intention.

## Recommended Remediation Boundary

Make the server refuse to bind, or log a loud warning and serve only the SPA, when
neither `LUMAKEYS_WEB_ACCESS_TOKEN` nor an explicit
`LUMAKEYS_TRUST_UPSTREAM_AUTH=1` is set; set the token in the shipped compose file
with a placeholder that the server rejects until changed. `src/server/index.ts`,
`webSecurity.ts`, `docker-compose.yml`, README.

## Required Regression Proof

- Deterministic unit/integration proof: server start with neither variable fails or degrades as specified; with the placeholder token it refuses.
- Web proof: owner's sitting 0 item 4 shows Access redirect and non-200 on the three API paths.
- Broader regression command: `npx vitest run src/server`

## Challenge Record

- Independent reproduction attempt: static; live check pending owner.
- Alternative explanations tested: "README makes the posture explicit, so this is a documented design" considered; kept as a finding because the failure mode is silent and the data is the user's whole library.
- Scope/severity changes: P2 unless the live check shows Access absent, in which case P0 until fixed.
- Deduplication decision: distinct from PH-SEC-002.
- Challenger conclusion and date: suspected, 2026-10-19
- Consolidation challenge, 2026-10-20: kept `suspected`. Evidence gap: whether the live host gates `/api/*` through Cloudflare Access is unknown; the default is open by source and probe. Next action: the owner's sitting 0 item 4 (a private-window visit and an unauthenticated POST against the live hostname).
- Sitting 0 challenge, 2026-10-20: accepted and raised to P0 under the rule above, because the live host answered every unauthenticated request with the app (Reproduction step 4). Alternative not excluded: an Access policy that lets this host's own public address through. The owner's private-window check from this machine would have had the same limit. If a request from another network (for example a phone on mobile data) gets the Access login, the exposure is limited to this host's address and the severity returns to P2, because the shipped default stays open by source. A follow-up request for response headers only was refused by the agent's permission layer, and the agent sent no further requests to the live host.
- Owner check, 2026-10-20 (user tests A1, Reproduction step 5): the app opened from a phone on mobile data with no login. This excludes an Access policy that lets only this host through. P0 stands.

## Resolution

- Accepted/rejected rationale: kept `suspected` at the Phase 11 consolidation on 2026-10-20; accepted at P0 the same day after sitting 0 item 4. Under owner decision 4's gate, slice 2 moves to the front of wave 1 ([Owner Selection](../phase-11-remediation-plan-2026-10-20.md#owner-selection-2026-10-20)).
- Immediate mitigation, outside any slice and the owner's to make (production infrastructure): put a Cloudflare Access application in front of the hostname, or set `LUMAKEYS_WEB_ACCESS_TOKEN` and recreate the container. The live build (`6e549b6`) already reads the token, so the token needs no rebuild; README section 5a gives the one-time `/api/access?access_token=` sign-in for each device. The agent changed nothing in production.
- Fix branch/commit/issue: branch `remediation/p11-s02-web-access`, `b6aaf47` (fix) and `aae47b5` (audit drivers), slice 2. Not merged or deployed.
  - What changed: `resolveWebAccessPolicy` in `src/server/webSecurity.ts` reads the gate from the environment. A token (`LUMAKEYS_WEB_ACCESS_TOKEN`, or the legacy `PIANOHERO_WEB_ACCESS_TOKEN`) gates `/api/*`. With no token, only `LUMAKEYS_TRUST_UPSTREAM_AUTH=1` (exactly `1`) starts the server without a gate, and the server logs a warning. Anything else throws. `startServer` in `src/server/index.ts` checks this first, so the process exits 1 before it creates the data dir, opens the database or binds the port. The placeholder `change-this-long-random-token` is refused in every mode.
  - `docker-compose.yml` now sets `LUMAKEYS_WEB_ACCESS_TOKEN: "${LUMAKEYS_WEB_ACCESS_TOKEN:-change-this-long-random-token}"`, so the token comes from a `.env` file next to the compose file, and a deployment without one stops at start instead of running open. The trust line is there, commented out. README sections 3 and 5a say this, and the troubleshooting section names the two startup errors.
  - Of the two options in the boundary, this takes "refuse to bind". A server that serves the app but no API looks broken in confusing ways; a stopped container names the fix in `docker compose logs`.
  - Once this is deployed, the `/api/access?access_token=` sign-in in the mitigation bullet above stops working ([PH-SEC-002](PH-SEC-002.md)). Sign in at `/login` instead.
- Verification evidence (agent run 2026-10-21, for the verifier; not a verification). Evidence files are under `$TMPDIR/p11-s02/`.
  - Tests that failed before the fix and pass after: in `src/server/webSecurity.test.ts`, "resolveWebAccessPolicy" > "refuses to start when neither a token nor upstream trust is set", "refuses the placeholder token shipped in docker-compose.yml", "uses the configured token, with the legacy variable as a fallback" and "trusts upstream auth only when LUMAKEYS_TRUST_UPSTREAM_AUTH is exactly 1" (before: `resolveWebAccessPolicy is not a function`). In the new `src/server/index.test.ts`, "web server startup" > "refuses to start when neither an access token nor upstream trust is set" and "refuses to start with the placeholder token from docker-compose.yml". These start the real entry with `node --import tsx`; before the fix the server kept running and was killed after 8 s ("expected null to be 1"). "allows API requests when upstream auth is explicitly trusted" replaces the old "no token means open" case.
  - Built server, throwaway data dirs, port 3221. Before (`6e549b6` code), no variables: `GET /api/access` 200 and `POST /api/bridge/getAllSongs` 200 (`ops002-before.txt`, sha256 `3e0923d4…d0e5852b`). After: no variables, exit 1 with "No web access gate is set. …"; the placeholder, exit 1 with "… still the placeholder from docker-compose.yml …"; `LUMAKEYS_TRUST_UPSTREAM_AUTH=true`, exit 1. In all three the data dir was not created and nothing listened. `LUMAKEYS_TRUST_UPSTREAM_AUTH=1` starts, logs the warning and answers `/api/access` 200. With a token, `/api/access` is 401 without it (`ops002-final.txt`, sha256 `25b247da…e7537ddb`).
  - `scripts/audit/web-security-probe.sh` against a token server: "/api/access requires a token (401)", 0 WARN (`probe-final.txt`, sha256 `ec7926c5…b27249f5`).
  - Full suite on the branch: `npx vitest run` 68 files passed and 1 skipped, 381 tests passed and 1 skipped (the opt-in MuseScore integration test); both `tsc --noEmit` runs clean.
  - Not run: Docker. The compose file was parsed as YAML only. `docker compose config`, a container start with the owner's `.env`, and a repeat of user tests A1 on the live host are owed.
- Residual risk: production stays open until the owner sets a gate or deploys this branch. In trust mode the server depends on Cloudflare Access, as before, but only when the owner says so. A local compose override that sets `LUMAKEYS_TRUST_UPSTREAM_AUTH: "1"` without a token must also set `LUMAKEYS_WEB_ACCESS_TOKEN: ""`, or the base file's placeholder stops the container.
- Revisit trigger: Cloudflare Access or the token is put in front of the live host (then repeat user tests A1); any change to the compose defaults, the tunnel or the access gate.
