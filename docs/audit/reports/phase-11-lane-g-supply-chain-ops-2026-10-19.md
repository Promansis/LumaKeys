# Lane Report: Phase 11 Lane G, Supply Chain, Build, And Operations

- Lane owner: Claude Code (acting)
- Reviewer/challenger: Claude Code (acting), second pass 2026-10-19
- Baseline identity: `main` at source identity `6e549b6`, [baseline](baseline-2026-10-19.md)
- Started: 2026-10-19
- Last updated: 2026-10-19
- Status: complete for static evidence; image build owed to sitting 0

## Scope

- Coverage rows: MOD-012, OP-011, OP-014 (deployment half is lane A)
- Inputs: [dependency triage](../evidence/phase-11-dependency-triage-2026-10-19.md), `package.json`, `Dockerfile`, `.dockerignore`, `packaging/`, `scripts/`, git history
- Explicit exclusions: no dependency was updated; recommendations only

## Evidence Plan

| Surface | Oracle/invariant | Method/fixture | Runtime | Expected artifact |
|---|---|---|---|---|
| Production dependencies | No shipped code path reaches a known-vulnerable API | `npm audit --omit=dev`; grep for the advisory's API in `src/server` | web | triage evidence |
| Shipped desktop runtime | Electron is a supported release | installed version vs Electron release policy; advisory list | Electron | triage evidence |
| Build chain | Advisories confined to developer machines | `npm audit` full set | both | triage evidence |
| Repository hygiene | No user data or secrets in history; build inputs are tracked | `git rev-list --objects`, `git ls-files`, `stat` | both | this report |
| Reproducibility | Image inputs pinned and verified | `Dockerfile` read | web | this report |

## Working Flows Confirmed

| Coverage row | Evidence | Conditions/limits | Disposition |
|---|---|---|---|
| OP-011 | `hono` 4.13.0 and `@hono/node-server` 2.1.0 carry four advisories with no fix. Reachability: `parseBody()` not used (server uses `formData()` and `req.json()`); `toSSG()` not used; `hono/jsx` not used; the query-fragment parser advisory concerns `c.req.query()`, which is not used, and the token gate reads `new URL(c.req.url).searchParams` directly | Reviewed by grep on 2026-10-19; re-check when hono publishes a fix | covered: not reachable, record as accepted environment state until a fixed version exists |
| MOD-012 | `Dockerfile` pins MuseScore 4.7.5 by URL and SHA-256 and fails closed on mismatch; `node:22-bookworm` base; `npm ci` with Electron rebuild skipped; `COPY` scope narrow (`package*.json`, `scripts`, configs, `src`, `public`) | Local Node is 24.15.0 vs image Node 22; no behavior difference found in tests, but `better-sqlite3` is rebuilt per runtime; record the supported range in README | covered |
| MOD-012 | `.dockerignore` excludes data dirs, databases, `.env*`, `.git`, `.claude`, Playwright and audit dirs | Root MP4 sources and `scratch/` are in the build context but never copied; local daemon only | covered |
| MOD-012 | `scripts/assert-electron-assets.mjs` passes with 649 files | Not referenced by any npm script, so it does not gate packaging (see PH-PAR-001 re-verification note) | covered with note |
| MOD-012 | Sample and soundboard download scripts fetch from `github.com`, `raw.githubusercontent.com`, `gleitz.github.io`, `directory.audio` without checksums | Build-time developer scripts, outputs committed under `public/`; not a runtime path | hardening note, no finding |

## Findings

| Finding | Why it belongs to this lane | Shared lanes |
|---|---|---|
| PH-OPS-003 | Shipped desktop runtime is past end of life | Security (37 high advisories, several on context isolation) |
| PH-OPS-004 | Repository history holds a user database | Persistence (personal practice data) |
| PH-OPS-005 | No continuous integration enforces the baseline | Architecture (untestable boundary over time) |

## Evidence Gaps

| Coverage row | Missing proof | Why blocked | Owner | Next action |
|---|---|---|---|---|
| MOD-012 | Image builds from the current Dockerfile with the MuseScore stage and starts | Docker socket not reachable from the agent sandbox | owner | sitting 0 item 2 |

## Hygiene Notes (no finding)

- `public/assets/main-menu/bck.jpg` and a long-named `.jpeg` are untracked yet get copied into `out/renderer` by the build and counted by the asset assertion; a fresh clone will build without them. They are unreferenced by source; delete or track them.
- Three identical 25 MB `loop-raw*.mp4` sources and four audit PNGs sit untracked in the repository root; move raw media out of the tree.
- `public/assets/main-menu/mainmenu-neonbackground.png` (5.8 MB) is tracked beside its `.webp`; if only the `.webp` is served, the PNG is dead weight in every clone and in the Docker context.
- Working tree is 86 MB tracked, `.git` is 126 MB; the soundboard audio under `public/soundboard` and `scripts/animal-soundboard-local` is most of it.
- `.mcp.json`, `.gitmodules`, and shell dotfiles that appear untracked in the root during agent sessions are zero-byte sandbox placeholders owned by `nobody`, not repository files.

## Challenge Summary

- Claims disproved or narrowed: the hono advisories were narrowed to "not reachable" by API grep rather than accepted as findings.
- Severity changes: Electron EOL entered at P2 (no demonstrated exploit path through the app's `loadFile` + context-isolation configuration, but no vendor patches for a shipped renderer engine).
- Environmental failures separated: Docker socket denial is an agent-sandbox limit.

## Lane Exit Check

- [x] Every assigned coverage row has an owner.
- [x] Every assigned row has evidence and disposition, or an explicit gap.
- [x] All findings link to detailed reports and coverage rows.
- [x] P0/P1 leads were independently challenged (none).
- [x] Positive/working behavior is recorded.
- [x] Manual and hardware gaps are explicit.
- [ ] Coverage summary counts were updated (run recount at close).

## Sign-Off

- Lane owner/date: Claude Code (acting), 2026-10-19
- Challenger/date: Claude Code (acting), 2026-10-19
- Audit lead/date: pending
