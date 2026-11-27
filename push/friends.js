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
// Comments (alex 2026-11-26): friends can comment on a moment, in words only (up to 280). Who sees a comment works
// like "I see you": the person who shared sees every comment on their moment; everyone else sees only comments from
// their own friends (and their own), so nobody reads words from someone they don't know. The writer can delete their
// comment, and the person who shared can remove any comment on their moment. A comment can be reported like a moment;
// three different people reporting it holds it back until alex looks. A new comment on your moment adds to your
// Friends number and, with friend notifications on, brings "Sam commented on your moment" (same hourly and night
// rules). Removing or blocking a friend takes their comments on each other's moments with it.
// Replies and suns on comments (alex 2026-11-26): a reply sits under the comment it answers, one level deep (replying
// to a reply joins the same thread). You see a reply only if you may see it and the comment it's under. The person
// answered gets "Mia replied to your comment" (same Friends switch and rules) and it counts on their number. The sun
// is "I see you" for a comment: never counted, never a notification; the writer sees which of their friends said it.
// Removing a comment takes its replies and suns with it.
// Shared dates (alex 2026-11-27): a set-a-date card ("Date night", js/later.js) can be shared with friends, up to 5.
// Kept: which card (its number), the date, the day it was drawn, who's invited and whether they said "I'm in". Never
// the card's words, a photo or a feeling. A friend gets "Mia invited you to Date night on Sat 5 Dec" (same Friends
// switch and rules); "I'm in" tells the person who invited; "Not this time" tells nobody. Moving the date or calling
// it off tells those invited; someone who said "I'm in" and then can't make it tells the person who invited.
// Removing or blocking a friend takes them off each other's dates. All of it goes 3 days after the date.

import { ping, pushable } from "./webpush.js";

const DAY = 86400000;
const HOUR = 3600000;
export const PINGS = { gap: HOUR, quietFrom: 22, quietTo: 8, ttl: 6 * HOUR };
export const LIMITS = { friends: 150, waiting: 50, lookups: 60, invite: 14 * DAY, name: 30, season: 60, perDay: 10, feedDays: 14, feedMax: 100, profileMax: 120, text: 200, caption: 280, comment: 280, commentsPerDay: 60, photo: 450000, face: 60000 };
const PICS = ["flower", "smile", "frog", "cat", "bunny", "bear", "chick", "sprout"];
const TINTS = ["#d9b3a6", "#cfc59b", "#a9c4b5", "#a9b9d6", "#c4b4c9", "#a9c9cf"];
export const REASONS = ["hurtful", "sexual", "risk", "spam", "else"];
const KEEP_DONE = 90 * DAY, HOLD_AT = 3;
// The card looks a shared card can come from (alex 2026-11-25): each shows its own feed card on Friends.
// Add a new look here as well as in js/looks.js, or its shared cards fall back to the plain Daydeck one.
const LOOK_IDS = ["daydeck", "cherry", "mono", "matcha", "mushroom", "pals", "chrome"];
// Set-a-date cards that can be shared (card number -> its short name, as LATER in js/later.js). A new one goes in both.
export const PLAN_CARDS = { 88: "Date night", 57: "Family meal", 60: "Family visit", 32: "Weekend plan", 563: "Weekend fun", 540: "Hobby class", 534: "Evening for fun", 523: "Careers chat", 482: "Holiday at home",
  388: "Parkrun", 30: "Food at yours", 399: "Neighbours over", 6: "Hang out", 586: "Sunrise or sunset" };
export const PLAN_LIMITS = { guests: 5, ahead: 60, keep: 3, owned: 20 };
const ymd = (t) => new Date(t).toISOString().slice(0, 10);
const shortDay = (k) => { const d = new Date(k + "T12:00:00Z"); return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]} ${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`; };
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
    CREATE TABLE IF NOT EXISTS fpings (user TEXT PRIMARY KEY, sub TEXT, tz TEXT, pend TEXT, last INTEGER, due INTEGER);
    CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, moment TEXT, who TEXT, text TEXT, at INTEGER);
    CREATE INDEX IF NOT EXISTS comments_moment ON comments (moment, at);
    CREATE TABLE IF NOT EXISTS cheld (comment TEXT PRIMARY KEY, at INTEGER);
    CREATE TABLE IF NOT EXISTS csees (comment TEXT, who TEXT, at INTEGER, PRIMARY KEY (comment, who));
    CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, owner TEXT, card INTEGER, day TEXT, made TEXT, at INTEGER);
    CREATE TABLE IF NOT EXISTS pguests (plan TEXT, who TEXT, state TEXT, at INTEGER, PRIMARY KEY (plan, who));`);
  // Reports can be about a comment (2026-11-26). Books made before then get the column added once.
  try { sql.exec("ALTER TABLE reports ADD COLUMN comment TEXT"); } catch { /* already there */ }
  // Replies (alex 2026-11-26): parent is the comment a reply sits under, rto who it answers. Added once to older books.
  try { sql.exec("ALTER TABLE comments ADD COLUMN parent TEXT"); } catch { /* already there */ }
  try { sql.exec("ALTER TABLE comments ADD COLUMN rto TEXT"); } catch { /* already there */ }
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
    // A shared photo says how big it is (X-Size, before any compression on the way), so the phone can close its
    // loading ring as the photo arrives (alex 2026-11-27).
    case "GET /a/f/photo": {
      const r = await b.mPhoto(token, q.get("id") || "");
      if (r && r.error) return reply(r, r.status || 400);
      return reply(r, 200, { "X-Size": String(new TextEncoder().encode(JSON.stringify(r)).length), "Access-Control-Expose-Headers": "X-Size" });
    }
    case "GET /a/f/face": return out(b.fFace(token, q.get("u") || ""));
    case "POST /a/f/pings": return out(b.pSet(token, body));
    case "POST /a/f/hide": return out(b.mHide(token, String(body.username || ""), body.undo === true));
    case "GET /a/f/comments": return out(b.cList(token, q.get("id") || ""));
    case "POST /a/f/comment": return out(b.cAdd(token, String(body.id || ""), body.text, body.parent ? String(body.parent) : ""));
    case "POST /a/f/csee": return out(b.cSee(token, String(body.id || ""), body.undo === true));
    case "POST /a/f/uncomment": return out(b.cDrop(token, String(body.id || "")));
    case "GET /a/f/plans": return out(b.plList(token));
    case "POST /a/f/plan": return out(b.plSave(token, body));
    case "POST /a/f/plan/answer": return out(b.plAnswer(token, String(body.id || ""), body.yes === true));
    case "POST /a/f/plan/drop": return out(b.plDrop(token, String(body.id || "")));
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
    // Their "I see you"s and comments on each other's moments go too.
    this.sql.exec("DELETE FROM sees WHERE (who = ? AND moment IN (SELECT id FROM moments WHERE owner = ?)) OR (who = ? AND moment IN (SELECT id FROM moments WHERE owner = ?))", a, b, b, a);
    this.sql.exec("DELETE FROM comments WHERE (who = ? AND moment IN (SELECT id FROM moments WHERE owner = ?)) OR (who = ? AND moment IN (SELECT id FROM moments WHERE owner = ?))", a, b, b, a);
    this.sql.exec("DELETE FROM csees WHERE (who = ? AND comment IN (SELECT id FROM comments WHERE who = ?)) OR (who = ? AND comment IN (SELECT id FROM comments WHERE who = ?))", a, b, b, a);
    this.cTidy();
    // And off each other's shared dates, quietly.
    this.sql.exec("DELETE FROM pguests WHERE (who = ? AND plan IN (SELECT id FROM plans WHERE owner = ?)) OR (who = ? AND plan IN (SELECT id FROM plans WHERE owner = ?))", a, b, b, a);
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
    const look = (kind === "card" || kind === "own") && LOOK_IDS.includes(body.look) ? body.look : null;
    const feel = mood && Array.isArray(body.feel) ? body.feel.map((f) => tidyText(f, 24)).filter(Boolean).slice(0, 6) : [];
    let photo = null;
    if (kind === "photo" || kind === "week") { photo = photoOK(body.photo); if (!photo) return null; }
    return { day, item, photo, data: { kind, text, pillar, col, status, cap, mood, feel, ph: !!photo, look } };
  },
  mOut(row, meId, owner, extra = {}) {
    // Who said "I see you": the person who shared sees everyone; others see only themselves and their own friends.
    const all = this.rows("SELECT s.who AS id, s.at FROM sees s WHERE s.moment = ? ORDER BY s.at", row.id);
    const seers = all.filter((x) => x.id === meId || meId === row.owner || this.fIsPal(meId, x.id))
      .map((x) => this.one("SELECT * FROM users WHERE id = ?", x.id)).filter(Boolean).map((u) => this.fCard(u));
    // Comments: just the latest one you may see, and whether there are more (never a count).
    const cs = this.cSeen(row, meId), last = cs[cs.length - 1];
    return { id: row.id, day: row.day, item: row.item, at: row.at, ...JSON.parse(row.data), by: this.fCard(owner), mine: row.owner === meId, seen: all.some((x) => x.id === meId), seers,
      last: last ? this.cOut(last, meId, row.owner) : null, more: cs.length > 1, ...extra };
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
    return { ok: true, moments: rows.filter((r) => who(r.owner)).map((r) => this.mOut(r, me.id, who(r.owner))), comments: this.cNews(me.id, since) };
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
  mDrop(id) {
    this.sql.exec("DELETE FROM cheld WHERE comment IN (SELECT id FROM comments WHERE moment = ?)", id);
    for (const t of ["sees", "mphotos", "mheld", "comments"]) this.sql.exec(`DELETE FROM ${t} WHERE moment = ?`, id);
    this.sql.exec("DELETE FROM moments WHERE id = ?", id);
    this.cTidy();
  },
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
    else {
      const fresh = !this.one("SELECT 1 AS x FROM sees WHERE moment = ? AND who = ?", id, me.id);
      this.sql.exec("INSERT OR IGNORE INTO sees (moment, who, at) VALUES (?, ?, ?)", id, me.id, Date.now());
      if (fresh && row.owner !== me.id) await this.pSee(row.owner, me.id, id);   // the person who shared gets told (in time)
    }
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

  // ---------------- Comments (alex 2026-11-26) ----------------
  // May I see this comment? Your own, always. Otherwise not while its writer's sharing is paused or it's held back by
  // reports. The person who shared the moment sees the rest; everyone else only their own friends' comments.
  cMay(c, meId, ownerId) {
    if (c.who === meId) return true;
    if (this.one("SELECT 1 AS x FROM paused WHERE user = ?", c.who) || this.one("SELECT 1 AS x FROM cheld WHERE comment = ?", c.id)) return false;
    return meId === ownerId || this.fIsPal(meId, c.who);
  },
  // The comments on a moment you may see, oldest first.
  // A reply shows only when the comment it sits under shows too.
  cSeen(row, meId) {
    const all = this.rows("SELECT * FROM comments WHERE moment = ? ORDER BY at, id", row.id).filter((c) => this.cMay(c, meId, row.owner));
    const ids = new Set(all.map((c) => c.id));
    return all.filter((c) => !c.parent || ids.has(c.parent));
  },
  // A comment taken away (or a moment, friend or account): its replies, holds and suns go too.
  cTidy() {
    this.sql.exec("DELETE FROM comments WHERE parent IS NOT NULL AND parent NOT IN (SELECT id FROM comments)");
    this.sql.exec("DELETE FROM cheld WHERE comment NOT IN (SELECT id FROM comments)");
    this.sql.exec("DELETE FROM csees WHERE comment NOT IN (SELECT id FROM comments)");
  },
  cOut(c, meId, ownerId) {
    const u = this.one("SELECT * FROM users WHERE id = ?", c.who);
    // The sun: whether you said it, and on your own comment which of your friends did (never a count).
    const ss = this.rows("SELECT who FROM csees WHERE comment = ? ORDER BY at", c.id);
    const seers = c.who !== meId ? [] : ss.filter((x) => x.who !== meId && (x.who === ownerId || this.fIsPal(meId, x.who)) && !this.one("SELECT 1 AS x FROM paused WHERE user = ?", x.who))
      .map((x) => this.one("SELECT * FROM users WHERE id = ?", x.who)).filter(Boolean).map((p) => this.fCard(p));
    return { id: c.id, text: c.text, at: c.at, parent: c.parent || null, by: u ? this.fCard(u) : { username: "", name: "", pic: "smile" }, mine: c.who === meId, canRemove: c.who === meId || meId === ownerId,
      seen: ss.some((x) => x.who === meId), seers };
  },
  // A moment you may comment on (and read the comments of): your own, or a friend's that isn't held back.
  cMoment(meId, id) {
    const row = this.one("SELECT * FROM moments WHERE id = ?", id);
    if (!row) return null;
    if (row.owner === meId) return row;
    if (!this.fIsPal(meId, row.owner) || this.fBlocked(meId, row.owner)) return null;
    if (this.one("SELECT 1 AS x FROM paused WHERE user = ?", row.owner) || this.one("SELECT 1 AS x FROM mheld WHERE moment = ?", row.id)) return null;
    return row;
  },
  cAll(row, meId) {
    const owner = this.one("SELECT * FROM users WHERE id = ?", row.owner);
    return { ok: true, comments: this.cSeen(row, meId).map((c) => this.cOut(c, meId, row.owner)), moment: this.mOut(row, meId, owner) };
  },
  async cList(token, id) {
    const g = await this.fGate(token); if (g.error) return g;
    const row = this.cMoment(g.u.id, id);
    return row ? this.cAll(row, g.u.id) : { error: "not_found", status: 404 };
  },
  async cAdd(token, id, text, parent = "") {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, row = this.cMoment(me.id, id);
    if (!row) return { error: "not_found", status: 404 };
    if (this.one("SELECT 1 AS x FROM paused WHERE user = ?", me.id)) return { error: "paused" };
    const words = tidyText(text, LIMITS.comment);
    if (!words) return { error: "bad_comment" };
    const t = Date.now();
    if (this.one("SELECT COUNT(*) AS n FROM comments WHERE who = ? AND at > ?", me.id, t - DAY).n >= LIMITS.commentsPerDay) return { error: "too_many_comments" };
    // A reply: to a comment on this moment you can see. Replying to a reply joins the same thread, one level deep.
    let top = null, rto = null;
    if (parent) {
      const p = this.cSeen(row, me.id).find((c) => c.id === parent);
      if (!p) return { error: "not_found", status: 404 };
      top = p.parent || p.id; rto = p.who;
    }
    const cid = this.newToken().slice(0, 16);
    this.sql.exec("INSERT INTO comments (id, moment, who, text, at, parent, rto) VALUES (?, ?, ?, ?, ?, ?, ?)", cid, row.id, me.id, words, t, top, rto);
    // The person answered gets told, if they can see the reply (it's their friend's, or on their own moment).
    const told = rto && rto !== me.id && (rto === row.owner || this.fIsPal(rto, me.id));
    if (told) await this.pReply(rto, cid);
    if (row.owner !== me.id && !(told && rto === row.owner)) await this.pComment(row.owner, cid);   // the person who shared gets told (in time)
    return { ...this.cAll(row, me.id), comment: cid };
  },
  // The sun on a comment ("I see you", alex 2026-11-26): on someone else's comment you can see. Never counted or told.
  async cSee(token, cid, undo) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, c = this.one("SELECT * FROM comments WHERE id = ?", cid), row = c && this.cMoment(me.id, c.moment);
    if (!row || c.who === me.id || !this.cSeen(row, me.id).some((x) => x.id === cid)) return { error: "not_found", status: 404 };
    if (undo) this.sql.exec("DELETE FROM csees WHERE comment = ? AND who = ?", cid, me.id);
    else {
      if (this.one("SELECT 1 AS x FROM paused WHERE user = ?", me.id)) return { error: "paused" };
      this.sql.exec("INSERT OR IGNORE INTO csees (comment, who, at) VALUES (?, ?, ?)", cid, me.id, Date.now());
    }
    return this.cAll(row, me.id);
  },
  // Delete your own comment, or remove anyone's from your own moment. Nobody is told.
  async cDrop(token, cid) {
    const g = await this.fGate(token, false); if (g.error) return g;
    const me = g.u, c = this.one("SELECT * FROM comments WHERE id = ?", cid);
    const row = c && this.one("SELECT * FROM moments WHERE id = ?", c.moment);
    if (!c || !row || (c.who !== me.id && row.owner !== me.id)) return { error: "not_found", status: 404 };
    this.sql.exec("DELETE FROM comments WHERE id = ?", cid);
    this.cTidy();
    return { ok: true, by: c.who === me.id ? "own" : "theirs", ...(this.cMoment(me.id, row.id) ? this.cAll(row, me.id) : {}) };
  },
  // Friends' comments on your moments lately, newest first: the bell's "New comments" (the phone knows which are new).
  // Replies to you on friends' moments come too (2026-11-26), marked reply, with whose moment it's on.
  cNews(meId, since) {
    return this.rows(`SELECT c.*, m.owner FROM comments c JOIN moments m ON m.id = c.moment WHERE (m.owner = ? OR c.rto = ?) AND c.who != ? AND c.at > ? ORDER BY c.at DESC LIMIT 50`, meId, meId, meId, since)
      .filter((c) => this.fIsPal(meId, c.who) && this.cMay(c, meId, c.owner) && (c.owner === meId || this.cMoment(meId, c.moment))
        && (!c.parent || (() => { const p = this.one("SELECT * FROM comments WHERE id = ?", c.parent); return p && this.cMay(p, meId, c.owner); })()))
      .map((c) => {
        const on = c.owner === meId ? null : this.one("SELECT * FROM users WHERE id = ?", c.owner);
        return { ...this.cOut(c, meId, c.owner), moment: c.moment, reply: c.rto === meId, onMine: c.owner === meId, onBy: on ? this.fCard(on) : null };
      });
  },

  // ---------------- Reports ----------------
  // Report a friend's moment, a comment, or a person (from their profile). One report per person per thing; reporting again
  // updates it. notify: tell alex by email (at most once an hour, and never what was reported).
  async rReport(token, body) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, why = REASONS.includes(body.why) ? body.why : null, note = tidyText(body.note, 300);
    if (!why) return { error: "bad_report" };
    let who = null, moment = null, comment = null, snap = null, photo = null;
    if (body.comment) {
      // A comment you can see that isn't yours: a copy of its words, and what it was said on.
      const c = this.one("SELECT * FROM comments WHERE id = ?", String(body.comment));
      const row = c && this.one("SELECT * FROM moments WHERE id = ?", c.moment);
      if (!c || !row || c.who === me.id || !this.cMoment(me.id, row.id) || !this.cMay(c, me.id, row.owner)) return { error: "not_found", status: 404 };
      const d = JSON.parse(row.data), on = this.one("SELECT name FROM users WHERE id = ?", row.owner);
      who = c.who; comment = c.id; snap = { comment: c.text, on: { by: on ? on.name : "", kind: d.kind, text: d.text || "", cap: d.cap || "" } };
    } else if (body.moment) {
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
    const had = this.one("SELECT id FROM reports WHERE reporter = ? AND who = ? AND moment IS ? AND comment IS ? AND state = 'open'", me.id, who, moment, comment);
    const id = had ? had.id : this.newToken().slice(0, 16), t = Date.now();
    this.sql.exec("INSERT OR REPLACE INTO reports (id, reporter, who, moment, comment, why, note, snap, photo, at, state, done) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL)",
      id, me.id, who, moment, comment, why, note, JSON.stringify(snap), photo, t);
    // Three different people reporting the same moment: it's held back from feeds until alex looks.
    if (moment && this.one("SELECT COUNT(DISTINCT reporter) AS n FROM reports WHERE moment = ? AND state = 'open'", moment).n >= HOLD_AT)
      this.sql.exec("INSERT OR IGNORE INTO mheld (moment, at) VALUES (?, ?)", moment, t);
    if (comment && this.one("SELECT COUNT(DISTINCT reporter) AS n FROM reports WHERE comment = ? AND state = 'open'", comment).n >= HOLD_AT)
      this.sql.exec("INSERT OR IGNORE INTO cheld (comment, at) VALUES (?, ?)", comment, t);
    const last = this.one("SELECT at FROM mailed WHERE k = 'reports'");
    const notify = !last || t - last.at > 3600000;
    if (notify) this.sql.exec("INSERT OR REPLACE INTO mailed (k, at) VALUES ('reports', ?)", t);
    return { ok: true, notify };
  },
  // For alex (tester page, behind TESTER_KEY): open reports first, then those reviewed lately.
  rList() {
    this.sql.exec("DELETE FROM reports WHERE state != 'open' AND done < ?", Date.now() - KEEP_DONE);
    const name = (id) => { const u = this.one("SELECT name FROM users WHERE id = ?", id); return u ? u.name : null; };
    const out = (r) => ({ id: r.id, why: r.why, note: r.note || "", at: r.at, state: r.state, done: r.done, moment: r.moment, comment: r.comment || null,
      still: !!(r.moment ? this.one("SELECT 1 AS x FROM moments WHERE id = ?", r.moment) : r.comment && this.one("SELECT 1 AS x FROM comments WHERE id = ?", r.comment)),
      held: !!(r.moment ? this.one("SELECT 1 AS x FROM mheld WHERE moment = ?", r.moment) : r.comment && this.one("SELECT 1 AS x FROM cheld WHERE comment = ?", r.comment)), paused: !!this.one("SELECT 1 AS x FROM paused WHERE user = ?", r.who),
      who: name(r.who) || "(account deleted)", by: name(r.reporter) || "(account deleted)", about: this.one("SELECT COUNT(*) AS n FROM reports WHERE who = ?", r.who).n,
      snap: JSON.parse(r.snap || "{}"), photo: r.photo || null });
    return { ok: true, open: this.rows("SELECT * FROM reports WHERE state = 'open' ORDER BY at").map(out), done: this.rows("SELECT * FROM reports WHERE state != 'open' ORDER BY done DESC LIMIT 30").map(out) };
  },
  // alex's answer: keep (nothing wrong), remove (the moment, or the comment, goes), pause (the account can't share, and their moments
  // are hidden from friends), unpause. Every open report about the same thing is answered together.
  rAct(id, act) {
    const r = this.one("SELECT * FROM reports WHERE id = ?", id);
    if (!r || !["keep", "remove", "pause", "unpause"].includes(act)) return { error: "not_found", status: 404 };
    const t = Date.now(), same = r.moment ? ["moment = ?", r.moment] : r.comment ? ["comment = ?", r.comment] : ["who = ? AND moment IS NULL AND comment IS NULL", r.who];
    const close = (state) => this.sql.exec(`UPDATE reports SET state = ?, done = ?, photo = NULL WHERE state = 'open' AND ${same[0]}`, state, t, same[1]);
    if (act === "keep") { if (r.moment) this.sql.exec("DELETE FROM mheld WHERE moment = ?", r.moment); if (r.comment) this.sql.exec("DELETE FROM cheld WHERE comment = ?", r.comment); close("kept"); }
    if (act === "remove" && r.moment) { this.mDrop(r.moment); close("removed"); }
    if (act === "remove" && r.comment) { this.sql.exec("DELETE FROM comments WHERE id = ?", r.comment); this.cTidy(); close("removed"); }
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
    this.sql.exec("DELETE FROM comments WHERE who = ? OR moment IN (SELECT id FROM moments WHERE owner = ?)", id, id);
    this.sql.exec("DELETE FROM csees WHERE who = ?", id);
    this.cTidy();
    this.sql.exec("DELETE FROM mphotos WHERE moment IN (SELECT id FROM moments WHERE owner = ?)", id);
    this.sql.exec("DELETE FROM moments WHERE owner = ?", id);
    this.sql.exec("DELETE FROM hides WHERE owner = ? OR who = ?", id, id);
    this.sql.exec("DELETE FROM mheld WHERE moment NOT IN (SELECT id FROM moments)");
    this.sql.exec("DELETE FROM paused WHERE user = ?", id);
    this.sql.exec("DELETE FROM reports WHERE reporter = ? OR who = ?", id, id);
    this.sql.exec("DELETE FROM fpings WHERE user = ?", id);
    this.sql.exec("DELETE FROM pguests WHERE who = ? OR plan IN (SELECT id FROM plans WHERE owner = ?)", id, id);
    this.sql.exec("DELETE FROM plans WHERE owner = ?", id);
  },

  // ---------------- Shared dates (alex 2026-11-27) ----------------
  plTidy() {
    const cut = ymd(Date.now() - PLAN_LIMITS.keep * DAY);
    this.sql.exec("DELETE FROM pguests WHERE plan IN (SELECT id FROM plans WHERE day < ?)", cut);
    this.sql.exec("DELETE FROM plans WHERE day < ?", cut);
  },
  plGuests(planId, meId) {
    return this.rows("SELECT who, state, at FROM pguests WHERE plan = ? ORDER BY at", planId)
      .map((g) => ({ g, u: this.one("SELECT * FROM users WHERE id = ?", g.who) })).filter((x) => x.u && (!meId || x.u.id === meId || this.fIsPal(meId, x.u.id)))
      .map((x) => this.fCard(x.u, { state: x.g.state }));
  },
  plOut(p, meId) { return { id: p.id, card: p.card, day: p.day, made: p.made, guests: this.plGuests(p.id, meId) }; },
  // Your own shared dates (with who's in and who hasn't answered), and the ones friends invited you to.
  async plList(token) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u; this.plTidy();
    const mine = this.rows("SELECT * FROM plans WHERE owner = ? ORDER BY day", me.id).map((p) => this.plOut(p, me.id));
    const invited = this.rows("SELECT p.*, g.state FROM pguests g JOIN plans p ON p.id = g.plan WHERE g.who = ? ORDER BY p.day", me.id)
      .filter((p) => this.fIsPal(me.id, p.owner) && !this.fBlocked(me.id, p.owner))
      .map((p) => ({ id: p.id, card: p.card, day: p.day, made: p.made, state: p.state, by: this.fCard(this.one("SELECT * FROM users WHERE id = ?", p.owner)),
        others: this.plGuests(p.id, me.id).filter((x) => x.username !== me.name && x.state === "in") }));
    return { ok: true, mine, invited };
  },
  // Make or change a shared date: { id (to change one), card, day, made (the day the card was drawn), guests: [usernames] }.
  // Only friends who ticked 18+ can be invited, up to 5. New guests get an invite; a new date tells everyone invited;
  // someone taken off the list is told only if they had said "I'm in".
  async plSave(token, body) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, card = Number(body && body.card), day = String((body && body.day) || ""), made = String((body && body.made) || "");
    if (!PLAN_CARDS[card] || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{4}-\d{2}-\d{2}$/.test(made)) return { error: "bad_plan" };
    const t = Date.now();
    if (day < ymd(t - 2 * DAY) || day > ymd(t + PLAN_LIMITS.ahead * DAY)) return { error: "bad_plan" };
    this.plTidy();
    let p = body.id ? this.one("SELECT * FROM plans WHERE id = ? AND owner = ?", String(body.id), me.id) : null;
    if (!p && this.one("SELECT COUNT(*) AS n FROM plans WHERE owner = ?", me.id).n >= PLAN_LIMITS.owned) return { error: "too_many" };
    const want = [...new Set((Array.isArray(body.guests) ? body.guests : []).map((n) => String(n || "").toLowerCase()))].slice(0, PLAN_LIMITS.guests)
      .map((n) => this.fByName(n)).filter((u) => u && u.id !== me.id && this.fIsPal(me.id, u.id) && !this.fBlocked(me.id, u.id) && this.fProf(u.id).adult);
    if (!p) {
      const id = "p" + this.newToken().replace(/[^A-Za-z0-9]/g, "").slice(0, 15);
      this.sql.exec("INSERT INTO plans (id, owner, card, day, made, at) VALUES (?, ?, ?, ?, ?, ?)", id, me.id, card, day, made, t);
      p = this.one("SELECT * FROM plans WHERE id = ?", id);
    } else if (p.day !== day || p.card !== card) {
      this.sql.exec("UPDATE plans SET day = ?, card = ? WHERE id = ?", day, card, p.id);
      for (const x of this.rows("SELECT who FROM pguests WHERE plan = ?", p.id)) await this.pPlan(x.who, `pm:${p.id}`);
    }
    const had = this.rows("SELECT who, state FROM pguests WHERE plan = ?", p.id), keep = new Set(want.map((u) => u.id));
    for (const x of had) if (!keep.has(x.who)) {
      this.sql.exec("DELETE FROM pguests WHERE plan = ? AND who = ?", p.id, x.who);
      if (x.state === "in") await this.pPlan(x.who, `px:${card}:${me.id}:${day}`);
    }
    for (const u of want) if (!had.some((x) => x.who === u.id)) {
      this.sql.exec("INSERT OR IGNORE INTO pguests (plan, who, state, at) VALUES (?, ?, 'ask', ?)", p.id, u.id, t);
      await this.pPlan(u.id, `pi:${p.id}`);
    }
    return { ok: true, plan: this.plOut(this.one("SELECT * FROM plans WHERE id = ?", p.id), me.id) };
  },
  // "I'm in" (the person who invited is told) or "Not this time" (nobody is told; the invite just goes).
  async plAnswer(token, id, yes) {
    const g = await this.fGate(token); if (g.error) return g;
    const me = g.u, row = this.one("SELECT g.state, p.owner FROM pguests g JOIN plans p ON p.id = g.plan WHERE g.plan = ? AND g.who = ?", id, me.id);
    if (!row) return { error: "not_found", status: 404 };
    if (!yes) { this.sql.exec("DELETE FROM pguests WHERE plan = ? AND who = ?", id, me.id); return { ok: true, state: "none" }; }
    if (row.state !== "in") {
      this.sql.exec("UPDATE pguests SET state = 'in' WHERE plan = ? AND who = ?", id, me.id);
      await this.pPlan(row.owner, `pj:${id}:${me.id}`);
    }
    return { ok: true, state: "in" };
  },
  // The person who made it calls it off (everyone invited is told), or a guest leaves (told only if they'd said "I'm in").
  async plDrop(token, id) {
    const g = await this.fGate(token, false); if (g.error) return g;
    const me = g.u, p = this.one("SELECT * FROM plans WHERE id = ?", id);
    if (!p) return { ok: true };
    if (p.owner === me.id) {
      const guests = this.rows("SELECT who FROM pguests WHERE plan = ?", id);
      this.sql.exec("DELETE FROM pguests WHERE plan = ?", id);
      this.sql.exec("DELETE FROM plans WHERE id = ?", id);
      for (const x of guests) await this.pPlan(x.who, `px:${p.card}:${me.id}:${p.day}`);
      return { ok: true };
    }
    const row = this.one("SELECT state FROM pguests WHERE plan = ? AND who = ?", id, me.id);
    if (!row) return { ok: true };
    this.sql.exec("DELETE FROM pguests WHERE plan = ? AND who = ?", id, me.id);
    if (row.state === "in") await this.pPlan(p.owner, `pl:${id}:${me.id}`);
    return { ok: true };
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
  // Comments on your moments come next, then "I see you"s, then friends' moments. "I see you"s are told but never
  // counted on the number (alex 2026-11-27: notifications yes; the number stays requests, moments and comments).
  pNote(news) {
    const m = news.names.length ? this.pWords(news) : "", a = news.asks.length ? this.pAskWords(news.asks) : "", c = news.commenters.length ? this.pCommentWords(news) : "";
    const s = news.seers.length ? this.pSeeWords(news.seers) : "", y = news.repliers.length ? this.pReplyWords(news) : "";
    // Shared dates come right after requests (an invite waits on an answer too). Never counted on the number.
    const lines = [a, ...(news.plans || []), y, c, s, m].filter(Boolean);
    return { kind: "friends", title: lines[0] || "", body: lines.slice(1).join("\n"), n: news.moments + news.asks.length + news.comments + news.replies };
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
  // A new comment on your moment (alex 2026-11-26): kept in the same waiting list, marked "c:", told by the same rules.
  async pComment(toId, cid) {
    const r = this.one("SELECT * FROM fpings WHERE user = ?", toId);
    if (!r) return;
    const pend = JSON.parse(r.pend || "[]").concat("c:" + cid).slice(-50);
    this.sql.exec("UPDATE fpings SET pend = ?, due = ? WHERE user = ?", JSON.stringify(pend), r.due || this.pDue(r), r.user);
    await this.pWake();
  },
  // A reply to your comment (alex 2026-11-26): kept in the same waiting list, marked "y:", told by the same rules.
  async pReply(toId, cid) {
    const r = this.one("SELECT * FROM fpings WHERE user = ?", toId);
    if (!r) return;
    const pend = JSON.parse(r.pend || "[]").concat("y:" + cid).slice(-50);
    this.sql.exec("UPDATE fpings SET pend = ?, due = ? WHERE user = ?", JSON.stringify(pend), r.due || this.pDue(r), r.user);
    await this.pWake();
  },
  // Someone said "I see you" on your moment (alex 2026-11-27): kept in the same waiting list as "s:<who>:<moment>",
  // told by the same rules (one an hour, never at night), and dropped if they take it back before then.
  async pSee(toId, whoId, momentId) {
    const r = this.one("SELECT * FROM fpings WHERE user = ?", toId);
    if (!r) return;
    const key = `s:${whoId}:${momentId}`, pend = JSON.parse(r.pend || "[]").filter((x) => x !== key).concat(key).slice(-50);
    this.sql.exec("UPDATE fpings SET pend = ?, due = ? WHERE user = ?", JSON.stringify(pend), r.due || this.pDue(r), r.user);
    await this.pWake();
  },
  // Shared dates (alex 2026-11-27): kept in the same waiting list, marked "p?:", told by the same rules.
  async pPlan(toId, key) {
    const r = this.one("SELECT * FROM fpings WHERE user = ?", toId);
    if (!r) return;
    const pend = JSON.parse(r.pend || "[]").filter((x) => x !== key).concat(key).slice(-50);
    this.sql.exec("UPDATE fpings SET pend = ?, due = ? WHERE user = ?", JSON.stringify(pend), r.due || this.pDue(r), r.user);
    await this.pWake();
  },
  // The words for shared dates still worth telling, one line each: "Mia invited you to Date night on Sat 5 Dec",
  // "Mia moved Date night to Sun 6 Dec", "Date night with Mia on Sat 5 Dec is off", "Mia is in for Date night",
  // "Mia can't make Date night now". Never the card's words.
  pPlanLines(row) {
    const all = JSON.parse(row.pend || "[]").filter((x) => /^p[imxjl]:/.test(String(x))), out = [];
    const nameOf = (id) => { const u = this.one("SELECT * FROM users WHERE id = ?", id); return u && this.fIsPal(row.user, id) ? this.fProf(u.id).name || "@" + u.name : null; };
    const plan = (id) => this.one("SELECT * FROM plans WHERE id = ?", id);
    const joined = new Map();
    for (const k of all) {
      const [kind, a, b, c] = String(k).split(":");
      if (kind === "pi" || kind === "pm") {
        const p = plan(a), gst = p && this.one("SELECT state FROM pguests WHERE plan = ? AND who = ?", a, row.user), who = p && nameOf(p.owner);
        if (!gst || !who) continue;
        if (kind === "pi" && gst.state === "ask") out.push(`${who} invited you to ${PLAN_CARDS[p.card]} on ${shortDay(p.day)}`);
        if (kind === "pm" && !all.includes(`pi:${a}`)) out.push(`${who} moved ${PLAN_CARDS[p.card]} to ${shortDay(p.day)}`);
      } else if (kind === "px") {
        const who = nameOf(b);
        if (who && PLAN_CARDS[a] && /^\d{4}-\d{2}-\d{2}$/.test(c)) out.push(`${PLAN_CARDS[a]} with ${who} on ${shortDay(c)} is off`);
      } else if (kind === "pj") {
        const p = plan(a), who = nameOf(b);
        if (p && p.owner === row.user && who && this.one("SELECT 1 AS x FROM pguests WHERE plan = ? AND who = ? AND state = 'in'", a, b)) { if (!joined.has(a)) joined.set(a, { p, names: [] }); joined.get(a).names.push(who); }
      } else if (kind === "pl") {
        const p = plan(a), who = nameOf(b);
        if (p && p.owner === row.user && who && !this.one("SELECT 1 AS x FROM pguests WHERE plan = ? AND who = ?", a, b)) out.push(`${who} can't make ${PLAN_CARDS[p.card]} now`);
      }
    }
    for (const { p, names } of joined.values()) {
      const [x, y] = names, n = names.length, what = PLAN_CARDS[p.card];
      out.push(n === 1 ? `${x} is in for ${what}` : n === 2 ? `${x} and ${y} are in for ${what}` : `${x} and ${n - 1} others are in for ${what}`);
    }
    return [...new Set(out)];
  },
  async pWake() {
    const next = this.one("SELECT MIN(due) AS t FROM fpings WHERE due IS NOT NULL");
    if (next && next.t && this.ctx && this.ctx.storage.setAlarm) await this.ctx.storage.setAlarm(next.t);
  },
  // The waiting moments still worth telling: still there, still a friend's, not hidden, paused or held back by reports.
  pNews(row) {
    const all = JSON.parse(row.pend || "[]"), ids = all.filter((x) => !/^(?:[rcsy]|p[imxjl]):/.test(String(x)));
    // Requests still waiting (not answered, taken back or blocked since), newest first.
    const askers = [...new Set(all.filter((x) => String(x).startsWith("r:")).map((x) => x.slice(2)).reverse())]
      .filter((id) => this.one("SELECT 1 AS x FROM asks WHERE f = ? AND t = ?", id, row.user) && !this.fBlocked(id, row.user))
      .map((id) => this.one("SELECT * FROM users WHERE id = ?", id)).filter(Boolean);
    const moms = ids.length ? this.rows(`SELECT owner, at FROM moments WHERE id IN (${ids.map(() => "?").join(",")}) AND owner IN (SELECT b FROM pals WHERE a = ?) AND owner NOT IN (SELECT who FROM hides WHERE owner = ?)
      AND owner NOT IN (SELECT user FROM paused) AND id NOT IN (SELECT moment FROM mheld) ORDER BY at DESC`, ...ids, row.user, row.user) : [];
    const people = [...new Set(moms.map((m) => m.owner))].map((id) => this.one("SELECT * FROM users WHERE id = ?", id)).filter(Boolean);
    const nameOf = (u) => this.fProf(u.id).name || "@" + u.name;
    // Comments still there, on your own moments, by someone who's still a friend and may be seen. Newest first.
    const cids = all.filter((x) => String(x).startsWith("c:")).map((x) => x.slice(2));
    const cms = cids.length ? this.rows(`SELECT c.*, m.owner FROM comments c JOIN moments m ON m.id = c.moment WHERE c.id IN (${cids.map(() => "?").join(",")}) AND m.owner = ? ORDER BY c.at DESC`, ...cids, row.user)
      .filter((c) => c.who !== row.user && this.fIsPal(row.user, c.who) && this.cMay(c, row.user, row.user)) : [];
    const commenters = [...new Set(cms.map((c) => c.who))].map((id) => this.one("SELECT * FROM users WHERE id = ?", id)).filter(Boolean);
    // Replies to you still there, by someone who's still a friend, under a comment that still shows. Newest first.
    const yids = all.filter((x) => String(x).startsWith("y:")).map((x) => x.slice(2));
    const yms = yids.length ? this.rows(`SELECT c.*, m.owner FROM comments c JOIN moments m ON m.id = c.moment WHERE c.id IN (${yids.map(() => "?").join(",")}) AND c.rto = ? ORDER BY c.at DESC`, ...yids, row.user)
      .filter((c) => c.who !== row.user && this.fIsPal(row.user, c.who) && this.cMay(c, row.user, c.owner) && (c.owner === row.user || this.cMoment(row.user, c.moment))) : [];
    const repliers = [...new Set(yms.map((c) => c.who))].map((id) => this.one("SELECT * FROM users WHERE id = ?", id)).filter(Boolean);
    // "I see you"s still there, on your own moments, from someone who's still a friend. Newest first.
    const seers = [...new Set(all.filter((x) => String(x).startsWith("s:")).reverse().map((x) => x.split(":")).filter(([, who, mid]) =>
      this.one("SELECT 1 AS x FROM sees s JOIN moments m ON m.id = s.moment WHERE s.moment = ? AND s.who = ? AND m.owner = ?", mid, who, row.user) &&
      this.fIsPal(row.user, who) && !this.one("SELECT 1 AS x FROM paused WHERE user = ?", who)).map(([, who]) => who))]
      .map((id) => this.one("SELECT * FROM users WHERE id = ?", id)).filter(Boolean).map(nameOf);
    return { moments: moms.length, names: people.map(nameOf), asks: askers.map(nameOf), seers, comments: cms.length, commenters: commenters.map(nameOf), on: new Set(cms.map((c) => c.moment)).size,
      replies: yms.length, repliers: repliers.map(nameOf), to: new Set(yms.map((c) => c.parent)).size, plans: this.pPlanLines(row) };
  },
  // "Sam commented on your moment", "Sam left 3 comments", "Sam and Priya commented on your moments", "Sam and 2 others commented".
  pCommentWords(news) {
    const [a, b] = news.commenters, n = news.commenters.length, where = news.on > 1 ? "your moments" : "your moment";
    if (n === 1) return news.comments > 1 ? `${a} left ${news.comments} comments` : `${a} commented on ${where}`;
    if (n === 2) return `${a} and ${b} commented on ${where}`;
    return `${a} and ${n - 1} others commented`;
  },
  // "Mia replied to your comment", "Mia left 3 replies", "Mia and Sam replied to your comments", "Mia and 2 others replied to your comment".
  pReplyWords(news) {
    const [a, b] = news.repliers, n = news.repliers.length, what = news.to > 1 ? "your comments" : "your comment";
    if (n === 1) return news.replies > 1 ? `${a} left ${news.replies} replies` : `${a} replied to ${what}`;
    if (n === 2) return `${a} and ${b} replied to ${what}`;
    return `${a} and ${n - 1} others replied to ${what}`;
  },
  // "Sam said I see you", "Sam and Priya said I see you", "Sam and 2 others said I see you".
  pSeeWords(names) {
    const [a, b] = names, n = names.length;
    return n === 1 ? `${a} said I see you` : n === 2 ? `${a} and ${b} said I see you` : `${a} and ${n - 1} others said I see you`;
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
      if (!news.names.length && !news.asks.length && !news.commenters.length && !news.seers.length && !news.repliers.length && !(news.plans || []).length) { this.sql.exec("UPDATE fpings SET due = NULL, pend = '[]' WHERE user = ?", row.user); continue; }
      const sub = JSON.parse(row.sub);
      let gone = false;
      try { gone = await ping(this.env, sub.endpoint, this.pNote(news), sub.keys, PINGS.ttl / 1000); } catch { /* tried again with the next moment */ }
      if (gone) this.sql.exec("DELETE FROM fpings WHERE user = ?", row.user);
      else this.sql.exec("UPDATE fpings SET due = NULL, pend = '[]', last = ? WHERE user = ?", now, row.user);
    }
    await this.pWake();
  },
};
