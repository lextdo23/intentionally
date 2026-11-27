// Photo backup (alex 2026-11-20/21; CLAUDE.md "Photos will be backed up too"). Each day's photo, and a profile photo,
// kept privately in Cloudflare R2 (the bucket "daydeck-photos", bound as PHOTOS), so a new phone gets them back.
// Only the owner can read their photos. Every photo is cleaned on the phone first (nothing but the picture) and
// checked again here: a JPEG with no location, time, phone or camera details. It goes when the person removes it,
// turns photo backup off, or deletes their account.
//
// Limits (alex 2026-11-21): up to 25 photos a day per person (older photos backing up after signing in have their
// own allowance of 200 a day, so they catch up over a few days), and a ceiling of 50 GB across everyone, with an email
// to alex at 40 GB. Monthly save and load ceilings sit at R2's free amounts as a last guard against a bug.
// Photos are stored as R2 objects named u/<account>/<day>.jpg (or profile.jpg); a small index here keeps sizes.

export const PLIMITS = { perDay: 25, backfillPerDay: 200, maxBytes: 700000, total: 50e9, warnAt: 40e9, writes: 1e6, reads: 10e6 };
const DAY = 86400000;
const KEY = /^(\d{4}-\d{2}-\d{2}(~\d{4}-\d{2}-\d{2})?|profile)$/;   // a second photo on a day: <day>~<card's day> (alex 2026-11-27)

// Nothing but the picture: a JPEG whose details before the picture are only the basic ones (no EXIF, XMP,
// comments or other extras). Returns true if it's clean.
export function cleanJpeg(a) {
  if (!(a instanceof Uint8Array) || a.length < 100 || a[0] !== 0xff || a[1] !== 0xd8) return false;
  let i = 2;
  while (i + 4 <= a.length) {
    if (a[i] !== 0xff) return false;
    const m = a[i + 1];
    if (m === 0xda) return true;
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
    if ((m >= 0xe1 && m <= 0xef) || m === 0xfe) return false;
    i += 2 + ((a[i + 2] << 8) | a[i + 3]);
  }
  return false;
}

export function photoTables(sql) {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS pidx (user TEXT, k TEXT, size INTEGER, v INTEGER, PRIMARY KEY (user, k));
    CREATE TABLE IF NOT EXISTS pops (month TEXT PRIMARY KEY, w INTEGER, r INTEGER);`);
}
const month = () => new Date().toISOString().slice(0, 7);
const obj = (user, k) => `u/${user}/${k}.jpg`;

// Methods added to the book (Accounts in accounts.js).
export const photoMethods = {
  pOps() { return this.one("SELECT * FROM pops WHERE month = ?", month()) || { w: 0, r: 0 }; },
  pCount(kind) { this.sql.exec(`INSERT INTO pops (month, w, r) VALUES (?, ?, ?) ON CONFLICT(month) DO UPDATE SET ${kind} = ${kind} + 1`, month(), kind === "w" ? 1 : 0, kind === "r" ? 1 : 0); },
  pUsed() { return this.one("SELECT COALESCE(SUM(size), 0) AS n FROM pidx").n; },
  // May this person save this photo now? Answers { user, warn } or an error.
  async pCanPut(token, k, size) {
    const u = await this.sessionUser(token);
    if (!u) return { error: "signed_out", status: 401 };
    if (!KEY.test(k)) return { error: "bad_photo" };
    if (size > PLIMITS.maxBytes) return { error: "too_big", status: 413 };
    const t = Date.now(), had = this.one("SELECT size FROM pidx WHERE user = ? AND k = ?", u.id, k);
    // Older photos catching up (a day more than two days ago, not saved before) use their own allowance.
    const old = k !== "profile" && !had && Date.parse(k + "T00:00:00Z") < t - 2 * DAY;
    const sk = (old ? "pb:" : "pu:") + u.id;
    if (this.one("SELECT COUNT(*) AS n FROM sends WHERE k = ? AND at > ?", sk, t - DAY).n >= (old ? PLIMITS.backfillPerDay : PLIMITS.perDay)) return { error: "daily_limit", status: 429 };
    const used = this.pUsed();
    if (used - (had ? had.size : 0) + size > PLIMITS.total || this.pOps().w >= PLIMITS.writes) return { error: "photos_full", status: 507 };
    this.sql.exec("INSERT INTO sends (k, at) VALUES (?, ?)", sk, t);
    let warn = false;
    if (used + size > PLIMITS.warnAt && !this.one("SELECT 1 AS x FROM mailed WHERE k = 'photos40'")) { warn = true; this.sql.exec("INSERT OR REPLACE INTO mailed (k, at) VALUES ('photos40', ?)", t); }
    return { user: u.id, warn };
  },
  pDid(user, k, size) {
    const v = Date.now();
    this.sql.exec("INSERT OR REPLACE INTO pidx (user, k, size, v) VALUES (?, ?, ?, ?)", user, k, size, v);
    this.pCount("w");
    return v;
  },
  async pCanGet(token, k) {
    const u = await this.sessionUser(token);
    if (!u) return { error: "signed_out", status: 401 };
    if (!KEY.test(k) || !this.one("SELECT 1 AS x FROM pidx WHERE user = ? AND k = ?", u.id, k)) return { error: "not_found", status: 404 };
    if (this.pOps().r >= PLIMITS.reads) return { error: "photos_full", status: 507 };
    this.pCount("r");
    return { user: u.id };
  },
  async pList(token) {
    const u = await this.sessionUser(token);
    if (!u) return { error: "signed_out", status: 401 };
    return { ok: true, photos: this.rows("SELECT k, v, size FROM pidx WHERE user = ? ORDER BY k", u.id) };
  },
  async pForget(token, k) {
    const u = await this.sessionUser(token);
    if (!u) return { error: "signed_out", status: 401 };
    const keys = k === "*" ? this.rows("SELECT k FROM pidx WHERE user = ?", u.id).map((r) => r.k) : KEY.test(k) ? [k] : [];
    this.sql.exec(k === "*" ? "DELETE FROM pidx WHERE user = ?" : "DELETE FROM pidx WHERE user = ? AND k = ?", ...(k === "*" ? [u.id] : [u.id, k]));
    return { user: u.id, keys };
  },
  // Deleting an account: which photos to delete from R2.
  pAllOf(id) { const keys = this.rows("SELECT k FROM pidx WHERE user = ?", id).map((r) => r.k); this.sql.exec("DELETE FROM pidx WHERE user = ?", id); return keys; },
};

// The routes: /a/p (list), /a/p/<key> (GET a photo, POST a photo's bytes), /a/p/del/<key>, /a/p/del/* (all).
export async function photoRoutes(req, env, path, b, token, reply, tellAlex) {
  if (!env.PHOTOS) return reply({ error: "photos_off" }, 503);
  if (req.method === "GET" && path === "/a/p") { const r = await b.pList(token); return reply(r, r.error ? r.status || 400 : 200); }
  const del = /^\/a\/p\/del\/(\d{4}-\d{2}-\d{2}(?:~\d{4}-\d{2}-\d{2})?|profile|\*)$/.exec(path);
  if (req.method === "POST" && del) {
    const r = await b.pForget(token, del[1]);
    if (r.error) return reply(r, r.status || 400);
    if (r.keys.length) await env.PHOTOS.delete(r.keys.map((k) => obj(r.user, k)));
    return reply({ ok: true });
  }
  const m = /^\/a\/p\/(\d{4}-\d{2}-\d{2}(?:~\d{4}-\d{2}-\d{2})?|profile)$/.exec(path);
  if (!m) return reply({ error: "not_found" }, 404);
  const k = m[1];
  if (req.method === "GET") {
    const r = await b.pCanGet(token, k);
    if (r.error) return reply(r, r.status || 400);
    const o = await env.PHOTOS.get(obj(r.user, k));
    if (!o) return reply({ error: "not_found" }, 404);
    const res = reply({});
    const headers = new Headers(res.headers);
    headers.set("Content-Type", "image/jpeg"); headers.set("Cache-Control", "private, no-store");
    return new Response(o.body, { status: 200, headers });
  }
  if (req.method !== "POST") return reply({ error: "not_found" }, 404);
  const len = Number(req.headers.get("Content-Length") || 0);
  if (len > PLIMITS.maxBytes) return reply({ error: "too_big" }, 413);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > PLIMITS.maxBytes) return reply({ error: "too_big" }, 413);
  if (!cleanJpeg(bytes)) return reply({ error: "bad_photo" }, 400);
  const r = await b.pCanPut(token, k, bytes.length);
  if (r.error) return reply(r, r.status || 400);
  await env.PHOTOS.put(obj(r.user, k), bytes, { httpMetadata: { contentType: "image/jpeg" } });
  const v = await b.pDid(r.user, k, bytes.length);
  if (r.warn) await tellAlex(env, "Daydeck's photo store is 80% full", "Daydeck's photo backups have reached 40 GB of the 50 GB ceiling. Ask Claude about raising the ceiling (it costs about 1.5 US cents per extra GB a month), or backups will pause at 50 GB. Photos always stay on people's phones.").catch(() => {});
  return reply({ ok: true, v });
}
