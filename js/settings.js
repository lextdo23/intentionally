// Settings: a full page that slides in from the right (like the iPhone's own Settings), opened by the round
// gear on home. Grouped rows: Nudges, Your data, Support, About, then Delete everything at the bottom.
import { h, dayKey, keyDate, DAY_NAME, reduceMotion } from "./util.js";
import * as deck from "./deck.js";
import * as store from "./store.js";
import * as notify from "./notify.js";
import * as tester from "./tester.js";
import { openSheet, roundBtn } from "./ui.js";
import { openTester, testerRow } from "./tester-sheet.js";
import { pickPillars, pillarWords } from "./pillars.js";
import * as photos from "./photos.js";
import * as account from "./account.js";
import * as sync from "./sync.js";
import * as library from "./library.js";
import * as friends from "./friends.js";
import * as photoBackup from "./photo-backup.js";
import * as crumbs from "./crumbs.js";

let onClosed = null, el = null;

// The photos for "Save a copy", gathered as Settings opens, so the copy is ready the moment it's tapped
// (iPhone can refuse a download that starts too long after the tap).
let picsReady = null;
const gatherPics = () => { picsReady = null; photos.dump().then((x) => { picsReady = x; }, () => { picsReady = {}; }); };

export function openSettings(closed) {
  onClosed = closed; tester.log("settings_open"); gatherPics();
  el = h("div", { id: "settings", role: "dialog", "aria-modal": "true", "aria-label": "Settings" });
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSettings(); });
  document.body.append(el);
  render();
  requestAnimationFrame(() => requestAnimationFrame(() => { document.body.classList.add("in-settings"); el.querySelector(".round")?.focus({ preventScroll: true }); }));
  edgeSwipe();
}

function closeSettings() {
  if (!el) return;
  const page = el; el = null;
  document.body.classList.remove("in-settings");
  setTimeout(() => page.remove(), reduceMotion() ? 160 : 420);
  onClosed && onClosed();
}

// Like iPhone apps: drag from the left edge to go back. The page follows your finger.
function edgeSwipe() {
  const page = el;
  let x0 = null, dx = 0;
  page.addEventListener("pointerdown", (e) => { if (e.clientX < 28 && e.pointerType !== "mouse") { x0 = e.clientX; dx = 0; page.setPointerCapture(e.pointerId); page.style.transition = "none"; } });
  page.addEventListener("pointermove", (e) => { if (x0 == null) return; dx = Math.max(0, e.clientX - x0); page.style.transform = `translateX(${dx}px)`; });
  const up = () => { if (x0 == null) return; x0 = null; page.style.transition = ""; page.style.transform = ""; if (dx > innerWidth * 0.33) closeSettings(); };
  page.addEventListener("pointerup", up); page.addEventListener("pointercancel", up);
}

const group = (title, rows, foot) => h("section.set-group", null,
  title ? h("h2.set-head", null, title) : null,
  h("div.set-card", null, rows.flatMap((r, i) => (i ? [h("div.set-line", { "aria-hidden": "true" }), r] : [r]))),
  foot ? (typeof foot === "string" ? h("p.set-foot", null, foot) : foot) : null);
const linkRow = (label, value, attrs) => h(attrs.href ? "a.set-row" : "button.set-row", attrs,
  h("span.set-label", null, label), value ? h("span.set-value", null, value) : null, h("span.set-chev", { "aria-hidden": "true" }, "›"));

function render() {
  if (!el) return;
  const top = el.querySelector(".set-scroll")?.scrollTop || 0;
  el.replaceChildren(h("div.set-scroll", null, h("div.set-page", null,
    h("div.col", { style: { gap: "8px" } }, roundBtn("back", "Back to home", closeSettings), h("h1.big-title", null, "Settings")),
    // Grouped by how it's used (alex 2026-11-24): you; your days; nudges; privacy and your data; support; about; delete.
    account.settingsSection(group, linkRow, render, sync.status),
    yourDays(),
    nudges(),
    privacyData(),
    group("Support", [
      linkRow("Talk to someone", "Lifeline 13 11 14", { href: "tel:131114" }),
      linkRow("Text someone", "0477 13 11 14", { href: "sms:0477131114" }),
      linkRow("Chat online", "Lifeline", { href: "https://www.lifeline.org.au/crisis-chat/", target: "_blank", rel: "noopener" }),
      linkRow("Body image", "Butterfly 1800 33 4673", { href: "tel:1800334673" }),
      linkRow("LGBTQIA+", "QLife 1800 184 527", { href: "tel:1800184527" }),
      linkRow("In danger right now", "Call 000", { href: "tel:000" }),
    ], "Daydeck is here to help you look after yourself. It isn't therapy."),
    group("About", [linkRow("How Daydeck works", null, { onclick: howItWorks }), linkRow("Your privacy", null, { href: "privacy.html" }), linkRow("Friends guidelines", null, { href: "guidelines.html" })]),
    deleteAll())));
  el.querySelector(".set-scroll").scrollTop = top;
}

// Your days: what matters to you and Crumbs (the things people come back to change).
function yourDays() {
  return group("Your days", [linkRow("Your pillars", pillarWords() || "Not chosen yet", { onclick: changePillars }), crumbsRow()],
    "Crumbs: tap how you feel as your day goes, then follow your crumbs back when you end your day.");
}
// Privacy and your data: where your things go.
function privacyData() {
  const pb = photoBackup.settingsGroup("parts"), n = photos.keys().length;
  const rows = [];
  if (account.signedIn() && document.body.classList.contains("friends-open")) rows.push(linkRow("Who can see you", "Friends", { onclick: friends.openPrivacy }));
  if (pb) rows.push(pb.row);
  rows.push(linkRow("Save a copy", null, { onclick: saveCopy }), linkRow("Restore from a file", null, { onclick: restore }));
  if (n) rows.push(linkRow("Save my photos", `${n}`, { onclick: savePhotos }));
  rows.push(testerRow(() => openTester(render)));
  const copy = " A copy is a file you keep wherever you like" + (n ? ", with your photos in it." : ".");
  const foot = pb ? h("p.set-foot", null, pb.foot, copy) : "Everything stays on this phone, unless you show a card you made to everyone." + copy;
  return group("Privacy and your data", rows, foot);
}
// Crumbs (js/crumbs.js, alex 2026-11-23): off unless chosen. Turning it off keeps crumbs already dropped.
function crumbsRow() {
  const sw = h("button.switch", { role: "switch", "aria-checked": String(crumbs.isOn()), "aria-label": "Crumbs" });
  sw.addEventListener("click", () => { const on = !crumbs.isOn(); crumbs.setOn(on, "settings"); sw.setAttribute("aria-checked", String(on)); });
  return h("div.set-row.set-toggle", null, h("span.set-label", null, "Crumbs"), sw);
}
function crumbsGroup() {
  const sw = h("button.switch", { role: "switch", "aria-checked": String(crumbs.isOn()), "aria-label": "Crumbs" });
  sw.addEventListener("click", () => { const on = !crumbs.isOn(); crumbs.setOn(on, "settings"); sw.setAttribute("aria-checked", String(on)); });
  return group("Crumbs", [h("div.set-row.set-toggle", null, h("span.set-label", null, "Crumbs"), sw)],
    "Tap how you feel as your day goes, then follow your crumbs back when you end your day. Turning it off keeps the ones you've dropped.");
}

// Choosing pillars happens over the sky, so Settings steps aside and comes back after.
function changePillars() {
  el.style.visibility = "hidden"; document.body.classList.remove("in-settings");
  setTimeout(() => pickPillars(() => { if (!el) return; el.style.visibility = ""; render(); requestAnimationFrame(() => document.body.classList.add("in-settings")); }), 200);
}

// Nudges: one for the start of your day, one for the end. Each can be on or off, at a time you choose.
function nudges() {
  const n = notify.prefs();
  const msg = h("p.set-foot");
  const say = () => {
    msg.textContent = notify.needsInstall() ? "On iPhone, add Daydeck to your Home Screen first (Share, then Add to Home Screen), then turn these on there."
      : !notify.supported() ? "This browser can't show notifications."
      : notify.blocked() ? "Notifications are switched off for Daydeck in your phone's Settings app." : "One gentle nudge each, skipped if you've already checked in. Card reminders come at lunch and after work, only if your card isn't done yet. Nothing you wrote is ever shown."
        + (friends.loaded() && account.signedIn() ? " When friends share, you'll see their name (at most once an hour, never at night). The number on the Daydeck icon is friend requests and new moments; turn it off in your phone's Settings, Notifications, Daydeck, Badges." : "");
  };
  const row = (key, label) => {
    const sw = h("button.switch", { role: "switch", "aria-checked": String(n[key].on), "aria-label": label });
    const time = h("input.time-pill", { type: "time", step: "300", value: n[key].t, "aria-label": `${label} time` });
    time.disabled = !n[key].on;
    sw.addEventListener("click", async () => {
      const on = !n[key].on;
      if (on && (!notify.supported() || Notification.permission !== "granted")) { const ok = await notify.enable(); say(); if (!ok) return; }
      n[key].on = on; sw.setAttribute("aria-checked", String(on)); time.disabled = !on; cardShow(); store.save(); notify.sync(); tester.log("nudge_" + key, on ? n[key].t : "off");
    });
    time.addEventListener("change", () => { if (time.value) { n[key].t = time.value; store.save(); notify.sync(); tester.log("nudge_" + key, time.value); } });
    return h("div.set-row.set-toggle", null, h("span.set-label", null, label), time, sw);
  };
  // Card reminders: on/off only. Times follow the day (see cardTimes in notify.js).
  // It only works alongside a morning or evening nudge, so it shows off (and can't be pressed) while both are off.
  const cardSw = h("button.switch", { role: "switch", "aria-label": "Card reminders" });
  const cardShow = () => { const can = n.am.on || n.pm.on; cardSw.disabled = !can; cardSw.setAttribute("aria-checked", String(can && n.card.on)); };
  cardSw.addEventListener("click", () => { n.card.on = !n.card.on; cardShow(); store.save(); notify.sync(); tester.log("nudge_card", n.card.on ? "on" : "off"); });
  cardShow();
  const cardRow = () => h("div.set-row.set-toggle", null, h("span.set-label", null, "Card reminders"), cardSw);
  say();
  // The wind-down nudge kept from the weekly wrapped shows here while it runs; switching it off stops it.
  const wind = deck.planItems().find((x) => x.kind === "nudge");
  const windRow = () => {
    const sw = h("button.switch", { role: "switch", "aria-checked": "true", "aria-label": "Wind-down nudge" });
    sw.addEventListener("click", () => { wind.off = true; store.save(); notify.sync(); tester.log("wrap_stop", "nudge"); sw.setAttribute("aria-checked", "false"); sw.disabled = true; });
    return h("div.set-row.set-toggle", null, h("span.set-label", null, "Wind-down nudge"), h("span.time-pill", { style: { opacity: ".7" } }, `until ${DAY_NAME[keyDate(store.get().wrap.plan.end).getDay()]}`), sw);
  };
  // Friend notifications (alex 2026-11-25): once Friends is open and ticked 18+. Off until switched on.
  const fd = friends.loaded(), friendRow = () => {
    const sw = h("button.switch", { role: "switch", "aria-checked": String(friends.pingsOn()), "aria-label": "When friends share" });
    sw.addEventListener("click", async () => {
      const on = !friends.pingsOn(); sw.disabled = true;
      await friends.setPings(on, "settings");
      sw.disabled = false; sw.setAttribute("aria-checked", String(friends.pingsOn())); say();
    });
    return h("div.set-row.set-toggle", null, h("span.set-label", null, "When friends share"), sw);
  };
  return group("Nudges", [row("am", "Start your day"), row("pm", "End your day"), cardRow()].concat(wind ? [windRow()] : [], fd && fd.me.adult && account.signedIn() ? [friendRow()] : []), msg);
}

// A copy of everything, as a file the person keeps, photos included (alex 2026-11-20). Tester details stay out of it.
async function saveCopy() {
  const data = Object.assign({}, store.get()); delete data.tester;
  const pics = picsReady || await photos.dump().catch(() => ({}));
  const blob = new Blob([JSON.stringify({ app: "daydeck", saved: dayKey(), data, photos: pics }, null, 1)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `Daydeck copy ${dayKey()}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  tester.log("save_copy", Object.keys(pics).length);
  gatherPics();
}

// Every photo of a card, out to the phone's share sheet ("Save Images" puts them in Photos).
async function savePhotos() {
  const files = await photos.files();
  if (!files.length) return;
  tester.log("photos_save", files.length);
  try {
    if (navigator.canShare && navigator.canShare({ files })) await navigator.share({ files });
    else for (const f of files) { const a = h("a", { href: URL.createObjectURL(f), download: f.name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  } catch { /* closed the share sheet */ }
}

function restore() {
  const pick = h("input", { type: "file", accept: ".json,application/json", style: { display: "none" } });
  pick.addEventListener("change", async () => {
    const f = pick.files[0]; pick.remove(); if (!f) return;
    let copy = null;
    try { const j = JSON.parse(await f.text()); if (j && j.app === "daydeck" && j.data && typeof j.data.days === "object") copy = j; } catch { /* not a copy */ }
    openSheet((panel, close) => {
      if (!copy) {
        panel.append(h("div.col", { style: { gap: "4px" } }, h("h2", null, "That file isn't a Daydeck copy"),
          h("p.sub", null, "Pick a file made with Save a copy. Nothing on this phone has changed.")),
          h("button.btn-main", { onclick: () => close("done") }, "Okay"));
        return;
      }
      const n = Object.keys(copy.data.days).length, np = Object.keys(copy.photos && typeof copy.photos === "object" ? copy.photos : {}).length;
      const holds = `${n} ${n === 1 ? "day" : "days"}` + (np ? ` and ${np} ${np === 1 ? "photo" : "photos"}` : "");
      panel.append(h("div.col", { style: { gap: "4px" } }, h("h2", null, "Restore this copy?"),
        h("p.sub", null, `It was saved on ${copy.saved} and holds ${holds}. It replaces what's on this phone now.`)),
        h("div.col", { style: { gap: "4px" } },
          h("button.btn-main", { onclick: async (e) => {
            e.currentTarget.disabled = true;
            const keep = store.get().tester;
            // Photos first: the copy's replace whatever pictures are on this phone now.
            let got = 0;
            if (np) { await photos.wipe(); got = await photos.load(copy.photos); }
            Object.assign(store.reset(), copy.data, { tester: keep }); store.save(); notify.sync(); tester.log("restore", got); gatherPics();
            close("done"); render();
          } }, "Restore"),
          h("button.btn-quiet", { onclick: () => close("no") }, "Not now")));
    }, { label: "Restore from a file" });
  });
  document.body.append(pick); pick.click();
}

function howItWorks() {
  openSheet((panel, close) => {
    panel.append(h("h2", null, "How Daydeck works"),
      h("div.col", { style: { gap: "8px" } },
        h("p", null, "Start your day by noting how you slept. End it by noting how the day felt."),
        h("p", null, "Your days shows how your days have gone, and what seems to go with the good ones."),
        h("p", null, "There's more to come, a little at a time. Everything stays on this phone, unless you choose to share it.")),
      h("button.btn-main", { onclick: () => close("done") }, "Done"));
  }, { label: "How Daydeck works" });
}

// Two taps, so it can't happen by accident. Deletes everything, everywhere:
// - this phone: Daydeck's entries, its saved notes (like when nudges arrived), and the old Intentionally app's
//   data and files, which live on the same site;
// - notifications: the service forgets this phone's nudge times, and the phone is signed out of notifications;
// - tester mode: what was shared is deleted. If the phone is offline, that part finishes next time it's online.
// - the card library: cards this phone showed to everyone are taken back out (also finishes later if offline).
function deleteAll() {
  let armed = false;
  const shared = !!(store.get().tester && store.get().tester.code), cards = !!(store.get().lib && Object.values(store.get().lib.shared || {}).some(Boolean));
  const b = h("button.set-row.set-danger", { onclick: async () => {
    if (!armed) { armed = true; b.textContent = "Tap again to delete everything"; return; }
    b.disabled = true; b.textContent = "Deleting…";
    const testerGone = await tester.forget(), cardsGone = await library.unshareAll(), allGone = testerGone && cardsGone;
    await notify.forget();
    await wipeOldApp();
    await photos.wipe();
    account.forgetHere();   // signed in: sign out on this phone only; the account and its backup are kept
    try { const keys = await caches.keys(); await Promise.all(keys.filter((k) => !k.startsWith("daydeck-")).map((k) => caches.delete(k))); } catch { /* nothing saved */ }
    store.reset();
    closeSettings();
    if (!allGone) setTimeout(() => openSheet((panel, close) => panel.append(
      h("div.col", { style: { gap: "4px" } }, h("h2", null, "Deleted from this phone"),
        h("p.sub", null, "What you shared will be deleted the next time you're online.")),
      h("button.btn-main", { onclick: () => close("done") }, "Okay")), { label: "Deleted" }), 450);
  } }, "Delete everything");
  return h("div.col", { style: { gap: "8px" } }, h("div.set-card", null, b),
    h("p.set-foot", null, shared
      ? `Removes everything Daydeck has kept on this phone, and everything you shared while testing (gone from backups within 30 days)${cards ? ", and takes your cards out of the library" : ""}. This can't be undone.${account.signedIn() ? " Your account's backup stays; delete your account to erase it." : ""}`
      : `Removes everything Daydeck has kept on this phone${cards ? ", and takes your cards out of the library" : ""}. This can't be undone.${account.signedIn() ? " Your account's backup stays; delete your account to erase it." : ""}`));
}

// The retired Intentionally app (and Daydeck's old /v2/ home) may have left data on this site: remove it too.
async function wipeOldApp() {
  try { localStorage.removeItem("intentionally"); } catch { /* storage blocked */ }
  try {
    for (const reg of await navigator.serviceWorker.getRegistrations()) if (reg.scope !== new URL("./", location.href).href) await reg.unregister();
  } catch { /* none */ }
}
