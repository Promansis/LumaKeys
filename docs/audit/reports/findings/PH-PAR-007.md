# PH-PAR-007: The web app stays on "Loading services..." until the MIDI permission prompt is answered

- Lane: PAR
- Severity: P2
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-20
- Verifier: TBD
- Affected runtime: web (Electron grants MIDI without a prompt: no permission handler is set in `src/main/index.ts`)
- Coverage rows: WF-001, WF-002, RT-011
- Related/duplicate findings: none
- First observed against: `main` at source identity `6e549b6`, Phase 11 lane F (FA run 2026-10-19; source trace 2026-10-20)

## User Impact

On first visit, the browser asks whether the site may use MIDI devices. Until the
visitor answers, the whole app shows "Loading services... Preparing MIDI, keyboard,
audio, and practice settings." If the prompt is ignored, collapsed into the address
bar, or hidden behind another window, the app never loads. That includes visitors who
only want the computer keyboard and have no MIDI device. Severity P2: a first-run
blocker on the web with an easy but non-obvious recovery (answer the prompt).

## Expected Behavior Or Oracle

The app already handles MIDI being absent or refused: it falls back to the computer
keyboard and shows "Try MIDI Again" (FA cases "absent" and "rejected"). A prompt that
has not been answered yet should get the same fallback, not block the app.

## Evidence

### Environment

- Commit/patch identity: `6e549b6`, web bundle from `dist/`
- OS/runtime/browser: Linux, headless Chromium 141; `navigator.requestMIDIAccess` replaced by a promise the driver settles later (`midi-permission-fallback.mjs`, case "pending")

### Reproduction

1. Load the app with the MIDI request left pending.
2. After 6 s the page still reads "LUMAKEYS / Loading services... / Preparing MIDI, keyboard, audio, and practice settings."
3. Settle the promise: the main menu appears at once ("LIBRARY READY / repeat-c4 / … START").
4. Controls in the same run: no Web MIDI API, and a rejected request, both load the main menu with the computer keyboard working.

### Artifacts

- `src/renderer/App.tsx:389-406`: `setMidiReady(true)` runs only in `finally` after `service.init()` settles.
- `src/renderer/App.tsx:1295`: the whole app renders the loading screen while `!midiReady`.
- `src/lib/midi/midiInputService.ts:37`: `await navigator.requestMIDIAccess({ sysex: false })` with no timeout.
- Output: `$TMPDIR/p11/FA/midi.final.out` sha256 `759061f4…607308e9`, case "pending".

## Root Cause

App startup treats MIDI initialisation as a prerequisite for rendering, but the
browser permission flow can leave that promise pending indefinitely.

## Recommended Remediation Boundary

Render the app once settings are ready; let MIDI initialise in the background and
update the device state when it settles (the permission-change listener already
exists). Alternatively race `init()` against a short timeout and treat it as pending.

## Required Regression Proof

- Deterministic unit/integration proof: App test with a never-settling `requestMIDIAccess`; the main menu renders and computer keys work.
- Web proof: rerun the FA "pending" case; the main menu appears without settling the promise.
- Manual hardware/UI proof: sitting 0 or 1, first visit in a fresh browser profile, leave the prompt unanswered for 30 s.

## Challenge Record

- Independent reproduction attempt: source trace confirms the gate; the driver shows the gate lifting the moment the promise settles.
- Alternative explanations tested: settings load being slow (no: the absent and rejected cases load at once with the same data).
- Scope/severity changes: Firefox's site-permission flow and Chrome's quiet permission UI make a pending prompt plausible; not checked in those browsers.
- Deduplication decision: new.
- Challenger conclusion and date: reproduced, 2026-10-20
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P2. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue:
- Verification evidence:
- Residual risk:
- Revisit trigger, if accepted-risk:
