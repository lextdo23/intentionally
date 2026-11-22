// Tester mode (beta only). Off unless the person joins. When on, the app sends the choices and numbers they
// tap (never anything typed) to the small Daydeck service, under a random tester code, so the beta can show
// what to keep, fix and cut. Stopping deletes everything already sent. Dashboard: testers.html.
//
// RULE FOR NEW FEATURES: report what people do with log("name", value). Values are numbers or words from
// the app's own lists, never anything the person typed. If a feature needs a new KIND of data that the
// consent screen below doesn't cover, add it to SHARED and bump CONSENT so testers are asked again.
import * as store from "./store.js";
import { now } from "./clock.js";
import { dayKey } from "./util.js";
import { SLEEP_TAGS, SLEEP_MORE, FEELINGS } from "./words.js";

export const SERVICE = "https://intentionally-push.lextdo.workers.dev";
export const CONSENT = 2;   // 2: cards you show to everyone (the card library) do leave the phone (alex 2026-11-18)
export const SHARED = [
  "Your check-in answers: your mood, and the feelings and sleep tags you tap",
  "What you choose and do in the app, like pillars, cards, thumbs up or down, levels and which screens you use",
  "How many times you tap the Lifeline link",
  "How long check-ins take, when nudges arrive and when you check in",
  "Your phone type and any errors the app runs into",
];
export const NEVER = ["Anything you type in your own words, unless you show a card you made to everyone", "Your photos", "Your name, email or where you are"];

const MAX_QUEUE = 2000;
const t = () => store.get().tester;
export const on = () => !!(t() && t().on && t().consent >= CONSENT);
export const code = () => t() && t().code;
// A tester who agreed to an older consent screen: asked again before anything more is sent (js/tester-sheet.js askAgain).
export const needsAsk = () => !!(t() && t().on && t().code && (t().consent || 0) < CONSENT);
export function agreeAgain() { t().consent = CONSENT; store.save(); log("consent_again", CONSENT); send(true); }

// Records one thing that happened. Does nothing unless tester mode is on.
export function log(name, value) {
  if (!on()) return;
  const q = t().queue;
  q.push(value == null ? [now(), name] : [now(), name, value]);
  if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE);
  store.save();
}

const ALPHA = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const rand = (n, set) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => set[b % set.length]).join("");
const newCode = () => "T-" + rand(4, ALPHA);

export function join() {
  const s = store.get();
  s.tester = { on: true, consent: CONSENT, code: newCode(), key: rand(32, "0123456789abcdef"), queue: [], sent: 0, all: true };
  store.save();
  log("join");
  send(true);
}

// Stops sharing and asks the service to delete everything sent under this code.
// forget(): used by Delete everything. Asks the service to delete, and if the phone is offline, keeps only the
// code and key aside (not in the main data) and finishes the delete the next time the phone is online.
// Returns true if it's all gone now, false if the delete will finish later.
const PENDING = "daydeck-delete-later";
export async function forget() {
  const tt = store.get().tester;
  if (!tt || !tt.code || !tt.key) return true;
  if (await leave()) return true;
  try { localStorage.setItem(PENDING, JSON.stringify({ code: tt.code, key: tt.key })); } catch { /* storage blocked */ }
  return false;
}
async function finishForget() {
  let p = null; try { p = JSON.parse(localStorage.getItem(PENDING)); } catch { /* none */ }
  if (!p || !p.code || !p.key) return;
  try {
    const res = await fetch(`${SERVICE}/t/leave`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ code: p.code, key: p.key }) });
    if (res.status < 500) localStorage.removeItem(PENDING); // done, or nothing left that this key can delete
  } catch { /* still offline: try again next open */ }
}
export async function leave() {
  const s = store.get(), tt = s.tester;
  if (!tt) return true;
  try {
    const res = await fetch(`${SERVICE}/t/leave`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ code: tt.code, key: tt.key }) });
    if (!res.ok && tt.sent) return false;
  } catch { if (tt.sent) return false; }
  s.tester = { on: false, consent: 0, left: true };
  store.save();
  return true;
}

// Only words from the app's own lists travel. Anything the person typed becomes a count.
const SLEEP_OK = new Set(SLEEP_TAGS.concat(SLEEP_MORE));
const FEEL_OK = new Set(FEELINGS.map((f) => f[0]).concat("Not sure"));
function clean(d) {
  const out = {};
  if (d.mood != null) out.mood = d.mood;
  if (Array.isArray(d.feel)) { out.feel = d.feel.filter((w) => FEEL_OK.has(w)); out.feelOwn = d.feel.length - out.feel.length; }
  if (d.sleep) {
    const tags = d.sleep.tags || [];
    // Bed and wake times and how rested stay on the phone: only that the morning was done, and which tags.
    out.sleep = { tags: tags.filter((w) => SLEEP_OK.has(w)), own: tags.filter((w) => !SLEEP_OK.has(w)).length };
  }
  if (Array.isArray(d.pil)) out.pil = d.pil.filter((p) => typeof p === "string" && p.length < 30);
  if (d.rest) out.rest = true;
  if (d.card != null) out.card = d.card && typeof d.card === "object" ? Object.assign({}, d.card, { id: typeof d.card.id === "string" ? 0 : d.card.id }) : d.card;   // an own card is sent as 0, never its words
  if (Array.isArray(d.made)) out.made = d.made.length;
  return out;
}

function phone() {
  const ua = navigator.userAgent;
  let m = ua.match(/iPhone OS (\d+)_?(\d+)?/) || ua.match(/CPU OS (\d+)_?(\d+)?/);
  if (m) return `${/iPad/.test(ua) ? "iPad" : "iPhone"} iOS ${m[1]}${m[2] ? "." + m[2] : ""}`;
  m = ua.match(/Android (\d+)/); if (m) return `Android ${m[1]}`;
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Other";
}
async function version() {
  try { return ((await caches.keys()).find((k) => k.startsWith("daydeck-")) || "").slice(8) || "?"; } catch { return "?"; }
}

let busy = false, lastTry = 0;
// Sends what's waiting. Quietly tries again later if the phone is offline.
export async function send(force) {
  if (!on() || busy || store.get().test.on) return;
  if (!force && Date.now() - lastTry < 10 * 60e3) return;
  busy = true; lastTry = Date.now();
  const s = store.get(), tt = s.tester, today = dayKey();
  // Every day is sent again once after sleep times stopped being shared, so older copies on the service lose them too.
  const full = tt.all || !tt.lean;
  const keys = Object.keys(s.days).filter((k) => full || k >= shift(today, -3));
  const days = {}; keys.forEach((k) => (days[k] = clean(s.days[k])));
  const events = tt.queue.slice(0, 500);
  const n = s.notify || {};
  const body = { code: tt.code, key: tt.key, phone: phone(), version: await version(), started: s.started, days, events,
    nudges: { am: n.am ? (n.am.on ? n.am.t : "off") : "off", pm: n.pm ? (n.pm.on ? n.pm.t : "off") : "off" } };
  try {
    const res = await fetch(`${SERVICE}/t/send`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body), keepalive: JSON.stringify(body).length < 60000 });
    if (res.status === 410) { s.tester = { on: false, consent: 0, removed: true }; store.save(); busy = false; return; } // removed from the test: stop sending
    if (res.status === 409 && !tt.sent) { tt.code = newCode(); store.save(); busy = false; return send(true); } // code already taken: pick another
    if (res.ok) { tt.queue.splice(0, events.length); tt.sent = Date.now(); tt.all = false; tt.lean = true; store.save(); }
  } catch { /* offline: try again later */ }
  busy = false;
}
const shift = (k, n) => { const [y, m, d] = k.split("-").map(Number), x = new Date(y, m - 1, d + n, 12); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };

// Errors: only where it happened and the message, cut short.
const cut = (x) => String(x || "").slice(0, 140);
addEventListener("error", (e) => log("error", cut(`${e.message} @ ${(e.filename || "").split("/").pop()}:${e.lineno}`)));
addEventListener("unhandledrejection", (e) => log("error", cut(e.reason && (e.reason.stack || e.reason.message) || e.reason)));

// "Need to talk to someone?" taps: a count only.
document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("a.lifeline")) log("lifeline_tap"); }, true);

// Nudges that reached the phone, and which ones were tapped. The service worker notes them while the app is
// closed; here they become nudge_sent / nudge_tap ("am", "pm", "card", or "recap-sun" / "recap-mon" for the weekly recap) at the time they really happened.
async function nudges() {
  try {
    const c = await caches.open("nudge-log"), r = await c.match("log");
    if (!r) return;
    const list = await r.json();
    await c.delete("log");
    if (!on()) return;
    const q = t().queue;
    for (const [at, what, kind] of list) if (Number.isFinite(at) && (what === "sent" || what === "tap") && ["am", "pm", "card", "recap-sun", "recap-mon"].includes(kind)) q.push([at, "nudge_" + what, kind]);
    store.save();
  } catch { /* try again next open */ }
}

// App opened, and whether a nudge opened it.
export async function opened() {
  finishForget();
  const fromNudge = new URLSearchParams(location.search).get("from") === "nudge";
  log("open", fromNudge ? "nudge" : undefined);
  await nudges();
  send();
}
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.nudge) log("open", "nudge"); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") opened(); else send(true); });
addEventListener("online", finishForget);
