// Friends (social stage 1, step 2; alex 2026-11-20, CLAUDE.md "Social"). Friends only, seen and supported, never
// measured. Friendships are mutual: one person asks, the other says yes. Added by exact @username or by an invite
// link; there is no search and no list of everyone. Requests can be turned off. Remove and block are always there.
// Adults only: nothing here works until the person has ticked "I'm 18 or over".
//
// Lives in the same book as accounts (accounts.js), keyed by account id, so changing a username never breaks a
// friendship. Kept: a small profile (name, "This season" line, which little picture), who is friends with whom,
// waiting requests, blocks, and invite links (only ever stored scrambled). Deleting an account removes all of it.
// Moments (step 3) and photos (step 4) come later.

const DAY = 86400000;
export const LIMITS = { friends: 150, waiting: 50, lookups: 60, invite: 14 * DAY, name: 30, season: 60 };
const PICS = ["flower", "smile", "frog", "cat", "bunny", "bear", "chick", "sprout"];

export function friendTables(sql) {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS prof (user TEXT PRIMARY KEY, name TEXT, season TEXT, pic TEXT, adult INTEGER, closed INTEGER, hide INTEGER, at INTEGER);
    CREATE TABLE IF NOT EXISTS pals (a TEXT, b TEXT, at INTEGER, PRIMARY KEY (a, b));
    CREATE TABLE IF NOT EXISTS asks (f TEXT, t TEXT, at INTEGER, PRIMARY KEY (f, t));
    CREATE TABLE IF NOT EXISTS blocks (owner TEXT, who TEXT, at INTEGER, PRIMARY KEY (owner, who));
    CREATE TABLE IF NOT EXISTS invites (hash TEXT PRIMARY KEY, user TEXT, exp INTEGER);`);
}

// Words typed for a name or "This season": plain text only, with invisible characters and line breaks taken out.
// They're always shown as plain text in the app, never as code.
export function tidyText(s, max) {
  return String(s == null ? "" : s).normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

// The routes: /a/f/...  b is the book; who is the signed-in account (or null).
export async function friendRoutes(req, path, body, b, token, reply) {
  const out = async (p) => { const r = await p; return reply(r, r && r.error ? (r.status || 400) : 200); };
  const q = new URL(req.url).searchParams;
  switch (`${req.method} ${path}`) {
    case "GET /a/f": return out(b.fAll(token));
    case "POST /a/f/profile": return out(b.fProfile(token, body));
    case "GET /a/f/find": return out(b.fFind(token, q.get("u") || ""));
    case "GET /a/f/person": return out(b.fPerson(token, q.get("u") || ""));
    case "POST /a/f/ask": return out(b.fAsk(token, String(body.username || "")));
    case "POST /a/f/answer": return out(b.fAnswer(token, String(body.username || ""), !!body.yes));
    case "POST /a/f/cancel": return out(b.fCancel(token, String(body.username || "")));
    case "POST /a/f/remove": return out(b.fRemove(token, String(body.username || "")));
    case "POST /a/f/block": return out(b.fBlock(token, String(body.username || ""), body.undo === true));
    case "POST /a/f/invite": return out(b.fInvite(token));
    case "POST /a/f/join": return out(b.fJoin(token, String(body.t || "")));
  }
  return null;
}

// Methods added to the book (Accounts in accounts.js). this.rows / this.one / this.sql / this.sessionUser come from there.
export const friendMethods = {
  fProf(id) { return this.one("SELECT * FROM prof WHERE user = ?", id) || { user: id, name: "", season: "", pic: "smile", adult: 0, closed: 0, hide: 0 }; },
  // What a friend (or someone looking you up) sees. Never the email.
  fCard(u, extra = {}) {
    const p = this.fProf(u.id);
    return { username: u.name, name: p.name || "", pic: PICS.includes(p.pic) ? p.pic : "smile", ...extra };
  },
  fByName(n) { return this.one("SELECT * FROM users WHERE name_l = ?", String(n || "").trim().replace(/^@/, "").toLowerCase()); },
  fBlocked(a, b) { return !!this.one("SELECT 1 AS x FROM blocks WHERE (owner = ? AND who = ?) OR (owner = ? AND who = ?)", a, b, b, a); },
  fIsPal(a, b) { return !!this.one("SELECT 1 AS x FROM pals WHERE a = ? AND b = ?", a, b); },
  fCount(id) { return this.one("SELECT COUNT(*) AS n FROM pals WHERE a = ?", id).n; },
  fState(me, them) {
    if (me === them) return "you";
    if (this.fIsPal(me, them)) return "friends";
    if (this.one("SELECT 1 AS x FROM asks WHERE f = ? AND t = ?", me, them)) return "asked";
    if (this.one("SELECT 1 AS x FROM asks WHERE f = ? AND t = ?", them, me)) return "asks_you";
    return "none";
  },
  fBefriend(a, b) {
    const t = Date.now();
    this.sql.exec("INSERT OR IGNORE INTO pals (a, b, at) VALUES (?, ?, ?)", a, b, t);
    this.sql.exec("INSERT OR IGNORE INTO pals (a, b, at) VALUES (?, ?, ?)", b, a, t);
    this.sql.exec("DELETE FROM asks WHERE (f = ? AND t = ?) OR (f = ? AND t = ?)", a, b, b, a);
  },
  fUnfriend(a, b) { this.sql.exec("DELETE FROM pals WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)", a, b, b, a); },

  // Signed in and ticked "I'm 18 or over"? Most things need both.
  async fGate(token, needAdult = true) {
    const u = await this.sessionUser(token);
    if (!u) return { error: "signed_out", status: 401 };
    if (needAdult && !this.fProf(u.id).adult) return { error: "adult", status: 403 };
    return { u };
  },
  // The person they mean, if they can be reached at all. Someone who blocked you, or whom you blocked, simply
  // isn't found (blocking never tells the other person).
  fTarget(me, name) {
    const them = this.fByName(name);
    if (!them || this.fBlocked(me.id, them.id)) return null;
    return them;
  },

  // Everything the Friends screen needs, in one go.
  async fAll(token) {
    const g = await this.fGate(token, false); if (g.error) return g;
    const me = g.u, p = this.fProf(me.id);
    const people = (sql, ...a) => this.rows(sql, ...a).map((r) => ({ u: this.one("SELECT * FROM users WHERE id = ?", r.id), at: r.at })).filter((x) => x.u);
    const friends = people("SELECT b AS id, at FROM pals WHERE a = ?", me.id).map((x) => this.fCard(x.u, { season: this.fProf(x.u.id).season || "", since: x.at }))
      .sort((x, y) => (x.name || x.username).localeCompare(y.name || y.username));
    const asksYou = people("SELECT f AS id, at FROM asks WHERE t = ? ORDER BY at DESC", me.id).map((x) => this.fCard(x.u, { at: x.at }));
    const asked = people("SELECT t AS id, at FROM asks WHERE f = ? ORDER BY at DESC", me.id).map((x) => this.fCard(x.u, { at: x.at }));
    const blocked = people("SELECT who AS id, at FROM blocks WHERE owner = ? ORDER BY at DESC", me.id).map((x) => ({ username: x.u.name }));
    return { ok: true, me: { ...this.fCard(me), season: p.season || "", adult: !!p.adult, closed: !!p.closed, hide: !!p.hide, friends: friends.length }, friends, asksYou, asked, blocked };
  },

  // Your name, "This season" line, picture, the 18+ tick, and the two switches (requests off, hide friends count).
  async fProfile(token, body) {
    const g = await this.fGate(token, false); if (g.error) return g;
    const me = g.u, p = this.fProf(me.id);
    const next = { ...p };
    if ("name" in body) {
      const n = tidyText(body.name, LIMITS.name);
      if (n && !this.fNameOK(n)) return { error: "name_words" };
      next.name = n;
    }
    if ("season" in body) next.season = tidyText(body.season, LIMITS.season);
    if ("pic" in body) next.pic = PICS.includes(body.pic) ? body.pic : "smile";
    if (body.adult === true) next.adult = 1;            // once ticked, it stays ticked
    if ("closed" in body) next.closed = body.closed ? 1 : 0;
    if ("hide" in body) next.hide = body.hide ? 1 : 0;
    this.sql.exec("INSERT OR REPLACE INTO prof (user, name, season, pic, adult, closed, hide, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      me.id, next.name || "", next.season || "", next.pic || "smile", next.adult ? 1 : 0, next.closed ? 1 : 0, next.hide ? 1 : 0, Date.now());
    return { ok: true };
  },
  // A display name can be anything kind: real names in any language are welcome, but not posing as Daydeck or
  // staff, and not the words usernames already refuse.
  fNameOK(n) {
    const plain = n.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return !this.nameProblemWords(plain);
  },

  // Look someone up by their exact @username (no partial search, so nobody can trawl the list).
  async fFind(token, name) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, t = Date.now(), k = "f:" + me.id;
    if (this.one("SELECT COUNT(*) AS n FROM sends WHERE k = ? AND at > ?", k, t - 3600000).n >= LIMITS.lookups) return { error: "too_many", status: 429 };
    this.sql.exec("INSERT INTO sends (k, at) VALUES (?, ?)", k, t);
    const them = this.fTarget(me, name);
    if (!them) return { ok: true, found: false };
    const state = this.fState(me.id, them.id);
    const closed = state === "none" && !!this.fProf(them.id).closed;
    return { ok: true, found: true, person: this.fCard(them, { state, closed }) };
  },

  // A friend's profile: name, @username, picture, "This season" and how many friends (unless they hid it).
  async fPerson(token, name) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, them = this.fTarget(me, name);
    if (!them) return { error: "not_found", status: 404 };
    const state = this.fState(me.id, them.id), p = this.fProf(them.id);
    if (state !== "friends" && state !== "you") return { ok: true, person: this.fCard(them, { state }) };
    const pal = this.one("SELECT at FROM pals WHERE a = ? AND b = ?", me.id, them.id);
    return { ok: true, person: this.fCard(them, { state, season: p.season || "", friends: p.hide ? null : this.fCount(them.id), since: pal ? pal.at : null }) };
  },

  async fAsk(token, name) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, them = this.fTarget(me, name);
    if (!them) return { error: "not_found", status: 404 };
    const state = this.fState(me.id, them.id);
    if (state === "you") return { error: "yourself" };
    if (state === "friends" || state === "asked") return { ok: true, state };
    if (state === "asks_you") {           // they already asked you: saying "add" is saying yes
      if (this.fCount(me.id) >= LIMITS.friends || this.fCount(them.id) >= LIMITS.friends) return { error: "full" };
      this.fBefriend(me.id, them.id); return { ok: true, state: "friends" };
    }
    if (this.fProf(them.id).closed) return { error: "closed" };
    if (this.one("SELECT COUNT(*) AS n FROM asks WHERE f = ?", me.id).n >= LIMITS.waiting) return { error: "too_many_waiting" };
    if (this.fCount(me.id) >= LIMITS.friends) return { error: "full" };
    this.sql.exec("INSERT OR IGNORE INTO asks (f, t, at) VALUES (?, ?, ?)", me.id, them.id, Date.now());
    return { ok: true, state: "asked" };
  },
  async fAnswer(token, name, yes) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, them = this.fByName(name);
    if (!them || !this.one("SELECT 1 AS x FROM asks WHERE f = ? AND t = ?", them.id, me.id)) return { error: "not_found", status: 404 };
    if (!yes) { this.sql.exec("DELETE FROM asks WHERE f = ? AND t = ?", them.id, me.id); return { ok: true, state: "none" }; }
    if (this.fCount(me.id) >= LIMITS.friends || this.fCount(them.id) >= LIMITS.friends) return { error: "full" };
    this.fBefriend(me.id, them.id);
    return { ok: true, state: "friends" };
  },
  async fCancel(token, name) {
    const g = await this.fGate(token, false); if (g.error) return g;
    const them = this.fByName(name);
    if (them) this.sql.exec("DELETE FROM asks WHERE f = ? AND t = ?", g.u.id, them.id);
    return { ok: true, state: "none" };
  },
  // Removing a friend is quiet: they aren't told, they just stop seeing each other's moments.
  async fRemove(token, name) {
    const g = await this.fGate(token, false); if (g.error) return g;
    const them = this.fByName(name);
    if (them) this.fUnfriend(g.u.id, them.id);
    return { ok: true, state: "none" };
  },
  // Block: not friends any more, no requests either way, and neither can find the other. Also quiet.
  async fBlock(token, name, undo) {
    const g = await this.fGate(token, false); if (g.error) return g;
    const me = g.u, them = this.fByName(name);
    if (!them || them.id === me.id) return { error: "not_found", status: 404 };
    if (undo) { this.sql.exec("DELETE FROM blocks WHERE owner = ? AND who = ?", me.id, them.id); return { ok: true }; }
    this.fUnfriend(me.id, them.id);
    this.sql.exec("DELETE FROM asks WHERE (f = ? AND t = ?) OR (f = ? AND t = ?)", me.id, them.id, them.id, me.id);
    this.sql.exec("INSERT OR IGNORE INTO blocks (owner, who, at) VALUES (?, ?, ?)", me.id, them.id, Date.now());
    return { ok: true };
  },

  // An invite link: daydeck.day/?add=... Making a new one retires the old one. Lasts 14 days, works for a few
  // friends. Only its scrambled form is kept.
  async fInvite(token) {
    const g = await this.fGate(token); if (g.error) return g;
    const t = this.newToken();
    this.sql.exec("DELETE FROM invites WHERE user = ? OR exp < ?", g.u.id, Date.now());
    this.sql.exec("INSERT INTO invites (hash, user, exp) VALUES (?, ?, ?)", await this.scramble("inv:" + t), g.u.id, Date.now() + LIMITS.invite);
    return { ok: true, t, until: Date.now() + LIMITS.invite };
  },
  // Opening someone's invite: it lands as a request from them, waiting in Friends (saying yes needs the 18+ tick,
  // like any other request). The person who made the link already said yes by sharing it.
  async fJoin(token, t) {
    const g = await this.fGate(token, false); if (g.error) return g;
    const me = g.u;
    const inv = t && this.one("SELECT * FROM invites WHERE hash = ? AND exp > ?", await this.scramble("inv:" + t), Date.now());
    const them = inv && this.one("SELECT * FROM users WHERE id = ?", inv.user);
    if (!them || this.fBlocked(me.id, them.id)) return { error: "old_invite" };
    if (them.id === me.id) return { ok: true, state: "you" };
    const state = this.fState(me.id, them.id);
    if (state === "friends") return { ok: true, state, person: this.fCard(them) };
    if (state === "asked") { this.fBefriend(me.id, them.id); return { ok: true, state: "friends", person: this.fCard(them) }; }
    this.sql.exec("INSERT OR IGNORE INTO asks (f, t, at) VALUES (?, ?, ?)", them.id, me.id, Date.now());
    return { ok: true, state: "asks_you", person: this.fCard(them) };
  },

  // Deleting an account: every friendship, request, block, invite and the profile go too.
  fForget(id) {
    this.sql.exec("DELETE FROM prof WHERE user = ?", id);
    this.sql.exec("DELETE FROM pals WHERE a = ? OR b = ?", id, id);
    this.sql.exec("DELETE FROM asks WHERE f = ? OR t = ?", id, id);
    this.sql.exec("DELETE FROM blocks WHERE owner = ? OR who = ?", id, id);
    this.sql.exec("DELETE FROM invites WHERE user = ?", id);
  },
};
