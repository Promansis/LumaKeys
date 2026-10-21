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
facts below were checked against `main` at `5017b8e`; the Phase 11 remediation plan
changes some of them, and the plan says which.

Commands live in `package.json` scripts. Docker and Cloudflare Tunnel host setup
lives in [`README.md`](README.md) ("Where Data Is Stored", "Protect the Web APIs");
do not copy it here.

### Electron Desktop

- **Main** (`src/main/index.ts`): window creation (minimum 1180x780), file dialogs,
  startup migration, and the IPC handlers (68 `ipcMain.handle` registrations).
  Desktop import accepts MIDI only.
- **Preload** (`src/main/preload.ts`): context-isolated bridge that exposes
  `window.appBridge`, typed by `src/shared/ipc.ts`.
- **Database**: `AppDatabase` runs in the main process at `<userData>/lumakeys.db`,
  with `midi-files/` and `instrument-sample-packs/` beside it. `userData` is named
  after `package.json` `name`, so it is `<appData>/lumakeys` (`~/.config` on Linux,
  `%APPDATA%` on Windows).

### Web Runtime

- **Server** (`src/server/index.ts`): Hono on `@hono/node-server`.
  - `PORT` defaults to `3100`. The Docker image and `docker-compose.yml` set `3001`.
  - Data directory, first match wins: `LUMAKEYS_DATA_DIR` (non-blank),
    `PIANOHERO_DATA_DIR` (non-blank), an existing `./.lumakeys-data`, an existing
    `./.pianohero-data`, then `./.lumakeys-data`. A checkout that only has
    `.pianohero-data` uses it. See [ADR 0002](docs/adr/0002-legacy-pianohero-compatibility-window.md).
  - The database is `<dataDir>/lumakeys.db` and imported MIDI is `<dataDir>/midi-files`.
  - `/api/*` goes through `createApiAccessGate` (`src/server/webSecurity.ts`). It
    checks `LUMAKEYS_WEB_ACCESS_TOKEN` (legacy `PIANOHERO_WEB_ACCESS_TOKEN`) and lets
    every request through when no token is set. `GET /api/access` answers
    `{ ok: true }`. Responses carry `Permissions-Policy: midi=(self)`.
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
  time, through the executable named by `LUMAKEYS_MUSESCORE_PATH`.
- **Client shim** (`src/renderer/webBridge.ts`): installs a `window.appBridge` proxy.
  RPC methods `fetch` `/api/bridge/{method}` with `{ args }`. Desktop-only methods
  (`WEB_STUB_BRIDGE_METHODS` in `src/shared/bridgeMethods.ts`: native file dialogs
  and the sample-directory picker) resolve to `null`. It is installed from
  `src/renderer/main.tsx` when the build-time `IS_WEB` define is true
  (`vite.web.config.ts` sets `'true'`, `electron.vite.config.ts` sets `'false'`).
  Use `IS_WEB` to branch between runtimes.
- **Second TypeScript project**: `tsconfig.server.json` type-checks `src/server`,
  `src/persistence`, `src/storage`, `src/shared`, and the `src/lib` modules the
  server imports (`achievements`, `game`, `recommendations`, `midiFileParser.ts` and
  `importMetadata.ts`).
- **Docker**: `Dockerfile` starts from `node:22-bookworm`. On amd64 it installs
  MuseScore Studio 4.7.5 from a checksummed AppImage and sets
  `LUMAKEYS_MUSESCORE_PATH`. It builds with `npm run build:web`, sets `PORT=3001`
  and `LUMAKEYS_DATA_DIR=/data`, and runs `npm run start:web`. `docker-compose.yml`
  bind-mounts host `/media/storage/lumakeys` to `/data`.

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
  `requestAnimationFrame` loop (about 60 fps) drives canvas updates and session ticks.
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
| Brand migration | `src/persistence/legacyBrandMigration.ts` | Startup carry-over of PianoHero names (ADR 0002) |
| Web security | `src/server/webSecurity.ts` | API access gate and request body limits |
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
