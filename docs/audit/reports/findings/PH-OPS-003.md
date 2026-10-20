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
