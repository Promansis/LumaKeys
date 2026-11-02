# PH-PAR-005: Web Free Play records a take but offers no way to keep it, and says it can be exported

- Lane: PAR
- Severity: P3
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-19
- Verifier: TBD
- Affected runtime: web
- Coverage rows: WF-015
- Related/duplicate findings: none
- First observed against: `main` at source identity `4466626`, Phase 11 lane F (FB), 2026-10-19

## User Impact

In the browser, Free Play lets the user record notes and replay them, then shows "Recording
captured. You can replay or export it now." There is no export: `Export MIDI`, `Export WAV`,
and `Load Track` are not rendered when `IS_WEB` is true. The Backing Track panel still
reads "Load a backing track to turn open practice into a performance space." with disabled
Play and Stop buttons and no control that loads one. The take exists only in component
state; after a page reload "1 note" became "0 notes". A web user can follow the on-screen
wording to a dead end and lose the recording without an explanation. Severity P3: the
limitation is documented in `README.md` and the controls are hidden rather than broken,
but the in-app wording contradicts it.

## Expected Behavior Or Oracle

Phase 4 parity rule (`phase-4-runtime-parity-2026-07-12.md`): "Intentional desktop-only
capabilities. Browser stubs must be hidden or explicitly explained by the consuming UI."
`README.md:213`: "Some desktop-only actions are not available in web mode, such as ...
some export/save helpers." Hidden satisfies the first half; the status text and backing
panel copy do not follow it.

## Evidence

### Environment

- Commit/patch identity: `4466626` web build
- OS/runtime/browser: headless Chromium 141, web server on port 3788
- Data profile/fixture: eight notes played with the computer keyboard

### Reproduction

1. `scripts/audit/browser/freeplay-recording-export.mjs`: open Free Play, Escape for the overlay, `Record`, play 8 notes (5 single, one 3-note chord), Escape, `Stop Recording`.
2. Observed status: `"Recording captured. You can replay or export it now."`; overlay buttons: Resume, Back to Main Menu, Keyboard Setup, Metronome, Record, Play Recording, Play, Stop, and the visual presets; no Export or Load Track; no download event during the run.
3. Backing Track panel text: "No track loaded | Load a backing track to turn open practice into a performance space." with Play and Stop disabled.
4. After reload: "1 note" before, "0 notes" after.
5. Repeat count: one full run; the source (`FreePlayScreen.tsx:497`, `:1046-1067`) matches.

### Artifacts

- File/line or contract evidence: `FreePlayScreen.tsx:497` (status), `:1049-1065` (`!IS_WEB` gates), `:618-621` and `:648-651` (unreachable "available in the desktop app" messages)
- Test/command output summary: `$TMPDIR/p11/FB/freeplay-recording-export.out`
- Screenshot/video/trace path and hash: `$TMPDIR/p11/FB/data-wf015/shots/01-after-stop.png` sha256 `ff32429b04cb8ac74dc8c6ffd0df935c0c48a6db4f6fcee1b9ec9ecd5de0f87c`
- Durable-state before/after comparison: none (state is in memory)

## Root Cause

The web gating hid the controls but left the shared strings and the backing panel
unchanged; the explanatory messages written for the desktop-only handlers sit in handlers
that the web build can never call.

## Recommended Remediation Boundary

Make the status text and the Backing Track copy runtime-aware (or surface the existing
"available in the desktop app" explanation in the panel), or, as a larger product choice,
offer a browser download for the MIDI take.

## Required Regression Proof

- Deterministic unit/integration proof: `FreePlayScreen.test.tsx` web case asserting the status text and panel copy.
- Electron proof: unchanged wording and working export.
- Web proof: re-run `freeplay-recording-export.mjs`.
- Data/recovery proof: not applicable.
- Manual hardware/UI proof: none.
- Broader regression command: `npm test`.

## Challenge Record

- Independent reproduction attempt: source and runtime agree.
- Alternative explanations tested: controls hidden by viewport or scroll (checked the overlay DOM text, not pixels); a separate download path (listened for `download` events across record, stop, and replay, none).
- Scope/severity changes: P3 because the README documents the limit.
- Deduplication decision: distinct from the Phase 4 stub gating review (which found controls hidden); this is the copy that still promises them.
- Challenger conclusion and date: reproduced, Claude Code (acting), 2026-10-19.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge. Owner decision 15 (2026-11-02) puts slice 17 in wave 3.
- Fix branch/commit: `remediation/p11-s17-small`, commit `db7115f`; implemented and independently reviewed 2026-11-02; merged to `main` in `750bb42`; `fixed`, not `verified`: no agent or owner proof is owed beyond review.
- What changed: in `src/renderer/components/FreePlayScreen.tsx`, under `IS_WEB`, the stop-recording status reads "Recording captured. You can replay it now, but it is not saved: exporting to a file is only available in the desktop app." and the empty Backing Track panel reads "Loading a backing track from a file is only available in the desktop app." The desktop wording is unchanged. No export or load capability was added, and no stored data changes.
- Tests (`src/renderer/components/FreePlayScreen.test.tsx`, `FreePlayScreen runtime-aware recording copy`): the web case failed before the fix (`Unable to find an element with the text: /Recording captured\. You can replay it now, but it is not saved…/`) and passes after it; the desktop case passes before and after and guards the desktop wording. Both also check that the Export MIDI and Load Track buttons are absent on web and present on desktop. Source identity for the reproduction: product code equal to `cc40b63`.
- Driver result: `freeplay-recording-export.mjs` (web build of this branch, throwaway data directory) showed the new stop status and Backing Track panel copy, no Export MIDI, Export WAV or Load Track control, Play Recording disabled before a take, 8 of 8 notes captured and replayed in order within 43 ms of the played gaps, no download offered, a held key closed out at Stop, and a new recording clearing the previous one.
- Proof owed: agent-runnable, none. Human-only: none required. A browser MIDI download is outside this finding.
- Residual risk: a web take is still lost on navigation or reload; the copy now says so, but saving it is left to a later decision.
- Revisit trigger: reviewer verification, or a user report of a lost recording.
