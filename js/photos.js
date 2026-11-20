// Photos of your daily card (alex 2026-11-18, thread "Add photos of your daily card").
// One photo a day, kept only on this phone. The pictures themselves are too big for the app's normal storage, so they
// live in the phone's bigger storage for websites (IndexedDB), next to it; the day only notes that it has one
// (d.ph = { w: card words on }). Nothing about the photo itself is kept (alex 2026-11-20): no place, time, phone or
// camera details, and no note of when it was taken or whether it came from the camera or the library. Pictures are
// re-drawn before saving (which shrinks them to card size), then clean() takes out every extra part of the file, so
// only the picture is left. Photos coming back from Restore, and every photo leaving the app, are cleaned the same
// way, and tidy() cleans photos saved before this. They never go to the tester service:
// tester mode only hears "a photo was added / removed", never the picture. Save a copy carries them in the file the
// person keeps, and Restore from a file puts them back (alex 2026-11-20).
import { h, dayKey, keyDate, addDays, DAY_NAME, MONTH, MOODS, MOOD_COL, reduceMotion, hoursWords, sleepMins } from "./util.js";
import * as store from "./store.js";
import * as deck from "./deck.js";
import { log } from "./tester.js";
import { openSheet, roundBtn } from "./ui.js";
import { HOW } from "./deck.js";

const DB = "daydeck-photos", OS = "p";
export const W = 1080, H = 1512, TW = 300, TH = 420;        // the card's shape, 5 by 7

// ---------------- Keeping the pictures ----------------
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(OS);
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(OS, mode), s = t.objectStore(OS), out = fn(s); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
const urls = new Map();   // day -> { thumb, full } object URLs, made once
function forget(k) { const u = urls.get(k); if (u) { u.thumb && URL.revokeObjectURL(u.thumb); u.full && URL.revokeObjectURL(u.full); urls.delete(k); } }

export const has = (k) => !!((store.get().days[k] || {}).ph);
// Every day with a photo, newest first.
export const keys = () => Object.keys(store.get().days).filter((k) => store.get().days[k].ph).sort().reverse();

// A picture's address for an <img>, or null. size: "thumb" (small, for lists) or "full".
export async function url(k, size = "thumb") {
  if (!has(k)) return null;
  const c = urls.get(k) || {};
  if (c[size]) return c[size];
  try {
    const rec = await tx("readonly", (s) => s.get(k));
    if (!rec || !rec[size]) return null;
    c[size] = URL.createObjectURL(rec[size]); urls.set(k, c);
    return c[size];
  } catch { return null; }
}
// Fill an <img> once its picture is ready.
export function img(k, size = "thumb", attrs = {}) {
  const el = h("img", Object.assign({ alt: "", decoding: "async", draggable: "false" }, attrs));
  url(k, size).then((u) => { if (u) el.src = u; });
  return el;
}

// Draw any picture (camera frame, photo from the phone) as the card's shape, cropped from the middle.
export function toCard(src, sw, sh, { mirror = false, w = W, hh = H } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = hh;
  const g = c.getContext("2d"), r = w / hh;
  let cw = sw, ch = sw / r; if (ch > sh) { ch = sh; cw = sh * r; }
  if (mirror) { g.translate(w, 0); g.scale(-1, 1); }
  g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, hh);
  return c;
}
const blob = (c, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("no picture"))), "image/jpeg", q)).then(clean).then((b) => b || Promise.reject(new Error("no picture")));

// A JPEG file is the picture plus optional extra parts: location, date, phone and camera details, comments, previews.
// clean() rebuilds the file from the picture parts alone and drops every extra one (APP0 to APP15 and comments).
// Returns null if it isn't a JPEG picture at all.
export async function clean(b) {
  try {
    const a = new Uint8Array(await b.arrayBuffer());
    if (a.length < 4 || a[0] !== 0xff || a[1] !== 0xd8) return null;
    const out = [a.subarray(0, 2)];
    let i = 2;
    while (i + 4 <= a.length) {
      if (a[i] !== 0xff) return null;
      const m = a[i + 1];
      if (m === 0xff) { i++; continue; }                                    // padding
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m === 0xd9) break;
      const len = (a[i + 2] << 8) | a[i + 3];
      if (len < 2 || i + 2 + len > a.length) return null;
      const extra = (m >= 0xe0 && m <= 0xef) || m === 0xfe;
      if (m === 0xda) { out.push(a.subarray(i)); return new Blob(out, { type: "image/jpeg" }); }   // the picture itself, to the end
      if (!extra) out.push(a.subarray(i, i + 2 + len));
      i += 2 + len;
    }
    return null;
  } catch { return null; }
}

// Save the day's photo. canvas = the full picture (W by H). Asks the phone to keep Daydeck's storage, the first time.
export async function save(k, canvas, { src = "cam", words = true } = {}) {
  const full = await blob(canvas, 0.82);
  const small = document.createElement("canvas"); small.width = TW; small.height = TH; small.getContext("2d").drawImage(canvas, 0, 0, TW, TH);
  const thumb = await blob(small, 0.78);
  await tx("readwrite", (s) => s.put({ full, thumb }, k));
  forget(k);
  const d = store.day(k), had = !!d.ph;
  d.ph = { w: words ? 1 : 0 };
  store.save();
  log(had ? "photo_change" : "photo_add", src);
  keep();
  return true;
}
export async function remove(k) {
  try { await tx("readwrite", (s) => s.delete(k)); } catch { /* already gone */ }
  forget(k);
  const d = store.get().days[k]; if (d) { delete d.ph; store.save(); }
  log("photo_remove");
}
export function setWords(k, on) { const d = store.get().days[k]; if (d && d.ph) { d.ph.w = on ? 1 : 0; store.save(); log("photo_words", on ? "on" : "off"); } }
// "Delete everything": the whole picture store goes.
export async function wipe() {
  urls.forEach((_, k) => forget(k));
  try { if (dbp) (await dbp).close(); } catch { /* not open */ }
  dbp = null;
  await new Promise((res) => { try { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch { res(); } });
}
// Once: clean photos saved before clean() existed, and drop the old notes about them (when, camera or library).
export async function tidy() {
  const st = store.get(); st.ph = st.ph || {};
  if (st.ph.clean) return;
  Object.values(st.days).forEach((d) => { if (d.ph && ("at" in d.ph || "src" in d.ph)) { d.ph = { w: d.ph.w ? 1 : 0 }; } });
  try {
    for (const k of keys()) {
      const rec = await tx("readonly", (s) => s.get(k));
      if (!rec || !rec.full) continue;
      const full = await clean(rec.full), thumb = rec.thumb ? await clean(rec.thumb) : null;
      if (full) await tx("readwrite", (s) => s.put({ full, thumb: thumb || full }, k));
    }
  } catch { return; }   // try again next time
  st.ph.clean = 1; store.save();
  [...urls.keys()].forEach(forget);
}
// iPhone may clear a website's storage when space runs low; this asks it to keep Daydeck's (once is enough).
function keep() {
  const st = store.get(); st.ph = st.ph || {};
  if (st.ph.kept) return;
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist().then((ok) => { st.ph.kept = ok ? 1 : 0; store.save(); log("photo_keep", ok ? "yes" : "no"); }); } catch { /* not offered */ }
}
// Every photo as a file, for "Save my photos" in Settings.
export async function files() {
  const out = [];
  for (const k of keys()) {
    try { const rec = await tx("readonly", (s) => s.get(k)); const pic = rec && rec.full && await clean(rec.full); if (pic) out.push(new File([pic], `Daydeck ${k}.jpg`, { type: "image/jpeg" })); } catch { /* skip */ }
  }
  return out;
}
// Every photo, written out as text, for "Save a copy" (alex 2026-11-20): day -> { full, thumb }.
const toText = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
export async function dump() {
  const out = {};
  for (const k of keys()) {
    try {
      const rec = await tx("readonly", (s) => s.get(k)), full = rec && rec.full && await clean(rec.full);
      if (full) out[k] = { full: await toText(full), thumb: await toText((rec.thumb && await clean(rec.thumb)) || full) };
    } catch { /* skip */ }
  }
  return out;
}
// "Restore from a file": put a copy's photos back. Anything that isn't a day and a JPEG picture is ignored.
const JPEG = "data:image/jpeg;base64,";
const fromText = (t) => { const bin = atob(t.slice(JPEG.length)), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: "image/jpeg" }); };
export async function load(all) {
  let n = 0;
  for (const [k, rec] of Object.entries(all && typeof all === "object" ? all : {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !rec || typeof rec.full !== "string" || !rec.full.startsWith(JPEG)) continue;
    try {
      const full = await clean(fromText(rec.full));
      if (!full) continue;
      const thumb = (typeof rec.thumb === "string" && rec.thumb.startsWith(JPEG) && await clean(fromText(rec.thumb))) || full;
      await tx("readwrite", (s) => s.put({ full, thumb }, k)); n++;
    } catch { /* skip a broken one */ }
  }
  if (n) keep();
  return n;
}

async function shareOne(k) {
  try {
    const rec = await tx("readonly", (s) => s.get(k)), f = new File([await clean(rec.full)], `Daydeck ${k}.jpg`, { type: "image/jpeg" });
    log("photo_share");
    if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f] });
    else { const a = h("a", { href: URL.createObjectURL(f), download: f.name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  } catch { /* closed the share sheet */ }
}

// ---------------- Showing them ----------------
const shortDay = (k) => { const d = keyDate(k); return `${DAY_NAME[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTH[d.getMonth()]}`; };
const longDay = (k) => { const d = keyDate(k); return `${DAY_NAME[d.getDay()]} ${d.getDate()} ${MONTH_LONG[d.getMonth()]}`; };
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayWord = (m) => `${/^[AEIOU]/.test(MOODS[m]) ? "An" : "A"} ${MOODS[m].toLowerCase()} day`;
const cardOf = (k) => { const d = store.get().days[k] || {}; return d.card && d.card.id ? deck.card(d.card.id) : null; };

// The card's words as a layer over a photo: pillar and date, then the task. Never part of the picture itself.
export function words(k) {
  const c = cardOf(k);
  if (!c) return null;
  return h("div.ph-words", { "aria-hidden": "true" },
    h("span.ph-tag", null, h("i", { style: { background: deck.PILLAR_COL[c.pillar] || "#a9a59d" } }), `${c.pillar} · ${shortDay(k)}`),
    h("span.ph-task", null, c.text));
}

// The back of today's card on home: the photo, with the card's words if they're on.
export function fillBack(back, k, { develop = false } = {}) {
  back.classList.add("ph-back");
  const pic = img(k, "full", { class: develop && !reduceMotion() ? "develop" : "" });
  back.replaceChildren(pic, (store.get().days[k].ph || {}).w ? words(k) || "" : "");
}

// ---------------- Your photos: a page from home, zoomed by Week, Month or Year like Apple Photos ----------------
let page = null, onClosedP = null, view = "week";
const VIEWS = ["week", "month", "year"];
export function openPhotos(closed) {
  onClosedP = closed; log("photos_open");
  const st = store.get(); view = (st.ph && st.ph.view) || "week";
  page = h("div", { id: "photos", role: "dialog", "aria-modal": "true", "aria-label": "Your photos" });
  page.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.querySelector(".ph-viewer")) closePhotos(); });
  document.body.append(page);
  draw();
  requestAnimationFrame(() => requestAnimationFrame(() => { document.body.classList.add("in-photos"); page.querySelector(".round")?.focus({ preventScroll: true }); }));
  edgeSwipe(page, closePhotos);
  pinch(page.querySelector(".ph-scroll"));
}
function closePhotos() {
  if (!page) return;
  const p = page; page = null;
  document.body.classList.remove("in-photos");
  setTimeout(() => p.remove(), reduceMotion() ? 160 : 420);
  onClosedP && onClosedP();
}
function edgeSwipe(el, close) {
  let x0 = null, dx = 0;
  el.addEventListener("pointerdown", (e) => { if (e.clientX < 28 && e.pointerType !== "mouse") { x0 = e.clientX; dx = 0; el.setPointerCapture(e.pointerId); el.style.transition = "none"; } });
  el.addEventListener("pointermove", (e) => { if (x0 == null) return; dx = Math.max(0, e.clientX - x0); el.style.transform = `translateX(${dx}px)`; });
  const up = () => { if (x0 == null) return; x0 = null; el.style.transition = ""; el.style.transform = ""; if (dx > innerWidth * 0.33) close(); };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
}
// Two fingers: pinch in to zoom out a step (Week -> Month -> Year), spread to zoom back in.
function pinch(sc) {
  let d0 = 0, done = false;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  sc.addEventListener("touchstart", (e) => { if (e.touches.length === 2) { d0 = dist(e.touches); done = false; } }, { passive: true });
  sc.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 2 || !d0 || done) return;
    e.preventDefault();
    const r = dist(e.touches) / d0, i = VIEWS.indexOf(view);
    if (r < 0.75 && i < 2) { done = true; setView(VIEWS[i + 1], "pinch"); }
    else if (r > 1.33 && i > 0) { done = true; setView(VIEWS[i - 1], "pinch"); }
  }, { passive: false });
  sc.addEventListener("touchend", () => { d0 = 0; });
  // Safari's own pinch events (stop the whole page zooming instead).
  sc.addEventListener("gesturestart", (e) => e.preventDefault());
}
function setView(v, how, toMonth) {
  if (v === view && !toMonth) return;
  view = v; const st = store.get(); st.ph = st.ph || {}; st.ph.view = v; store.save();
  log("photos_view", { v, how });
  draw(toMonth);
}
const weekStart = (k) => addDays(k, -((keyDate(k).getDay() + 6) % 7));
function weekLabel(w) {
  const now = weekStart(dayKey());
  if (w === now) return ["This week", ""];
  if (w === addDays(now, -7)) return ["Last week", ""];
  const a = keyDate(w), b = keyDate(addDays(w, 6));
  return [a.getMonth() === b.getMonth() ? `${a.getDate()} to ${b.getDate()} ${MONTH[b.getMonth()]}` : `${a.getDate()} ${MONTH[a.getMonth()]} to ${b.getDate()} ${MONTH[b.getMonth()]}`, ""];
}
const monthKey = (k) => k.slice(0, 7);
const monthName = (m) => { const [y, mo] = m.split("-").map(Number); return MONTH_LONG[mo - 1] + (y !== keyDate(dayKey()).getFullYear() ? ` ${y}` : ""); };
function groups(list, by) { const g = new Map(); list.forEach((k) => { const key = by(k); if (!g.has(key)) g.set(key, []); g.get(key).push(k); }); return [...g.entries()]; }

function draw(toMonth) {
  if (!page) return;
  const list = keys();
  const seg = h("div.seg", { role: "tablist", "aria-label": "Zoom" }, VIEWS.map((v) => h("button", { role: "tab", "aria-selected": String(v === view), onclick: () => setView(v, "tap") }, v[0].toUpperCase() + v.slice(1))));
  let body;
  if (!list.length) body = h("div.ph-empty", null, h("p", null, "Your photos will show here."), h("p.sub", null, "After you do your card, tap Add a photo, or the camera on the card while you're doing it."));
  else if (view === "week") body = groups(list, weekStart).map(([w, ks]) => sec(weekLabel(w)[0], h("div.ph-grid.wk", null, ks.map((k) => tile(k, list, true)))));
  else if (view === "month") body = groups(list, monthKey).map(([m, ks]) => sec(monthName(m), h("div.ph-grid.mo", null, ks.map((k) => tile(k, list))), m));
  else body = groups(list, (k) => k.slice(0, 4)).map(([y, ks]) => h("section.ph-year", null, h("h2.ph-y", null, y),
    groups(ks, monthKey).map(([m, mk]) => h("div.ph-ymonth", null,
      h("button.ph-mlabel", { onclick: () => setView("month", "month_tap", m) }, MONTH_LONG[Number(m.slice(5)) - 1]),
      h("div.ph-grid.yr", null, mk.map((k) => tile(k, list)))))));
  const sc = page.querySelector(".ph-scroll") || h("div.ph-scroll");
  sc.replaceChildren(h("div.ph-page", null,
    h("div.col", { style: { gap: "8px" } }, roundBtn("back", "Back to home", closePhotos), h("h1.big-title", null, "Your photos")),
    list.length ? seg : null, body));
  if (!sc.isConnected) page.append(sc);
  sc.scrollTop = 0;
  if (toMonth) { const s = sc.querySelector(`[data-m="${toMonth}"]`); if (s) s.scrollIntoView({ block: "start" }); }
}
const sec = (title, grid, m) => h("section.ph-sec", m ? { "data-m": m } : null, h("h2.ph-h", null, title), grid);
function tile(k, list, label) {
  const c = cardOf(k);
  const b = h("button.ph-tile", { "aria-label": `${longDay(k)}${c ? `, ${c.pillar}` : ""}. Open the photo.`, onclick: () => openViewer(k, list, () => draw()) },
    h("span.ph-frame", null, img(k, "thumb", { loading: "lazy" })));
  if (label) b.append(h("span.ph-day", null, h("i", { style: { background: c ? deck.PILLAR_COL[c.pillar] || "#a9a59d" : "transparent" } }), DAY_NAME[keyDate(k).getDay()].slice(0, 3)));
  return b;
}

// ---------------- One photo: the picture first, the day in a bar that slides up (alex 2026-11-18, E) ----------------
export function openViewer(k, list = keys(), changed) {
  log("photo_open");
  let i = Math.max(0, list.indexOf(k)), open = false;
  const host = h("div.ph-viewer", { role: "dialog", "aria-modal": "true", "aria-label": "Photo" });
  const pic = h("div.ph-pic"), bar = h("div.ph-bar"), grab = h("span.grabber", { "aria-hidden": "true" });
  const close = () => { host.classList.remove("in"); setTimeout(() => host.remove(), reduceMotion() ? 0 : 300); changed && changed(); };
  const more = h("button.round.ph-glass", { "aria-label": "More", onclick: () => moreSheet() }, h("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true" }, h("circle", { cx: "6", cy: "12", r: "1.8" }), h("circle", { cx: "12", cy: "12", r: "1.8" }), h("circle", { cx: "18", cy: "12", r: "1.8" })));
  const share = h("button.round.ph-glass", { "aria-label": "Share", onclick: () => shareOne(list[i]) }, h("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, h("path", { d: "M12 15V4M8 7.5L12 4l4 3.5" }), h("path", { d: "M6 11v7.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V11" })));
  const x = roundBtn("close", "Close", close); x.classList.add("ph-glass");
  host.append(pic, h("div.ph-top", null, x, h("div", { style: { display: "flex", gap: "8px" } }, share, more)), bar);
  const setOpen = (v) => { open = v; host.classList.toggle("open", v); bar.setAttribute("aria-expanded", String(v)); if (v) log("photo_info"); };
  function show() {
    const k2 = list[i], d = store.get().days[k2] || {}, c = cardOf(k2);
    pic.replaceChildren(img(k2, "full", { alt: c ? `Photo for ${c.text}` : "Photo" }));
    const rows = [];
    if (c) rows.push(h("div.ph-row.cd", null, h("span.ph-lab", null, h("i", { style: { background: deck.PILLAR_COL[c.pillar] || "#a9a59d" } }), `Your card · ${c.pillar}`), h("span.ph-val", null, c.text)));
    if (d.card && d.card.felt && d.card.felt.length) rows.push(row(ICO.heart, "Doing it felt", d.card.felt.join(", "), "var(--gold)"));
    else if (d.card && d.card.how != null) rows.push(row(ICO.heart, "Doing it felt", HOW[d.card.how], "var(--gold)"));
    if (d.feel && d.feel.length) rows.push(row(ICO.sun, "You felt", d.feel.join(", ").toLowerCase()));
    if (d.sleep) rows.push(row(ICO.moon, "The night before", hours(d.sleep)));
    if (c && c.why) {
      const why = h("p.ph-why", { hidden: true }, c.why.replace(/\.\s*$/, "") + "." + (c.source ? ` ${c.source}.` : ""));
      const btn = h("button.ph-whybtn", { "aria-expanded": "false", onclick: () => { why.hidden = !why.hidden; btn.setAttribute("aria-expanded", String(!why.hidden)); btn.lastChild.textContent = why.hidden ? "›" : "⌄"; } }, h("span", null, "Why this card helps"), h("span", { "aria-hidden": "true" }, "›"));
      rows.push(h("div.col", null, btn, why));
    }
    bar.replaceChildren(grab,
      h("button.ph-head", { onclick: () => setOpen(!open), "aria-label": open ? "Hide the day" : "Show the day" },
        d.mood != null ? h("span.ph-mood", { style: { color: MOOD_COL[d.mood] } }, dayWord(d.mood)) : h("span.ph-mood", null, longDay(k2)),
        d.mood != null ? h("span.ph-date", null, longDay(k2)) : null),
      h("div.ph-more", null, h("div.ph-line"), rows));
  }
  function row(ic, l, v, col) { return h("div.ph-row", null, h("span.ph-ico", null, ic()), h("div.col", null, h("span.ph-lab", null, l), h("span.ph-val", { style: col ? { color: col } : null }, v))); }
  // Swipe the bar up (or tap it) for the day, down to go back to the photo; swipe the photo sideways for the next one.
  let y0 = null, x0 = null;
  host.addEventListener("pointerdown", (e) => { if (e.target.closest("button:not(.ph-head)")) return; y0 = e.clientY; x0 = e.clientX; });
  host.addEventListener("pointerup", (e) => {
    if (y0 == null) return; const dy = e.clientY - y0, dx = e.clientX - x0; y0 = x0 = null;
    if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx)) { if (dy < 0 && !open) setOpen(true); else if (dy > 0 && open) setOpen(false); else if (dy > 0 && !open) close(); }
    else if (Math.abs(dx) > 50 && !open) { const j = i + (dx < 0 ? 1 : -1); if (j >= 0 && j < list.length) { i = j; show(); } }
  });
  host.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); if (e.key === "ArrowRight" && i < list.length - 1) { i++; show(); } if (e.key === "ArrowLeft" && i > 0) { i--; show(); } });
  function moreSheet() {
    const k2 = list[i];
    openSheet((panel, closeS) => {
      let armed = false;
      const rm = h("button.btn-soft", { style: { minHeight: "52px" }, onclick: async () => {
        if (!armed) { armed = true; rm.textContent = "Tap again to remove it"; return; }
        await remove(k2); closeS("done");
        list.splice(i, 1); if (!list.length) return close();
        i = Math.min(i, list.length - 1); show();
      } }, "Remove photo");
      const d = store.get().days[k2] || {};
      const sw = h("button.switch", { role: "switch", "aria-checked": String(!!(d.ph && d.ph.w)), "aria-label": "Card words on the card" });
      const wrow = h("button.set-row.set-toggle", { style: { borderRadius: "16px", background: "var(--fill2)" }, onclick: () => { const on = sw.getAttribute("aria-checked") !== "true"; sw.setAttribute("aria-checked", String(on)); setWords(k2, on); } }, h("span.set-label", null, "Card words on the card"), sw);
      panel.append(h("h2", null, longDay(k2)), wrow,
        h("button.btn-soft", { style: { minHeight: "52px" }, onclick: () => { closeS("change"); setTimeout(() => import("./camera.js").then((m) => m.openCamera(k2, { onSaved: () => show() })), 300); } }, "Change photo"),
        rm);
    }, { label: "Photo options" });
  }
  show();
  document.body.append(host);
  requestAnimationFrame(() => requestAnimationFrame(() => host.classList.add("in")));
  x.focus({ preventScroll: true });
}
const hours = (s) => hoursWords(sleepMins(s));
const svg = (...kids) => () => h("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, ...kids.map(([t, a]) => h(t, a)));
const ICO = {
  heart: svg(["path", { d: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" }]),
  sun: svg(["circle", { cx: "12", cy: "12", r: "4" }], ["path", { d: "M12 3v2M12 19v2M3 12h2M19 12h2" }]),
  moon: svg(["path", { d: "M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" }]),
};

// ---------------- "Add a photo" under today's card ----------------
export const camIcon = () => h("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
  h("path", { d: "M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" }), h("circle", { cx: "12", cy: "12.5", r: "3.2" }));
// Offered after "I did it", never on Food cards (meals shouldn't turn into food logging). If the last three days it
// was offered all went without a photo, it stops offering; the small camera on the card is always there.
export function offerOK(k) {
  const d = store.get().days[k] || {}, c = cardOf(k);
  if (!c || c.pillar === "Food" || d.ph) return false;
  if (d.phOff) return true;   // already offered today: keep it there
  const past = Object.keys(store.get().days).filter((x) => x < k && store.get().days[x].phOff).sort().slice(-3);
  return !(past.length === 3 && past.every((x) => !store.get().days[x].ph));
}
export function offered(k) { const d = store.day(k); if (!d.phOff) { d.phOff = 1; store.save(); log("photo_offer"); } }

// The first photo ever: one note about where photos live (alex 2026-11-18).
export function firstNote() {
  const st = store.get(); st.ph = st.ph || {};
  if (st.ph.noted) return;
  st.ph.noted = 1; store.save();
  openSheet((panel, close) => {
    panel.append(
      h("h2", null, "Your photos stay on this phone"),
      h("p.update-text", null, "They're never sent anywhere. If you delete Daydeck, they go with it."),
      h("p.update-text", null, "Keep Daydeck on your Home Screen so your iPhone keeps them safe. Settings has Save my photos if you want copies."),
      h("button.btn-main", { onclick: () => close("done") }, "Got it"));
  }, { label: "Your photos" });
}
