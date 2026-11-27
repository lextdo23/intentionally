// Accounts (alex, 2026-11-20; see "Accounts" in CLAUDE.md). Sign up with an email code, a username and a passkey
// (Face ID), sign in with the passkey, and keep a backup of your days. No passwords.
//
// Two kinds of storage:
//   Accounts (one, named "book"): accounts, usernames, passkeys' public halves, email codes, sign-in sessions.
//   Vault (one per person): that person's backed-up days. Nothing else can read another person's vault.
// What's kept is the minimum: email, username, the passkey's public half, sessions, the backup. Codes, sign-in
// tickets, sessions and network addresses are only ever stored scrambled (hashed), never as they are.
// Emails are sent by Resend from daydeck.day; the key is the Cloudflare secret RESEND_API_KEY.
import { DurableObject } from "cloudflare:workers";
import { friendTables, friendRoutes, friendMethods } from "./friends.js";
import { photoTables, photoRoutes, photoMethods } from "./photos.js";

const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const RP_ID = "daydeck.day";                 // passkeys are tied to this address forever
const ORIGINS = ["https://daydeck.day", "https://www.daydeck.day"];
const CODE_LIFE = 10 * MIN, CODE_TRIES = 5, TICKET_LIFE = 20 * MIN, CHALLENGE_LIFE = 5 * MIN, SESSION_LIFE = 180 * DAY;
const SENDS = { gap: MIN, perEmailDay: 5, perPlaceHour: 8, allDay: 90 };   // Resend's free plan allows 100 a day
const RENAME_EVERY = 30 * DAY, NAME_HELD = 30 * DAY;
const EARLY_BEFORE = Date.parse("2026-11-21T02:00:00Z");   // 1 pm Sydney, 21 Nov 2026: the people already using Daydeck
// People alex gave Friends straight away by hand, whatever their level (by username, lowercase). alex 2026-11-25: @erok.
const EARLY_NAMES = ["erok"];
// People alex sent back to level 1 with every feature still open (by username, lowercase; alex 2026-11-27: @sherrie and
// @alex). The phone starts its points again once for each RESTART (it remembers which), so to do it again, change the date.
const RESTART_NAMES = ["sherrie", "alex"], RESTART = "2026-11-27";
// alex's own test accounts (alex 2026-11-22): every feature open whatever the level, and never in tester data.
// Kept as scrambled emails (hash() of the lowercase email), so the addresses never sit in this public code.
// Tests can add more with the TEST_ACCOUNTS setting (commas between).
const TEST_ACCOUNTS = ["1dzDjM55YiVadq4ts7Cd-Y5TebrhCTz_wL4IGIFwEpY"];
const BACKUP_MAX = 1500000;                        // about 1.5 MB of days; photos stay on the phone (later: their own store, see CLAUDE.md)

// ---------------- Small helpers ----------------
const enc = new TextEncoder(), dec = new TextDecoder();
export const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s) => { const t = atob(String(s).replace(/-/g, "+").replace(/_/g, "/")); const a = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i); return a; };
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const sha = async (data) => new Uint8Array(await crypto.subtle.digest("SHA-256", typeof data === "string" ? enc.encode(data) : data));
const hash = async (s) => b64u(await sha("daydeck:" + s));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

export const cleanEmail = (e) => {
  const s = String(e || "").trim().toLowerCase();
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null;
};

// ---------------- Usernames ----------------
// 3 to 20 letters, numbers, full stops and underscores; always kept in lowercase (alex 2026-11-22), so "Mia" = "mia"; not starting or ending with a full stop,
// no two full stops in a row, and at least one letter (alex 2026-11-20, like Instagram). Only these plain characters
// are allowed, so nothing typed here can act as code, and no lookalike letters from other alphabets can pose as
// someone else. Names are always stored with placeholders (?) and shown as plain text, never as code.
const RESERVED_ANYWHERE = ["daydeck", "official", "admin", "moderator"];
const RESERVED_EXACT = ["support", "help", "helpdesk", "staff", "team", "mod", "root", "system", "security", "settings", "account",
  "lifeline", "beyondblue", "headspace", "kidshelpline", "13yarn", "suicide", "crisis", "emergency", "police", "ambulance",
  "anthropic", "claude", "null", "undefined", "me", "you",
  "api", "www", "app", "login", "signin", "signup", "register", "verify", "about", "privacy", "terms", "owner", "everyone", "here", "all"];
// A starter list of words that never belong in a name; add to it as needed.
const BLOCKED_PARTS = ["fuck", "shit", "cunt", "bitch", "whore", "slut", "nazi", "hitler", "nigg", "fagg", "retard"];
// Numbers standing in for letters ("adm1n", "dayd3ck") are read as the letters they stand for.
const LEET = { 0: "o", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", 9: "g" };
const readings = (n) => { const base = n.replace(/[0345789]/g, (d) => LEET[d]); return [n.replace(/[._0-9]/g, ""), base.replace(/1/g, "i").replace(/[._0-9]/g, ""), base.replace(/1/g, "l").replace(/[._0-9]/g, "")]; };
// For display names (friends.js): already folded to plain a to z. Same reserved and blocked words as usernames.
export function wordsProblem(plain) {
  const r = readings(plain);
  return r.some((x) => RESERVED_ANYWHERE.some((w) => x.includes(w)) || BLOCKED_PARTS.some((w) => x.includes(w)));
}
export function nameProblem(raw) {
  const n = String(raw || "").trim().toLowerCase();
  if (n.length < 3) return "short";
  if (n.length > 20) return "long";
  if (!/^[a-z0-9._]+$/.test(n)) return "shape";
  if (n.startsWith(".") || n.endsWith(".")) return "dot_ends";
  if (n.includes("..")) return "dots";
  if (!/[a-z]/.test(n)) return "no_letter";
  const r = readings(n);
  if (RESERVED_EXACT.includes(n) || r.some((x) => RESERVED_EXACT.includes(x) || RESERVED_ANYWHERE.some((w) => x.includes(w)))) return "reserved";
  if (r.some((x) => BLOCKED_PARTS.some((w) => x.includes(w)))) return "blocked";
  return null;
}

// ---------------- Reading passkeys (WebAuthn), with nothing but the crypto built into Cloudflare ----------------
// A tiny reader for CBOR, the compact format passkeys use.
function cbor(buf, o = 0) {
  const b = buf[o++], major = b >> 5, info = b & 31;
  let len = info;
  if (info === 24) len = buf[o++];
  else if (info === 25) { len = (buf[o] << 8) | buf[o + 1]; o += 2; }
  else if (info === 26) { len = ((buf[o] << 24) >>> 0) + (buf[o + 1] << 16) + (buf[o + 2] << 8) + buf[o + 3]; o += 4; }
  else if (info > 26) throw new Error("cbor");
  if (major === 0) return [len, o];
  if (major === 1) return [-1 - len, o];
  if (major === 2) return [buf.slice(o, o + len), o + len];
  if (major === 3) return [dec.decode(buf.slice(o, o + len)), o + len];
  if (major === 4) { const a = []; for (let i = 0; i < len; i++) { let v; [v, o] = cbor(buf, o); a.push(v); } return [a, o]; }
  if (major === 5) { const m = new Map(); for (let i = 0; i < len; i++) { let k, v; [k, o] = cbor(buf, o); [v, o] = cbor(buf, o); m.set(k, v); } return [m, o]; }
  if (major === 7) return [info === 20 ? false : info === 21 ? true : null, o];
  throw new Error("cbor");
}
// The passkey's public half, from its COSE form into the form Cloudflare's crypto reads.
function coseToJwk(m) {
  const kty = m.get(1), alg = m.get(3);
  if (kty === 2 && alg === -7 && m.get(-1) === 1) return { alg: -7, jwk: { kty: "EC", crv: "P-256", x: b64u(m.get(-2)), y: b64u(m.get(-3)) } };
  if (kty === 3 && alg === -257) return { alg: -257, jwk: { kty: "RSA", n: b64u(m.get(-1)), e: b64u(m.get(-2)) } };
  throw new Error("key type");
}
function parseAuthData(a) {
  if (a.length < 37) throw new Error("short");
  const out = { rpIdHash: a.slice(0, 32), flags: a[32], count: ((a[33] << 24) >>> 0) + (a[34] << 16) + (a[35] << 8) + a[36] };
  if (out.flags & 0x40) {          // a new passkey: its id and public half follow
    const n = (a[53] << 8) | a[54];
    out.credId = a.slice(55, 55 + n);
    out.key = coseToJwk(cbor(a, 55 + n)[0]);
  }
  return out;
}
// Passkey signatures come wrapped (DER); Cloudflare's crypto wants the two halves side by side.
function derToRaw(sig) {
  let o = 2; if (sig[1] & 0x80) o += sig[1] & 0x7f;
  const part = () => { if (sig[o++] !== 2) throw new Error("der"); const n = sig[o++]; let v = sig.slice(o, o + n); o += n; while (v.length > 32 && v[0] === 0) v = v.slice(1); return cat(new Uint8Array(32 - v.length), v); };
  return cat(part(), part());
}
function readClient(clientDataJSON, type, challenge) {
  const c = JSON.parse(dec.decode(clientDataJSON));
  if (c.type !== type) throw new Error("type");
  if (c.challenge !== challenge) throw new Error("challenge");
  if (!ORIGINS.includes(c.origin) || c.crossOrigin === true) throw new Error("origin");
  return c;
}
export async function checkNewPasskey(cred, challenge) {
  const clientDataJSON = unb64u(cred.response.clientDataJSON);
  readClient(clientDataJSON, "webauthn.create", challenge);
  const att = cbor(unb64u(cred.response.attestationObject))[0];
  const ad = parseAuthData(att.get("authData"));
  if (!same(ad.rpIdHash, await sha(RP_ID))) throw new Error("rp");
  if (!(ad.flags & 0x01) || !ad.credId) throw new Error("flags");
  if (b64u(ad.credId) !== cred.rawId) throw new Error("id");
  return { id: cred.rawId, jwk: ad.key.jwk, alg: ad.key.alg, count: ad.count };
}
export async function checkSignIn(cred, challenge, saved) {
  const clientDataJSON = unb64u(cred.response.clientDataJSON), authData = unb64u(cred.response.authenticatorData);
  readClient(clientDataJSON, "webauthn.get", challenge);
  const ad = parseAuthData(authData);
  if (!same(ad.rpIdHash, await sha(RP_ID))) throw new Error("rp");
  if (!(ad.flags & 0x01)) throw new Error("flags");
  const signed = cat(authData, await sha(clientDataJSON));
  const sig = unb64u(cred.response.signature);
  const ok = saved.alg === -7
    ? await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, await crypto.subtle.importKey("jwk", saved.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]), derToRaw(sig), signed)
    : await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, await crypto.subtle.importKey("jwk", saved.jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]), sig, signed);
  if (!ok) throw new Error("signature");
  return ad.count;
}

// ---------------- The email ----------------
async function sendCode(env, email, code) {
  if (!env.RESEND_API_KEY) return false;
  const text = `Your Daydeck code is ${code}\n\nType it into Daydeck to carry on. It works for 10 minutes.\n\nIf you didn't ask for this, you can ignore this email.`;
  const html = `<div style="font-family:-apple-system,system-ui,sans-serif;font-size:17px;line-height:1.5;color:#1d1e22">`
    + `<p>Your Daydeck code is</p><p style="font-size:34px;font-weight:600;letter-spacing:4px;margin:8px 0">${code}</p>`
    + `<p>Type it into Daydeck to carry on. It works for 10 minutes.</p><p style="color:#6b6b6b;font-size:15px">If you didn't ask for this, you can ignore this email.</p></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Daydeck <hello@daydeck.day>", to: [email], subject: `${code} is your Daydeck code`, text, html }),
  }).catch(() => null);
  return !!(res && res.ok);
}

async function tellAlex(env, subject = "A report is waiting on Daydeck", text = "Someone reported something on Daydeck. Open the tester page, then the Reports tab, to look at it.\n\nhttps://daydeck.day/testers.html") {
  if (!env.RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Daydeck <hello@daydeck.day>", to: ["hello@daydeck.day"], subject, text }),
  });
}

// ---------------- The routes: /a/... ----------------
const book = (env) => env.ACCOUNTS.get(env.ACCOUNTS.idFromName("book"));
const vault = (env, user) => env.VAULTS.get(env.VAULTS.idFromName(user));
const bearer = (req) => (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") || null;

export async function accounts(req, env, path, reply) {
  if (req.method === "OPTIONS") return reply(null);
  if (Number(req.headers.get("Content-Length") || 0) > BACKUP_MAX + 10000) return reply({ error: "too_big" }, 413);
  // Photo backup (photos.js): photos travel as their own bytes, not JSON.
  if (path === "/a/p" || path.startsWith("/a/p/")) return photoRoutes(req, env, path, book(env), bearer(req), reply, tellAlex);
  const body = req.method === "POST" ? await req.json().catch(() => null) : null;
  if (req.method === "POST" && (!body || typeof body !== "object")) return reply({ error: "bad_request" }, 400);
  const place = await hash("ip:" + (req.headers.get("CF-Connecting-IP") || "unknown"));
  const b = book(env);
  const out = async (p) => { const r = await p; return reply(r, r && r.error ? (r.status || 400) : 200); };

  // A report: alex gets a short email (never what was reported) so it isn't missed, at most once an hour.
  if (req.method === "POST" && path === "/a/f/report") {
    const r = await b.rReport(bearer(req), body || {});
    if (r.ok && r.notify) await tellAlex(env).catch(() => {});
    return reply(r.ok ? { ok: true } : r, r.ok ? 200 : r.status || 400);
  }
  if (path === "/a/f" || path.startsWith("/a/f/")) {
    const r = await friendRoutes(req, path, body || {}, b, bearer(req), reply);
    return r || reply({ error: "not_found" }, 404);
  }
  switch (`${req.method} ${path}`) {
    // 1. Email in, code out.
    case "POST /a/code": {
      const email = cleanEmail(body.email);
      if (!email) return reply({ error: "bad_email" }, 400);
      if (!env.RESEND_API_KEY) return reply({ error: "email_off" }, 503);
      const r = await b.newCode(email, place);
      if (r.error) return reply(r, 429);
      if (!(await sendCode(env, email, r.code))) { await b.dropCode(email); return reply({ error: "email_failed" }, 502); }
      return reply({ ok: true });
    }
    // 2. Code in: a ticket to finish signing up (new) or to get back in (existing).
    case "POST /a/verify": return out(b.verify(cleanEmail(body.email), String(body.code || "")));
    // 3. Is this username free?
    case "GET /a/name": return out(b.nameCheck(new URL(req.url).searchParams.get("u") || ""));
    // 4. Ready to save a passkey: the options Face ID needs.
    case "POST /a/passkey/options": return out(b.passkeyOptions(String(body.ticket || ""), String(body.username || ""), bearer(req)));
    // 5. Finish: the account is made (or found), the passkey saved if there is one, and a session handed back.
    case "POST /a/finish": return out(b.finish(String(body.ticket || ""), String(body.username || ""), body.credential || null, bearer(req)));
    // Sign in with a passkey.
    case "POST /a/signin/options": return out(b.signInOptions(place));
    case "POST /a/signin": return out(b.signIn(body.credential || null));
    // Signed in.
    case "GET /a/me": return out(b.me(bearer(req)));
    case "POST /a/username": return out(b.rename(bearer(req), String(body.username || "")));
    case "POST /a/signout": return out(b.signOut(bearer(req)));
    case "POST /a/delete": {
      const r = await b.remove(bearer(req));
      if (r.error) return reply(r, r.status || 401);
      await vault(env, r.user).wipe();
      const pk = await b.pAllOf(r.user);
      if (pk.length && env.PHOTOS) await env.PHOTOS.delete(pk.map((k) => `u/${r.user}/${k}.jpg`));
      return reply({ ok: true });
    }
    case "GET /a/backup": {
      const who = await b.who(bearer(req));
      if (!who) return reply({ error: "signed_out" }, 401);
      return reply(await vault(env, who).read());
    }
    case "POST /a/backup": {
      const who = await b.who(bearer(req));
      if (!who) return reply({ error: "signed_out" }, 401);
      const text = JSON.stringify(body.data ?? null);
      if (text.length > BACKUP_MAX) return reply({ error: "too_big" }, 413);
      return reply(await vault(env, who).write(text, Number(body.base) || 0));
    }
  }
  return reply({ error: "not_found" }, 404);
}

// ---------------- The book: accounts, names, codes, passkeys, sessions ----------------
export class Accounts extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, handle TEXT, email TEXT UNIQUE, name TEXT, name_l TEXT UNIQUE, name_at INTEGER, made INTEGER);
      CREATE TABLE IF NOT EXISTS creds (id TEXT PRIMARY KEY, user TEXT, jwk TEXT, alg INTEGER, count INTEGER, made INTEGER, used INTEGER);
      CREATE TABLE IF NOT EXISTS codes (email TEXT PRIMARY KEY, hash TEXT, exp INTEGER, tries INTEGER);
      CREATE TABLE IF NOT EXISTS sends (k TEXT, at INTEGER);
      CREATE TABLE IF NOT EXISTS tickets (hash TEXT PRIMARY KEY, email TEXT, user TEXT, handle TEXT, exp INTEGER);
      CREATE TABLE IF NOT EXISTS chal (c TEXT PRIMARY KEY, kind TEXT, ticket TEXT, exp INTEGER);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user TEXT, exp INTEGER, made INTEGER);
      CREATE TABLE IF NOT EXISTS held (name_l TEXT PRIMARY KEY, until INTEGER);`);
    friendTables(this.sql);
    photoTables(this.sql);
    // Usernames are always lowercase (alex 2026-11-22): any name saved with capitals before then is put right.
    this.sql.exec("UPDATE users SET name = name_l WHERE name IS NOT name_l");
  }
  // For friends.js.
  nameProblemWords(plain) { return wordsProblem(plain); }
  newToken() { return b64u(rand(24)); }
  scramble(s) { return hash(s); }
  rows(q, ...a) { return this.sql.exec(q, ...a).toArray(); }
  one(q, ...a) { return this.rows(q, ...a)[0] || null; }
  tidy() {
    const t = Date.now();
    this.sql.exec("DELETE FROM codes WHERE exp < ?", t); this.sql.exec("DELETE FROM tickets WHERE exp < ?", t);
    this.sql.exec("DELETE FROM chal WHERE exp < ?", t); this.sql.exec("DELETE FROM sessions WHERE exp < ?", t);
    this.sql.exec("DELETE FROM sends WHERE at < ?", t - DAY); this.sql.exec("DELETE FROM held WHERE until < ?", t);
  }

  // A new 6-digit code, if the limits allow. The code itself goes back to be emailed; only its hash is kept.
  async newCode(email, place) {
    this.tidy();
    const t = Date.now(), ek = "e:" + (await hash(email)), pk = "p:" + place;
    const count = (k, since) => this.one("SELECT COUNT(*) AS n FROM sends WHERE k = ? AND at > ?", k, since).n;
    const last = this.one("SELECT MAX(at) AS at FROM sends WHERE k = ?", ek).at;
    if (last && t - last < SENDS.gap) return { error: "slow_down", wait: Math.ceil((SENDS.gap - (t - last)) / 1000) };
    if (count(ek, t - DAY) >= SENDS.perEmailDay || count(pk, t - HOUR) >= SENDS.perPlaceHour) return { error: "too_many" };
    if (count("all", t - DAY) >= SENDS.allDay) return { error: "busy" };
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    this.sql.exec("INSERT OR REPLACE INTO codes (email, hash, exp, tries) VALUES (?, ?, ?, 0)", email, await hash(email + ":" + code), t + CODE_LIFE);
    for (const k of [ek, pk, "all"]) this.sql.exec("INSERT INTO sends (k, at) VALUES (?, ?)", k, t);
    return { code };
  }
  dropCode(email) { this.sql.exec("DELETE FROM codes WHERE email = ?", email); }

  async verify(email, code) {
    this.tidy();
    if (!email) return { error: "bad_email" };
    const row = this.one("SELECT * FROM codes WHERE email = ?", email);
    if (!row) return { error: "no_code" };
    if (row.tries >= CODE_TRIES) { this.dropCode(email); return { error: "too_many_tries" }; }
    if ((await hash(email + ":" + code.trim())) !== row.hash) {
      this.sql.exec("UPDATE codes SET tries = tries + 1 WHERE email = ?", email);
      return { error: "bad_code", left: CODE_TRIES - row.tries - 1 };
    }
    this.dropCode(email);
    const user = this.one("SELECT id, handle, name FROM users WHERE email = ?", email);
    const ticket = b64u(rand(24));
    this.sql.exec("INSERT INTO tickets (hash, email, user, handle, exp) VALUES (?, ?, ?, ?, ?)", await hash(ticket), email, user ? user.id : null, user ? user.handle : b64u(rand(16)), Date.now() + TICKET_LIFE);
    return user ? { ok: true, ticket, existing: true, username: user.name } : { ok: true, ticket, existing: false };
  }

  nameTaken(n) { return !!(this.one("SELECT 1 AS x FROM users WHERE name_l = ?", n) || this.one("SELECT 1 AS x FROM held WHERE name_l = ? AND until > ?", n, Date.now())); }
  nameCheck(raw) {
    const n = String(raw).trim().toLowerCase(), problem = nameProblem(n);
    if (problem) return { ok: false, why: problem };
    if (this.nameTaken(n)) return { ok: false, why: "taken", try: this.suggest(n) };
    return { ok: true };
  }
  suggest(n) {
    const base = n.replace(/[^a-z0-9._]/g, "").replace(/^[.]+|[.]+$/g, "").slice(0, 15) || "day";
    const out = [], tries = [base + "_", base.replace(/\./g, "_"), base + "." + (10 + Math.floor(Math.random() * 90))];
    for (let i = 0; i < 12 && out.length < 3; i++) {
      const c = tries[i] || base + (i < 6 ? "" : ".") + Math.floor(Math.random() * (i < 6 ? 99 : 999));
      if (c !== n && !nameProblem(c) && !this.nameTaken(c) && !out.includes(c)) out.push(c);
    }
    return out;
  }

  async ticketRow(ticket) { const r = ticket && this.one("SELECT * FROM tickets WHERE hash = ? AND exp > ?", await hash(ticket), Date.now()); return r || null; }
  async sessionUser(token) {
    if (!token) return null;
    const key = await hash(token), t = Date.now();
    const s = this.one("SELECT user, exp FROM sessions WHERE hash = ? AND exp > ?", key, t);
    if (!s) return null;
    // Staying signed in (alex 2026-11-20): every use pushes the end back to 180 days away (at most once a day),
    // so someone who opens Daydeck now and then never has to sign in again.
    if (s.exp < t + SESSION_LIFE - DAY) this.sql.exec("UPDATE sessions SET exp = ? WHERE hash = ?", t + SESSION_LIFE, key);
    return this.one("SELECT * FROM users WHERE id = ?", s.user);
  }

  // The options Face ID needs to save a new passkey: from a ticket (signing up, or back in after a code) or a session.
  async passkeyOptions(ticket, username, token) {
    this.tidy();
    let user = null, handle, name;
    const tk = await this.ticketRow(ticket);
    if (tk) {
      if (tk.user) { user = this.one("SELECT * FROM users WHERE id = ?", tk.user); handle = user.handle; name = user.name; }
      else { const c = this.nameCheck(username); if (!c.ok) return { error: "name", ...c }; handle = tk.handle; name = username.trim().toLowerCase(); }
    } else {
      user = await this.sessionUser(token);
      if (!user) return { error: "expired", status: 401 };
      handle = user.handle; name = user.name;
    }
    const challenge = b64u(rand(32));
    this.sql.exec("INSERT INTO chal (c, kind, ticket, exp) VALUES (?, 'new', ?, ?)", challenge, tk ? await hash(ticket) : "s:" + user.id, Date.now() + CHALLENGE_LIFE);
    const exclude = user ? this.rows("SELECT id FROM creds WHERE user = ?", user.id).map((r) => ({ type: "public-key", id: r.id })) : [];
    return { ok: true, options: {
      rp: { id: RP_ID, name: "Daydeck" }, user: { id: handle, name: "@" + name, displayName: "@" + name },
      challenge, pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" }, attestation: "none", timeout: 60000, excludeCredentials: exclude,
    } };
  }

  async savePasskey(userId, credential, ticketKey) {
    if (!credential || !credential.response) return { error: "bad_passkey" };
    let challenge;
    try { challenge = JSON.parse(dec.decode(unb64u(credential.response.clientDataJSON))).challenge; } catch { return { error: "bad_passkey" }; }
    const ch = this.one("SELECT * FROM chal WHERE c = ? AND kind = 'new' AND exp > ?", challenge, Date.now());
    if (!ch || ch.ticket !== ticketKey) return { error: "expired" };
    this.sql.exec("DELETE FROM chal WHERE c = ?", challenge);
    let k; try { k = await checkNewPasskey(credential, challenge); } catch { return { error: "bad_passkey" }; }
    if (this.one("SELECT 1 AS x FROM creds WHERE id = ?", k.id)) return { error: "already_saved" };
    return { k };
  }
  async newSession(userId) {
    const token = b64u(rand(32)), t = Date.now();
    this.sql.exec("INSERT INTO sessions (hash, user, exp, made) VALUES (?, ?, ?, ?)", await hash(token), userId, t + SESSION_LIFE, t);
    return token;
  }
  // early: accounts made before Friends went live for everyone get Friends straight away, whatever their level
  // (alex 2026-11-21: "for the current 2 users, who have not reached level 4 yet, activate the friends part").
  // test: one of alex's own test accounts (see TEST_ACCOUNTS).
  async publicUser(u) {
    const tests = TEST_ACCOUNTS.concat(String((this.env && this.env.TEST_ACCOUNTS) || "").split(",").filter(Boolean));
    const test = tests.includes(await hash(String(u.email || "").trim().toLowerCase()));
    return { username: u.name, email: u.email, renameAfter: u.name_at + RENAME_EVERY, early: (u.made || 0) < (Number(this.env && this.env.EARLY_BEFORE) || EARLY_BEFORE) || EARLY_NAMES.includes(String(u.name || "").toLowerCase()), test,
      restart: RESTART_NAMES.includes(String(u.name || "").toLowerCase()) ? RESTART : undefined };   // tests can set EARLY_BEFORE
  }

  // Finish signing up or getting back in. A passkey is saved if one came (Face ID can be skipped or unavailable;
  // then the email code is how they get back in).
  async finish(ticket, username, credential, token) {
    this.tidy();
    const tk = await this.ticketRow(ticket);
    if (!tk) {
      // Adding a passkey to an account that's already signed in.
      const user = await this.sessionUser(token);
      if (!user || !credential) return { error: "expired", status: 401 };
      const r = await this.savePasskey(user.id, credential, "s:" + user.id);
      if (r.error) return r;
      this.sql.exec("INSERT INTO creds (id, user, jwk, alg, count, made, used) VALUES (?, ?, ?, ?, ?, ?, ?)", r.k.id, user.id, JSON.stringify(r.k.jwk), r.k.alg, r.k.count, Date.now(), 0);
      return { ok: true, user: await this.publicUser(user) };
    }
    const tkey = await hash(ticket);
    let user = tk.user ? this.one("SELECT * FROM users WHERE id = ?", tk.user) : null;
    let k = null;
    if (credential) { const r = await this.savePasskey(user ? user.id : null, credential, tkey); if (r.error) return r; k = r.k; }
    const t = Date.now();
    if (!user) {
      const c = this.nameCheck(username); if (!c.ok) return { error: "name", ...c };
      if (this.one("SELECT 1 AS x FROM users WHERE email = ?", tk.email)) return { error: "expired" };
      const id = b64u(rand(16)), name = username.trim().toLowerCase();
      this.sql.exec("INSERT INTO users (id, handle, email, name, name_l, name_at, made) VALUES (?, ?, ?, ?, ?, ?, ?)", id, tk.handle, tk.email, name, name.toLowerCase(), t, t);
      user = this.one("SELECT * FROM users WHERE id = ?", id);
    }
    if (k) this.sql.exec("INSERT INTO creds (id, user, jwk, alg, count, made, used) VALUES (?, ?, ?, ?, ?, ?, ?)", k.id, user.id, JSON.stringify(k.jwk), k.alg, k.count, t, 0);
    this.sql.exec("DELETE FROM tickets WHERE hash = ?", tkey);
    return { ok: true, session: await this.newSession(user.id), user: await this.publicUser(user), passkey: !!k, created: !tk.user };
  }

  async signInOptions(place) {
    this.tidy();
    const t = Date.now(), pk = "s:" + place;
    if (this.one("SELECT COUNT(*) AS n FROM sends WHERE k = ? AND at > ?", pk, t - HOUR).n >= 60) return { error: "too_many", status: 429 };
    this.sql.exec("INSERT INTO sends (k, at) VALUES (?, ?)", pk, t);
    const challenge = b64u(rand(32));
    this.sql.exec("INSERT INTO chal (c, kind, ticket, exp) VALUES (?, 'signin', '', ?)", challenge, t + CHALLENGE_LIFE);
    return { ok: true, options: { challenge, rpId: RP_ID, userVerification: "preferred", timeout: 60000 } };
  }
  async signIn(credential) {
    this.tidy();
    if (!credential || !credential.response || !credential.rawId) return { error: "bad_passkey" };
    let challenge;
    try { challenge = JSON.parse(dec.decode(unb64u(credential.response.clientDataJSON))).challenge; } catch { return { error: "bad_passkey" }; }
    const ch = this.one("SELECT * FROM chal WHERE c = ? AND kind = 'signin' AND exp > ?", challenge, Date.now());
    if (!ch) return { error: "expired" };
    this.sql.exec("DELETE FROM chal WHERE c = ?", challenge);
    const saved = this.one("SELECT * FROM creds WHERE id = ?", credential.rawId);
    if (!saved) return { error: "unknown_passkey" };
    let count;
    try { count = await checkSignIn(credential, challenge, { jwk: JSON.parse(saved.jwk), alg: saved.alg }); } catch { return { error: "bad_passkey" }; }
    this.sql.exec("UPDATE creds SET count = ?, used = ? WHERE id = ?", count, Date.now(), saved.id);
    const user = this.one("SELECT * FROM users WHERE id = ?", saved.user);
    if (!user) return { error: "unknown_passkey" };
    return { ok: true, session: await this.newSession(user.id), user: await this.publicUser(user) };
  }

  async who(token) { const u = await this.sessionUser(token); return u ? u.id : null; }
  async me(token) {
    const u = await this.sessionUser(token);
    if (!u) return { error: "signed_out", status: 401 };
    return { ok: true, user: await this.publicUser(u), passkeys: this.one("SELECT COUNT(*) AS n FROM creds WHERE user = ?", u.id).n };
  }
  async rename(token, username) {
    const u = await this.sessionUser(token);
    if (!u) return { error: "signed_out", status: 401 };
    const n = username.trim().toLowerCase();
    if (n === u.name_l) return { ok: true, user: await this.publicUser(u) };   // the same name: nothing to change
    if (Date.now() - u.name_at < RENAME_EVERY) return { error: "too_soon", after: u.name_at + RENAME_EVERY };
    const c = this.nameCheck(n); if (!c.ok) return { error: "name", ...c };
    const t = Date.now();
    this.sql.exec("INSERT OR REPLACE INTO held (name_l, until) VALUES (?, ?)", u.name_l, t + NAME_HELD);
    this.sql.exec("UPDATE users SET name = ?, name_l = ?, name_at = ? WHERE id = ?", n, n, t, u.id);
    return { ok: true, user: await this.publicUser({ ...u, name: n, name_at: t }) };
  }
  async signOut(token) {
    if (!token) return { ok: true };
    const s = this.one("SELECT user FROM sessions WHERE hash = ?", await hash(token));
    this.sql.exec("DELETE FROM sessions WHERE hash = ?", await hash(token));
    // Signed out everywhere: friend notifications stop too (the app also switches them off before signing out).
    if (s && !this.one("SELECT 1 AS x FROM sessions WHERE user = ?", s.user)) this.sql.exec("DELETE FROM fpings WHERE user = ?", s.user);
    return { ok: true };
  }
  // Delete the account: everything about it goes. The name stays held for a while so nobody can pose as them.
  async remove(token) {
    const u = await this.sessionUser(token);
    if (!u) return { error: "signed_out", status: 401 };
    this.sql.exec("INSERT OR REPLACE INTO held (name_l, until) VALUES (?, ?)", u.name_l, Date.now() + NAME_HELD);
    this.fForget(u.id);
    for (const q of ["DELETE FROM creds WHERE user = ?", "DELETE FROM sessions WHERE user = ?", "DELETE FROM tickets WHERE user = ?", "DELETE FROM users WHERE id = ?"]) this.sql.exec(q, u.id);
    return { ok: true, user: u.id };
  }
}

Object.assign(Accounts.prototype, friendMethods, photoMethods);

// ---------------- A person's vault: their backed-up days ----------------
export class Vault extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.sql = ctx.storage.sql; this.sql.exec("CREATE TABLE IF NOT EXISTS b (k TEXT PRIMARY KEY, v TEXT, at INTEGER)"); }
  read() { const r = this.sql.exec("SELECT v, at FROM b WHERE k = 'days'").toArray()[0]; return r ? { ok: true, data: JSON.parse(r.v), at: r.at } : { ok: true, data: null, at: 0 }; }
  // base: the backup this phone last saw. If another device saved since, nothing is overwritten: the phone gets
  // the newer backup back to merge first.
  write(text, base) {
    const cur = this.sql.exec("SELECT v, at FROM b WHERE k = 'days'").toArray()[0];
    // Even a phone that has never synced (base 0) can't overwrite a backup that exists: it gets it back to merge.
    if (cur && cur.at !== base) return { ok: false, conflict: true, data: JSON.parse(cur.v), at: cur.at };
    const at = Math.max(Date.now(), (cur ? cur.at : 0) + 1);
    this.sql.exec("INSERT OR REPLACE INTO b (k, v, at) VALUES ('days', ?, ?)", text, at);
    return { ok: true, at };
  }
  async wipe() { await this.ctx.storage.deleteAll(); return { ok: true }; }
}
