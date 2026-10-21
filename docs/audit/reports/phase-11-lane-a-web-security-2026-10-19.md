# Lane Report: Phase 11 Lane A, Web Security And Deployment

- Lane owner: Claude Code (acting)
- Reviewer/challenger: Claude Code (acting), second pass on 2026-10-19; owner confirmation items in the user batch
- Baseline identity: `main` at source identity `4466626`, [baseline](baseline-2026-10-19.md)
- Started: 2026-10-19
- Last updated: 2026-10-19
- Status: in progress (static and probe evidence complete; Docker and Electron runtime proof staged for the owner)

## Scope

- Coverage rows: OP-010 through OP-018, MOD-010, MOD-013, MOD-014, WF-025
- User journeys: web upload of `.mid`/`.mscz`, library export/import, bridge RPC, static asset delivery, API access gating, soundboard "source" links
- Runtimes: web (Node server behind Cloudflare Tunnel); MOD-014 is Electron
- Data/privileged boundaries: anonymous internet client to `/api/*`; attacker-supplied bytes into MuseScore; renderer to remote page in Electron
- Explicit exclusions: Cloudflare Access configuration itself (owner-controlled, outside the repository); dependency advisories (lane G)

## Evidence Plan

| Surface | Oracle/invariant | Method/fixture | Runtime | Expected artifact |
|---|---|---|---|---|
| Static file handler | No path outside `dist/web` is served; ranges are bounded; HTML is not cached | `scripts/audit/web-security-probe.sh` against isolated server; source read of `staticFiles.ts` | web | [probe evidence](../evidence/phase-11-web-probe-2026-10-19.md) |
| Access gate | Token required when configured; cookie HttpOnly, SameSite=Strict; token never written where third parties read it | probe; source read of `webSecurity.ts`; README deployment section | web | probe evidence; PH-SEC-002 |
| Bridge RPC | Only allowlisted methods; arguments validated; body bounded; errors do not leak paths | probe; source read of `bridgeRouter.ts` | web | probe evidence |
| Uploads | Only `.mid`/`.midi`/`.mscz`; size bounded; content IDs derived from bytes; storage paths derived from safe IDs | source read of `midiRouter.ts`, `midiStorage.ts`, `storageSafety.ts`; probe | web | probe evidence |
| MuseScore conversion | Converter bounded in CPU, memory, file size, time; temp dir cleaned; no path outside temp dir written; concurrent uploads fail safe | source read of `museScore.ts`; unit tests; Docker run (staged for owner) | web | [user batch sitting 0](phase-11-user-tests.md) |
| Electron window open | Remote page opened from renderer gets no bridge and no privileged window | source read of `main/index.ts`, `NoveltySoundboardScreen.tsx`; Electron 30.5.1 source `guest-window-manager.ts`; probe `scripts/audit/electron-window-open-probe.cjs` (staged for owner) | Electron | user batch sitting 0 |

## Working Flows Confirmed

| Coverage row | Evidence | Conditions/limits | Disposition |
|---|---|---|---|
| OP-012, OP-016 | Five traversal probes (`..`, `..%2f`, `%2e%2e`, `..%5c`, `/assets/../..`) return 404 or the SPA shell; `startsWith(webRoot)` plus `normalize` contain the path | Containment check lacks a trailing separator (L-11-003); no sibling of `dist/web` exists, so not exploitable today | covered; hardening note, no finding |
| OP-016 | `Range: bytes=0-9` gives 206 with `Content-Range`; out-of-range gives 416; multi-range ignored with 200; JS/CSS immutable caching; HTML `no-store` | Whole-file reads buffer into memory; largest shipped asset is the menu video | covered |
| OP-010 | Unknown method 404; malformed JSON 400; `GET /api/bridge/<m>` falls to SPA shell (L-11-016, intentional, no data); allowlist `RPC_BRIDGE_METHOD_SET`; per-method `validateRpcArgs`; song IDs checked by `isSafeSongStorageId` | Error bodies on invalid ID return `{"result":null}`, no path leak | covered |
| OP-011 | 300 kB bridge body gives 413; upload limit 11 MB; library import 50 MB; limits in `webSecurity.ts` | Unknown-length stream regression from Phase 10 still in test suite | covered |
| OP-001, OP-002 | Upload accepts only `.mid`/`.midi`/`.mscz` by name, rejects empty and >10 MB, derives song ID from bytes, dedupes, stores by safe ID under `midi-files`; reattach verifies content match | Title comes from the filename with no length cap (noted, no finding: bounded by multipart and UI) | covered |
| OP-014 | With a token configured: 401 without, 200 with header, wrong token 401, cookie `HttpOnly; SameSite=Strict; Path=/api`, `Secure` only on https | Query-string acceptance is PH-SEC-002 | covered with finding |
| OP-017 | `prlimit --as=2 GiB --cpu=30 --fsize=10 MB`, 45 s timeout with SIGKILL, scratch HOME/XDG dirs, offscreen Qt, output must start with `MThd` and be 14 B to 10 MB, temp dir removed in `finally`, busy flag reset in nested `finally` | Runtime proof needs the Docker image (owner batch); concurrency is PH-SEC-004 | gap pending owner batch |
| MOD-013 | `staticFiles.test.ts` covers MIME, range, 416, SPA fallback; `museScore.test.ts` covers unconfigured, empty/oversize, missing executable | No test for the busy flag or for a conversion that writes outside the temp dir | covered with gaps noted |
| OP-013, MOD-008 | `contextIsolation: true`, `nodeIntegration: false`; Electron 30 defaults `sandbox` on for such renderers; `guest-window-manager.ts` inherits only `contextIsolation`, `javascript`, `nodeIntegration`, `sandbox`, `webviewTag`, `nodeIntegrationInSubFrames`, `enableWebSQL`, never `preload` | So a `target="_blank"` child window does not receive `window.appBridge`; the L-11-008 bridge-exposure hypothesis is narrowed to PH-SEC-005 | covered with finding |

## Findings

| Finding | Why it belongs to this lane | Shared lanes |
|---|---|---|
| PH-SEC-002 | Token transport is the API trust boundary | Operations (README documents the query form) |
| PH-SEC-003 | Response headers are served by `staticFiles.ts` and `index.ts` | UI (CSP must allow Tone.js workers and self-hosted fonts) |
| PH-SEC-004 | Converter availability is a web-only denial path | Product workflows (WF-025) |
| PH-SEC-005 | Renderer-to-remote boundary in Electron | Runtime parity (web uses `rel="noreferrer"` correctly) |
| PH-OPS-002 | Deployment default decides whether `/api/*` is reachable | Operations |

## Evidence Gaps

| Coverage row | Missing proof | Why blocked | Owner | Next action |
|---|---|---|---|---|
| OP-017, WF-025 | MuseScore runs inside the image; crafted archive cannot write outside its temp dir; busy flag observed with two parallel uploads | Docker socket is not reachable from the agent sandbox | repository owner | user batch sitting 0 items 2 and 3 |
| MOD-014 | Empirical confirmation that the child window has no `window.appBridge` | Electron needs a display and D-Bus; blocked in the agent sandbox | repository owner | user batch sitting 0 item 1 |
| OP-014 | Cloudflare Access actually gates `/api/*` on the deployed hostname | Owner-controlled infrastructure | repository owner | user batch sitting 0 item 4 |

## Runtime And Failure Coverage

- Electron: static only (MOD-014); runtime probe staged
- Web: isolated server probe on this host; Docker image not exercised here
- Loading/empty/disabled: empty upload 400; converter unconfigured message verified by unit test
- Error/retry/recovery: converter busy flag resets in `finally`; temp dir removed on every path; `onError` returns `error.message` as JSON 500 (no stack)
- Destructive/interruption: not in this lane (lane B re-verifies PH-DATA-001 recovery)
- Accessibility or hardware proof: none required

## Challenge Summary

- Claims disproved or narrowed: L-11-008 (bridge inherited by child windows) is disproved for Electron 30.5.1 by `guest-window-manager.ts`; narrowed to in-app remote window without a guard (PH-SEC-005, P3, pending probe). L-11-002 (non-constant-time compare) and L-11-003 (prefix check) are recorded as hardening notes, not findings: no exploit path exists at the deployed configuration and the charter reserves P3 for observable user impact.
- Duplicates merged: none
- Severity changes: L-11-005 (converter busy flag) entered as P3, not P2, because the README defines the deployment as single-user; raise to P2 if multi-user use is ever intended.
- Environmental failures separated: Xvfb, Docker socket, and Electron D-Bus failures are sandbox limits of the agent environment, recorded as gaps with owner-run commands, not product findings.

## Lane Exit Check

- [x] Every assigned coverage row has an owner.
- [ ] Every assigned row has evidence and disposition, or an explicit gap. (OP-017, WF-025, MOD-014 are explicit gaps pending sitting 0.)
- [x] All findings link to detailed reports and coverage rows.
- [x] P0/P1 leads were independently challenged. (None reached P1; the only P1 candidate, bridge inheritance, was disproved.)
- [x] Positive/working behavior is recorded.
- [x] Manual and hardware gaps are explicit.
- [ ] Coverage summary counts were updated. (Run `node scripts/audit/recount-coverage.mjs --write` at lane close.)

## Sign-Off

- Lane owner/date: Claude Code (acting), 2026-10-19, pending sitting 0
- Challenger/date: Claude Code (acting) second pass, 2026-10-19
- Audit lead/date: pending
