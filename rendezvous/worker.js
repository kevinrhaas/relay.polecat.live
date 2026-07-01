// -----------------------------------------------------------------------
// Relay rendezvous — a tiny WebRTC signaling relay on Cloudflare Workers.
//
// This is the ONLY optional piece of server-side infrastructure, and it is
// deliberately dumb: it relays the initial WebRTC handshake (offer / answer
// / ICE candidates) between browsers in the same "room" so they can connect
// automatically — no copy/paste. Once the peer-to-peer data channel opens,
// the relay is out of the loop. It never sees, stores, or forwards any of
// your records. Presence (who's in the room) is held only in memory.
//
// Deploy:  cd rendezvous && npx wrangler deploy
// Connect: wss://<your-worker>.workers.dev/?room=<name>
// -----------------------------------------------------------------------

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok', { status: 200 });

    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response(
        'Relay rendezvous is running. Connect a WebSocket with ?room=<name>.',
        { status: 426, headers: { 'content-type': 'text/plain' } }
      );
    }
    const room = url.searchParams.get('room') || 'lobby';
    const id = env.ROOMS.idFromName(room);
    return env.ROOMS.get(id).fetch(req);
  },
};

// One Durable Object instance per room name.
export class Room {
  constructor(state) {
    this.state = state;
    this.sessions = new Map(); // ws -> { id, name }
  }

  async fetch() {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const meta = { id: null, name: null };

    server.addEventListener('message', (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }

      if (m.type === 'join') {
        meta.id = String(m.id);
        meta.name = String(m.name || '').slice(0, 64);
        this.sessions.set(server, meta);
        // tell the newcomer who is already here
        const members = [...this.sessions.entries()]
          .filter(([ws]) => ws !== server)
          .map(([, v]) => ({ id: v.id, name: v.name }));
        server.send(JSON.stringify({ type: 'welcome', members }));
        // tell everyone else about the newcomer
        this._broadcast(server, { type: 'join', id: meta.id, name: meta.name });

      } else if (m.type === 'signal' && m.to) {
        // relay one signaling message to a single target peer
        for (const [ws, v] of this.sessions) {
          if (v.id === m.to) {
            try { ws.send(JSON.stringify({ type: 'signal', from: meta.id, data: m.data })); } catch {}
            break;
          }
        }
      }
    });

    const close = () => {
      if (this.sessions.has(server)) {
        const v = this.sessions.get(server);
        this.sessions.delete(server);
        if (v.id) this._broadcast(null, { type: 'leave', id: v.id });
      }
    };
    server.addEventListener('close', close);
    server.addEventListener('error', close);

    return new Response(null, { status: 101, webSocket: client });
  }

  _broadcast(except, msg) {
    const s = JSON.stringify(msg);
    for (const ws of this.sessions.keys()) {
      if (ws !== except) { try { ws.send(s); } catch {} }
    }
  }
}
