# Third-party notices — Relay (relay.polecat.live)

Relay is open source under the **GPL-3.0** license and is built as a static,
no-build-step web app. It bundles **no third-party runtime libraries**: the
UI is first-party code plus a vendored copy of the **Polecat Shell**
(`vendor/polecat-shell/`), part of the Polecat suite
(`kevinrhaas/polecat-platform`, GPL-3.0) — not a third party.

## Networking

Peer-to-peer tables and chat use the browser's built-in **WebRTC** APIs for
direct peer connections; no third-party networking library is bundled. Any
signalling/invite data stays between you and your peers.
