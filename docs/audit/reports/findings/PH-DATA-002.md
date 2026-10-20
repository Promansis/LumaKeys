# PH-DATA-002: Full User-Data Reset Leaves Instrument Sample Packs Behind

- Lane: persistence
- Severity: P2
- Confidence: high
- Status: verified
- Owner: Codex (acting)
- Challenger: Codex, fresh isolated-fixture challenge
- Verifier: Claude Code (acting), agent proof run 2026-10-21
- Affected runtime: both
- Coverage rows: DATA-014, DATA-015, OP-006, OP-009
- Related/duplicate findings: [PH-DATA-010](PH-DATA-010.md) (reset confirmation copy); [PH-DATA-001](PH-DATA-001.md) (reset failure states)
- First observed against: 808e6739e55b5186e8a9565f2c4e9267c4894a6c plus the chartered audit patch identity

## User Impact

The Delete User Data flow states that all user data was deleted, but installed
instrument packs survive it. Electron leaves app-owned pack files under userData,
while web leaves IndexedDB pack blobs and continues reporting them as installed.
The issue is recoverable but violates reset expectations, leaves potentially large
assets on the device, and creates desktop/web reset divergence.

## Expected Behavior Or Oracle

The charter includes sample files and IndexedDB-backed assets in durable-state
lifecycle and requires full user-data reset to cover files and browser-local state.
See CONTEXT.md and docs/agents/lumakeys-runtime-data-audit.md.

## Evidence

### Environment

- Commit/patch identity: charter baseline above.
- OS/runtime: Linux x86_64, Node v24.15.0, Chrome 149.0.7827.114.
- Data profile/fixture: fresh disposable desktop userData and Chrome profile under
  /tmp.
- Hardware: none.

### Reproduction

Desktop:

1. Create a sentinel pack file under a disposable
   userData/instrument-sample-packs/honky-tonk directory.
2. Run the same database reset and MIDI reset sequence used by the Electron handler.
3. The MIDI directory is recreated, but the sample-pack sentinel remains.

    {"samplePackFileExistsAfterDesktopReset":true,"midiDirectoryExistsAfterReset":true}

Web:

1. Start the built server against an isolated data directory and open it in a
   disposable Chrome profile.
2. Store an installed honky-tonk pack record in the production IndexedDB database.
3. Run the reset bridge request followed by the exact localStorage.clear side effect
   in SettingsScreen.
4. The IndexedDB record remains and webBridge still reports it installed.

    {"storedPackAfterReset":true,"statusAfterReset":true}

### Artifacts

- Desktop reset only clears database and MIDI storage:
  src/main/index.ts:336-342.
- Web pack assets are stored in IndexedDB:
  src/renderer/webBridge.ts:160-218.
- Web pack status reads that persistent store:
  src/renderer/webBridge.ts:417-430.
- Settings reset clears localStorage but not IndexedDB:
  src/renderer/components/SettingsScreen.tsx:1018-1030.
- Isolated reproduction commands/results: Phase 2 lane report, P2-DATA-002.

## Root Cause

Full reset owns SQLite, MIDI storage, and localStorage only. It has no coordinated
owner for the desktop instrument-sample-pack directory or the web IndexedDB pack
database.

## Recommended Remediation Boundary

Define the complete reset inventory in one runtime-neutral reset contract. Add a
desktop pack-directory reset and a web IndexedDB clear/delete operation, invoke both
from the confirmed user-data reset flow, and report any excluded data explicitly.
Do not alter normal per-pack removal semantics while fixing the full-reset boundary.

## Required Regression Proof

- Deterministic unit/integration proof: a full reset clears SQLite, MIDI, desktop
  sample-pack files, localStorage, and web IndexedDB pack records.
- Electron proof: disposable profile before/after filesystem inventory.
- Web proof: disposable browser profile before/after IndexedDB and status check.
- Data/recovery proof: a failed secondary reset step cannot falsely claim all data
  was deleted.
- Manual hardware/UI proof: confirmation copy and success/error state match the
  actual reset boundary.
- Broader regression command: npm test, npm run build, and npm run build:web.

## Challenge Record

- Independent reproduction attempt: desktop and web use different persistent stores
  and both retained the pack data in isolated profiles.
- Alternative explanations tested: localStorage is cleared correctly, but the pack
  store is IndexedDB and is not affected by that call.
- Scope/severity changes: none.
- Deduplication decision: canonical reset-lifecycle finding for sample-pack stores.

## Resolution

- Accepted rationale: exact runtime probes show persistent pack data after the
  product reports a successful full reset.
- Verified rationale: on 2026-10-21 the agent proof run showed that Delete User Data removes the installed packs on both runtimes (the Electron pack directory and the web IndexedDB database), together with every other store. The defect, packs left behind, is gone. The confirmation copy does not name everything it removes, and on the web it says "from this device" for server-side data; that gap is tracked as [PH-DATA-010](PH-DATA-010.md), not here.
- Fix branch/commit/issue: `d5839aa`, Phase 9 slice 11 ([Phase 9 report](../phase-9-remediation-2026-07-30.md)). This file said "accepted" until the Phase 11 consolidation reconciled it with the ledger on 2026-10-20.
- Verification evidence: Phase 9 added the pack-sentinel clear and IndexedDB object-URL cleanup tests. Phase 11: the `webBridge.test.ts` reset and pack-reset rollback tests pass ([re-verification](../phase-11-reverification-2026-10-19.md)). On the web, Delete User Data deletes the pack's IndexedDB database (WF-019, [lane F](../phase-11-lane-f-setup-settings-2026-10-19.md)). On the Linux desktop it removes `instrument-sample-packs/`, and the pack does not resolve after a relaunch (`reset-with-pack.mjs`, [Electron report](../phase-11-electron-runtime-2026-10-20.md)).
  - Agent proof run 2026-10-20: seeded a throwaway library on each runtime (3 songs uploaded through the UI, a folder, a playlist, a favorite, a tag, a game result with measure accuracy, a theory result, practice time, an unlocked achievement, a custom fingering, four settings, a `lumakeys-filter-presets` localStorage key, and the Flute pack installed through Settings > Audio). Then captured the Delete User Data copy and confirmed. Web: `dist/server/index.cjs` with Chromium 141.0.7390.37 (Playwright 1.56.1), plus a second browser context as another device on the same server. Electron: the existing `out/` build, Electron 30.5.1 (Chromium 124.0.6367.243), with a relaunch after the reset. Node v24.15.0.
    - Exact copy, identical on both runtimes. Settings card: `Removes songs, playlists, folders, results, achievements, and saved settings from this device.` Dialog: title `Delete all user data?`, body `This removes songs, playlists, folders, results, achievements, and saved settings from this device.`, buttons `Delete User Data` and `Cancel`. Success text: status `All user data was deleted. LumaKeys is back to defaults.`; toast `User data deleted` / `Songs, history, and saved settings were removed.`
    - Removed on both runtimes (before to after): songs 3 to 0 and their MIDI files; folders, playlists and playlist songs 1 to 0; game results, measure accuracy history (3), trouble spots (3) and user stats to 0; theory results, practice days (streak) and fingerings to 0; every settings row (9 on web, 10 on Electron, including the instrument, keyboard mapping and the installed-pack record); unlocked achievements 2 to 0 (the 7 rows are re-seeded locked); localStorage keys cleared; the setup guide shows again. Packs: on Electron the `instrument-sample-packs/` dir (10 files) is gone and `resolveInstrumentSampleSource('flute')` returns null, also after a relaunch; on the web the `lumakeys-instrument-sample-packs` IndexedDB database is deleted and the pack status is empty. `integrity_check` was `ok`. Electron's own Chromium files in userData (Cache, Local Storage, IndexedDB and so on) are not deleted, but they hold no LumaKeys keys after the reset.
    - Match: partial (now [PH-DATA-010](PH-DATA-010.md)). The copy names six things and all six are removed. It does not name the instrument sample packs, practice history and streak, fingerings or trouble spots, so the user is not told that downloaded packs go too (the toast says `history`). On the web the copy says `from this device`, but the data lives in the server's data dir: the second context loaded an empty library after the reset, while its own localStorage key stayed. So on the web the dialog understates the reach (every browser using that server) and a second browser keeps stale local state.
    - Related failure state (also in [PH-DATA-001](PH-DATA-001.md)): when the file cleanup fails after the database reset, a retry shows `User data deleted` while the old MIDI files remain in a hidden `.midi-files-reset-<id>` dir, so the success text is not true for that case.
    - Driver: `scripts/audit/browser/proof-data002-web.mjs` and `scripts/audit/electron/proof-data002-electron.mjs` (helpers `proof-data-common.mjs`, `proof-electron-harness.mjs`). Evidence: `/tmp/claude-1000/p11/PF/data/web002/` and `/tmp/claude-1000/p11/PF/data/el002/` (`run.out`, `before.json`, `after.json`, `dialog.json`, screenshots).
- Residual risk: a pack stored under the pre-rename IndexedDB name survives a web reset ([PH-DATA-004](PH-DATA-004.md)). The desktop proof ran on Linux only.
- Revisit trigger: before any privacy/reset guarantee or shared-device release claim.
