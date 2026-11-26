// "Turn on notifications?" (alex 2026-11-26, mockup https://claude.ai/artifact/HoeFWq6Nk5NnWhFtTU5eVD): shown once to
// people already using Daydeck, when home is quiet. New people are asked in setup instead.
// Three kinds, by what the phone says:
//  - never asked: "Turn on notifications?", Turn on brings up Apple's own Allow box;
//  - said no to Apple before: Apple won't let an app ask twice, so it says where to switch them on;
//  - allowed, but some switches are off (they used to start off): "Turn on the rest?" lists just those, already on,
//    so one tap turns them all on (or flick one back off first).
// Not now (or closing it) means never again (seen.notifCard, which travels with the backup); Settings keeps the switches.
import { h, dayKey } from "./util.js";
import * as store from "./store.js";
import * as notify from "./notify.js";
import * as friends from "./friends.js";
import * as account from "./account.js";
import { openSheet } from "./ui.js";
import { log } from "./tester.js";

const testAccount = () => { try { const a = JSON.parse(localStorage.getItem("daydeck-account")); return !!(a && a.user && a.user.test); } catch { return false; } };
const friendsReady = () => account.signedIn() && document.body.classList.contains("friends-open") && !!(friends.loaded() && friends.loaded().me.adult);

// The switches that are off, in Settings order. Card reminders only count once a morning or evening nudge is on
// (they're timed from them), so they're listed whenever those are listed too.
function offList() {
  const n = notify.prefs(), out = [];
  if (!n.am.on) out.push({ id: "am", name: "Start your day", small: clock(n.am.t) });
  if (!n.pm.on) out.push({ id: "pm", name: "End your day", small: clock(n.pm.t) });
  if (!n.card.on) out.push({ id: "card", name: "Card reminders", small: "If your card isn't done" });
  if (friendsReady() && !friends.pingsOn()) out.push({ id: "fr", name: "Friends", small: "Requests and new moments" });
  return out;
}
const clock = (t) => { const [hh, mm] = String(t).split(":").map(Number); return `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}`; };

function kind() {
  if (!notify.supported() || notify.needsInstall()) return null;
  if (Notification.permission === "default") return "ask";
  if (Notification.permission === "denied") return "denied";
  return offList().length ? "rest" : null;
}
// Someone who was already using Daydeck before today, hasn't seen this card, and isn't one of alex's test accounts.
export function due() {
  const s = store.get();
  return !!(s.started && s.started < dayKey() && !(s.seen && s.seen.notifCard) && !testAccount() && kind());
}
const busy = () => ["in-ask", "in-flow", "in-wrap", "in-photos", "in-cards", "in-settings", "in-levels", "in-acct", "booting"].some((x) => document.body.classList.contains(x))
  || document.querySelector(".sheet-host, .cam, .ph-viewer, .tip-layer, .lu");
// Waits for a clear screen (anything else goes first), then shows the card once. Friends gets a moment to load,
// so its switch can be offered too.
export function whenFree(onDone, tries = 0) {
  if (busy() || (tries < 4 && account.signedIn() && !friends.loaded())) { if (tries < 120) setTimeout(() => whenFree(onDone, tries + 1), 1000); return; }
  if (due()) open(onDone);
}

const bell = () => h("span.nc-bell", { "aria-hidden": "true" }, h("svg", { viewBox: "0 0 24 24", width: "26", height: "26" },
  h("path", { fill: "currentColor", d: "M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" })));

export function open(onDone) {
  const k = kind(); if (!k) return;
  const s = store.get(); s.seen = s.seen || {}; s.seen.notifCard = 1; store.save();
  log("notif_card", k);
  let answered = false;
  const later = (close) => { answered = true; log("notif_card_on", "later"); close("later"); };
  openSheet((panel, close) => {
    if (k === "denied") {
      panel.append(h("div.col.nc", { style: { gap: "16px" } }, bell(),
        h("h2", null, "Notifications are off for Daydeck"),
        h("p", { style: { color: "var(--ink2)" } }, "To get a nudge to start and end your day, turn them on in your phone's Settings app:"),
        h("p.nc-steps", null, "Settings › Notifications › Daydeck › Allow Notifications"),
        h("button.btn-main", { onclick: () => { answered = true; log("notif_card_on", "okay"); close("done"); } }, "Okay")));
      return;
    }
    if (k === "ask") {
      const yes = h("button.btn-main", { onclick: async () => {
        answered = true;
        const n = notify.prefs(); n.am.on = true; n.pm.on = true; n.card.on = true; store.save();   // everything starts on
        const ok = await notify.enable();
        log("notif_card_on", ok ? "allowed" : "not");
        close("done");
      } }, "Turn on");
      panel.append(h("div.col.nc", { style: { gap: "16px" } }, bell(),
        h("h2", null, "Turn on notifications?"),
        h("p", { style: { color: "var(--ink2)" } }, "A nudge to start and end your day, your weekly recap, and when friends share or add you."),
        yes, h("button.btn-quiet", { onclick: () => later(close) }, "Not now"),
        h("p.note", null, "Change any of them in Settings.")));
      return;
    }
    // Some are off: each listed already switched on; flick one back off to leave it.
    const list = offList(), want = Object.fromEntries(list.map((x) => [x.id, true]));
    const rows = list.map((x) => {
      const sw = h("button.switch", { role: "switch", "aria-checked": "true", "aria-label": x.name, onclick: () => { want[x.id] = !want[x.id]; sw.setAttribute("aria-checked", String(want[x.id])); } });
      return h("div.set-row.set-toggle", null, h("span.set-label", null, x.name, h("small.set-small", null, x.small)), sw);
    });
    const yes = h("button.btn-main", { onclick: async () => {
      answered = true;
      const n = notify.prefs(), turned = [];
      for (const id of ["am", "pm", "card"]) if (want[id]) { n[id].on = true; turned.push(id); }
      store.save(); notify.sync();
      if (want.fr && await friends.setPings(true, "card")) turned.push("fr");
      log("notif_card_on", turned.length ? turned.join(",") : "none");
      close("done");
    } }, "Turn on");
    panel.append(h("div.col.nc", { style: { gap: "16px" } }, bell(),
      h("h2", null, "Turn on the rest?"),
      h("div.set-card", null, rows.flatMap((r, i) => (i ? [h("div.set-line", { "aria-hidden": "true" }), r] : [r]))),
      yes, h("button.btn-quiet", { onclick: () => later(close) }, "Not now"),
      h("p.note", null, "Change any of them in Settings.")));
  }, { label: "Notifications", onClose: (why) => { if (!answered) log("notif_card_on", "later"); onDone && onDone(why); } });
}

// Switching a nudge back on in Settings while the phone has Daydeck's notifications off (alex 2026-11-27): Apple only
// lets an app ask once, so after "Don't Allow" this says where to switch them on. The switch stays on, so nudges
// start by themselves once the phone allows them (notify.sync re-signs the phone up when they come back).
export function offInPhone() {
  openSheet((panel, close) => {
    panel.append(h("div.col.nc", { style: { gap: "16px" } }, bell(),
      h("h2", null, "Notifications are off for Daydeck"),
      h("p", { style: { color: "var(--ink2)" } }, "Your iPhone won't let Daydeck ask again. To get your nudges, turn them on in your phone's Settings app:"),
      h("p.nc-steps", null, "Settings › Notifications › Daydeck › Allow Notifications"),
      h("p", { style: { color: "var(--ink2)", fontSize: "15px" } }, "Home Screen apps are listed there, not under Apps, by the name under Daydeck's icon."),
      h("button.btn-main", { onclick: () => close("done") }, "Okay")));
  }, { label: "Notifications are off for Daydeck" });
}
