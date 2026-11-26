// Morning and evening notifications. The phone works out *when* each should arrive and tells the small
// notification service (push/, shared with the old app) only those times. The service sends an empty ping and
// the service worker here picks the words, so nothing the person noted ever leaves the phone.
import * as store from "./store.js";
import { dayKey, keyDate, addDays } from "./util.js";
import { card as cardOf, dayOfUse } from "./deck.js";

const SERVICE = "https://intentionally-push.lextdo.workers.dev";
const DAY = 864e5;
// Everything starts on (alex 2026-11-26): people turn off what they don't want. Nothing arrives until the phone
// allows notifications (Apple asks once). People who already had Daydeck keep the choices saved on their phone.
export const defaults = () => ({ am: { on: true, t: "08:00" }, pm: { on: true, t: "21:00" }, card: { on: true } });
const HOUR = 36e5;
export const supported = () => "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
export const blocked = () => supported() && Notification.permission === "denied";
// On iPhone, notifications only work once the app has been added to the Home Screen.
export const needsInstall = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone && !matchMedia("(display-mode: standalone)").matches;

export function prefs() { const s = store.get(); s.notify = Object.assign(defaults(), s.notify || {}); return s.notify; }

// Asks permission (must come straight from a tap), then signs this phone up for pings. Returns the sign-up, or null.
// Also used by friend notifications (js/friends.js), which hand it to the service with the account.
export async function pushSub() {
  if (!supported()) return null;
  if (Notification.permission !== "granted" && await Notification.requestPermission() !== "granted") return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { key } = await (await fetch(`${SERVICE}/key`)).json();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(key) });
    }
    return sub;
  } catch { return null; }
}
// This phone's sign-up for pings, if it already has one (never asks).
export async function currentSub() {
  if (!supported() || Notification.permission !== "granted") return null;
  try { return await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch { return null; }
}
// Asks the phone if it hasn't been asked yet. "asked" (allowed or not), "blocked" (said no before: Apple won't ask
// again, so the person has to switch them on in the phone's Settings), "granted" already, or "no" (can't here).
export async function askIfNeeded() {
  if (!supported() || needsInstall()) return "no";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "blocked";
  return (await enable()) ? "asked" : "no";
}
export async function enable() {
  if (!await pushSub()) return false;
  sent = ""; await sync(); allowed.forEach((f) => f()); return true;
}
// Others that want to know when notifications are allowed (friend notifications follow straight away).
const allowed = [];
export const onAllowed = (f) => allowed.push(f);

// The next time the clock reads hh:mm, skipped if the check-in for that nudge's own day is already done.
// (Checking "today" instead broke mornings: a day runs until 4am, so opening the app after midnight saw
// yesterday's sleep as done and skipped the coming morning's nudge.)
function nextAt(hhmm, done) {
  const [h, m] = hhmm.split(":").map(Number), d = new Date();
  d.setHours(h, m, 0, 0);
  let t = d.getTime();
  if (t <= Date.now()) t += DAY;
  if (done(store.get().days[dayKey(t)] || {})) t += DAY;
  return t;
}

// Card reminders (alex 2026-11-17): up to two on a day you kept a card and haven't done it yet. "Lunch and after
// work": 12:30pm, then 3 hours before your evening nudge. Kept the card after 12:30? Then 3 hours after keeping
// it, and 3 hours after that. Never within an hour of the evening nudge, never on a rest day, and none at all
// once the card is done. Only for people who have morning or evening nudges on.
export function cardTimes(s = store.get(), at = Date.now(), evenIfDone = false) {
  const n = prefs(), k = dayKey(at), d = s.days[k] || {};
  if (!n.card.on || !(n.am.on || n.pm.on) || d.rest || !d.card || !d.card.id || (d.card.done && !evenIfDone)) return [];
  const on = (hhmm) => { const [h, m] = hhmm.split(":").map(Number), x = keyDate(k); x.setHours(h, m, 0, 0); let t = x.getTime(); if (h < 4) t += DAY; return t; };
  const eve = on(n.pm.on ? n.pm.t : "21:00"), lunch = on("12:30"), kept = d.card.at || at;
  const times = kept <= lunch ? [lunch, eve - 3 * HOUR] : [kept + 3 * HOUR, kept + 6 * HOUR];
  return times.filter((t) => t > at && t <= eve - HOUR);
}

// Wind-down nudge (weekly wrapped, screen 5: "Keep your 11:20 nights"): once a night, 20 minutes before the usual
// lights out, until the plan's Sunday, then it stops by itself. Skipped on a night you've already ended your day.
// The service takes four one-off times at most, so it gets the next nights that fit after any card reminders.
export function windTimes(s = store.get(), at = Date.now()) {
  const p = s.wrap && s.wrap.plan, it = p && p.items.find((x) => x.kind === "nudge" && !x.off);
  if (!it) return [];
  const out = [];
  for (let k = dayKey(at); k <= p.end && out.length < 4; k = addDays(k, 1)) {
    if (k < p.start || (s.days[k] && s.days[k].mood != null)) continue;
    const x = keyDate(k); x.setHours(Math.floor(it.at / 60), it.at % 60, 0, 0);
    const t = x.getTime() + (it.at < 240 ? DAY : 0);
    if (t > at) out.push(t);
  }
  return out;
}

// Weekly recap (alex 2026-11-22). Sunday: "Weekly recap tonight" at the evening nudge time (7pm if evenings are off),
// unless the day is already ended. Monday: "Weekly recap ready" at the morning nudge time (8am if mornings are off),
// only while that week's recap still waits on home. Never more than these two for one week, and only when a recap
// will really be there (from day 7 of use, like js/wrapped.js readyWeek). Always on, with no switch (alex 2026-11-26):
// everyone whose phone allows notifications gets them, nudges on or off. When it lands on the same minute as the usual nudge, the service sends one ping and it gets these words.
// evenIfDone keeps the ones no longer needed (marked done) so a ping already on its way stays quiet.
export function recapTimes(s = store.get(), at = Date.now(), evenIfDone = false) {
  const n = prefs();
  if (!s.started) return [];
  const seen = (s.wrap && s.wrap.seen) || {}, k = dayKey(at), mon = addDays(k, -((keyDate(k).getDay() + 6) % 7)), out = [];
  const on = (day, hhmm) => { const [h, m] = hhmm.split(":").map(Number), x = keyDate(day); x.setHours(h, m, 0, 0); return x.getTime() + (h < 4 ? DAY : 0); };
  for (const w of [addDays(mon, -7), mon]) {
    const sun = addDays(w, 6), d = s.days[sun] || {};
    if (dayOfUse(sun) < 7) continue;
    const noted = Array.from({ length: 7 }, (_, i) => s.days[addDays(w, i)]).some((x) => x && x.mood != null);
    out.push({ t: on(sun, n.pm.on ? n.pm.t : "19:00"), kind: "recap-sun", done: !!seen[w] || d.mood != null });
    out.push({ t: on(addDays(w, 7), n.am.on ? n.am.t : "08:00"), kind: "recap-mon", done: !!seen[w] || !noted });
  }
  return out.filter((x) => x.t > at && (evenIfDone || !x.done));
}

// The service worker picks the words for each ping, so it keeps a copy of today's card reminder times and task.
// Only on this phone: the service still gets times and nothing else.
// It also knows when the card is done, so a ping that was already on its way when "I did it" was tapped stays quiet.
async function keepCardPlan(s) {
  try {
    const d = s.days[dayKey(Date.now())] || {}, c = d.card && d.card.id ? cardOf(d.card.id) : null, at = cardTimes(s, Date.now(), true);
    await (await caches.open("nudge-plan")).put("card", new Response(JSON.stringify({ at, task: at.length && c ? c.text : "", done: !!(d.card && d.card.done) })));
    await (await caches.open("nudge-plan")).put("wind", new Response(JSON.stringify({ at: windTimes(s) })));
    await (await caches.open("nudge-plan")).put("recap", new Response(JSON.stringify({ at: recapTimes(s, Date.now(), true) })));
  } catch { /* no copy: a ping then gets the morning or evening words */ }
}

let sent = "";
let resub = null;   // one sign-up at a time, however many times sync runs while it happens
export async function sync() {
  if (!supported() || Notification.permission !== "granted") return;
  const n = prefs(), times = [];
  if (n.am.on) times.push(nextAt(n.am.t, (d) => !!d.sleep));
  if (n.pm.on) times.push(nextAt(n.pm.t, (d) => d.mood != null));
  try {
    let sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    // Allowed, but signed out of pings: notifications were switched off in the phone's Settings and back on
    // (alex 2026-11-27). Sign this phone up again (no question: the phone already allows them), and let friend
    // notifications follow.
    if (!sub) {
      const first = !resub;
      sub = await (resub = resub || pushSub().finally(() => { resub = null; }));
      if (!sub) return;
      if (first) { sent = ""; allowed.forEach((f) => f()); }
    }
    // The service takes four one-off times at most: the weekly recap first, then card reminders, then wind-down.
    const once = recapTimes().map((x) => x.t).concat(cardTimes(), windTimes()).slice(0, 4);
    await keepCardPlan(store.get());
    const sig = sub.endpoint + times.join(",") + "|" + once.join(",");
    if (sig === sent) return;
    const res = await fetch(`${SERVICE}/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app: "daydeck", endpoint: sub.endpoint, timerAt: null, eveningAt: null, dailyAt: times, onceAt: once }) });
    if (res.ok) sent = sig;
  } catch { /* offline: tries again next time the app opens or something changes */ }
}
// Delete everything: tells the service to forget each of this phone's nudge plans (Daydeck's and the old
// Intentionally app's, which share this site), then signs the phone out of notifications. If the phone is offline,
// the sign-out still happens, and the service then deletes the plan itself the first time a ping is refused.
export async function forget() {
  sent = "";
  if (!("serviceWorker" in navigator)) return;
  try {
    for (const reg of await navigator.serviceWorker.getRegistrations()) {
      const sub = reg.pushManager && await reg.pushManager.getSubscription();
      if (!sub) continue;
      await fetch(`${SERVICE}/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app: "daydeck", endpoint: sub.endpoint, timerAt: null, eveningAt: null, dailyAt: [] }) }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch { /* nothing signed up */ }
}
const bytes = (b64u) => Uint8Array.from(atob(b64u.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { sent = ""; sync(); } });
