// Notifications: a quiet nudge when a timer's time is up (or it has run for hours), and an optional evening question.
// FIRST VERSION, NOT FINAL: alex asked to run these as first drafted and come back to the words and design later.
// The phone works out *when* each one should arrive and tells a small service (push/) only those times.
// The service sends an empty ping; the service worker here picks the words, so no thought ever leaves the phone.
import * as store from "./store.js";
import { now, DAY } from "./clock.js";
import { affirm } from "./affirm.js";

// The service's address. Empty until it has been set up (see push/README.md); until then nothing is sent.
export const SERVICE = "https://intentionally-push.lextdo.workers.dev";

const STILL = 3 * 3600000;
// When words of affirmation arrive: up to 10 a day, spread evenly from 9 am to 9 pm (one alone comes at 9 am).
export const AFFIRM_MAX = 10;
const affirmTimes = (n) => Array.from({ length: n }, (_, k) => {
  const m = 9 * 60 + (n > 1 ? Math.round((k * 720) / (n - 1) / 5) * 5 : 0);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
// How a count reads: "Once a day", "Twice a day", "3 times a day", or "Not sent".
export const oftenWords = (n) => n === 0 ? "Not sent" : n === 1 ? "Once a day" : n === 2 ? "Twice a day" : `${n} times a day`;
// The lengths a timer can be given on the wheel (minutes, 0 = no end).
export const LENGTHS = [0, 5, 10, 15, 20, 25, 30, 40, 45, 60, 90, 120];
// "Your hour is", "Your 2 hours are", "Your 25 minutes are": the start of a "time is up" line.
export const upWords = (m) => m === 60 ? "hour is" : m % 60 === 0 ? `${m / 60} hours are` : `${m} minutes are`;

export const supported = () => "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
export const blocked = () => supported() && Notification.permission === "denied";
const ready = () => supported() && !!SERVICE && Notification.permission === "granted";

// Asks the phone for permission (this has to come straight from a tap), then signs up for pings.
export async function enable() {
  if (!supported() || !SERVICE) return false;
  if (await Notification.requestPermission() !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!await reg.pushManager.getSubscription()) {
      const { key } = await (await fetch(`${SERVICE}/key`)).json();
      await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(key) });
    }
    sent = "";
    sync();
    return true;
  } catch {
    return false;
  }
}

// What should arrive, and when. These are real times: test mode's pretend days don't move real notifications.
function plan(s) {
  const n = s.notify, shift = Date.now() - now(), out = [], r = s.running;
  if (n.timer && r) {
    if (r.minutes) out.push({ at: r.start + r.minutes * 60000 + shift, text: `Your ${upWords(r.minutes)} up. Stop when you’re ready, or keep going.` });
    else out.push({ at: afterQuiet(r.start + STILL + shift, n.quiet), text: "Still going? Your timer has been running for 3 hours." });
  }
  if (n.evening) {
    // Not on an evening a thought has already been left in the sky.
    const last = Math.max(0, ...s.thoughts.flatMap((t) => t.seen ?? [t.createdAt])) + shift;
    const at = nextAt(n.evening, Date.now(), last);
    if (!quiet(at, n.quiet)) out.push({ at, text: "Anything on your mind before bed? Leave it in your sky.", daily: true, kind: "evening" });
  }
  // Words of affirmation through the day: each one made from a thought still in their sky (never a heavy one),
  // a different thought for each time. The thought itself never goes on the lock screen, only the kind line.
  if (s.affirm !== false && s.affirmDaily > 0) {
    const mine = s.thoughts.filter((t) => t.status === "active" && !t.heavy && t.kind);
    affirmTimes(Math.min(AFFIRM_MAX, s.affirmDaily)).forEach((hhmm, k) => {
      const at = nextAt(hhmm, Date.now(), 0);
      if (quiet(at, n.quiet)) return;
      const t = mine.length ? mine[(Math.floor(at / DAY) * AFFIRM_MAX + k) % mine.length] : null;
      const name = t ? s.pillars.find((p) => p.id === t.pillarId)?.name ?? "" : "";
      out.push({ at, text: t ? affirm(t.text, t.kind, name) : "Small steps still count.", daily: true, kind: "affirm" });
    });
  }
  return out;
}

const mins = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const at = (t, hhmm) => { const d = new Date(t); d.setHours(0, mins(hhmm), 0, 0); return d.getTime(); };

// The next time the clock reads `hhmm` after `from`, skipping any day that already had something at or after `last`.
function nextAt(hhmm, from, last) {
  let t = at(from, hhmm);
  if (t <= from) t += DAY;
  if (new Date(last).toDateString() === new Date(t).toDateString()) t += DAY;
  return t;
}

function quiet(t, [from, to]) {
  const m = mins(new Date(t).toTimeString().slice(0, 5)), f = mins(from), e = mins(to);
  return f < e ? m >= f && m < e : m >= f || m < e;
}

// Moved to the end of quiet hours if it would land inside them.
function afterQuiet(t, q) {
  if (!quiet(t, q)) return t;
  const end = at(t, q[1]);
  return end > t ? end : end + DAY;
}

// Tells the service the times (and leaves the words where the service worker can find them).
// Called whenever something changes; it only reaches the internet when the times actually changed.
let sent = "";
export async function sync() {
  if (!ready()) return;
  const items = plan(store.get());
  const body = { timerAt: items.find((i) => !i.daily)?.at ?? null, eveningAt: items.find((i) => i.kind === "evening")?.at ?? null,
    dailyAt: items.filter((i) => i.kind === "affirm").map((i) => i.at) };
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (!sub) return;
    await (await caches.open("notify")).put("words", new Response(JSON.stringify(items)));
    const sig = sub.endpoint + JSON.stringify(body);
    if (sig === sent) return;
    const res = await fetch(`${SERVICE}/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint, ...body }) });
    if (res.ok) sent = sig;
  } catch { /* offline: it tries again the next time something changes or the app opens */ }
}

const bytes = (b64u) => Uint8Array.from(atob(b64u.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

store.onChange(() => sync());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { sent = ""; sync(); } });
sync();
