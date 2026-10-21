# ADR 0001: Supported Runtimes And Desktop UI Validation

- Status: accepted
- Date: 2026-07-11
- Deciders: repository owner
- Supersedes: none

## Context

LumaKeys ships as an Electron desktop application and as a self-hosted web
application used from desktop browsers. Its practice workflows assume a piano or
computer keyboard, a landscape display, and desktop input capabilities. Mobile is
not a plausible deployment or product target.

Generic UI audit guidance often treats phone responsiveness as mandatory. Applying
that guidance here would spend effort on unsupported conditions while missing the
actual risks: zoom, high-DPI canvas output, keyboard operation, MIDI device changes,
reduced motion, and legibility from a playing posture.

## Decision

LumaKeys supports two runtimes:

- Electron desktop.
- Self-hosted web in supported desktop browsers.

Mobile browsers, narrow phone viewports, touch-first flows, and mobile-specific
performance or responsive layout are out of scope unless a future ADR changes the
product boundary.

The two runtimes share one source tree and one `window.appBridge` contract, but they
are not identical. These differences are intended and must stay explicit in bridge
categories or UI gating (see `CONTEXT.md`, "Runtime Architecture"):

- `.mscz` (MuseScore) import exists only in the web runtime, and only where a
  MuseScore executable is available: the Linux x86-64 Docker image, or any Linux web
  server with MuseScore 4, `prlimit` and `LUMAKEYS_MUSESCORE_PATH`. Electron imports MIDI only.
- Native file dialogs and the sample-directory picker exist only in Electron. In the
  browser those bridge methods (`WEB_STUB_BRIDGE_METHODS` in
  `src/shared/bridgeMethods.ts`) resolve to `null`.
- The web runtime has an optional API access gate (`LUMAKEYS_WEB_ACCESS_TOKEN`);
  Electron has no HTTP API.

UI audits and regression proof must cover:

- The minimum desktop window, 1180x780 (`minWidth` and `minHeight` in
  `src/main/index.ts`; confirmed in `docs/audit/charter.md`).
- The default 1480x960 layout and a larger desktop window.
- 125%, 150%, 175%, and 200% zoom where the workflow remains usable.
- High-DPI canvas rendering and nonblank pixel evidence.
- Keyboard-only navigation and visible focus.
- Reduced-motion behavior.
- Color-independent musical and result states.
- MIDI permission, selection, disconnect, and reconnect behavior where supported.
- Hands-busy readability during practice.

## Consequences

### Positive

- UI evidence matches the hardware and posture in which the product is used.
- Audit time is spent on desktop accessibility, canvas, and musical-input risks.
- Agents have an explicit reason to suppress generic mobile recommendations.

### Negative

- The interface may be unusable on phones by design.
- Any future mobile direction requires a deliberate product and architecture change.
- Window sizes below 1180x780 are unsupported by design.

## Alternatives Considered

### Treat Mobile Responsiveness As A General Quality Requirement

Rejected because it conflicts with the product's hardware, input, and deployment
assumptions and would dilute higher-risk desktop evidence.

## Verification

- UI audit plans cite `docs/agents/lumakeys-ui-audit-profile.md`.
- Coverage reports list desktop window, zoom, DPI, keyboard, motion, canvas, and MIDI
  conditions instead of phone breakpoints.
- Findings based only on unsupported mobile behavior are rejected during challenge.
