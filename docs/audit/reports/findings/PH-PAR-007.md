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
- First observed against: `main` at source identity `4466626`, Phase 11 lane F (FA run 2026-10-19; source trace 2026-10-20)

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

- Commit/patch identity: `4466626`, web bundle from `dist/`
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
- Scope/severity changes: Firefox's site-permission flow and Chrome's quiet permission UI make a pending prompt plausible; checked in both on 2026-10-20 (below). Severity unchanged.
- Deduplication decision: new.
- Challenger conclusion and date: reproduced, 2026-10-20
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P2. Accepted.
- Owner sittings run by the agent, 2026-10-20: reproduced in real Chrome 151 with a fresh profile and no Playwright ([sitting 1](../phase-11-owner-sittings-2026-10-20.md#sitting-1-linux-display-and-speakers) item 8): "Loading services..." at 0, 5, 10, 15, 20, 25 and 30 s; a real click on Block left the loading screen 44 ms later. In Firefox 142 ([sitting 3](../phase-11-owner-sittings-2026-10-20.md#sitting-3-edge-and-firefox) item 4), `requestMIDIAccess` rejected after 11.6 s with "SecurityError: WebMIDI requires a site permission add-on to activate" and the app UI appeared at 12.4 s; Try MIDI Again rejected after 5.9 s. Settings, Input then shows the "cannot access your MIDI keyboard" card with Try MIDI Again, and the computer keys play.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: `remediation/p11-s07-midi-startup`, slice 7, implemented
  2026-11-02, awaiting independent review; not merged. Base `ccc68c2`.
- What changed: `src/renderer/App.tsx` no longer has the `midiReady` state. The loading
  screen now waits only for the settings (`settingsReady`) and the MIDI service object, so
  `midiInputService.init()` settles in the background: `midiError` and the device list update
  when it resolves or rejects, and the permission-change listener and Try MIDI Again work as
  before. Settings still load before the first render. The MIDI device setting is applied to
  the service from the stored value only and is written nowhere in startup, so a pending
  prompt writes nothing. Electron is unchanged in behaviour (its request resolves at once).
- Tests (`src/renderer/App.test.tsx`; source identity `1180731`, product code equal to
  `ccc68c2` for this file): `App > shows the main menu while the MIDI permission prompt is
  still unanswered` and `App > keeps the main menu when a pending MIDI request is refused
  later` both failed before the fix (the page stayed on "Loading services..." and
  `findByText('Start Recommended Song')` timed out) and pass after it. Both also assert that
  `input.midiDeviceId` is never written and the first also asserts the computer keyboard
  service was initialised. The other 24 tests in the file pass before and after.
- Driver result: `midi-permission-fallback.mjs` run in headless Chromium against this
  worktree's web build (`LUMAKEYS_TRUST_UPSTREAM_AUTH=1`, `$TMPDIR` data dir, port 3793).
  Case "pending": after 6 s with the promise unsettled the page shows the main menu ("LIBRARY
  READY / repeat-c4 / ... START SONG"); after the promise settles it still shows the main
  menu. A pending-only run that never settles the promise opened Settings, then a game, and
  the computer key (Comma) scored (HUD `100 | 1`). In the full run, "absent" and "rejected"
  still load the menu and score; "pending" and "empty" showed `false` for the Comma score once
  each, and the same "empty" `false` appears in the slice 5 driver run. The key-timing check
  is sensitive to load on a busy machine, and the pending-only rerun scored, so these are not
  attributed to this change; the lead may rerun.
- Proof owed: human-only, the sitting 1 item 8 check in a fresh Chrome profile, prompt left
  unanswered for 30 s, main menu visible. Nothing agent-runnable remains.
- Residual risk: the loading screen text still says "Preparing MIDI, ..." although it no
  longer waits for MIDI. A visitor who answers the prompt late sees the device list fill in
  without a notice.
- Revisit trigger, if accepted-risk: reviewer verification and the owner's fresh-Chrome check.
