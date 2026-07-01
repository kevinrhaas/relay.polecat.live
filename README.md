# relay.polecat.live

**A serverless, peer-to-peer collaborative table.** Your data lives in *your*
browser and syncs directly with the people you trust — no central database, no
backend, no accounts. Just local JavaScript, HTML, and secure browser-to-browser
calls.

Part of the [polecat.live](https://polecat.live) family — shares its aurora dark
theme, brand palette, and the collapsible "rail" navigation from
[analytics.polecat.live](https://github.com/kevinrhaas/analytics.polecat.live).

---

## What it is

Every workspace is a set of **entities** (shared tables). Each entity is a map of
**UUID-keyed JSON rows** with fully dynamic fields — add columns as you go. Two
peers converge deterministically because every record carries last-writer-wins
metadata (`updatedAt`, `updatedBy`, `rev`) and deletes are tombstones.

- **No servers.** Nothing is uploaded anywhere. State is `localStorage`; sync is
  peer-to-peer.
- **Fully dynamic rows.** Edit any cell inline; values are typed automatically
  (numbers, booleans, JSON, strings).
- **Permissions.** Per-peer, per-entity `read` (they may pull from you) and
  `write` (they may push to you) toggles.
- **Live monitor.** Every discovery, sync, and permission change streams to the
  Activity log.

## How peers find and sync each other

Two transports, one protocol:

| Transport | Discovery | Use |
|-----------|-----------|-----|
| **Local mesh** (`BroadcastChannel`) | Automatic | Other tabs/windows of the same browser — zero config. |
| **WebRTC data channel** | Manual copy/paste signaling | Real cross-internet P2P, **no signaling server** — you exchange one offer/answer blob over any channel (chat, email). |
| **WebRTC + rendezvous** | Automatic | Point Relay at the optional [`/rendezvous`](rendezvous/) relay and peers in the same room auto-connect over WebRTC — no copy/paste. The relay carries only the handshake; your records still sync directly peer-to-peer. |

WebRTC optionally uses a public **STUN** server purely to discover your public
address for NAT traversal — it never relays your data. Leave it blank in Settings
for pure LAN / fully-serverless mode.

### Connecting two people across the internet
1. Peer A → **Peers → WebRTC invite → Create invite → Generate offer**, copies the blob, sends it to B.
2. Peer B → **Join with invite**, pastes the offer, **Generate answer**, sends the answer back to A.
3. Peer A pastes the answer → **Complete connection**. The data channel opens; entities sync per your permissions.

## UI

- **Animated, collapsible, drag-to-resize rail** on the left (drag the right edge;
  double-click it to snap; state persists).
- **Home** — greeting, live stats, quick actions, pinned ("add to home") + recent tables.
- **Tables** — entity tabs, inline-editable dynamic rows, add field / add row, per-cell sync flashes.
- **Peers** — network discovery, WebRTC invites, per-entity permission toggles, presence.
- **Activity** — session stats + live sync monitor.
- **Settings** — identity, dark / light / system theme, transport config, export / import / reset.

## Running it

No build step, no bundler, no framework. Serve the folder statically:

```bash
python3 -m http.server 8137   # landing → http://localhost:8137
                              # app     → http://localhost:8137/app/
```

Open the app in a second tab to watch local-mesh discovery and sync in real time.

## Layout

```
index.html            # marketing landing page (front door at /)
css/landing.css       # landing styles
app/index.html        # the app shell (served at /app/)
css/styles.css        # full app design system (ported polecat palette)
assets/logo.svg       # relay mark
assets/screenshot-app.png
js/
  app.js              # controller: boot, routing, topbar, cross-view glue
  shell.js            # collapsible / draggable rail navigation
  store.js            # UUID-keyed JSON records, entities, LWW, persistence
  sync.js             # P2P engine: local mesh + WebRTC, permissions, monitor
  theme.js            # dark / light / system
  ui.js               # DOM helpers, toasts, modals, formatting
  icons.js            # inline SVG icon set
  views/              # home, table, peers, activity, settings
```
