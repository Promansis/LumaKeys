# PH-ARCH-003: First-run setup stores "off" in an integer setting

- Lane: ARCH
- Severity: P3
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: both (shared renderer)
- Coverage rows: WF-001, WF-018
- Related/duplicate findings: PH-ARCH-002 (settings write contract)
- First observed against: `main` at source identity `4466626`, Phase 11 lane F, 2026-10-19

## User Impact

After the first-run setup is skipped or completed with reminders off, Settings,
Practice tab, shows an empty "Posture Reminder (minutes)" box instead of 0, and the
browser logs `The specified value "off" cannot be parsed` on every render. The
reminder itself behaves correctly because `App.tsx` treats any non-positive value
as off. Severity P3: cosmetic, plus a settings value that violates its declared type.

## Expected Behavior Or Oracle

`src/lib/settings/registry.ts` declares `practice.postureReminderMinutes` as
`valueKind: 'integer'` with default `'0'`.

## Evidence

- Runtime: `getSetting('practice','postureReminderMinutes')` returns `"off"` after setup; the number input renders with `value=""`.
- Source: `App.tsx` saves `postureReminderMinutes !== null ? String(...) : 'off'` from the setup flow.

## Root Cause

The setup flow writes a sentinel string where the registry expects an integer, and
the bridge does not validate setting values against the registry.

## Recommended Remediation Boundary

Write `'0'` instead of `'off'` in `App.tsx`. Optionally have the read path map a
legacy `"off"` to `0`.

## Required Regression Proof

- Unit: setup save writes `'0'` when reminders are off.
- Component: Settings renders 0 for a stored legacy `"off"`.

## Challenge Record

- Electron reproduction, 2026-10-20: after **Skip for now** on first launch, `lumakeys.db` holds `practice.postureReminderMinutes = 'off'` (`scripts/audit/electron/workflows.mjs`).
- Challenger conclusion and date: reproduced, 2026-10-19; Electron 2026-10-20
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3; deduplication: canonical for a setting value that does not match the registry type. PH-ARCH-002 owns the write-outcome contract, not value validation, so the two stay separate. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.

- Fix branch/commit/issue: `remediation/p11-s14-settings`, slice 14, commit `7f4a28c`;
  implemented and independently reviewed 2026-11-02; merged to `main` in `05dd7aa`; `fixed`, not `verified`: the lead's Electron `workflows.mjs` rerun on `main` (the settings "off" case) is owed.
- What changed: `persistSetupState` in `src/renderer/App.tsx` writes
  `String(postureReminderMinutes ?? 0)`, so reminders off store `'0'`. `SettingsScreen.tsx`
  maps a stored `"off"` for `practice.postureReminderMinutes` to `'0'` when it loads. The
  startup parse (`parsePositiveIntegerSetting`) and `GameScreen` already treat `"off"` as off,
  so they are unchanged. The setup guide's own `Off` option is UI-only and still works.
  The legacy row is not rewritten until the user next saves that setting.
- Tests (source identity `cc40b63` for the failures): `App.test.tsx` `stores 0, not "off",
  when first-run setup is skipped with reminders off` failed before (no call with
  `'practice','postureReminderMinutes','0'`; the first call was the theme) and passes after.
  `SettingsScreen.test.tsx` `shows 0 for a posture reminder stored as the legacy "off"` failed
  before (`toHaveValue(0)`, the box was empty) and passes after. The `App.test.tsx`
  `SetupGuideScreen` mock now renders a Skip button.
- Driver result: Electron `workflows.mjs` not run, needs an Electron binary that starts. In the
  sandbox `electron --version` aborts on the SUID chrome-sandbox check and the Playwright
  launch times out at 30 s with no output; no workaround was attempted. Expected after the
  fix: the `PH-ARCH-003 Electron settings with "off"` line prints `[]` after Skip for now.
  The web driver does not cover this step.
- Proof owed: agent-runnable, none left (done 2026-11-02, `c170bc3`). Human-only: none.
- Main-build proof, 2026-11-02 (`c170bc3`): Electron `workflows.mjs` printed `PH-ARCH-003 Electron settings with "off" []` and ERRORS `[]`, as expected after the fix. The stored row value itself was not read back.
- Residual risk: other integer settings are still not validated in the bridge (excluded by the
  slice).
- Revisit trigger: reviewer verification and the Electron driver run.
