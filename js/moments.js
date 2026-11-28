// Moments (social stage 1, step 3; alex 2026-11-20/21, CLAUDE.md "Social"). Nothing is ever shared automatically:
// "Share a moment" (in the pill on Friends and You, or "Share with friends" under a done card) picks a day from the
// last five, then what to share from it (the day's card, a card you made, or a rest day), adds your own words if you
// like, and how the day felt only if you choose (a mood word and feelings, never numbers; Privacy → "Share my mood"
// only starts that switch on). Friends see moments in their feed, newest first, ending "You're all caught up.",
// and on your profile as a 3-across grid; tapping a tile opens the moments as a feed from that one.
// "I see you" is the one reaction, never counted: faces and names only.
// Photos first (alex 2026-11-21): a day's photo is offered first, and the card's words when there's no photo. The
// day row starts big (pick a day by its photo), shrinks once one is picked or the page scrolls, and grows again
// when tapped. A shared photo is shrunk and cleaned on the phone (nothing but the picture) before it's sent.
//
// The words and card go to the service only when shared (push/friends.js). Tester mode hears only what kind of thing
// was shared and whether words or a mood came with it, never the words.
import { h, MOODS, dayKey, addDays, DAY_NAME, MONTH, keyDate, reduceMotion } from "./util.js";
import { now } from "./clock.js";
import * as store from "./store.js";
import * as deck from "./deck.js";
import { openSheet } from "./ui.js";
import { log } from "./tester.js";
import * as account from "./account.js";
import * as friends from "./friends.js";
import * as photos from "./photos.js";
import { inUse } from "./looks.js";
import * as comments from "./comments.js";
import { openCamera, loadPhoto } from "./camera.js";

const TINTS = ["#d9b3a6", "#cfc59b", "#a9c4b5", "#a9b9d6", "#c4b4c9", "#a9c9cf"];
const LKEY = "daydeck-friends";
const local = () => { try { return JSON.parse(localStorage.getItem(LKEY)) || {}; } catch { return {}; } };
const setLocal = (k, v) => { const l = local(); l[k] = v; try { localStorage.setItem(LKEY, JSON.stringify(l)); } catch { /* full */ } };
// Privacy → "Share my mood": off by default; it only decides how the switch starts each time.
export const moodOn = () => !!local().mood;
export const setMood = (on) => setLocal("mood", !!on);

// ---------------- What a day has to share ----------------
const moodWord = (m) => (m == null ? null : MOODS[m].toLowerCase());
export function dayItems(k) {
  const d = (store.get().days || {})[k] || {}, out = [];
  const dc = d.card && d.card.id != null ? deck.card(d.card.id) : null;
  // The card that goes behind a shared photo (alex 2026-11-25): the day's card once it's done or answered, else a card they made that day.
  const doneCard = dc && (d.card.done || d.card.how >= 1) ? dc : null;
  const ownCard = (d.made || []).map((id) => deck.card(id)).find(Boolean) || null;
  const back = doneCard || ownCard ? { text: (doneCard || ownCard).text, pillar: (doneCard || ownCard).pillar } : null;
  if (photos.has(k)) out.push({ item: "photo", kind: "photo", text: "", pillar: dc ? dc.pillar : "", status: "", label: "Your photo", photoDay: k, back });
  if (d.rest) out.push({ item: "rest", kind: "rest", text: "", pillar: "", status: "Rested", label: "Your rest day" });
  else if (d.card && d.card.id != null && (d.card.done || d.card.how >= 1)) {
    const c = deck.card(d.card.id);
    if (c) out.push({ item: "card", kind: "card", text: c.text, pillar: c.pillar, status: "Done", label: "Your card" });
  }
  (d.made || []).forEach((id) => { const c = deck.card(id); if (c) out.push({ item: id, kind: "own", text: c.text, pillar: c.pillar, status: "Done", label: "A card you made" }); });
  const tint = (pil) => (TINTS.includes(deck.PILLAR_COL[pil]) ? deck.PILLAR_COL[pil] : null);
  out.forEach((x) => { x.col = tint(x.pillar); if (x.back) x.back.col = tint(x.back.pillar); });
  return { items: out, mood: moodWord(d.mood), feel: (d.feel || []).slice(0, 6) };
}
const dayName = (k) => { const t = dayKey(now()); if (k === t) return "Today"; if (k === addDays(t, -1)) return "Yesterday"; return DAY_NAME[keyDate(k).getDay()].slice(0, 3); };
const longDay = (k) => { const d = keyDate(k); return `${DAY_NAME[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTH[d.getMonth()]}`; };
export const canShareDay = (k = dayKey(now())) => dayItems(k).items.length > 0;

// ---------------- A moment's picture: the card, or the rest day (photos come in step 4) ----------------
const moon = () => friends.svg(30, [["path", { d: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" }]], { fill: "currentColor", stroke: "none" });
// A shared photo, fetched once (only friends can), kept for this visit. While it comes in, got counts how much of it
// has arrived (0 to 1, or -1 until the size is known), so its loading ring can close to match (alex 2026-11-27).
const pics = new Map();   // id -> { done: Promise<url|null>, url, got, subs: Set }
function photoFor(id) {
  if (pics.has(id)) return pics.get(id);
  const p = { url: undefined, got: -1, subs: new Set() };
  const tell = () => p.subs.forEach((fn) => fn(p.got));
  p.done = (async () => {
    const r = await account.raw("/a/f/photo?id=" + encodeURIComponent(id));
    if (!r || !r.ok) return null;
    const size = Number(r.headers.get("X-Size")) || 0;
    let text;
    if (size && r.body && r.body.getReader) {
      const rd = r.body.getReader(), parts = []; let n = 0;
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        parts.push(value); n += value.length; p.got = Math.min(1, n / size); tell();
      }
      const all = new Uint8Array(n); let at = 0;
      for (const v of parts) { all.set(v, at); at += v.length; }
      text = new TextDecoder().decode(all);
    } else text = await r.text();
    try { const j = JSON.parse(text); return j && j.ok ? j.data : null; } catch { return null; }
  })().catch(() => null).then((u) => { p.url = u; p.got = 1; tell(); p.subs.clear(); return u; });
  pics.set(id, p);
  return p;
}
// The loading ring: a thin off-white circle that closes as the photo arrives (alex 2026-11-27, option A on the
// "Feed photo loading ring" mockup). Nothing for the first moment, so a quick photo never flashes one; a short arc
// turns while nothing has arrived yet; the photo fades in once it's all here.
function loadRing(size, w) {
  const r = (size - w) / 2, c = 2 * Math.PI * r, mid = size / 2;
  const fill = h("circle.mo-ring-fill", { cx: mid, cy: mid, r, "stroke-width": w, "stroke-dasharray": c, "stroke-dashoffset": c * 0.88 });
  const el = h("svg.mo-ring.wait", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, "aria-hidden": "true" },
    h("circle.mo-ring-track", { cx: mid, cy: mid, r, "stroke-width": w }), fill);
  return { el, set: (got) => { if (got < 0) return; el.classList.remove("wait"); fill.setAttribute("stroke-dashoffset", c * (1 - got)); } };
}
function photoImg(m, size) {
  if (m.photoDay) return photos.img(m.photoDay, size);
  const el = h("img", { alt: "", decoding: "async", draggable: "false" });
  const p = photoFor(m.id);
  if (p.url !== undefined) { if (p.url) el.src = p.url; return el; }   // already here this visit: no ring
  const ring = size === "full" ? loadRing(28, 2.5) : loadRing(20, 2);
  el.classList.add("mo-wait");
  const show = setTimeout(() => ring.el.classList.add("on"), 150);
  ring.set(p.got); p.subs.add(ring.set);
  p.done.then((u) => {
    clearTimeout(show);
    if (!u) { ring.el.remove(); return; }
    el.addEventListener("load", () => { el.classList.add("in"); ring.el.classList.remove("on"); setTimeout(() => ring.el.remove(), 400); }, { once: true });
    el.src = u;
  });
  return [el, ring.el];
}
// The day's photo, made small and clean to share: framed as chosen, 720 by 900 (the feed's 4 by 5), nothing but the picture.
async function photoData(k, c = FRAME) {
  const src = await photos.url(k, "full");
  if (!src) return null;
  const im = new Image(); im.src = src;
  try { await im.decode(); } catch { return null; }
  for (const [w, q] of [[720, 0.8], [600, 0.72], [480, 0.66]]) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = Math.round(w * 5 / 4);
    const iw = im.naturalWidth, ih = im.naturalHeight, sw = iw / c.z, sh = sw * 5 / 4;
    cv.getContext("2d").drawImage(im, c.x * (iw - sw), c.y * Math.max(0, ih - sh), sw, Math.min(sh, ih), 0, 0, cv.width, cv.height);
    const b = await new Promise((res) => cv.toBlob(res, "image/jpeg", q));
    const clean = b && await photos.clean(b);
    if (!clean) continue;
    const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(clean); });
    if (url && url.length < 440000) return url;
  }
  return null;
}
export function tile(m, { big = false } = {}) {
  if (m.kind === "week") return h(`div.mo-tile.photo.week${big ? ".big" : ""}`, null, photoImg(m, big ? "full" : "thumb"));
  if (m.kind === "photo") return h(`div.mo-tile.photo${big ? ".big" : ""}`, null, photoImg(m, big ? "full" : "thumb"));
  const dot = m.pillar ? h("span.mo-pil", null, h("span.mo-dot", { style: { background: m.col || "rgba(239,237,233,.5)" } }), m.pillar) : null;
  if (m.kind === "rest") return h(`div.mo-tile.rest${big ? ".big" : ""}`, null, h("span.mo-moon", null, moon()), h("span.mo-text", null, "Rested"));
  return h(`div.mo-tile${big ? ".big" : ""}`, null, dot, h("span.mo-text", null, m.text), big && m.status ? h("span.mo-status", null, m.status) : null);
}

// ---------------- Share your week (alex 2026-11-23) ----------------
// "Share to profile" on the weekly recap's share slide: the week's card goes to friends as a picture, exactly as shown
// (moods and photos only if those switches are on). canvas is the card drawn at 720 wide. Sharing the same week
// again updates it. Returns true once shared.
export async function shareWeek(w, canvas, { moods = true } = {}) {
  if (!account.signedIn()) { friends.note("Sharing to your profile needs an account. You can sign up in Settings."); return false; }
  const d = friends.loaded() || await friends.load();
  if (!d) { friends.note(friends.say({ error: "offline" })); return false; }
  if (!d.me.adult) { friends.note("Open Friends first to finish setting it up, then share your week."); return false; }
  const photo = await canvasData(canvas);
  if (!photo) { friends.note("Your week's card couldn't be shared. Try again in a moment."); return false; }
  const r = await account.call("/a/f/share", { day: w, item: "week", kind: "week", text: "", pillar: "", status: "", cap: "", photo });
  if (!r.ok) { friends.note(friends.say(r)); return false; }
  log("share", { kind: "week", ago: 0, mood: moods ? 1 : 0, cap: 0, again: r.again ? 1 : 0, from: "recap" });
  friends.sharedQuietly();
  friends.note(r.again ? "Updated on your profile." : "Shared to your profile. Your friends will see it.");
  return true;
}
// A drawn picture as a small clean JPEG (under the service's limit), nothing but the picture.
async function canvasData(src) {
  for (const [w, q] of [[720, 0.82], [720, 0.7], [600, 0.7], [480, 0.66]]) {
    const c = document.createElement("canvas"); c.width = w; c.height = Math.round(w * src.height / src.width);
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    const b = await new Promise((res) => c.toBlob(res, "image/jpeg", q));
    const clean = b && await photos.clean(b);
    if (!clean) continue;
    const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(clean); });
    if (url && url.length < 440000) return url;
  }
  return null;
}

// ---------------- Share a moment ----------------
// from: where it was opened ("pill" or "home"); day and item preselect.
// ---------------- Framing a photo (alex 2026-11-27) ----------------
// A day's photo is 5 by 7; the feed shows 4 by 5. The framing says which part shows: z is the zoom (1 to 4), x and y
// where the frame sits across the spare width and height (0 to 1). The middle, unzoomed, is how photos always showed.
export const FRAME = { x: 0.5, y: 0.5, z: 1 };
const spareW = (z) => z - 1, spareH = (z) => 1.4 * z - 1.25;   // spare room around the frame, in frame widths
const tidyFrame = (c) => ({ x: Math.min(1, Math.max(0, c.x)), y: Math.min(1, Math.max(0, c.y)), z: Math.min(4, Math.max(1, c.z)) });
// Lay a 5 by 7 <img> inside a 4 by 5 box so the box shows the framed part.
function place(img, c) {
  Object.assign(img.style, { width: c.z * 100 + "%", height: (1.4 * c.z / 1.25) * 100 + "%",
    left: -c.x * spareW(c.z) * 100 + "%", top: -c.y * (spareH(c.z) / 1.25) * 100 + "%" });
}
// The card's words on a photo, at the top (or the bottom, if chosen). In a feed a tap opens the whole card.
function stamp(card, pos, tap) {
  const words = h("span.mo-stamp-text", null, card.text);
  const el = h(`${tap ? "button" : "div"}.mo-stamp${pos === "bottom" ? ".low" : ""}`, tap ? { type: "button", "aria-expanded": "false", "aria-label": tap } : { "aria-hidden": "true" },
    card.pillar ? h("span.mo-stamp-pil", null, h("i", { style: { background: card.col || "#a9a59d" } }), card.pillar) : null, words);
  return el;
}

// ---------------- Adjust: move and zoom the photo inside the feed's frame ----------------
// Drag to move, pinch to zoom (or scroll on a computer). The bright window is what friends see, the rest dimmed; the
// card's words sit where they'll go, and thirds lines show while a finger is down. Reset and Replace photo below.
function openAdjust(k, start, { card, pos, onDone, onReplace }) {
  let c = { ...start }, W = 1, img = null;
  const host = h("div.adj", { role: "dialog", "aria-modal": "true", "aria-label": "Adjust photo" });
  const plane = h("div.adj-plane");
  const win = h("div.adj-win", null, plane, h("div.adj-grid"), card ? stamp(card, pos) : null);
  const stage = h("div.adj-stage", null, win);
  const close = () => { host.classList.remove("in"); setTimeout(() => host.remove(), reduceMotion() ? 0 : 280); };
  const setImg = () => { img = photos.img(k, "full"); img.className = "adj-img"; plane.replaceChildren(img); place(img, c); };
  const done = h("button.adj-done", { type: "button", onclick: () => { close(); onDone(c); } }, "Done");
  const reset = h("button.adj-btn", { type: "button", onclick: () => { c = { ...FRAME }; place(img, c); } }, "Reset");
  const rep = h("button.adj-btn", { type: "button", onclick: () => onReplace(() => { c = { ...FRAME }; setImg(); }) }, "Replace photo");
  host.append(h("div.adj-top", null, h("button.adj-cancel", { type: "button", onclick: close }, "Cancel"), h("h1.adj-title", null, "Adjust photo"), done),
    stage, h("p.adj-hint", null, "Drag to move. Pinch to zoom."), h("div.adj-row", null, reset, rep));
  setImg();
  document.body.append(host);
  requestAnimationFrame(() => requestAnimationFrame(() => host.classList.add("in")));
  host.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  // Gestures work in pixels: o = where the picture's top-left sits from the window's, s = its width.
  const px = () => { W = win.getBoundingClientRect().width || 1; return { ox: -c.x * spareW(c.z) * W, oy: -c.y * spareH(c.z) * W }; };
  const from = (ox, oy, z) => { c = tidyFrame({ x: z > 1 ? -ox / (spareW(z) * W) : 0.5, y: -oy / (spareH(z) * W), z }); place(img, c); };
  const pts = new Map(); let g = null, moved = false;
  const begin = () => {
    const r = win.getBoundingClientRect(), [a, b] = [...pts.values()], o = px();
    g = b ? { z: c.z, ...o, d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top }
      : { z: c.z, ...o, x: a.x, y: a.y };
    host.classList.toggle("touching", pts.size > 0);
  };
  stage.addEventListener("pointerdown", (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); begin(); });
  stage.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = true;
    const [a, b] = [...pts.values()];
    if (!b) return from(g.ox + a.x - g.x, g.oy + a.y - g.y, g.z);
    const r = win.getBoundingClientRect(), z = Math.min(4, Math.max(1, g.z * Math.hypot(a.x - b.x, a.y - b.y) / g.d)), k2 = z / g.z;
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    from(mx - (g.mx - g.ox) * k2, my - (g.my - g.oy) * k2, z);
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size) begin(); else { g = null; host.classList.remove("touching"); if (moved) { moved = false; log("photo_adjust", 1); } } };
  stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = win.getBoundingClientRect(), o = px(), z = Math.min(4, Math.max(1, c.z * Math.exp(-e.deltaY / 400))), k2 = z / c.z;
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    from(mx - (mx - o.ox) * k2, my - (my - o.oy) * k2, z);
  }, { passive: false });
}

// Replace the photo: the phone's own camera or library (Daydeck never sees the rest). It becomes the day's photo.
function replacePhoto(k, after) {
  const file = h("input", { type: "file", accept: "image/*", hidden: true });
  document.body.append(file);
  file.addEventListener("change", async () => {
    const f = file.files && file.files[0]; file.remove();
    if (!f) return;
    try {
      const bmp = await loadPhoto(f);
      await photos.save(k, photos.toCard(bmp, bmp.width || bmp.naturalWidth, bmp.height || bmp.naturalHeight), { src: "lib", words: (photos.note(k) || {}).w !== 0 });
      log("photo_replace", "lib"); after();
    } catch { friends.note("That photo didn't open. Try another one."); }
  });
  openSheet((panel, close) => {
    panel.append(h("h2", null, "Replace photo"),
      h("div.mo-rep", null,
        h("button.mo-rep-row", { type: "button", onclick: () => { close("pick"); openCamera(k, { onSaved: () => { log("photo_replace", "cam"); after(); } }); } }, photos.camIcon(), "Take a photo"),
        h("button.mo-rep-row", { type: "button", onclick: () => { file.click(); close("pick"); } }, friends.svg(18, [["rect", { x: "3", y: "5", width: "18", height: "15", rx: "3" }], ["path", { d: "M3 16l5-5 4 4 3-3 6 6" }]]), "Choose from library")),
      h("button.btn-quiet", { type: "button", onclick: () => close("cancel") }, "Cancel"));
  }, { label: "Replace photo", onClose: () => setTimeout(() => { if (!file.files || !file.files.length) file.remove(); }, 60000) });
}

// ---------------- Share a moment, and Edit (alex 2026-11-27: the same page) ----------------
// The page shows the post exactly as friends will see it, under the choices: your name, the photo framed as it'll be
// (Adjust and Replace on it), the card's words where they'll sit, your caption and how the day felt as you add them.
// Editing a moment opens this same page without the day and the choices, called "Edit moment", with Save.
export function openShare({ day, item, from = "pill", edit = null, saved } = {}) {
  const d0 = friends.loaded();
  if (!account.signedIn() || !d0 || !d0.me.adult) return false;
  const t = dayKey(now()), days = [0, 1, 2, 3, 4].map((i) => addDays(t, -i));
  let k = edit ? edit.day : day && days.includes(day) && canShareDay(day) ? day : null;
  let pick = edit ? edit.item : k ? item || null : null, cap = edit ? edit.cap || "" : "", mood = edit ? !!edit.mood : moodOn(), done = false, big = !k;
  // Where the card goes on a photo: top, bottom or off. How the photo is framed. Whether it was moved or replaced.
  let pos = edit ? (edit.kind === "photo" && !edit.text ? "off" : edit.pos === "bottom" ? "bottom" : "top") : "top";
  let crop = { ...FRAME, ...(edit && edit.crop || {}) }, framed = false, swapped = false;
  log(edit ? "edit_open" : "share_open", edit ? edit.kind : from);
  let strip = null, below = null, scroller = null;
  const setBig = (on, focus) => {
    if (big === on || !strip) return;
    big = on; strip.classList.toggle("big", on);
    if (on && focus) setTimeout(() => focus.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }), 360);
  };
  const choose = (dk) => {
    k = dk; pick = null; crop = { ...FRAME }; framed = false;
    strip.querySelectorAll(".mo-day").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.day === k)));
    drawBelow(); setBig(false);
  };
  const dayTile = (dk) => {
    const info = dayItems(dk), it = info.items[0];
    const b = h("button.mo-day", { type: "button", role: "radio", "data-day": dk, "aria-checked": String(dk === k), "aria-label": `${dayName(dk)}${it ? (it.kind === "photo" ? ", your photo" : "") : ", nothing yet"}`, disabled: !it ? true : null },
      h("span.mo-day-pic", null, !it ? h("span.mo-none", null, "Nothing yet") : it.kind === "photo" ? photos.img(dk, "thumb") : it.kind === "rest" ? h("span.mo-moon.small", null, moon()) : h("span.mo-mini", null, it.col ? h("span.mo-dot", { style: { background: it.col } }) : null, h("span", null, it.text))),
      h("span.mo-day-name", null, dayName(dk)));
    // Big: tap a day to pick it. Small: tap to see them big again.
    b.addEventListener("click", () => (big ? choose(dk) : setBig(true, b)));
    return b;
  };
  // What's being shared: from the day, or (editing) what the moment already holds if the day has moved on.
  const itemsOf = () => {
    const info = dayItems(k);
    if (edit && !info.items.some((x) => x.item === edit.item))
      info.items = [{ item: edit.item, kind: edit.kind, text: edit.kind === "photo" ? "" : edit.text, pillar: edit.pillar, col: edit.col, status: edit.status, back: edit.kind === "photo" && edit.text ? { text: edit.text, pillar: edit.pillar, col: edit.col } : null }];
    if (edit && edit.mood && !info.mood) { info.mood = edit.mood; info.feel = edit.feel || []; }
    return info;
  };
  const drawBelow = () => {
    if (!k) { below.replaceChildren(h("p.fr-note.left", null, "Pick a day to share from.")); return; }
    const info = itemsOf();
    if (!info.items.some((x) => x.item === pick)) pick = info.items[0] ? info.items[0].item : null;   // photos first
    const chosen = info.items.find((x) => x.item === pick);
    const choices = edit ? null : h("div.mo-picks", { role: "radiogroup", "aria-label": "What to share" }, info.items.map((x) =>
      h("button.mo-pick", { type: "button", role: "radio", "aria-checked": String(x.item === pick), onclick: () => { pick = x.item; drawBelow(); } },
        h("span.mo-pick-pic", null, x.kind === "photo" ? photos.img(k, "thumb") : x.kind === "rest" ? h("span.mo-moon.small", null, moon()) : h("span.mo-dot", { style: { background: x.col || "rgba(239,237,233,.5)" } })),
        h("span.mo-pick-words", null, h("span.mo-pick-label", null, x.label || "Your moment"), h("span.mo-pick-sub", null, x.kind === "photo" ? longDay(k) : x.status)))));
    const feltLine = info.mood ? [info.mood[0].toUpperCase() + info.mood.slice(1)].concat(info.feel.length ? [info.feel.join(", ")] : []).join(" · ") : null;
    // A photo takes the day's card with it, written on the photo: at the top, at the bottom, or left off (alex 2026-11-27).
    const back = chosen && chosen.kind === "photo" ? chosen.back : null;
    const isPhoto = chosen && chosen.kind === "photo", local = isPhoto && photos.has(k);
    // The preview: the post as friends will see it, kept up to date as things change.
    const capLine = h("p.mo-cap-text"), feltEl = h("p.mo-felt"), photoBox = h("div.mo-photo");
    const me = friends.meCard() || { username: "", name: "" };
    const drawCap = () => {
      capLine.hidden = !cap.trim(); capLine.replaceChildren(h("b", null, friends.shown(me)), " ", cap.trim());
      feltEl.hidden = !(mood && info.mood);
      feltEl.replaceChildren(...(info.mood ? ["Felt ", h("b", null, info.mood), info.feel.length ? " · " + info.feel.join(", ") : ""] : []));
    };
    const drawPhoto = () => {
      if (!isPhoto) return;
      let box;
      if (local) { const im = photos.img(k, "full"); box = h("div.mo-tile.photo.big.framed", null, im); place(im, crop); }
      else box = tile({ ...edit, photoDay: null }, { big: true });   // editing on a phone without the day's photo: as shared
      const tools = local ? h("div.mo-tools", null,
        h("button.mo-tool", { type: "button", onclick: adjust }, friends.svg(18, [["path", { d: "M6 2v14a2 2 0 0 0 2 2h14" }], ["path", { d: "M18 22V8a2 2 0 0 0-2-2H2" }]]), "Adjust"),
        edit ? h("button.mo-tool", { type: "button", onclick: replace }, friends.svg(18, [["rect", { x: "3", y: "5", width: "18", height: "15", rx: "3" }], ["path", { d: "M3 16l5-5 4 4 3-3 6 6" }]]), "Replace") : null) : null;
      photoBox.replaceChildren(...[box, back && pos !== "off" ? stamp(back, pos) : null, tools].filter(Boolean));
    };
    const adjust = () => { log("photo_adjust_open", edit ? "edit" : "share"); openAdjust(k, crop, { card: back && pos !== "off" ? back : null, pos, onDone: (c) => { if (JSON.stringify(c) !== JSON.stringify(crop)) framed = true; crop = c; drawPhoto(); }, onReplace: replace }); };
    const replace = (then) => replacePhoto(k, () => { swapped = true; crop = { ...FRAME }; drawPhoto(); typeof then === "function" && then(); });
    const head = h("div.mo-head", null, h("span.mo-who", null, friends.pic(me, 36), h("span.mo-name", null, friends.shown(me)), h("span.mo-when", null, edit ? ago(edit.at) : "Just now")),
      chosen && chosen.pillar && !isPhoto ? h("span.mo-pil", null, h("span.mo-dot", { style: { background: chosen.col || "rgba(239,237,233,.5)" } }), chosen.pillar) : null);
    const body = !chosen ? null : isPhoto ? photoBox : chosen.kind === "card" || chosen.kind === "own" ? cardPost({ ...chosen, day: k, look: edit ? edit.look : (inUse() || { id: "daydeck" }).id }) : tile(chosen, { big: true });
    const prev = chosen ? h("div.mo-prev", null, head, body, capLine, feltEl) : null;
    drawPhoto(); drawCap();
    const sw = h("button.switch", { type: "button", role: "switch", "aria-checked": String(mood), "aria-label": "Add how the day felt", onclick: () => { mood = !mood; sw.setAttribute("aria-checked", String(mood)); drawCap(); } });
    const moodRow = info.mood ? h("div.fr-group", null, h("div.fr-switch", null, h("div.fr-who", null, h("span.fr-label", null, "Add how the day felt"), h("span.fr-handle", null, feltLine)), sw)) : null;
    const posBtn = (v, label) => h("button.mo-pos", { type: "button", role: "radio", "aria-checked": String(pos === v), onclick: () => { pos = v; posRow.querySelectorAll(".mo-pos").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === v))); drawPhoto(); }, "data-v": v }, label);
    const posRow = back ? h("div.mo-cardline", { role: "radiogroup", "aria-label": "Your card on the photo" }, h("span", null, "Your card on the photo:"),
      h("span.mo-pos-set", null, posBtn("top", "Top"), posBtn("bottom", "Bottom"), posBtn("off", "Off"))) : null;
    const text = h("textarea.fr-field.mo-cap", { maxlength: "280", rows: "3", placeholder: "Add a caption, if you like", "aria-label": "Caption" });
    text.value = cap; text.addEventListener("input", () => { cap = text.value; drawCap(); });
    const go = h("button.btn-main.fr-main", { type: "button", "aria-disabled": String(!chosen) }, edit ? "Save" : "Share with friends");
    go.addEventListener("click", () => {
      if (!chosen || done) return;
      friends.busy(go, async () => {
        const body = { day: k, item: chosen.item, kind: chosen.kind, text: chosen.text, pillar: chosen.pillar, col: chosen.col, status: chosen.status, cap: text.value };
        if (chosen.kind === "card" || chosen.kind === "own") body.look = edit ? edit.look : (inUse() || { id: "daydeck" }).id;   // which set's feed card friends see
        const sendCard = !!(back && pos !== "off");
        if (sendCard) Object.assign(body, { text: back.text, pillar: back.pillar, col: back.col, status: "Done", pos: pos === "bottom" ? "bottom" : undefined });
        if (isPhoto) {
          body.crop = crop;
          // Editing keeps the photo already shared unless it was moved or replaced (or this phone has a different one now).
          if (local && (!edit || framed || swapped || JSON.stringify(crop) !== JSON.stringify({ ...FRAME, ...(edit.crop || {}) }) || !edit.crop)) {
            body.photo = await photoData(k, crop);
            if (!body.photo) return friends.note("That photo couldn't be shared. Try another day, or your card.");
          }
        }
        if (edit) body.edit = 1;
        if (mood && info.mood) { body.mood = info.mood; body.feel = info.feel; }
        const r = await account.call("/a/f/share", body);
        if (!r.ok) return friends.note(friends.say(r));
        done = true;
        const framing = isPhoto ? { crop: framed || crop.z > 1 || crop.y !== 0.5 || crop.x !== 0.5 ? 1 : 0 } : {};
        if (edit) log("moment_edit", { kind: chosen.kind, cap: text.value.trim() !== (edit.cap || "").trim() ? 1 : 0, rep: swapped ? 1 : 0, ...framing, ...(back ? { pos: pos[0] } : {}) });
        else log("share", { kind: chosen.kind, ago: days.indexOf(k), mood: body.mood ? 1 : 0, cap: text.value.trim() ? 1 : 0, again: r.again ? 1 : 0, from, ...(back ? { card: sendCard ? 1 : 0, pos: pos[0] } : {}), ...framing, ...(body.look ? { look: body.look } : {}) });
        pg.close(); friends.note(edit ? "Saved. Friends see the new version." : "Shared with your friends.");
        if (edit) { pics.delete(r.moment.id); if (feed) feed = feed.map((x) => (x.id === r.moment.id ? r.moment : x)); saved && saved(r.moment); }
        else { feed = null; friends.afterShare(); }
      });
    });
    const from_ = dayName(k) === "Today" ? "today" : dayName(k) === "Yesterday" ? "yesterday" : longDay(k);
    below.replaceChildren(...[
      edit ? null : h("h2.mo-label", null, info.items.length > 1 ? `From ${from_}, pick what to share` : `From ${from_}`), choices,
      prev ? h("h2.mo-label", null, edit ? "How friends see it" : "How friends will see it") : null, prev, posRow,
      chosen ? text : null, moodRow,
      h("p.fr-foot.mo-only", null, friends.svg(13, [["rect", { x: "5", y: "11", width: "14", height: "9", rx: "2" }], ["path", { d: "M8 11V8a4 4 0 0 1 8 0v3" }]]), " Only your friends will see it."),
      go].filter(Boolean));
  };
  const pg = friends.page(edit ? "Edit moment" : "Share a moment", () => {
    below = h("div.fr-stack");
    drawBelow();
    if (edit) return below;
    strip = h(`div.mo-days${big ? ".big" : ""}`, { role: "radiogroup", "aria-label": "Which day" }, days.map(dayTile));
    return h("div.fr-stack", null, h("h2.mo-label", null, "Which day"), strip, below);
  }, { label: edit ? "Edit moment" : "Share a moment", x: true });
  // Scrolling down tucks the days away small.
  scroller = pg.el.querySelector(".fr-scroll");
  if (!edit) scroller.addEventListener("scroll", () => { if (big && k && scroller.scrollTop > 24) setBig(false); }, { passive: true });
  return pg;
}

// ---------------- The feed ----------------
// The feed also brings friends' comments on your own moments lately, for the bell (alex 2026-11-26).
let feed = null, feedLoading = null, feedComments = [];
export const resetFeed = () => { feed = null; };
export async function loadFeed() {
  if (feedLoading) return feedLoading;
  feedLoading = account.call("/a/f/feed").then((r) => { feedLoading = null; if (r.ok) { feed = r.moments; feedComments = r.comments || []; } return r.ok ? feed : null; });
  return feedLoading;
}
export const cachedFeed = () => feed;
export const cachedComments = () => (feed ? feedComments : null);
// When a moment or comment was shared (alex 2026-11-26, TikTok's way): "Just now", "12m ago", "3h ago", "1d ago" up to
// "6d ago", then the date in numbers, day first ("17-11"), from 7 days on; an earlier year adds it ("17-11-2025").
export const ago = (at) => {
  const t = now(), mins = Math.floor(Math.max(0, t - at) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  const a = new Date(at), b = new Date(t);
  const days = Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
  if (days < 7) return Math.max(1, days) + "d ago";
  return a.getDate() + "-" + (a.getMonth() + 1) + (a.getFullYear() === b.getFullYear() ? "" : "-" + a.getFullYear());
};
const names = (list) => { const n = list.map(friends.shown); if (n.length <= 1) return n.join(""); if (n.length <= 3) return n.slice(0, -1).join(", ") + " and " + n[n.length - 1]; return n.slice(0, 3).join(", ") + " and others"; };
// The sun: its middle, eight rays (each its own line, so they can light up one by one), and a moon in the page's black
// that slides across it when "I see you" is said or taken back (alex 2026-11-27, "eclipse"; see .see-on in app.css).
const RAYS = [[12, 2.5, 12, 4.5], [17.3, 6.7, 18.7, 5.3], [19.5, 12, 21.5, 12], [17.3, 17.3, 18.7, 18.7], [12, 19.5, 12, 21.5], [5.3, 18.7, 6.7, 17.3], [2.5, 12, 4.5, 12], [5.3, 5.3, 6.7, 6.7]];
export const sunIcon = (filled) => friends.svg(24, [["circle", { class: "see-core", cx: "12", cy: "12", r: "4.5", fill: filled ? "currentColor" : "none" }],
  ...RAYS.map(([x1, y1, x2, y2]) => ["line", { class: "see-ray", x1, y1, x2, y2 }]), ["circle", { class: "see-moon", cx: "12", cy: "12", r: "5.7" }]]);
// Who said "I see you" on a moment: a sheet of faces and names, tap one for their profile. The person who shared sees
// everyone; others see only themselves and their own friends (the service decides).
function seenBy(m, onPerson) {
  log("seen_by", m.mine ? "own" : "theirs");
  openSheet((panel, close) => {
    panel.classList.add("mo-seen-sheet");
    panel.append(h("h2", null, "I see you"));
    if (!m.seers.length) { panel.append(h("p.fr-sheet-text", null, "Nobody yet.")); return; }
    panel.append(h("div.mo-seen-list", { "data-scroll": "", role: "list" }, m.seers.slice().reverse().map((p) =>
      h("button.mo-seen-row", { type: "button", role: "listitem", onclick: () => { close("pick"); if (onPerson && p.username !== (friends.meCard() || {}).username) setTimeout(() => onPerson(p.username), 300); } },
        friends.pic(p, 40), h("span.mo-seen-who", null, h("b", null, friends.shown(p)), h("span", null, "@" + p.username))))));
  }, { label: "Who said I see you" });
}
// One moment in a feed: who and when, the card, "I see you" (and a speech bubble for comments) and who said it, their
// words, how the day felt, then the latest comment and "View all comments" when there are more.
export function post(m, { onChange, onPerson } = {}) {
  const el = h("article.mo-post", { "data-id": m.id });
  let anim = null, sending = false;
  const draw = () => {
    // The sun on its own, no words (alex 2026-11-26): marigold once you've said it. On your own moment it's there too
    // (alex 2026-11-27), and tapping it shows who said it. Saying it: the moon slides off, the rays light up marigold
    // one by one round the sun, then its middle fills. Taking it back: the moon slides over and it fades back to white,
    // ray by ray (alex 2026-11-27). It changes straight away, and changes back if the service says no.
    const see = h("button.mo-see", { type: "button", "aria-pressed": String(!!m.seen),
      "aria-label": m.mine ? (m.seers.length ? `${names(m.seers)} said I see you. See who` : "Nobody has said I see you yet") : m.seen ? "You said I see you. Tap to take it back" : "I see you" }, sunIcon(m.seen));
    if (anim) { see.classList.add(anim === "on" ? "see-on" : "see-off"); anim = null; }
    see.addEventListener("click", () => {
      if (m.mine) return seenBy(m, onPerson);
      if (sending) return;
      const was = { seen: m.seen, seers: m.seers }, me = friends.meCard() || { username: account.user() || "", name: "", pic: "smile" };
      m.seen = !was.seen;
      m.seers = m.seen ? [...was.seers.filter((p) => p.username !== me.username), me] : was.seers.filter((p) => p.username !== me.username);
      anim = m.seen ? "on" : "off"; draw();
      sending = true;
      account.call("/a/f/see", { id: m.id, undo: !!was.seen }).then((r) => {
        sending = false;
        if (!r.ok) { Object.assign(m, was); draw(); return friends.note(friends.say(r)); }
        log("see", was.seen ? 0 : 1);
        // Only redraw if the service's answer differs from what's showing, so the animation plays through.
        const key = (x) => `${!!x.seen}|${x.seers.map((p) => p.username).join(",")}`, same = key(r.moment) === key(m);
        Object.assign(m, r.moment); if (!same) draw(); onChange && onChange(m);
      });
    });
    // Who said it, on its own line under the sun (alex 2026-11-27): small faces and "Seen by Josh and Sam" in body
    // text. Tap for the whole list (only your own friends among them, unless it's yours). Nothing when nobody has.
    const seers = m.seers.length ? h("button.mo-seers", { type: "button", onclick: () => seenBy(m, onPerson), "aria-label": `Seen by ${names(m.seers)}. See who` },
      h("span.mo-faces", { "aria-hidden": "true" }, m.seers.slice(0, 3).map((p) => friends.pic(p, 20))), h("span", null, "Seen by ", h("b", null, names(m.seers)))) : null;
    const who = h("button.mo-who", { type: "button", onclick: () => onPerson && onPerson(m.by.username), "aria-label": `${friends.shown(m.by)}, ${ago(m.at)}` }, friends.pic(m.by, 36), h("span.mo-name", null, friends.shown(m.by)), h("span.mo-when", null, ago(m.at)));
    const more = h("button.round.mo-more", { type: "button", "aria-label": "More" }, friends.svg(20, [["circle", { cx: "5.5", cy: "12", r: ".9", fill: "currentColor" }], ["circle", { cx: "12", cy: "12", r: ".9", fill: "currentColor" }], ["circle", { cx: "18.5", cy: "12", r: ".9", fill: "currentColor" }]], { "stroke-width": "2.2" }));
    more.addEventListener("click", () => moreMenu(m, onChange, (mm) => { pics.delete(m.id); Object.assign(m, mm); draw(); onChange && onChange(m); }));
    const open = (from, focus) => comments.openComments(m, { from, focus, changed: (mm) => { Object.assign(m, mm); draw(); } });
    const talk = h("button.mo-talk", { type: "button", "aria-label": "Comments", onclick: () => open("button", true) }, comments.bubbleIcon());
    el.replaceChildren(...[
      h("div.mo-head", null, who, m.pillar ? h("span.mo-pil", null, h("span.mo-dot", { style: { background: m.col || "rgba(239,237,233,.5)" } }), m.pillar) : null, more),
      m.kind === "photo" || m.kind === "week" ? photoPost(m) : m.kind === "card" || m.kind === "own" ? cardPost(m) : tile(m, { big: true }),
      h("div.mo-acts", null, h("div.mo-acts-l", null, see, talk)),
      seers,
      m.cap ? h("p.mo-cap-text", null, h("b", null, friends.shown(m.by)), " ", m.cap) : null,
      m.mood ? h("p.mo-felt", null, "Felt ", h("b", null, m.mood), m.feel && m.feel.length ? " · " + m.feel.join(", ") : "") : null,
      comments.preview(m, open)].filter(Boolean));   // replaceChildren would print "null"
  };
  draw();
  return el;
}
// A photo in a feed (alex 2026-11-26): its card's words sit at the top of the photo itself, over a soft dark fade, so
// it's always clear which card it was (even on a video, later). Folded to one line with "…"; tap to read the whole card,
// tap again to fold it. Every big photo can be pinched to zoom, then springs back (zoom()).
function photoPost(m) {
  const wrap = h("div.mo-photo", null, tile(m, { big: true }));
  if (m.kind === "photo" && m.text) {
    // At the top, or the bottom if they chose it (alex 2026-11-27).
    const btn = stamp(m, m.pos, `${m.mine ? "Your" : friends.shown(m.by) + "'s"} card: ${m.text}`), words = btn.querySelector(".mo-stamp-text");
    let logged = false;
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", String(open)); btn.classList.toggle("open", open);
      if (open && !logged && words.scrollHeight > words.clientHeight + 1) { logged = true; log("photo_card", 1); }
    });
    wrap.append(btn);
  }
  zoom(wrap, m);
  return wrap;
}
// Pinch a feed photo to look closer, like other apps: two fingers lift a copy of it above everything, following the
// fingers; letting go springs it back into place. Nothing is kept or sent. Never changes tabs (two fingers stop that).
function zoom(wrap, m) {
  let z = null;   // { copy, shade, r, d0, cx, cy }
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
  const start = (t) => {
    const img = wrap.querySelector("img"); if (!img || !img.complete || !img.naturalWidth) return;
    const r = img.getBoundingClientRect();
    const copy = img.cloneNode(); copy.className = "mo-zoom"; copy.alt = "";
    Object.assign(copy.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    const shade = h("div.mo-zoom-shade");
    document.body.append(shade, copy);
    const [cx, cy] = mid(t);
    z = { copy, shade, r, d0: dist(t), cx, cy, ox: cx - r.left, oy: cy - r.top };
    log("photo_zoom", 1);
  };
  const move = (t) => {
    const k = Math.min(4, Math.max(1, dist(t) / z.d0)), [x, y] = mid(t);
    // Scale around the point between the fingers, and follow them as they move.
    z.copy.style.transformOrigin = `${z.ox}px ${z.oy}px`;
    z.copy.style.transform = `translate(${x - z.cx}px, ${y - z.cy}px) scale(${k})`;
    z.shade.style.opacity = String(Math.min(0.85, (k - 1) * 0.9));
  };
  const end = () => {
    if (!z) return;
    const { copy, shade } = z; z = null;
    copy.classList.add("back"); shade.classList.add("back");
    copy.style.transform = ""; shade.style.opacity = "0";
    const done = () => { copy.remove(); shade.remove(); };
    copy.addEventListener("transitionend", done, { once: true }); setTimeout(done, 400);
  };
  wrap.addEventListener("touchstart", (e) => { if (e.touches.length === 2 && !z) start(e.touches); }, { passive: true });
  wrap.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && !z) start(e.touches);
    if (!z) return;
    e.preventDefault();
    if (e.touches.length === 2) move(e.touches);
  }, { passive: false });
  wrap.addEventListener("touchend", (e) => { if (e.touches.length < 2) end(); });
  wrap.addEventListener("touchcancel", end);
  wrap.addEventListener("gesturestart", (e) => e.preventDefault());   // Safari's own page zoom
}
// A card shared on its own (alex 2026-11-25, "Picked, for now" on the "Card with a shared photo" canvas): the card's
// words stay the same for every set; what's around it is the set's own. Daydeck: a thin marigold edge. Mono: a hairline,
// "MONO · 25.11" and a sheen. The rest: a piece of the set peeking out from under the card (gingham, the latte's layers,
// toadstool spots, stitched mint, chrome). First versions: an artist will redraw the peeking pieces later.
const PEEKS = ["cherry", "matcha", "mushroom", "pals", "chrome"];
function cardPost(m) {
  const look = m.look || "daydeck";
  const dot = m.pillar ? h("span.mo-pil", null, h("span.mo-dot", { style: { background: m.col || "rgba(239,237,233,.5)" } }), m.pillar) : h("span");
  const [, mo, dd] = String(m.day || "").split("-");
  const top = look === "mono" ? h("span.mo-cp-top", null, dot, h("span.mo-cp-mark", null, `MONO · ${dd || ""}.${mo || ""}`)) : dot;
  const face = h("div.mo-cp-face", null, top, look === "mono" ? h("span.mo-cp-rule", { "aria-hidden": "true" }) : null,
    h("span.mo-cp-words", null, m.text), h("span.mo-status", null, m.status || "Done"));
  const under = PEEKS.includes(look) || look === "daydeck" ? h("div.mo-cp-under", { "aria-hidden": "true" }) : null;
  return h(`div.mo-cp.look-${look}${PEEKS.includes(look) ? ".cp-peek" : ""}`, null, under, face);
}
function moreMenu(m, onChange, edited) {
  openSheet((panel, close) => {
    if (m.mine) {
      // Edit (alex 2026-11-27): the share page again, with everything on it. The weekly card is shared from the recap.
      panel.append(...[h("h2", null, "Your moment"),
        m.kind === "week" ? null : h("button.btn-soft.fr-sheet-btn", { type: "button", onclick: () => { close("pick"); setTimeout(() => openShare({ edit: m, saved: edited }), 300); } }, "Edit"),
        h("button.btn-soft.fr-sheet-btn.danger", { type: "button", onclick: async () => {
          close("pick");
          const r = await account.call("/a/f/unshare", { id: m.id });
          if (!r.ok) return friends.note(friends.say(r));
          log("unshare", 1); feed = (feed || []).filter((x) => x.id !== m.id); friends.note("Removed. Friends won't see it any more.");
          onChange && onChange(null, m);
        } }, "Remove this moment")].filter(Boolean));
    } else {
      panel.append(h("h2", null, friends.shown(m.by)),
        h("button.btn-soft.fr-sheet-btn", { type: "button", onclick: async () => {
          close("pick");
          const r = await account.call("/a/f/hide", { username: m.by.username });
          if (!r.ok) return friends.note(friends.say(r));
          log("hide", 1); feed = (feed || []).filter((x) => x.by.username !== m.by.username);
          friends.note(`You won't see ${friends.shown(m.by)}'s moments in your feed. They aren't told.`);
          onChange && onChange(null, m);
        } }, "Hide their moments"),
        h("button.btn-soft.fr-sheet-btn", { type: "button", onclick: () => { close("pick"); setTimeout(() => friends.openReport({ moment: m }), 300); } }, "Report"));
    }
    panel.append(h("button.btn-quiet", { type: "button", onclick: () => close("cancel") }, "Cancel"));
  }, { label: "More" });
}
// The feed itself, with "You're all caught up." at the end.
export function feedList(list, { onChange, onPerson } = {}) {
  return h("div.mo-feed", null, list.map((m) => post(m, { onChange, onPerson })), h("p.mo-end", null, "You're all caught up."));
}

// ---------------- A profile's grid, and the feed it opens ----------------
export function grid(list, owner) {
  if (!list.length) return null;
  return h("div.mo-grid", { role: "list" }, list.map((m, i) => h("button.mo-cell", { type: "button", role: "listitem", "aria-label": `${m.kind === "rest" ? "Rested" : m.kind === "week" ? "Week of" : m.text}, ${longDay(m.day)}`, onclick: () => openScroll(list, i, owner) }, tile(m))));
}
function openScroll(list, i, owner) {
  log("grid_open", 1);
  const title = owner.mine ? "Your moments" : `${(owner.name || "").split(" ")[0] || "@" + owner.username}'s moments`;
  let items = list.slice();
  const pg = friends.page(title, () => feedList(items, { onChange: (m, gone) => { if (gone) { items = items.filter((x) => x.id !== gone.id); pg.refresh(); friends.afterShare(); } } }), { label: title });
  // Start at the one tapped.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = pg.el.querySelector(`.mo-post[data-id="${list[i].id}"]`);
    if (el) el.scrollIntoView({ block: "start" });
  }));
}
export async function loadOf(username) { const r = await account.call("/a/f/moments?u=" + encodeURIComponent(username)); return r.ok ? r.moments : null; }
