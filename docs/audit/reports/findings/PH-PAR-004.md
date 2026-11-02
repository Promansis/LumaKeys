# PH-PAR-004: A corrupt MIDI upload reports "undefined" instead of the parser's reason

- Lane: PAR
- Severity: P3
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: both (web upload route and Electron import handlers)
- Coverage rows: WF-004, WF-005
- Related/duplicate findings: none
- First observed against: `main` at source identity `4466626`, Phase 11 lane F, 2026-10-19

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
- Fix branch/commit/issue: `remediation/p11-s13-import`, slice 13, commit `aa35f24`; implemented and independently reviewed 2026-11-02; merged to `main` in `5e1e67f`; `fixed`, not `verified`: the lead's `workflows.mjs` WF-004 rerun on `main` is owed.
- What changed: `readMidi` in `src/lib/midi/midiFileParser.ts` wraps the `@tonejs/midi` constructor and rethrows a thrown string as `new Error(String(thrown))`; `extractMidiMeta` and `parseMidiFile` use it. The existing `(err as Error).message` catch blocks in `src/main/index.ts`, `src/server/midiRouter.ts` and `importSong.ts` are unchanged and now read the parser's reason. The desktop empty and `.txt` cases are fixed by the same wrap. A valid-header, broken-body file throws a real `TypeError` ("Cannot read properties of undefined (reading 'forEach')"), which is left as it is.
- Tests: `midiFileParser.test.ts` "corrupt MIDI bytes" (2 tests) failed before the fix (`expected 'Bad MIDI file.  Expected 'MHdr', go...' to be an instance of Error`) and pass after. `midiRouter.test.ts` "names the parser reason for a corrupt .mid upload (PH-PAR-004)" failed before (`expected 'undefined' to be 'string'`) and passes after. Source identity for the reproduction: product code equal to `cc40b63`.
- Driver result: `scripts/audit/electron/workflows.mjs` WF-004 ran on a throwaway profile: the empty and `.txt` files now show "Bad MIDI file. Expected 'MHdr', got: ''" and "...got: 'hell'" instead of "undefined"; the corrupt file shows the TypeError text above. The web driver `mscz-upload-no-musescore.mjs` ran (not the corrupt-`.mid` case; the router test covers it).
- Proof owed: agent-runnable, none left. Human-only: none.
- Main-build proof, 2026-11-02 (`c170bc3`): WF-004 on Electron (`workflows.mjs`): valid "Imported 2 songs. Review the metadata before playing.", duplicate "1 already in library.", empty / wrong-extension / corrupt each "1 failed (...)", cancel "Import canceled.". WF-004 on the web (a throwaway driver; no committed web WF-004 driver exists): the same, without the cancel case. Runtime difference noted: for empty and wrong-extension files the web shows the server's text and Electron the parser's "Bad MIDI file..."; a corrupt file gives the raw TypeError on both, as recorded above. The proof agent's driver edits were made to its own copies only.
- Residual risk: the parser's own wording ("Bad MIDI file. Expected 'MHdr'...") is technical; a friendlier message is a separate decision. The TypeError wording for a broken body is unchanged.
- Revisit trigger: reviewer verification, or a new `@tonejs/midi` version that changes what it throws.
