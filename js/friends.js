// Friends (social stage 1, step 2; alex 2026-11-20, CLAUDE.md "Social"). Friends only, seen and supported, never
// measured. Lives in the Friends tab of the glass pill (js/pill.js), which opens at level 4 (js/levels.js).
//
// Here: the Friends tab (requests, your friends, a calm start when there are none), Add friends (by exact
// @username or an invite link, plus the "Friend requests" switch), a friend's profile (picture, name, @username,
// friends count, "This season", their moments grid, and the ••• menu: remove friend, block), your own profile on
// the You tab (Edit: name, "This season", picture), Privacy (friends count, requests, blocked people), and the
// "I'm 18 or over" tick the first time. Moments (step 3) fill the feed and the grids; hide and report come with them.
//
// Kept on this phone only, under "daydeck-friends": an invite link someone opened (until it's used) and your own
// invite link (so sharing it twice doesn't make a new one). The service keeps the rest (push/friends.js).
// Tester mode hears only what people do (asked, accepted, removed...), never names or words.
import { h, LIFELINE, reduceMotion } from "./util.js";
import { openSheet, roundBtn } from "./ui.js";
import { log } from "./tester.js";
import * as account from "./account.js";
import * as moments from "./moments.js";

const KEY = "daydeck-friends";
let local = read();
function read() { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === "object" ? v : {}; } catch { return {}; } }
function keep() { try { localStorage.setItem(KEY, JSON.stringify(local)); } catch { /* storage full or blocked */ } }

let data = null, loading = null, problem = null, dotFn = () => {}, redrawYou = () => {}, goTab = () => {}, mine = null;
let fScreen = null;
export const loaded = () => data;
// The pill hands over: how to show the small dot on Friends (no counts, alex 2026-11-20) and how to redraw You.
export function connect({ dot, you, go }) { if (dot) dotFn = dot; if (you) redrawYou = you; if (go) goTab = go; }
// Ready to share: signed in, ticked 18+, and at least one friend to share with.
export const canShare = () => !!(account.signedIn() && data && data.me.adult && data.friends.length);
// After sharing or removing a moment: fresh feed and grids, and show Friends.
// Shared from somewhere that isn't the Friends tab (the weekly recap): the lists refresh next time, nothing moves.
export function sharedQuietly() { mine = null; moments.resetFeed(); }
export async function afterShare() { mine = null; moments.resetFeed(); goTab("friends"); await moments.loadFeed(); again(); }

// Everything the Friends screen needs, from the service. Quietly does nothing without an account.
export async function load() {
  if (!account.signedIn()) { data = null; problem = null; dotFn(false); return null; }
  if (loading) return loading;
  loading = (async () => {
    const r = await account.call("/a/f");
    loading = null;
    if (!r.ok || !r.me) { problem = r.error || "offline"; return null; }
    data = r; problem = null;
    dotFn(r.asksYou.length > 0);
    sendPic();
    return r;
  })();
  return loading;
}
// Your picture, for friends: which little one it is, or your photo (the small cleaned square kept for your
// picture, 240 by 240). Sent again only when it changes, or when the service doesn't have it yet.
function picKey() { const ph = account.photoPic(), u = account.user(); return (u ? u.username : "") + "|" + (ph ? "photo:" + ph.length + ":" + ph.slice(-48) : account.picId()); }
function sendPic() {
  if (!data) return;
  if (!account.hasPic()) {   // a new phone that hasn't picked one: take the picture friends already see, never send the smile over it
    const svc = data.me.pic, done = () => { local.pic = picKey(); keep(); redrawYou(); };
    if (svc === "photo") face(data.me).then((src) => { if (src && !account.hasPic()) { account.restorePhotoPic(src); done(); } });
    else if (svc && svc !== "smile") { account.useLittle(svc); done(); }
    return;
  }
  const id = account.picId(), k = picKey();
  if (data.me.pic === id && local.pic === k) return;
  const ph = id === "photo" ? account.photoPic() : null;
  account.call("/a/f/profile", ph ? { pic: "photo", photo: ph } : { pic: id }).then((r) => { if (r.ok) { local.pic = k; keep(); if (data) data.me.pic = id; } });
}
const again = async () => { await load(); if (data && data.me.adult) { await moments.loadFeed(); if (account.user()) mine = await moments.loadOf(account.user().username); } if (fScreen && fScreen.isConnected) drawFriends(fScreen); redrawYou(); pages.forEach((p) => p.refresh && p.refresh()); };

// An invite link someone opened (…/?add=…): kept until there's an account to use it with.
export function noteInvite(t) { if (/^[A-Za-z0-9_-]{20,64}$/.test(t)) { local.join = t; keep(); } }
export async function useInvite() {
  if (!local.join || !account.signedIn()) return null;
  const r = await account.call("/a/f/join", { t: local.join });
  if (r.ok || r.error === "old_invite") { delete local.join; keep(); }
  if (r.ok) { log("friend", "join"); await load(); }
  return r.ok ? r : null;
}

// ---------------- Bits ----------------
export const svg = (w, paths, extra = {}) => h("svg", { width: w, height: w, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", ...extra }, paths.map(([t, a]) => h(t, a)));
const ICON = {
  add: () => svg(22, [["circle", { cx: "10", cy: "8.5", r: "3.4" }], ["path", { d: "M3.5 19.5c.8-3.3 3.4-5.2 6.5-5.2s5.7 1.9 6.5 5.2" }], ["path", { d: "M18.5 7.5v6M15.5 10.5h6" }]]),
  more: () => svg(22, [["circle", { cx: "5.5", cy: "12", r: ".9", fill: "currentColor" }], ["circle", { cx: "12", cy: "12", r: ".9", fill: "currentColor" }], ["circle", { cx: "18.5", cy: "12", r: ".9", fill: "currentColor" }]], { "stroke-width": "2.2" }),
  link: () => svg(20, [["path", { d: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2" }], ["path", { d: "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2" }]]),
  lock: () => svg(15, [["rect", { x: "5", y: "11", width: "14", height: "9", rx: "2" }], ["path", { d: "M8 11V8a4 4 0 0 1 8 0v3" }]]),
  tick: () => svg(18, [["path", { d: "M5 12.5l4.5 4.5L19 7.5" }]], { "stroke-width": "2.4" }),
};
const iconBtn = (icon, label, onclick) => h("button.round", { type: "button", "aria-label": label, onclick }, icon());
export const shown = (p) => p.name || p.username;
// A person's picture: yours always as it really is; a friend's photo is fetched once (the smile shows until it
// arrives, or if it can't be fetched); otherwise their little one.
const isMe = (p) => { const u = account.user(); return !!(u && p && p.username && p.username.toLowerCase() === String(u.username || "").toLowerCase()); };
const facePics = new Map();
function face(p) {
  const k = p.username.toLowerCase() + ":" + (p.pv || 0);
  if (!facePics.has(k)) facePics.set(k, account.call("/a/f/face?u=" + encodeURIComponent(p.username)).then((r) => (r.ok && typeof r.data === "string" && r.data.startsWith("data:image/jpeg;base64,") ? r.data : null)));
  return facePics.get(k);
}
export const pic = (p, size) => {
  if (isMe(p)) return account.picture(size);
  if (p.pic !== "photo") return account.littleOne(p.pic || "smile", size);
  const el = account.littleOne("smile", size);
  face(p).then((src) => { if (src) el.replaceChildren(h("img", { src, alt: "", draggable: "false" })); });
  return el;
};
// A person in a list: picture, name and @username, with whatever goes on the right.
function row(p, right, open) {
  const who = h("div.fr-who", null, h("span.fr-name", null, shown(p)), h("span.fr-handle", null, "@" + p.username + (p.season ? " · " + p.season : "")));
  const main = open ? h("button.fr-open", { type: "button", "aria-label": `${shown(p)}, @${p.username}`, onclick: open }, pic(p, 48), who) : h("div.fr-open", null, pic(p, 48), who);
  return h("div.fr-row", null, main, right ? h("div.fr-right", null, right) : null);
}
export const small = (text, onclick, kind = "soft") => h(`button.fr-btn.${kind}`, { type: "button", onclick }, text);
// While the service answers, the button shows it's working and can't be tapped twice.
export async function busy(btn, job) {
  if (btn.getAttribute("aria-busy") === "true") return;
  btn.setAttribute("aria-busy", "true");
  try { return await job(); } finally { btn.removeAttribute("aria-busy"); }
}
const SAY = {
  offline: "Can't reach Daydeck right now. Check you're online and try again.",
  closed: "They're not taking friend requests right now.",
  full: "That's 150 friends, the most Daydeck keeps. Remove someone to add someone new.",
  too_many_waiting: "You have lots of requests waiting already. Give them a little time.",
  too_many: "That's a lot of looking for now. Try again in a while.",
  too_many_shares: "That's lots of sharing for one day. Try again tomorrow.",
  bad_moment: "That couldn't be shared. Try again.",
  paused: "Sharing is paused on your account while Daydeck looks into a report. Email hello@daydeck.day if you think that's a mistake.",
  bad_report: "That report couldn't be sent. Try again.",
  not_found: "No one by that name. Check the spelling with your friend.",
  name_words: "That name can't be used. Try another.",
  adult: "Friends on Daydeck are for people 18 and over.",
};
export const say = (r) => SAY[r && r.error] || SAY.offline;

// ---------------- The Friends tab ----------------
// fresh: opened from the pill, so check for new moments and requests once it's drawn.
export function drawFriends(screen, fresh) {
  fScreen = screen;
  const ready = account.signedIn() && data && data.me.adult;
  screen.replaceChildren(
    h("div.tab-head", null, h("h1.big-title", { tabindex: "-1" }, "Friends"), ready ? iconBtn(ICON.add, "Add friends", openAdd) : null),
    body(), h("div.fr-life", null, LIFELINE()));
  if (account.signedIn() && !data && !loading && !problem) again();
  else if (fresh && data && data.me.adult) again();
}
function faces(ids = ["frog", "smile", "cat"]) { return h("div.friends-faces", { "aria-hidden": "true" }, ids.map((id) => account.littleOne(id, 64))); }
function body() {
  if (!account.signedIn()) {
    return h("div.tab-empty", null, faces(),
      h("h2", null, "Friends need an account"),
      h("p", null, "Make a free account to add a few friends and cheer each other on. Your days get backed up too."),
      h("button.btn-main.fr-main", { type: "button", onclick: () => account.openSignup(() => again(), { from: "friends" }) }, "Make an account"));
  }
  if (!data) {
    if (problem) return h("div.tab-empty", null, h("h2", null, "Can't reach Daydeck"), h("p", null, "Your friends will show when you're back online."), small("Try again", (e) => busy(e.currentTarget, again)));
    return h("div.tab-empty", null, h("span.fr-ring", { role: "status", "aria-label": "Loading" }));
  }
  if (!data.me.adult) return adultGate();
  const parts = [];
  if (data.asksYou.length) parts.push(h("section.fr-sec", null, h("h2.fr-sec-head", null, "Friend requests"), data.asksYou.map(requestRow)));
  if (data.friends.length) {
    // Your friends as a row of faces (tap one for their profile), then their moments, newest first.
    parts.push(h("div.fr-faces-row", { role: "list", "aria-label": "Your friends" }, data.friends.map((p) =>
      h("button.fr-face", { type: "button", role: "listitem", onclick: () => openPerson(p.username) }, pic(p, 56), h("span", null, (p.name || p.username).split(" ")[0])))));
    const list = moments.cachedFeed();
    if (!list) { parts.push(h("div.tab-empty.small", null, h("span.fr-ring", { role: "status", "aria-label": "Loading" }))); moments.loadFeed().then(() => fScreen && fScreen.isConnected && drawFriends(fScreen)); }
    else if (!list.length) parts.push(h("div.tab-empty.small", null, h("h2", null, "Nothing shared yet"), h("p", null, "When friends share a moment, it'll show here. Tap Share a moment to share one of yours.")));
    else parts.push(moments.feedList(list, { onPerson: openPerson, onChange: (m, gone) => { if (gone) again(); } }));
  } else {
    parts.push(h("div.tab-empty.fr-start", null, faces(["sprout", "bunny", "bear"]),
      h("h2", null, "Add a few friends"),
      h("p", null, "A few people who get it is plenty. Only your friends ever see what you choose to share."),
      h("div.fr-start-btns", null,
        h("button.btn-main.fr-main", { type: "button", onclick: (e) => invite(e.currentTarget) }, "Invite a friend"),
        h("button.btn-main.soft", { type: "button", onclick: openAdd }, "Add by username"))));
  }
  return h("div.fr-body", null, parts);
}
function requestRow(p) {
  const yes = small("Accept", (e) => busy(e.currentTarget, () => answer(p, true)), "main"), no = small("Not now", (e) => busy(e.currentTarget, () => answer(p, false)));
  return row(p, [no, yes]);
}
async function answer(p, yes) {
  const r = await account.call("/a/f/answer", { username: p.username, yes });
  if (!r.ok) return note(say(r));
  log("friend", yes ? "accept" : "decline");
  await again();
}

// The first time: Friends is for adults (alex 2026-11-20). One tick, kept with the account.
function adultGate() {
  let ticked = false;
  const box = h("span.fr-check", { "aria-hidden": "true" });
  const tick = h("button.fr-tick", { type: "button", role: "checkbox", "aria-checked": "false" }, box, h("span", null, "I'm 18 or over"));
  const go = h("button.btn-main.fr-main", { type: "button", "aria-disabled": "true" }, "Continue");
  tick.addEventListener("click", () => { ticked = !ticked; tick.setAttribute("aria-checked", String(ticked)); box.replaceChildren(...(ticked ? [ICON.tick()] : [])); go.setAttribute("aria-disabled", String(!ticked)); });
  go.addEventListener("click", () => {
    if (!ticked) return;
    busy(go, async () => {
      const r = await account.call("/a/f/profile", { adult: true });
      if (!r.ok) return note(say(r));
      log("friends_adult", 1);
      await again();
    });
  });
  return h("div.tab-empty", null, faces(),
    h("h2", null, "Friends, gently"),
    h("p", null, "Add a few friends, see the moments they choose to share, and cheer each other on. Nothing is ever shared unless you choose to."),
    h("p", null, "Friends on Daydeck are for people 18 and over."),
    tick,
    h("p.tab-note", null, "By continuing, you agree to the ", h("a.fr-link", { href: "guidelines.html" }, "Friends guidelines"), "."),
    go);
}

// A short line that floats up and fades, for things that went wrong or "Link copied".
export function note(text) {
  document.querySelector(".fr-toast")?.remove();
  const t = h("div.fr-toast", { role: "status" }, text);
  document.body.append(t);
  setTimeout(() => t.classList.add("out"), 2800);
  setTimeout(() => t.remove(), 3300);
}

// ---------------- Invite link ----------------
// Daydeck.day/?add=…: lasts 14 days and works for a few friends; kept so sharing twice sends the same link.
async function invite(btn) {
  return busy(btn, async () => {
    const u = (account.user() || {}).username;
    let inv = local.inv;
    if (!inv || inv.u !== u || inv.until - Date.now() < 2 * 86400000) {
      const r = await account.call("/a/f/invite", {});
      if (!r.ok) return note(say(r));
      inv = local.inv = { u, t: r.t, until: r.until }; keep();
    }
    const url = location.origin + "/?add=" + inv.t;
    log("friend", "invite");
    if (navigator.share) {
      try { await navigator.share({ title: "Daydeck", text: "Add me as a friend on Daydeck", url }); } catch { /* they changed their mind */ }
      return;
    }
    try { await navigator.clipboard.writeText(url); note("Link copied. Send it to a friend."); } catch { note(url); }
  });
}

// ---------------- Full-screen pages (Add friends, a profile, Edit, Privacy, Blocked) ----------------
const pages = [];
export function page(title, build, { right, label, x } = {}) {
  const el = h("div.fr-page", { role: "dialog", "aria-modal": "true", "aria-label": label || title });
  const close = () => {
    const i = pages.indexOf(p); if (i < 0) return;
    pages.splice(i, 1); el.classList.remove("open");
    if (!pages.length) document.body.classList.remove("in-fpage");
    setTimeout(() => el.remove(), reduceMotion() ? 0 : 420);
  };
  const scroll = h("div.fr-scroll");
  const p = { el, close, refresh: null };
  const draw = () => {
    const top = scroll.scrollTop;
    scroll.replaceChildren(h("div.fr-page-in", null,
      h("div.fr-page-head", null, x ? roundBtn("close", "Close", close) : roundBtn("back", "Back", close), h("h1.fr-page-title", { tabindex: "-1" }, title), right ? right() : h("span.fr-head-gap")),
      build(draw, close)));
    scroll.scrollTop = top;
  };
  p.refresh = draw;
  el.append(scroll);
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  draw();
  document.body.append(el);
  pages.push(p);
  document.body.classList.add("in-fpage");
  requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add("open"); el.querySelector("h1")?.focus({ preventScroll: true }); }));
  // Like iPhone apps: drag from the left edge to go back.
  let x0 = null, dx = 0;
  el.addEventListener("pointerdown", (e) => { if (e.clientX < 28 && e.pointerType !== "mouse") { x0 = e.clientX; dx = 0; el.setPointerCapture(e.pointerId); el.style.transition = "none"; } });
  el.addEventListener("pointermove", (e) => { if (x0 == null) return; dx = Math.max(0, e.clientX - x0); el.style.transform = `translateX(${dx}px)`; });
  const up = () => { if (x0 == null) return; x0 = null; el.style.transition = ""; el.style.transform = ""; if (dx > innerWidth * 0.33) close(); };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  return p;
}
export const closeAll = () => [...pages].reverse().forEach((p) => p.close());

// ---------------- Add friends ----------------
const cleanName = (s) => String(s || "").trim().replace(/^@/, "").toLowerCase();
export function openAdd() {
  if (!data || !data.me.adult) return;
  log("friends_add_open", 1);
  let found = null, msg = "", typed = "";
  page("Add friends", (redraw) => {
    const input = h("input.fr-field", { type: "text", inputmode: "text", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "search", maxlength: "21", placeholder: "Their @username", "aria-label": "Their username", value: typed });
    const find = h("button.fr-btn.soft.fr-find", { type: "button" }, "Find");
    const look = () => busy(find, async () => {
      typed = input.value; const n = cleanName(typed);
      if (!/^[a-z0-9._]{3,20}$/.test(n)) { found = null; msg = "Usernames are 3 to 20 letters, numbers, full stops or underscores."; return redraw(); }
      const r = await account.call("/a/f/find?u=" + encodeURIComponent(n));
      log("friend", "find");
      if (!r.ok) { found = null; msg = say(r); }
      else if (!r.found) { found = null; msg = SAY.not_found; }
      else { found = r.person; msg = ""; }
      redraw();
    });
    find.addEventListener("click", look);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") look(); });
    input.addEventListener("input", () => { typed = input.value; });
    const result = found ? h("div.fr-found", null, row(found, stateBtn(found, redraw), found.state === "friends" ? () => openPerson(found.username) : null))
      : msg ? h("p.fr-msg", { role: "status" }, msg) : null;
    const reqs = data.asksYou.length ? h("section.fr-sec", null, h("h2.fr-sec-head", null, "Requests"), data.asksYou.map(requestRow)) : null;
    const waiting = data.asked.length ? h("section.fr-sec", null, h("h2.fr-sec-head", null, "Waiting for them"),
      data.asked.map((p) => row(p, small("Asked", (e) => takeBack(e.currentTarget, p))))) : null;
    const inviteRow = h("button.fr-card-row", { type: "button", onclick: (e) => invite(e.currentTarget) },
      h("span.fr-ico", null, ICON.link()), h("span.fr-who", null, h("span.fr-name", null, "Invite friends to Daydeck"), h("span.fr-handle", null, "Send your link in any app")), h("span.set-chev", { "aria-hidden": "true" }, "›"));
    return h("div.fr-stack", null,
      h("div.fr-search", null, input, find), result, reqs, waiting, inviteRow,
      switchRow("Friend requests", "Let anyone with your username send a request.", !data.me.closed, async (on) => {
        const r = await account.call("/a/f/profile", { closed: !on }); if (!r.ok) { note(say(r)); return false; }
        data.me.closed = !on; log("friend_set", { requests: on ? 1 : 0 }); return true;
      }),
      h("p.fr-foot", null, "Friends only see the moments you choose to share."));
  });
}
// The button beside someone you looked up, by where things stand between you.
function stateBtn(p, redraw) {
  if (p.state === "you") return h("span.fr-chip", null, "That's you");
  if (p.state === "friends") return h("span.fr-chip", null, "Friends");
  if (p.state === "asked") return h("span.fr-chip", null, "Asked");
  if (p.state === "asks_you") return small("Accept", (e) => busy(e.currentTarget, async () => { await answer(p, true); p.state = "friends"; redraw(); }), "main");
  if (p.closed) return h("span.fr-chip", null, "Not taking requests");
  return small("Add", (e) => busy(e.currentTarget, async () => {
    const r = await account.call("/a/f/ask", { username: p.username });
    if (!r.ok) return note(say(r));
    log("friend", r.state === "friends" ? "accept" : "ask");
    p.state = r.state; await load(); redraw();
  }), "main");
}
function takeBack(btn, p) {
  openSheet((panel, close) => {
    panel.append(h("h2", null, `Take back your request to ${shown(p)}?`),
      h("p.fr-sheet-text", null, "They won't be told."),
      h("button.btn-main.fr-main", { type: "button", onclick: () => busy(btn, async () => { close("done"); const r = await account.call("/a/f/cancel", { username: p.username }); if (!r.ok) return note(say(r)); log("friend", "cancel"); await again(); }) }, "Take it back"),
      h("button.btn-quiet", { type: "button", onclick: () => close("cancel") }, "Keep it"));
  }, { label: "Take back request" });
}
function switchRow(label, sub, on, change) {
  const sw = h("button.switch", { type: "button", role: "switch", "aria-checked": String(on), "aria-label": label });
  sw.addEventListener("click", async () => {
    const next = sw.getAttribute("aria-checked") !== "true";
    sw.setAttribute("aria-checked", String(next)); sw.disabled = true;
    const ok = await change(next);
    sw.disabled = false;
    if (!ok) sw.setAttribute("aria-checked", String(!next));
  });
  return h("div.fr-switch", null, h("div.fr-who", null, h("span.fr-label", null, label), h("span.fr-handle", null, sub)), sw);
}

// ---------------- A friend's profile ----------------
export function openPerson(username) {
  let person = null, err = "", list = null;
  const pg = page("", (redraw, close) => {
    if (err) return h("p.fr-msg", null, err);
    if (!person) return h("div.tab-empty", null, h("span.fr-ring", { role: "status", "aria-label": "Loading" }));
    return profileBody(person, false, close, person.state === "friends" ? list : []);
  }, { label: "Profile", right: () => person && person.state === "friends" ? iconBtn(ICON.more, "More", () => more(person, pg)) : h("span.fr-head-gap") });
  account.call("/a/f/person?u=" + encodeURIComponent(username)).then((r) => {
    if (r.ok) { person = r.person; log("friend_profile", person.state === "friends" ? 1 : 0); } else err = r.error === "not_found" ? "This person isn't on Daydeck any more." : say(r);
    pg.refresh();
    if (r.ok && person.state === "friends") moments.loadOf(username).then((m) => { list = m || []; pg.refresh(); });
  });
}
// The top of a profile, yours (You tab) or a friend's: picture, name, @username · friends, This season, moments.
function profileBody(p, isMe, close, list) {
  const mine = isMe;
  const count = p.friends != null;
  const kids = [
    h("div.fr-prof-top", null, mine ? h("button.you-pic", { type: "button", "aria-label": "Change your picture", onclick: () => account.choosePicture(again) }, account.picture(88)) : pic(p, 88),
      h("div.fr-who", null, h("span.fr-prof-name", null, shown(p)), h("span.fr-handle.big", null, "@" + p.username, count ? [" · ", mine && data && data.friends.length
        // Your own friends count opens your friends list, with search (alex 2026-11-21).
        ? h("button.fr-count", { type: "button", onclick: openFriendsList, "aria-label": `${p.friends} ${p.friends === 1 ? "friend" : "friends"}. See your friends` }, h("b", null, String(p.friends)), p.friends === 1 ? " friend" : " friends")
        : h("span", null, h("b", null, String(p.friends)), p.friends === 1 ? " friend" : " friends")] : null))),
    p.season ? h("p.fr-season", null, h("span.fr-dim", null, "This season · "), p.season) : null,
  ];
  if (!mine && p.state !== "friends") {
    kids.push(h("div.fr-prof-btns", null, stateBtn(p, () => { close(); openPerson(p.username); })));
    return h("div.fr-prof", null, kids);
  }
  const first = (p.name || "").split(" ")[0] || "@" + p.username;
  kids.push(h("h2.fr-sec-head.big", null, mine ? "What you've shared" : `${first}'s moments`));
  const g = list && moments.grid(list, { ...p, mine });
  if (g) kids.push(g);
  else if (list) kids.push(h("p.fr-note.left", null, mine ? "Moments you share with friends will show here." : "Nothing shared yet. When they share a moment, it'll show here."));
  else kids.push(h("div.tab-empty.small", null, h("span.fr-ring", { role: "status", "aria-label": "Loading" })));
  return h("div.fr-prof", null, kids);
}
// The ••• menu: hide their moments, remove friend, report, block (all quiet).
function more(p, pg) {
  openSheet((panel, close) => {
    panel.append(h("h2", null, shown(p)),
      h("button.btn-soft.fr-sheet-btn", { type: "button", onclick: async () => {
        close("pick");
        const r = await account.call("/a/f/hide", { username: p.username, undo: !!p.hidden });
        if (!r.ok) return note(say(r));
        log(p.hidden ? "unhide" : "hide", 1); p.hidden = !p.hidden; moments.resetFeed(); again();
        note(p.hidden ? `You won't see ${shown(p)}'s moments in your feed. They aren't told.` : `${shown(p)}'s moments are back in your feed.`);
      } }, p.hidden ? "Show their moments" : "Hide their moments"),
      h("button.btn-soft.fr-sheet-btn.danger", { type: "button", onclick: () => { close("pick"); setTimeout(() => sure(p, "remove", pg), 300); } }, "Remove friend"),
      h("button.btn-soft.fr-sheet-btn", { type: "button", onclick: () => { close("pick"); setTimeout(() => openReport({ person: p, pg }), 300); } }, `Report @${p.username}`),
      h("button.btn-soft.fr-sheet-btn.danger", { type: "button", onclick: () => { close("pick"); setTimeout(() => sure(p, "block", pg), 300); } }, `Block @${p.username}`),
      h("button.btn-quiet", { type: "button", onclick: () => close("cancel") }, "Cancel"));
  }, { label: "More" });
}
function sure(p, what, pg) {
  const words = what === "remove"
    ? [`Remove ${shown(p)}?`, "They won't be told. You'll stop seeing each other's moments.", "Remove"]
    : [`Block @${p.username}?`, "They won't be told. They won't be able to find you or send you a request, and you'll stop seeing each other.", "Block"];
  openSheet((panel, close) => {
    const go = h("button.btn-main.fr-main", { type: "button" }, words[2]);
    go.addEventListener("click", () => busy(go, async () => {
      const r = await account.call(what === "remove" ? "/a/f/remove" : "/a/f/block", { username: p.username });
      if (!r.ok) return note(say(r));
      log("friend", what); close("done"); pg.close(); await again();
      note(what === "remove" ? `${shown(p)} removed.` : `@${p.username} blocked.`);
    }));
    panel.append(h("h2", null, words[0]), h("p.fr-sheet-text", null, words[1]), go, h("button.btn-quiet", { type: "button", onclick: () => close("cancel") }, "Cancel"));
  }, { label: words[0] });
}

// ---------------- Report (step 5) ----------------
// A moment ({ moment }) or a person ({ person }). Pick why, add a few words if you like, send. They're never told who.
// Then: thanks, and the choice to also hide their moments or block them. "They might not be safe" also shows how to
// get help now (000, Lifeline), since that report is about worry for someone, not about rules.
const WHY = [["hurtful", "Hurtful, bullying or hateful"], ["sexual", "Sexual or violent"], ["risk", "They might not be safe"], ["spam", "Spam or a fake account"], ["else", "Something else"]];
export function openReport({ moment, person, pg }) {
  const who = moment ? moment.by : person, title = moment ? "Report this moment" : `Report @${who.username}`;
  log("report_open", moment ? "moment" : "person");
  openSheet((panel, close) => {
    const step1 = () => panel.replaceChildren(h("span.grabber", { "aria-hidden": "true" }), h("h2", null, title),
      h("p.fr-sheet-text", null, `Why are you reporting it? ${shown(who)} won't know it was you.`),
      h("div.fr-why", { role: "list" }, WHY.map(([k, label]) => h("button.fr-why-row", { type: "button", role: "listitem", onclick: () => step2(k, label) }, h("span", null, label), h("span.set-chev", { "aria-hidden": "true" }, "›")))),
      h("a.fr-link.fr-guide", { href: "guidelines.html" }, "Read the Friends guidelines"),
      h("button.btn-quiet", { type: "button", onclick: () => close("cancel") }, "Cancel"));
    const step2 = (k, label) => {
      const note = h("textarea.fr-field.mo-cap", { maxlength: "300", rows: "3", placeholder: "Anything else we should know? (optional)", "aria-label": "Anything else we should know?" });
      const send = h("button.btn-main.fr-main", { type: "button" }, "Send report");
      send.addEventListener("click", () => busy(send, async () => {
        const r = await account.call("/a/f/report", moment ? { moment: moment.id, why: k, note: note.value } : { username: who.username, why: k, note: note.value });
        if (!r.ok) return friendsNote(r);
        log("report", { kind: moment ? "moment" : "person", why: WHY.findIndex((w) => w[0] === k) });
        step3(k);
      }));
      panel.replaceChildren(h("span.grabber", { "aria-hidden": "true" }), h("h2", null, label), note, send, h("button.btn-quiet", { type: "button", onclick: step1 }, "Back"));
    };
    const step3 = (k) => {
      const kids = [h("span.grabber", { "aria-hidden": "true" }), h("h2", null, "Thanks for telling us"),
        h("p.fr-sheet-text", null, `Daydeck will look at it soon. ${shown(who)} won't know it was you.`)];
      if (k === "risk") kids.push(h("div.fr-lock.fr-help", null, h("span", null, "If they're in danger right now, call 000. Lifeline can help you work out what to say to them."),
        h("div.fr-help-btns", null, h("a.btn-soft", { href: "tel:000" }, "Call 000"), h("a.btn-soft", { href: "tel:131114" }, "Lifeline 13 11 14"))));
      const fd = data && data.friends.find((f) => f.username === who.username);
      if (fd) kids.push(h("button.btn-soft.fr-sheet-btn", { type: "button", onclick: async () => {
        const r = await account.call("/a/f/hide", { username: who.username }); if (!r.ok) return friendsNote(r);
        log("hide", 1); moments.resetFeed(); close("done"); again(); note(`You won't see ${shown(who)}'s moments in your feed.`);
      } }, `Also hide ${shown(who)}'s moments`));
      kids.push(h("button.btn-soft.fr-sheet-btn.danger", { type: "button", onclick: () => { close("done"); setTimeout(() => sure(who, "block", pg || { close: () => {} }), 300); } }, `Also block @${who.username}`),
        h("button.btn-main.fr-main", { type: "button", onclick: () => close("done") }, "Done"));
      panel.replaceChildren(...kids);
    };
    step1();
  }, { label: title });
}
const friendsNote = (r) => note(say(r));

// ---------------- Your friends: A to Z, with search ----------------
// From the friends count on You. Only you see this list; friends only ever see the count (unless it's hidden).
export function openFriendsList() {
  if (!data) return;
  let q = "";
  log("friends_list", 1);
  const fold = (x) => String(x || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  page("Your friends", () => {
    const list = h("div.fr-list");
    const fill = () => {
      const f = fold(q.trim().replace(/^@/, ""));
      const shownList = data.friends.filter((p) => !f || fold(p.name).split(/\s+/).some((w) => w.startsWith(f)) || fold(p.name).startsWith(f) || p.username.toLowerCase().startsWith(f));
      list.replaceChildren(...(shownList.length ? shownList.map((p) => row(p, h("span.set-chev", { "aria-hidden": "true" }, "›"), () => openPerson(p.username)))
        : [h("p.fr-note.left", null, `No friends called “${q.trim()}”.`)]));
    };
    const box = h("input.fr-field.fr-search-box", { type: "search", inputmode: "search", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "search", placeholder: "Search your friends", "aria-label": "Search your friends", value: q });
    box.addEventListener("input", () => { q = box.value; fill(); });
    fill();
    const n = data.friends.length;
    return h("div.fr-stack", null,
      h("label.fr-search-wrap", null, h("span.fr-search-ico", { "aria-hidden": "true" }, svg(18, [["circle", { cx: "11", cy: "11", r: "6.5" }], ["path", { d: "M16 16l4.5 4.5" }]], { "stroke-width": "2" })), box),
      h("p.fr-field-note", null, `${n} ${n === 1 ? "friend" : "friends"}, A to Z. Only you see this list.`),
      list);
  }, { label: "Your friends", right: () => iconBtn(ICON.add, "Add friends", openAdd) });
}

// ---------------- You: your own profile ----------------
// What the You tab shows under the title, once signed in. Friends not open yet: just your picture and @username.
export function youTop(friendsOpen) {
  const u = account.user();
  if (!u) return null;
  if (!data && !loading && !problem) again();
  const me = data ? data.me : { username: u.username, name: "", season: "", friends: null };
  // Your own friends count always shows to you; "Show your friends count" only hides it from others.
  const p = { ...me, username: u.username, friends: friendsOpen && data ? me.friends : null };
  if (data && data.me.adult && mine == null) moments.loadOf(u.username).then((m) => { if (m) { mine = m; redrawYou(); } });
  const top = profileBody({ ...p, state: "you" }, true, () => {}, data && data.me.adult ? mine : []);
  const btns = h("div.fr-prof-btns", null,
    h("button.btn-main.soft", { type: "button", onclick: openEdit }, "Edit"),
    friendsOpen && data && data.me.adult ? h("button.btn-main.soft", { type: "button", onclick: openAdd }, ICON.add(), "Add friends") : null);
  // Put the buttons after "This season", before what you've shared.
  const head = top.querySelector(".fr-sec-head");
  top.insertBefore(btns, head);
  return top;
}
export function openEdit() {
  const u = account.user(); if (!u) return;
  const me = data ? data.me : { name: "", season: "" };
  let saving = false;
  page("Edit profile", (redraw, close) => {
    const picBtn = h("button.you-pic.fr-edit-pic", { type: "button", "aria-label": "Change your picture", onclick: () => account.choosePicture(() => { redraw(); again(); }) }, account.picture(96));
    const name = h("input.fr-field", { type: "text", maxlength: "30", autocomplete: "nickname", placeholder: u.username, "aria-label": "Name", value: me.name || "" });
    const season = h("input.fr-field", { type: "text", maxlength: "60", autocomplete: "off", placeholder: "Getting through exams gently", "aria-label": "This season", value: me.season || "" });
    const msg = h("p.fr-msg", { role: "status" });
    const save = h("button.btn-main.fr-main", { type: "button" }, "Save");
    save.addEventListener("click", () => {
      if (saving) return; saving = true;
      busy(save, async () => {
        const r = await account.call("/a/f/profile", { name: name.value, season: season.value });
        saving = false;
        if (!r.ok) { msg.textContent = say(r); return; }
        log("profile", { name: name.value.trim() ? 1 : 0, season: season.value.trim() ? 1 : 0 });   // whether they're filled in, never the words
        close(); await again();
      });
    });
    return h("div.fr-stack", null,
      h("div.fr-edit-top", null, picBtn, h("button.btn-text", { type: "button", onclick: () => picBtn.click() }, "Change picture")),
      h("label.fr-field-label", null, h("span", null, "Name"), name),
      h("p.fr-field-note", null, "Doesn't have to be your real name. Leave it empty to show @" + u.username + "."),
      h("label.fr-field-label", null, h("span", null, "This season"), season),
      h("p.fr-field-note", null, "A line about what you're focusing on lately. Only friends see it."),
      msg, save);
  }, { label: "Edit profile" });
}

// ---------------- Privacy (Settings → Privacy, once Friends is open) ----------------
export function openPrivacy() {
  if (!account.signedIn()) return;
  const go = () => page("Privacy", (redraw) => {
    if (!data) return h("p.fr-msg", null, SAY.offline);
    const blocked = data.blocked.length;
    return h("div.fr-stack", null,
      h("div.fr-lock", null, ICON.lock(), h("span", null, "Only your friends can see you on Daydeck, and only the moments you choose to share.")),
      h("div.fr-group", null,
        switchRow("Share my mood", "Start each share with how the day felt. You can still turn it off each time.", moments.moodOn(), async (on) => { moments.setMood(on); log("friend_set", { mood: on ? 1 : 0 }); return true; }),
        switchRow("Show your friends count", "Shown on your profile.", !data.me.hide, async (on) => {
          const r = await account.call("/a/f/profile", { hide: !on }); if (!r.ok) { note(say(r)); return false; }
          data.me.hide = !on; log("friend_set", { count: on ? 1 : 0 }); redrawYou(); return true;
        }),
        switchRow("Friend requests", "Let anyone with your username send a request.", !data.me.closed, async (on) => {
          const r = await account.call("/a/f/profile", { closed: !on }); if (!r.ok) { note(say(r)); return false; }
          data.me.closed = !on; log("friend_set", { requests: on ? 1 : 0 }); return true;
        }),
        h("button.fr-link-row", { type: "button", onclick: () => openBlocked(redraw) }, h("span.fr-label", null, "Blocked people"), h("span.set-value", null, blocked ? String(blocked) : "None"), h("span.set-chev", { "aria-hidden": "true" }, "›"))));
  });
  if (data) go(); else load().then(go);
}
function openBlocked(back) {
  page("Blocked people", () => {
    if (!data.blocked.length) return h("p.fr-note.left", null, "Nobody. If you block someone, they'll show here and you can unblock them.");
    return h("div.fr-stack", null, data.blocked.map((p) => h("div.fr-row", null, h("span.fr-name", null, "@" + p.username),
      small("Unblock", (e) => busy(e.currentTarget, async () => {
        const r = await account.call("/a/f/block", { username: p.username, undo: true }); if (!r.ok) return note(say(r));
        log("friend", "unblock"); await again(); back();
      })))),
    h("p.fr-foot", null, "They won't be told. Unblocking doesn't make you friends again."));
  });
}

// Signing out or in: start fresh.
account.onAccount((what) => {
  if (what === "pic") { sendPic(); return; }
  data = null; problem = null;
  if (what === "out") { dotFn(false); closeAll(); } else { useInvite().then(() => again()); }
});
