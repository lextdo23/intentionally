// The card library (alex 2026-11-18): cards people made, checked by alex, shared with everyone.
// - "Cards" (the round button on home) has two tabs: Your deck (cards you made, cards you added, and your pillars'
//   cards) and Everyone's (the library: your pillars first, filter by pillar and mindset, Most loved or Newest).
// - Adding a library card puts it in your morning draws, for its pillar. A card for a pillar you haven't picked is
//   still added, and comes up once you pick that pillar.
// - A card you made goes to the library only if you choose "Show it to everyone" (when making it, or later from
//   Your deck). Its words, the name you chose and its pillar go to the Daydeck service, where alex reads it first.
//   Nothing else about you goes with it. You hear back only if it's a Yes ("In the library").
// - Thumbs up: once you've done a library card, "Thumbs up for <name>" is one more answer under "How did doing it
//   feel?". One per phone per card, never on your own card.
// The phone talks to the service with a random key it made (store.lib.key), never anything about the person.
import { h, reduceMotion } from "./util.js";
import * as store from "./store.js";
import * as deck from "./deck.js";
import { roundBtn } from "./ui.js";
import { log, SERVICE } from "./tester.js";
import { MINDSETS } from "./pillars.js";
import { cardEl } from "./draw.js";

const FRESH = 6 * 3600e3;   // the library list is fetched again after six hours (it doesn't need to be live)
const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
export function lib() {
  const s = store.get();
  s.lib = Object.assign({ key: "", name: "", list: [], at: 0, cards: {}, added: [], shared: {}, status: {}, ups: {}, pending: [] }, s.lib || {});
  if (!s.lib.key) { s.lib.key = rand(); store.save(); }
  return s.lib;
}
const post = (path, body) => fetch(SERVICE + path, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) }).then((r) => r.json());
const sidOf = (id) => String(id).replace(/^l/, "");
const listCard = (sid) => lib().list.find((c) => c.id === sid);
const mineSids = () => Object.values(lib().shared).filter(Boolean);

// Fetch the library (at most every six hours unless forced), send any cards shared while offline, and check on
// cards this phone shared. Quiet when offline.
let busy = null;
export function refresh(force = false) {
  if (busy) return busy;
  const L = lib();
  if (!force && Date.now() - L.at < FRESH && !L.pending.length) return Promise.resolve(false);
  busy = (async () => {
    try {
      for (const p of L.pending.slice()) await sendShare(p.own, p.name);
      const res = await fetch(SERVICE + "/l/list");
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.cards)) {
          L.list = data.cards.filter((c) => c && /^[a-z0-9]{10}$/.test(c.id) && typeof c.text === "string").slice(0, 2000);
          L.at = Date.now();
          // Keep the copies of added cards up to date (alex may have fixed a word).
          L.list.forEach((c) => { if (L.cards[c.id]) Object.assign(L.cards[c.id], { text: c.text, name: c.name, pillar: c.pillar }); });
        }
      }
      const ids = mineSids();
      if (ids.length) { const r = await post("/l/status", { key: L.key, ids }); if (r && r.status) L.status = r.status; }
      store.save();
      return true;
    } catch { return false; } finally { busy = null; }
  })();
  return busy;
}

// ---- Sharing a card you made ----
// own: the made card ({ id: "o3", pillar, text }). name: what to show as "Made by" ("" = Anonymous daydeck user).
export function share(own, name) {
  const L = lib();
  L.name = (name || "").trim().slice(0, 24);
  L.shared[own.id] = null;   // waiting to be sent
  if (!L.pending.some((p) => p.own === own.id)) L.pending.push({ own: own.id, name: L.name });
  store.save();
  log("lib_share", { p: own.pillar });
  return refresh(true);
}
async function sendShare(ownId, name) {
  const L = lib(), o = deck.ownCard(ownId);
  if (!o) { L.pending = L.pending.filter((p) => p.own !== ownId); delete L.shared[ownId]; return; }
  const mine = deck.myPillars().find((p) => p.name === o.pillar);
  const r = await post("/l/share", { key: L.key, text: o.text, name, pillar: o.pillar, mind: mine ? mine.mindsets || [] : [] });
  if (r && r.ok && r.id) { L.shared[ownId] = r.id; L.status[r.id] = "wait"; L.pending = L.pending.filter((p) => p.own !== ownId); store.save(); }
}
// Where a card you made is up to: null (not shared), "send" (waiting for a connection), "wait", "in", or "no".
export function sharedState(ownId) {
  const L = lib();
  if (!(ownId in L.shared)) return null;
  const sid = L.shared[ownId];
  return sid ? L.status[sid] || "wait" : "send";
}
export function unshare(ownId) {
  const L = lib(), sid = L.shared[ownId];
  delete L.shared[ownId]; L.pending = L.pending.filter((p) => p.own !== ownId);
  store.save();
  if (sid) post("/l/unshare", { key: L.key, ids: [sid] }).catch(() => {});
}
// Delete everything: take this phone's cards back out of the library. True if it's done (or there was nothing).
// Offline: only the key and the card ids are kept aside (not in the main data) and it finishes next time it's online.
const LATER = "daydeck-unshare-later";
export async function unshareAll() {
  const s = store.get(), L = s.lib;
  if (!L || !L.key) return true;
  const ids = Object.values(L.shared || {}).filter(Boolean);
  if (!ids.length) return true;
  try { const r = await post("/l/unshare", { key: L.key, ids }); if (r && r.ok) return true; } catch { /* offline */ }
  try { localStorage.setItem(LATER, JSON.stringify({ key: L.key, ids })); } catch { /* storage blocked */ }
  return false;
}
export async function finishUnshare() {
  let p = null; try { p = JSON.parse(localStorage.getItem(LATER)); } catch { /* none */ }
  if (!p || !p.key || !Array.isArray(p.ids)) return;
  try { const r = await post("/l/unshare", { key: p.key, ids: p.ids }); if (r && r.ok) localStorage.removeItem(LATER); } catch { /* still offline */ }
}

// ---- Adding, removing, thumbs ----
export const isAdded = (sid) => lib().added.includes(sid);
export function add(c) {
  const L = lib();
  L.cards[c.id] = { text: c.text, name: c.name, pillar: c.pillar, mind: c.mind || [] };
  if (!L.added.includes(c.id)) L.added.push(c.id);
  store.save(); log("lib_add", { p: c.pillar });
}
export function remove(sid) {
  const L = lib(), c = L.cards[sid];
  L.added = L.added.filter((x) => x !== sid);
  store.save(); log("lib_remove", { p: c ? c.pillar : "" });
}
// A library card you did: may it get a thumbs up from you? (Not your own, and only once.)
export function canUp(id) {
  if (!deck.isLib(id)) return false;
  const sid = sidOf(id), L = lib();
  return !L.ups[sid] && !mineSids().includes(sid);
}
export function up(id) {
  const sid = sidOf(id), L = lib(), c = deck.card(id);
  if (!canUp(id)) return;
  L.ups[sid] = 1; const lc = listCard(sid); if (lc) lc.up = (lc.up || 0) + 1;
  store.save(); log("lib_up", { p: c ? c.pillar : "" });
  post("/l/up", { key: L.key, id: sid }).catch(() => { delete L.ups[sid]; store.save(); });
}
// "Thumbs up for Tom": a pill for the "How did doing it feel?" answers. Returns null when it doesn't apply.
export function thumbPill(id) {
  if (!canUp(id)) return null;
  const c = deck.card(id);
  const b = h("button.pill.outline.lib-up", { type: "button", "aria-pressed": "false" }, THUMB(16), h("span", null, c.by ? `Thumbs up for ${c.by}` : "Thumbs up"));
  b.addEventListener("click", () => b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")));
  return b;
}

// ---- Pictures ----
const SVG = (d, s = 13, w = 2.2) => h("svg", { width: String(s), height: String(s), viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": String(w), "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, h("path", { d }));
export const THUMB = (s) => SVG("M7 10v11H4V10h3zM7 10l4-8a2.5 2.5 0 0 1 2.5 2.5V9h5.6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 17.7 21H7", s);
const byLine = (name) => (name ? `Made by ${name}` : "Anonymous daydeck user");
const dot = (p) => h("i", { style: { background: deck.PILLAR_COL[p] || "#a9a59d" } });
// A small face-up card for the grids. c: { pillar, text, by, n (thumbs, or null), stamp }
function mini(c, onclick) {
  const front = h("span.lib-front", null,
    h("span.lib-top", null, h("span.ctag", null, dot(c.pillar), c.pillar), c.n != null ? h("span.lib-n", null, THUMB(13), String(c.n)) : null),
    h("span.lib-task", null, c.text),
    c.stamp ? h("span.lib-stamp", null, c.stamp) : null,
    h("span.lib-by", null, c.by));
  return h("button.lib-mini", { type: "button", onclick, "aria-label": `${c.pillar}: ${c.text}. ${c.by}${c.n != null ? `. ${c.n} thumbs up` : ""}${c.stamp ? `. ${c.stamp}` : ""}` }, front);
}
function big(c) {
  return h("div.lib-big", { role: "img", "aria-label": `${c.pillar}: ${c.text}. ${c.by}` },
    h("span.lib-top", null, h("span.ctag", null, dot(c.pillar), c.pillar), c.n != null ? h("span.lib-n", null, THUMB(14), String(c.n)) : null),
    h("span.lib-task", null, c.text),
    c.stamp ? h("span.lib-stamp", null, c.stamp) : null,
    h("span.lib-by", null, c.by));
}

// ---------------- The Cards page ----------------
let page = null, onClosed = null;
const st = { tab: "all", pil: "mine", mind: "", sort: "loved" };
const pref = () => { const p = (store.get().lib || {}).view; if (p) Object.assign(st, p); };
const keep = () => { lib().view = { tab: st.tab, sort: st.sort }; store.save(); };

export function openCards(closed) {
  onClosed = closed; pref(); st.pil = "mine"; st.mind = "";
  log("lib_open");
  page = h("div", { id: "cards", role: "dialog", "aria-modal": "true", "aria-label": "Cards" });
  page.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (page.querySelector(".lib-view")) closeView(); else closeCards(); } });
  document.body.append(page);
  draw();
  requestAnimationFrame(() => requestAnimationFrame(() => { document.body.classList.add("in-cards"); page.querySelector(".round")?.focus({ preventScroll: true }); }));
  refresh().then((changed) => { if (changed && page) draw(true); });
}
function closeCards() {
  if (!page) return;
  const p = page; page = null;
  document.body.classList.remove("in-cards");
  setTimeout(() => p.remove(), reduceMotion() ? 160 : 420);
  onClosed && onClosed();
}

function draw(keepScroll) {
  if (!page) return;
  const sc = page.querySelector(".ph-scroll") || h("div.ph-scroll");
  const y = sc.scrollTop;
  const seg = h("div.seg", { role: "tablist", "aria-label": "Cards" }, [["deck", "Your deck"], ["all", "Everyone's"]].map(([k, l]) =>
    h("button", { role: "tab", "aria-selected": String(st.tab === k), onclick: () => { if (st.tab === k) return; st.tab = k; keep(); log("lib_tab", k); draw(); } }, l)));
  sc.replaceChildren(h("div.ph-page.lib-page", null,
    h("div.col", { style: { gap: "8px" } }, roundBtn("back", "Back to home", closeCards), h("h1.big-title", null, "Cards")),
    seg, ...(st.tab === "all" ? everyone() : yours())));
  if (!sc.isConnected) page.append(sc);
  sc.scrollTop = keepScroll ? y : 0;
}

// Everyone's: your pillars first; tap a pillar for its mindsets.
function everyone() {
  const L = lib(), mine = deck.myPillars().filter((p) => !p.own).map((p) => p.name);
  const chips = h("div.lib-chips", { role: "group", "aria-label": "Pillar" },
    [["mine", "Your pillars"], ...mine.map((n) => [n, n]), ["any", "All pillars"]].map(([k, l]) =>
      h("button.pill", { type: "button", "aria-pressed": String(st.pil === k), onclick: () => { st.pil = k; st.mind = ""; log("lib_filter", { p: k === "mine" || k === "any" ? k : k }); draw(true); } },
        deck.PILLAR_COL[k] ? h("span.sq", { style: { background: deck.PILLAR_COL[k] } }) : null, l)));
  // A pillar that isn't one of yours, picked from "All pillars", still gets its own chip row of mindsets.
  const anyPills = st.pil === "any" ? h("div.lib-chips.wrap", { role: "group", "aria-label": "Any pillar" },
    Object.keys(MINDSETS).filter((n) => !mine.includes(n)).map((n) => h("button.pill.outline", { type: "button", "aria-pressed": "false", onclick: () => { st.pil = n; st.mind = ""; draw(true); } }, n))) : null;
  const one = st.pil !== "mine" && st.pil !== "any";
  const minds = one && MINDSETS[st.pil] ? h("div.lib-chips.wrap", { role: "group", "aria-label": "Where you're at" },
    [["", `All of ${st.pil}`], ...MINDSETS[st.pil].map(([words, name]) => [name, words])].map(([k, l]) =>
      h("button.pill.outline.lib-mind", { type: "button", "aria-pressed": String(st.mind === k), onclick: () => { st.mind = k; if (k) log("lib_filter", { p: st.pil, m: k }); draw(true); } }, l))) : null;
  let list = L.list.filter((c) => st.pil === "any" ? true : st.pil === "mine" ? mine.includes(c.pillar) : c.pillar === st.pil);
  if (one && st.mind) list = list.filter((c) => (c.mind || []).includes(st.mind));
  list = list.slice().sort(st.sort === "loved" ? (a, b) => (b.up || 0) - (a.up || 0) || (b.t || 0) - (a.t || 0) : (a, b) => (b.t || 0) - (a.t || 0));
  const n = list.length;
  const what = st.pil === "mine" ? " for your pillars" : st.pil === "any" ? "" : ` for ${st.pil}`;
  const sort = h("div.lib-sortrow", null, h("span", null, `${n} ${n === 1 ? "card" : "cards"}${what}`),
    h("button.lib-sort", { type: "button", "aria-label": `Order: ${st.sort === "loved" ? "Most loved" : "Newest"}. Tap to change.`,
      onclick: () => { st.sort = st.sort === "loved" ? "new" : "loved"; keep(); log("lib_sort", st.sort); draw(true); } },
      st.sort === "loved" ? "Most loved" : "Newest", SVG("M7 10l5 5 5-5", 12, 2.4)));
  let body;
  if (!L.at && !L.list.length) body = h("div.lib-empty", null, h("p", null, "The library opens when you're online."), h("p.sub", null, "It needs a connection the first time. After that, cards you add stay on this phone."));
  else if (!n) body = h("div.lib-empty", null, h("p", null, "No cards here yet."), h("p.sub", null, "Make a card in the evening and turn on Show it to everyone."));
  else body = h("div.lib-grid", null, list.map((c) => mini({ pillar: c.pillar, text: c.text, by: byLine(c.name), n: c.up || 0, stamp: isAdded(c.id) ? "In your deck" : null }, () => openView({ kind: "lib", c }))));
  return [chips, anyPills, minds, sort, body];
}

// Your deck: what you made, what you added, then the cards your pillars give you.
function yours() {
  const L = lib(), out = [];
  const sec = (title, kids) => h("section.lib-sec", null, h("h2.ph-h", null, title), h("div.lib-grid", null, kids));
  const made = deck.ownCards();
  if (made.length) out.push(sec("Made by you", made.slice().reverse().map((o) => {
    const s = sharedState(o.id), lc = s === "in" ? listCard(L.shared[o.id]) : null;
    const stamp = s === "in" ? "In the library" : s === "wait" || s === "send" ? "Waiting to be checked" : null;
    return mini({ pillar: o.pillar, text: o.text, by: "Made by you", n: lc ? lc.up || 0 : null, stamp }, () => openView({ kind: "own", o }));
  })));
  const added = L.added.map((sid) => [sid, L.cards[sid]]).filter(([, c]) => c);
  if (added.length) out.push(sec("From the library", added.slice().reverse().map(([sid, c]) => {
    const lc = listCard(sid);
    return mini({ pillar: c.pillar, text: c.text, by: byLine(c.name), n: lc ? lc.up || 0 : null }, () => openView({ kind: "lib", c: Object.assign({ id: sid }, c, lc ? { up: lc.up } : {}) }));
  })));
  const ids = deck.deck().filter((id) => typeof id === "number");
  deck.myPillars().forEach((p) => {
    const mine = ids.filter((id) => deck.card(id).pillar === p.name);
    if (mine.length) out.push(sec(p.name, mine.map((id) => { const c = deck.card(id); return mini({ pillar: c.pillar, text: c.text, by: c.size, n: null }, () => openView({ kind: "bank", id })); })));
  });
  if (!out.length) out.push(h("div.lib-empty", null, h("p", null, "Your cards will show here.")));
  return out;
}

// ---------------- One card, big ----------------
function openView(v) {
  const view = h("div.lib-view", { role: "dialog", "aria-modal": "true", "aria-label": "Card" });
  const foot = h("div.col.lib-foot", null);
  let face;
  if (v.kind === "bank") { face = cardEl(v.id, { big: true, tag: "div" }); face.classList.add("up"); }
  else if (v.kind === "own") { const s = sharedState(v.o.id), lc = s === "in" ? listCard(lib().shared[v.o.id]) : null;
    face = big({ pillar: v.o.pillar, text: v.o.text, by: s ? byLine(lib().name) : "Made by you", n: lc ? lc.up || 0 : null }); }
  else face = big({ pillar: v.c.pillar, text: v.c.text, by: byLine(v.c.name), n: v.c.up != null ? v.c.up : (listCard(v.c.id) || {}).up ?? null });
  const fill = () => {
    if (v.kind === "lib") {
      const c = v.c, mine = deck.myPillars().some((p) => p.name === c.pillar);
      if (isAdded(c.id)) foot.replaceChildren(
        h("p.lib-said", { "aria-live": "polite" }, mine ? "In your deck. It can come up in your morning draw." : `Added. It'll only come up in your draws if you pick ${c.pillar} as a pillar.`),
        h("button.btn-quiet", { type: "button", onclick: () => { remove(c.id); fill(); } }, "Remove"));
      else foot.replaceChildren(h("button.btn-main", { type: "button", onclick: () => { add(c); fill(); } }, "Add to my deck"));
    } else if (v.kind === "own") {
      const s = sharedState(v.o.id);
      if (!s || s === "no") {
        // Later, from Your deck: show a card you made to everyone. One screen: the name, then the button.
        const name = h("input.lib-name", { type: "text", maxlength: "24", value: lib().name, placeholder: "Name on the card (blank = anonymous)", "aria-label": "Name on the card", autocomplete: "off", enterkeyhint: "done" });
        name.addEventListener("input", () => { face.querySelector(".lib-by").textContent = byLine(name.value.trim()); });
        face.querySelector(".lib-by").textContent = byLine(lib().name);
        foot.replaceChildren(name, h("p.lib-said", null, "It's checked first, then anyone using Daydeck can see it."),
          h("button.btn-main", { type: "button", onclick: () => { share(v.o, name.value).then(() => page && draw(true)); fill(); } }, "Show it to everyone"));
      } else foot.replaceChildren(
        h("p.lib-said", { "aria-live": "polite" }, s === "in" ? "In the library." : "Waiting to be checked."),
        h("button.btn-quiet", { type: "button", onclick: () => { unshare(v.o.id); face.querySelector(".lib-by").textContent = "Made by you"; fill(); } }, s === "in" ? "Take it out of the library" : "Don't share it"));
    }
    if (page) draw(true);
  };
  view.append(h("div.lib-vhead", null, roundBtn("back", "Back", closeView), h("span.where", null, st.tab === "all" ? "Everyone's" : "Your deck"), h("span", { style: { width: "44px" } })),
    h("div.lib-vcard", null, face), foot);
  fill();
  page.append(view);
  requestAnimationFrame(() => requestAnimationFrame(() => view.classList.add("in")));
  if (v.kind === "lib") log("lib_view", { p: v.c.pillar });
}
function closeView() {
  const v = page && page.querySelector(".lib-view");
  if (!v) return;
  v.classList.remove("in");
  setTimeout(() => v.remove(), reduceMotion() ? 0 : 280);
}
