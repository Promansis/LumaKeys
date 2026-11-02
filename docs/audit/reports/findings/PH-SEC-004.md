# PH-SEC-004: One MuseScore conversion blocks every other import for up to 45 seconds

- Lane: SEC
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: web
- Coverage rows: OP-017, WF-025, MOD-013
- Related/duplicate findings: none
- First observed against: `main` at source identity `4466626`, Phase 11 baseline 2026-10-19

## User Impact

`convertMuseScoreToMidi` keeps a module-level `converting` boolean. While one
`.mscz` converts (bounded at 45 s by the timeout, plus `prlimit` CPU 30 s), every
other `.mscz` in the same or any other upload request fails with "Another MuseScore
score is being converted." A multi-file upload containing several `.mscz` files
therefore imports only the first and reports the rest as errors, because the
router converts files sequentially inside one request but the flag is global and
the rejection is immediate rather than queued. Anyone who can reach `/api/midi/upload`
can keep the converter busy by looping uploads. The README calls the deployment
single-user, so the practical impact is a confusing partial import and a self-inflicted
denial; severity is P3 on that basis and would be P2 for a shared deployment.

## Expected Behavior Or Oracle

Product expectation from WF-004 and WF-025: a batch upload imports every valid file or
reports a per-file reason that the user can act on. The code comment itself states
the intended fix ("use a job queue if multi-user imports are needed").

## Evidence

### Environment

- Commit/patch identity: source `4466626`
- OS/runtime/browser: static analysis; MuseScore binary not present outside Docker. Runtime check in the Docker image `lumakeys-audit:p11` on 2026-10-20 (Reproduction step 3).

### Reproduction

1. Read `src/server/museScore.ts`: `let converting = false;` at module scope; `if (converting) throw new Error('Another MuseScore score is being converted...')` before any work; reset in the inner `finally`.
2. Read `src/server/midiRouter.ts`: the upload loop awaits `convertMuseScoreToMidi` per file, so within one request the second `.mscz` only starts after the first finishes and would pass. The cross-request case (two browser tabs, or a retry while a long conversion runs) hits the rejection.
3. Runtime reproduction with two parallel uploads, [sitting 0](../phase-11-owner-sittings-2026-10-20.md#sitting-0-docker-image-and-live-host) item 2, run by the agent in the Docker image on 2026-10-20, because the converter runs only there. `score2` imported (22 notes, 8.5 s, 120 BPM); `score1` came back at once as a per-file entry in `errors`: "Another MuseScore score is being converted. Please try again in a moment." After `docker restart`, `getAllSongs` lists the imported song and `GET /api/midi/<id>` returns 446 bytes. In the crafted-archive run, a second upload during a 4.0 s conversion got the same message in 2 ms (HTTP 200), and `getAllSongs` answered in 2 ms. Several `.mscz` files in one request were not tried.

### Artifacts

- File/line or contract evidence: `src/server/museScore.ts` lines 11 to 24 and the `finally` block; `src/server/midiRouter.ts` upload loop.
- Test/command output summary: `museScore.test.ts` has no busy-flag case.

## Root Cause

Concurrency control is a global reject-if-busy flag instead of a queue, and the
rejection is surfaced as a per-file import error in the same `errors` list as a bad file,
though its message names the cause and asks the user to retry.

## Recommended Remediation Boundary

Replace the flag with a one-slot promise queue (await the previous conversion, then
run) with a per-request cap, and add a unit test that two concurrent calls both
succeed in order. `museScore.ts` and `museScore.test.ts` only; the router's error
reporting already propagates messages.

## Required Regression Proof

- Deterministic unit/integration proof: two concurrent `convertMuseScoreToMidi` calls with a stubbed converter both resolve; a third beyond any cap fails with a queue-specific message.
- Web proof: two parallel `.mscz` uploads in Docker both import (sitting 0 item 2 after the fix).
- Broader regression command: `npx vitest run src/server`

## Challenge Record

- Independent reproduction attempt: source is deterministic; runtime confirmed on 2026-10-20 (below).
- Alternative explanations tested: "sequential loop makes it a non-issue" rejected because the flag is process-wide across requests.
- Scope/severity changes: P3 per single-user README; revisit if multi-user.
- Challenger conclusion and date: reproduced (static), 2026-10-19
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3; deduplication: none; this is the only import-concurrency finding. Accepted.
- Owner sitting run by the agent, 2026-10-20: reproduced in Docker in [sitting 0](../phase-11-owner-sittings-2026-10-20.md#sitting-0-docker-image-and-live-host) item 2 (Reproduction step 3). Of two parallel uploads of `meter-tempo.mscz`, one imported and the other got the busy message at once. This confirms the cross-request case only.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: `remediation/p11-s13-import`, slice 13, commit `e4cfbfa`; implemented 2026-11-02, awaiting independent review; not merged. The finding stays `accepted` until the lead merges.
- What changed: `src/server/museScore.ts` replaces the `converting` flag with a one-slot promise queue. Conversions run one at a time, in arrival order; `MUSESCORE_QUEUE_LIMIT = 4` caps pending conversions (running plus waiting). A request beyond the cap fails with "Too many scores are waiting for the MuseScore converter. Please try again in a moment.", distinct from the bad-file message. The 45 s timeout and `prlimit` are unchanged and a failed conversion does not block the next.
- Tests (`museScore.test.ts`, "conversion queue", a shell-script stub converter through the real `prlimit` path, never real MuseScore): "converts two concurrent scores one after another, in order" failed before the fix ("Another MuseScore score is being converted. Please try again in a moment.") and passes after. "fails a request beyond the queue cap with a queue message, and recovers" failed before (`expected [] to deeply equal [ 'fulfilled' ]`; the cap did not exist) and passes after. "keeps converting after a failed conversion" passes before and after as a guard. Source identity for the reproduction: product code equal to `cc40b63`.
- Driver result: `mscz-upload-no-musescore.mjs` ran with no MuseScore, an unavailable converter, an oversized output and a failing converter; each failure text is unchanged and no upload leaves files behind. The two-parallel-upload case needs the real image.
- Proof owed (agent-runnable): none. Human-only: [sitting 0](../phase-11-owner-sittings-2026-10-20.md#sitting-0-docker-image-and-live-host) item 2, two parallel `.mscz` uploads in the Docker image; both should convert, the second after the first.
- Residual risk: a queued conversion can wait up to about four times 45 s; HTTP and proxy timeouts at that length were not examined.
- Revisit trigger: reviewer verification and the sitting 0 item 2 result, or a proxy timeout shorter than the worst-case wait.
