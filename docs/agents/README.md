# LumaKeys Agent Playbooks

These repository playbooks specialize existing agent workflows without duplicating
general-purpose skills. They are instructions for future audit sessions, not evidence
that an audit has occurred.

## Routing

| Request | Load |
|---|---|
| Start, coordinate, resume, or consolidate the full audit | `lumakeys-full-audit.md` |
| Persistence, bridge, storage, security, backup, reset, or parity | `lumakeys-runtime-data-audit.md` |
| MIDI, audio, timing, scoring, looping, fingering, theory, curriculum | `lumakeys-practice-engine-audit.md` |
| UI/accessibility audit | `lumakeys-ui-audit-profile.md` plus the full-audit playbook |
| Choose or report verification | `lumakeys-validation-profile.md` |

For a reproduced hard failure, use the repository's diagnosis workflow. During
approved remediation, use test-driven development for observable regressions. Use
the architecture workflow only after behavioral evidence exists and `CONTEXT.md`
plus relevant ADRs have been read.

## Shared Rules

- Read `CONTEXT.md`, `docs/audit/charter.md`, the coverage matrix, and
  the findings ledger before lane work.
- Discovery is read-only except for reports and ledgers under `docs/audit`.
- Historical `.codex-audits` reports are leads, not current evidence.
- Use isolated data under an absolute `/tmp/...` path.
- Never optimize or score mobile behavior; ADR 0001 excludes it.
- Do not fix, refactor, file issues, commit, push, or open a PR during discovery.
- Keep the coverage matrix and findings ledger canonical; reports link to them.
