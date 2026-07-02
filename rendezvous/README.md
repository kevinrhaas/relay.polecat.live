# Relay rendezvous

An optional, ~90-line **WebRTC signaling relay** on Cloudflare Workers. It lets
Relay peers **auto-discover and connect across the internet** without the manual
copy/paste invite flow.

It is deliberately minimal:

- It relays only the **handshake** — WebRTC offers, answers, and ICE candidates —
  between browsers in the same room.
- Once the peer-to-peer data channel opens, the relay is **out of the loop**.
- It **never sees your records.** Presence (who is in a room) lives only in memory
  in a Durable Object; nothing is written to storage.

So Relay stays serverless-by-default: this is opt-in, and even when on, your data
never touches it.

## Deploy

One command (handles login, deploy, health check, and prints a ready setup link):

```bash
cd rendezvous
./deploy.sh
```

Or manually:

```bash
cd rendezvous
npx wrangler login        # once
npx wrangler deploy
```

Wrangler prints a URL like `https://relay-rendezvous.<you>.workers.dev`.

## Use it

In the Relay app → **Settings → Auto-discovery (rendezvous)**:

- **Rendezvous URL:** `wss://relay-rendezvous.<you>.workers.dev`
- **Room:** any shared name (e.g. `team-polecat`) — everyone using the same room
  auto-connects.

Then **Connect**. Peers in the same room negotiate WebRTC automatically and appear
in **Peers**. Data still syncs directly, subject to your per-peer permissions.

## Protocol

Client → relay:

- `{ "type": "join", "id": "<peerId>", "name": "<display>" }`
- `{ "type": "signal", "to": "<peerId>", "data": { ...sdp/ice... } }`

Relay → client:

- `{ "type": "welcome", "members": [{ "id", "name" }] }`
- `{ "type": "join", "id", "name" }`
- `{ "type": "leave", "id" }`
- `{ "type": "signal", "from": "<peerId>", "data": { ... } }`

## Cost — it's free

- **No server to run.** `wrangler deploy` uploads the code to Cloudflare; they
  run it on-demand and it's dormant when idle. You don't keep anything running.
- **Free Workers plan.** This uses a **SQLite-backed Durable Object**
  (`new_sqlite_classes` in `wrangler.toml`), which is included on Cloudflare's
  free plan. It uses no storage — rooms are purely in-memory.
- **No bandwidth/egress charges.** Cloudflare doesn't bill Workers egress, and
  the relay only carries the tiny WebRTC handshake (offer/answer/ICE), never
  your data. A handshake is a few messages, so real usage sits far under the
  free tier's daily limits.

## Notes

- Peers behind symmetric NATs may still need a TURN server to connect; the STUN
  server configured in Relay's Settings only helps with address discovery.
