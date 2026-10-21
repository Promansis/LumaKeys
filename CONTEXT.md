# LumaKeys Context

## Purpose

This document defines the stable language and system boundaries used when planning,
auditing, and changing LumaKeys. `PRODUCT.md` defines the product intent and
`DESIGN.md` defines the visual system. Architecture decisions belong in
`docs/adr/`. The audit and its agent playbooks cite this file for architecture and
runtime facts; the local, untracked agent instruction files are not a source.

## Product Boundary

LumaKeys is a single-user piano-learning application for beginner and
intermediate players. It supports two host runtimes:

- Electron desktop.
- A desktop-browser web runtime backed by Node, Hono, SQLite, and app-owned files.

Mobile is not a supported runtime or viewport. Mobile responsiveness, touch-first
navigation, and mobile performance are not acceptance criteria. UI validation
instead covers the supported minimum desktop window, the default 1480x960 layout,
larger desktop windows, 125-200% zoom, high-DPI output, keyboard-only operation,
reduced motion, canvas visibility, and MIDI-device workflows.

## Domain Language

- **Song**: imported MIDI metadata plus an app-owned reference to the MIDI bytes.
- **Library**: songs, folders, playlists, tags, song goals, custom fingerings, and
  the operations used to organize or back them up.
- **Practice session**: a configured gameplay run for a song, lesson, drill, or
  capstone.
- **Theory session**: a quiz, interval-trainer, or scale-practice run whose result
  may be persisted.
- **Practice engine**: deterministic gameplay, MIDI interpretation, scoring,
  timing, looping, waiting, fingering, input normalization, and audio scheduling.
- **App bridge**: the typed `window.appBridge` contract shared by renderer code and
  the Electron/web runtime implementations.
- **Runtime adapter**: host-specific implementation of bridge, storage, file,
  upload/download, and privileged behavior.
- **Persistence**: SQLite-backed structured state owned by `AppDatabase` in
  `src/persistence/database.ts`.
- **Storage**: app-owned MIDI and sample bytes plus the path-containment and file
  lifecycle rules around them.
- **Finding**: one evidence-backed defect or risk tracked in
  `docs/audit/findings-ledger.md`.
- **Disposition**: the current decision for a coverage item or finding, including
  accepted risk, remediation, or evidence that no gap was found.

## User Journeys

The audit inventory starts with these journeys and expands only when evidence shows
another user-visible workflow:

1. First-run setup and MIDI/keyboard configuration.
2. Song import, reattachment, organization, editing, and deletion.
3. Song practice, track assignment, gameplay, results, retry, and next-song flow.
4. Lessons, generated drills, curriculum capstones, and learning progression.
5. Theory quiz, interval training, and scale practice.
6. Free play, recording, backing audio, and MIDI/WAV export.
7. Novelty soundboard play.
8. Progress, recommendations, achievements, goals, and trouble spots.
9. Settings, latency calibration, sample packs, and input/audio preferences.
10. Library backup/restore, learning reset, and full user-data reset.

## Current Ownership

| Concern | Current owner |
|---|---|
| Product and visual acceptance | `PRODUCT.md`, `DESIGN.md` |
| App shell and route orchestration | `src/renderer/App.tsx` |
| Screen presentation and local interaction | `src/renderer/components/*` |
| Deterministic domain logic | `src/lib/*` |
| Shared bridge and persisted DTO contracts | `src/shared/*` |
| Electron host behavior | `src/main/*` |
| Browser bridge behavior | `src/renderer/webBridge.ts` |
| Web host behavior | `src/server/*` |
| Structured persistence | `src/persistence/*` |
| App-owned MIDI storage | `src/storage/*` |
| Audit governance and current ledgers | `docs/audit/*` |
| Historical architecture investigation | `.codex-audits/codebase/*` |

Historical audit artifacts are leads, not current findings. Reproduce and cite their
claims before entering them into the live findings ledger.

## Dependency Direction

```text
renderer screens -> renderer services -> domain modules
                 -> window.appBridge -> runtime adapter

runtime adapters -> shared contracts -> persistence/storage
domain modules   -> shared plain-data types where needed
```

Renderer code must not import Electron, server, SQLite, or privileged filesystem
implementations. Domain modules must remain testable without a host runtime.
Runtime-specific differences must be explicit in bridge categories or UI gating.

## Runtime Architecture

LumaKeys ships two runtimes from one source tree. Both share `src/lib/` (game,
theory, audio, input), the React screens under `src/renderer/`, and the single
`AppDatabase` class. Only the transport between renderer and database differs. The
facts below were checked against `main` at `7cf0c62`; the web access, security
header and CI facts were updated for `64a8160` after slices 2 and 0 merged, and the
Electron desktop and browser carry-over facts for `a84acb0` after slices 1, 15 and 3
merged. Remediation slices change some of these facts; the slice that changes one
updates this section.

Commands live in `package.json` scripts. `npm run verify` is the full check: the
typecheck, the server typecheck (`tsc --noEmit -p tsconfig.server.json`), `npm test`,
`npm run build`, `npm run build:web` and `scripts/assert-electron-assets.mjs`.
`.github/workflows/verify.yml` runs it on Node 22, then
`node scripts/audit/recount-coverage.mjs --check`, on pushes to `main` and on pull
requests. The `package:local` and `package:win` scripts also run the asset assertion
before `electron-builder`. Docker and Cloudflare Tunnel host setup lives in
[`README.md`](README.md) ("Where Data Is Stored", "Protect the Web APIs"); do not copy
it here.

### Electron Desktop

- **Runtime**: Electron 44.9.2 with `better-sqlite3` 13.0.3 (`package.json`). better-sqlite3
  13 is an N-API build: one prebuilt binary per platform loads in Node and in Electron, so
  there is no per-Electron-version rebuild and `electron-builder` runs with
  `npmRebuild: false` (`packaging/electron-builder.yml`). `npm ci` still runs `node-gyp`
  for it at install, which needs Python 3, `make` and a C++ compiler (Visual Studio Build
  Tools on Windows) and access to nodejs.org; `BUILD_PORTABLE.md` gives the
  `npm ci --ignore-scripts` then `node scripts/postinstall.cjs` route for a machine
  without them.
- **Main** (`src/main/index.ts`): window creation (minimum 1180x780), file dialogs,
  startup migration, and the IPC handlers (68 `ipcMain.handle` registrations).
  Desktop import accepts MIDI only. The file dialogs pass no `defaultPath` for the 8 open
  dialogs, so since Electron 43 they open in Downloads ([PH-UI-021](docs/audit/reports/findings/PH-UI-021.md)).
- **Profile**: `userData` is pinned at module top level, before `ready`, to
  `<appData>/lumakeys` (`desktopProfileDir` in `src/main/desktopStartup.ts`; `~/.config`
  on Linux, `%APPDATA%` on Windows), and `app.setName('LumaKeys')` runs there too.
  Electron's own default (`package.json` `name`) is not used. `AppDatabase` runs in the
  main process at `<userData>/lumakeys.db`, with `midi-files/` and
  `instrument-sample-packs/` beside it. An installed pack's address is derived from the
  current profile on each read, not from the folder stored at install time.
- **Startup** (`runDesktopStartup` in `src/main/desktopStartup.ts`): the former `whenReady`
  body is `startDesktopApp()`. Any error is logged, shown with `dialog.showErrorBox`
  (title "LumaKeys could not start") and the process exits with code 1; the app never
  keeps running with no window.
- **Single instance**: `app.requestSingleInstanceLock()` is taken before startup. A second
  launch quits, and the first one restores (if minimised) and focuses its window.
- **Legacy profile migration** (`migrateLegacyBrand` in `src/persistence/legacyBrandMigration.ts`,
  ADR 0002), run before the database opens, from `<appData>/luma-keys`, `piano-hero` and
  `PianoHero` (`legacyProfileDirs`, newest first):
  - It takes the one candidate that holds `pianohero.db`. If two or more do, startup is
    refused with the error dialog above, naming each folder and saying nothing was moved.
  - A current `lumakeys.db` with no user rows (songs, results, practice days, unlocked
    achievements, folders, playlists, lesson progress) is set aside in a
    `before-legacy-migration-<time>` folder inside the profile and replaced. One with user
    rows opens a question dialog ("Earlier library found": Use earlier library, Keep
    current library, Quit; Quit is the default). Using the earlier library keeps the
    current one in the backup folder; keeping the current one is stored in
    `legacy-library-choice.json` and the question is not asked again; Quit leaves
    everything as it was.
  - It folds the earlier database's WAL in first so the database moves as one file, refuses
    (with the safe next step in the message) while a database is open elsewhere, damaged,
    unreadable or on another drive, and finishes a move an earlier build left half done.
    Nothing is deleted.
- **Window security**: `createMainWindow` sets `contextIsolation: true`,
  `nodeIntegration: false` and an explicit `sandbox: true`, and calls `installWindowGuard`
  (`src/main/windowGuard.ts`). No window other than the main one ever opens
  (`setWindowOpenHandler` denies every request); an `https:` link is passed, normalised, to
  `shell.openExternal` and opens in the system browser, and any other scheme opens
  nothing. A `will-navigate` handler cancels navigation away from the packaged
  `index.html` (same host and path; any hash or query) or the dev-server origin.
  `will-frame-navigate` and `will-redirect` are not guarded.
- **Preload** (`src/main/preload.ts`): context-isolated bridge that exposes
  `window.appBridge`, typed by `src/shared/ipc.ts`.

### Web Runtime

- **Server** (`src/server/index.ts`): Hono on `@hono/node-server`.
  - `PORT` defaults to `3100`. The Docker image and `docker-compose.yml` set `3001`.
  - Data directory, first match wins: `LUMAKEYS_DATA_DIR` (non-blank),
    `PIANOHERO_DATA_DIR` (non-blank), an existing `./.lumakeys-data`, an existing
    `./.pianohero-data`, then `./.lumakeys-data`. A checkout that only has
    `.pianohero-data` uses it. See [ADR 0002](docs/adr/0002-legacy-pianohero-compatibility-window.md).
  - The database is `<dataDir>/lumakeys.db` and imported MIDI is `<dataDir>/midi-files`.
  - Web access gate (`src/server/webSecurity.ts`, installed by `installWebAccess` in
    `src/server/index.ts`). `resolveWebAccessPolicy` runs first in `startServer`, before
    the data directory, the database or the port is touched. A token in
    `LUMAKEYS_WEB_ACCESS_TOKEN` (legacy `PIANOHERO_WEB_ACCESS_TOKEN`; blank counts as
    unset) gates `/api/*`. With no token, the server refuses to start (exit 1) unless
    `LUMAKEYS_TRUST_UPSTREAM_AUTH=1`, which starts it with no gate and a logged warning
    (for a host that Cloudflare Access already protects). The placeholder
    `change-this-long-random-token`, which `docker-compose.yml` supplies when `.env` has
    no token, is refused in every mode.
  - Sign-in: `GET /login` serves a static form (no script) that posts the token to
    `POST /api/access` (body limit 4 KiB). A good token sets an HttpOnly,
    `SameSite=Strict` cookie scoped to `Path=/api` and redirects to `/`. The cookie gets
    `Secure` when the request URL is https, or when a proxy reports https through the
    first `X-Forwarded-Proto` value or Cloudflare's `Cf-Visitor` (`isSecureRequest`); a
    forged header can only add the flag. Scripts can post JSON `{"token":"..."}` or send the
    `x-lumakeys-access-token` header. The gate reads the header or the cookie only; a
    token in the query string is not accepted. An unsigned API call gets 401 with "Sign
    in at /login." `GET /api/access` answers `{ ok: true }` once past the gate. Trust mode
    installs no `/login` route. Responses carry `Permissions-Policy: midi=(self)`.
  - HTML security headers: `htmlSecurityHeaders()` adds the
    Content-Security-Policy (`src/shared/contentSecurityPolicy.ts`, plus
    `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`,
    `Referrer-Policy: no-referrer` and `X-Frame-Options: DENY` to every `text/html`
    response (the app shell, the SPA fallback and `/login`). Both production builds
    (`vite.web.config.ts` and `electron.vite.config.ts`) put the same policy, without
    `frame-ancestors`, in the built `index.html` as a `<meta http-equiv>` tag through
    the `contentSecurityPolicyMeta()` plugin. Dev servers get no policy.
  - `createStaticFileHandler` (`src/server/staticFiles.ts`) serves the built SPA from
    `dist/web` under the working directory, with explicit MIME types, cache headers
    and single byte ranges (the menu video needs them).
- **Routers**:
  - `bridgeRouter.ts`: `POST /api/bridge/:method`, dispatching to the same
    `AppDatabase` methods the IPC handlers call.
  - `libraryRouter.ts`: `GET /api/library/export` and `POST /api/library/import`.
  - `midiRouter.ts`: `POST /api/midi/upload` (`.mid`, `.midi` and `.mscz`),
    `POST /api/midi/:songId/reattach`, and `GET /api/midi/:songId` to stream bytes.
- **MuseScore**: `src/server/museScore.ts` converts `.mscz` to MIDI one score at a
  time, through the executable named by `LUMAKEYS_MUSESCORE_PATH`. It works on Linux
  only and needs `prlimit`; on any other platform the import fails.
- **Client shim** (`src/renderer/webBridge.ts`): installs a `window.appBridge` proxy.
  RPC methods `fetch` `/api/bridge/{method}` with `{ args }`. Desktop-only methods
  (`WEB_STUB_BRIDGE_METHODS` in `src/shared/bridgeMethods.ts`: native file dialogs
  and the sample-directory picker) resolve to `null`. It is installed from
  `src/renderer/main.tsx` when the build-time `IS_WEB` define is true
  (`vite.web.config.ts` sets `'true'`, `electron.vite.config.ts` sets `'false'`).
  Use `IS_WEB` to branch between runtimes. The first 401 from the API sends the browser
  to `/login`, once per page load (`src/renderer/loginRedirect.ts`).
  - Browser carry-over of pre-rename stores (ADR 0002, removal no earlier than
    2027-01-31): `webBridge.ts` copies the packs in the IndexedDB database
    `pianohero-instrument-sample-packs` into `lumakeys-instrument-sample-packs` once per
    page, only while the current one holds no packs, and deletes the old database after the
    copy commits (a failed copy keeps it); `src/renderer/legacyFilterPresets.ts` does the
    same for `localStorage` `pianohero-filter-presets` when the library opens. When both
    names hold data the current one wins and the old one stays until a user-data reset,
    which clears both.
- **Second TypeScript project**: `tsconfig.server.json` type-checks `src/server`,
  `src/persistence`, `src/storage`, `src/shared`, and the `src/lib` modules the
  server imports (`achievements`, `game`, `recommendations`, `midiFileParser.ts` and
  `importMetadata.ts`).
- **Docker**: `Dockerfile` starts from `node:22-bookworm`. The image build
  requires amd64. It installs the MuseScore Studio version pinned in the
  Dockerfile from a checksummed AppImage and sets `LUMAKEYS_MUSESCORE_PATH`. It builds with `npm run build:web`, sets `PORT=3001`
  and `LUMAKEYS_DATA_DIR=/data`, and runs `npm run start:web`. `docker-compose.yml`
  bind-mounts host `/media/storage/lumakeys` to `/data` and reads
  `LUMAKEYS_WEB_ACCESS_TOKEN` from a `.env` file next to it.

### Renderer

- `src/renderer/App.tsx` routes with a `currentScreen: AppScreen` discriminated
  union in `useState`. There is no router library and no Redux. Each variant carries
  the data its screen needs (selected song, session config, playlist queue, results).
- Renderer code always goes through `window.appBridge`. It never imports
  `src/persistence/database.ts` and never assumes Electron-only APIs.
- Screens are `src/renderer/components/*Screen.tsx`: main menu, library, game,
  results, free play, novelty soundboard, scale practice, interval trainer, theory
  hub and quiz, learn hub and lesson, progress dashboard, settings, keyboard setup,
  and setup guide. The main menu plays a looping video background
  (`/assets/main-menu/mainmenu-neonbackground.webm`).

### Design Patterns

- **Ref-based services**: `AudioEngine`, `MidiInputService` and
  `ComputerKeyboardInputService` are held as `useRef` in `App.tsx` and passed down as
  props. `GameSession` is created per run inside `GameScreen.tsx`.
- **Canvas for visuals**: gameplay and free-play visuals use Canvas 2D, not DOM. A
  `requestAnimationFrame` loop (once per display frame) drives canvas updates and session ticks.
- **Time-based gameplay**: callers pass a `performance.now()` timestamp to
  `GameSession`, which derives song time from it. While the session is not playing the
  song clock is frozen (`GameSession.getCurrentTimeSec`).
- **Settings round trip**: settings changes go through an `appBridge` round trip (IPC
  in Electron, HTTP in web). Song and track changes return new objects.
- **Learning progress** is stored through bridge settings
  (`src/lib/learning/learningProgress.ts`), not `localStorage`.

### Key Modules

| Area | Path | Purpose |
|---|---|---|
| Game engine | `src/lib/game/GameSession.ts` | Timing, scoring, combo, note matching (hit window), visible-note windowing |
| Game types | `src/lib/game/types.ts` | `ParsedSong`, `ParsedNote`, `PlaybackSnapshot`, session config |
| Song utils | `src/lib/game/songUtils.ts` | MIDI to game conversion, hand assignment (split at MIDI 60, C4), track assignment |
| Audio | `src/lib/audio/audioEngine.ts` | Tone.js `Sampler` with `PolySynth` fallback; note on and off, sustain, tempo |
| MIDI parsing | `src/lib/midi/midiFileParser.ts` | `@tonejs/midi` wrapper to `ParsedSong` |
| MIDI input | `src/lib/midi/midiInputService.ts` | Web MIDI API, real-time input, device hot-swap |
| Computer-keyboard input | `src/lib/input/computerKeyboardInputService.ts` | Fallback keyboard-as-piano input |
| Piano layout | `src/lib/piano/pianoLayout.ts` | 88-key geometry shared by canvas and keyboard view |
| Theory | `src/lib/theory/*` | Scales, chords, intervals, key detection, per-song analysis |
| Achievements | `src/lib/achievements/*` | Unlock rules evaluated after sessions |
| Recommendations | `src/lib/recommendations/recommendationEngine.ts` | Next-song suggestions from history and stats |
| Learning | `src/lib/learning/*` | Five-tier curriculum (novice to expert), drill generation, progress, developer unlocks |
| Bridge contract | `src/shared/ipc.ts`, `src/shared/bridgeMethods.ts` | `AppBridge` type; RPC, special and stub method categories |
| Web bridge | `src/renderer/webBridge.ts` | Browser implementation of `window.appBridge` |
| MIDI storage | `src/storage/midiStorage.ts` | App-owned MIDI byte storage adapter |
| Brand migration | `src/persistence/legacyBrandMigration.ts` | Startup carry-over of PianoHero names: desktop profile lookup, backups and choice, web same-directory rename (ADR 0002) |
| Desktop startup | `src/main/desktopStartup.ts` | Pinned profile directory, the startup error boundary, the earlier-library question |
| Window guard | `src/main/windowGuard.ts` | Window-open and navigation policy for the main window |
| Browser carry-over | `src/renderer/webBridge.ts`, `src/renderer/legacyFilterPresets.ts` | Pre-rename IndexedDB packs and filter presets (ADR 0002) |
| Web security | `src/server/webSecurity.ts` | Startup access policy, `/login` sign-in, API access gate, HTML security headers and request body limits |
| Content Security Policy | `src/shared/contentSecurityPolicy.ts` | The one policy behind the web header and the built `index.html` meta tag |
| Static files | `src/server/staticFiles.ts` | SPA files, MIME types, cache headers, byte ranges |
| MuseScore import | `src/server/museScore.ts` | `.mscz` to MIDI conversion (web runtime only) |
| Free-play visuals | `src/renderer/components/FreePlayCanvasScene.tsx`, `FreePlayVisualizer.tsx` | Canvas scene graph, visualizer and visual types |
| Canvas gameplay | `src/renderer/components/FallingNotesCanvas.tsx` | Falling notes, hit line, hand coloring |
| Piano view | `src/renderer/components/PianoKeyboard.tsx` | 88-key view with active and cue highlighting |

## Durable State

SQLite currently owns songs, user stats, game results, theory results, settings,
fingerings, folders, playlists, playlist membership, practice days, achievements,
trouble spots, and measure-accuracy history. MIDI files and instrument samples also
have a durable lifecycle outside SQLite. Browser-local state and IndexedDB-backed
sample assets must be included when tracing reset, backup, restore, and parity.

No audit or test may use the owner's production database or data directory. Runtime
proof must use an isolated absolute directory under `/tmp` through a non-blank
`LUMAKEYS_DATA_DIR` or the equivalent Electron test profile. A blank value falls
back to the working directory's `.lumakeys-data` or `.pianohero-data`, which may be
the owner's development data.

## Quality Priorities

In order of risk:

1. No user-data loss, arbitrary file access, or unsafe privileged operations.
2. Musically correct timing, input, scoring, progression, and theory behavior.
3. Equivalent user outcomes across supported runtimes, with explicit exceptions.
4. Readable, operable practice UI while the user's hands are occupied.
5. Recoverable errors, reproducible builds, and diagnosable operations.
6. Clear ownership and testable module boundaries based on observed behavior.

## Change Policy

Discovery is read-only. Findings do not authorize fixes. Accepted findings become
small vertical remediation slices with their own regression proof. Large files are
investigation targets, not automatic refactor targets. Architecture changes require
an ADR when they alter ownership, dependency direction, persistence, runtime support,
or a public contract.
