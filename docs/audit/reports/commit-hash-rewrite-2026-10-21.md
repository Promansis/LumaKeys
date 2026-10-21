# Commit Hash Rewrite, 2026-10-21

The five oldest commits that had not been pushed to GitHub, made between 2026-10-05 and
2026-10-19, recorded a personal author address. GitHub's email-privacy push protection
rejects them (GH007). At the owner's direction the author and committer address of those
five commits was changed to the owner's GitHub noreply address, and the address configured
for this repository was changed to match. Names, dates, messages and file contents are
unchanged: every rewritten commit has the same tree as the commit it replaces. Because each
commit records its parent, all 78 unpushed commits on `main` received new hashes.

Tracked files that cited an old hash were updated to the new one in the same change as this
note. Commit messages cannot be edited without another rewrite, so messages written before
2026-10-21 still cite old hashes; use the table below to translate them. The old history
remains only in local branches (`backup/pre-email-rewrite-2026-10-21`, the merged
`remediation/p11-*` branches and `feat/main-menu-video-background`). They must not be pushed,
and GitHub would reject them.

| Old | New | Subject |
|---|---|---|
| `99adf7c` | `4b2db33` | feat: support MSCZ uploads and fix imported song titles |
| `1fbd73f` | `a7c907a` | fix: stabilize Free Play and Soundboard pop-out interactions |
| `12ef6a7` | `1d5d46e` | feat: add looping neon video background to the main menu |
| `6e549b6` | `4466626` | fix: serve video with proper MIME types and byte-range support |
| `dfd0f7f` | `240089f` | docs(audit): plan Phase 11 delta re-audit with baseline, scripts, and templates |
| `a54e98b` | `96a04fb` | docs(audit): Phase 11 lane A, lane G, and re-verification evidence |
| `6ca051e` | `c0a7283` | docs(audit): Phase 11 lane F interim workflow evidence and four findings |
| `4119097` | `1bc0b96` | docs(audit): Phase 11 lane merges, Electron runtime run, and findings through PH-MUS-013 |
| `297cf1d` | `1642afb` | chore(audit): add Electron harness launcher and package manifest |
| `9aada3f` | `75b02a6` | docs(audit): Phase 11 matrix rows, statuses and sign-off; owner decision on PH-MUS-013 |
| `e03890f` | `8491188` | docs(audit): rewrite the Phase 11 owner test batch after the Electron runs |
| `f932af6` | `eea7af5` | docs(audit): document the headless Electron harness and every browser driver |
| `68a7638` | `fa403be` | docs(audit): Phase 11 progress at 2026-10-20 and the full report index |
| `81692e1` | `b91f078` | audit(phase-11): run agent items A1-A4 in headless Electron |
| `240e728` | `e4f9bb5` | audit(phase-11): prove PH-UI-001 and PH-DATA-002 on the desktop |
| `4f1e5ed` | `f127700` | audit(phase-11): verify PH-SEC-001 and reconcile 11 finding files |
| `abdca0d` | `428a08b` | audit(phase-11): consolidate findings and plan remediation slices |
| `9aa8fe7` | `c357a97` | audit(phase-11): record owner decisions 2 to 4 |
| `efdfceb` | `1d4abd8` | audit(phase-11): sittings 0, 1 (audio), 3 and 4 run by the agent (WIP) |
| `f8bacb1` | `b73787f` | docs(audit): record Phase 11 owner sittings run by the agent |
| `d28a028` | `d208ee2` | docs(audit): record the owner's live-site check (user tests A1) |
| `c384101` | `7196a34` | docs(audit): record Phase 11 agent proofs for fixed findings |
| `2334f8e` | `95a1240` | docs(audit): record the kept Windows build for sitting 2 |
| `5017b8e` | `7cf0c62` | docs(audit): record owner decision 5, slice 18 in wave 1 |
| `eeae17b` | `9f1e99c` | fix(desktop): open credit links in the system browser and block navigation away from the app |
| `7ec9182` | `9d3e1fa` | test: add proof-debt tests for PH-MUS-002, PH-UI-003 and PH-ARCH-001 |
| `a8875c5` | `561fe5c` | ci: add verify script and workflow, wire asset assertion into package scripts |
| `b900d2a` | `a331f96` | docs(adr): add ADR 0002 for the PianoHero legacy window and update ADR 0001 |
| `42592a6` | `4df7061` | docs(context): move architecture and runtime facts into CONTEXT.md |
| `4e7ca22` | `d8146be` | docs(audit): point CLAUDE.md citations at the tracked docs |
| `4708ad0` | `0890cf4` | fix(web): carry sample packs over from the pre-rename IndexedDB |
| `f3b1fb8` | `f282e8a` | fix(web): carry library filter presets over from the pre-rename key |
| `7bdd671` | `d885390` | docs(audit): record slice 15 resolutions for PH-DATA-004 and PH-DATA-007 |
| `8f42230` | `2457249` | fix(audio): start fresh profiles at the default audio levels |
| `476a551` | `7f42f1d` | docs: repair D1 review findings |
| `21d8cd5` | `5f3d4d4` | build(deps): upgrade Electron 30.5.1 to 44.9.2 and better-sqlite3 12.8.0 to 13.0.3 |
| `addf440` | `91f92fb` | docs: add the shipped-runtime triage step to the release notes and refresh the Electron driver setup |
| `be4fa13` | `0c55e9c` | fix(audio): treat an undefined stored audio value as missing |
| `7230d5a` | `7e3d8db` | docs(audit): record slice 0 resolution for PH-OPS-005 and the proof-debt findings |
| `c526de5` | `7d94c95` | fix(web): abort the pack copy on a failed put and test the failure path |
| `ec47dea` | `9e9e458` | refactor(web): keep the filter preset carry-over in one deletable file |
| `46487db` | `38dc6bc` | docs(audit): update slice 15 resolutions after review |
| `d0ec088` | `5d17709` | ci: run the workflow once per change, bump actions, heal the native module in verify |
| `b217e42` | `1a9ced1` | docs(audit): update slice 0 resolution wording for the workflow repair |
| `b6aaf47` | `07aa4f5` | fix(web): require an access gate, sign in by POST, add CSP |
| `aae47b5` | `3a110a0` | test(audit): check sign-in, CSP and startup gate in audit drivers |
| `3ee10c2` | `1a07b3b` | fix(desktop): find pre-rename profiles, finish interrupted moves, report startup failures |
| `34da002` | `c7410ab` | docs(audit): record slice 2 fixes for PH-OPS-002, PH-SEC-002, PH-SEC-003 |
| `bfde1f3` | `e4b0962` | docs(audit): record slice 1 resolution for PH-DATA-005, PH-DATA-006, PH-OPS-006 |
| `3d5d963` | `05f33cb` | fix(web): send unsigned browsers to /login and close review gaps |
| `ed31acb` | `3b344ca` | test(audit): follow the unsigned redirect to /login in csp-check |
| `abd1520` | `8f5e3be` | docs(audit): record slice 2 review repairs |
| `8bfbf9e` | `d0f5baf` | fix(web): no /login redirect from /login, free port in startup test |
| `4b72c98` | `ed07ce2` | Merge remediation/p11-s02-web-access |
| `c66b25a` | `d49b8a6` | Merge remediation/p11-s00-ci |
| `b1a4742` | `db86adc` | Merge remediation/p11-s18-audio-defaults |
| `44024d0` | `64a8160` | Merge remediation/p11-docs-governance |
| `66165f6` | `8bf28ef` | docs(audit): record slice 3 results in the PH-OPS-003 and PH-SEC-005 resolutions |
| `8c9e038` | `ffadc6f` | fix(persistence): guard left-over WAL attach and refuse while a database is open |
| `cabb613` | `43223d0` | fix(desktop): resolve installed sample packs from the current profile |
| `fd4cc87` | `3db6fa1` | chore(audit): stub the single-instance lock in the Electron audit launcher |
| `07e90da` | `1ba4b93` | docs(audit): record wave 1 merges of slices 2, 0, 18 and task D1 |
| `1e77cf6` | `356f896` | docs(audit): cite the slice 0 reviewer's Node 22 run in PH-OPS-005 |
| `330dbcd` | `2d63e9d` | test(audit): run the userdata probe P cases through the audit launcher |
| `cb39f4a` | `fc63fd0` | docs(audit): record slice 1 review repairs in the Resolutions |
| `f4efa2e` | `0962217` | test(theory): wait for the rendered stats, not only the calls, in TheoryHubScreen |
| `04f0ef9` | `a7517ae` | Merge remediation/p11-s00-ci: TheoryHubScreen flake fix |
| `71e3fcf` | `0e50a6f` | fix(desktop): reject file URLs on another host and pass the normalised URL to openExternal |
| `c380f95` | `be16229` | fix(persistence): ask for access to a read-only library; attach left-overs only from PianoHero |
| `da231a0` | `7d6439d` | docs(audit): record the slice 1 re-review follow-up in the Resolutions |
| `539e6f3` | `5a5c052` | docs: state the install-time node-gyp requirement of better-sqlite3 13 |
| `9e249ae` | `c95586b` | Merge remediation/p11-s01-desktop-migration: desktop profile migration (slice 1) |
| `7c9ec01` | `8d73767` | Merge remediation/p11-s15-browser-legacy: browser legacy carry-over (slice 15) |
| `ed40fa6` | `a84acb0` | Merge remediation/p11-s03-electron: Electron 44 and window-open guard (slice 3) |
| `a9828d8` | `cae4693` | docs(audit): record wave 1 merges of slices 1, 15 and 3 |
| `9e8ad9b` | `1b88b92` | docs(audit): record the post-merge Electron 44 proofs and the owner's Linux build |
| `5b101a2` | `af57d89` | docs(audit): verify PH-DATA-007 with a headless Electron carry-over run |
| `dd317eb` | `b38073f` | docs(audit): record G1, the deployed-image check and two new leads |
