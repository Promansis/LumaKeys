# PH-MUS-011: A saved MIDI device that is gone keeps filtering input while Settings reads "Any connected device"

- Lane: MUS
- Severity: P2
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-20
- Verifier: TBD
- Affected runtime: both (shared renderer and input service); reproduced with scripted devices in the web build and, on 2026-10-20, in Electron
- Coverage rows: WF-002, WF-018, RT-011
- Related/duplicate findings: PH-MUS-010
- First observed against: `main` at source identity `4466626`, Phase 11 lane F (FA run 2026-10-19; source trace 2026-10-20)

## User Impact

A player once chose a specific keyboard in Settings. Later that device is replaced,
or it comes back with a different ID (for example on another USB port). The MIDI
Device select and the summary card both show "Any connected device". Every
note from the keyboard that is connected is dropped. The game's device line names
that keyboard, so it looks connected but does nothing. Severity P2: core input fails
silently, and the screen says the opposite of what is happening. Setting the select
again repairs it only if that fires a change; since it already shows "Any connected
device", picking that option again may do nothing in a real browser (not checked by
hand). A player has no reason to try either way.

## Expected Behavior Or Oracle

The status card describes the filter in force. If the saved device is absent, either
the filter falls back to any device or the card says the saved device is missing.

## Evidence

### Environment

- Commit/patch identity: `4466626`, web bundle from `dist/`
- OS/runtime/browser: Linux, headless Chromium 141, fake Web MIDI (`midi-permission-fallback.mjs`)
- Data profile/fixture: two fake inputs, `fake-1` "Fake Piano 88" and `fake-2` "Fake Second Keys"

### Reproduction

1. Select "Fake Piano 88" in Settings: card "CONNECTED KEYBOARD | Fake Piano 88", stored `input.midiDeviceId` = `fake-1`.
2. Remove `fake-1`, add `fake-2`.
3. Observed: card "CONNECTED KEYBOARD | Any connected device"; the select's value is empty, which is the value of its "Any connected device" option, so it shows that option; the game line reads "Fake Second Keys".
4. With the game running, MIDI note 60 from `fake-2` is sent 45 times: no score. A computer key still scores.
5. Control: clear the filter; the same `fake-2` note scores at once.

### Artifacts

- `src/renderer/components/SettingsScreen.tsx:729`: the card falls back to "Any connected device" when the saved id matches no device.
- `src/renderer/components/SettingsScreen.tsx:1705-1713`: the select keeps the stale value, which matches no option.
- `src/lib/midi/midiInputService.ts:50-51`, `:137`: the service keeps `filterDeviceId` and drops every other input.
- `src/renderer/App.tsx:531`, `:910-911`: the saved id is applied at startup and on change, with no check against present devices.
- Output: `$TMPDIR/p11/FA/midi.final.out` sha256 `759061f4…607308e9`, case "selected device gone, other device appears".

## Root Cause

The display layer and the input layer resolve a missing device differently: the card
treats it as "any", the service treats it as "only that one".

## Recommended Remediation Boundary

Pick one rule and apply it in both places. The smallest is to show "Saved device not
connected: <name or id>" in the card, with an option to switch to any device. The
alternative is for the service to ignore a filter whose device is absent.

## Required Regression Proof

- Deterministic unit/integration proof: `midiInputService` test with a filter for an absent device, plus a SettingsScreen test for the card text.
- Web proof: rerun the FA case; either the note scores or the card names the missing device.
- Manual hardware/UI proof: sitting 4 with two real keyboards if available.

## Challenge Record

- Independent reproduction attempt: control case in the same run (filter cleared, note scores).
- Alternative explanations tested: game not running (no: a computer key scored in the same state).
- Scope/severity changes: an earlier revision said the select is blank, so any choice fires a change. Sitting 4 item 6 corrected that: the select shows "Any connected device", so re-choosing it may fire no change in a real browser. The control there used Playwright `selectOption('')`, which fires one regardless.
- Deduplication decision: new.
- Challenger conclusion and date: reproduced, 2026-10-20
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P2. Accepted.
- Owner sitting run by the agent, 2026-10-20: reproduced on the web and the desktop in [sitting 4](../phase-11-owner-sittings-2026-10-20.md#sitting-4-midi-keyboard) item 6. After the saved "Audit Keys 61" (stored id `S4A-...`) is swapped for "Probe Piano 88", the select has value "" and selectedIndex 0 and shows "Any connected device", as does the card. In Free Play a note-on C4 from the new device lights no key; a computer key lights C4. Choosing "Any connected device" through Playwright fixed it.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue:
- Verification evidence:
- Residual risk:
- Revisit trigger, if accepted-risk:
