// Backup and sync (alex 2026-11-20; CLAUDE.md "Accounts"). For people with an account, the phone's days go up to
// their private backup a few seconds after each change, whenever it's online, and come back on a new phone.
// The phone stays the main copy and works offline.
//
// How two phones agree: everything is split into small pieces: each day ("d:2026-11-20") and each other part of
// the app's data ("k:pillars", "k:levels"...). Each piece remembers when it last changed. When the phone and the
// backup disagree about a piece, the newer one wins, piece by piece, so a day changed on one phone never wipes
// a different day changed on the other. A piece removed on purpose leaves a short note ("gone") for 90 days so
// the other phone removes it too.
//
// What stays on this phone only: tester mode, test mode, notifications (each phone asks for its own), photo
// settings, and the card library's caches. PHOTOS go in their own private store (js/photo-backup.js, 2026-11-21),
// not inside this backup (capped at about 1.5 MB). A day's "has a photo" note joins this backup only once that
// photo is backed up (ph.b), so another phone never looks for a picture it can't get; it then fetches the picture
// the first time it's shown. A newer photo on another phone (ph.v) replaces this phone's copy; a backed-up photo
// removed on another phone is removed here too.
//
// Times here use the real clock on purpose (not now() from clock.js): two phones must agree on which change came
// last, and test mode's time travel would otherwise make one phone's changes always win.
import * as store from "./store.js";
import * as account from "./account.js";
import { log } from "./tester.js";

const META = "daydeck-sync";
const SKIP = new Set(["tester", "test", "notify", "ph", "v"]);       // this phone only
const LIB_LOCAL = ["list", "at", "status", "pending"];              // the card library's caches and queue
const DAY_LOCAL = ["ph", "xph"];   // xph: second photos on a day (alex 2026-11-27), same rule as ph                                            // a photo's note travels only once it's backed up (ph.b)
const GONE_KEEP = 90 * 864e5;
const DAY_ID = /^d:\d{4}-\d{2}-\d{2}$/, KEY_ID = /^k:[a-zA-Z]{1,30}$/;

let meta = readMeta(), timer = 0, running = null, again = false, onChanged = null;
// photo-backup.js listens: a day whose picture on this phone is out of date or was removed elsewhere.
let photoGone = () => {};
export function onPhotoGone(fn) { photoGone = fn; }
function readMeta() { try { const m = JSON.parse(localStorage.getItem(META)); if (m && typeof m === "object" && m.h) return m; } catch { /* fresh */ } return blank(); }
function blank() { return { user: null, base: 0, h: {}, at: {}, gone: {}, last: 0, state: "" }; }
function keepMeta() { try { localStorage.setItem(META, JSON.stringify(meta)); } catch { /* full */ } }

// "Backed up 5 minutes ago", for Settings.
export function status() { return { last: meta.last, state: meta.state }; }

// ---------------- The pieces ----------------
const strip = (o, keys) => { if (!o || typeof o !== "object" || Array.isArray(o)) return o; const c = { ...o }; keys.forEach((k) => delete c[k]); return c; };
// The same data always gives the same text, whatever order its parts were written in.
const steady = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, key) => ((o[key] = x[key]), o), {}) : x));
const hash = (v) => { const s = steady(v); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + s.length.toString(36); };

function pieces() {
  const s = store.get(), out = {};
  for (const [k, d] of Object.entries(s.days || {})) if (DAY_ID.test("d:" + k)) {
    const p = strip(d, DAY_LOCAL);
    if (d.ph && d.ph.b) p.ph = { b: 1, v: d.ph.v || 0, w: d.ph.w ? 1 : 0 };
    const x = Object.entries(d.xph || {}).filter(([, n]) => n && n.b);
    if (x.length) p.xph = Object.fromEntries(x.map(([f, n]) => [f, { b: 1, v: n.v || 0, w: n.w ? 1 : 0 }]));
    out["d:" + k] = p;
  }
  for (const [k, v] of Object.entries(s)) {
    if (k === "days" || SKIP.has(k) || v === undefined || !KEY_ID.test("k:" + k)) continue;
    out["k:" + k] = k === "lib" ? strip(v, LIB_LOCAL) : v;
  }
  return out;
}
// Put a piece from the backup into this phone's data. Objects are changed in place, so a screen holding onto
// today's day still sees the new version.
function put(id, v) {
  const s = store.get(), k = id.slice(2);
  if (id.startsWith("d:")) {
    if (v === undefined) { delete s.days[k]; return; }
    const d = s.days[k] || (s.days[k] = {}), mine = d.ph, theirs = v && v.ph, mineX = d.xph || {}, theirsX = (v && v.xph) || {};
    Object.keys(d).forEach((x) => delete d[x]);
    Object.assign(d, v);
    delete d.ph; delete d.xph;
    // Second photos on the day follow the same rule, one by one.
    const xph = {};
    for (const f of new Set([...Object.keys(mineX), ...Object.keys(theirsX)])) {
      const a = mineX[f], b = theirsX[f], pk = `${k}~${f}`;
      if (a && !a.b) xph[f] = a;
      else if (b && b.b) { xph[f] = { ...b }; if (a && (a.v || 0) < (b.v || 0)) photoGone(pk); }
      else if (a && a.b && !b) photoGone(pk);
    }
    if (Object.keys(xph).length) d.xph = xph;
    // The photo note: a photo only on this phone stays; a backed-up one follows the backup (newer replaces older;
    // removed elsewhere is removed here). photos.js is told, so it can drop a picture it no longer needs.
    if (mine && !mine.b) d.ph = mine;
    else if (theirs && theirs.b) { d.ph = { ...theirs }; if (mine && (mine.v || 0) < (theirs.v || 0)) photoGone(k); }
    else if (mine && mine.b && !theirs) photoGone(k);
    return;
  }
  if (v === undefined) { delete s[k]; return; }
  if (k === "lib") { const loc = s.lib || {}, next = { ...v }; LIB_LOCAL.forEach((x) => { if (x in loc) next[x] = loc[x]; }); s.lib = next; return; }
  if (s[k] && typeof s[k] === "object" && !Array.isArray(s[k]) && v && typeof v === "object" && !Array.isArray(v)) { Object.keys(s[k]).forEach((x) => delete s[k][x]); Object.assign(s[k], v); }
  else s[k] = v;
}

// Notice what changed on this phone since last time, and when.
function look(t) {
  const cur = pieces(), ids = Object.keys(cur), gone = [];
  for (const id of ids) { const hh = hash(cur[id]); if (meta.h[id] !== hh) { meta.h[id] = hh; meta.at[id] = t; delete meta.gone[id]; } }
  for (const id of Object.keys(meta.h)) if (!(id in cur)) gone.push(id);
  // A phone that was suddenly emptied (Start again, a cleared phone): never send that as "delete everything".
  // The backup is kept safe and this phone signs out; signing in again brings the days back.
  const had = Object.keys(meta.h).filter((id) => id.startsWith("d:")).length;
  const lostDays = gone.filter((id) => id.startsWith("d:")).length;
  if (lostDays >= 2 && lostDays >= had / 2) return null;   // one day removed on purpose still goes through
  for (const id of gone) { delete meta.h[id]; meta.gone[id] = t; meta.at[id] = t; }
  for (const [id, at] of Object.entries(meta.gone)) if (t - at > GONE_KEEP) { delete meta.gone[id]; delete meta.at[id]; }
  return cur;
}
function payload(cur) {
  const items = {};
  for (const [id, v] of Object.entries(cur)) items[id] = { at: meta.at[id] || 0, v };
  for (const [id, at] of Object.entries(meta.gone)) items[id] = { at, gone: 1 };
  return { v: 1, items };
}
// Bring in the backup's pieces that are newer than this phone's. first: this phone has never synced with this
// account, so its own pieces count as old (a new phone's empty starting data must never win), except days it has
// more in than the backup does.
function merge(data, first) {
  const items = data && data.items && typeof data.items === "object" ? data.items : {};
  const local = first ? pieces() : null;
  let changed = 0;
  for (const [id, it] of Object.entries(items)) {
    if (!(DAY_ID.test(id) || KEY_ID.test(id)) || !it || typeof it !== "object" || (id.startsWith("k:") && SKIP.has(id.slice(2)))) continue;
    const theirs = Number(it.at) || 0;
    let mine = meta.at[id] || 0;
    if (first && id in local) {
      mine = !it.gone && id.startsWith("d:") && steady(local[id]).length > steady(it.v).length ? Date.now() : 0;
      if (mine) { meta.at[id] = mine; meta.h[id] = hash(local[id]); }
    }
    if (theirs <= mine) continue;
    put(id, it.gone ? undefined : it.v);
    meta.at[id] = theirs;
    if (it.gone) { delete meta.h[id]; meta.gone[id] = theirs; } else { delete meta.gone[id]; meta.h[id] = hash(pieces()[id]); }
    changed++;
  }
  return changed;
}

// ---------------- Going up and coming down ----------------
const busy = () => ["in-flow", "in-ask", "in-acct"].some((c) => document.body.classList.contains(c)) || !!document.querySelector(".sheet-host");
export function soon(ms = 4000) { clearTimeout(timer); if (account.signedIn()) timer = setTimeout(() => now(), ms); }
export async function now() {
  if (!account.signedIn()) return { skipped: "signed_out" };
  if (running) { again = true; return running; }
  if (busy()) { soon(5000); return { skipped: "busy" }; }
  running = run().finally(() => { running = null; if (again) { again = false; soon(1500); } });
  return running;
}
async function run() {
  const u = account.user() || {};
  if (meta.user && meta.user !== u.email) { meta = blank(); }   // a different account on this phone
  meta.user = u.email || null;
  const t = Date.now(), first = !meta.base && !meta.last;
  let changed = 0;
  // A phone that has never synced reads the backup first, then merges.
  if (first) {
    const r = await account.call("/a/backup");
    if (!r.ok) return fail(r);
    if (r.data) changed += merge(r.data, true);
    meta.base = r.at || 0;
  }
  let cur = look(t);
  if (!cur) { log("sync", "cleared"); meta = blank(); keepMeta(); account.forgetHere(); return { cleared: true }; }
  for (let tries = 0; tries < 3; tries++) {
    const r = await account.call("/a/backup", { data: payload(cur), base: meta.base });
    if (r.ok) { meta.base = r.at; meta.last = Date.now(); meta.state = ""; keepMeta(); if (changed) applied(changed); log("sync", first ? "first" : "ok"); return { ok: true, changed }; }
    if (r.conflict) { changed += merge(r.data, false); meta.base = r.at; cur = pieces(); continue; }
    return fail(r);
  }
  return fail({ error: "busy" });
}
function fail(r) {
  meta.state = r.error === "too_big" ? "full" : r.error === "offline" ? "offline" : "trouble";
  keepMeta();
  if (r.error !== "offline") log("sync_error", r.error || "unknown");
  return r;
}
// Changes came from the backup: save them on this phone without starting another backup, then redraw.
function applied(n) {
  quiet = true; store.save(); quiet = false;
  log("sync_in", n);
  onChanged && onChanged();
}
let quiet = false;

// ---------------- Starting up ----------------
export function start(changed) {
  onChanged = changed;
  store.onSave(() => { if (!quiet) soon(); });
  account.onAccount((what) => {
    if (what === "in") { meta = blank(); keepMeta(); now(); }        // signed up or in: send this phone's days, bring back the account's
    if (what === "out") { meta = blank(); keepMeta(); }               // signed out or deleted: this phone keeps its days
  });
  addEventListener("online", () => soon(500));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") soon(800); else if (account.signedIn()) now(); });
  soon(1500);
}
