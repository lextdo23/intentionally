// Morning and evening notifications. The phone works out *when* each should arrive and tells the small
// notification service (push/, shared with the old app) only those times. The service sends an empty ping and
// the service worker here picks the words, so nothing the person noted ever leaves the phone.
import * as store from "./store.js";
import { dayKey } from "./util.js";

const SERVICE = "https://intentionally-push.lextdo.workers.dev";
const DAY = 864e5;
export const defaults = () => ({ am: { on: false, t: "08:00" }, pm: { on: false, t: "21:00" } });
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

// The next time the clock reads hh:mm, skipping today if that check-in is already done.
function nextAt(hhmm, doneToday) {
  const [h, m] = hhmm.split(":").map(Number), d = new Date();
  d.setHours(h, m, 0, 0);
  let t = d.getTime();
  if (t <= Date.now() || doneToday) t += DAY;
  return t;
}

let sent = "";
export async function sync() {
  if (!supported() || Notification.permission !== "granted") return;
  const n = prefs(), today = store.get().days[dayKey(Date.now())] || {}, times = [];
  if (n.am.on) times.push(nextAt(n.am.t, !!today.sleep));
  if (n.pm.on) times.push(nextAt(n.pm.t, today.mood != null));
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (!sub) return;
    const sig = sub.endpoint + times.join(",");
    if (sig === sent) return;
    const res = await fetch(`${SERVICE}/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint, timerAt: null, eveningAt: null, dailyAt: times }) });
    if (res.ok) sent = sig;
  } catch { /* offline: tries again next time the app opens or something changes */ }
}
const bytes = (b64u) => Uint8Array.from(atob(b64u.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { sent = ""; sync(); } });
