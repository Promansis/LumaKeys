# PH-PAR-008: Web "Reattach MIDI" reports an error after a successful reattach

- Lane: PAR
- Severity: P2
- Confidence: high
- Status: open
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting)
- Verifier: TBD
- Affected runtime: web (Electron is not affected: the `songs:reattach-midi-file` IPC handler in `src/main/index.ts` returns `{ reattached: [song], errors: [], skipped: 0 }` directly)
- Coverage rows: WF-006, BR-010, OP-002
- Related/duplicate findings: PH-PAR-002 (reattach cancellation), PH-PAR-003 (legacy storage parity); none duplicate
- First observed against: `main` at source identity `2d6593d`, wave 3 slice 13 review lead, 2026-11-02

## User Impact

On the web, a visitor with a song whose MIDI file is missing chooses Reattach MIDI and
picks a file. The server stores the file and the song is fixed, but the Library shows
"1 failed (<title>: g.songs is not iterable (cannot read property undefined))" instead of
"Reattached 1 MIDI file." and does not refresh the list, so the song still looks missing
until the page is reloaded. A visitor may retry or delete the song believing it failed.
Severity P2: wrong outcome message on a recovery flow, data is correct, and a reload
recovers.

## Expected Behavior Or Oracle

The reattach result the client returns matches what the server did: `reattached`
contains the song, `errors` is empty, the status reads "Reattached 1 MIDI file." and the
Library refreshes (`LibraryScreen.handleReattachMidi` refreshes when
`result.reattached.length > 0`). This is what Electron already does.

## Evidence

### Environment

- Commit/patch identity: `2d6593d`, web bundle built in the slice 24 worktree
- OS/runtime/browser: Linux, headless Chromium via Playwright, bundled web server on a free port, `LUMAKEYS_TRUST_UPSTREAM_AUTH=1`, `$TMPDIR` data directory

### Reproduction

1. Import a MIDI file, then delete its stored file from the data directory's `midi-files/` (`GET /api/midi/<id>` returns 404).
2. Library, open the song's Edit Metadata, choose Reattach MIDI, pick a `.mid` file.
3. Status reads "1 failed (ode-to-joy: g.songs is not iterable (cannot read property undefined))."
4. Yet `midi-files/` holds the file again and `GET /api/midi/<id>` returns 200.

### Artifacts

- `src/renderer/webBridge.ts` `reattachMidiFile` calls the shared `uploadMidiFiles(files, '/api/midi/<id>/reattach')`, which does `songs.push(...batch.songs)`.
- `src/server/midiRouter.ts` `POST /:songId/reattach` answers `{ reattached, skipped, errors }`, with no `songs`. The spread of `undefined` throws, the helper's `catch` turns it into an error entry, and `reattachMidiFile` returns `reattached: []`.
- `src/renderer/components/LibraryScreen.tsx` `handleReattachMidi` formats that result and skips the refresh.
- Driver: `$TMPDIR/pw/s24/reattach.mjs` (headless Chromium, imports `ode-to-joy.mid`, deletes the stored file, reattaches).

## Root Cause

The reattach and upload routes return differently named fields, and the client reuses
one upload helper that reads only the upload route's `songs`. Nothing typed the route
response, so the mismatch compiled. The existing webBridge tests covered only
`/api/midi/upload`.

## Recommended Remediation Boundary

Client only: let the upload helper read the field the route returns (`songs` for upload,
`reattached` for reattach), keeping progress events and the upload path unchanged. Do not
change the server response shape, which already matches `ReattachMidiResult` in
`src/shared/ipc.ts` and the Electron handler.

## Required Regression Proof

- Deterministic unit proof: a webBridge test that stubs `fetch` with the real reattach response shape and asserts `reattachMidiFile` returns the song and no errors, plus a route-error case.
- Web proof: the driver above; status reads "Reattached 1 MIDI file." and the file is served again.
- Manual hardware/UI proof: none needed.

## Challenge Record

- Independent reproduction attempt: source trace by the review lead; reproduced by the unit test and the browser driver on 2026-11-02.
- Alternative explanations tested: the server failing to reattach (no: the file is stored and served after the failure message); Electron sharing the bug (no: its handler builds the result itself).
- Scope/severity changes: none.
- Deduplication decision: new; PH-PAR-002 and PH-PAR-003 cover cancellation and legacy storage, not the result shape.
- Challenger conclusion and date: reproduced, 2026-11-02

## Resolution

- Accepted/rejected rationale: reproduced by test and driver (2026-11-02), not yet independently reviewed.
- Fix branch/commit/issue: `remediation/p11-s24-reattach`, slice 24, implemented 2026-11-02, awaiting independent review; not merged. Base `2d6593d`. Fix commit `cb28cf6`.
- What changed: `uploadMidiFiles` in `src/renderer/webBridge.ts` takes a `songsKey` (`'songs'` by default, `'reattached'` for reattach) and reads that field from the response. `reattachMidiFile` passes `'reattached'`. Progress events, the upload path, the server and Electron are unchanged.
- Tests (`src/renderer/webBridge.test.ts`, source identity `2d6593d`): `returns the reattached song from the reattach route response (PH-PAR-008)` failed before the fix (result was `reattached: []` with an error `batch.songs is not iterable (cannot read property undefined)`) and passes after; it also asserts the encoded reattach URL and the progress event. `reports reattach route errors without reattached songs (PH-PAR-008)` failed before with the same error text in place of "The file is empty." and passes after. The other 22 tests in the file pass before and after. `npm run verify` passes (654 passed, 1 skipped).
- Driver result: run. Web build of the slice worktree, headless Chromium, `$TMPDIR/s24/data`, port 39421. At `2d6593d` the status reads "1 failed (ode-to-joy: g.songs is not iterable (cannot read property undefined))." although the file is stored and served (200). With the fix it reads "Reattached 1 MIDI file." and the file is served (200). The Library refresh was not separately captured. Server stopped afterwards.
- Proof owed: none agent-runnable. No human-only proof needed.
- Residual risk: the client still trusts the route response without runtime validation; the two routes' differing field names remain.
- Revisit trigger, if accepted-risk: a bridge or route change that renames result fields, or a third upload-style route sharing the helper.
