// Morning and evening notifications. The phone works out *when* each should arrive and tells the small
// notification service (push/, shared with the old app) only those times. The service sends an empty ping and
// the service worker here picks the words, so nothing the person noted ever leaves the phone.
import * as store from "./store.js";
import { dayKey, keyDate } from "./util.js";
import { card as cardOf } from "./deck.js";

const SERVICE = "https://intentionally-push.lextdo.workers.dev";
const DAY = 864e5;
export const defaults = () => ({ am: { on: false, t: "08:00" }, pm: { on: false, t: "21:00" }, card: { on: true } });
const HOUR = 36e5;
export const supported = () => "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
export const blocked = () => supported() && Notification.permission === "denied";
// On iPhone, notifications only work once the app has been added to the Home Screen.
export const needsInstall = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone && !matchMedia("(display-mode: standalone)").matches;

export function prefs() { const s = store.get(); s.notify = Object.assign(defaults(), s.notify || {}); return s.notify; }

// Asks permission (must come straight from a tap), then signs up for pings.
export async function enable() {
  if (!supported()) return false;
  if (await Notification.requestPermission() !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!await reg.pushManager.getSubscription()) {
      const { key } = await (await fetch(`${SERVICE}/key`)).json();
      await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(key) });
    }
    sent = ""; await sync(); return true;
  } catch { return false; }
}

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

// The service worker picks the words for each ping, so it keeps a copy of today's card reminder times and task.
// Only on this phone: the service still gets times and nothing else.
// It also knows when the card is done, so a ping that was already on its way when "I did it" was tapped stays quiet.
async function keepCardPlan(s) {
  try {
    const d = s.days[dayKey(Date.now())] || {}, c = d.card && d.card.id ? cardOf(d.card.id) : null, at = cardTimes(s, Date.now(), true);
    await (await caches.open("nudge-plan")).put("card", new Response(JSON.stringify({ at, task: at.length && c ? c.text : "", done: !!(d.card && d.card.done) })));
  } catch { /* no copy: a ping then gets the morning or evening words */ }
}

let sent = "";
export async function sync() {
  if (!supported() || Notification.permission !== "granted") return;
  const n = prefs(), times = [];
  if (n.am.on) times.push(nextAt(n.am.t, (d) => !!d.sleep));
  if (n.pm.on) times.push(nextAt(n.pm.t, (d) => d.mood != null));
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (!sub) return;
    const once = cardTimes();
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
