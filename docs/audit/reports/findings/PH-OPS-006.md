# PH-OPS-006: A desktop startup failure leaves a running process with no window and the error only on stderr

- Lane: OPS
- Severity: P2
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: Electron
- Coverage rows: OP-015, DATA-017
- Related/duplicate findings: PH-DATA-005 (the most likely route into the refusal), PH-DATA-006 (other refusals), PH-ARCH-001 (unhandled rejection in the renderer; different process and flow)
- First observed against: `main` at source identity `6e549b6`, Phase 11 lane B, 2026-10-19

## User Impact

Every step of desktop startup runs inside `app.whenReady().then(async () => { ... })`
with no `catch`, and the window is created as the last statement. If any earlier step
throws, the promise rejects, Node prints an `UnhandledPromiseRejectionWarning` to
stderr, and the process keeps running with no window, no tray icon and no dialog. On
Windows the portable build has no console, so the user sees nothing at all; each
further launch starts another invisible process because there is no single-instance
lock.

Every refusal in the legacy migration takes this path: both database names in the
profile, a stale `pianohero.db-shm`, a conflicting profile entry, or a
cross-filesystem move. These refusals are written as instructions to the user
("Back up one and remove the other before starting.") but the user cannot read them.
The same applies to an `AppDatabase` open failure, a failed JSON migration, or a
failed durable-operation recovery.

A realistic route in: a user hit by PH-DATA-005 finds the old `pianohero.db` and
copies it into the new `lumakeys` profile next to the empty `lumakeys.db` the
current build created. The next launch shows nothing.

Severity P2: the data is intact and the cause can be found by launching from a
terminal, but the desktop app is unusable with no explanation until the profile is
repaired by hand.

## Expected Behavior Or Oracle

- `docs/agents/lumakeys-runtime-data-audit.md` invariant: "Multi-step durable
  mutations are atomic or leave an explicit recoverable state." A refusal is only
  recoverable if it is shown.
- The migration's own refusal messages (`src/persistence/legacyBrandMigration.ts:91-94`,
  `:105-109`, `:56-64`) are addressed to the user, so the contract is that the user
  sees them.
- Web parity: the server reports the same refusal and exits with code 1
  (`src/server/index.ts:89`, lane B case S7), which a container log or supervisor
  surfaces.

## Evidence

### Environment

- Commit/patch identity: packaged `dist/linux-unpacked` build whose migration and
  `whenReady` block are byte-identical to the current `out/main/index.js` (see
  PH-DATA-005).
- OS/runtime: Linux, Electron 30.5.1 headless (`--ozone-platform=headless
  --no-sandbox --disable-gpu`), `HOME` and `XDG_*` under
  `$TMPDIR/p11/B/electron-userdata/P2/`.
- Fixture: profile `~/.config/lumakeys/` holding both `lumakeys.db` and `pianohero.db`.

### Reproduction

1. Seed the profile with both database names.
2. Launch the packaged binary.
3. Observe: after 12040 ms the process is still running; the probe sends SIGTERM.
   No renderer started (no `Local Storage`, `Cache` or `blob_storage` in the
   profile, compared with a normal launch in case P3). stderr holds
   `UnhandledPromiseRejectionWarning: Error: Both .../lumakeys.db and a legacy
   pianohero.db exist in .../lumakeys. Back up one and remove the other before
   starting.`
4. Expected: a visible error and the process exits.
5. Repeat count: every packaged probe run on 2026-10-19 gave the same result.

### Artifacts

- File/line: `src/main/index.ts:95` (`app.whenReady().then(async () => {`, no catch),
  `:100-103` (migration), `:109-112` (database open and recovery), `:534`
  (`await createMainWindow()`). No `requestSingleInstanceLock`,
  `process.on('unhandledRejection')` or `dialog.showErrorBox` in `src/main/`.
- Command: `node scripts/audit/electron-userdata-probe.mjs --packaged`; output
  `$TMPDIR/p11/B/electron-userdata-probe.out` (sha256 `34ddf3b4…af6d712d`, case P2).

## Root Cause

The main-process startup sequence has no error boundary. Failures before
`createMainWindow` are neither shown nor turned into a process exit.

## Recommended Remediation Boundary

In `src/main/index.ts`: wrap the `whenReady` body (or add `.catch`) so a startup
error calls `dialog.showErrorBox` with the message and then `app.exit(1)`. Consider
`app.requestSingleInstanceLock()` so a repeated launch focuses or reports instead of
stacking processes.

## Required Regression Proof

- Deterministic unit/integration proof: extract the startup sequence so a test can
  assert that a thrown migration error reaches an error-reporting callback and an exit.
- Electron proof: case P2 of `scripts/audit/electron-userdata-probe.mjs --packaged`
  on a rebuilt package must show the process exiting with a non-zero code.
- Manual proof: sitting 2, Windows portable build with both database names in the
  profile shows a dialog.

## Challenge Record

- Independent reproduction attempt: the same refusal is reproduced at function level
  (lane B probe H3) and on the web server (case S7, exit 1 with the message), so the
  error itself is real and only its handling differs.
- Alternative explanations tested: (a) "Electron exits on unhandled rejection": it
  did not; the process was alive until the probe sent SIGTERM at 12 s, and Electron's
  exit code 0 on SIGTERM was not mistaken for a natural exit (`elapsedMs` and
  `stillRunningWhenProbeSentSigterm` recorded). (b) "Headless mode prevents the
  window": the same headless launch starts a renderer in cases P1 and P3.
- Scope/severity changes: P1 considered, since the app cannot start; P2 kept because
  the trigger needs an unusual profile state and the data is intact.
- Deduplication decision: PH-ARCH-001 is a renderer-side unhandled rejection in the
  practice flow; this is the main-process startup path. Distinct.
- Challenger conclusion and date: reproduced, 2026-10-19.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P2. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue:
- Verification evidence:
- Residual risk:
- Revisit trigger, if accepted-risk:
