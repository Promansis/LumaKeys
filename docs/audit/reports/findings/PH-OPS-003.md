# PH-OPS-003: Shipped desktop runtime Electron 30.5.1 is past end of life

- Lane: OPS
- Severity: P2
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: Electron
- Coverage rows: MOD-012, MOD-008, OP-013
- Related/duplicate findings: PH-SEC-005 (window-open policy is the same hardening area)
- First observed against: `main` at source identity `6e549b6`, Phase 11 baseline 2026-10-19

## User Impact

Every desktop user runs a Chromium and Node embedded in Electron 30, which left
Electron's three-version support window in 2024 and receives no security patches.
`npm audit` lists 37 high advisories against the installed version, including
context-isolation bypass, `contextBridge` prototype handling, protocol-handler
cross-origin reads, and renderer switch injection. The app mitigates most vectors by
loading only its own `file://` bundle with context isolation and no node integration,
and the only remote content path is PH-SEC-005. Impact today is latent: any future
remote content, a malicious MIDI or backup that triggers a Chromium bug, or a
dependency that opens a window lands on an unpatched engine. Recovery after an
incident is a full reinstall.

## Expected Behavior Or Oracle

Operations requirement in the charter: shipped runtimes are supported and receive
patches. Electron's published policy supports the latest three major versions.

## Evidence

- `node_modules/electron/package.json` version `30.5.1`; `package.json` pins `^30.5.1`.
- [dependency triage](../../evidence/phase-11-dependency-triage-2026-10-19.md), "Desktop Runtime Advisories" section: 37 advisories, all high, no fix within the 30.x line.
- Phase 10 recorded `npm audit --omit=dev` as clean; Electron is a devDependency and was never in that scope, which is why this was not visible then.

## Root Cause

Electron is declared as a devDependency, so the production audit scope never
includes the one dependency that ships to every desktop user, and no process tracks
the Electron support window.

## Recommended Remediation Boundary

Upgrade to a supported Electron major (with `electron-vite`, `electron-builder`, and
`better-sqlite3` ABI rebuild), re-run the Phase 4 parity table for Electron-only
bridge methods, and add `scripts/audit/dependency-triage.mjs` to the release
checklist so the shipped-runtime section is read. One dependency slice; expect
breaking-change review of `BrowserWindow` defaults.

## Required Regression Proof

- Deterministic unit/integration proof: `npm test`, `npm run build`, `node scripts/assert-electron-assets.mjs`.
- Electron proof: packaged Linux launch, main menu, one song session, Settings read-back (sitting 1 after the upgrade).
- Web proof: not applicable.
- Broader regression command: `npm run package:local`.

## Challenge Record

- Independent reproduction attempt: version and advisory list are deterministic.
- Alternative explanations tested: "advisories do not apply because the app loads local files only" narrows severity to P2 but does not remove the unsupported-engine fact.
- Deduplication decision: distinct from PH-SEC-005.
- Challenger conclusion and date: reproduced, 2026-10-19
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P2. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.

- Implementation, 2026-10-21 (branch `remediation/p11-s03-electron`, commits `21d8cd5`, `addf440`; status unchanged, verifier pending):
  - Electron `^30.5.1` to `^44.9.2` (latest stable, Node 24.22.0, Chromium 152, ABI 149). 44 has the longest support window of the three supported majors (42, 43, 44; 45 is in beta).
  - `better-sqlite3` `^12.8.0` to `^13.0.3`. The 12.x line has Electron prebuilds only up to Electron 42 (12.11.1) or 43 (12.12.0, which is on GitHub but not on npm), and `electron-rebuild` 3.2.9 cannot even map Electron 44 to an ABI. 13.0.0 is an N-API build: one prebuilt binary per platform (`prebuilds/linux-x64.node`, `win32-x64.node`, and others) loads in Node and in Electron, so the per-Electron-version rebuild is gone. The binary opens an in-memory database under Node 24.15.0 and under Electron 44.9.2 (`ELECTRON_RUN_AS_NODE`), and `scripts/ensure-native-module.cjs node` and `electron` both report ready.
  - `packaging/electron-builder.yml`: `npmRebuild: false`. Without it electron-builder 24.13.3 runs `npm rebuild better-sqlite3` with `build-from-source`, which tries `node-gyp rebuild` (needs a C++ toolchain, and Visual Studio on the Windows build). With it, `electron-builder --linux AppImage dir` in a copy under `$TMPDIR` produced `LumaKeys-0.1.0.AppImage` and `linux-unpacked`.
  - Breaking-change review, Electron 31 to 44 (`docs/breaking-changes.md`): this app uses `BrowserWindow`, `ipcMain.handle`, `dialog`, `contextBridge` and `ipcRenderer` only. Nothing in it is removed or renamed. Two behaviour changes apply: 42 stops downloading the binary in the `electron` postinstall (`require('electron')` and `npx install-electron --no` fetch it on demand, so the existing `postinstall` still works, and the Dockerfile skips it); 43 makes `dialog.showOpenDialog` and `showSaveDialog` start in the Downloads folder when no `defaultPath` is given, so the OS no longer remembers the last-used folder (the import dialogs lose that; not changed here, see the slice report).
  - Docs: `BUILD_PORTABLE.md` gains a "Before You Release" step to read the "Desktop Runtime Advisories" section of `scripts/audit/dependency-triage.mjs`, and its better-sqlite3 troubleshooting no longer points at `npm run rebuild`. The Electron driver README setup no longer needs an Electron-ABI copy.
  - Driver and regression results, all on isolated profiles under `$TMPDIR/p11-s03/`:
    - `node scripts/audit/dependency-triage.mjs` after the upgrade: "Desktop Runtime Advisories": none (before: 37, all high). `npm audit --omit=dev` still lists 1 moderate advisory (hono); not this slice.
    - `node scripts/assert-electron-assets.mjs`: passed, 647 public files in `out/renderer`.
    - Packaged Linux build (`dist/linux-unpacked/lumakeys` from the copy), launched headless on an isolated `--user-data-dir`: Electron 44.9.2, app 0.1.0, page loaded from `…/resources/app.asar/out/renderer/index.html`, `window.appBridge` present, `getAllSongs` returned 0 on a new profile, main menu and the first-run setup guide rendered. `better-sqlite3` loaded from `app.asar.unpacked`.
    - Old-build profile: `workflows.mjs` plus the Flute pack install ran on the baseline build under Electron 30.5.1 (5 songs, 2 results, 8 settings, 5 MIDI files, Flute pack with 10 files). The new build on Electron 44.9.2 opened it: main menu (no setup guide), 5 songs and 2 results through the bridge, Flute pack resolves and its first sample loads (190962 bytes). A node-side dump of every table count, the settings, song ids, results and the file lists before and after is identical.
    - Drivers `workflows.mjs`, `backup-reset-restore.mjs`, `sample-pack.mjs`, `keyboard-walk.mjs` and `ipc-workflows.mjs`, run on the baseline build under Electron 30.5.1 and on the new build under Electron 44.9.2 in turn and diffed (ids and timings normalised): all exit 0 on both. Differences: the timing-dependent Play and Learn scores (for example Play 325 vs 300); the random quiz scores; new Chromium directories in the `userData` listing (`DIPS`, `GPUPersistentCache`, `Local State`); and in `keyboard-walk.mjs` part (e) Escape after the Clear Learning Progress dialog now returns focus to the trigger button (30.5.1: `body`), part (d) counts 77 Free Play Tab stops (30.5.1: 83), part (a) reports a `weak:transform` focus kind on Main. The (e) change is Chromium behaviour, not an app fix: PH-UI findings that reproduced against 30.5.1 need to be judged against the web runtime or this engine, not closed by this upgrade.
  - Harness notes: on Electron 44 the offscreen harness is unstable when other Electron processes run at the same time (the GPU process was killed, launches timed out), so run drivers one at a time. `--in-process-gpu` hides that but makes the app exit with SIGTRAP at shutdown about half the time, so it was not adopted.
  - Not run: Windows portable build and launch; a packaged Linux AppImage launch on a real display (needs Xvfb or the owner's desktop). Both are listed in the slice report as owed.
