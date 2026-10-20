# PH-PAR-003: Supported Legacy MIDI Migration Loads Only in Electron

- Lane: runtime parity
- Severity: P2
- Confidence: high
- Status: verified
- Owner: Codex (acting)
- Challenger: Codex, fresh migration fixture and cross-runtime challenge
- Verifier: Claude Code (acting), agent proof run 2026-10-21
- Affected runtime: both
- Coverage rows: DATA-002, WF-004, WF-006, WF-008, WF-009, BR-011, BR-059, OP-002, MOD-008, MOD-009
- Related/duplicate findings: none
- First observed against: `808e6739e55b5186e8a9565f2c4e9267c4894a6c` plus the chartered audit patch identity

## User Impact

An existing user migrated from `song-metadata.json` can see the same song row in both runtimes, but Electron plays and recomputes it from its legacy external source path while web reports that the app-owned MIDI file is missing. The user can reattach MIDI in web, but the row gives no explicit migrated/unavailable state and the behavior differs by host. This is a recoverable P2 runtime/data compatibility defect.

## Expected Behavior Or Oracle

The supported legacy migration must produce a canonical storage state usable in both supported runtimes, or an explicit, user-visible recovery state with the same outcome in both. A `Song` is imported MIDI metadata plus an app-owned reference to MIDI bytes under `CONTEXT.md`; host-specific arbitrary-file fallback must not silently alter whether an existing song can be practiced.

## Evidence

### Environment

- Commit/patch identity: charter baseline above.
- OS/runtime/browser: Linux x86_64, Electron 30.5.1, Node web server, Chrome-compatible web bridge.
- Data profile/fixture: fresh `/tmp/lumakeys-audit-p4-migration-ljNQo5` with one valid external MIDI file and only `song-metadata.json` before Electron startup.
- Hardware: none.

### Reproduction

1. Put one valid external MIDI and one `song-metadata.json` entry with `sourcePath` into a fresh Electron user-data root.
2. Start Electron against that root. It runs the production JSON migration.
3. Read the song and invoke `loadMidiFileData` and `recomputeAllSongDifficulties` through `window.appBridge`.
4. Stop Electron, start the web server against the same root, and make the equivalent bridge/route calls.

Electron migrated one row, loaded 614 MIDI bytes, and recomputed one song with no errors. Web listed the same row but `GET /api/midi/legacy-migrated-song` returned 404 for `midi-files/legacy-migrated-song.mid`; web recompute returned zero updates and one missing-file error. Repeated with a fresh legacy profile and the same result.

### Artifacts

- The supported migration persists `meta.sourcePath` as `songs.file_path` without copying bytes: `src/persistence/database.ts:222`.
- Electron explicitly falls back from app-owned MIDI storage to that external `filePath`: `src/main/index.ts:42`.
- Electron gives the fallback to difficulty recompute: `src/main/index.ts:244`.
- Web MIDI reads only its app-owned `midiStorage`: `src/server/midiRouter.ts:127`; web recompute omits the Electron fallback: `src/server/bridgeRouter.ts:360`.
- The complete command/result summary is recorded in [Phase 4](../phase-4-runtime-parity-2026-07-12.md#p4-par-003-supported-legacy-json-migration).

## Root Cause

Legacy migration creates a noncanonical song record that references an external file but does not stage/copy it into app-owned MIDI storage. Electron masks that state with a host-only filesystem fallback; web adheres to app-owned storage only. The adapters therefore apply different storage rules to the same migrated `Song`.

## Recommended Remediation Boundary

Choose one canonical legacy policy: migrate verified source bytes into app-owned storage atomically, or persist an explicit missing-MIDI state and require a reattach flow before the song is playable in either runtime. Keep arbitrary legacy paths out of the shared playable state and cover load/recompute/recovery together.

## Required Regression Proof

- Deterministic unit/integration proof: a JSON-migrated row has a canonical app-owned byte record or explicit unavailable state.
- Electron proof: migrated row load and recompute match the chosen policy without relying on an external path fallback.
- Web proof: the same data root gives the same load/recompute/recovery outcome.
- Data/recovery proof: external source missing, unreadable, hash-mismatched, and valid cases leave no ambiguous playable row.
- Manual hardware/UI proof: missing migrated MIDI exposes a clear reattach action and retry result.
- Broader regression command: focused persistence/bridge tests, `npm test`, `npm run build`, and `npm run build:web`.

## Challenge Record

- Independent reproduction attempt: [PH-PAR-003 challenge](../challenges/PH-PAR-003.md).
- Alternative explanations tested: a fresh real migration, not an injected database row, produced the state; web saw the row, proving this is not a database visibility issue.
- Scope/severity changes: includes both byte load and recompute because the same Electron-only fallback owns both outcomes.
- Deduplication decision: distinct host compatibility root cause; not a duplicate of PH-DATA-001 or PH-DATA-003 atomicity/content-identity findings.
- Challenger conclusion and date: accepted as P2, 2026-07-12.

## Resolution

- Accepted/rejected rationale: the same supported migrated row has opposite Electron/web load and recompute outcomes.
- Verified rationale: on 2026-10-21 the agent proof run showed that hash-mismatched, unreadable, missing and no-source legacy rows keep an empty `filePath` and return 404 on both runtimes, in the first-run and the startup-repair path, and a valid row is served with identical bytes. The owed proof is complete.
- Fix branch/commit/issue: `d5839aa`, Phase 9 slice 13 ([Phase 9 report](../phase-9-remediation-2026-07-30.md)). This file said "accepted" until the Phase 11 consolidation reconciled it with the ledger on 2026-10-20.
- Verification evidence: Phase 9 copies verified source MIDI into app-owned storage in `migrateFromJson` and repairs legacy external-path rows at startup. Phase 11: `databaseMigration.test.ts` (4 tests) and `legacyBrandMigration.test.ts` (9 tests) pass ([re-verification](../phase-11-reverification-2026-10-19.md)). A legacy `song-metadata.json` that points at an external MIDI file imports into `midi-files` and its bytes are served back on the web (J1) and in packaged Linux Electron (P3), which also writes `song-metadata.json.migrated` ([lane B](../phase-11-lane-b-persistence-2026-10-19.md)).
  - Agent proof run 2026-10-20: `scripts/audit/proof-par003-unplayable-legacy.mjs` builds a throwaway legacy profile with six songs: valid, hash-mismatched, unreadable (chmod 000), missing, no `sourcePath`, and a corrupt file whose hash matches. It runs two variants (first-run `song-metadata.json`; startup repair of rows that still hold an external path plus `song-metadata.json.migrated`) and then restarts each. The desktop path runs the Electron main-process sequence in-process (`migrateFromJson`, `midiStorage.read`, `recomputeAllSongDifficulties`; Electron itself was not launched). The web path runs the built `dist/server/index.cjs` over `/api/bridge` and `/api/midi/:id`. Result: all 4 cases pass for the owed proof. In every case, the hash-mismatched, unreadable, missing and no-source rows keep an empty `filePath`, no `midi-files` entry, a 404 from `/api/midi/:id` (ENOENT on the desktop read), and one recompute error each. The valid row is copied into `midi-files` with identical bytes and the legacy sources are untouched. The JSON is renamed to `.migrated`, and a restart leaves the same state. One gap outside the owed proof: the startup repair path does not parse the bytes, so a source that is corrupt but hash-matching is copied in and served with 200 (recompute then errors); the first-run path rejects it. Evidence: `$TMPDIR/p11/PF/probes/par003/report.json`. Probe: `scripts/audit/proof-par003-unplayable-legacy.mjs`.
- Residual risk: the startup-repair path does not parse bytes. A legacy source whose hash matches but whose bytes are corrupt is copied into `midi-files` and served with 200; the first-run path rejects it. The row then fails to parse the same way in both runtimes, so parity holds. Kept as a residual, not a finding. The legacy brand-name fallback (DATA-017) and the Windows profile carry-over ([PH-DATA-005](PH-DATA-005.md)) are tracked separately. The Windows profile check is owed in the owner's [sitting 2](../phase-11-user-tests.md).
- Revisit trigger, if accepted-risk: not applicable.
