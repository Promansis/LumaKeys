# npm audit Triage: 2026-11-02

Triage of the open `npm audit` advisories for LumaKeys, requested as part of Phase 11
remediation wave 3 (plan item "triage of the open `npm audit` advisories"). Read-only:
no dependency, `package.json`, lockfile or `node_modules` change was made. Raw JSON was
written under `$TMPDIR/w3/` (`npm-audit.json`, `npm-audit-prod.json`) and is not retained
in git. Supersedes the open-count lines of
[the 2026-10-19 baseline](baseline-2026-10-19.md) (74 advisories) and
[the dependency triage](../evidence/phase-11-dependency-triage-2026-10-19.md).

## Identity

- Commit audited: `9605ea7` (`git -C /media/storage/LumaKeys rev-parse --short HEAD`), tracked tree clean
- Date: 2026-11-02; registry `registry.npmjs.org` (live advisory DB)
- Node v24.15.0; Electron 44.9.2, better-sqlite3 13.0.3, hono 4.13.13, @hono/node-server 2.1.5, vite 5.4.21, vitest 2.1.9, electron-builder 24.13.3, esbuild 0.25.12 (bundler)

## Totals

| Command | Result |
|---|---|
| `npm audit --json` | **59 vulnerable packages**: critical 5, high 25, moderate 22, low 7 (74 distinct GHSA ids across them) |
| `npm audit --omit=dev --json` | **0** (prod 22 deps, dev 557, optional 140, peer 43, total 578) |

The earlier-in-session figure of 43 does not reproduce; this run reports 59. The advisory
database changes daily and npm counts packages, not advisories, so a different date or a
different checkout state (another lockfile) would give a different number. Not determined
which run produced 43. Trend: 74 (2026-10-19) to 68 (2026-10-21, hono fixes) to 59 now. The
Electron 30.5.1 advisories from the baseline are gone since the move to Electron 44.9.2,
which npm does not flag.

## Where the vulnerable code runs

| Runtime | What ships | Evidence | Advisories |
|---|---|---|---|
| Web server | `dist/server/index.cjs`, esbuild `--bundle --platform=node --external:better-sqlite3` (`package.json` `build:web`); bundles `hono`, `@hono/node-server`, app code | imports in `src/server/index.ts:1,4`; only `better-sqlite3` is loaded from `node_modules` at run time. `Dockerfile` runs `npm ci` (dev deps included on disk) then `npm run start:web` = `node dist/server/index.cjs` | **none** |
| Electron main/preload | `out/**`, `package.json`, `node_modules/**/*` filtered by electron-builder to production deps (`packaging/electron-builder.yml`); main imports only `electron` and `better-sqlite3` (`src/main/index.ts:1`, `src/persistence/database.ts:1`) | `@electron/asar` listing of `dist/linux-unpacked/resources/app.asar` (older 0.1.0 build) holds only prod deps plus better-sqlite3's install chain; no vite, vitest, electron-builder, ws, tar 6, postcss | **none** |
| Renderer bundle | react, react-dom, lucide-react, tone, @tonejs/midi, fonts (`src/renderer/**`, `src/lib/midi/midiFileParser.ts:1`) | `--omit=dev` is clean; postcss, nanoid, babel, browserslist only transform at build time and are not bundled | **none** |
| Build/dev/test tooling | vite, electron-vite, electron-builder, vitest, jsdom, tsx, concurrently, @vitejs/plugin-react and their trees | `devDependencies` in `package.json`; `package:*`, `build`, `build:web`, `dev*`, `test*` scripts | **all 59 packages** |

Nothing in the audit reaches a shipped runtime. The Docker image does carry the
devDependencies on disk (`npm ci` without `--omit=dev`), but the container never starts
them. That is attack surface only if an attacker already has code execution in the
container.

## Summary table

Only packages that carry an advisory themselves are listed (24 of 59). The other 35 are
"via" parents of these (rolled up under their cause, see "Rolled-up packages"). Reachable
means: attacker-influenced input reaches the vulnerable code path in a shipped or
network-exposed context. "Dev" in the Runtime column means tooling only.

| Package (installed) | Severity | Advisory ids (GHSA) | Runtime | Reachable | Recommendation |
|---|---|---|---|---|---|
| `shell-quote` 1.8.3 (via `concurrently` 9.2.1, pinned exact) | critical | w7jw-789q-3m8p, 395f-4hp3-45gv | dev (`dev:web` script) | no: `concurrently` is fed two fixed strings in `package.json`; no user input | **fix now**: `concurrently` 9.2.5 (shell-quote 1.12.0) |
| `tar` 6.2.1 (via app-builder-lib) | critical | 12 ids, e.g. 34x7-hfp2-rc4v, 83g3-92jg-28cx, r292-9mhp-454m | dev (electron-builder) | no: extracts toolchain archives electron-builder itself downloads, not user archives; app code does not import it | accept; clears with electron-builder 26 (major) |
| `tinypool` 1.1.1 (via vitest) | critical | 5gmw-xhrv-c9v3, 85c8-ppgw-ccpr | dev (vitest workers) | no: needs attacker control of worker options; test config is in-repo | accept; clears with vitest 4 (major) |
| `vitest` 2.1.9 | critical | 5xrq-8626-4rwp (UI server <3.2.6), 82fw-gwwq-j7x9 | dev (tests) | no: `@vitest/ui` not installed, `vitest` is only run as `vitest run` / watch locally | accept; vitest 4.1.12 (major) in the tooling slice |
| `@vitest/mocker` 2.1.9 | moderate | 82fw-gwwq-j7x9, qxg6-89mg-rqv8 | dev | no: same as vitest | accept (as above) |
| `vite` 5.4.21 | high | 8 ids: 4w7w-66w2-5vf9, 9jrq-w75r-8gcw, rq7h-c2jc-7f22, fx2h-pf6j-xcff, 4 launch-editor ids | dev server only (`vite`, `electron-vite dev`); production use is `vite build` | no for shipped; local dev server binds localhost (no `--host` in any script) | accept; needs vite 6.4.5+ (major, forces electron-vite 4+); owner decision |
| `esbuild` 0.21.5 (under vite, electron-vite) / 0.27.7 (under tsx) | moderate | 67mh-4wv8-2f99 (<=0.24.2), g7r4-m6w7-qqqr (0.27.3 to 0.28.0) | dev server only; the bundler at `package.json` `build:web` is top-level esbuild 0.25.12, not flagged | no: `esbuild serve` is never used | tsx copy: **fix now** (`tsx` 4.23.15 uses `~0.28.0`); 0.21.5 copies clear with the vite major bump |
| `postcss` 8.5.8 | high | qx2v-qp2m-jg93, 6g55-p6wh-862q, fxqj-rqcc-2cmp, r28c-9q8g-f849 | build tooling (vite CSS) | no: needs attacker-controlled CSS or source maps; inputs are in-repo CSS | **fix now**: 8.5.32 (in vite's `^8.4.43`) |
| `nanoid` 3.3.11 | high | 28wg-ghj8-5hjv, 2v37-7h3g-55p8, xwg4-73v4-xw9w | build tooling (postcss dependency) | no: postcss only calls the default generator with fixed size | **fix now**: 3.3.20 |
| `source-map-js` 1.2.1 | high | 68fv-2mgg-jv7q | build tooling (postcss) | no: indexed source map from untrusted source | **fix now**: 1.2.2 |
| `@babel/core` 7.29.0 | high | 4x5r-pxfx-6jf8 (file read via `sourceMappingURL`) | build tooling (`@vitejs/plugin-react`, `electron-vite`) | no: transforms own source only | **fix now**: 7.29.7 |
| `browserslist` 4.28.2 | high | c83g-rgw3-j3cx, 73wf-gq98-2v4g | build tooling (babel) | no: reads repo browserslist config only | **fix now**: 4.29.5 |
| `baseline-browser-mapping` 2.x | moderate | w5vr-8v7q-w6rv | build tooling | no | **fix now**: 2.11.34 |
| `ws` 8.20.0 (via jsdom 25) | high | 58qx-3vcg-4xpx, 96hv-2xvq-fx4p | test env only (`jsdom`); no `ws` import in `src/` | no: no test opens a WebSocket to an untrusted peer; the web server uses hono/node-server, not `ws` | **fix now**: 8.22.1 (in jsdom's `^8.18.0`) |
| `form-data` 4.0.5 (via jsdom, app-builder-lib) | high | hmw2-7cc7-3qxx (CRLF in field names) | dev (jsdom, electron-builder publish) | no: no multipart built from user input in these tools; the app's multipart handling is hono's, not form-data | **fix now**: 4.0.6 |
| `js-yaml` 4.1.1 (via electron-builder) | high | h67p-54hq-rp68, 52cp-r559-cp3m, 5p4m-2wfm-xmqj, 2883-xcg3-v3hh | dev (electron-builder reads `packaging/electron-builder.yml`) | no: parses the repo's own YAML | **fix now**: 4.3.2 (in `^4.1.0`) |
| `@xmldom/xmldom` 0.8.12 (via plist, osx-sign) | high | 14 ids, 2v35-w6hq-6mfw and others | dev (macOS signing path; the project builds Linux and Windows only) | no | **fix now**: 0.8.15 (in plist's `^0.8.8`) |
| `tmp` 0.2.5 (via tmp-promise, flatpak-bundler) | high | ph9p-34f9-6g65 | dev (flatpak path, unused: targets are AppImage and portable) | no | **fix now**: 0.2.7 |
| `builder-util-runtime` 9.2.4 / `app-builder-lib` 24.13.3 | high | p2f4-r6v6-j797, 7g7r-gx96-252g (both are electron-updater issues) | dev | no: `electron-updater` is not installed (`npm ls electron-updater` empty) and no `publish` config exists | accept; clears with electron-builder 26 (major) |
| `minimatch` 3.1.5 (nested in @electron/asar, @electron/universal) | high | g3hv-75wg-m249 | dev (electron-builder) | no: patterns come from builder config | accept; electron-builder 26 |
| `brace-expansion` (nested, same trees) | high | 12 ids, e.g. 3jxr-9vmj-r5cp, mh99-v99m-4gvg | dev (electron-builder) | no | accept; electron-builder 26 |
| `glob` (top-level and config-file-ts nested) | moderate | 3g3m-2fjr-6pw4 | dev (electron-builder) | no | accept; electron-builder 26 (not verified that a minor bump alone clears it) |
| `@tootallnate/once` 1.x (via http-proxy-agent) | low | vpq2-c234-7xj6 | dev | no | accept; electron-builder 26 |

### Rolled-up packages (no advisory of their own)

- electron-builder tree: `electron-builder`, `app-builder-lib`, `builder-util`, `electron-publish`, `dmg-builder`, `dmg-license`, `electron-builder-squirrel-windows`, `read-config-file`, `config-file-ts`, `@malept/flatpak-bundler`, `tmp-promise`, `@electron/asar`, `@electron/osx-sign`, `@electron/universal`, `dir-compare`, `plist`, `ejs`, `jake`, `filelist`, `archiver`, `archiver-utils`, `zip-stream`, `readdir-glob`, `http-proxy-agent`; severity follows their children. Hold on to electron-builder 24.13.3 until the major slice.
- vite tree: `vite-node`, `update-browserslist-db`, `electron-vite` (direct, via esbuild/vite/babel), `@vitejs/plugin-react` (direct, via babel/vite).
- Other: `jsdom` (direct, via ws and form-data: clears with the in-range bumps), `tsx` (direct, low, via esbuild), `@babel/helper-*` and `@babel/plugin-*` (low, via `@babel/core`).

## fix now

None is urgent: no advisory reaches a shipped runtime, a network-exposed process, or
attacker-influenced input, and `npm audit --omit=dev` is clean. "Fix now" below means
free: a lockfile-only refresh of existing semver ranges, no `package.json` range change,
no change to Electron or better-sqlite3. It should remove roughly 25 of the 59 flagged packages (estimate, not resolved)
including 2 of the 5 criticals (concurrently, shell-quote). Apply it as one slice and run `npm run verify`.

| Package | From | To | Why this range is safe |
|---|---|---|---|
| `concurrently` | 9.2.1 | 9.2.5 | stays inside `^9.1.2`; 9.2.5 depends on shell-quote 1.12.0 (9.2.1 pinned exact 1.8.3), which clears the only critical that is not blocked by a major bump |
| `ws` | 8.20.0 | 8.22.1 | jsdom 25.0.1 wants `^8.18.0` |
| `form-data` | 4.0.5 | 4.0.6 | `^4.0.0` in jsdom and app-builder-lib |
| `postcss` | 8.5.8 | 8.5.32 | vite 5.4.21 wants `^8.4.43` |
| `nanoid` | 3.3.11 | 3.3.20 | postcss `^3.3.x` |
| `source-map-js` | 1.2.1 | 1.2.2 | postcss `^1.2.x` |
| `@babel/core` | 7.29.0 | 7.29.7 | plugin-react `^7.28.0` |
| `browserslist` | 4.28.2 | 4.29.5 | babel helper `^4.24.x` |
| `baseline-browser-mapping` | 2.x | 2.11.34 | `^2.0.0` |
| `js-yaml` | 4.1.1 | 4.3.2 | `^4.1.0` in electron-builder packages |
| `tmp` | 0.2.5 | 0.2.7 | tmp-promise `^0.2.0` |
| `@xmldom/xmldom` | 0.8.12 | 0.8.15 | plist `^0.8.8` |
| `tsx` | 4.21.0 | 4.23.15 | stays inside `^4.19.4`; its esbuild range is `~0.28.0`, the advisory fixes at 0.28.1, so confirm the resolved esbuild is 0.28.1 or later after the refresh |

Not verified: I did not resolve this set with npm (a dry-run would still touch the shared
install tree), only checked each target against the registry and the dependents' ranges.
Do the refresh in a separate worktree with its own `npm ci`, then re-run `npm audit`.
Expected remaining after the refresh: the electron-builder tree, vite tree, vitest tree and
the esbuild copies under vite and electron-vite.

## Needs a major bump and an owner decision (separate slices)

Not `fix now`. None changes Electron or better-sqlite3, but each changes build tooling
majors and can break the build, so each wants its own slice and `npm run verify`.

1. **electron-builder 24.13.3 to 26.18.0.** Clears the tar (critical), minimatch,
   brace-expansion, glob, builder-util-runtime, app-builder-lib, form-data and
   @tootallnate/once entries (roughly 30 packages). Packaging config
   (`packaging/electron-builder.yml`: `npmRebuild: false`, `asarUnpack` for
   better-sqlite3, AppImage and portable targets) must be re-tested with
   `npm run package:local` and `package:win`. I did not check which of the 26.x
   dependency ranges clear every entry.
2. **vite 5.4.21 to 6.4.5 or later, with electron-vite 2.3.0 to 4 or later** (electron-vite
   2.x only supports vite 4 and 5; the current electron-vite peers are `vite ^6 || ^7 || ^8`).
   Clears vite (8 ids) and the old esbuild 0.21.5 copies. `@vitejs/plugin-react` 4.7.0
   still supports vite 6.
3. **vitest 2.1.9 to 4.1.12 or later.** Clears vitest, @vitest/mocker, tinypool (critical),
   vite-node. `jsdom` 25 is fine with vitest 4. Re-run the full suite (66 files, 365 tests
   at the baseline).

Electron 44.9.2 and better-sqlite3 13.0.3 need no change: neither is flagged, and none of
the fixes above touches them.

## Observations

- **Docker image carries dev tooling.** `Dockerfile` runs `npm ci` and never prunes.
  Optional hardening, not required by any advisory: after `npm run build:web`, run
  `npm prune --omit=dev` (better-sqlite3 stays; the bundle needs nothing else). Needs a
  Docker build and a smoke run, so it is a separate slice and not part of this triage.
- **Packaged desktop build.** The `dist/linux-unpacked` listing I used is from an older
  0.1.0 build (2026-08-07), so it shows better-sqlite3's older install chain (tar-fs,
  prebuild-install, minimist and others); the current lockfile has better-sqlite3 13 with
  only `node-addon-api` as a prod dependency (`npm ls --omit=dev`). None of those old
  packages are in today's audit. A fresh `package:local` and listing would confirm; I did
  not build.
- **`electron-updater`** appears in two advisory titles but is not installed; the GHSA ids
  are attributed to `app-builder-lib` and `builder-util-runtime` by npm.
- **Not determined:** why the in-session count was 43 (see Totals); whether
  `tsx` 4.23.15 resolves esbuild to 0.28.1 or later; whether a minor bump alone clears
  `glob`; whether electron-builder 26.18.0 clears every nested minimatch/brace-expansion
  copy.

## Decision

- Suitable to close the "triage open `npm audit` advisories" item: yes. The production
  tree is clean; all 59 flagged packages are tooling.
- Recommend: one lockfile-refresh slice (table above), then record the three major-bump
  slices as deferred with the reasons in this report.
- Approved by: pending repository owner
- Date: 2026-11-02
