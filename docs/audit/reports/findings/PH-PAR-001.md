# PH-PAR-001: Electron Production Output Omits Required Public Runtime Assets

- Lane: runtime parity
- Severity: P1
- Confidence: high
- Status: fixed
- Owner: Codex (acting)
- Challenger: Codex, fresh build plus isolated Electron/web runtime challenge
- Verifier: independent fresh-context verification agent; complete packaged workflow proof pending
- Affected runtime: Electron
- Coverage rows: WF-011, WF-016, WF-019, BR-060, BR-067, OP-006, MOD-012
- Related/duplicate findings: none
- First observed against: `808e6739e55b5186e8a9565f2c4e9267c4894a6c` plus the chartered audit patch identity

## User Impact

The Electron production renderer cannot load curriculum capstone MIDI files. A learner can reach a capstone, select it, and remain on the current screen while the error is only written to the console. The same missing public directory also removes soundboard assets and managed sample-pack manifests/assets from Electron build output. This blocks a core learning workflow on the supported desktop runtime, so it is P1.

## Expected Behavior Or Oracle

Electron and desktop web must provide equivalent supported learning and sample-pack outcomes, unless the exception is explicitly surfaced in the product UI. The Electron renderer/package must contain every static asset addressed by its bridge or renderer. See `CONTEXT.md`, `docs/audit/README.md` Phase 4, and the runtime/data audit invariant for explicit runtime categories.

## Evidence

### Environment

- Commit/patch identity: charter baseline above.
- OS/runtime/browser: Linux x86_64, Electron 30.5.1, Chrome 149.0.7827.114.
- Data profile/fixture: isolated `/tmp` Electron profile; public `ode-to-joy.mid` fixture.
- Hardware: none.

### Reproduction

1. Run `npm run build` from the repository root.
2. Inspect the newly produced `out/renderer` tree.
3. Start Electron against an isolated profile and invoke `window.appBridge.loadCurriculumMidi('ode-to-joy.mid')` through the renderer.
4. Run the web build/server and invoke the matching web bridge method.

The fresh build passed but left `out/renderer/curriculum-midis`, `out/renderer/soundboard`, and the public main-menu asset absent. Electron returned ENOENT for the capstone path; the web bridge returned the 614-byte MIDI file. Repeated once after a fresh build with the same result.

### Artifacts

- Electron reads its required curriculum asset from `out/renderer`: `src/main/index.ts:398`.
- `startCapstone` catches the load error only to `console.error`: `src/renderer/App.tsx:1087`.
- The web Vite build declares `publicDir: '../../public'`: `vite.web.config.ts:7`; the Electron renderer build has no equivalent: `electron.vite.config.ts:20`.
- Electron packaging includes only `out/**/*`, package metadata, and dependencies: `packaging/electron-builder.yml:7`.
- Fresh build output warned that `/assets/main-menu/mainmenu-neonbackground.webp` and `.png` remained unresolved at runtime.
- The complete command/result summary is recorded in [Phase 4](../phase-4-runtime-parity-2026-07-12.md#p4-par-001-fresh-electron-build-asset-check).

## Root Cause

The public asset copy contract exists only in `vite.web.config.ts`. Electron's renderer build uses a different Vite configuration with no public directory, while packaging only includes the already-incomplete `out` tree. The Electron bridge then resolves a path that the build never produces.

## Recommended Remediation Boundary

Make `public/` a declared Electron renderer/package input, with one canonical asset-location policy shared by Electron bridge reads and renderer URLs. Add a build-output assertion for curriculum MIDI, a soundboard sample, a main-menu asset, and a managed pack manifest/asset. Do not treat the source-tree `public/` directory as a runtime fallback for packaged builds.

## Required Regression Proof

- Deterministic unit/integration proof: build-output manifest test asserts the required public assets exist in Electron output.
- Electron proof: a fresh built/packaged profile loads all curriculum capstones and installs one managed sample pack.
- Web proof: web asset paths continue to load after the shared asset policy change.
- Data/recovery proof: failed managed-pack installation leaves no misleading installed record.
- Manual hardware/UI proof: capstone failure is visible/recoverable if a required asset is genuinely absent.
- Broader regression command: `npm test`, `npm run build`, `npm run build:web`, and the relevant package command.

## Challenge Record

- Independent reproduction attempt: [PH-PAR-001 challenge](../challenges/PH-PAR-001.md).
- Alternative explanations tested: stale output was eliminated by a fresh successful build; web asset success proved the fixture and path are valid.
- Scope/severity changes: broadened from curriculum MIDI to the shared public-asset packaging boundary after output inventory showed soundboard and managed-pack assets absent too.
- Deduplication decision: distinct packaging/runtime root cause; do not duplicate PH-DATA or PH-SEC findings.
- Challenger conclusion and date: accepted as P1, 2026-07-12.

## Resolution

- Accepted/rejected rationale: a fresh build and real Electron bridge call reproduce a blocked capstone while web succeeds.
- Fix branch/commit/issue: `d5839aa`, verified implementation in `d4ba395`.
- Verification evidence: clean Linux build/package, 646-file asset assertion, AppImage/unpacked launch, and independent package inspection pass; capstone/managed-pack workflow and visible missing-asset recovery proof remain in [Phase 10](../phase-10-verification-2026-08-07.md).
  [Sitting 1](../phase-11-owner-sittings-2026-10-20.md#sitting-1-linux-display-and-speakers) item 1, 2026-10-20, run by the agent on a packaged Linux build from HEAD (`linux-unpacked`), with real X key and click events: (a) the main-menu video plays, `currentTime` 1.99 to 7.32 s in 5 s, 23.75 % of pixels change; (b) "Flute Enhanced Pack ready." with 10 files in userData; (c) the capstone is locked on a fresh profile, so the six Novice lessons were marked complete through `appBridge.setSetting` and the renderer reloaded (a deviation from the user path). Ode to Joy then started on a real Space, 8 real presses gave 10 distinct canvas frames and the score went 0 to 200; the pause overlay's exit reads "Back to Learn Hub".
- Residual risk: `assert-electron-assets.mjs` is not yet part of `package:*` (slice 0). The Windows packaged build is untested until [sitting 2](../phase-11-owner-sittings-2026-10-20.md#sitting-2-windows) runs.
- Slice 0 (2026-10-21, `remediation/p11-s00-ci`, merged to `main` in `d49b8a6`, run by the agent): `package:local` and `package:win` now run `node scripts/assert-electron-assets.mjs` after `npm run build` and before `electron-builder`, which supersedes the first sentence of the residual risk above; the Windows package is still owed (sitting 2). `scripts/verifyWiring.test.mjs` (`PH-PAR-001 package scripts`) fails on the old scripts and passes now, for every `package:*` script. The assertion also runs in `npm run verify` and the CI workflow. With a public file removed from `out/renderer`, the assertion exits 1 with ENOENT naming the file. I did not run `package:*` itself (it switches the shared better-sqlite3 to the Electron ABI), so the packaged run through the new script is owed to the Windows sitting or a private copy.
- Revisit trigger: before packaged desktop release sign-off.
