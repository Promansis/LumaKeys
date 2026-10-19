# PH-PAR-004: A corrupt MIDI upload reports "undefined" instead of the parser's reason

- Lane: PAR
- Severity: P3
- Confidence: high
- Status: reproduced
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: both (web upload route and Electron import handlers)
- Coverage rows: WF-004, WF-005
- Related/duplicate findings: none
- First observed against: `main` at source identity `6e549b6`, Phase 11 lane F, 2026-10-19

## User Impact

Importing a damaged or mislabelled `.mid` file shows "1 failed (corrupt: undefined)".
The user learns the file failed but not why. Severity P3: no data is affected.

## Expected Behavior Or Oracle

Each import error carries a readable message, as the empty-file and wrong-extension
paths already do ("The file is empty.", "Only .mid, .midi, and .mscz files can be uploaded.").

## Evidence

```text
POST /api/midi/upload  files=corrupt.mid ("not a midi file at all")
200 {"songs":[],"errors":[{"filename":"corrupt"}],"skipped":0}
```

`@tonejs/midi` throws a plain string ("Bad MIDI file. Expected 'MHdr', got: 'not '"),
not an `Error`. `src/server/midiRouter.ts`, `src/main/index.ts`, and
`src/persistence/importSong.ts` all build the message with `(err as Error).message`,
which is `undefined` for a string. JSON serialisation then drops the key.

## Root Cause

Error normalisation assumes every thrown value is an `Error`.

## Recommended Remediation Boundary

Wrap the `Midi` constructor in `src/lib/midi/midiFileParser.ts` and rethrow
`new Error(String(thrown))`, or add a shared `errorMessage(unknown)` helper used by
all three import catch blocks.

## Required Regression Proof

- Unit: parser test that corrupt bytes reject with an `Error` whose message is non-empty.
- Route: `midiRouter` test that a corrupt upload returns an error entry with a string `message`.

## Challenge Record

- Reproduced at the HTTP boundary and in the browser UI.
- Challenger conclusion and date: reproduced, 2026-10-19

## Resolution

- Accepted/rejected rationale: pending consolidation
