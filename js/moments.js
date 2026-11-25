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
import { h, MOODS, dayKey, addDays, DAY_NAME, MONTH, keyDate } from "./util.js";
import { now } from "./clock.js";
import * as store from "./store.js";
import * as deck from "./deck.js";
import { openSheet } from "./ui.js";
import { log } from "./tester.js";
import * as account from "./account.js";
import * as friends from "./friends.js";
import * as photos from "./photos.js";

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
// A shared photo, fetched once (only friends can), kept for this visit.
const pics = new Map();
function photoFor(id) {
  if (!pics.has(id)) pics.set(id, account.call("/a/f/photo?id=" + encodeURIComponent(id)).then((r) => (r.ok ? r.data : null)));
  return pics.get(id);
}
function photoImg(m, size) {
  if (m.photoDay) return photos.img(m.photoDay, size);
  const el = h("img", { alt: "", decoding: "async", draggable: "false" });
  photoFor(m.id).then((u) => { if (u) el.src = u; });
  return el;
}
// The day's photo, made small and clean to share: 720 by 1008, nothing but the picture.
async function photoData(k) {
  const src = await photos.url(k, "full");
  if (!src) return null;
  const im = new Image(); im.src = src;
  try { await im.decode(); } catch { return null; }
  for (const [w, q] of [[720, 0.8], [600, 0.72], [480, 0.66]]) {
    const c = document.createElement("canvas"); c.width = w; c.height = Math.round(w * 7 / 5);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    const b = await new Promise((res) => c.toBlob(res, "image/jpeg", q));
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
export function openShare({ day, item, from = "pill" } = {}) {
  const d0 = friends.loaded();
  if (!account.signedIn() || !d0 || !d0.me.adult) return false;
  const t = dayKey(now()), days = [0, 1, 2, 3, 4].map((i) => addDays(t, -i));
  let k = day && days.includes(day) && canShareDay(day) ? day : null;
  let pick = k ? item || null : null, cap = "", mood = moodOn(), done = false, big = !k, withCard = true;
  log("share_open", from);
  let strip = null, below = null, scroller = null;
  const setBig = (on, focus) => {
    if (big === on || !strip) return;
    big = on; strip.classList.toggle("big", on);
    if (on && focus) setTimeout(() => focus.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }), 360);
  };
  const choose = (dk) => {
    k = dk; pick = null;
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
  const drawBelow = () => {
    if (!k) { below.replaceChildren(h("p.fr-note.left", null, "Pick a day to share from.")); return; }
    const info = dayItems(k);
    if (!info.items.some((x) => x.item === pick)) pick = info.items[0] ? info.items[0].item : null;   // photos first
    const chosen = info.items.find((x) => x.item === pick);
    const choices = h("div.mo-picks", { role: "radiogroup", "aria-label": "What to share" }, info.items.map((x) =>
      h("button.mo-pick", { type: "button", role: "radio", "aria-checked": String(x.item === pick), onclick: () => { pick = x.item; drawBelow(); } },
        tile(x), h("span.mo-pick-label", null, x.label), h("span.mo-pick-sub", null, x.kind === "photo" ? longDay(k) : x.status))));
    const feltLine = info.mood ? [info.mood[0].toUpperCase() + info.mood.slice(1)].concat(info.feel.length ? [info.feel.join(", ")] : []).join(" · ") : null;
    const sw = h("button.switch", { type: "button", role: "switch", "aria-checked": String(mood), "aria-label": "Add how the day felt", onclick: () => { mood = !mood; sw.setAttribute("aria-checked", String(mood)); } });
    const moodRow = info.mood ? h("div.fr-group", null, h("div.fr-switch", null, h("div.fr-who", null, h("span.fr-label", null, "Add how the day felt"), h("span.fr-handle", null, feltLine)), sw)) : null;
    // A photo takes the day's card with it, behind the photo; one quiet line says so, with a way to leave it off (alex 2026-11-25).
    const back = chosen && chosen.kind === "photo" ? chosen.back : null;
    const cardLine = back ? h("div.mo-cardline", null,
      h("span", null, withCard ? "Friends can swipe across to see your card." : "Just your photo. Your card stays private."),
      h("button.mo-cardline-btn", { type: "button", onclick: () => { withCard = !withCard; drawBelow(); } }, withCard ? "Leave it off" : "Add it back")) : null;
    const text = h("textarea.fr-field.mo-cap", { maxlength: "280", rows: "3", placeholder: "Add a caption, if you like", "aria-label": "Caption" });
    text.value = cap; text.addEventListener("input", () => { cap = text.value; });
    const go = h("button.btn-main.fr-main", { type: "button", "aria-disabled": String(!chosen) }, "Share with friends");
    go.addEventListener("click", () => {
      if (!chosen || done) return;
      friends.busy(go, async () => {
        const body = { day: k, item: chosen.item, kind: chosen.kind, text: chosen.text, pillar: chosen.pillar, col: chosen.col, status: chosen.status, cap: text.value };
        const sendCard = !!(back && withCard);
        if (sendCard) Object.assign(body, { text: back.text, pillar: back.pillar, col: back.col, status: "Done" });
        if (chosen.kind === "photo") { body.photo = await photoData(k); if (!body.photo) return friends.note("That photo couldn't be shared. Try another day, or your card."); }
        if (mood && info.mood) { body.mood = info.mood; body.feel = info.feel; }
        const r = await account.call("/a/f/share", body);
        if (!r.ok) return friends.note(friends.say(r));
        done = true;
        log("share", { kind: chosen.kind, ago: days.indexOf(k), mood: body.mood ? 1 : 0, cap: text.value.trim() ? 1 : 0, again: r.again ? 1 : 0, from, ...(back ? { card: sendCard ? 1 : 0 } : {}) });
        pg.close(); friends.note("Shared with your friends.");
        feed = null; friends.afterShare();
      });
    });
    const from_ = dayName(k) === "Today" ? "today" : dayName(k) === "Yesterday" ? "yesterday" : longDay(k);
    below.replaceChildren(...[
      h("h2.mo-label", null, info.items.length > 1 ? `From ${from_}, pick what to share` : `From ${from_}`), choices, cardLine,
      moodRow, chosen ? text : null,
      h("p.fr-foot.mo-only", null, friends.svg(13, [["rect", { x: "5", y: "11", width: "14", height: "9", rx: "2" }], ["path", { d: "M8 11V8a4 4 0 0 1 8 0v3" }]]), " Only your friends will see it."),
      go].filter(Boolean));
  };
  const pg = friends.page("Share a moment", () => {
    strip = h(`div.mo-days${big ? ".big" : ""}`, { role: "radiogroup", "aria-label": "Which day" }, days.map(dayTile));
    below = h("div.fr-stack");
    drawBelow();
    return h("div.fr-stack", null, h("h2.mo-label", null, "Which day"), strip, below);
  }, { label: "Share a moment", x: true });
  // Scrolling down tucks the days away small.
  scroller = pg.el.querySelector(".fr-scroll");
  scroller.addEventListener("scroll", () => { if (big && k && scroller.scrollTop > 24) setBig(false); }, { passive: true });
  return pg;
}

// ---------------- The feed ----------------
let feed = null, feedLoading = null;
export const resetFeed = () => { feed = null; };
export async function loadFeed() {
  if (feedLoading) return feedLoading;
  feedLoading = account.call("/a/f/feed").then((r) => { feedLoading = null; if (r.ok) feed = r.moments; return r.ok ? feed : null; });
  return feedLoading;
}
export const cachedFeed = () => feed;
const ago = (at) => {
  const mins = Math.max(0, Math.round((now() - at) / 60000));
  if (mins < 1) return "now"; if (mins < 60) return mins + "m"; const hrs = Math.round(mins / 60); if (hrs < 24) return hrs + "h";
  const days = Math.round(hrs / 24); return days < 7 ? days + "d" : longDay(dayKey(at));
};
const names = (list) => { const n = list.map(friends.shown); if (n.length <= 1) return n.join(""); if (n.length <= 3) return n.slice(0, -1).join(", ") + " and " + n[n.length - 1]; return n.slice(0, 3).join(", ") + " and others"; };
const sunIcon = (filled) => friends.svg(24, [["circle", { cx: "12", cy: "12", r: "4.5", fill: filled ? "currentColor" : "none" }], ["path", { d: "M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" }]]);
// One moment in a feed: who and when, the card, "I see you" and who said it, their words, and how the day felt.
export function post(m, { onChange, onPerson } = {}) {
  const el = h("article.mo-post", { "data-id": m.id });
  const draw = () => {
    const see = h("button.mo-see", { type: "button", "aria-pressed": String(!!m.seen), "aria-label": m.seen ? "You said I see you. Tap to take it back" : "I see you" }, sunIcon(m.seen), h("span", null, m.seen ? "You see them" : "I see you"));
    if (m.mine) see.replaceChildren(sunIcon(false), h("span.mo-dimtext", null, "Your moment"));
    see.addEventListener("click", () => {
      if (m.mine) return;
      friends.busy(see, async () => {
        const r = await account.call("/a/f/see", { id: m.id, undo: !!m.seen });
        if (!r.ok) return friends.note(friends.say(r));
        log("see", m.seen ? 0 : 1);
        Object.assign(m, r.moment); draw(); onChange && onChange(m);
      });
    });
    const seers = m.seers.length ? h("span.mo-seers", { "aria-label": `${names(m.seers)} said I see you` }, h("span.mo-faces", { "aria-hidden": "true" }, m.seers.slice(0, 3).map((p) => friends.pic(p, 22))), h("span", null, names(m.seers))) : null;
    const who = h("button.mo-who", { type: "button", onclick: () => onPerson && onPerson(m.by.username), "aria-label": `${friends.shown(m.by)}, ${ago(m.at)} ago` }, friends.pic(m.by, 36), h("span.mo-name", null, friends.shown(m.by)), h("span.mo-when", null, ago(m.at)));
    const more = h("button.round.mo-more", { type: "button", "aria-label": "More" }, friends.svg(20, [["circle", { cx: "5.5", cy: "12", r: ".9", fill: "currentColor" }], ["circle", { cx: "12", cy: "12", r: ".9", fill: "currentColor" }], ["circle", { cx: "18.5", cy: "12", r: ".9", fill: "currentColor" }]], { "stroke-width": "2.2" }));
    more.addEventListener("click", () => moreMenu(m, onChange));
    el.replaceChildren(...[
      h("div.mo-head", null, who, m.pillar ? h("span.mo-pil", null, h("span.mo-dot", { style: { background: m.col || "rgba(239,237,233,.5)" } }), m.pillar) : null, more),
      m.kind === "photo" && m.text ? slides(m) : tile(m, { big: true }),
      h("div.mo-acts", null, see, seers),
      m.cap ? h("p.mo-cap-text", null, h("b", null, friends.shown(m.by)), " ", m.cap) : null,
      m.mood ? h("p.mo-felt", null, "Felt ", h("b", null, m.mood), m.feel && m.feel.length ? " · " + m.feel.join(", ") : "") : null].filter(Boolean));   // replaceChildren would print "null"
  };
  draw();
  return el;
}
// A photo with its card behind it (alex 2026-11-25): swipe across (or tap) to slide from the photo to the card and back.
// Two dots show there's a card. The first time anyone meets one, it nudges to show the card's edge, with a tip, until
// their first swipe. touch-action: pan-y keeps a sideways swipe here from changing tabs (js/pill.js ownsSideways).
// Only one tip on screen at a time; a redrawn feed can show it again until the first swipe.
const tipOnScreen = () => [...document.querySelectorAll(".mo-tip")].some((t) => t.isConnected && t.offsetParent);
function slides(m) {
  const who = m.mine ? "Your" : `${friends.shown(m.by)}'s`;
  // The real Daydeck card, face up: the same card as the morning draw, with the friend's words and pillar (alex 2026-11-25).
  const real = h("div.dcard.big.up", { "aria-hidden": "true" }, h("div.in", null, h("div.face.back"), h("div.face.front", null,
    h("span.ctag", null, h("i", { style: { background: m.col || "#a9a59d" } }), m.pillar || "Card"),
    h("span.task", null, m.text),
    h("span.size", null, `${who} card · Done`))));
  const face = h("div.mo-back", null, real);
  const track = h("div.mo-track", null, tile(m, { big: true }), face);
  const dots = h("div.mo-dots", { "aria-hidden": "true" }, h("span.on"), h("span"));
  const wrap = h("div.mo-car", { role: "group", tabindex: "0", "aria-roledescription": "carousel" }, track, dots);
  let page = 0, sx = null, sy = 0, dx = 0, moved = false, tip = null, logged = false;
  const label = () => wrap.setAttribute("aria-label", page ? `${who} card: ${m.text}. Tap for the photo` : `${friends.shown(m.by)}'s photo. Swipe or tap to see the card`);
  const go = (p) => {
    if (p !== page && p === 1 && !logged) { logged = true; log("photo_card", 1); }
    if (p !== page) learned();
    page = p; track.style.transition = ""; track.style.transform = `translateX(${-100 * page}%)`;
    dots.children[0].classList.toggle("on", !page); dots.children[1].classList.toggle("on", !!page); label();
  };
  const learned = () => {
    if (tip) { tip.remove(); tip = null; wrap.classList.remove("peek"); }
    document.querySelectorAll(".mo-tip").forEach((t) => { t.parentElement.classList.remove("peek"); t.remove(); });
    if (!local().cardTip) setLocal("cardTip", 1);
  };
  wrap.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; dx = 0; moved = false; });
  wrap.addEventListener("pointermove", (e) => {
    if (sx == null) return;
    dx = e.clientX - sx;
    if (!moved && (Math.abs(dx) < 8 || Math.abs(e.clientY - sy) > Math.abs(dx))) return;
    moved = true; wrap.classList.remove("peek");
    const pull = (page === 0 && dx > 0) || (page === 1 && dx < 0) ? dx / 3 : dx;   // past either end it only gives a little
    track.style.transition = "none"; track.style.transform = `translateX(calc(${-100 * page}% + ${pull}px))`;
  });
  const up = () => {
    if (sx == null) return; sx = null;
    if (!moved) return;
    go(dx < -60 ? 1 : dx > 60 ? 0 : page);
  };
  wrap.addEventListener("pointerup", up); wrap.addEventListener("pointercancel", up);
  wrap.addEventListener("click", () => { if (moved) { moved = false; return; } go(page ? 0 : 1); });
  wrap.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") go(0); else if (e.key === "ArrowRight") go(1);
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(page ? 0 : 1); }
  });
  label();
  // The first one someone sees, once it's mostly on screen: the nudge and "Swipe to see Mia's card".
  if (!local().cardTip && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => {
      if (!es.some((x) => x.intersectionRatio >= 0.6)) return;
      io.disconnect();
      if (local().cardTip || tipOnScreen() || page) return;
      wrap.classList.add("peek");
      tip = h("span.mo-tip", null, friends.svg(18, [["path", { d: "M20 12H5M10 7l-5 5 5 5" }]]), m.mine ? "Swipe to see your card" : `Swipe to see ${friends.shown(m.by)}'s card`);
      wrap.append(tip);
    }, { threshold: [0.6] });
    io.observe(wrap);
  }
  return wrap;
}
function moreMenu(m, onChange) {
  openSheet((panel, close) => {
    if (m.mine) {
      panel.append(h("h2", null, "Your moment"),
        h("button.btn-soft.fr-sheet-btn.danger", { type: "button", onclick: async () => {
          close("pick");
          const r = await account.call("/a/f/unshare", { id: m.id });
          if (!r.ok) return friends.note(friends.say(r));
          log("unshare", 1); feed = (feed || []).filter((x) => x.id !== m.id); friends.note("Removed. Friends won't see it any more.");
          onChange && onChange(null, m);
        } }, "Remove this moment"));
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
