# PH-PAR-004: A corrupt MIDI upload reports "undefined" instead of the parser's reason

- Lane: PAR
- Severity: P3
- Confidence: high
- Status: accepted
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
- Electron reproduction, 2026-10-20 (`scripts/audit/electron/workflows.mjs`, `$TMPDIR/p11/EL2/wf.out`): Upload MIDI with an empty `.mid`, a corrupt `.mid` starting `MThd`, and a `.txt` reports "3 failed (empty: undefined; corrupt: Cannot read properties of undefined (reading 'forEach'); notes.txt: undefined)"; Import Folder reports "bad: Cannot read properties of undefined (reading 'forEach')". So on the desktop the empty-file case is also unreadable, because the desktop handlers have no empty-file or extension check before parsing, and a file with a valid header but broken body reports a raw `TypeError`. The `.txt` case needs the user to bypass the dialog's MIDI filter.
- Challenger conclusion and date: reproduced, 2026-10-19; Electron scope added 2026-10-20
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3; deduplication: it shares a message line with PH-UI-009 and a route with PH-ARCH-004. Each of the three has its own root cause (error normalisation, an unconditional hint, DTO serialisation), so all three stay and share one remediation slice. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
