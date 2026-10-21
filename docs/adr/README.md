# Architecture Decision Records

ADRs record decisions that change or clarify long-lived architecture. Use the next
four-digit sequence and copy `0000-template.md`.

## Statuses

- `proposed`: under discussion and not authoritative.
- `accepted`: current decision.
- `superseded`: replaced by a newer ADR, which must be linked.
- `deprecated`: intentionally retained for history but no longer recommended.

## When An ADR Is Required

Create or update an ADR when work changes supported runtimes, package ownership,
dependency direction, persisted data or migration strategy, bridge contracts,
security boundaries, storage lifecycle, or a cross-cutting testing policy.

Do not use ADRs for individual bug fixes, short-lived implementation plans, audit
findings, or choices already dictated by an accepted ADR.

## Index

| ADR | Status | Decision |
|---|---|---|
| [0001](0001-supported-runtimes-and-desktop-ui.md) | accepted | Support Electron and desktop web; exclude mobile UI requirements |
| [0002](0002-legacy-pianohero-compatibility-window.md) | accepted | Legacy PianoHero fallback ends by release, after carry-over is verified and no earlier than 2027-01-31, with a tombstone check |
