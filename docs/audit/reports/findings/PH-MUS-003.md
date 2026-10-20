# PH-MUS-003: Custom Fingerings Bind To A Filtered Session Index

- Lane: music correctness
- Severity: P2
- Confidence: high
- Status: verified
- Owner: Codex (acting)
- Challenger: Codex, fresh isolated-fixture challenge
- Verifier: Claude Code (acting), agent proof run 2026-10-21
- Affected runtime: both
- Coverage rows: WF-008, WF-009, DATA-007, BR-032, BR-033, BR-034, MOD-003, MOD-011
- Related/duplicate findings: [PH-MUS-017](PH-MUS-017.md) (changing a track assignment deletes saved fingerings)
- First observed against: `808e6739e55b5186e8a9565f2c4e9267c4894a6c` plus the chartered audit patch identity

## User Impact

When a learner edits a fingering while a loop or hand filter is active, the saved
override is assigned to the visible schedule position, not the underlying song note.
Opening the full song later can display the chosen finger on a different note and
leave the originally edited note with an algorithmic finger. The user is shown
incorrect technique guidance after saving a valid edit.

## Expected Behavior Or Oracle

A durable fingering override must identify the same musical note in the source song
regardless of a current loop, hand filter, ignored track, or display ordering. The
database stores `noteIndex`, but its value must be a stable source identity rather
than an index after a transient session filter.

## Evidence

### Environment

- Commit/patch identity: charter baseline above.
- OS/runtime: Linux x86_64, Node v24.15.0.
- Data profile/fixture: in-memory two-note ParsedSong and FingeringRow only; no user data.
- Hardware: none.

### Reproduction

1. Create a two-bar song with one right-hand note in each bar.
2. Start a learning session looped to bar two, where the bar-two note has
   `scheduledIndex` zero.
3. Persist a custom right-hand fifth-finger override at index zero, as the editor
   does for the selected visible note.
4. Open a full-song session with that same persisted record.

The fresh probe printed:

```text
{"loopSession":[{"id":"loop-note","scheduledIndex":0,"finger":5}],"fullSession":[{"id":"first","scheduledIndex":0,"finger":5},{"id":"loop-note","scheduledIndex":1,"finger":1}]}
```

### Artifacts

- GameSession filters to loop bounds before assigning indexes and looking up
  overrides: `src/lib/game/GameSession.ts:243-264`.
- The visible note exposes that transient `scheduledIndex`:
  `src/lib/game/GameSession.ts:349-391`.
- GameScreen copies `scheduledIndex` into the editor and database payload:
  `src/renderer/components/GameScreen.tsx:1125-1161`.
- `FingeringRow` and the SQLite key are only `(songId, noteIndex)`:
  `src/shared/dbTypes.ts:39-44` and `src/persistence/database.ts:450-468`.

## Root Cause

Persistence uses an index from `scheduledNotes`, a derived list whose membership and
order change when a session loops, filters hands, or ignores a track. There is no
stable source-note identifier or source-order index at the persistence boundary.

## Recommended Remediation Boundary

Store a stable parsed-note identity or canonical source-order index. Carry that
identity into `ScheduledNote` and `VisibleNote`, use it in editor callbacks and the
bridge/database key, and provide a migration/legacy interpretation for existing
integer records. Ensure looped, filtered, and full sessions resolve the same saved
override without recreating the score state.

## Required Regression Proof

- Deterministic unit/integration proof: save a fingering in full, looped,
  left-only, right-only, and ignored-track sessions; each reload applies it only to
  the original source note.
- Electron proof: edit a fingering in a loop, reopen the full song in a disposable
  profile, and verify the label is on the intended note.
- Web proof: repeat through the web bridge and verify the returned row maps to the
  same note.
- Data/recovery proof: legacy records retain a documented mapping or report a safe
  migration outcome; backup/restore retains stable overrides.
- Manual hardware/UI proof: a learner can edit, save, reset, and re-open a fingering
  while loop and hand controls vary.
- Broader regression command: `npm test`, `npm run build`, and `npm run build:web`.

## Challenge Record

- Independent reproduction attempt: a fresh two-note, two-bar fixture reproduced
  the remapping without renderer, storage, or audio state.
- Alternative explanations tested: the different finger is not a heuristic change;
  the same persisted index deterministically resolves to a different note.
- Scope/severity changes: none.
- Deduplication decision: separate from PH-MUS-001 because this is durable note
  identity, not score-state reset.
- Challenger conclusion and date: accepted by Codex, 2026-07-11.

## Resolution

- Accepted rationale: persisted user-authored technique data points to the wrong musical event after a supported view change.
- Verified rationale: on 2026-10-21 the agent proof run saved a finger in each of five views, re-opened the song, and found each finger on its own note, then restored the backup into a fresh profile with the same fingers on the same notes (24 of 24 checks). The owed Electron proof is complete.
- Fix branch/commit/issue: `d5839aa`, Phase 9 slice 9 ([Phase 9 report](../phase-9-remediation-2026-07-30.md)). This file said "accepted" until the Phase 11 consolidation reconciled it with the ledger on 2026-10-20.
- Verification evidence: Phase 9 keys fingerings by `ParsedNote.id` through an additive `note_id` column. Phase 11: the `GameSession.test.ts` loop-identity test and the `database.test.ts` legacy-row test pass ([re-verification](../phase-11-reverification-2026-10-19.md)). In a one-bar loop, the override set on the loop's first note (E4, `track-0-note-2`) is stored as `{noteId: "track-0-note-2", noteIndex: -1, finger: 5}`. After Clear Loop it shows on E4, not on the song's first note. This holds on the web ([lane C](../phase-11-lane-c-music-correctness-2026-10-19.md)) and in Electron over IPC (agent item A1, [Electron report](../phase-11-electron-runtime-2026-10-20.md)).
  - Agent proof run 2026-10-20: headless Electron 30.5.1 (Chromium 124) on the existing `out/` build, throwaway profiles under `$TMPDIR`, no injection. Song: "Two Hand Study" (Melody F4 G4 A4 B4 C5 C5 on Right Hand, Accompaniment C3 E3 G3 C3 E3 G3 on Left Hand). Through the UI, one finger was saved in each of five views: Right Hand only (B4, view index 3, full index 6), Left Hand only (E3, view 4, full 9), a loop of measure 2 with both hands (second C5, view 2, full 10), the same loop with Left Hand only (second G3, view 1, full 11) and the full song (C3). Each row was stored as `{noteId, noteIndex: -1, finger, hand}` with the note id of the clicked note, not the view index. After the song was re-opened from the library, every note's finger was read from the editor popup in the full, right-only, left-only, loop and loop-left views: each saved finger sat on its own note and every other note kept its first value. The export then held five fingerings with note ids. In a fresh profile, Import Library brought back the same song id and the same five rows, and the full view and the loop view showed the same fingers on the same notes. 24 of 24 checks pass. Also run with the Accompaniment track set to Ignore: a finger saved on a melody note in that view was stored by note id. Observation, not a failure of this finding, now raised as [PH-MUS-017](PH-MUS-017.md): changing any track assignment (here Accompaniment from Ignore back to Left Hand) deletes every saved fingering for the song with no prompt, because `handleAssignmentChange` in `GameScreen.tsx` calls `clearCustomFingerings`; the row count went from 1 to 0. Evidence: `$TMPDIR/p11/PF/electron/mus1/` (source profile, `backup.json`, `positions.json`, `shots/`), `mus1b/` (restored profile), output in `$TMPDIR/p11/PF/electron/mus1.out`. Driver: `scripts/audit/electron/proof-mus-003.mjs`. The owed Electron proof is complete.
- Residual risk: custom fingerings saved before the fix have no note id. They stay in the database, but `GameSession.ts` applies only rows with a note id, so they no longer show and the user has to enter them again.
- Revisit trigger: before fingering persistence or loop-practice changes ship.
