# PH-ARCH-004: The web upload response echoes every imported MIDI back as a JSON object and discloses the server path

- Lane: ARCH
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-19
- Verifier: TBD
- Affected runtime: web
- Coverage rows: WF-004, WF-025
- Related/duplicate findings: PH-PAR-004 (same route, different defect)
- First observed against: `main` at source identity `4466626`, Phase 11 lane F (FB), 2026-10-19

## User Impact

`POST /api/midi/upload` returns `songs: ImportedSong[]` where each entry carries `fileData`
(a `Uint8Array`) and `destPath`. `c.json` serialises the array as an index-keyed object
(`{"0":77,"1":84,...}`), so the response is about 12 times the size of the upload: a 0.72 MB
MIDI returned 8.6 MB; the 10 MB limit would return about 120 MB. The renderer reads only
`songId` (and title and counters); the Electron IPC path passes the same fields cheaply.
The response also names the absolute server data path (`/.../midi-files/<id>.mid`) to the
client. Severity P3: waste and a minor path disclosure to an authenticated app user; no
corruption, no remote trigger beyond the existing upload permission.

## Expected Behavior Or Oracle

Runtime parity and least data: a web transport should return what the client uses.
`ImportedSong` fields `destPath` and `fileData` have no reader outside `importSong.ts`
(`grep` over `src/` finds the type only). Security principle: do not return server
filesystem paths to clients.

## Evidence

### Environment

- Commit/patch identity: `4466626` web build
- OS/runtime/browser: Node 24, web server on ports 3785 to 3788
- Data profile/fixture: valid MIDI uploaded alone and with an `.mscz`

### Reproduction

1. Upload a 720,059 byte generated MIDI (90,000 notes) to `/api/midi/upload`.
2. Observed: status 200, response 8,619,930 bytes (ratio 12.0), the song object has keys `songId, destPath, fileData, title, durationSec, bpm, noteCount, difficulty`; `destPath` is `/tmp/claude-1000/p11/FB/data-big/midi-files/<sha256>.mid`.
3. The same shape appears in every successful upload (`mscz-upload-no-musescore.out`, "HTTP mixed" lines).
4. Repeat count: 5 uploads across the lane, same shape each time.

### Artifacts

- File/line or contract evidence: `src/server/midiRouter.ts` (`c.json({ songs, errors, skipped })`), `src/shared/ipc.ts:36-45` (`ImportedSong`)
- Test/command output summary: one ad hoc probe (not kept as a driver); the size and keys above
- Screenshot/video/trace path and hash: none
- Durable-state before/after comparison: none

## Root Cause

The web route reuses the Electron DTO unchanged. JSON turns a `Uint8Array` into an object
with one key per byte.

## Recommended Remediation Boundary

Map `ImportedSong` to the fields the web client reads before `c.json`, or make `fileData`
and `destPath` optional on the shared type and omit them in the web router.

## Required Regression Proof

- Deterministic unit/integration proof: `midiRouter.test.ts` asserting the response has no `fileData` or `destPath`.
- Electron proof: import still reports the same count.
- Web proof: response size within a small multiple of the metadata.
- Data/recovery proof: not applicable.
- Manual hardware/UI proof: none.
- Broader regression command: `npm test`.

## Challenge Record

- Independent reproduction attempt: repeated with three upload shapes.
- Alternative explanations tested: a proxy re-encoding the body (no proxy; direct fetch to the server).
- Scope/severity changes: held at P3; no browser crash was demonstrated at 8.6 MB, the 120 MB figure is an extrapolation and is labelled as such.
- Deduplication decision: distinct from PH-PAR-004 and PH-SEC-004.
- Challenger conclusion and date: reproduced, Claude Code (acting), 2026-10-19.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: none
- Verification evidence: none
- Residual risk: response bloat, path disclosure
- Revisit trigger, if accepted-risk: not applicable
