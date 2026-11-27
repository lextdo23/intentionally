// Shared dates (alex 2026-11-27, canvas "Daydeck · Share a date with a friend"). A set-a-date card (js/later.js) can
// be shared with friends, up to 5, from "When is it?" (js/stack.js). It lands on their home behind their own card as
// "Date night · From Mia"; they say "I'm in" or "Not this time". On the day it comes to the front for everyone with the
// camera, and "With Mia" under it. Each keeps their own photo.
//
// The service keeps the plan (push/friends.js "Shared dates": card number, date, who), so this file only keeps a copy
// of the last list on this phone, under "daydeck-plans" (never in the backup), so home can draw it straight away and
// offline. Which plan belongs to one of your own cards is kept on that card (c.plan), so it backs up with the day.
// Loaded lightly: no screens here, and the account is only fetched when something is sent.
import * as store from "./store.js";

const KEY = "daydeck-plans";
let cache = read();
const listeners = new Set();
function read() { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && Array.isArray(v.mine) && Array.isArray(v.invited) ? v : { mine: [], invited: [] }; } catch { return { mine: [], invited: [] }; } }
function keep() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage full or blocked */ } }
const log = (...a) => import("./tester.js").then((t) => t.log(...a)).catch(() => {});
const call = (path, body) => import("./account.js").then((a) => (a.signedIn() ? a.call(path, body) : { ok: false, error: "signed_out" })).catch(() => ({ ok: false, error: "offline" }));
const tell = () => listeners.forEach((f) => { try { f(); } catch { /* a screen gone */ } });

export const onChange = (f) => listeners.add(f);
export const mine = () => cache.mine;
export const invited = () => cache.invited;
export const mineById = (id) => (id ? cache.mine.find((p) => p.id === id) || null : null);
export const waiting = () => cache.invited.filter((p) => p.state === "ask");
// Signing out: the copy goes with the account.
export function forget() { cache = { mine: [], invited: [] }; try { localStorage.removeItem(KEY); } catch { /* fine */ } tell(); }

// Fresh from the service (after Friends loads). Home only redraws when something it shows changed.
let busy = null;
export function load() {
  if (busy) return busy;
  busy = call("/a/f/plans").then((r) => {
    busy = null;
    if (r.error === "signed_out") { if (cache.mine.length || cache.invited.length) forget(); return; }
    if (!r.ok || !Array.isArray(r.mine) || !Array.isArray(r.invited)) return;
    const next = { mine: r.mine, invited: r.invited };
    if (JSON.stringify(next) === JSON.stringify({ mine: cache.mine, invited: cache.invited })) return;
    cache = next; keep(); tell();
  });
  return busy;
}

// Your own card (drawn on day f) shared with these friends (usernames), on its date. Returns the plan, or null.
export async function save(f, guests) {
  const d = store.get().days[f], c = d && d.card;
  if (!c || !c.when) return null;
  const { tid } = await import("./deck.js");
  const had = mineById(c.plan), fresh = guests.filter((u) => !(had && had.guests.some((g) => g.username === u)));
  const r = await call("/a/f/plan", { id: c.plan || undefined, card: tid(c.id), day: c.when, made: f, guests });
  if (!r.ok || !r.plan) return null;
  c.plan = r.plan.id; store.save();
  cache.mine = cache.mine.filter((p) => p.id !== r.plan.id).concat(r.plan); keep(); tell();
  if (fresh.length) log("plan_invite", { id: tid(c.id), n: guests.length, f: had ? 1 : 0 });   // how many, never who
  return r.plan;
}
// Your card's date was taken away ("Not set yet"): calls it off for everyone invited.
export async function drop(f) {
  const d = store.get().days[f], c = d && d.card;
  if (!c || !c.plan) return;
  const id = c.plan;
  delete c.plan; store.save();
  cache.mine = cache.mine.filter((p) => p.id !== id); keep(); tell();
  const r = await call("/a/f/plan/drop", { id });
  if (r.ok) log("plan_off");
}
// A friend's invite: "I'm in" (yes) or "Not this time".
export async function answer(id, yes, from = "home") {
  const p = cache.invited.find((x) => x.id === id);
  const r = await call("/a/f/plan/answer", { id, yes });
  if (!r.ok && r.error !== "not_found") return false;
  if (p) { if (yes && r.ok) p.state = "in"; else cache.invited = cache.invited.filter((x) => x.id !== id); keep(); tell(); }
  log("plan_join", { y: yes ? 1 : 0, f: from === "bell" ? 1 : 0 });
  return true;
}
// "Can't make it" after saying "I'm in": the person who invited is told.
export async function leave(id) {
  const r = await call("/a/f/plan/drop", { id });
  if (!r.ok) return false;
  cache.invited = cache.invited.filter((x) => x.id !== id); keep(); tell();
  log("plan_leave");
  return true;
}
