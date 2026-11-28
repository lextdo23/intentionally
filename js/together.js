// Card with a friend (alex 2026-11-28, plan "Daydeck: getting people to do their card", mockups in the thread
// "Finish the first-days work"). Some mornings a friend has already kept a card that's in your deck too: it can be
// one of your three, in any spot, at most once a week, never forced. When it's turned over, a small bubble comes
// out from behind it with the friend's face and opens into "Sam drew this one too". Keep it, and home says "You and
// Sam are both doing this today" under the card; the friend sees the same with your face. Never a notification,
// never who finished.
//
// Also here, for people with an account and no friends yet: the day 2 "Add a friend" sheet (option A), once, and a
// quiet row under the card now and then (option C), so it never feels pushy.
//
// The service keeps only which deck card someone kept today (its number and the day), gone after 2 days
// (push/friends.js "Card with a friend"). On this phone, under "daydeck-together": today's friends' cards. The
// once-a-week mark and what was offered on home live in the store (seen.palHand, seen.addFriend, seen.palRow), so
// they travel with the backup.
import { h, reduceMotion } from "./util.js";
import * as store from "./store.js";
import * as account from "./account.js";
import * as friends from "./friends.js";
import * as deck from "./deck.js";
import { openSheet } from "./ui.js";
import { log } from "./tester.js";

const KEY = "daydeck-together", WEEK = 7;
let local = read();
function read() { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === "object" ? v : {}; } catch { return {}; } }
function keep() { try { localStorage.setItem(KEY, JSON.stringify(local)); } catch { /* storage full or blocked */ } }
const seen = () => { const st = store.get(); st.seen = st.seen || {}; return st.seen; };
const dayN = (k) => Math.round(new Date(k + "T12:00:00").getTime() / 864e5);

// Signed in, 18+ ticked and at least one friend: only then does anything go to or come from the service.
const data = () => friends.loaded();
export const canUse = () => !!(account.signedIn() && data() && data().me.adult && data().friends.length);
const isDeckCard = (id) => { const c = deck.card(id); return !!(c && !c.own && !c.lib); };

// Friends' kept cards for today, from the service (quietly; nothing changes on screen if it can't be reached).
let busy = null;
export async function refresh(k) {
  if (!canUse()) return [];
  if (busy) return busy;
  busy = (async () => {
    const r = await account.call("/a/f/kept?day=" + encodeURIComponent(k));
    busy = null;
    if (r.ok && Array.isArray(r.kept)) { local.day = k; local.kept = r.kept.filter((x) => x && Number.isInteger(x.card)); keep(); }
    return keptOn(k);
  })();
  return busy;
}
const keptOn = (k) => (local.day === k && Array.isArray(local.kept) ? local.kept : []);

// The morning hand: maybe put a friend's kept card in one of the three spots. `ids` is the hand as dealt, `exclude`
// cards from earlier hands today. Returns { ids, pal } where pal = { id, who } or null.
export function forHand(k, ids, exclude = []) {
  const last = seen().palHand;
  if (last && dayN(k) - dayN(last) < WEEK) return { ids, pal: null };
  const pool = deck.starterPool(deck.dealable(k), k);
  const mine = keptOn(k).filter((x) => pool.includes(x.card) && !exclude.includes(x.card) && isDeckCard(x.card));
  if (!mine.length) return { ids, pal: null };
  const f = mine[Math.floor(Math.random() * mine.length)];
  const out = ids.slice(), at = out.indexOf(f.card) >= 0 ? out.indexOf(f.card) : Math.floor(Math.random() * Math.min(3, out.length || 1));
  out[at] = f.card;
  seen().palHand = k; store.save();
  const who = { username: f.username, name: f.name || "", pic: f.pic || "smile", pv: f.pv };
  log("pal_offer", { id: deck.tid(f.card), at });
  return { ids: out, pal: { id: f.card, who } };
}
// Which hand held it, kept on this phone only (never in the backup, so a friend's name never goes in your days).
export function note(k, hand, pal) { local.hand = { day: k, h: hand, id: pal.id, who: pal.who }; keep(); }
export const palIn = (k, hand) => (local.hand && local.hand.day === k && local.hand.h === hand ? local.hand : null);

// Today's card was kept: tell the service which one (only deck cards; a card of their own takes it back).
export function kept(k, id, card) {
  const p = card && palIn(k, card.hands.length - 1);
  if (p && p.id === id) { card.withPal = 1; log("pal_keep", deck.tid(id)); }
  send(k, isDeckCard(id) ? id : 0);
}
function send(k, id) {
  if (!canUse()) return;
  const tag = k + ":" + id;
  if (local.sent === tag) return;
  account.call("/a/f/kept", { day: k, card: id }).then((r) => { if (r.ok) { local.sent = tag; keep(); } });
}
// On opening: if today's card was kept while offline (or before the first friend), send it now.
export function catchUp(k) {
  const d = store.get().days[k], c = d && !d.rest && d.card;
  if (c && c.id && local.sent !== k + ":" + (isDeckCard(c.id) ? c.id : 0)) send(k, isDeckCard(c.id) ? c.id : 0);
}
// Done: counted for testers only when a friend is doing the same card today. Never told to anyone.
export function done(k, id) { if (withMe(k, id).length) log("pal_done", deck.tid(id)); }

// Friends doing the same card as you today.
export const withMe = (k, id) => (id && isDeckCard(id) && canUse() ? keptOn(k).filter((x) => x.card === id) : []);

// "You and Sam are both doing this today": just under today's card, above "Add a photo".
export function homeLine(k, id) {
  const w = withMe(k, id);
  if (!w.length) return null;
  const b = (x) => h("b", null, x), names = w.map(friends.shown);
  const words = names.length === 1 ? ["You and ", b(names[0]), " are both doing this today"]
    : names.length === 2 ? ["You, ", b(names[0]), " and ", b(names[1]), " are all doing this today"]
      : ["You, ", b(names[0]), ` and ${names.length - 1} others are all doing this today`];
  if (local.lineDay !== k + ":" + id) { local.lineDay = k + ":" + id; keep(); log("pal_line", w.length); }
  return h("p.pal-line", null, friends.pic(w[0], 24), h("span", null, ...words));
}

// ---------------- The bubble in the hand ----------------
// When a friend's card is turned over, a small bubble with their face comes out from behind it, settles just under
// it, then opens evenly from its middle into "Sam drew this one too". Placed by its middle, so nothing slides once
// it's open. `still` shows it already open (coming back to the hand).
export function bubble(card, who, { still = false } = {}) {
  const stage = card.closest(".stage"), host = stage && stage.parentElement;
  if (!host) return null;
  host.querySelector(".pal-bub")?.remove();
  const text = `${friends.shown(who)} drew this one too`;
  const words = h("span.pal-words", null, text);
  const bub = h("div.pal-bub", { "aria-live": "polite" }, friends.pic(who, 28), words);
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  stage.style.position = stage.style.position || "relative"; stage.style.zIndex = "2";
  host.insertBefore(bub, stage);
  // the open width, so it stays on screen
  const probe = h("span.pal-words.probe", null, text); document.body.append(probe);
  const tw = Math.ceil(probe.getBoundingClientRect().width); probe.remove();
  const full = 4 + 28 + 8 + tw + 14;
  const hr = host.getBoundingClientRect(), cr = card.getBoundingClientRect(), vw = document.documentElement.clientWidth;
  const cx = cr.left + cr.width / 2, fc = Math.max(16 + full / 2, Math.min(vw - 16 - full / 2, cx));
  const top = cr.bottom + 10 - hr.top;
  bub.style.left = (fc - hr.left) + "px"; bub.style.top = top + "px";
  const open = () => { bub.classList.add("open"); words.style.maxWidth = (tw + 1) + "px"; };
  if (still || reduceMotion()) { bub.style.zIndex = "3"; bub.classList.add("still"); open(); return bub; }
  const dx = cx - fc, dy = (cr.top + cr.height * 0.55) - (cr.bottom + 10 + 18);
  bub.style.transform = `translate(calc(-50% + ${dx}px), ${dy}px) scale(.8)`;
  bub.getBoundingClientRect();
  bub.classList.add("moving");
  setTimeout(() => { bub.style.transform = "translate(-50%, 0)"; }, 40);
  setTimeout(() => { bub.style.zIndex = "3"; }, 300);
  setTimeout(open, 520);
  return bub;
}
export const TOGETHER_HINT = "Do it together, or each your own way.";

// ---------------- For people with no friends yet ----------------
const noFriends = () => !!(account.signedIn() && data() && !data().friends.length && !data().asksYou.length && !(store.get().levels || {}).invited);

// Day 2, once, after the card is kept and home is quiet (option A). Not now means never again.
export const sheetDue = (k) => !seen().addFriend && deck.dayOfUse(k) === 2 && noFriends();
export function openSheetA() {
  seen().addFriend = 1; store.save();
  log("pal_sheet", "seen");
  openSheet((panel, close) => {
    const back = (r) => h("div.pal-back" + (r ? ".r" : ""));
    const pair = h("div.pal-pair", { "aria-hidden": "true" }, back(false), back(true),
      h("span.pal-face.l", null, account.picture(40)), h("span.pal-face.r", null, account.littleOne("frog", 40)));
    const go = (what, fn) => () => { log("pal_sheet", what); close(what); if (fn) setTimeout(fn, 250); };
    const inviteBtn = h("button.btn-main", { onclick: () => { log("pal_sheet", "invite"); friends.invite(inviteBtn).then(() => close("invite")); } }, "Invite a friend");
    panel.append(h("div.col.pal-sheet", null, pair,
      h("h2", null, "Some mornings, you'll both draw the same card"),
      h("p.sub", null, "Add a friend and, once in a while, Daydeck deals you both the same card. Do it together, or each in your own way."),
      inviteBtn,
      h("button.btn-main.soft", { onclick: go("username", () => friends.openAdd()) }, "Add by username"),
      h("button.btn-quiet", { onclick: go("later") }, "Not now")));
  }, { label: "Add a friend" });
}

// The quiet row under the card (option C): from day 3, on about one day in five (days 3, 8, 13 and 18), after the
// card is kept, 4 times at most. Gone for good once there's a friend or it's swiped away. A tap opens Add friends.
const ROW_MAX = 4;
const row = () => { const s = seen(); s.palRow = s.palRow && typeof s.palRow === "object" ? s.palRow : { days: [] }; if (!Array.isArray(s.palRow.days)) s.palRow.days = []; return s.palRow; };
export function rowDue(k) {
  const r = seen().palRow;
  if (r && (r.off || (r.days || []).length >= ROW_MAX && !(r.days || []).includes(k))) return false;
  const n = deck.dayOfUse(k);
  return n >= 3 && (n - 3) % 5 === 0 && noFriends();
}
export function quietRow(k) {
  if (!rowDue(k)) return null;
  const r = row();
  if (!r.days.includes(k)) { r.days.push(k); store.save(); log("pal_row", "seen"); }
  const el = h("button.pal-row", { type: "button", onclick: () => { if (moved) return; log("pal_row", "tap"); friends.openAdd(); } },
    account.littleOne("frog", 26), h("span", null, "Same card as a friend some days? ", h("b", null, "Add one ›")));
  // Swipe it away (either way): it follows the finger, and past a third it's gone for good.
  let x0 = null, dx = 0, moved = false;
  el.addEventListener("pointerdown", (e) => { x0 = e.clientX; dx = 0; moved = false; el.style.transition = "none"; });
  el.addEventListener("pointermove", (e) => {
    if (x0 == null) return;
    dx = e.clientX - x0; if (Math.abs(dx) > 8) { moved = true; try { el.setPointerCapture(e.pointerId); } catch { /* fine */ } }
    if (moved) { el.style.transform = `translateX(${dx}px)`; el.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 260)); }
  });
  const end = () => {
    if (x0 == null) return; x0 = null;
    el.style.transition = reduceMotion() ? "none" : "transform .3s ease, opacity .3s ease";
    if (moved && Math.abs(dx) > el.offsetWidth / 3) {
      el.style.transform = `translateX(${dx > 0 ? 480 : -480}px)`; el.style.opacity = "0";
      const rr = row(); rr.off = 1; store.save(); log("pal_row", "away");
      setTimeout(() => { el.style.visibility = "hidden"; el.inert = true; }, 300);
    } else { el.style.transform = ""; el.style.opacity = ""; }
    setTimeout(() => { moved = false; }, 0);
  };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  return el;
}
