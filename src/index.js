// 13–0 on Cloudflare: serves the game from /public, runs live rooms and keeps leaderboards.
//
// GET  /api/room/<name>          (WebSocket) joins a live room. Each room is one Durable Object.
// GET  /api/scores?board=&device= top scores for a board, plus this device's own entry and rank
// POST /api/scores                {board, name, device, score, tb, detail}
// No logins: a device id (random, kept in the browser) owns its entries, and names are screened.

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
    if (url.pathname === "/api/scores") {
      const stub = env.SCORES.get(env.SCORES.idFromName("global"));
      return stub.fetch(request);
    }
    if (url.pathname === "/api/health") return Response.json({ ok: true, scores: true });
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

// ---------- leaderboards ----------
// Boards and the score range each accepts.
const BOARDS = [
  { re: /^daily-\d{4}-\d{2}-\d{2}$/, min: 0, max: 40, once: true },
  { re: /^(gauntlet|cat)$/, min: 0, max: 40 },
  { re: /^quiz-(map|agent|ability)$/, min: 0, max: 30 },
];
// Name screening: letters, numbers, spaces and . _ - only, 2–16 characters, and no offensive or
// impersonating words. Letter swaps like 4→a, 0→o are undone first. Long words are blocked anywhere
// in the name; short ones only as a whole word, so names like "Grape" or "Patriot" still work.
const BLOCK_ANY = ["fuck", "shit", "bitch", "cunt", "nigg", "retard", "whore", "slut", "pussy", "porn", "penis", "vagina", "hitler", "nazi",
  "killyourself", "tangina", "putang", "pakyu", "motherf"];
const BLOCK_WORD = ["fuk", "fag", "fags", "rape", "rapist", "dick", "cock", "anal", "kys", "puta", "gago", "kupal", "ulol", "bobo", "tanga",
  "admin", "mod", "moderator", "riot", "official", "staff", "sex"];
function nameProblem(name) {
  if (typeof name !== "string") return "Add a name";
  const n = name.trim();
  if (n.length < 2 || n.length > 16) return "Names are 2 to 16 characters";
  if (!/^[A-Za-z0-9 ._-]+$/.test(n)) return "Use letters, numbers, spaces, dots, dashes or underscores";
  const norm = n.toLowerCase().replace(/[0@4]/g, m => ({ "0": "o", "@": "a", "4": "a" }[m])).replace(/[1!|]/g, "i").replace(/3/g, "e")
    .replace(/[5$]/g, "s").replace(/7/g, "t");
  const flat = norm.replace(/[^a-z]/g, "");
  const words = norm.split(/[^a-z]+/).filter(Boolean);
  if (BLOCK_ANY.some(w => flat.includes(w)) || words.some(w => BLOCK_WORD.includes(w))) return "Please pick a different name";
  return null;
}

export class Leaderboard {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS scores (
      board TEXT NOT NULL, device TEXT NOT NULL, name TEXT NOT NULL,
      score REAL NOT NULL, tb REAL NOT NULL DEFAULT 0, detail TEXT, at INTEGER NOT NULL,
      PRIMARY KEY (board, device))`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS by_rank ON scores (board, score DESC, tb DESC, at ASC)`);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const headers = { "content-type": "application/json", "cache-control": "no-store" };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

    if (request.method === "GET") {
      const board = url.searchParams.get("board") || "";
      if (!BOARDS.some(b => b.re.test(board))) return reply({ ok: false, error: "Unknown board" }, 400);
      const device = (url.searchParams.get("device") || "").slice(0, 40);
      const top = this.sql.exec(`SELECT name, score, tb, detail, device = ? AS me FROM scores WHERE board = ?
        ORDER BY score DESC, tb DESC, at ASC LIMIT 50`, device, board).toArray().map(r => ({ ...r, me: !!r.me }));
      const total = this.sql.exec(`SELECT COUNT(*) AS n FROM scores WHERE board = ?`, board).one().n;
      let mine = null;
      if (device) {
        const row = this.sql.exec(`SELECT name, score, tb, detail, at FROM scores WHERE board = ? AND device = ?`, board, device).toArray()[0];
        if (row) {
          const ahead = this.sql.exec(`SELECT COUNT(*) AS n FROM scores WHERE board = ? AND (score > ? OR (score = ? AND tb > ?) OR (score = ? AND tb = ? AND at < ?))`,
            board, row.score, row.score, row.tb, row.score, row.tb, row.at).one().n;
          mine = { name: row.name, score: row.score, tb: row.tb, detail: row.detail, rank: ahead + 1 };
        }
      }
      return reply({ ok: true, board, total, top, mine });
    }

    if (request.method === "POST") {
      let b;
      try { b = await request.json(); } catch { return reply({ ok: false, error: "Bad request" }, 400); }
      const board = String(b.board || "");
      const rule = BOARDS.find(x => x.re.test(board));
      if (!rule) return reply({ ok: false, error: "Unknown board" }, 400);
      const device = String(b.device || "");
      if (!/^[a-f0-9]{16,40}$/.test(device)) return reply({ ok: false, error: "Bad device" }, 400);
      const problem = nameProblem(b.name);
      if (problem) return reply({ ok: false, error: problem }, 400);
      const score = Number(b.score), tb = Number(b.tb) || 0;
      if (!Number.isFinite(score) || score < rule.min || score > rule.max || Math.abs(tb) > 1000) return reply({ ok: false, error: "Score out of range" }, 400);
      const detail = typeof b.detail === "string" ? b.detail.slice(0, 160) : "";
      const name = String(b.name).trim();
      const old = this.sql.exec(`SELECT score, tb FROM scores WHERE board = ? AND device = ?`, board, device).toArray()[0];
      if (old && rule.once) return reply({ ok: true, kept: true, note: "Only your first attempt counts on the daily board" });
      if (!old || score > old.score || (score === old.score && tb > old.tb)) {
        this.sql.exec(`INSERT INTO scores (board, device, name, score, tb, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (board, device) DO UPDATE SET name = excluded.name, score = excluded.score, tb = excluded.tb, detail = excluded.detail, at = excluded.at`,
          board, device, name, score, tb, detail, Date.now());
        return reply({ ok: true, saved: true });
      }
      // a worse score: keep the best, but let the player rename themselves
      this.sql.exec(`UPDATE scores SET name = ? WHERE board = ? AND device = ?`, name, board, device);
      return reply({ ok: true, kept: true });
    }
    return reply({ ok: false, error: "Method not allowed" }, 405);
  }
}
