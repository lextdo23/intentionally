// Photo backup (alex 2026-11-20/21; CLAUDE.md "Accounts"). For people with an account, each day's photo (and a
// profile photo) goes up to their own private store a little after it's taken, whenever they're online, so a new
// phone gets them back. Only they can see them. Every photo is cleaned first (photos.js clean(): nothing but the
// picture) and sent smaller (900 by 1260). A new phone fetches each picture the first time it's shown.
// Settings → Photos → "Back up my photos" turns it off (and deletes the copies in the account); photos always stay
// on the phone either way. Limits live in the service (push/photos.js): 25 a day, older photos catch up gently.
//
// What's kept on this phone, under the app's own "ph" settings (never in the days backup): backup on or off, photos
// waiting to be deleted from the account, and when to try again after a limit.
import { h } from "./util.js";
import * as store from "./store.js";
import * as account from "./account.js";
import * as photos from "./photos.js";
import * as sync from "./sync.js";
import { openSheet } from "./ui.js";
import { log } from "./tester.js";

const W = 900, H = 1260, Q = 0.74;
const st = () => { const s = store.get(); s.ph = s.ph || {}; return s.ph; };
export const on = () => account.signedIn() && st().backup !== false;
let timer = 0, running = false;

// Waiting to go up: days with a photo on this phone that isn't backed up yet, newest first.
const waiting = () => Object.keys(store.get().days || {}).filter((k) => { const p = store.get().days[k].ph; return p && !p.b; }).sort().reverse();
export const counts = () => { const days = store.get().days || {}; const all = Object.keys(days).filter((k) => days[k].ph); return { all: all.length, up: all.filter((k) => days[k].ph.b).length }; };

// A data address (the profile photo) as a picture, without fetch (the page's safety rules only allow fetching the service).
function dataBlob(d) {
  if (typeof d !== "string" || !d.startsWith("data:image/jpeg;base64,")) return null;
  try { const t = atob(d.slice(23)), a = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i); return new Blob([a], { type: "image/jpeg" }); } catch { return null; }
}
function soon(ms = 4000) { clearTimeout(timer); timer = setTimeout(run, ms); }
async function shrink(b) {
  const u = URL.createObjectURL(b), im = new Image(); im.src = u;
  try { await im.decode(); } catch { URL.revokeObjectURL(u); return null; }
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  c.getContext("2d").drawImage(im, 0, 0, W, H); URL.revokeObjectURL(u);
  const out = await new Promise((res) => c.toBlob(res, "image/jpeg", Q));
  return out && await photos.clean(out);
}
async function send(k, b) {
  const small = await shrink(b);
  if (!small) return { error: "bad_photo" };
  const r = await account.raw("/a/p/" + k, { method: "POST", body: small, type: "image/jpeg" });
  if (!r) return { error: "offline" };
  return r.json().catch(() => ({ error: "bad" }));
}

// One pass: deletions first, then photos waiting, one at a time. Stops for the day at a limit; tries again later.
export async function run() {
  if (running || !on() || !navigator.onLine) return;
  const s = st();
  if (s.until && Date.now() < s.until) return soon(s.until - Date.now() + 1000);
  running = true;
  try {
    for (const k of (s.del || []).slice()) {
      const r = await account.raw("/a/p/del/" + k, { method: "POST", body: "{}", type: "application/json" });
      if (!r) return;
      s.del = (s.del || []).filter((x) => x !== k); store.save();
    }
    if (s.pic === "up") {
      const data = account.photoPic();
      if (data) { const b = dataBlob(data); const r = b ? await send("profile", b) : { error: "bad_photo" }; if (r.ok) { s.pic = "done"; store.save(); } else if (r.error === "offline") return; }
      else { s.pic = "done"; store.save(); }
    }
    for (const k of waiting()) {
      const b = await photos.fullBlob(k);
      if (!b) continue;
      const r = await send(k, b);
      if (r.ok) { const d = store.get().days[k]; if (d && d.ph) { d.ph.b = 1; d.ph.v = r.v; store.save(); } log("photo_backed", 1); continue; }
      if (r.error === "offline") return;
      if (r.error === "daily_limit" || r.error === "photos_full" || r.error === "photos_off") { s.until = Date.now() + (r.error === "daily_limit" ? 6 : 24) * 3600e3; store.save(); log("photo_backup_wait", r.error); return soon(s.until - Date.now() + 1000); }
      if (r.error === "signed_out") return;
    }
  } finally { running = false; }
}

// A new phone: fetch a backed-up picture the first time it's shown.
async function fetchOne(k) {
  if (!account.signedIn()) return null;
  const r = await account.raw("/a/p/" + k);
  if (!r || !r.ok) return null;
  const b = await r.blob();
  return b.size ? b : null;
}

// After signing in on a new phone: bring back the profile photo, if there is one and this phone has none.
async function restoreProfile() {
  if (account.photoPic()) return;
  const r = await account.raw("/a/p");
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  if (!j || !Array.isArray(j.photos) || !j.photos.some((p) => p.k === "profile")) return;
  const b = await fetchOne("profile");
  if (!b) return;
  const data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); });
  if (data && data.startsWith("data:image/jpeg;base64,")) account.restorePhotoPic(data);
}

export function start(redraw) {
  photos.plug({
    saved: () => soon(),
    removed: (k, wasUp) => { if (wasUp) { const s = st(); s.del = [...new Set((s.del || []).concat(k))]; store.save(); } soon(); },
    fetch: (k) => fetchOne(k),
    backedUp: () => on(),
  });
  sync.onPhotoGone((k) => { photos.drop(k); });
  account.onAccount((what) => {
    if (what === "in") { st().until = 0; st().pic = account.photoPic() ? "up" : st().pic; store.save(); restoreProfile().then(() => redraw && redraw()); soon(2000); }
    if (what === "pic") { if (account.photoPic()) st().pic = "up"; else if (st().pic === "done") { st().del = [...new Set((st().del || []).concat("profile"))]; st().pic = ""; } store.save(); soon(); }
  });
  addEventListener("online", () => soon(1500));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") soon(3000); });
  soon(6000);
  setTimeout(() => tellOnce(), 9000);
}

// ---------------- Telling people (a big change gets a note in the app) ----------------
// Once, for people with an account who already have photos: their photos now back up too, with a way to say no.
function tellOnce() {
  const s = st();
  if (s.told || !account.signedIn() || !counts().all) return;
  if (document.querySelector(".sheet-host") || ["in-flow", "in-ask", "in-acct", "in-wrap", "in-photos", "in-cards", "in-levels", "in-settings", "in-fpage"].some((c) => document.body.classList.contains(c))) return setTimeout(tellOnce, 20000);
  s.told = 1; store.save(); log("photo_backup_note", 1);
  openSheet((panel, close) => {
    panel.append(h("h2", null, "Your photos are backed up now"),
      h("p.update-text", null, "Each day's photo now goes to your account too, so a new phone gets them back. Only you can see them, and nothing is kept but the picture itself."),
      h("p.update-text", null, "You can turn this off any time in Settings."),
      h("p.update-from", null, "From Alex"),
      h("button.btn-main", { onclick: () => close("done") }, "Sounds good"),
      h("button.btn-quiet", { onclick: () => { close("off"); setTimeout(() => turnOff(), 300); } }, "Turn it off"));
  }, { label: "Your photos are backed up now" });
}

// Settings → Photos: the switch, and where things are up to.
export function settingsGroup(group) {
  if (!account.signedIn()) return null;
  const c = counts(), isOn = st().backup !== false;
  const sw = h("button.switch", { type: "button", role: "switch", "aria-checked": String(isOn), "aria-label": "Back up my photos" });
  sw.addEventListener("click", () => { if (sw.getAttribute("aria-checked") === "true") turnOff(() => { sw.setAttribute("aria-checked", st().backup === false ? "false" : "true"); foot.textContent = words(); }); else { st().backup = true; st().until = 0; store.save(); sw.setAttribute("aria-checked", "true"); log("photo_backup", "on"); soon(500); foot.textContent = words(); } });
  const words = () => st().backup === false ? "Photos stay on this phone only. If you lose or change phones, they don't come back."
    : c.all ? `${c.up} of ${c.all} photos backed up. Only you can see them; nothing is kept but the picture.` : "Each day's photo backs up to your account. Only you can see them; nothing is kept but the picture.";
  const foot = h("p.set-foot", null, words());
  return group("Photos", [h("div.set-row.set-toggle", null, h("span.set-label", null, "Back up my photos"), sw)], foot);
}
function turnOff(done) {
  openSheet((panel, close) => {
    const go = h("button.btn-main", { onclick: async () => {
      go.setAttribute("aria-busy", "true");
      const r = await account.raw("/a/p/del/*", { method: "POST", body: "{}", type: "application/json" });
      if (!r || !r.ok) { go.removeAttribute("aria-busy"); go.textContent = "Couldn't reach Daydeck. Try again"; return; }
      st().backup = false; st().del = []; st().pic = "";
      Object.values(store.get().days || {}).forEach((d) => { if (d.ph) delete d.ph.b; });
      store.save(); log("photo_backup", "off"); close("done"); done && done();
    } }, "Turn off and delete copies");
    panel.append(h("h2", null, "Turn off photo backup?"),
      h("p.update-text", null, "Your photos stay on this phone. The copies in your account are deleted, so a new phone won't get them back."),
      go, h("button.btn-quiet", { onclick: () => { close("cancel"); done && done(); } }, "Keep backing up"));
  }, { label: "Turn off photo backup?" });
}
