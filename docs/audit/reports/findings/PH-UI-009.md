# PH-UI-009: A failed upload still tells the user to "Review the metadata before playing"

- Lane: UI
- Severity: P3
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-19
- Verifier: TBD
- Affected runtime: both (shared formatter)
- Coverage rows: WF-025, WF-004
- Related/duplicate findings: PH-PAR-004 (same message line, different defect)
- First observed against: `main` at source identity `4466626`, Phase 11 lane F (FB), 2026-10-19

## User Impact

`formatMidiImportResult` always ends with " Review the metadata before playing." Importing
only failing files gives, for example: "1 failed (minimal: MSCZ import requires MuseScore 4 on
the Linux web server. Use the bundled Docker image.). Review the metadata before playing."
No song was added and no metadata editor opened, so the closing instruction is false and
buries the actual reason. On the web, the person reading it is usually not the server
operator, and the text does not say what the user can do (export the score as MIDI from
MuseScore and upload the `.mid`). Severity P3: wording only.

## Expected Behavior Or Oracle

A status message must describe the outcome the user sees. The same UI shows
"Imported 5 songs. Review the metadata before playing." after a success (the editor opens),
so the sentence belongs to the success case only.

## Evidence

### Environment

- Commit/patch identity: `4466626` web build
- OS/runtime/browser: headless Chromium 141; four server configurations (converter unset, missing path, `/bin/true` and `/bin/false` stand-ins)
- Data profile/fixture: a minimal zip renamed `.mscz`, a non-zip `.mscz`, an empty `.mscz`

### Reproduction

1. `scripts/audit/browser/mscz-upload-no-musescore.mjs` uploads each file through the library file chooser.
2. Observed status lines (config A, converter unset): minimal zip and non-zip: "1 failed (<name>: MSCZ import requires MuseScore 4 on the Linux web server. Use the bundled Docker image.). Review the metadata before playing."; empty: "1 failed (empty: The file is empty.). Review the metadata before playing." Metadata editor opened: false in all.
3. The same trailing sentence appears in configs B, C, and D.
4. Repeat count: 12 uploads (3 files x 4 configurations), all identical in shape.

### Artifacts

- File/line or contract evidence: `src/renderer/services/libraryService.ts:20`, `src/server/museScore.ts:16`
- Test/command output summary: `$TMPDIR/p11/FB/mscz-upload-no-musescore.out`
- Screenshot/video/trace path and hash: `$TMPDIR/p11/FB/data-wf025/A/ui-failure.png`
- Durable-state before/after comparison: library unchanged by every failing upload (files in `midi-files` stayed at the one valid control song)

## Root Cause

The formatter appends the success hint unconditionally.

## Recommended Remediation Boundary

Append the hint only when `songs.length > 0`. Optionally add a one-line next step to the
no-MuseScore server error ("Export the score as MIDI from MuseScore and upload the .mid
file, or set LUMAKEYS_MUSESCORE_PATH on the server").

## Required Regression Proof

- Deterministic unit/integration proof: `libraryService.test.ts` case with only errors.
- Electron proof: same formatter, same test.
- Web proof: re-run the driver.
- Data/recovery proof: not applicable.
- Manual hardware/UI proof: none.
- Broader regression command: `npm test`.

## Challenge Record

- Independent reproduction attempt: 12 uploads across four configurations.
- Alternative explanations tested: a status overwritten by a later refresh (the line was read 1.8 s after each upload and persists).
- Scope/severity changes: P3, wording.
- Deduplication decision: PH-PAR-004 is the "undefined" message; this is the closing sentence.
- Challenger conclusion and date: reproduced, Claude Code (acting), 2026-10-19.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: `remediation/p11-s13-import`, slice 13, commit `08ae3e5`; implemented and independently reviewed 2026-11-02; merged to `main` in `5e1e67f`; `fixed`, not `verified`: the lead's `mscz-upload-no-musescore.mjs` rerun on `main` and the owner glance at the status line in the real window are owed.
- What changed: `formatMidiImportResult` in `src/renderer/services/libraryService.ts` appends " Review the metadata before playing." only when `songs.length > 0`; a failure-only or skipped-only result ends with ".". The optional next-step wording for a missing MuseScore was not added, to leave driver-visible text alone.
- Tests: `libraryService.test.ts` "does not ask for a metadata review when nothing was imported (PH-UI-009)" failed before the fix (the hint was present) and passes after. The existing imported-song assertions still pass and guard against over-correcting. Source identity for the reproduction: product code equal to `cc40b63`.
- Driver result: `scripts/audit/browser/mscz-upload-no-musescore.mjs` ran against the worktree's `dist/` build: every failure-only status line ("1 failed (minimal: ...)") has no review hint and no metadata editor opens; zero "Review the metadata" matches in the output. Electron WF-004 keeps the hint only on the "Imported 2 songs" line.
- Proof owed: none agent-runnable. Human-only: a glance at the status line in the real window.
- Residual risk: the status line still lacks a next step for "MuseScore unavailable"; the wording is a product decision.
- Revisit trigger: reviewer verification, or any new import outcome that mixes imported and failed files.
