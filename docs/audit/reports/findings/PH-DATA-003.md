# PH-DATA-003: Backup Restore Does Not Verify MIDI Content IDs

- Lane: persistence
- Severity: P2
- Confidence: high
- Status: fixed
- Owner: Codex (acting)
- Challenger: Codex, fresh isolated-fixture challenge
- Verifier: Claude Code (acting), Phase 11 re-verification and runtime lanes
- Affected runtime: both
- Coverage rows: DATA-002, DATA-013, OP-005
- Related/duplicate findings: none
- First observed against: 808e6739e55b5186e8a9565f2c4e9267c4894a6c plus the chartered audit patch identity

## User Impact

V2 library backups accept MIDI bytes whose SHA-256 does not match the safe
content-hash song ID named by the backup. A damaged or substituted backup can restore
metadata under one song identity while storing unrelated or invalid MIDI bytes under
that ID. The next import/reattach path relies on the same ID semantics, so the
corruption is silent until use.

## Expected Behavior Or Oracle

New imports derive song IDs from MIDI bytes and hash-ID reattach rejects nonmatching
bytes. V2 backup restore should preserve that content-addressed invariant before
committing files. See src/persistence/importSong.ts and the backup safety rules in
docs/agents/lumakeys-runtime-data-audit.md.

## Evidence

### Environment

- Commit/patch identity: charter baseline above.
- OS/runtime: Linux x86_64, Node v24.15.0.
- Data profile/fixture: fresh disposable AppDatabase and MIDI root under /tmp.
- Hardware: none.

### Reproduction

1. Derive a valid 64-hex song ID from one byte sequence.
2. Build a shape-valid v2 backup that names that ID but embeds a different byte
   sequence with a matching declared byte length.
3. Import the backup through importLibraryBackup.
4. The row and file are accepted, but hashing the stored bytes does not yield the
   restored song ID.

The isolated probe printed:

    {"accepted":true,"contentHashMatchesSongId":false}

### Artifacts

- V2 import checks filename shape and byte length but not the content hash:
  src/persistence/libraryBackup.ts:112-130.
- Import and reattach establish hash-derived identity elsewhere:
  src/persistence/importSong.ts:37-45 and src/persistence/importSong.ts:125-127.
- Isolated reproduction command/result: Phase 2 lane report, P2-DATA-003.

## Root Cause

The backup importer treats a SHA-256-shaped ID as a filename safety token only. It
does not verify that the bytes staged for that ID reproduce the identity used by the
song record.

## Recommended Remediation Boundary

Validate each v2 embedded MIDI payload before staging: decode safely, enforce the
configured size limit, derive its content ID, and reject a mismatch before any
database import. Preserve an explicit legacy policy for v1 backups rather than
relaxing the v2 invariant.

## Required Regression Proof

- Deterministic unit/integration proof: valid v2 backup round trip succeeds;
  substituted bytes, malformed base64, wrong filename, and hash mismatch leave both
  database and storage unchanged.
- Electron proof: invalid selected backup reports a recoverable error without
  mutating the disposable profile.
- Web proof: invalid upload returns a validation error without mutation.
- Data/recovery proof: before/after inventory confirms no staged or final MIDI file.
- Manual hardware/UI proof: import error names the affected song and retry path.
- Broader regression command: npm test, npm run build, and npm run build:web.

## Challenge Record

- Independent reproduction attempt: fresh hash fixture used a valid safe ID and a
  distinct byte payload.
- Alternative explanations tested: filename and byte-length validation both pass;
  only the omitted content-hash check explains the mismatch.
- Scope/severity changes: none.
- Deduplication decision: separate from PH-DATA-001 because this is validation before
  mutation, not cross-store recovery after mutation.

## Resolution

- Accepted rationale: content-addressed backup integrity is directly violated by a
  shape-valid payload.
- Fix branch/commit/issue: `d5839aa`, Phase 9 slice 8 ([Phase 9 report](../phase-9-remediation-2026-07-30.md)). This file said "accepted" until the Phase 11 consolidation reconciled it with the ledger on 2026-10-20.
- Verification evidence: Phase 9 added six `libraryBackup.test.ts` tests: valid restore, path containment, staging rollback, content identity, v1 compatibility and safe schema. Phase 11: all six pass ([re-verification](../phase-11-reverification-2026-10-19.md)). A backup with one changed MIDI byte is rejected with "MIDI backup content does not match <id>." and changes nothing, on the web (WF-020, [lane F](../phase-11-lane-f-workflows-2026-10-19.md)) and on the Linux desktop ([Electron report](../phase-11-electron-runtime-2026-10-20.md)).
- Residual risk: none known. A version 1 backup carries no MIDI bytes, so its songs restore as missing files for the user to reattach.
- Revisit trigger: before backup/restore release sign-off.
