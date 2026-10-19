# PH-ARCH-003: First-run setup stores "off" in an integer setting

- Lane: ARCH
- Severity: P3
- Confidence: high
- Status: reproduced
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: both (shared renderer)
- Coverage rows: WF-001, WF-018
- Related/duplicate findings: PH-ARCH-002 (settings write contract)
- First observed against: `main` at source identity `6e549b6`, Phase 11 lane F, 2026-10-19

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

- Challenger conclusion and date: reproduced, 2026-10-19

## Resolution

- Accepted/rejected rationale: pending consolidation
