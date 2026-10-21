# Phase 11 Lane D: Runtime Parity, Electron Vs Web

- Lane owner: Claude Code (acting)
- Reviewer/challenger: Claude Code (acting), self-challenge recorded below; the lead merges
- Baseline identity: `main` at `6e549b6` (later commits are audit docs only); delta `0bd40f5..6e549b6`; `out/` and `dist/web/` built 2026-10-19 17:07 from this source and not rebuilt by this lane
- Started: 2026-10-19
- Last updated: 2026-10-19
- Status: complete. No new findings. A packaged electron-builder artifact built from this source is still owed (sitting 1 and sitting 2).

## Scope

- Coverage rows: OP-013, MOD-008, MOD-009, and BR-001 through BR-069. The method-by-method re-run covers only methods whose implementation files are in the delta. MOD-014 and L-11-008 belong to lane A and are not repeated.
- User journeys: MIDI and MSCZ import, reattach, game-result save and read, backup export, curriculum MIDI, managed instrument pack, starting practice when a prerequisite fails (PH-ARCH-001), main-menu video.
- Runtimes:
  - Web: built server `dist/server/index.cjs` on port 3796, driven by headless Chromium 141 (Playwright 1.56.1).
  - Electron: 30.5.1 (Chrome 124.0.6367.243) headless with an offscreen window, using port 3797 for its forwarded data.
  - Node replicas of the Electron main handlers.
  - Source.
- Data and privileged boundaries: the AppBridge contract (preload and IPC versus the RPC router and webBridge), the new static file server, and Electron `file://` and asar asset resolution.
- Explicit exclusions:
  - `npm run package:*` (it writes the shared `dist/`).
  - The real `out/main` bundle (see Method).
  - Native file dialogs, Windows, Edge, Firefox.
  - Lane A: MOD-014 and PH-SEC-005.
  - Lane B: the legacy-profile migration, DATA-017 and PH-PAR-003.

## Method

Every run used a fresh data directory under `$TMPDIR/p11/D/`. No real data directory, `~/.config` or repository data was read or written.

The brief states that Electron cannot run in this sandbox. That is partly wrong:
- Electron 30.5.1 starts with `--ozone-platform=headless`.
- A normal `BrowserWindow` crashes the main process with SIGSEGV right after creation. This reproduced with a five-line app under five flag sets.
- An offscreen (OSR) `BrowserWindow` loads and renders.

The real `out/main/index.js` still cannot run. It imports `better-sqlite3`, and the only copy in `node_modules` is built for the Node ABI. Rebuilding it for Electron would break the shared web server and test runs, so this lane did not do it.

The Electron renderer evidence therefore comes from [`scripts/audit/electron-renderer-asset-probe.mjs`](../../../scripts/audit/electron-renderer-asset-probe.mjs):
- A throwaway main process loads the real `out/renderer/index.html` with `contextIsolation: true` and a `contextBridge` preload that exposes `window.appBridge`.
- Each bridge call goes over real `ipcRenderer.invoke` to an `ipcMain.handle` handler. That handler forwards the call to the web server, which uses its own isolated data directory.
- Three desktop-only startup calls get empty values: `getInstrumentSamplePackStatuses`, `listAudioFiles` and `resolveInstrumentSampleSource`.
- `loadMidiFileData` returns a `Uint8Array`, the same shape as Electron's `file:load-midi` handler.

This proves the following:
- Renderer behavior under Electron `file://`, inside an asar, and under IPC rejection.
- That the `fs` calls the packaged main uses can read bundled assets from inside an asar.

It does not exercise the real main handlers or an electron-builder artifact. The asar was packed by `@electron/asar` with the layout `packaging/electron-builder.yml` produces: `files: out/**/*`, asar on, and only `better-sqlite3` unpacked.

Lane D outputs and scripts:

| Script | Output (under `$TMPDIR/p11/D/`) | Purpose |
|---|---|---|
| [`bridge-contract-diff.mjs`](../../../scripts/audit/bridge-contract-diff.mjs) | `contract-head.out`, `contract-6e549b6.out`, `contract-0bd40f5.out`, `contract-mutation.out` | Scripted contract diff across six sources |
| [`browser/lane-d-parity.mjs`](../../../scripts/audit/browser/lane-d-parity.mjs) | `lane-d-parity.out`, `$TMPDIR/p11/D/shots/` | Web RPC re-run, static server, web video, PH-ARCH-001 on the web, Chromium `file://` approximation |
| [`electron-renderer-asset-probe.mjs`](../../../scripts/audit/electron-renderer-asset-probe.mjs) | `electron-renderer-asset-probe.out`, `$TMPDIR/p11/D/electron-renderer/*.png` | Real Electron renderer: video from the `out/` tree and from an asar, asar `fs` reads, PH-ARCH-001 over IPC |
| `electron-paths-probe.mts` (scratch only) | `electron-paths-probe.out` | Node replica of Electron per-file import and `saveGameResult` against `AppDatabase`; asset URL resolution |
| `npx vitest run` (11 files) | `vitest-focused.out` | 76 tests passed: publicAssetUrl, GameScreen, LibraryScreen, MainMenuScreen, webBridge, bridgeRouter, libraryRouter, midiRouter, staticFiles, importSong, libraryBackup |
| `node scripts/assert-electron-assets.mjs` | `assert-assets.out` | Passed: 649 public files in `out/renderer` |

## Evidence Plan

| Surface | Oracle/invariant | Method/fixture | Runtime | Expected artifact |
|---|---|---|---|---|
| AppBridge contract | Each of the 69 methods appears once in the type, inventory, preload, IPC handlers, router validators and webBridge routing; nothing appears in one list but not another | `bridge-contract-diff.mjs` at the working tree, `6e549b6` and `0bd40f5`, plus a mutation run | both (source) | contract outputs |
| Delta methods | Same outcome, return shape and side effects across runtimes; web validation is deliberately stricter (Phase 4) | Web RPC against an isolated server; Electron Node replica plus source | both | `lane-d-parity.out`, `electron-paths-probe.out` |
| Main-menu video (PH-PAR-001 policy) | The asset ships in Electron output, resolves under `file://`, and plays; the web server sends a correct type and supports byte ranges | Static GET and Range requests; Chromium and real Electron, with a negative control | both | video lines, screenshots |
| `.mscz` import | A capability difference is documented and gated, or it is a finding | Source, README, UI copy, web upload | both | this report |
| PH-PAR-002 | A browser picker settles on cancel | Source and test trace | web | this report |
| PH-ARCH-001 | A rejected prerequisite shows a visible error with Retry and Back | Inject a 500 (web) or an IPC rejection (Electron) for each prerequisite | both | `lane-d-parity.out`, `electron-renderer-asset-probe.out` |

## Contract Diff

`bridge-contract-diff.mjs` checks every pairing in the brief and exits 1 on any mismatch.

All checks pass at the working tree, `6e549b6` and `0bd40f5`:
- Inventory 69, split into rpc 51, web-special 12 and web-stub 6.
- The `AppBridge` type has 69 keys and the preload has 69 keys.
- 68 `ipcMain.handle` channels plus one `send` channel (`import:progress`) for `onImportProgress`.
- 51 router validators, equal to the RPC set.
- The 12 web-special methods are each handled explicitly in webBridge. `resetUserData` is an RPC method that webBridge also overrides.

Between `0bd40f5` and `6e549b6` the only extracted change is one new router special case, `saveGameResult` (the `piano-hero` alias).

The mutation run proves the script catches drift. Renaming one handler channel, removing one validator key and renaming one webBridge special method each produced a FAIL.

`git diff 0bd40f5..6e549b6 -- src/shared src/main src/server/bridgeRouter.ts src/renderer/webBridge.ts` touches four files and adds or removes no method:

| File | Delta change |
|---|---|
| `src/main/index.ts` | Brand rename: `setName('LumaKeys')`, `migrateLegacyBrand`, `lumakeys.db`, export file name |
| `src/renderer/webBridge.ts` | Focus fallback removed; `.mscz` added to the import `accept` list; IndexedDB name changed |
| `src/server/bridgeRouter.ts` | Mode alias |
| `src/main/instrumentSamplePackStore.test.ts` | Test only |

`src/main/preload.ts` and `src/shared/*` are not in the delta.

`webBridge.ts` has no `desktopStubNames`. Stubs come from `WEB_STUB_BRIDGE_METHODS`: `pickMidiFile`, `importMidiFolder`, `saveMidiFile`, `saveWavFile`, `pickAudioFile` and `pickSampleDirectory`. The old local CLAUDE.md line 60 named `desktopStubNames` (lane H; corrected in `CONTEXT.md`, task D1).

## Method-By-Method Re-Run

These are the Phase 4 columns, narrowed to methods whose implementation is in the delta. Methods whose implementation is unchanged keep their Phase 4 disposition: BR-058 (`libraryBackup.ts` changed only in its test) and the RPC methods with no router change.

| Row and method | Delta | Electron (source and replica or probe) | Web (observed over RPC) | Disposition |
|---|---|---|---|---|
| BR-008 `importMidiFiles` | `importMetadata.ts`: `effectiveTitle = title.trim() \|\| midiMeta.suggestedTitle \|\| 'Untitled'`; web `/upload` accepts `.mscz` | Dialog filters are `mid`/`midi` (`index.ts:118,158,239`). The replica of the per-file import (`index.ts:173-188`) titled the fixture "Lane D Title Probe" (MIDI header name "Header Title"). Returns `{songs, errors, skipped}` | Upload returned 200. Songs: `["Lane D Title Probe"]`. Errors: `score` gave "MSCZ import requires MuseScore 4 on the Linux web server. Use the bundled Docker image." (no MuseScore here); `notes.txt` gave "Only .mid, .midi, and .mscz files can be uploaded." | Covered. Title parity holds. `.mscz` is an intentional difference (below) |
| BR-010 `reattachMidiFile` | `midiRouter.ts` touched (upload only) | Dialog filter is MIDI only | `.mscz` reattach returned 200 with error "Only .mid and .midi files can be uploaded."; same bytes reattached "Lane D Title Probe" | Covered. Both runtimes are MIDI-only for reattach |
| BR-013 `saveGameResult` | Mode renamed `piano-hero` to `luma-keys`; the router accepts `piano-hero` and stores `luma-keys` (`bridgeRouter.ts:94-95,388-390`) | IPC does no validation. The replica stored `luma-keys`, `piano-hero` and `normal` as given | `luma-keys` returned 200; `piano-hero` returned 200; `normal` returned 400 "saveGameResult requires a valid result payload." | Covered. The asymmetry is the accepted Phase 4 rule that web validation is stricter. No renderer code sends `piano-hero` (grep of `src/`), so the alias serves only stale web clients and old requests |
| BR-014 `getGameResults` | Startup migration in `database.ts` | Replica before restart: `["normal","piano-hero","luma-keys"]`; after restart all were `luma-keys` | Modes `["luma-keys","luma-keys"]` | Covered. Electron is only briefly inconsistent, and only after unvalidated input the UI never sends |
| BR-015, BR-032, BR-053 (`getUserStats`, `getCustomFingerings`, `getSetting` as GameScreen prerequisites) | `GameScreen.tsx` modified | Real Electron renderer with an IPC rejection shows the panel (PH-ARCH-001 below) | Panel shown for each method (below) | Covered in both runtimes |
| BR-057 `exportLibrary` | Brand in the file name | `defaultPath: lumakeys-library-${new Date().toISOString().slice(0, 10)}.json` (`index.ts:362`) | `{"filename":"lumakeys-library-2026-10-19.json","target":"download","songs":1,"midiFiles":1}`; same expression at `libraryRouter.ts:16` | Covered |
| BR-059 `loadMidiFileData` | none in the GET route | Handler returns `new Uint8Array(bytes)`; the probe used the same shape and the session loaded "4 notes" | GET `/api/midi/:id` loaded the song after Retry | Covered, unchanged |
| BR-060 `loadCurriculumMidi` | PH-PAR-001 fix (renderer `publicDir`) and new `packaging/` | Packaged root is `app.getAppPath()/out/renderer` (`index.ts:50-52`). Real Electron `fs/promises.readFile` inside `app.asar/out/renderer/curriculum-midis/ode-to-joy.mid` read 614 bytes, header `MThd` | 200 `application/octet-stream`, 614 bytes, sha256 prefix `fb26905fee95efd7`, equal to the `out/renderer` copy; 4 files in `public/` and 4 in `out/renderer` | Covered. The PH-PAR-001 note on this row is out of date |
| BR-066 to BR-069 sample packs | Web IndexedDB renamed to `lumakeys-instrument-sample-packs` (PH-DATA-004, known) | Real Electron `existsSync`/`readFileSync` on the flute manifest and `copyFileSync` of `C4.mp3` (190962 bytes) out of the asar succeeded. `out/renderer/instrument-packs` has 153 files, the same as `public/` | Manifest 200 `application/json; charset=utf-8`, `no-cache, must-revalidate`; `C4.mp3` 200 `audio/mpeg` | Covered. The PH-PAR-001 note on BR-067 is out of date. The Electron store path moves with userData (lane B) |

## PH-PAR-001 And The Main-Menu Video

How the video is referenced:
- `MainMenuScreen.tsx` sets `BACKGROUND_VIDEO_PATH = '/assets/main-menu/mainmenu-neonbackground.webm'` and renders `src={resolvePublicAssetUrl(...)}`.
- `resolvePublicAssetUrl` strips the leading slash and resolves against `document.baseURI`.
- The video element has no `poster` attribute. The still image comes from `--main-menu-background-image`, which `main.tsx` sets to an `image-set` of webp and png through the same resolver. `index.html` also preloads `./assets/main-menu/mainmenu-neonbackground.webp`.
- The video is not rendered under `(prefers-reduced-motion: reduce)` or `(max-width: 780px)`.

How the URL resolves:
- Under Electron `loadFile`, the base is `file:///.../out/renderer/index.html`, so the video resolves to `out/renderer/assets/main-menu/mainmenu-neonbackground.webm`.
- Inside a package it resolves to `.../resources/app.asar/out/renderer/assets/main-menu/...`, which matches the `out/**/*` files glob.
- On the web it resolves to `/assets/main-menu/...` on the server origin.
- A bare absolute `/assets/...` under `file://` would resolve to `file:///assets/...`, which does not exist. The resolver prevents that.

Build and packaging:
- The file is in `out/renderer`: 7386798 bytes, byte-identical to `public/`.
- `assert-electron-assets.mjs` passes.
- `packaging/electron-builder.yml` ships `out/**/*` inside the asar.

| Check | Web (Chromium 141) | Chromium on `file://out/renderer` | Electron 30.5.1, `out/` tree | Electron 30.5.1, inside `app.asar` |
|---|---|---|---|---|
| `currentSrc` | server `/assets/main-menu/...webm` | `file:///media/storage/LumaKeys/out/renderer/assets/...` | same as previous column | `file:///.../app.asar/out/renderer/assets/...` |
| readyState, error, paused | 4, none, playing | 4, none, playing | 4, none, playing | 4, none, playing |
| Playback advanced in about 1.5 s | 1.22 s, 258 frames decoded | 0.93 s | 1.45 s, 97 frames | 1.38 s, 94 frames |
| Sampled pixels not dark (of 576) | 350 | 348 | 226 | 224 |
| webp / png still | not measured on the web | 1920x1080 / 3344x1882 | 1920x1080 / 3344x1882 | 1920x1080 / 3344x1882 |
| Negative control, absolute `/assets/...` src | n/a | `file:///assets/...`, error 4, `ERR_FILE_NOT_FOUND` | error 4, readyState 0 | error 4, readyState 0 |

The Electron sample is darker than the Chromium sample because the 32x18 sample catches a different frame of the animation. All four columns are well above the black-frame level.

Web server (`staticFiles.ts`, new in the delta, commit `6e549b6`):
- A full GET returns 200 `video/webm` with `Accept-Ranges: bytes` and `Cache-Control: public, max-age=3600`; the bytes equal `public/`.
- `Range: bytes=0-1023` returns 206 `bytes 0-1023/7386798` with a matching slice.
- `bytes=-16` and an open-ended tail return 206 with matching slices.
- A range starting at the file size returns 416 `bytes */7386798`.
- A multi-range request returns 200 with the full body. That is allowed by RFC 9110.
- A missing asset returns 404 `text/plain`.
- During page playback the browser received `206 bytes 0-7386797/7386798 video/webm`.

Screenshots (sha256 prefixes):
- Web: `$TMPDIR/p11/D/shots/web-main-menu.png` `1e94d517b52bb70d`.
- Chromium `file://`: `$TMPDIR/p11/D/shots/file-main-menu.png` `66762c5edcf07a9d`.
- Electron tree: `$TMPDIR/p11/D/electron-renderer/electron-tree-main-menu.png` `dba61505398eca07`.
- Electron asar: `$TMPDIR/p11/D/electron-renderer/electron-asar-main-menu.png` `ea4184c6b488c2b3`.

Result: the video loads and plays in a real Electron 30.5.1 renderer from the unpacked tree and from inside an asar. PH-PAR-001 holds for the new asset.

Still owed:
- A real electron-builder package built from this source. Sitting 1 for the Linux package; sitting 2 for the Windows portable build.
- The packages in `dist/linux-unpacked` and `dist/win-unpacked` are dated 2026-08-07 and predate the video. Their asar `main-menu` folder has no `.webm`, and the Windows package still uses the `luma-keys` name and `pianohero.db`. They must not be used as evidence. Each sitting must run `npm run package:*` first.

## `.mscz` Is Web-Only: Disposition

The difference is intentional and documented, not a silent gap:
- MuseScore conversion lives only in the web `/upload` route (`midiRouter.ts`, `museScore.ts`).
- README lines 208-210 say "Browser uploads accept `.mid`, `.midi`, and `.mscz`" and "The Electron desktop importer remains MIDI-only".
- The UI copy is gated by `IS_WEB`. Electron shows "Upload MIDI" and web shows "Upload MIDI / MSCZ" (`LibraryScreen.tsx:1022`); the empty-state text at lines 1568-1570 follows the same rule.
- In Electron, all three dialogs and `collectMidiFiles` accept only `mid`/`midi`.
- Reattach is MIDI-only in both runtimes.

Neither ADR 0001 nor `CONTEXT.md` lists runtime capability differences. Recording `.mscz` there is a documentation suggestion for lane H, not a defect.

The replica forced a `.mscz` into the Electron import path, which the UI cannot do. It produced the title `score.mscz` and an error whose thrown value is a string, so the reported message would be `undefined`. That is the PH-PAR-004 pattern and is not raised again.

## PH-PAR-002: Picker Cancellation

`pickFiles` in `webBridge.ts:83-122` registers only `change` and `cancel` on the hidden input. The focus-based fallback timer was removed by commit `99adf7c` ("feat: support MSCZ uploads and fix imported song titles"), confirmed with `git log -S onWindowFocus`. The re-verification report names `1fbd73f`, which is not the commit that removed it; that report needs a correction.

On a browser that never fires `cancel`, the import, reattach and backup-import promises stay pending, as in the original finding. The `cancel` event on file inputs ships in Chromium 113+ (Chrome and Edge), Firefox 91+ and Safari 16.4+.

Proof still owed: a real native-dialog cancel. Playwright and the jsdom tests dispatch a synthetic event. Sitting 3 must cover Edge and Firefox, which together cover both engines in the support matrix. Safari is not listed in any audit environment.

Electron is not affected: its dialogs return `canceled` and the handlers return `null`.

## PH-ARCH-001: Prerequisite Failure Recovery

Lane F's WF-006 result ("Unable to load MIDI: 404" with Retry and Main Menu) exercises only the MIDI-byte path. That path already reported errors before the fix (see the PH-ARCH-001 finding, Oracle section). WF-006 therefore does not prove the fix. This lane injected the failures the finding describes.

Web results:
- Method: for each of `getUserStats`, `getCustomFingerings` and `getSetting`, `page.route` returned 500 `{"error":"storage unavailable"}`; then Library, Learn.
- Each method showed `role="alert"` "PRACTICE UNAVAILABLE | Could not start this session. | Unable to load song: storage unavailable" with buttons [Retry, Main Menu].
- Main Menu returned to the menu, and reopening showed the panel again.
- After the route was removed, Retry cleared the panel and mounted the canvas, and the overlay status read "Loaded Lane D Title Probe with 4 notes across 1 tracks."
- No unhandled page errors.

Electron 30.5.1 results:
- Method: real `ipcRenderer.invoke` rejections for the same three methods.
- The panel showed with the same buttons and role.
- Main Menu reached the main menu, reopening showed the panel again, and Retry after the rejection was lifted cleared the panel and mounted the canvas.
- No console errors and no lost renderer.
- The Electron text reads "Unable to load song: Error invoking remote method 'probe:call': Error: storage unavailable". With the real preload the channel name would be `stats:get`, `fingering:get` or `settings:get`.

Screenshots: web `$TMPDIR/p11/D/shots/arch001-getUserStats.png` `cc6beedf7fcd0562`; Electron `$TMPDIR/p11/D/electron-renderer/electron-arch001-getUserStats.png` `c43165d0d52632b4`. The layout is identical; only the message text differs.

Result: the fix holds at runtime in both renderers. Two items remain:
1. The automated regression the re-verification report names is still missing: `GameScreen.test.tsx` has no rejected-prerequisite test.
2. The real Electron main was not exercised. Its handlers are plain `ipcMain.handle` calls that throw, which produce the same rejection mechanism, so a person-run check adds little.

## OP-013, MOD-008, MOD-009

- **OP-013 and MOD-008:** the delta does not touch `preload.ts`. In `src/main/index.ts` the delta changes only the brand rename, the legacy migration call, the DB file name and the export file name. A grep of the delta for `webPreferences`, `setWindowOpenHandler`, `will-navigate`, `contextIsolation`, `nodeIntegration` and `sandbox` is empty. Lane A's conclusion (context isolation holds; PH-SEC-005, child window without a guard, is P3 pending its runtime probe) is unaffected. The contract diff shows the preload exposes exactly the 69 contract methods over 68 invoke channels and one event channel.
- **MOD-009:**
  - Stubs return `null`/`[]` from `WEB_STUB_BRIDGE_METHOD_SET`.
  - The 12 special methods are explicit.
  - The delta changes the picker (cancel only), the import accept list (`.mid,.midi,.mscz`) and the IndexedDB name (PH-DATA-004).
  - Reattach stays `.mid,.midi`.
  - Browser capabilities and failures remain explicit. The only open runtime proof is PH-PAR-002 native cancel in sitting 3.

## Observations

These are not findings: no named oracle is violated, or another lane owns the item.

1. **Electron error copy includes the IPC wrapper.** Every IPC rejection reaches the user as "Error invoking remote method '<channel>': Error: <reason>". The web shows only the reason. Phase 4 recorded the same string in its curriculum evidence without raising it. No product rule on error copy exists in `docs/`. Lane E may decide whether to raise it.
2. **Empty canvas text under the panel.** The game canvas under the load-error panel still says "Drag and drop a MIDI file here or use the import button." This is the same in both runtimes; UI copy, lane E.
3. **MSCZ error file name drops the extension.** The web upload reports the MSCZ conversion error under `score`, while a rejected text file keeps `notes.txt`. This is cosmetic.
4. **Static `.mid` content type.** The web static server sends `.mid` as `application/octet-stream`. The renderer reads it as an ArrayBuffer, so playback is unaffected.
5. **Stale packages and untracked files.**
   - The packages in `dist/` are stale (2026-08-07); see the PH-PAR-001 section.
   - Untracked `public/assets/main-menu/bck.jpg`, a long-named `.jpeg`, and an empty `.claude/.cc-writes/` directory are copied into `out/renderer` and `dist/web`. Lane G already lists the two images; the empty directory is the only addition.
6. **Stale CLAUDE.md reference.** The old local CLAUDE.md named a `desktopStubNames` list that no longer exists (lane H; `CONTEXT.md` now names `WEB_STUB_BRIDGE_METHODS`, task D1).
7. **Legacy-profile migration (lane B).** A real Electron 30.5.1 probe here confirmed that `app.setName('LumaKeys')` inside `whenReady` does not move `userData`: before and after, it is `<XDG_CONFIG_HOME>/lumakeys`, the package `name`. `migrateLegacyBrand` looks only in `appData/PianoHero`, and earlier builds used `appData/piano-hero` and then `appData/luma-keys`. Lane B's `electron-userdata-probe.mjs` already shows this with seeded profiles (cases E1 and E2, `migrated: false`). Lane B raised this as candidate [PH-DATA-005](findings/PH-DATA-005.md); lane D's probe is corroborating evidence only.
8. **Headless Electron is usable (note for the lead).** An offscreen `BrowserWindow` renders headless in this sandbox, but a normal window crashes. Lane A's staged MOD-014 probe uses a normal child window, so it would need adapting; this lane did not attempt that, as the brief directs.

## Findings

No new candidate findings. Existing findings re-checked in this lane:

| Finding | Why it belongs to this lane | Shared lanes |
|---|---|---|
| [PH-PAR-001](findings/PH-PAR-001.md) | Holds for the video, curriculum and instrument packs in `out/` and inside an asar; packaged-artifact proof owed | G (assertion not wired into a script) |
| [PH-PAR-002](findings/PH-PAR-002.md) | Holds where `cancel` fires; source relies only on `cancel`; real-browser proof owed in sitting 3; the removal commit in the re-verification report needs correcting | F |
| [PH-ARCH-001](findings/PH-ARCH-001.md) | Runtime proof now in both renderers; automated test still missing | F |
| [PH-PAR-004](findings/PH-PAR-004.md) | The forced Electron `.mscz` path shows the same "undefined" pattern; not raised again | F |
| [PH-PAR-003](findings/PH-PAR-003.md), DATA-017, candidate [PH-DATA-005](findings/PH-DATA-005.md) | Legacy profile and brand migration; lane D's real-Electron `userData` probe corroborates PH-DATA-005 | B (owner) |
| PH-SEC-005 | Unchanged by the delta | A (owner) |

## Evidence Gaps

| Coverage row | Missing proof | Why blocked | Owner | Next action |
|---|---|---|---|---|
| RT-012, WF-026, BR-060, BR-067 | Video and managed-pack install (same asar read path as curriculum capstones, which unlock only after every lesson in a tier) inside a real electron-builder package built from `6e549b6` | Packaging writes the shared `dist/`; a normal Electron window crashes in the sandbox | repository owner | Sitting 1 item D-1; sitting 2 item 1 expectation |
| BR-008, BR-010, BR-058 (PH-PAR-002) | Native dialog cancel in Edge and Firefox (one shared `pickFiles` path) | No Edge or Firefox in the sandbox; Playwright cannot press a native Cancel | repository owner | Sitting 3 item D-2 |
| PH-ARCH-001 | Automated GameScreen test with a rejected prerequisite | Not in the suite; writing it is remediation, not discovery | remediation | Named in the re-verification regression list |
| OP-013, MOD-008 (MOD-014) | Child-window runtime probe | Lane A owns it | lane A | Sitting 0 item 1 |

## Runtime And Failure Coverage

- **Electron:** contract by source and script. Real Electron 30.5.1 renderer (offscreen) for the main menu, video, still images, asar `fs` reads and PH-ARCH-001. Node replica for import title, `.mscz` and mode storage. The real `out/main` and the package were not run.
- **Web:** built server with Chromium 141 for upload, reattach, mode alias, export, curriculum, pack manifest, video Range handling, main-menu video and PH-ARCH-001.
- **Loading, empty and disabled states:** a fresh profile main menu ("NO SONGS YET") renders in both runtimes.
- **Error, retry and recovery:** PH-ARCH-001 Retry and Main Menu in both runtimes; MSCZ without MuseScore; non-MIDI rejection; MSCZ reattach rejection.
- **Destructive and interruption:** the restart after unvalidated mode writes self-heals (replica).
- **Accessibility or hardware proof:** the panel has `role="alert"`. Reduced motion and real displays belong to lanes E and F and sitting 1.

## Challenge Summary

- **Claims disproved or narrowed:**
  - "Electron cannot run in this sandbox" was narrowed: an offscreen window works and a normal window crashes.
  - "WF-006 proves PH-ARCH-001" was narrowed: it exercises only the MIDI-byte path, which was already handled.
  - "The focus fallback was removed in `1fbd73f`" was corrected to `99adf7c`.
  - "The video may not load in packaged Electron" was disproved for an asar with the packaged layout; an electron-builder artifact is still owed.
  - The driver bug `song.id` (the field is `songId`) was caught and fixed before any result was used. It had produced a false 404 on reattach and a false 400 on save.
- **Duplicates merged:** the forced Electron `.mscz` message is merged into PH-PAR-004; the legacy-profile path is left to lane B.
- **Severity changes:** none.
- **Environmental failures separated:**
  - MSCZ conversion fails here because MuseScore is absent. That is expected; Docker proof is sitting 0 items 2 and 3.
  - The `ERR_ABORTED` on the web video request came from navigating away during playback.
  - The Electron D-Bus errors are not fatal.

## Lane Exit Check

- [x] Every assigned coverage row has an owner.
- [x] Every assigned row has evidence and disposition, or an explicit gap.
- [x] All findings link to detailed reports and coverage rows (no new findings).
- [x] P0/P1 leads were independently challenged (none raised; PH-PAR-001 re-checked).
- [x] Positive/working behavior is recorded.
- [x] Manual and hardware gaps are explicit.
- [ ] Coverage summary counts were updated (the lead merges the matrix).

## Sign-Off

- Lane owner/date: Claude Code (acting), 2026-10-19
- Challenger/date: Claude Code (acting) self-challenge, 2026-10-19
- Audit lead/date: pending

## Proposed Matrix Updates

Links are written relative to `docs/audit/coverage-matrix.md`, where they will be merged.

| Row | Status | Evidence link text | Note |
|---|---|---|---|
| OP-013 | covered | [P11-D](reports/phase-11-lane-d-runtime-parity-2026-10-19.md#op-013-mod-008-mod-009) | The delta does not touch `preload.ts` or any `webPreferences` or window-open code; lane A's PH-SEC-005 conclusion stands and MOD-014 runtime stays in sitting 0 item 1. |
| MOD-008 | covered | [P11-D](reports/phase-11-lane-d-runtime-parity-2026-10-19.md#contract-diff) | `bridge-contract-diff.mjs` (mutation-tested) shows the preload exposes exactly 69 contract methods over 68 invoke channels plus one event channel, unchanged since `0bd40f5`. |
| MOD-009 | covered | [P11-D](reports/phase-11-lane-d-runtime-parity-2026-10-19.md#op-013-mod-008-mod-009) | Stubs come from `WEB_STUB_BRIDGE_METHOD_SET` (not `desktopStubNames`); the picker now relies on `cancel` only (removed in `99adf7c`), with native-cancel proof owed in sitting 3. |
| BR-008 | covered | [P11-D](reports/phase-11-lane-d-runtime-parity-2026-10-19.md#method-by-method-re-run) | Filename-derived title is equal in both runtimes; `.mscz` is web-only, documented in README and gated by `IS_WEB` copy; PH-PAR-002 is unchanged. |
| BR-010 | covered | [P11-D](reports/phase-11-lane-d-runtime-parity-2026-10-19.md#method-by-method-re-run) | Reattach is MIDI-only in both runtimes; the web rejects `.mscz` with an explicit error. |
| BR-013 | covered | [P11-D](reports/phase-11-lane-d-runtime-parity-2026-10-19.md#method-by-method-re-run) | The web accepts the `piano-hero` alias and stores `luma-keys`, and rejects `normal`; Electron IPC stores any mode until the startup migration rewrites it; no renderer sends a legacy mode. |
| BR-014 | covered | [P11-D](reports/phase-11-lane-d-runtime-parity-2026-10-19.md#method-by-method-re-run) | Reads return `luma-keys` on the web, and in Electron after restart. |
| BR-015 | covered | [P11-D](reports/phase-11-lane-d-runtime-parity-2026-10-19.md#ph-arch-001-prerequisite-failure-recovery) | A rejected `getUserStats` shows the PH-ARCH-001 panel with Retry and Main Menu in Chromium and in an Electron 30.5.1 renderer. |
| BR-032 | covered | [P11-D](reports/phase-11-lane-d-runtime-parity-2026-10-19.md#ph-arch-001-prerequisite-failure-recovery) | Same, for a rejected `getCustomFingerings`. |
| BR-053 | covered | [P11-D](reports/phase-11-lane-d-runtime-parity-2026-10-19.md#ph-arch-001-prerequisite-failure-recovery) | Same, for a rejected `getSetting`. |
| BR-057 | covered | [P11-D](reports/phase-11-lane-d-runtime-parity-2026-10-19.md#method-by-method-re-run) | Both runtimes name the backup `lumakeys-library-<ISO date>.json`. |
| BR-060 | covered | [P11-D](reports/phase-11-lane-d-runtime-parity-2026-10-19.md#method-by-method-re-run) | PH-PAR-001 is fixed for curriculum: `out/renderer` holds all 4 files and Electron 30.5.1 reads them from inside an asar; the same asar read path is checked in an electron-builder artifact by sitting 1 item D-1 (b). This replaces "Electron output omits required curriculum assets". |
| BR-067 | covered | [P11-D](reports/phase-11-lane-d-runtime-parity-2026-10-19.md#method-by-method-re-run) | PH-PAR-001 is fixed for packs: 153 files in `out/renderer/instrument-packs` and an asar `copyFileSync` works; the web serves the manifest as `application/json` and assets as `audio/mpeg`. |
| RT-012 | gap (unchanged) | [P11-D](reports/phase-11-lane-d-runtime-parity-2026-10-19.md#ph-par-001-and-the-main-menu-video) | Add: the packaged asset path is proven in Electron 30.5.1 from `out/` and from an asar; still owed are the electron-builder artifact (sitting 1 item D-1) and the real OS reduced-motion setting. |
| WF-026 | gap (unchanged) | [P11-D](reports/phase-11-lane-d-runtime-parity-2026-10-19.md#ph-par-001-and-the-main-menu-video) | Add: the video loads and plays in an Electron renderer from `out/` and from an asar, and the web serves byte ranges; reduced motion and the missing-asset fallback stay with lanes E and F. |

## Proposed User-Test Items

| Sitting | # | Coverage row / finding | Steps (already prepared) | Expected |
|---|---|---|---|---|
| 1 | D-1 | RT-012, WF-026, BR-067, PH-PAR-001 | `npm run package:local`, then `P=$(mktemp -d); HOME=$P XDG_CONFIG_HOME=$P/.config ./dist/linux-unpacked/lumakeys --no-sandbox`. This builds a fresh package and runs it with a throwaway profile; the executable was named `lumakeys` in the previous build, so use the one file in `dist/linux-unpacked/` if the name differs. Finish or skip setup. Then (a) watch the main-menu background for 5 s; (b) Settings (the Audio tab opens first), set Instrument to Flute, press "Install Better Sounds" | (a) The neon background moves (video), not a still image; (b) the status reads "Flute Enhanced Pack installed". This copies the pack out of the packaged asar, the same read path the curriculum capstones use. Close the app and delete `$P` |
| 2 | (amend item 1) | WF-023, RT-001, WF-026 | Use a portable exe built from the current source with `npm run package:win`; the exe in `dist/win-unpacked` dated 2026-08-07 is stale. Add to item 1: watch the main-menu background for 5 s | The background moves; the main menu renders; the app closes cleanly |
| 3 | D-2 | BR-008, MOD-009, PH-PAR-002 | In Edge, then Firefox: Library, press "Upload MIDI / MSCZ", press Cancel in the native dialog; then press "Upload MIDI / MSCZ" again and pick any `.mid` | After Cancel the button returns from "Importing..." to "Upload MIDI / MSCZ" within 1 s and is enabled; the second attempt imports the song. (Import Library has no busy state, so a person cannot see a pending cancel there; the Upload button covers the same `pickFiles` code.) |

## Candidate Findings

| Provisional ID | Severity | Summary |
|---|---|---|
| none | n/a | No reproduced violation of a named oracle in lane D scope. See Observations 1 to 8 for items handed to lanes B, E, G and H. |

## Files Created

- `docs/audit/reports/phase-11-lane-d-runtime-parity-2026-10-19.md` (this report)
- `scripts/audit/bridge-contract-diff.mjs`: read-only AppBridge contract diff over six sources, with `--rev <commit>` and `--json`; exits 1 on mismatch
- `scripts/audit/browser/lane-d-parity.mjs`: web parity, static server, video, PH-ARCH-001 and Chromium `file://` driver (uses `withServer`, port 3796)
- `scripts/audit/electron-renderer-asset-probe.mjs`: real Electron renderer probe (offscreen window) for `out/` tree, asar and PH-ARCH-001 cases (port 3797)
- Scratch only, not in the repository: `$TMPDIR/p11/D/electron-paths-probe.mts`, `$TMPDIR/p11/D/eprobe/`, `$TMPDIR/p11/D/ewin/`, `$TMPDIR/p11/D/easar/`, fixtures and outputs under `$TMPDIR/p11/D/`
