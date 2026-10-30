// 13–0 on Cloudflare: serves the game from /public and runs live rooms.
//
// GET /api/room/<name>  (WebSocket) joins a room. Each room is one Durable Object.
// Every player keeps one small "presence" object (name, round, picks, done).
// The room sends everyone the full list whenever anyone changes, so the game
// only ever deals in absolute state and a dropped message never matters.

const ROOM_NAME = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
const MAX_PEERS = 8;          // players + spectators per room
const MAX_PRESENCE = 4096;    // bytes of JSON per player

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/room\/([^/]+)$/);
    if (m) {
      const name = decodeURIComponent(m[1]);
      if (!ROOM_NAME.test(name)) return new Response("Bad room name", { status: 400 });
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(name));
      return stub.fetch(request);
    }
    if (url.pathname === "/api/health") return Response.json({ ok: true });
    return env.ASSETS.fetch(request);
  },
};

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
  }

  async fetch() {
    const open = this.sockets();
    if (open.length >= MAX_PEERS) return new Response("Room is full", { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Hibernation API: the room sleeps (and costs nothing) while nobody is sending.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ peer: crypto.randomUUID().replace(/-/g, "").slice(0, 16), presence: {} });
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > MAX_PRESENCE + 64) return;
    let msg;
    try { msg = JSON.parse(message); } catch { return; }
    if (!msg || msg.t !== "presence" || typeof msg.data !== "object" || msg.data === null || Array.isArray(msg.data)) return;
    const att = ws.deserializeAttachment() || {};
    att.presence = msg.data;
    ws.serializeAttachment(att);
    this.broadcast();
  }

  async webSocketClose(ws) {
    try { ws.close(1000, "bye"); } catch {}
    this.broadcast(ws);
  }

  async webSocketError(ws) {
    this.broadcast(ws);
  }

  sockets(except) {
    return this.ctx.getWebSockets().filter(ws => ws !== except && ws.readyState === 1);
  }

  broadcast(except) {
    const socks = this.sockets(except);
    const peers = socks.map(ws => {
      const a = ws.deserializeAttachment() || {};
      return { peer: a.peer, presence: a.presence || {} };
    });
    for (const ws of socks) {
      const a = ws.deserializeAttachment() || {};
      try { ws.send(JSON.stringify({ t: "peers", you: a.peer, peers })); } catch {}
    }
  }
}
