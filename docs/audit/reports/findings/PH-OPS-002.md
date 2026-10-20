# PH-OPS-002: Default web deployment exposes `/api/*` with no app-level gate

- Lane: OPS
- Severity: P2
- Confidence: high that the default is open; unknown whether the live host is
- Status: suspected
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
reset, export) is open to the internet with no second line of defense. The owner
has not yet confirmed that Access gates `/api/*` on the live hostname.

## Expected Behavior Or Oracle

Charter: privileged operations reachable from the internet require an explicit trust
boundary with a stated attacker capability. The README's own smoke checklist is the
oracle: a private window must redirect to Cloudflare login, and
`/api/bridge/getAllSongs`, `/api/midi/upload`, `/api/library/import` must not be
reachable without Access.

## Evidence

### Environment

- Commit/patch identity: source `6e549b6`
- OS/runtime/browser: static analysis; live hostname not probed by the agent (owner-controlled infrastructure)

### Reproduction

1. `docker-compose.yml`: token line is a comment.
2. `src/server/webSecurity.ts` `createApiAccessGate`: `if (!expectedSecret) { await next(); return; }`.
3. Probe with no token configured would show `/api/access` 200 (the probe's WARN branch); the 2026-10-19 probe ran with a token and showed 401, which is the gated behavior.
4. Live confirmation is staged in [user batch sitting 0](../phase-11-user-tests.md) item 4.

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

## Resolution

- Accepted/rejected rationale: kept `suspected` at the Phase 11 consolidation on 2026-10-20 until the evidence gap below closes.
- Fix branch/commit/issue: none.
- Verification evidence: none yet.
- Residual risk: as stated in User Impact.
- Revisit trigger: after sitting 0, or before any change to the compose defaults, the tunnel or the access gate.
