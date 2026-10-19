# Phase 11 Re-Verification Of Fixed Findings

One consolidated record for the 18 findings the Phase 10 report left `fixed` or
`verified`, following the fields of `templates/reverification-record.md`. The
ledger status of each ID is unchanged unless the Conclusion column says otherwise.

- Baseline that proved the fixes: `0bd40f5` (2026-08-07)
- New baseline under test: `main` at source identity `6e549b6` (2026-10-19)
- Re-verifier: Claude Code (acting); not the implementer of any Phase 9 fix
- Date: 2026-10-19
- Delta source: [delta inventory](../evidence/phase-11-delta-inventory-2026-10-19.md)

## Automated Proof Run

Command: `npx vitest run` over the 19 test files the Phase 9 report names as proof,
plus `node scripts/assert-electron-assets.mjs`. Result: 19 files, 143 tests passed;
asset inventory passed with 649 public files in `out/renderer`. Full-suite baseline:
365 passed, 1 skipped. No test file was deleted between the two baselines
(`git diff --numstat 0bd40f5..HEAD -- '*.test.*'` shows additions only).

## Per-Finding Record

| Finding | What changed near the fix | Automated proof on new baseline | Owed runtime proof (from Phase 10) | Conclusion |
|---|---|---|---|---|
| PH-SEC-001 | `instrumentSamplePackStore.test.ts` modified (rename) | `instrumentSamplePackStore.test.ts`: traversal rejection, valid remove, save-failure rollback pass; `storageSafety.test.ts` rejects traversal, absolute, and sibling-prefix paths | Electron bridge sentinel; web IndexedDB runtime | holds; runtime proof still owed (sitting 1) |
| PH-DATA-001 | `database.ts`, `crossStoreMutations.test.ts`, `midiStorage.test.ts` modified; data dir and DB name renamed | `crossStoreMutations.test.ts`: delete failure keeps row and bytes, reset failure restores MIDI, prepared delete recovers after reopen; `midiStorage.test.ts` pass | Electron/web UI retry; full library integrity matrix | holds; UI matrix owed (lane F) |
| PH-DATA-002 | `webBridge.ts` modified (pickFiles simplification) | `webBridge.test.ts` reset clears localStorage and calls `resetUserData`; pack reset rollback test passes | user-driven store inventory | holds; inventory owed (lane F) |
| PH-DATA-003 | `libraryBackup.test.ts` modified | six backup tests pass including content-id mismatch and crafted path rejection | recovery evidence | holds |
| PH-MUS-001 | `GameScreen.tsx`, `GameSession.test.ts` modified | "preserves judged state when tempo or display configuration changes"; "requires confirmation before structural controls restart a judged run" pass | real MIDI/computer-keyboard completion; persisted history | holds; sittings 1 and 4 |
| PH-MUS-002 | `types.ts` modified without a touched test | `midiFileParser.test.ts` "preserves MIDI meter and does not create a terminal phantom measure"; `songUtils.test.ts` "uses parsed measure boundaries for scoring and loops" pass | 6/8 and changing-meter cross-runtime import; musician proof | holds; the parser test covers one meter fixture only, so a 6/8 and a meter-change fixture remain a proof gap (lane C, L-11-017) |
| PH-MUS-003 | `GameScreen.tsx` modified | `GameSession.test.ts` "applies stable fingering overrides after a loop filters the schedule"; `database.test.ts` "stores stable fingering identities alongside ambiguous legacy rows" pass | runtime fingering identity | holds |
| PH-MUS-004 | none near | `midiInputService.test.ts` "releases held notes before reporting a disconnected device"; `GameSession.test.ts` source-disconnect release pass | physical disconnect/reconnect | holds; sitting 4 |
| PH-PAR-001 | new video asset; `packaging/`, `electron.vite.config.ts` in delta | `assert-electron-assets.mjs` passes (649 files, video `.webm` present in `out/renderer/assets/main-menu`) | capstone/managed-pack workflow; missing-asset recovery | holds; note: the assertion is not wired into any npm script, so it runs only when someone remembers (lane G) |
| PH-PAR-002 | `webBridge.ts` modified: commit `99adf7c` removed the focus-based fallback timer (corrected 2026-10-19 by lane D; earlier text named `1fbd73f`), so cancellation now relies solely on the input `cancel` event | `webBridge.test.ts` MIDI and JSON picker cancellation, "waits for native cancellation instead of treating window focus as cancellation", retry pass | real-browser cancellation | holds for browsers that fire `cancel` (Chrome 113+, Firefox 91+, Safari 16.4+); on older browsers the original pending-promise behavior returns; lane F should confirm in Edge and Firefox (sitting 3) |
| PH-PAR-003 | `legacyBrandMigration.ts` new; `database.ts` modified | `databaseMigration.test.ts` four migration/repair tests pass; `legacyBrandMigration.test.ts` nine tests pass | migration in both runtimes | holds; DATA-017 adds the brand fallback as a new row |
| PH-UI-001 | `FreePlayScreen.tsx`, `NoveltySoundboardScreen.tsx`, `ImmersiveHud.tsx` modified | `SettingsScreen.test.tsx` "keeps keyboard focus inside confirmation dialogs"; Free Play and Soundboard Escape/overlay tests pass | keyboard matrix at zoom | holds; sitting 1 |
| PH-UI-002 | `styles.css` modified | `.settings-tab-row { min-height: 46px }` still present; `SettingsScreen.test.tsx` tab tests pass | 125 to 200 percent hit-testing | holds in source; the Phase 9 "tablist client height" assertion is not in the suite, so automated proof is weaker than reported (proof gap) |
| PH-UI-003 | new autoplaying video | `usePrefersReducedMotion` still used by `FreePlayCanvasScene.tsx` and `AnimalSoundboardCanvas.tsx`; `MainMenuScreen.test.tsx` has a reduced-motion case | runtime pixel/RAF proof | holds in source; no test references the hook for the two canvases, so the Phase 9 "RAF/media-query" proof is a gap; video covered by WF-026 |
| PH-UI-004 | `App.tsx` modified | `SettingsScreen.test.tsx` "cancels confirmation dialogs with Escape"; `App.test.tsx` "lets free play own Escape" pass | modal Escape runtime | holds |
| PH-ARCH-001 | `App.tsx`, `GameScreen.tsx` modified | `GameScreen.test.tsx` has four tests, none exercising a rejected prerequisite with the Retry/Back recovery UI | prerequisite-failure recovery | holds in source (single try block still present); automated proof named by Phase 9 is not in the suite (proof gap, lane D) |
| PH-ARCH-002 | `SettingsScreen.test.tsx` modified | `saveSetting.test.ts` both cases; `KeyboardSetupScreen.test.tsx` rejected-binding read-back; GameScreen session-only fingering pass | restart read-back | holds |
| PH-OPS-001 | `Dockerfile`, `.dockerignore` modified (MuseScore stage) | `.dockerignore` still excludes data dirs, `.env*`, databases; `Dockerfile` `COPY` scope unchanged and narrow; `docker compose config` resolves | synthetic context check on new image | holds in source; image build owed (sitting 0 item 2 builds it) |

## Proof Gaps Found By Re-Verification

These do not reopen any finding: the fixes are present in source and the broader
suites pass. They are recorded so the next remediation slice adds the missing
deterministic proof.

| Finding | Missing proof | Suggested test |
|---|---|---|
| PH-MUS-002 | 6/8 and meter-change fixtures | parser test with a two-meter MIDI fixture asserting measure boundaries |
| PH-UI-002 | tab-row height assertion | jsdom cannot measure layout; keep as runtime proof in sitting 1 and drop the claim of an automated assertion |
| PH-UI-003 | reduced-motion RAF proof for the two canvases | mock `matchMedia` to `reduce` and assert no decorative RAF is scheduled |
| PH-ARCH-001 | rejected prerequisite renders Retry/Back | GameScreen test with `getSong` rejected, asserting the recovery UI |
| PH-PAR-001 | asset assertion not enforced | wire `scripts/assert-electron-assets.mjs` into `package:*` scripts |

## Conclusion

- Fixes still hold on the new baseline: all 18, yes.
- Ledger action: none reopened; none promoted (runtime proof still owed as listed).
- Residual proof still owed: user batch sittings 0, 1, and 4; lane F workflow matrix; the five proof gaps above.
- Re-verifier sign-off and date: Claude Code (acting), 2026-10-19
