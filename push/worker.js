// The small service behind Intentionally's notifications (first version, not final).
// It never sees a thought, a name or a pillar. Each phone tells it only *when* to send a ping, and the phone
// itself decides what the ping says. Runs on Cloudflare Workers; setup is in README.md.
import { DurableObject } from "cloudflare:workers";

const DAY = 86400000;
const APP = "https://lextdo23.github.io";
const CONTACT = "https://lextdo23.github.io/intentionally/";
// Only the phone makers' own push services, so the service can't be used to call anywhere else.
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
// A phone that hasn't opened the app for two weeks stops getting the evening question: no nagging.
const QUIET_AFTER = 14 * DAY;
// The old Intentionally app's notifications are switched off (alex, 2026-11-15). Only Daydeck marks its plans
// with app: "daydeck"; anything else is the old app. Daydeck plans saved before the mark existed get until
// OLD_OFF to be re-sent (Daydeck re-sends every time it opens), then unmarked plans stop for good.
const DAYDECK = "daydeck";
const OLD_OFF = Date.parse("2026-11-17T00:00:00Z");
const oldApp = (p) => p.app !== DAYDECK && (p.timerAt || p.eveningAt || (p.daily ?? []).length > 2 || Date.now() > OLD_OFF);

const cors = { "Access-Control-Allow-Origin": APP, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const { pathname } = new URL(req.url);
    if (req.method === "GET" && pathname === "/key") return reply({ key: (await vapid(env)).public });
    if (req.method === "POST" && pathname === "/plan") {
      const body = await req.json().catch(() => null);
      if (!pushable(body?.endpoint)) return reply({ error: "bad request" }, 400);
      const later = (t) => Number.isFinite(t) && t > Date.now() - DAY && t < Date.now() + 8 * DAY ? t : null;
      // Other daily times (words of affirmation): at most ten, each a time only.
      const daily = (Array.isArray(body.dailyAt) ? body.dailyAt : []).slice(0, 10).map(later).filter(Boolean);
      const phone = env.PHONES.get(env.PHONES.idFromName(body.endpoint));
      if (body.app !== DAYDECK) { await phone.stop(); return reply({ ok: true, off: true }); } // old app: notifications off
      await phone.plan(body.endpoint, later(body.timerAt), later(body.eveningAt), daily, DAYDECK);
      return reply({ ok: true });
    }
    if (pathname.startsWith("/t/")) return testers(req, env, pathname);
    return reply({ error: "not found" }, 404);
  },
};

function pushable(endpoint) {
  try {
    const u = new URL(endpoint);
    return endpoint.length < 1000 && u.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}

// One per phone: holds its address and the next times, and wakes itself up when one is due.
export class Phone extends DurableObject {
  async plan(endpoint, timerAt, eveningAt, daily = [], app = null) {
    const p = { endpoint, timerAt, eveningAt, daily, app, seen: Date.now() };
    await this.ctx.storage.put("plan", p);
    await this.wake(p);
  }

  async alarm() {
    const p = await this.ctx.storage.get("plan");
    if (!p) return;
    if (oldApp(p)) return this.stop();
    const soon = Date.now() + 30000;
    let due = false;
    if (p.timerAt && p.timerAt <= soon) { due = true; p.timerAt = null; }
    if (p.eveningAt && p.eveningAt <= soon) {
      due = Date.now() - p.seen < QUIET_AFTER;
      while (p.eveningAt <= soon) p.eveningAt += DAY;
      if (!due) p.eveningAt = null;
    }
    // Daily times work like the evening question: they repeat, and stop for a phone that hasn't opened the app lately.
    p.daily = (p.daily ?? []).map((t) => {
      if (t > soon) return t;
      if (Date.now() - p.seen < QUIET_AFTER) due = true; else return null;
      while (t <= soon) t += DAY;
      return t;
    }).filter(Boolean);
    if (due && await ping(this.env, p.endpoint)) return this.ctx.storage.deleteAll(); // the phone unsubscribed
    await this.ctx.storage.put("plan", p);
    await this.wake(p);
  }

  async stop() { await this.ctx.storage.deleteAlarm(); await this.ctx.storage.deleteAll(); }

  async wake(p) {
    const next = Math.min(...[p.timerAt, p.eveningAt, ...(p.daily ?? [])].filter(Boolean));
    if (Number.isFinite(next)) await this.ctx.storage.setAlarm(next);
    else await this.ctx.storage.deleteAll();
  }
}

// The service's own signing keys, made once and kept. Phones use the public half to know pings are really from here.
export class Keys extends DurableObject {
  async get() {
    let k = await this.ctx.storage.get("vapid");
    if (!k) {
      const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      k = { public: b64u(await crypto.subtle.exportKey("raw", pair.publicKey)), private: await crypto.subtle.exportKey("jwk", pair.privateKey) };
      await this.ctx.storage.put("vapid", k);
    }
    return k;
  }
}

const vapid = (env) => env.KEYS.get(env.KEYS.idFromName("vapid")).get();

// An empty push: no words travel. Returns true when the phone has gone away for good.
async function ping(env, endpoint) {
  const k = await vapid(env);
  const jwt = await sign({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACT }, k.private);
  // "high": a "normal" ping can be held back while a phone sits idle (overnight, so mornings), then thrown
  // away when its hour runs out. These are timed nudges, so they should arrive on time.
  const res = await fetch(endpoint, { method: "POST", body: "", headers: { TTL: "3600", Urgency: "high", Authorization: `vapid t=${jwt}, k=${k.public}` } });
  return res.status === 404 || res.status === 410;
}

async function sign(claims, jwk) {
  const part = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const data = `${part({ typ: "JWT", alg: "ES256" })}.${part(claims)}`;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return `${data}.${b64u(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(data)))}`;
}

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// ---------------- Tester mode (Daydeck beta) ----------------
// Testers who joined send the choices and numbers they tapped, under a random code like T-7KQ4, with a secret
// key only their phone knows. Never anything they typed (the app strips it before sending). They can delete
// it all at any time. Only someone holding TESTER_KEY (a Cloudflare secret) can read it, from v2/testers.html.
const db = (env) => env.TESTERS.get(env.TESTERS.idFromName("all"));
const CODE = /^T-[A-Z0-9]{4}$/, KEY = /^[0-9a-f]{32}$/, DAYK = /^\d{4}-\d\d-\d\d$/, NAME = /^[a-z_]{1,24}$/;
const short = (x, n = 30) => (typeof x === "string" ? x.slice(0, n) : "");

async function testers(req, env, path) {
  if (req.method === "GET" && path === "/t/all") {
    const no = await gate(req, env); if (no) return no;
    return reply(await db(env).all());
  }
  if (req.method !== "POST") return reply({ error: "not found" }, 404);
  if (path === "/t/wipe") {
    const no = await gate(req, env); if (no) return no;
    await db(env).wipe();
    return reply({ ok: true });
  }
  // Removes one tester: deletes what they shared and stops their phone sending any more.
  if (path === "/t/remove") {
    const no = await gate(req, env); if (no) return no;
    const b = await req.json().catch(() => null);
    if (!b || !CODE.test(b.code)) return reply({ error: "bad request" }, 400);
    await db(env).remove(b.code);
    return reply({ ok: true });
  }
  const text = await req.text();
  if (text.length > 200000) return reply({ error: "too big" }, 413);
  let b; try { b = JSON.parse(text); } catch { return reply({ error: "bad request" }, 400); }
  if (!b || !CODE.test(b.code) || !KEY.test(b.key)) return reply({ error: "bad request" }, 400);
  const hash = await sha(b.key);
  if (path === "/t/leave") return (await db(env).leave(b.code, hash)) ? reply({ ok: true }) : reply({ error: "wrong key" }, 403);
  if (path !== "/t/send") return reply({ error: "not found" }, 404);
  const days = [];
  if (b.days && typeof b.days === "object") for (const [k, v] of Object.entries(b.days).slice(0, 400)) {
    const j = JSON.stringify(v ?? {});
    if (DAYK.test(k) && j.length <= 800) days.push([k, j]);
  }
  const events = [];
  for (const e of (Array.isArray(b.events) ? b.events : []).slice(0, 500)) {
    if (!Array.isArray(e) || !Number.isFinite(e[0]) || !NAME.test(e[1])) continue;
    const v = e.length > 2 ? JSON.stringify(e[2]) : null;
    if (v && v.length > 300) continue;
    events.push([e[0], e[1], v]);
  }
  const info = { phone: short(b.phone), version: short(b.version, 12), started: DAYK.test(b.started) ? b.started : null,
    nudges: JSON.stringify({ am: short(b.nudges?.am, 5), pm: short(b.nudges?.pm, 5) }) };
  const res = await db(env).send(b.code, hash, info, days, events);
  return reply(res.ok ? { ok: true } : { error: res.error }, res.ok ? 200 : res.error === "removed" ? 410 : 409);
}

function admin(req, env) {
  const want = env.TESTER_KEY || "", got = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  if (want.length < 12 || got.length !== want.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
}
// A limit on wrong passwords for the tester page (alex, 2026-11-17): 3 wrong passwords from the same internet
// address and that address is locked out for a week, even with the right password. Only a scrambled form of the
// address is kept, and only for that week. A right password before the third try clears the count.
// Way back in if alex is locked out: set a new TESTER_KEY on GitHub and run "Push service". Lockouts belong to
// the password they were made under, so a new password starts everyone fresh.
const TRIES = 3, LOCK = 7 * DAY;
async function gate(req, env) {
  const who = await sha("ip:" + (req.headers.get("CF-Connecting-IP") || "unknown"));
  const under = (await sha("key:" + (env.TESTER_KEY || ""))).slice(0, 16);
  const store = db(env);
  if (await store.fails(who, under) >= TRIES) return reply({ error: "locked" }, 429);
  if (!admin(req, env)) { await store.fail(who, under); return reply({ error: "wrong key", left: Math.max(0, TRIES - await store.fails(who, under)) }, 403); }
  await store.clearFails(who, under);
  return null;
}
async function sha(s) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Testers alex removed by hand. Their data is deleted when the service starts, and their phones are told to stop.
const REMOVED = ["T-ACAY"];

// One store for all testers (a beta is 20 to 30 people).
export class Testers extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS testers (code TEXT PRIMARY KEY, hash TEXT, joined INTEGER, seen INTEGER, phone TEXT, version TEXT, started TEXT, nudges TEXT);
      CREATE TABLE IF NOT EXISTS days (code TEXT, day TEXT, data TEXT, PRIMARY KEY (code, day));
      CREATE TABLE IF NOT EXISTS events (code TEXT, t INTEGER, name TEXT, val TEXT);
      CREATE INDEX IF NOT EXISTS ev_code ON events (code);
      CREATE TABLE IF NOT EXISTS removed (code TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS fails2 (who TEXT, k TEXT, t INTEGER);
      DROP TABLE IF EXISTS fails;`);
    REMOVED.forEach((c) => this.remove(c));
  }
  remove(code) {
    this.sql.exec("INSERT OR IGNORE INTO removed VALUES (?)", code);
    for (const t of ["testers", "days", "events"]) this.sql.exec(`DELETE FROM ${t} WHERE code = ?`, code);
    return true;
  }
  send(code, hash, info, days, events) {
    if (this.sql.exec("SELECT code FROM removed WHERE code = ?", code).toArray().length) return { ok: false, error: "removed" };
    const had = this.sql.exec("SELECT hash FROM testers WHERE code = ?", code).toArray()[0];
    if (had && had.hash !== hash) return { ok: false, error: "code taken" };
    const n = Date.now();
    if (!had) this.sql.exec("INSERT INTO testers VALUES (?, ?, ?, ?, ?, ?, ?, ?)", code, hash, n, n, info.phone, info.version, info.started, info.nudges);
    else this.sql.exec("UPDATE testers SET seen = ?, phone = ?, version = ?, started = ?, nudges = ? WHERE code = ?", n, info.phone, info.version, info.started, info.nudges, code);
    for (const [day, data] of days) this.sql.exec("INSERT OR REPLACE INTO days VALUES (?, ?, ?)", code, day, data);
    const count = this.sql.exec("SELECT COUNT(*) AS c FROM events WHERE code = ?", code).one().c;
    for (const [t, name, val] of events.slice(0, Math.max(0, 50000 - count))) this.sql.exec("INSERT INTO events VALUES (?, ?, ?, ?)", code, t, name, val);
    return { ok: true };
  }
  leave(code, hash) {
    const had = this.sql.exec("SELECT hash FROM testers WHERE code = ?", code).toArray()[0];
    if (!had) return true;
    if (had.hash !== hash) return false;
    for (const t of ["testers", "days", "events"]) this.sql.exec(`DELETE FROM ${t} WHERE code = ?`, code);
    return true;
  }
  all() {
    const q = (s) => this.sql.exec(s).toArray();
    return { at: Date.now(), testers: q("SELECT code, joined, seen, phone, version, started, nudges FROM testers"),
      days: q("SELECT code, day, data FROM days"), events: q("SELECT code, t, name, val FROM events ORDER BY t") };
  }
  // Wrong tester page passwords in the last week, per scrambled internet address and password (see gate()).
  fails(who, k) {
    this.sql.exec("DELETE FROM fails2 WHERE t < ?", Date.now() - LOCK);
    return this.sql.exec("SELECT COUNT(*) AS c FROM fails2 WHERE who = ? AND k = ?", who, k).one().c;
  }
  fail(who, k) { this.sql.exec("INSERT INTO fails2 VALUES (?, ?, ?)", who, k, Date.now()); }
  clearFails(who, k) { this.sql.exec("DELETE FROM fails2 WHERE who = ? AND k = ?", who, k); }
  wipe() { for (const t of ["testers", "days", "events"]) this.sql.exec(`DELETE FROM ${t}`); }
}
