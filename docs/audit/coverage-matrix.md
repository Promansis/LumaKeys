# Audit Coverage Matrix

This is the objective denominator for the audit, not a findings list. Phase 7
consolidation has assigned every row an acting owner and an evidence-backed
disposition or explicit gap. Add rows when discovery identifies another surface;
never delete a row to improve the completion percentage.

## Row Rules

Every row must eventually have an owner, evidence reference, disposition, and links
to any findings. Allowed statuses:

- `not started`: inventoried but no evidence collected.
- `in progress`: owner is collecting evidence.
- `covered`: required evidence exists and has a disposition.
- `gap`: evidence is incomplete; the missing proof and owner are recorded.
- `blocked`: an external or baseline dependency prevents reliable evidence.
- `waived`: explicitly excluded by the audit lead with rationale and revisit trigger.

`covered` does not mean defect-free. It means evidence exists and any defects link to
canonical finding IDs.

## User Workflows

| ID | Workflow and required path | Runtime | Owner | Evidence | Status | Findings/disposition |
|---|---|---|---|---|---|---|
| WF-001 | First run, setup completion, posture/hand-size choices | Both | Codex (acting) | [P1-WF](reports/phase-1-inventory-2026-07-11.md#p1-wf); [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#working-flows-confirmed) | gap | Fresh Chrome/Electron setup and skip path covered; posture control exhaustiveness remains a gap |
| WF-002 | MIDI device permission, select, disconnect, reconnect, fallback | Both | Codex (acting) | [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md#scoring-transport-and-input) | gap | PH-MUS-004; named hardware proof remains RT-011 gap |
| WF-003 | Computer-keyboard setup and mapping | Both | Codex (acting) | [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md#working-flows-confirmed); [P10](reports/phase-10-verification-2026-08-07.md) | gap | Mapping and durable-write regressions pass; physical keyboard and required zoom runtime proof remain |
| WF-004 | Import MIDI files, duplicates, invalid/corrupt/missing files | Both | Codex (acting) | [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md#midi-parsing-and-measure-oracles); [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | gap | Simple parsing covered; PH-MUS-002; PH-PAR-002 cancellation and PH-PAR-003 legacy storage parity; UI proof pending |
| WF-005 | Desktop folder import and progress/cancellation behavior | Electron | Codex (acting) | [P1-WF](reports/phase-1-inventory-2026-07-11.md#p1-wf) | gap | No Electron folder-import progress, invalid-entry, cancellation, or recovery execution was recorded; workflow verifier must run the isolated folder-import matrix |
| WF-006 | Reattach missing MIDI and recompute difficulty | Both | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | gap | PH-PAR-002 cancellation and PH-PAR-003 Electron-only legacy fallback; UI recovery proof pending |
| WF-007 | Browse, search, filter, edit, organize, and bulk-manage library | Both | Codex (acting) | [P1-WF](reports/phase-1-inventory-2026-07-11.md#p1-wf); [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#working-flows-confirmed) | gap | Fresh web MIDI upload, loaded library, and start-game path covered; organization/bulk state matrix remains a gap |
| WF-008 | Track assignment and start a song practice session | Both | Codex (acting) | [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md#fingering); [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#p4-par-003-supported-legacy-json-migration); [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#working-flows-confirmed); [P6-ARCH](reports/phase-6-architecture-operations-2026-07-12.md#architecture-findings) | gap | Fresh web upload starts a framed nonblank game canvas; PH-MUS-002/003 and PH-PAR-003 remain; PH-ARCH-001 covers prerequisite bridge failures |
| WF-009 | Gameplay play/pause/wait/loop/tempo/latency/input lifecycle | Both | Codex (acting) | [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md#scoring-transport-and-input); [P10](reports/phase-10-verification-2026-08-07.md) | gap | Focus/preflight/structural-control regressions pass; real MIDI/computer-keyboard, persisted result, and audio/latency proof remain |
| WF-010 | Finish, abandon, persist, view results, retry, next song | Both | Codex (acting) | [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md#learning-theory-and-result-handoff) | gap | Result handoff covered; duration contract and runtime/UI proof remain gaps |
| WF-011 | Lesson, generated drill, capstone, and progression | Both | Codex (acting) | [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md#learning-theory-and-result-handoff); [P10](reports/phase-10-verification-2026-08-07.md) | gap | Curriculum assets are present in fresh Linux package; complete capstone and failure/recovery screen proof remain |
| WF-012 | Theory quiz completion and result persistence | Both | Codex (acting) | [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md#learning-theory-and-result-handoff) | gap | Pure answer rules and handoff traced; interaction/runtime proof pending |
| WF-013 | Interval trainer completion and result persistence | Both | Codex (acting) | [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md#learning-theory-and-result-handoff) | gap | Pure answer rules and handoff traced; interaction/runtime proof pending |
| WF-014 | Scale practice completion and result persistence | Both | Codex (acting) | [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md#learning-theory-and-result-handoff) | gap | Pure answer rules and handoff traced; interaction/runtime proof pending |
| WF-015 | Free play, backing audio, recording, MIDI/WAV export | Both | Codex (acting) | [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md#evidence-gaps); [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#working-flows-confirmed) | gap | Chrome/Electron canvas render passes; PH-UI-001 modal focus and PH-UI-003 reduced motion fail; audible/export proof pending |
| WF-016 | Novelty soundboard input, audio, and visual feedback | Both | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#p4-par-001-fresh-electron-build-asset-check); [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#working-flows-confirmed) | gap | Web canvas/key map render passes; PH-UI-001/003 and PH-PAR-001 remain; audible proof pending |
| WF-017 | Progress, recommendations, goals, achievements, trouble spots | Both | Codex (acting) | [P1-WF](reports/phase-1-inventory-2026-07-11.md#p1-wf) | gap | No end-to-end default, empty, failure, or recovery evidence was recorded for progress, recommendations, goals, achievements, and trouble spots; workflow verifier owns the state matrix |
| WF-018 | Settings load/apply/save/reload/default/error behavior | Both | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition); [P10](reports/phase-10-verification-2026-08-07.md) | gap | Roving tabs, modal Escape/focus, and durable-write errors pass automated proof; browser/Electron zoom and restart read-back remain |
| WF-019 | Instrument sample pack install/select/remove/recovery | Both | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#p4-par-001-fresh-electron-build-asset-check); [P10](reports/phase-10-verification-2026-08-07.md) | gap | Pack assets and constrained removal tests pass; packaged install/remove and web IndexedDB recovery proof remain |
| WF-020 | Export backup, validate contents, restore, rollback/recovery | Both | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#p4-par-002-browser-picker-cancellation) | gap | Download/file target difference is explicit; PH-PAR-002 blocks browser import cancellation completion; recovery evidence pending |
| WF-021 | Reset learning progress with confirmation and recovery boundary | Both | Codex (acting) | [P1-WF](reports/phase-1-inventory-2026-07-11.md#p1-wf); [P10](reports/phase-10-verification-2026-08-07.md) | gap | Confirmation focus/Escape and no-mutation cancellation pass; complete runtime recovery execution remains |
| WF-022 | Reset all user data including files/browser-local state | Both | Codex (acting) | [P1-WF](reports/phase-1-inventory-2026-07-11.md#p1-wf); [P10](reports/phase-10-verification-2026-08-07.md) | gap | Full reset fault injection and SIGKILL recovery pass; user-driven Electron/web store inventory remains |
| WF-023 | App startup, shutdown, restart, and interrupted-operation recovery | Both | Codex (acting) | [P1-WF](reports/phase-1-inventory-2026-07-11.md#p1-wf); [P10](reports/phase-10-verification-2026-08-07.md) | gap | Linux package startup, Docker restart, and SIGKILL delete/reset/restore pass; Windows and full runtime interruption matrices remain |
| WF-024 | Contextual back/navigation from every screen and active session | Both | Codex (acting) | [P1-WF](reports/phase-1-inventory-2026-07-11.md#p1-wf); [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#p5-ui-001-modal-focus) | gap | PH-UI-001 leaks immersive-dialog focus and PH-UI-004 makes modal Escape invoke global back navigation |
| WF-025 | MuseScore `.mscz` upload, conversion, failure messaging, and busy-converter behavior | Web | Claude Code (acting) | [P11 plan](reports/phase-11-plan-2026-10-19.md#lane-a-web-security-and-deployment) | gap | New since Phase 10 (`99adf7c`); no runtime evidence; leads L-11-005, L-11-006 |
| WF-026 | Main-menu video background load, loop, reduced motion, and missing-asset fallback | Both | Claude Code (acting) | [P11 plan](reports/phase-11-plan-2026-10-19.md#lane-e-ui-accessibility-and-performance) | gap | New since Phase 10 (`12ef6a7`, `6e549b6`); reduced-motion proof owed under the PH-UI-003 oracle |

For each workflow, evidence must include the default path plus applicable loading,
empty, disabled, failure, retry/recovery, and destructive-confirmation paths.

## Supported Runtimes And UI Conditions

| ID | Surface | Owner | Evidence | Status | Findings/disposition |
|---|---|---|---|---|---|
| RT-001 | Electron desktop startup and core journey smoke | Codex (acting) | [P1-RT](reports/phase-1-inventory-2026-07-11.md#p1-rt); [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#runtime-and-failure-coverage) | covered | Isolated Xvfb renderer completed setup, main menu, and Free Play canvas smoke; hardware/audio gaps explicit |
| RT-002 | Self-hosted desktop web startup and core journey smoke | Codex (acting) | [P1-RT](reports/phase-1-inventory-2026-07-11.md#p1-rt); [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#runtime-and-failure-coverage) | covered | Built Chrome web runtime covered setup, main, library, gameplay, Free Play, Soundboard, and Settings |
| RT-003 | Supported minimum desktop window (`1180x780`) | Codex (acting) | [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#p5-rt-001-layout-conditions) | covered | Main menu screenshot has no horizontal overflow or offscreen controls |
| RT-004 | Default 1480x960 desktop layout | Codex (acting) | [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#desktop-and-canvas-evidence) | covered | Web and Electron core/canvas screens rendered at default desktop geometry |
| RT-005 | Confirmed large desktop window (`1920x1080`) | Codex (acting) | [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#p5-rt-001-layout-conditions) | covered | Chrome main menu had no horizontal overflow or offscreen controls |
| RT-006 | 125%, 150%, 175%, and 200% zoom | Codex (acting) | [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#p5-rt-001-layout-conditions); [P10](reports/phase-10-verification-2026-08-07.md) | gap | PH-UI-002 source/test fix passes; actual Electron/Chrome/Edge/Firefox hit-testing remains |
| RT-007 | 1x and available high-DPI canvas output | Codex (acting) | [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#p5-can-001-high-dpi-framing-and-pixels) | covered | Game, Free Play, and Soundboard have nonblank 2x buffers with framed content |
| RT-008 | Keyboard-only navigation and visible focus | Codex (acting) | [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#p5-ui-001-modal-focus); [P10](reports/phase-10-verification-2026-08-07.md) | gap | Modal focus/Escape regressions pass; runtime keyboard matrix at required zoom remains |
| RT-009 | Reduced-motion preference | Codex (acting) | [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#p5-ui-003-reduced-motion); [P10](reports/phase-10-verification-2026-08-07.md) | gap | Bounded canvas RAF tests pass; runtime pixel/RAF proof remains |
| RT-010 | Color-independent musical/result states | Codex (acting) | [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#evidence-gaps) | gap | Labeled notes and alternate palette source paths exist; calibrated color-vision/result review remains required |
| RT-011 | MIDI hardware lifecycle on available devices | Codex (acting) | [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md#evidence-gaps) | gap | PH-MUS-004 deterministic disconnect proof; named-device permission/reconnect evidence required |
| RT-012 | Autoplaying video under reduced motion, throttled bandwidth, and the packaged Electron asset path | Claude Code (acting) | [P11 plan](reports/phase-11-plan-2026-10-19.md#lane-e-ui-accessibility-and-performance) | gap | New surface; pair with RT-009 and PH-PAR-001 asset policy |

Mobile viewports are deliberately absent under ADR 0001.

## Durable Entities And Stores

| ID | Entity/store | Owner | Integrity and lifecycle evidence | Status | Findings/disposition |
|---|---|---|---|---|---|
| DATA-001 | Songs metadata | Codex (acting) | [P2-DATA](reports/phase-2-runtime-data-security-2026-07-11.md#durable-entity-disposition) | covered | PH-DATA-001 for cross-store import/delete/reset paths |
| DATA-002 | Imported MIDI bytes and storage references | Codex (acting) | [P2-DATA](reports/phase-2-runtime-data-security-2026-07-11.md#durable-entity-disposition); [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#p4-par-003-supported-legacy-json-migration) | covered | PH-DATA-001; PH-DATA-003; PH-PAR-003 legacy external-path mismatch |
| DATA-003 | User stats | Codex (acting) | [P2-DATA](reports/phase-2-runtime-data-security-2026-07-11.md#durable-entity-disposition) | covered | SQLite lifecycle covered |
| DATA-004 | Game results and measure accuracy | Codex (acting) | [P2-DATA](reports/phase-2-runtime-data-security-2026-07-11.md#durable-entity-disposition); [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md#midi-parsing-and-measure-oracles) | covered | SQLite lifecycle covered; PH-MUS-002 affects measure semantics |
| DATA-005 | Theory results | Codex (acting) | [P2-DATA](reports/phase-2-runtime-data-security-2026-07-11.md#durable-entity-disposition) | covered | SQLite lifecycle covered |
| DATA-006 | Settings registry and persisted values | Codex (acting) | [P2-DATA](reports/phase-2-runtime-data-security-2026-07-11.md#durable-entity-disposition) | covered | SQLite lifecycle covered |
| DATA-007 | Custom fingerings | Codex (acting) | [P2-DATA](reports/phase-2-runtime-data-security-2026-07-11.md#durable-entity-disposition); [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md#fingering) | covered | SQLite lifecycle covered; PH-MUS-003 affects source-note identity |
| DATA-008 | Folders and song membership | Codex (acting) | [P2-DATA](reports/phase-2-runtime-data-security-2026-07-11.md#durable-entity-disposition) | covered | SQLite lifecycle covered |
| DATA-009 | Playlists and ordered membership | Codex (acting) | [P2-DATA](reports/phase-2-runtime-data-security-2026-07-11.md#durable-entity-disposition) | covered | SQLite lifecycle covered |
| DATA-010 | Practice days and streak derivation | Codex (acting) | [P2-DATA](reports/phase-2-runtime-data-security-2026-07-11.md#durable-entity-disposition) | covered | SQLite lifecycle covered |
| DATA-011 | Achievements and unlock timestamps | Codex (acting) | [P2-DATA](reports/phase-2-runtime-data-security-2026-07-11.md#durable-entity-disposition) | covered | SQLite lifecycle covered |
| DATA-012 | Trouble spots and history | Codex (acting) | [P2-DATA](reports/phase-2-runtime-data-security-2026-07-11.md#durable-entity-disposition); [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md#midi-parsing-and-measure-oracles) | covered | SQLite lifecycle covered; PH-MUS-002 affects measure targeting |
| DATA-013 | Library backup versions and embedded MIDI | Codex (acting) | [P2-DATA](reports/phase-2-runtime-data-security-2026-07-11.md#durable-entity-disposition) | covered | PH-DATA-001; PH-DATA-003 |
| DATA-014 | Instrument sample-pack files/metadata | Codex (acting) | [P2-DATA](reports/phase-2-runtime-data-security-2026-07-11.md#durable-entity-disposition) | covered | PH-SEC-001; PH-DATA-002 |
| DATA-015 | Web IndexedDB sample assets | Codex (acting) | [P2-DATA](reports/phase-2-runtime-data-security-2026-07-11.md#durable-entity-disposition) | covered | PH-DATA-002 |
| DATA-016 | Browser localStorage/transient persisted preferences | Codex (acting) | [P2-DATA](reports/phase-2-runtime-data-security-2026-07-11.md#durable-entity-disposition) | covered | localStorage clears; IndexedDB reset gap is PH-DATA-002 |
| DATA-017 | Legacy PianoHero data-directory, environment, and database-name fallback | Claude Code (acting) | [P11 plan](reports/phase-11-plan-2026-10-19.md#lane-b-persistence-and-durability) | gap | One-release fallback (`090658e`); sibling-directory containment and removal date owed |

Each entity requires creation, read-back, update if applicable, deletion/reset,
backup/restore inclusion or explicit exclusion, corrupted/missing input, transaction or
partial-failure behavior, and runtime parity evidence.

## AppBridge Contract

Source inventory: `src/shared/bridgeMethods.ts`. `rpc`, `web-special`, and `web-stub`
are current implementation categories, not parity judgments.

| ID | Method | Web category | Owner | Evidence | Status | Findings/disposition |
|---|---|---|---|---|---|---|
| BR-001 | `pickMidiFile` | web-stub | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Intentional web stub; GameScreen hides temporary MIDI picker |
| BR-002 | `getAllSongs` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome; web validation is intentionally stricter |
| BR-003 | `getSong` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome; web validation is intentionally stricter |
| BR-004 | `addSong` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome; web derives app-owned path |
| BR-005 | `updateSong` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome; web validation is intentionally stricter |
| BR-006 | `deleteSong` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid outcome; PH-DATA-001 cross-store failure remains |
| BR-007 | `toggleFavorite` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-008 | `importMidiFiles` | web-special | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same normal import result/progress; PH-PAR-002 cancellation |
| BR-009 | `importMidiFolder` | web-stub | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Intentional web stub; LibraryScreen hides folder import |
| BR-010 | `reattachMidiFile` | web-special | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same normal reattach result; PH-PAR-002 cancellation |
| BR-011 | `recomputeAllSongDifficulties` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same app-owned path outcome; PH-PAR-003 legacy fallback mismatch |
| BR-012 | `onImportProgress` | web-special | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Compatible subscription shape; PH-PAR-002 prevents cancellation completion |
| BR-013 | `saveGameResult` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-014 | `getGameResults` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-015 | `getUserStats` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition); [P6-ARCH](reports/phase-6-architecture-operations-2026-07-12.md#architecture-findings) | covered | Same valid RPC/database outcome; rejected preflight is PH-ARCH-001 |
| BR-016 | `saveTheoryResult` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-017 | `getTheoryResults` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-018 | `getTheoryStats` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-019 | `getPracticeDays` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-020 | `recordPracticeTime` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-021 | `getPracticeStreak` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-022 | `getAllAchievements` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-023 | `unlockAchievement` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-024 | `getTroubleSpots` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-025 | `updateTroubleSpot` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-026 | `getMeasureAccuracyHistory` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-027 | `getRecommendations` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-028 | `getProgressStats` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-029 | `getProgressTopSongs` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-030 | `getAllUnresolvedTroubleSpots` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-031 | `getLibrarySnapshot` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-032 | `getCustomFingerings` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition); [P6-ARCH](reports/phase-6-architecture-operations-2026-07-12.md#architecture-findings) | covered | Same valid outcome; PH-MUS-003 persisted identity defect; rejected preflight is PH-ARCH-001 |
| BR-033 | `saveCustomFingering` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid outcome; PH-MUS-003 persisted identity defect |
| BR-034 | `clearCustomFingerings` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid outcome; PH-MUS-003 persisted identity defect |
| BR-035 | `getAllFolders` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-036 | `createFolder` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-037 | `renameFolder` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-038 | `deleteFolder` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-039 | `moveSongToFolder` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid outcome; web rejects unknown folder before dispatch |
| BR-040 | `getAllPlaylists` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-041 | `createPlaylist` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-042 | `updatePlaylist` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-043 | `deletePlaylist` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-044 | `getPlaylistSongs` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-045 | `addSongToPlaylist` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-046 | `removeSongFromPlaylist` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-047 | `reorderPlaylistSong` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-048 | `bulkDeleteSongs` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid outcome; PH-DATA-001 cross-store failure remains |
| BR-049 | `bulkMoveSongsToFolder` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid outcome; web validates destination folder |
| BR-050 | `bulkAddTag` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-051 | `bulkRemoveTag` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-052 | `bulkAddToPlaylist` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-053 | `getSetting` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition); [P6-ARCH](reports/phase-6-architecture-operations-2026-07-12.md#architecture-findings) | covered | Same valid RPC/database outcome; rejected GameScreen preflight is PH-ARCH-001 |
| BR-054 | `setSetting` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition); [P6-ARCH](reports/phase-6-architecture-operations-2026-07-12.md#architecture-findings) | covered | Same valid RPC/database outcome; renderer failure outcome is PH-ARCH-002 |
| BR-055 | `resetLearningProgress` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid RPC/database outcome |
| BR-056 | `resetUserData` | rpc | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same valid outcome; PH-DATA-001 and PH-DATA-002 remain |
| BR-057 | `exportLibrary` | web-special | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Intentional file-save versus browser-download target DTO |
| BR-058 | `importLibrary` | web-special | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same normal import; PH-PAR-002, PH-DATA-001, PH-DATA-003 |
| BR-059 | `loadMidiFileData` | web-special | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same app-owned read; PH-PAR-003 legacy fallback mismatch |
| BR-060 | `loadCurriculumMidi` | web-special | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | PH-PAR-001 Electron output omits required curriculum assets |
| BR-061 | `saveMidiFile` | web-stub | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Intentional web stub; FreePlayScreen hides export control |
| BR-062 | `saveWavFile` | web-stub | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Intentional web stub; FreePlayScreen hides export control |
| BR-063 | `pickAudioFile` | web-stub | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Intentional web stub; FreePlayScreen hides backing-track control |
| BR-064 | `pickSampleDirectory` | web-stub | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Intentional web stub; SettingsScreen gives desktop-only notice |
| BR-065 | `listAudioFiles` | web-special | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Intentional web empty result; consumers are runtime-gated |
| BR-066 | `getInstrumentSamplePackStatuses` | web-special | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same status DTO over runtime-specific stores; PH-DATA-002 remains |
| BR-067 | `installInstrumentSamplePack` | web-special | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same managed-pack intent; PH-PAR-001 Electron assets absent |
| BR-068 | `removeInstrumentSamplePack` | web-special | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Same status outcome; PH-SEC-001 and PH-DATA-002 remain |
| BR-069 | `resolveInstrumentSampleSource` | web-special | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Compatible resolved-source DTO over runtime-specific URL forms |

For each method compare input validation, return/error shape, side effects, cancellation
or progress behavior, authorization/trust boundary, and user-visible result in both
runtimes. A web stub needs explicit product/UI behavior and tests.

## Privileged And Destructive Operations

| ID | Operation | Runtime | Owner | Evidence | Status | Findings/disposition |
|---|---|---|---|---|---|---|
| OP-001 | MIDI file/folder selection and upload | Both | Codex (acting) | [P2-OP](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed); [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#p4-par-002-browser-picker-cancellation) | covered | Upload/storage controls covered; PH-PAR-002 browser cancellation |
| OP-002 | MIDI read, write, reattach, recompute, and delete | Both | Codex (acting) | [P2-OP](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed); [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#p4-par-003-supported-legacy-json-migration) | covered | PH-DATA-001; PH-DATA-003; PH-PAR-003 legacy load/recompute mismatch |
| OP-003 | Audio file/directory selection and listing | Both | Codex (acting) | [P2-OP](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed) | covered | PH-SEC-001 covers unattenuated desktop filesystem capability |
| OP-004 | MIDI/WAV export or browser download | Both | Codex (acting) | [P2-OP](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed); [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Intentional desktop-only file export is hidden in web UI; broader UI evidence remains Phase 5 work |
| OP-005 | Library backup export/import | Both | Codex (acting) | [P2-OP](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed); [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#p4-par-002-browser-picker-cancellation) | covered | PH-DATA-001; PH-DATA-003; PH-PAR-002 browser import cancellation |
| OP-006 | Sample-pack download/install/remove/resolve | Both | Codex (acting) | [P2-OP](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed); [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#p4-par-001-fresh-electron-build-asset-check) | covered | PH-SEC-001; PH-DATA-002; PH-PAR-001 Electron managed assets absent; interruption gap recorded |
| OP-007 | Song, folder, playlist, fingering, and bulk deletion | Both | Codex (acting) | [P2-OP](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed) | covered | PH-DATA-001 |
| OP-008 | Learning-progress reset | Both | Codex (acting) | [P2-OP](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed) | covered | SQLite reset boundary covered |
| OP-009 | Full user-data and file reset | Both | Codex (acting) | [P2-OP](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed) | covered | PH-DATA-001; PH-DATA-002 |
| OP-010 | Web RPC dispatch and argument validation | Web | Codex (acting) | [P2-OP](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed); [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition) | covered | Allowlist/validation and Phase 4 valid-call parity recorded; stricter web malformed-input handling is deliberate |
| OP-011 | Multipart upload and backup body limits | Web | Codex (acting) | [P2-OP](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed); [P10](reports/phase-10-verification-2026-08-07.md) | covered | BASE-SEC-001 resolved; fixed Hono versions, unknown-length stream 413/non-mutation, and zero production advisories pass |
| OP-012 | Static/data path containment and traversal resistance | Web | Codex (acting) | [P2-OP](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed) | covered | Literal and encoded traversal probes returned 404 |
| OP-013 | Electron IPC exposure and context isolation | Electron | Codex (acting) | [P2-OP](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed) | covered | PH-SEC-001 |
| OP-014 | Deployment access, cookie/CSRF assumptions, rate limits | Web | Codex (acting) | [P2-OP](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed); [P10](reports/phase-10-verification-2026-08-07.md) | covered | Access gate remains explicit; PH-OPS-001 verified with context/image and `/data` restart proof |
| OP-015 | Database initialization, migration, transaction, and rollback | Both | Codex (acting) | [P2-OP](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed) | covered | WAL/foreign keys/migration covered; PH-DATA-001 |
| OP-016 | Static file serving: MIME, byte-range, cache headers, and containment prefix check | Web | Claude Code (acting) | [P11 plan](reports/phase-11-plan-2026-10-19.md#lane-a-web-security-and-deployment); [P11 probe](../audit/evidence/phase-11-web-probe-2026-10-19.md) | gap | `staticFiles.ts` new (`6e549b6`); traversal and range probes pass; leads L-11-003, L-11-004 |
| OP-017 | MuseScore conversion subprocess isolation, limits, cleanup, and concurrency | Web | Claude Code (acting) | [P11 plan](reports/phase-11-plan-2026-10-19.md#lane-a-web-security-and-deployment) | gap | `museScore.ts` new (`99adf7c`); prlimit/timeout/tmpdir present; leads L-11-005, L-11-006 |
| OP-018 | Access-token transport (header, query string, cookie) and comparison | Web | Claude Code (acting) | [P11 plan](reports/phase-11-plan-2026-10-19.md#lane-a-web-security-and-deployment); [P11 probe](../audit/evidence/phase-11-web-probe-2026-10-19.md) | gap | Leads L-11-001 (query-string transport), L-11-002 (comparison); cookie flags pass |

## High-Risk Modules And Operations Surfaces

| ID | Surface | Investigation question | Owner | Evidence | Status | Findings/disposition |
|---|---|---|---|---|---|---|
| MOD-001 | `src/persistence/database.ts` | Are data invariants, migrations, transactions, and resets safe? | Codex (acting) | [P2-MOD](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed); [P6-MOD](reports/phase-6-architecture-operations-2026-07-12.md#working-architecture-and-operations) | covered | Phase 2 data evidence and PH-DATA-001 remain canonical; no size-only refactor recommendation |
| MOD-002 | `src/renderer/App.tsx` | Is orchestration correct, recoverable, and testable? | Codex (acting) | [P1-MOD](reports/phase-1-inventory-2026-07-11.md#p1-mod); [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#p5-ui-004-confirmation-escape); [P6-MOD](reports/phase-6-architecture-operations-2026-07-12.md#working-architecture-and-operations) | covered | PH-UI-004 global Escape dispatch; PH-ARCH-002 exposes split durable-setting ownership |
| MOD-003 | `src/renderer/components/GameScreen.tsx` | Are practice lifecycle and service cleanup correct? | Codex (acting) | [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md#scoring-transport-and-input); [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#p5-ui-001-modal-focus); [P6-MOD](reports/phase-6-architecture-operations-2026-07-12.md#working-architecture-and-operations) | covered | PH-MUS-001/003/004, PH-UI-001, and PH-ARCH-001 cover observed lifecycle/recovery gaps |
| MOD-004 | `src/renderer/components/LibraryScreen.tsx` | Are library workflows and runtime paths consistent? | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#p4-par-002-browser-picker-cancellation); [P6-MOD](reports/phase-6-architecture-operations-2026-07-12.md#working-architecture-and-operations) | covered | Request identity prevents stale refreshes; PH-PAR-002 remains the browser cancellation root |
| MOD-005 | `src/renderer/components/SettingsScreen.tsx` | Do settings have canonical load/apply/save/reset behavior? | Codex (acting) | [P1-MOD](reports/phase-1-inventory-2026-07-11.md#p1-mod); [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#p5-ui-004-confirmation-escape); [P6-MOD](reports/phase-6-architecture-operations-2026-07-12.md#working-architecture-and-operations) | covered | PH-UI-002/004 remain; PH-ARCH-002 shows SettingsScreen is not the canonical durable-write owner |
| MOD-006 | `src/renderer/components/FreePlayCanvasScene.tsx` | Is rendering visible, correct, performant, and cleaned up? | Codex (acting) | [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#p5-can-001-high-dpi-framing-and-pixels); [P6-MOD](reports/phase-6-architecture-operations-2026-07-12.md#working-architecture-and-operations) | covered | One animation-loop cleanup and Phase 5 DPI proof pass; PH-UI-003 remains reduced-motion root |
| MOD-007 | `src/renderer/styles.css` | Which page/shared owners exist and where is knowledge duplicated? | Codex (acting) | [P5-UI](reports/phase-5-ui-accessibility-performance-2026-07-12.md#p5-rt-001-layout-conditions); [P6-MOD](reports/phase-6-architecture-operations-2026-07-12.md#working-architecture-and-operations) | covered | PH-UI-002 owns the observed zoom failure; no size-only CSS refactor recommendation |
| MOD-008 | `src/main/index.ts` and `preload.ts` | Is the Electron trust boundary minimal and validated? | Codex (acting) | [P2-MOD](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed); [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#p4-par-003-supported-legacy-json-migration); [P6-MOD](reports/phase-6-architecture-operations-2026-07-12.md#working-architecture-and-operations) | covered | Context isolation/typed bridge hold; PH-SEC-001 and PH-PAR-003 remain canonical |
| MOD-009 | `src/renderer/webBridge.ts` | Are browser capabilities, stubs, and failures explicit? | Codex (acting) | [P2-MOD](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed); [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#method-by-method-disposition); [P6-MOD](reports/phase-6-architecture-operations-2026-07-12.md#working-architecture-and-operations) | covered | PH-DATA-002, PH-PAR-002, and PH-PAR-003 remain canonical runtime behavior gaps |
| MOD-010 | `src/server/*` | Are routes, dispatch, uploads, static files, and access safe? | Codex (acting) | [P2-MOD](reports/phase-2-runtime-data-security-2026-07-11.md#working-flows-confirmed); [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#p4-par-003-supported-legacy-json-migration); [P6-MOD](reports/phase-6-architecture-operations-2026-07-12.md#working-architecture-and-operations) | covered | Adapter injection and route validation hold; PH-DATA-001, BASE-SEC-001, and PH-PAR-003 remain canonical |
| MOD-011 | `src/lib/game/*`, `midi/*`, `audio/*`, `input/*` | Are musical rules deterministic and runtime lifecycle correct? | Codex (acting) | [P3-MUS](reports/phase-3-music-practice-correctness-2026-07-11.md); [P6-MOD](reports/phase-6-architecture-operations-2026-07-12.md#working-architecture-and-operations) | covered | PH-MUS-001 through PH-MUS-004 remain; audio/hardware evidence gaps remain explicit |
| MOD-012 | Build, Docker, packaging, native modules | Are builds reproducible and recovery/logging sufficient? | Codex (acting) | [P4-PAR](reports/phase-4-runtime-parity-2026-07-12.md#p4-par-001-fresh-electron-build-asset-check); [P6-MOD](reports/phase-6-architecture-operations-2026-07-12.md#working-architecture-and-operations) | covered | Native guard/builds pass; PH-PAR-001 remains and PH-OPS-001 covers Docker build-context confidentiality |
| MOD-013 | `src/server/staticFiles.ts` and `src/server/museScore.ts` | Are the new web surfaces contained, bounded, cleaned up, and covered by tests? | Claude Code (acting) | [P11 plan](reports/phase-11-plan-2026-10-19.md#lane-a-web-security-and-deployment) | gap | New modules; unit tests exist; integration test for MuseScore is skipped outside Docker |
| MOD-014 | Electron shell hardening in `src/main/index.ts` | Is `sandbox` explicit, is a CSP applied, and are navigation and `window.open` guarded? | Claude Code (acting) | [P11 plan](reports/phase-11-plan-2026-10-19.md#lane-d-runtime-parity-electron-vs-web) | gap | Lead L-11-008; file modified since Phase 10 without a touched test |

Module size is not a finding. Record a finding only when evidence identifies a
behavioral risk, ownership violation, duplicated rule, untestable boundary, or
measurable cost.

## Lane Completion Summary

Update counts from the tables; do not estimate.

| Lane/dimension | Total | Covered | Gap/blocked | Open findings | Owner sign-off |
|---|---:|---:|---:|---:|---|
| User workflows | 26 | 0 | 26 | 9 | Phase 11 pending (WF-025/026 added 2026-10-19; all 24 prior workflows remain explicit gaps) |
| Runtime/UI conditions | 12 | 6 | 6 | 3 | Phase 11 pending (RT-012 added 2026-10-19; RT-006/008/009/010/011 remain gaps) |
| Durable entities/stores | 17 | 16 | 1 | 7 | Phase 11 pending (DATA-017 legacy fallback added 2026-10-19) |
| AppBridge methods | 69 | 69 | 0 | 10 | Phase 11 pending (contract unchanged since Phase 10; parity re-verification owed) |
| Privileged/destructive operations | 18 | 15 | 3 | 9 | Phase 11 pending (OP-016/017/018 added 2026-10-19 for new web surfaces) |
| High-risk modules/operations | 14 | 12 | 2 | 16 | Phase 11 pending (MOD-013/014 added 2026-10-19) |

Counts are produced by `node scripts/audit/recount-coverage.mjs` (`--check` fails when
stale, `--write` rewrites the rows). "Open findings" is the number of distinct
`PH-`/`BASE-` IDs referenced by the section's rows; the ledger owns each ID's status.
Earlier hand-counted values used a looser rule, which is why the 2026-10-19 recount
lowered some numbers without any row changing.
