# PH-MUS-011: A saved MIDI device that is gone keeps filtering input while Settings reads "Any connected device"

- Lane: MUS
- Severity: P2
- Confidence: high
- Status: reproduced
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-20
- Verifier: TBD
- Affected runtime: both (shared renderer and input service); reproduced in the web build with scripted devices
- Coverage rows: WF-002, WF-018, RT-011
- Related/duplicate findings: PH-MUS-010
- First observed against: `main` at source identity `6e549b6`, Phase 11 lane F (FA run 2026-10-19; source trace 2026-10-20)

## User Impact

A player once chose a specific keyboard in Settings. Later that device is replaced,
or it comes back with a different ID (for example on another USB port). The MIDI
Device select shows blank, and the summary card says "Any connected device". Every
note from the keyboard that is connected is dropped. The game's device line names
that keyboard, so it looks connected but does nothing. Severity P2: core input fails
silently, and the screen says the opposite of what is happening. Choosing any option
in the select repairs it, which a player has no reason to try.

## Expected Behavior Or Oracle

The status card describes the filter in force. If the saved device is absent, either
the filter falls back to any device or the card says the saved device is missing.

## Evidence

### Environment

- Commit/patch identity: `6e549b6`, web bundle from `dist/`
- OS/runtime/browser: Linux, headless Chromium 141, fake Web MIDI (`midi-permission-fallback.mjs`)
- Data profile/fixture: two fake inputs, `fake-1` "Fake Piano 88" and `fake-2` "Fake Second Keys"

### Reproduction

1. Select "Fake Piano 88" in Settings: card "CONNECTED KEYBOARD | Fake Piano 88", stored `input.midiDeviceId` = `fake-1`.
2. Remove `fake-1`, add `fake-2`.
3. Observed: card "CONNECTED KEYBOARD | Any connected device"; the select's value is empty (no matching option); the game line reads "Fake Second Keys".
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
- Scope/severity changes: the earlier claim that choosing "Any connected device" fires no change was wrong; the select is blank, so any choice fires one.
- Deduplication decision: new.
- Challenger conclusion and date: reproduced, 2026-10-20

## Resolution

- Accepted/rejected rationale: pending consolidation
- Fix branch/commit/issue:
- Verification evidence:
- Residual risk:
- Revisit trigger, if accepted-risk:
