# PH-MUS-007: Free Play WAV export renders silence because it schedules on the live Transport inside Tone.Offline

- Lane: MUS
- Severity: P2
- Confidence: high (the file Electron saves is all zero samples; the one-change control renders sound in the same Electron renderer)
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-19
- Verifier: TBD
- Affected runtime: Electron (the export controls are hidden in the web build); the defective function runs in Chromium either way
- Coverage rows: WF-015
- Related/duplicate findings: none
- First observed against: `main` at source identity `4466626`, Phase 11 lane F (FB), 2026-10-19

## User Impact

`Export WAV` in the desktop Free Play overlay renders the recording with
`AudioEngine.renderRecordingToWav` and saves the result. In this probe the function
returns a well-formed WAV whose samples are all zero, so a user saving a take gets a
silent file of the right length and header. Nothing reports a problem ("WAV saved to ...").
MIDI export is a separate code path and is not affected. Severity P2: a headline export
feature produces unusable output without any error, with no data loss in the recording
itself (the take remains and MIDI export works).

## Expected Behavior Or Oracle

`CONTEXT.md` journey 6: "Free play, recording, backing audio, and MIDI/WAV export". A WAV
export must contain the recorded notes at their times. Tone.js documents how: in the
`Tone.Offline` JSDoc (`node_modules/tone/build/esm/core/context/Offline.js`), "The callback
function also passes in an offline instance of Context which can be used to schedule events
along the Transport ... using the passed in Offline Transport"; the global `Transport`
export is bound at import time (`node_modules/tone/build/esm/index.js:30`,
`export const Transport = getContext().transport`).

## Evidence

### Environment

- Commit/patch identity: `4466626`; probe bundles `src/lib/audio/audioEngine.ts` with the repo's esbuild into `$TMPDIR` (repository untouched)
- OS/runtime/browser: Linux, headless Chromium 141, Tone 15.1.22, page loaded from the web server on port 3788, a mouse click before `engine.init()` so the live AudioContext reports `running`
- Data profile/fixture: three notes (C4 0.5 s, E4 1.0 s, G4 1.5 s, 0.3 s each), render duration 2 s
- Hardware, if applicable: none; Offline rendering needs no audio device

### Reproduction

1. `DATA=... OUT=... node scripts/audit/browser/wav-render-probe.mjs` (copies into `$TMPDIR/pw` first).
2. Product build, 3 fresh page loads: header valid (RIFF, PCM, 44100 Hz, 2 ch, 5.00 s, sizes consistent) and `peak=0.0000` every time; no 100 ms window above RMS 0.002.
3. Control build (same file, only `tone.Offline(async (offlineCtx) =>`, `offlineCtx.transport.schedule(`, `offlineCtx.transport.start()` changed inside `renderRecordingToWav`): 3 of 3 runs `peak=0.3911`, energy starts at the 0.5 s window and covers all three notes.
4. A bare Tone repro (Sampler or PolySynth, scheduled on `Tone.Transport` versus `ctx.transport`) shows the same split: global silent, context transport correct, repeatable.

### Artifacts

- File/line or contract evidence: `src/lib/audio/audioEngine.ts:473` (`tone.Offline(async () => {`), `:496` (`tone.Transport.schedule`), `:507` (`tone.Transport.start()`)
- Test/command output summary: `$TMPDIR/p11/FB/wav-render-probe.out` (6 runs, 3 FAIL product, 3 PASS control)
- Screenshot/video/trace path and hash: `$TMPDIR/p11/FB/wav/product.wav` sha256 `728d8a027848aa5be1c3cbd20a1de4de177472efab72174d0f34bccfd3ec46e2`; `$TMPDIR/p11/FB/wav/control.wav` sha256 `1414f0a4f35904283ce4af07e0912dd25ec08838086f3353020195fe69471fd9`
- Durable-state before/after comparison: not applicable

## Root Cause

Events are scheduled on the live context's global `Transport`, not on the offline
context's transport, so the offline render never receives them. `audioBufferToWav` is
correct; it faithfully encodes silence.

## Recommended Remediation Boundary

In `renderRecordingToWav`, take the context passed to the `Tone.Offline` callback and
schedule and start on `context.transport`. Add a unit or integration test that renders two
notes and asserts non-zero samples after each onset.

## Required Regression Proof

- Deterministic unit/integration proof: render offline in a browser-like test (Chromium or `OfflineAudioContext` shim) and assert energy windows after each note onset.
- Electron proof: Free Play record, `Export WAV`, open the file in a player and in a waveform viewer.
- Web proof: none (export hidden in web).
- Data/recovery proof: not applicable.
- Manual hardware/UI proof: sitting 1, listen to the exported file.
- Broader regression command: `npm test`.

## Challenge Record

- Independent reproduction attempt: 3 fresh page loads per build; bare Tone repro as a second, product-independent confirmation.
- Alternative explanations tested: (a) headless silence: the control build and the bare `ctx.transport` repro render audible audio in the same browser, so Offline rendering works here; (b) live context suspended: re-ran after a user gesture with `engine.init()` and the context `running`, still silent; (c) sample loading: PolySynth and Sampler both reproduce; (d) a first, careless patch replaced the first `tone.Transport` in the file (inside `playSong`) and stayed silent, which delayed the diagnosis; the working control patches only inside `renderRecordingToWav`.
- Scope/severity changes: confidence set to medium because Electron's saved file has not been inspected, and the probe bundles with esbuild rather than the production Vite build (same Tone module semantics).
- Deduplication decision: not in the ledger.
- Electron file-level proof, 2026-10-20 (`scripts/audit/electron/freeplay-export.mjs`, `$TMPDIR/p11/EL2/fpx.out` sha256 `e90f6f8d…5d98fe8e`): record C4 E4 G4 C5 in Free Play, Export WAV through the real save handler (dialog stubbed to a path): status "WAV saved to …/take.wav.", a 6.26 s 16-bit stereo 44.1 kHz file (sha256 `317fde61…dcc7eef44`) with peak 0 and 0 non-zero samples. In the same renderer, the product bundle renders peak 0 and the control bundle renders peak 0.580 (179,532 non-zero samples). No listening is needed; the sitting item is withdrawn.
- Challenger conclusion and date: reproduced at engine level, Claude Code (acting), 2026-10-19; reproduced in the Electron file, 2026-10-20.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P2. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: `remediation/p11-s06-audio`, commit `662e621` (slice 6), implemented 2026-11-02, awaiting independent review; not merged.
- What changed: `renderRecordingToWav` takes the context passed to the `Tone.Offline` callback and schedules and starts on `offlineContext.transport` instead of the global `tone.Transport`. WAV files saved earlier stay silent; the user records and exports again.
- Tests (`src/lib/audio/audioEngine.test.ts`; the fake Tone renders only what the offline context's transport plays, like the real library): `renders sound after each note onset by scheduling on the offline transport` failed before the fix (`expected false to be true`: no energy in the 0.5 to 0.8 s window, and the schedules went to the global Transport) and passes after it (energy after both onsets, silence before the first, all schedules on the offline transport, one start). Source identity for the reproduction: product code `1180731`.
- Driver result: `browser/wav-render-probe.mjs` (headless Chromium, product bundle of this worktree's `audioEngine.ts`, 3 runs): header valid, 5.00 s, `peak=0.3911` every run, energy after all three onsets, the same numbers as the finding's control build (the in-memory control patch no longer applies to the fixed file, so the copy compares the product with itself and the CSP needed `bypassCSP` for the inline bundle). `electron/freeplay-export.mjs` (headless Electron on this worktree's `out/`): Export WAV status "WAV saved to ...take.wav.", 6.68 s 16-bit stereo 44.1 kHz file, `peak 0.47052`, 234,051 non-zero samples (finding: peak 0, 0 non-zero). Driver copies were made under `$TMPDIR` with paths pointed at this worktree (the committed drivers hard-code the main checkout). 
- Proof owed: agent-runnable: none. Human-only: none required (the sitting item was withdrawn); an optional listen to an exported take at sitting 1 item 5.
- Residual risk: the unit test uses a fake Tone; the browser and Electron runs above cover the real library.
- Revisit trigger: reviewer verification; web WAV export (PH-PAR-005, slice 17) reuses this function.
