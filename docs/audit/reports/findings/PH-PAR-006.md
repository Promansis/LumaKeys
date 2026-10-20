# PH-PAR-006: Web "Install Better Sounds" stores the pack but never plays it

- Lane: PAR
- Severity: P2
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-20
- Verifier: TBD
- Affected runtime: web (Electron installs and loads the same pack correctly)
- Coverage rows: WF-019
- Related/duplicate findings: PH-MUS-007 (also builds a sampler from `customSamplerBaseUrl ?? undefined`)
- First observed against: `main` at source identity `6e549b6`, Phase 11 lane F (FA run 2026-10-19; source and desktop check 2026-10-20)

## User Impact

A web user picks Flute, Marimba or Trumpet and clicks **Install Better Sounds**. The app downloads about 1.7 MB per pack into IndexedDB, says "Flute
Enhanced Pack ready.", and the card reads "Flute Enhanced Pack installed". Every load
of that pack then fails and the engine falls back to the built-in samples, so the
user hears no difference. Nothing on screen says so. Honky-tonk and warm pad need a
pack before they can be selected (the web select lists them as "Install sounds
first", FA `pack.final.out`); once installed they load through the same failing path,
and what they then fall back to on the web was not checked. Severity P2: a visible feature is silently non-functional in one
runtime; no data is lost and the built-in sound still plays.

## Expected Behavior Or Oracle

Runtime parity: the same pack installed in Electron loads its own files (below). The
status card's "installed" claim implies the pack is in use.

## Evidence

### Environment

- Commit/patch identity: `6e549b6`; web bundle from `dist/`; desktop `out/`
- OS/runtime/browser: Linux, headless Chromium 141 (web); Electron 30.5.1 offscreen (desktop)
- Data profile/fixture: fresh data directories under `$TMPDIR`

### Reproduction

1. Web, `scripts/audit/browser/sample-pack-lifecycle.mjs` (FA): after install, 10
   console errors `Fetch API cannot load undefinedblob:http://127.0.0.1:3784/<uuid>`
   and one `[AudioEngine] Failed to load custom sampler: TypeError: Failed to fetch`;
   the same after reload.
2. Web, `scripts/audit/browser/sample-pack-engine-log.mjs`, three page loads: every
   load logs `Failed to load custom sampler`, then `Loading sampler from:
   /samples/nbrosowsky/flute/` and `Sampler loaded successfully`, which is the
   built-in pack.
3. Desktop, `scripts/audit/electron/sample-pack.mjs`: install copies 10 files to
   `<userData>/instrument-sample-packs/flute/`; `resolveInstrumentSampleSource` returns
   a `file:///` base URL; fetching `C4.mp3` from it returns 190,962 bytes; no sampler
   error after install or after relaunch.

### Artifacts

- `src/renderer/webBridge.ts:259` and `:337` return `baseUrl: null` with blob `urls`.
- `src/lib/audio/audioEngine.ts:580-583` passes `baseUrl: this.customSamplerBaseUrl ?? undefined`.
- Tone 15.1.22 `core/util/Defaults.js:34` `deepMerge` copies an explicit `undefined`
  over the default `""`; `core/context/ToneAudioBuffers.js:106` then loads
  `this.baseUrl + url`, which is the string `"undefined" + "blob:…"`.
- Outputs: `$TMPDIR/p11/FA/pack.final.out` sha256 `391c4497…44d0dccb`;
  `$TMPDIR/p11/EL2/web-pack.out` sha256 `bbd7ad2d…0beb0860`;
  `$TMPDIR/p11/EL2/pack.out` sha256 `3ed28ada…ff788f1c82`.

## Root Cause

The audio engine assumes an absent base URL can be passed as `undefined`, but Tone's
option merge treats an explicit `undefined` as a value. Only the web bridge produces
`baseUrl: null`, so only the web breaks.

## Recommended Remediation Boundary

In `AudioEngine`, omit the `baseUrl` key when there is none (spread it in only when
set), in both `loadInstrument` and `renderRecordingToWav`.

## Required Regression Proof

- Deterministic unit/integration proof: `audioEngine` test with a fake Tone that records the URLs a Sampler requests for `{ urls: { C4: 'blob:x' }, baseUrl: null }`; none may start with `undefined`.
- Electron proof: `scripts/audit/electron/sample-pack.mjs` unchanged result.
- Web proof: `sample-pack-engine-log.mjs` shows no `Failed to load custom sampler` and no fallback after install.
- Manual hardware/UI proof: sitting 1, compare the built-in and installed Flute by ear.

## Challenge Record

- Independent reproduction attempt: two web drivers on different days and one desktop driver; source trace through Tone.
- Alternative explanations tested: blob URLs revoked before load (no: the URL string itself is malformed, `undefinedblob:`); the desktop sharing the defect (no: `file:///` base URL loads).
- Scope/severity changes: none.
- Deduplication decision: separate from PH-MUS-007 (WAV export scheduling), though both touch the custom-sampler construction.
- Challenger conclusion and date: reproduced, 2026-10-20
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P2. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue:
- Verification evidence:
- Residual risk:
- Revisit trigger, if accepted-risk:
