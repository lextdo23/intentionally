// Friends (social stage 1, step 2; alex 2026-11-20, CLAUDE.md "Social"). Friends only, seen and supported, never
// measured. Friendships are mutual: one person asks, the other says yes. Added by exact @username or by an invite
// link; there is no search and no list of everyone. Requests can be turned off. Remove and block are always there.
// Adults only: nothing here works until the person has ticked "I'm 18 or over".
//
// Lives in the same book as accounts (accounts.js), keyed by account id, so changing a username never breaks a
// friendship. Kept: a small profile (name, "This season" line, which little picture), who is friends with whom,
// waiting requests, blocks, and invite links (only ever stored scrambled). Deleting an account removes all of it.
// Moments (step 3, 2026-11-21): a day's card (or a card they made, or a rest day) shared with friends, with their own
// words and, only if they choose, how the day felt in words. "I see you" is the one reaction, never counted: the
// person who shared sees who said it; others see only their own friends among them.
// Photos (2026-11-21): a shared moment can be the day's photo (photos first, alex). The phone shrinks and cleans it
// (nothing but the picture) before it's sent; it's kept here with the moment, and only the owner and their friends
// can fetch it. It goes when the moment is removed, or with the account. (Backing up every photo is separate.)
// Profile photos (alex 2026-11-22): a photo picture is shown to friends too. The phone sends a small square (240 by
// 240, cleaned: nothing but the picture); it's kept here and only you, your friends, and someone you've asked to be
// friends can fetch it. Everyone else sees the smile. Picking a little one, or deleting the account, removes it.
// An account whose sharing alex has paused shows the smile to others.
// Reports (step 5, 2026-11-21): from the ••• on a friend's moment or profile, with a reason and, if they like, a few
// words. A copy of what was reported is kept so alex can review it on the tester page (Reports tab) even if it's
// deleted; the person reported is never told who reported them. A moment reported by three different people is held
// back from feeds until alex looks. alex can keep it, remove the moment, or pause the account's sharing. Reviewed
// reports (and their copies) are deleted after 90 days.
// Friend notifications (alex 2026-11-25): off until someone presses "Turn on". Then, when a friend shares, their
// phone gets "Mia shared a moment" (the friend's chosen name, else their @username; never a photo, caption or mood).
// At most one an hour (several friends in that hour make one: "Mia and 2 others shared moments"), and none between
// 10pm and 8am where that phone is: the night's wait for one at 8am. Kept for it: the phone's push address and its
// two keys (so only that phone can read the words), its time zone, and when it was last pinged. Switching it off,
// signing out or deleting the account removes them.

import { ping, pushable } from "./webpush.js";

const DAY = 86400000;
const HOUR = 3600000;
export const PINGS = { gap: HOUR, quietFrom: 22, quietTo: 8, ttl: 6 * HOUR };
export const LIMITS = { friends: 150, waiting: 50, lookups: 60, invite: 14 * DAY, name: 30, season: 60, perDay: 10, feedDays: 14, feedMax: 100, profileMax: 120, text: 200, caption: 280, photo: 450000, face: 60000 };
const PICS = ["flower", "smile", "frog", "cat", "bunny", "bear", "chick", "sprout"];
const TINTS = ["#d9b3a6", "#cfc59b", "#a9c4b5", "#a9b9d6", "#c4b4c9", "#a9c9cf"];
export const REASONS = ["hurtful", "sexual", "risk", "spam", "else"];
const KEEP_DONE = 90 * DAY, HOLD_AT = 3;
const MOOD_WORDS = ["awful", "rough", "low", "okay", "good", "really good", "great"];   // the app's own mood words, in words only

// A shared photo must be a small JPEG with nothing but the picture: no location, time, phone or camera details
// (the app cleans it first; this checks again). Returns the data address to keep, or null.
export function photoOK(s) {
  if (typeof s !== "string" || s.length > LIMITS.photo || !s.startsWith("data:image/jpeg;base64,")) return null;
  let a;
  try { const t = atob(s.slice(23)); a = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i); } catch { return null; }
  if (a.length < 100 || a[0] !== 0xff || a[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= a.length) {
    if (a[i] !== 0xff) return null;
    const m = a[i + 1];
    if (m === 0xda) return s;                              // the picture itself starts: the details before it were clean
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
    if ((m >= 0xe1 && m <= 0xef) || m === 0xfe) return null;   // EXIF, XMP, comments and other extras: refused
    i += 2 + ((a[i + 2] << 8) | a[i + 3]);
  }
  return null;
}

export function friendTables(sql) {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS prof (user TEXT PRIMARY KEY, name TEXT, season TEXT, pic TEXT, adult INTEGER, closed INTEGER, hide INTEGER, at INTEGER);
    CREATE TABLE IF NOT EXISTS pals (a TEXT, b TEXT, at INTEGER, PRIMARY KEY (a, b));
    CREATE TABLE IF NOT EXISTS asks (f TEXT, t TEXT, at INTEGER, PRIMARY KEY (f, t));
    CREATE TABLE IF NOT EXISTS blocks (owner TEXT, who TEXT, at INTEGER, PRIMARY KEY (owner, who));
    CREATE TABLE IF NOT EXISTS invites (hash TEXT PRIMARY KEY, user TEXT, exp INTEGER);
    CREATE TABLE IF NOT EXISTS moments (id TEXT PRIMARY KEY, owner TEXT, day TEXT, item TEXT, data TEXT, at INTEGER, UNIQUE (owner, day, item));
    CREATE TABLE IF NOT EXISTS sees (moment TEXT, who TEXT, at INTEGER, PRIMARY KEY (moment, who));
    CREATE TABLE IF NOT EXISTS hides (owner TEXT, who TEXT, PRIMARY KEY (owner, who));
    CREATE TABLE IF NOT EXISTS mphotos (moment TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE IF NOT EXISTS faces (user TEXT PRIMARY KEY, data TEXT, v INTEGER);
    CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, reporter TEXT, who TEXT, moment TEXT, why TEXT, note TEXT, snap TEXT, photo TEXT, at INTEGER, state TEXT, done INTEGER);
    CREATE TABLE IF NOT EXISTS mheld (moment TEXT PRIMARY KEY, at INTEGER);
    CREATE TABLE IF NOT EXISTS paused (user TEXT PRIMARY KEY, at INTEGER);
    CREATE TABLE IF NOT EXISTS mailed (k TEXT PRIMARY KEY, at INTEGER);
    CREATE TABLE IF NOT EXISTS fpings (user TEXT PRIMARY KEY, sub TEXT, tz TEXT, pend TEXT, last INTEGER, due INTEGER);`);
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
    case "GET /a/f/common": return out(b.fCommonAll(token, q.get("u") || ""));
    case "POST /a/f/ask": return out(b.fAsk(token, String(body.username || "")));
    case "POST /a/f/answer": return out(b.fAnswer(token, String(body.username || ""), !!body.yes));
    case "POST /a/f/cancel": return out(b.fCancel(token, String(body.username || "")));
    case "POST /a/f/remove": return out(b.fRemove(token, String(body.username || "")));
    case "POST /a/f/block": return out(b.fBlock(token, String(body.username || ""), body.undo === true));
    case "POST /a/f/invite": return out(b.fInvite(token));
    case "POST /a/f/join": return out(b.fJoin(token, String(body.t || "")));
    case "POST /a/f/share": return out(b.mShare(token, body));
    case "POST /a/f/unshare": return out(b.mUnshare(token, String(body.id || "")));
    case "GET /a/f/feed": return out(b.mFeed(token));
    case "GET /a/f/moments": return out(b.mOf(token, q.get("u") || ""));
    case "POST /a/f/see": return out(b.mSee(token, String(body.id || ""), body.undo === true));
    case "POST /a/f/report": return out(b.rReport(token, body));
    case "GET /a/f/photo": return out(b.mPhoto(token, q.get("id") || ""));
    case "GET /a/f/face": return out(b.fFace(token, q.get("u") || ""));
    case "POST /a/f/pings": return out(b.pSet(token, body));
    case "POST /a/f/hide": return out(b.mHide(token, String(body.username || ""), body.undo === true));
  }
  return null;
}

// Methods added to the book (Accounts in accounts.js). this.rows / this.one / this.sql / this.sessionUser come from there.
export const friendMethods = {
  fProf(id) { return this.one("SELECT * FROM prof WHERE user = ?", id) || { user: id, name: "", season: "", pic: "smile", adult: 0, closed: 0, hide: 0 }; },
  // What a friend (or someone looking you up) sees. Never the email.
  fCard(u, extra = {}) {
    const p = this.fProf(u.id), face = p.pic === "photo" ? this.fFaceRow(u.id) : null;
    if (face) return { username: u.name, name: p.name || "", pic: "photo", pv: face.v, ...extra };
    return { username: u.name, name: p.name || "", pic: PICS.includes(p.pic) ? p.pic : "smile", ...extra };
  },
  // Your profile photo, unless alex has paused your sharing (then others see the smile).
  fFaceRow(id) { return this.one("SELECT 1 AS x FROM paused WHERE user = ?", id) ? null : this.one("SELECT v FROM faces WHERE user = ?", id); },
  // A profile photo: for you, your friends, and someone you've asked to be friends (so they know who's asking).
  async fFace(token, name) {
    const g = await this.fGate(token, false); if (g.error) return g;
    const me = g.u, them = this.fByName(name);
    if (!them) return { error: "not_found", status: 404 };
    const mine = them.id === me.id;
    const may = mine || (!this.fBlocked(me.id, them.id) && (this.fIsPal(me.id, them.id) || !!this.one("SELECT 1 AS x FROM asks WHERE f = ? AND t = ?", them.id, me.id)));
    if (!may || this.fProf(them.id).pic !== "photo" || (!mine && !this.fFaceRow(them.id))) return { error: "not_found", status: 404 };
    const f = this.one("SELECT data, v FROM faces WHERE user = ?", them.id);
    return f ? { ok: true, data: f.data, v: f.v } : { error: "not_found", status: 404 };
  },
  fByName(n) { return this.one("SELECT * FROM users WHERE name_l = ?", String(n || "").trim().replace(/^@/, "").toLowerCase()); },
  fBlocked(a, b) { return !!this.one("SELECT 1 AS x FROM blocks WHERE (owner = ? AND who = ?) OR (owner = ? AND who = ?)", a, b, b, a); },
  fIsPal(a, b) { return !!this.one("SELECT 1 AS x FROM pals WHERE a = ? AND b = ?", a, b); },
  fCount(id) { return this.one("SELECT COUNT(*) AS n FROM pals WHERE a = ?", id).n; },
  // Friends in common (alex 2026-11-25): only your own friends who are also theirs. Nobody new is ever shown.
  // Someone with "Show my friends" off is never shown as a friend in common, and their own profile shows none.
  // Sorted A to Z by what you'd see (name, else @username).
  fCommon(meId, themId) {
    if (meId === themId || this.fProf(themId).hide) return [];
    return this.rows(`SELECT p.b AS id FROM pals p JOIN pals q ON q.a = ? AND q.b = p.b WHERE p.a = ? AND p.b != ? AND p.b != ?
      AND p.b NOT IN (SELECT user FROM prof WHERE hide = 1)`, themId, meId, meId, themId)
      .map((r) => this.one("SELECT * FROM users WHERE id = ?", r.id)).filter(Boolean).map((u) => this.fCard(u))
      .sort((x, y) => (x.name || x.username).localeCompare(y.name || y.username));
  },
  // The short form that rides along with a person: up to three to name, and how many in all.
  fCommonShort(meId, themId) { const all = this.fCommon(meId, themId); return { common: all.slice(0, 3), commonN: all.length }; },
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
  fUnfriend(a, b) {
    this.sql.exec("DELETE FROM pals WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)", a, b, b, a);
    // Their "I see you"s on each other's moments go too.
    this.sql.exec("DELETE FROM sees WHERE (who = ? AND moment IN (SELECT id FROM moments WHERE owner = ?)) OR (who = ? AND moment IN (SELECT id FROM moments WHERE owner = ?))", a, b, b, a);
  },

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
    const asksYou = people("SELECT f AS id, at FROM asks WHERE t = ? ORDER BY at DESC", me.id).map((x) => this.fCard(x.u, { at: x.at, ...this.fCommonShort(me.id, x.u.id) }));
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
    if ("pic" in body) {
      if (body.pic === "photo") {
        const ph = typeof body.photo === "string" && body.photo.length <= LIMITS.face ? photoOK(body.photo) : null;
        if (ph) this.sql.exec("INSERT OR REPLACE INTO faces (user, data, v) VALUES (?, ?, ?)", me.id, ph, Date.now());
        else if (!this.one("SELECT 1 AS x FROM faces WHERE user = ?", me.id)) return { error: "bad_photo" };
        next.pic = "photo";
      } else {
        next.pic = PICS.includes(body.pic) ? body.pic : "smile";
        this.sql.exec("DELETE FROM faces WHERE user = ?", me.id);
      }
    }
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
    return { ok: true, found: true, person: this.fCard(them, { state, closed, ...this.fCommonShort(me.id, them.id) }) };
  },

  // A friend's profile: name, @username, picture, "This season" and how many friends (unless they hid it).
  async fPerson(token, name) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, them = this.fTarget(me, name);
    if (!them) return { error: "not_found", status: 404 };
    const state = this.fState(me.id, them.id), p = this.fProf(them.id);
    const common = this.fCommonShort(me.id, them.id);
    if (state !== "friends" && state !== "you") return { ok: true, person: this.fCard(them, { state, ...common }) };
    const pal = this.one("SELECT at FROM pals WHERE a = ? AND b = ?", me.id, them.id);
    const hidden = !!this.one("SELECT 1 AS x FROM hides WHERE owner = ? AND who = ?", me.id, them.id);
    return { ok: true, person: this.fCard(them, { state, season: p.season || "", friends: p.hide ? null : this.fCount(them.id), since: pal ? pal.at : null, hidden, ...common }) };
  },
  // Everyone you and they both know, for the full page you open by tapping "Friends with …".
  async fCommonAll(token, name) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, them = this.fTarget(me, name);
    if (!them) return { error: "not_found", status: 404 };
    return { ok: true, people: this.fCommon(me.id, them.id).map((c) => ({ ...c, season: this.fProf(this.fByName(c.username).id).season || "" })) };
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
    const fresh = !this.one("SELECT 1 AS x FROM asks WHERE f = ? AND t = ?", me.id, them.id);
    this.sql.exec("INSERT OR IGNORE INTO asks (f, t, at) VALUES (?, ?, ?)", me.id, them.id, Date.now());
    if (fresh) await this.pAsk(me.id, them.id);   // they get told, in time, if their friend notifications are on
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

  // ---------------- Moments ----------------
  // What a moment may hold. Anything else is dropped; words are tidied like names.
  mClean(body) {
    const day = String(body.day || ""), item = String(body.item || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^(card|rest|photo|week|o\d{1,5}|l[a-z0-9]{10}|\d{1,5})$/.test(item)) return null;
    // week (alex 2026-11-23): the weekly recap's card, shared to your profile as a picture; day is the week's Monday.
    const kind = ["card", "own", "rest", "photo", "week"].includes(body.kind) ? body.kind : null;
    if (!kind || (kind === "photo") !== (item === "photo") || (kind === "week") !== (item === "week")) return null;
    const text = tidyText(body.text, LIMITS.text), pillar = tidyText(body.pillar, 30), cap = tidyText(body.cap, LIMITS.caption);
    if ((kind === "card" || kind === "own") && !text) return null;
    const col = TINTS.includes(body.col) ? body.col : null;
    const status = ["Done", "Rested", ""].includes(body.status) ? body.status : "";
    const mood = MOOD_WORDS.includes(body.mood) ? body.mood : null;
    const feel = mood && Array.isArray(body.feel) ? body.feel.map((f) => tidyText(f, 24)).filter(Boolean).slice(0, 6) : [];
    let photo = null;
    if (kind === "photo" || kind === "week") { photo = photoOK(body.photo); if (!photo) return null; }
    return { day, item, photo, data: { kind, text, pillar, col, status, cap, mood, feel, ph: !!photo } };
  },
  mOut(row, meId, owner, extra = {}) {
    // Who said "I see you": the person who shared sees everyone; others see only themselves and their own friends.
    const all = this.rows("SELECT s.who AS id, s.at FROM sees s WHERE s.moment = ? ORDER BY s.at", row.id);
    const seers = all.filter((x) => x.id === meId || meId === row.owner || this.fIsPal(meId, x.id))
      .map((x) => this.one("SELECT * FROM users WHERE id = ?", x.id)).filter(Boolean).map((u) => this.fCard(u));
    return { id: row.id, day: row.day, item: row.item, at: row.at, ...JSON.parse(row.data), by: this.fCard(owner), mine: row.owner === meId, seen: all.some((x) => x.id === meId), seers, ...extra };
  },
  async mShare(token, body) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, m = this.mClean(body || {});
    if (!m) return { error: "bad_moment" };
    if (this.one("SELECT 1 AS x FROM paused WHERE user = ?", me.id)) return { error: "paused" };
    const t = Date.now(), had = this.one("SELECT id FROM moments WHERE owner = ? AND day = ? AND item = ?", me.id, m.day, m.item);
    if (!had && this.one("SELECT COUNT(*) AS n FROM moments WHERE owner = ? AND at > ?", me.id, t - DAY).n >= LIMITS.perDay) return { error: "too_many_shares" };
    const id = had ? had.id : this.newToken().slice(0, 16);
    // Sharing the same thing again updates it (and brings it back to the top), keeping its "I see you"s.
    this.sql.exec("INSERT OR REPLACE INTO moments (id, owner, day, item, data, at) VALUES (?, ?, ?, ?, ?, ?)", id, me.id, m.day, m.item, JSON.stringify(m.data), t);
    if (m.photo) this.sql.exec("INSERT OR REPLACE INTO mphotos (moment, data) VALUES (?, ?)", id, m.photo);
    if (!had) await this.pQueue(me.id, id);   // a new moment, not an update: friends who asked get told (in time)
    return { ok: true, moment: this.mOut(this.one("SELECT * FROM moments WHERE id = ?", id), me.id, me), again: !!had };
  },
  async mUnshare(token, id) {
    const g = await this.fGate(token, false); if (g.error) return g;
    const row = this.one("SELECT * FROM moments WHERE id = ? AND owner = ?", id, g.u.id);
    if (row) this.mDrop(id);
    return { ok: true };
  },
  // Friends' moments (and your own) from the last two weeks, newest first. Friends whose moments you hid are left out.
  async mFeed(token) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, since = Date.now() - LIMITS.feedDays * DAY;
    const rows = this.rows(`SELECT * FROM moments WHERE at > ? AND (owner = ? OR (owner IN (SELECT b FROM pals WHERE a = ?) AND owner NOT IN (SELECT who FROM hides WHERE owner = ?)
      AND owner NOT IN (SELECT user FROM paused) AND id NOT IN (SELECT moment FROM mheld))) ORDER BY at DESC LIMIT ?`,
      since, me.id, me.id, me.id, LIMITS.feedMax);
    const users = {};
    const who = (id) => (users[id] ||= this.one("SELECT * FROM users WHERE id = ?", id));
    return { ok: true, moments: rows.filter((r) => who(r.owner)).map((r) => this.mOut(r, me.id, who(r.owner))) };
  },
  // One person's moments, for their profile grid: yours, or a friend's.
  async mOf(token, name) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, them = this.fTarget(me, name);
    if (!them) return { error: "not_found", status: 404 };
    if (them.id !== me.id && !this.fIsPal(me.id, them.id)) return { ok: true, moments: [] };
    if (them.id !== me.id && this.one("SELECT 1 AS x FROM paused WHERE user = ?", them.id)) return { ok: true, moments: [] };
    const rows = this.rows(`SELECT * FROM moments WHERE owner = ? ${them.id === me.id ? "" : "AND id NOT IN (SELECT moment FROM mheld)"} ORDER BY at DESC LIMIT ?`, them.id, LIMITS.profileMax);
    return { ok: true, moments: rows.map((r) => this.mOut(r, me.id, them)) };
  },
  mDrop(id) { for (const t of ["sees", "mphotos", "mheld"]) this.sql.exec(`DELETE FROM ${t} WHERE moment = ?`, id); this.sql.exec("DELETE FROM moments WHERE id = ?", id); },
  // A shared photo: only for its owner and their friends.
  async mPhoto(token, id) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, row = this.one("SELECT owner FROM moments WHERE id = ?", id);
    if (!row || (row.owner !== me.id && !this.fIsPal(me.id, row.owner))) return { error: "not_found", status: 404 };
    const ph = this.one("SELECT data FROM mphotos WHERE moment = ?", id);
    return ph ? { ok: true, data: ph.data } : { error: "not_found", status: 404 };
  },
  async mSee(token, id, undo) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, row = this.one("SELECT * FROM moments WHERE id = ?", id);
    if (!row || (row.owner !== me.id && !this.fIsPal(me.id, row.owner))) return { error: "not_found", status: 404 };
    if (undo) this.sql.exec("DELETE FROM sees WHERE moment = ? AND who = ?", id, me.id);
    else this.sql.exec("INSERT OR IGNORE INTO sees (moment, who, at) VALUES (?, ?, ?)", id, me.id, Date.now());
    return { ok: true, moment: this.mOut(row, me.id, this.one("SELECT * FROM users WHERE id = ?", row.owner)) };
  },
  // Hide a friend's moments from your feed (they aren't told, and you stay friends).
  async mHide(token, name, undo) {
    const g = await this.fGate(token, false); if (g.error) return g;
    const them = this.fByName(name);
    if (!them || them.id === g.u.id) return { error: "not_found", status: 404 };
    if (undo) this.sql.exec("DELETE FROM hides WHERE owner = ? AND who = ?", g.u.id, them.id);
    else this.sql.exec("INSERT OR IGNORE INTO hides (owner, who) VALUES (?, ?)", g.u.id, them.id);
    return { ok: true };
  },

  // ---------------- Reports ----------------
  // Report a friend's moment, or a person (from their profile). One report per person per thing; reporting again
  // updates it. notify: tell alex by email (at most once an hour, and never what was reported).
  async rReport(token, body) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, why = REASONS.includes(body.why) ? body.why : null, note = tidyText(body.note, 300);
    if (!why) return { error: "bad_report" };
    let who = null, moment = null, snap = null, photo = null;
    if (body.moment) {
      const row = this.one("SELECT * FROM moments WHERE id = ?", String(body.moment));
      if (!row || row.owner === me.id || !this.fIsPal(me.id, row.owner)) return { error: "not_found", status: 404 };
      who = row.owner; moment = row.id; snap = { day: row.day, ...JSON.parse(row.data) };
      const ph = this.one("SELECT data FROM mphotos WHERE moment = ?", row.id); photo = ph ? ph.data : null;
    } else {
      const them = this.fByName(String(body.username || ""));
      if (!them || them.id === me.id) return { error: "not_found", status: 404 };
      who = them.id;
      const f = this.one("SELECT data FROM faces WHERE user = ?", who); photo = f ? f.data : null;   // their profile photo, for alex to see
    }
    const p = this.fProf(who);
    snap = { ...(snap || {}), profile: { name: p.name || "", season: p.season || "", pic: p.pic || "smile" } };
    const had = this.one("SELECT id FROM reports WHERE reporter = ? AND who = ? AND moment IS ? AND state = 'open'", me.id, who, moment);
    const id = had ? had.id : this.newToken().slice(0, 16), t = Date.now();
    this.sql.exec("INSERT OR REPLACE INTO reports (id, reporter, who, moment, why, note, snap, photo, at, state, done) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL)",
      id, me.id, who, moment, why, note, JSON.stringify(snap), photo, t);
    // Three different people reporting the same moment: it's held back from feeds until alex looks.
    if (moment && this.one("SELECT COUNT(DISTINCT reporter) AS n FROM reports WHERE moment = ? AND state = 'open'", moment).n >= HOLD_AT)
      this.sql.exec("INSERT OR IGNORE INTO mheld (moment, at) VALUES (?, ?)", moment, t);
    const last = this.one("SELECT at FROM mailed WHERE k = 'reports'");
    const notify = !last || t - last.at > 3600000;
    if (notify) this.sql.exec("INSERT OR REPLACE INTO mailed (k, at) VALUES ('reports', ?)", t);
    return { ok: true, notify };
  },
  // For alex (tester page, behind TESTER_KEY): open reports first, then those reviewed lately.
  rList() {
    this.sql.exec("DELETE FROM reports WHERE state != 'open' AND done < ?", Date.now() - KEEP_DONE);
    const name = (id) => { const u = this.one("SELECT name FROM users WHERE id = ?", id); return u ? u.name : null; };
    const out = (r) => ({ id: r.id, why: r.why, note: r.note || "", at: r.at, state: r.state, done: r.done, moment: r.moment, still: !!(r.moment && this.one("SELECT 1 AS x FROM moments WHERE id = ?", r.moment)),
      held: !!(r.moment && this.one("SELECT 1 AS x FROM mheld WHERE moment = ?", r.moment)), paused: !!this.one("SELECT 1 AS x FROM paused WHERE user = ?", r.who),
      who: name(r.who) || "(account deleted)", by: name(r.reporter) || "(account deleted)", about: this.one("SELECT COUNT(*) AS n FROM reports WHERE who = ?", r.who).n,
      snap: JSON.parse(r.snap || "{}"), photo: r.photo || null });
    return { ok: true, open: this.rows("SELECT * FROM reports WHERE state = 'open' ORDER BY at").map(out), done: this.rows("SELECT * FROM reports WHERE state != 'open' ORDER BY done DESC LIMIT 30").map(out) };
  },
  // alex's answer: keep (nothing wrong), remove (the moment goes), pause (the account can't share, and their moments
  // are hidden from friends), unpause. Every open report about the same thing is answered together.
  rAct(id, act) {
    const r = this.one("SELECT * FROM reports WHERE id = ?", id);
    if (!r || !["keep", "remove", "pause", "unpause"].includes(act)) return { error: "not_found", status: 404 };
    const t = Date.now(), same = r.moment ? ["moment = ?", r.moment] : ["who = ? AND moment IS NULL", r.who];
    const close = (state) => this.sql.exec(`UPDATE reports SET state = ?, done = ?, photo = NULL WHERE state = 'open' AND ${same[0]}`, state, t, same[1]);
    if (act === "keep") { if (r.moment) this.sql.exec("DELETE FROM mheld WHERE moment = ?", r.moment); close("kept"); }
    if (act === "remove" && r.moment) { this.mDrop(r.moment); close("removed"); }
    if (act === "pause") { this.sql.exec("INSERT OR IGNORE INTO paused (user, at) VALUES (?, ?)", r.who, t); close("paused"); }
    if (act === "unpause") this.sql.exec("DELETE FROM paused WHERE user = ?", r.who);
    return { ok: true };
  },

  // Deleting an account: every friendship, request, block, invite and the profile (and its photo) go too.
  fForget(id) {
    this.sql.exec("DELETE FROM prof WHERE user = ?", id);
    this.sql.exec("DELETE FROM faces WHERE user = ?", id);
    this.sql.exec("DELETE FROM pals WHERE a = ? OR b = ?", id, id);
    this.sql.exec("DELETE FROM asks WHERE f = ? OR t = ?", id, id);
    this.sql.exec("DELETE FROM blocks WHERE owner = ? OR who = ?", id, id);
    this.sql.exec("DELETE FROM invites WHERE user = ?", id);
    this.sql.exec("DELETE FROM sees WHERE who = ? OR moment IN (SELECT id FROM moments WHERE owner = ?)", id, id);
    this.sql.exec("DELETE FROM mphotos WHERE moment IN (SELECT id FROM moments WHERE owner = ?)", id);
    this.sql.exec("DELETE FROM moments WHERE owner = ?", id);
    this.sql.exec("DELETE FROM hides WHERE owner = ? OR who = ?", id, id);
    this.sql.exec("DELETE FROM mheld WHERE moment NOT IN (SELECT id FROM moments)");
    this.sql.exec("DELETE FROM paused WHERE user = ?", id);
    this.sql.exec("DELETE FROM reports WHERE reporter = ? OR who = ?", id, id);
    this.sql.exec("DELETE FROM fpings WHERE user = ?", id);
  },

  // ---------------- Friend notifications ----------------
  // Turn on (with this phone's push address, its keys and time zone) or off. One phone per account: the latest wins.
  async pSet(token, body) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u;
    if (!body || body.on !== true) { this.sql.exec("DELETE FROM fpings WHERE user = ?", me.id); return { ok: true, on: false }; }
    const sub = body.sub || {}, keys = sub.keys || {}, key = /^[A-Za-z0-9_-]{16,120}$/;
    if (!pushable(sub.endpoint) || !key.test(String(keys.p256dh || "")) || !key.test(String(keys.auth || ""))) return { error: "bad_sub" };
    let tz = String(body.tz || "").slice(0, 60);
    try { new Intl.DateTimeFormat("en-AU", { timeZone: tz }); } catch { tz = ""; }
    const had = this.one("SELECT * FROM fpings WHERE user = ?", me.id);   // already on: keep what's waiting
    this.sql.exec("INSERT OR REPLACE INTO fpings (user, sub, tz, pend, last, due) VALUES (?, ?, ?, ?, ?, ?)", me.id,
      JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }), tz || "Australia/Sydney", had ? had.pend : "[]", had ? had.last : 0, had ? had.due : null);
    return { ok: true, on: true };
  },
  // One notification: requests first (they wait on an answer), moments in the line under it.
  pNote(news) {
    const m = news.names.length ? this.pWords(news) : "", a = news.asks.length ? this.pAskWords(news.asks) : "";
    return { kind: "friends", title: a || m, body: a ? m : "", n: news.moments + news.asks.length };
  },
  // When this phone may next be pinged: an hour after the last one, and never in its night (10pm to 8am).
  pDue(row, t = Date.now()) {
    t = Math.max(t, (row.last || 0) + PINGS.gap);
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-AU", { timeZone: row.tz || "Australia/Sydney", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" })
      .formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]));
    const h = parts.hour % 24, past = (parts.minute * 60 + parts.second) * 1000;
    if (h >= PINGS.quietFrom) return t + (24 - h + PINGS.quietTo) * HOUR - past;
    if (h < PINGS.quietTo) return t + (PINGS.quietTo - h) * HOUR - past;
    return t;
  },
  // A new moment (not an edit): every friend who turned notifications on (and hasn't hidden this person) gets told
  // about it, in time. Each phone keeps the list of moments waiting to be told (at most 50).
  async pQueue(ownerId, momentId) {
    const rows = this.rows(`SELECT f.* FROM fpings f WHERE f.user IN (SELECT b FROM pals WHERE a = ?) AND f.user NOT IN (SELECT owner FROM hides WHERE who = ?)`, ownerId, ownerId);
    for (const r of rows) {
      const pend = JSON.parse(r.pend || "[]").concat(momentId).slice(-50);
      this.sql.exec("UPDATE fpings SET pend = ?, due = ? WHERE user = ?", JSON.stringify(pend), r.due || this.pDue(r), r.user);
    }
    await this.pWake();
  },
  // A new friend request (alex 2026-11-26: one Friends switch covers everything social). Kept in the same waiting
  // list as moments, marked "r:" with who asked, and told by the same rules: one an hour, never at night.
  async pAsk(fromId, toId) {
    const r = this.one("SELECT * FROM fpings WHERE user = ?", toId);
    if (!r) return;
    const key = "r:" + fromId, pend = JSON.parse(r.pend || "[]").filter((x) => x !== key).concat(key).slice(-50);
    this.sql.exec("UPDATE fpings SET pend = ?, due = ? WHERE user = ?", JSON.stringify(pend), r.due || this.pDue(r), r.user);
    await this.pWake();
  },
  async pWake() {
    const next = this.one("SELECT MIN(due) AS t FROM fpings WHERE due IS NOT NULL");
    if (next && next.t && this.ctx && this.ctx.storage.setAlarm) await this.ctx.storage.setAlarm(next.t);
  },
  // The waiting moments still worth telling: still there, still a friend's, not hidden, paused or held back by reports.
  pNews(row) {
    const all = JSON.parse(row.pend || "[]"), ids = all.filter((x) => !String(x).startsWith("r:"));
    // Requests still waiting (not answered, taken back or blocked since), newest first.
    const askers = [...new Set(all.filter((x) => String(x).startsWith("r:")).map((x) => x.slice(2)).reverse())]
      .filter((id) => this.one("SELECT 1 AS x FROM asks WHERE f = ? AND t = ?", id, row.user) && !this.fBlocked(id, row.user))
      .map((id) => this.one("SELECT * FROM users WHERE id = ?", id)).filter(Boolean);
    const moms = ids.length ? this.rows(`SELECT owner, at FROM moments WHERE id IN (${ids.map(() => "?").join(",")}) AND owner IN (SELECT b FROM pals WHERE a = ?) AND owner NOT IN (SELECT who FROM hides WHERE owner = ?)
      AND owner NOT IN (SELECT user FROM paused) AND id NOT IN (SELECT moment FROM mheld) ORDER BY at DESC`, ...ids, row.user, row.user) : [];
    const people = [...new Set(moms.map((m) => m.owner))].map((id) => this.one("SELECT * FROM users WHERE id = ?", id)).filter(Boolean);
    const nameOf = (u) => this.fProf(u.id).name || "@" + u.name;
    return { moments: moms.length, names: people.map(nameOf), asks: askers.map(nameOf) };
  },
  // The words: "Mia shared a moment", "Mia shared 3 moments", "Mia and Josh shared moments", "Mia and 2 others shared moments".
  pWords(news) {
    const [a, b] = news.names, n = news.names.length;
    if (n === 1) return news.moments > 1 ? `${a} shared ${news.moments} moments` : `${a} shared a moment`;
    if (n === 2) return `${a} and ${b} shared moments`;
    return `${a} and ${n - 1} others shared moments`;
  },
  // "Sam wants to be friends", "Sam and Priya want to be friends", "Sam and 2 others want to be friends".
  pAskWords(names) {
    const [a, b] = names, n = names.length;
    return n === 1 ? `${a} wants to be friends` : n === 2 ? `${a} and ${b} want to be friends` : `${a} and ${n - 1} others want to be friends`;
  },
  async alarm() {
    const now = Date.now();
    for (const row of this.rows("SELECT * FROM fpings WHERE due IS NOT NULL AND due <= ?", now + 30000)) {
      const news = this.pNews(row);
      if (!news.names.length && !news.asks.length) { this.sql.exec("UPDATE fpings SET due = NULL, pend = '[]' WHERE user = ?", row.user); continue; }
      const sub = JSON.parse(row.sub);
      let gone = false;
      try { gone = await ping(this.env, sub.endpoint, this.pNote(news), sub.keys, PINGS.ttl / 1000); } catch { /* tried again with the next moment */ }
      if (gone) this.sql.exec("DELETE FROM fpings WHERE user = ?", row.user);
      else this.sql.exec("UPDATE fpings SET due = NULL, pend = '[]', last = ? WHERE user = ?", now, row.user);
    }
    await this.pWake();
  },
};
