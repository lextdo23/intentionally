// The small service behind Intentionally's notifications (first version, not final).
// It never sees a thought, a name or a pillar. Each phone tells it only *when* to send a ping, and the phone
// itself decides what the ping says. Runs on Cloudflare Workers; setup is in README.md.
import { DurableObject } from "cloudflare:workers";
import { accounts } from "./accounts.js";
import { ping, pushable, vapid, b64u } from "./webpush.js";
// Accounts live in accounts.js; Cloudflare needs their storage classes shared from here too.
export { Accounts, Vault } from "./accounts.js";

const DAY = 86400000;
// The addresses the app is served from. The old GitHub address stays allowed while people move to daydeck.day.
const APPS = ["https://daydeck.day", "https://www.daydeck.day", "https://lextdo23.github.io"];
// A phone that hasn't opened the app for two weeks stops getting the evening question: no nagging.
const QUIET_AFTER = 14 * DAY;
// The old Intentionally app's notifications are switched off (alex, 2026-11-15). Only Daydeck marks its plans
// with app: "daydeck"; anything else is the old app. Daydeck plans saved before the mark existed get until
// OLD_OFF to be re-sent (Daydeck re-sends every time it opens), then unmarked plans stop for good.
const DAYDECK = "daydeck";
const OLD_OFF = Date.parse("2026-11-17T00:00:00Z");
const oldApp = (p) => p.app !== DAYDECK && (p.timerAt || p.eveningAt || (p.daily ?? []).length > 2 || Date.now() > OLD_OFF);

const cors = { "Access-Control-Allow-Origin": APPS[0], "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
const reply = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", ...extra } });

// Answers each request with the app address it came from, if that address is one of APPS.
async function withOrigin(req, res) {
  const from = req.headers.get("Origin");
  if (!from || !APPS.includes(from) || from === APPS[0]) return res;
  const out = new Response(res.body, res);
  out.headers.set("Access-Control-Allow-Origin", from); out.headers.set("Vary", "Origin");
  return out;
}

export default {
  async fetch(req, env) { return withOrigin(req, await route(req, env)); },
};

async function route(req, env) {
  {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const { pathname } = new URL(req.url);
    if (req.method === "GET" && pathname === "/key") return reply({ key: (await vapid(env)).public });
    if (req.method === "POST" && pathname === "/plan") {
      const body = await req.json().catch(() => null);
      if (!pushable(body?.endpoint)) return reply({ error: "bad request" }, 400);
      const later = (t) => Number.isFinite(t) && t > Date.now() - DAY && t < Date.now() + 8 * DAY ? t : null;
      // Other daily times (words of affirmation): at most ten, each a time only.
      const daily = (Array.isArray(body.dailyAt) ? body.dailyAt : []).slice(0, 10).map(later).filter(Boolean);
      // One-off times (Daydeck's card reminders): each sent once, then gone.
      const once = (Array.isArray(body.onceAt) ? body.onceAt : []).slice(0, 4).map(later).filter(Boolean);
      const phone = env.PHONES.get(env.PHONES.idFromName(body.endpoint));
      if (body.app !== DAYDECK) { await phone.stop(); return reply({ ok: true, off: true }); } // old app: notifications off
      await phone.plan(body.endpoint, later(body.timerAt), later(body.eveningAt), daily, DAYDECK, once);
      return reply({ ok: true });
    }
    if (pathname.startsWith("/t/")) return testers(req, env, pathname);
    if (pathname.startsWith("/l/")) return library(req, env, pathname);
    if (pathname.startsWith("/a/")) return accounts(req, env, pathname, reply);
    return reply({ error: "not found" }, 404);
  }
}

// One per phone: holds its address and the next times, and wakes itself up when one is due.
export class Phone extends DurableObject {
  async plan(endpoint, timerAt, eveningAt, daily = [], app = null, once = []) {
    const p = { endpoint, timerAt, eveningAt, daily, app, once, seen: Date.now() };
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
    if ((p.once ?? []).some((t) => t <= soon)) { due = true; p.once = p.once.filter((t) => t > soon); }
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
    const next = Math.min(...[p.timerAt, p.eveningAt, ...(p.daily ?? []), ...(p.once ?? [])].filter(Boolean));
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

// Pinging, signing and the shared helpers live in webpush.js.

// ---------------- Tester mode (Daydeck beta) ----------------
// Testers who joined send the choices and numbers they tapped, under a random code like T-7KQ4, with a secret
// key only their phone knows. Never anything they typed (the app strips it before sending). They can delete
// it all at any time. Only someone holding TESTER_KEY (a Cloudflare secret) can read it, from testers.html.
const db = (env) => env.TESTERS.get(env.TESTERS.idFromName("all"));
const CODE = /^T-[A-Z0-9]{4}$/, KEY = /^[0-9a-f]{32}$/, DAYK = /^\d{4}-\d\d-\d\d$/, NAME = /^[a-z_]{1,24}$/;
const short = (x, n = 30) => (typeof x === "string" ? x.slice(0, n) : "");

async function testers(req, env, path) {
  // Reports (social step 5): alex reviews them here, behind the same password and lockout as the tester page.
  if (path === "/t/reports" || path === "/t/report") {
    const no = await gate(req, env); if (no) return no;
    const book = env.ACCOUNTS.get(env.ACCOUNTS.idFromName("book"));
    if (req.method === "GET") return reply(await book.rList());
    const b = await req.json().catch(() => null);
    if (!b || typeof b.id !== "string" || typeof b.act !== "string") return reply({ error: "bad request" }, 400);
    const r = await book.rAct(b.id, b.act);
    return reply(r, r.error ? 404 : 200);
  }
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
    nudges: JSON.stringify({ am: short(b.nudges?.am, 5), pm: short(b.nudges?.pm, 5), card: short(b.nudges?.card, 3), fr: short(b.nudges?.fr, 3), allow: short(b.nudges?.allow, 3) }) };
  const res = await db(env).send(b.code, hash, info, days, events);
  return reply(res.ok ? { ok: true } : { error: res.error }, res.ok ? 200 : res.error === "removed" ? 410 : res.error === "full" ? 403 : 409);
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

// ---------------- The card library (alex 2026-11-18) ----------------
// Anyone using Daydeck can choose "Show it to everyone" on a card they made. The card's words, the name they
// chose (or none) and its pillar come here and wait. alex reads each one on the tester page, can fix spelling,
// then says Yes or No. Only Yes cards are ever shown to others. Thumbs up are counted once per phone, under a
// random key the phone made, never anything about the person. Stored with the tester data (same store).
const PILLARS = ["Friends", "Family", "Love", "Community", "Move", "Food", "Rest", "Outdoors", "Work and study", "Money", "Learn", "Play and create", "Give", "Meaning"];
const SID = /^[a-z0-9]{10}$/;
const words = (x, n) => (typeof x === "string" ? x.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, n) : "");
const LIB_SHARE_A_DAY = 10, LIB_UPS_A_DAY = 300, LIB_WAITING = 500;
async function library(req, env, path) {
  const store = db(env);
  if (req.method === "GET" && path === "/l/list") return reply(await store.libList(), 200, { "Cache-Control": "public, max-age=600" });
  if (req.method === "GET" && path === "/l/queue") { const no = await gate(req, env); if (no) return no; return reply(await store.libQueue()); }
  if (req.method !== "POST") return reply({ error: "not found" }, 404);
  const text = await req.text();
  if (text.length > 4000) return reply({ error: "too big" }, 413);
  let b; try { b = JSON.parse(text); } catch { return reply({ error: "bad request" }, 400); }
  if (!b || typeof b !== "object") return reply({ error: "bad request" }, 400);
  if (path === "/l/review") {
    const no = await gate(req, env); if (no) return no;
    if (!SID.test(b.id) || typeof b.ok !== "boolean") return reply({ error: "bad request" }, 400);
    const t = words(b.text, 90), name = words(b.name, 24);
    if (b.ok && !t) return reply({ error: "bad request" }, 400);
    return reply(await store.libReview(b.id, b.ok, t, name, PILLARS.includes(b.pillar) ? b.pillar : null));
  }
  if (!KEY.test(b.key)) return reply({ error: "bad request" }, 400);
  const hash = await sha(b.key), who = await sha("ip:" + (req.headers.get("CF-Connecting-IP") || "unknown"));
  if (path === "/l/share") {
    const t = words(b.text, 90), name = words(b.name, 24);
    const mind = (Array.isArray(b.mind) ? b.mind : []).slice(0, 4).map((m) => words(m, 60)).filter(Boolean);
    if (!t || !PILLARS.includes(b.pillar)) return reply({ error: "bad request" }, 400);
    return reply(await store.libShare(hash, who, t, name, b.pillar, mind));
  }
  if (path === "/l/status") return reply(await store.libStatus(hash, (Array.isArray(b.ids) ? b.ids : []).filter((x) => SID.test(x)).slice(0, 200)));
  if (path === "/l/unshare") return reply(await store.libUnshare(hash, (Array.isArray(b.ids) ? b.ids : []).filter((x) => SID.test(x)).slice(0, 200)));
  if (path === "/l/up") { if (!SID.test(b.id)) return reply({ error: "bad request" }, 400); return reply(await store.libUp(hash, who, b.id)); }
  return reply({ error: "not found" }, 404);
}

// Testers alex removed by hand. Their data is deleted when the service starts, and their phones are told to stop.
const REMOVED = ["T-ACAY"];
const PLACES = 60; // the most testers at once; also shown on testers.html

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
      CREATE TABLE IF NOT EXISTS lib (id TEXT PRIMARY KEY, owner TEXT, who TEXT, t INTEGER, text TEXT, name TEXT, pillar TEXT, mind TEXT, state TEXT, seen INTEGER);
      CREATE TABLE IF NOT EXISTS libups (id TEXT, owner TEXT, who TEXT, t INTEGER, PRIMARY KEY (id, owner));
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
    // At most PLACES testers at once (alex, 2026-11-17), so nobody can flood the service with made-up testers.
    // A phone that finds it full keeps its data and quietly tries again later; removing a tester frees a place.
    if (!had && this.sql.exec("SELECT COUNT(*) AS c FROM testers").one().c >= PLACES) return { ok: false, error: "full" };
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
  wipe() { for (const t of ["testers", "days", "events"]) this.sql.exec(`DELETE FROM ${t}`); }   // tester data only, never the library

  // ---- The card library ----
  // state: "wait" (not checked yet), "in" (alex said Yes: everyone sees it), "no" (alex said No: only its maker knows it exists).
  libShare(owner, who, text, name, pillar, mind) {
    const dayAgo = Date.now() - DAY;
    if (this.sql.exec("SELECT COUNT(*) AS c FROM lib WHERE who = ? AND t > ?", who, dayAgo).one().c >= LIB_SHARE_A_DAY) return { error: "slow down" };
    if (this.sql.exec("SELECT COUNT(*) AS c FROM lib WHERE state = 'wait'").one().c >= LIB_WAITING) return { error: "full" };
    const id = [...crypto.getRandomValues(new Uint8Array(10))].map((x) => "abcdefghijkmnpqrstuvwxyz23456789"[x % 32]).join("");
    this.sql.exec("INSERT INTO lib VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'wait', NULL)", id, owner, who, Date.now(), text, name, pillar, JSON.stringify(mind));
    return { ok: true, id };
  }
  libList() {
    const ups = {}; this.sql.exec("SELECT id, COUNT(*) AS c FROM libups GROUP BY id").toArray().forEach((r) => (ups[r.id] = r.c));
    return { at: Date.now(), cards: this.sql.exec("SELECT id, seen, text, name, pillar, mind FROM lib WHERE state = 'in' ORDER BY seen DESC").toArray()
      .map((r) => ({ id: r.id, t: r.seen, text: r.text, name: r.name, pillar: r.pillar, mind: JSON.parse(r.mind || "[]"), up: ups[r.id] || 0 })) };
  }
  libQueue() {
    const q = (s) => this.sql.exec(s).toArray().map((r) => ({ ...r, mind: JSON.parse(r.mind || "[]") }));
    return { wait: q("SELECT id, t, text, name, pillar, mind FROM lib WHERE state = 'wait' ORDER BY t"),
      done: q("SELECT id, t, seen, text, name, pillar, mind, state FROM lib WHERE state != 'wait' ORDER BY seen DESC LIMIT 200"),
      ups: this.sql.exec("SELECT COUNT(*) AS c FROM libups").one().c };
  }
  libReview(id, ok, text, name, pillar) {
    const had = this.sql.exec("SELECT id FROM lib WHERE id = ?", id).toArray()[0];
    if (!had) return { error: "gone" };
    if (ok) this.sql.exec("UPDATE lib SET state = 'in', seen = ?, text = ?, name = ?, pillar = COALESCE(?, pillar) WHERE id = ?", Date.now(), text, name, pillar, id);
    else this.sql.exec("UPDATE lib SET state = 'no', seen = ? WHERE id = ?", Date.now(), id);
    return { ok: true };
  }
  // A maker's phone asks how its shared cards are going. Only that phone's key can see a card that got a No.
  libStatus(owner, ids) {
    const out = {};
    for (const id of ids) { const r = this.sql.exec("SELECT state FROM lib WHERE id = ? AND owner = ?", id, owner).toArray()[0]; out[id] = r ? r.state : "gone"; }
    return { ok: true, status: out };
  }
  // Takes a maker's cards back out (Delete everything, or turning sharing off). Their thumbs go too.
  libUnshare(owner, ids) {
    for (const id of ids) {
      if (!this.sql.exec("SELECT id FROM lib WHERE id = ? AND owner = ?", id, owner).toArray().length) continue;
      this.sql.exec("DELETE FROM lib WHERE id = ?", id); this.sql.exec("DELETE FROM libups WHERE id = ?", id);
    }
    return { ok: true };
  }
  libUp(owner, who, id) {
    const c = this.sql.exec("SELECT owner FROM lib WHERE id = ? AND state = 'in'", id).toArray()[0];
    if (!c) return { error: "gone" };
    if (c.owner === owner) return { error: "own card" };   // no thumbs up for your own card
    if (this.sql.exec("SELECT COUNT(*) AS c FROM libups WHERE who = ? AND t > ?", who, Date.now() - DAY).one().c >= LIB_UPS_A_DAY) return { error: "slow down" };
    this.sql.exec("INSERT OR IGNORE INTO libups VALUES (?, ?, ?, ?)", id, owner, who, Date.now());
    return { ok: true };
  }
}
