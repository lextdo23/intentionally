// Card looks (alex 2026-11-25, "Daydeck · Card looks" canvas: https://claude.ai/artifact/XZr5rWJwSHz2B7u3x6L6ZH).
// A look is a set of card backs (art, so the no-mascots rule doesn't apply to it). Each has a rank, and the rank says how
// many look cards you collect to open it: Open edition 3, Special edition 4, Rare edition 5, Masterpiece 8. That's
// separate from how many different backs it has (Cherry bow has one, Chrome five): one spot per card, and a back can
// come more than once. Every look can be collected from the start: you pick the one you're working towards (the first
// box asks, then the Looks shelf in Cards), and each box brings one card of it. Which back comes is the surprise:
// backs you don't have yet come first. Once all its cards are in, the look opens (a small moment), and it can go on
// today's card: a different back each day, its edge and the light behind it in its own colour. One look at a time,
// and the Daydeck card is always there to switch back to. The main button stays marigold whatever the look.
import { h, dayKey, reduceMotion } from "./util.js";
import * as store from "./store.js";
import { log } from "./tester.js";

export const RANKS = { open: ["Open edition", 3], special: ["Special edition", 4], rare: ["Rare edition", 5], master: ["Masterpiece", 8] };
// A NEW LOOK IS NOT DONE UNTIL IT HAS ITS FEED CARD (alex 2026-11-25): every look gets its own special treatment for a
// card shared on Friends (like Chrome's chrome edges or a Softies frog peeking over the card), designed with alex.
// See "Card looks" in CLAUDE.md.
// In rolodex order: quickest to open first. col: the light and glow ("r g b"); edge: the card's thickness, light to dark.
export const LOOKS = [
  { id: "cherry", name: "Cherry Coquette", rank: "open", kind: "art", backs: 1, col: "244 160 190", edge: ["#f9d2df", "#eaa9bf", "#cd839e"] },
  { id: "mono", name: "Mono", rank: "open", kind: "mono", backs: 1, col: "230 232 238", edge: ["#3c3c40", "#222225", "#0d0d0e"] },
  { id: "matcha", name: "Matcha", rank: "special", kind: "art", backs: 4, col: "134 204 74", edge: ["#a3da66", "#72b23a", "#4e8a25"] },
  { id: "mushroom", name: "Shrooomy", rank: "rare", kind: "art", backs: 5, col: "240 150 116", edge: ["#f8dbc9", "#e9b597", "#c78c6b"] },
  { id: "pals", name: "Softies Social Club", rank: "rare", kind: "art", backs: 5,   // each Pals back has its own colour
    cols: ["143 207 180", "183 163 220", "139 187 224", "224 199 102", "232 162 180"],
    edges: [["#b6e4cf", "#8fcfb4", "#5fa889"], ["#d4c7ec", "#b7a3dc", "#8a73b8"], ["#b6d5ee", "#8bbbe0", "#5b8fbb"], ["#efdd94", "#e0c766", "#b39a3c"], ["#f3c4d0", "#e8a2b4", "#c3738a"]] },
  { id: "chrome", name: "Chrome", rank: "master", kind: "chrome", art: ["heart", "moon", "sparkle", "spiky", "sun"], col: "205 210 220", edge: ["#e9eaee", "#a9abb2", "#6c6e75"] },
];
LOOKS.forEach((L) => { if (L.art) L.backs = L.art.length; });
const vars = (el, o) => { for (const [k, v] of Object.entries(o)) el.style.setProperty(k, v); return el; };   // h() can't set --custom values
export const byId = (id) => LOOKS.find((L) => L.id === id) || null;
export const need = (L) => RANKS[L.rank][1];
export const rankName = (L) => RANKS[L.rank][0];
export const colOf = (L, i = 0) => (L.cols ? L.cols[i % L.cols.length] : L.col);
export const edgeOf = (L, i = 0) => { const e = L.edges ? L.edges[i % L.edges.length] : L.edge; return `linear-gradient(180deg, ${e[0]}, ${e[1]} 40%, ${e[2]})`; };
export const src = (L, i) => (L.kind === "chrome" ? `img/chrome/${L.art[i % L.art.length]}.webp` : `img/looks/${L.id}/${i % L.backs}.webp`);

// ---------------- What you have ----------------
// Kept with the boxes: sets[id] = the backs collected, in order (repeats allowed); want = the look you're collecting.
// The look in use is store.look (it was already kept there).
function mem() { const s = store.get(), b = (s.boxes = s.boxes || {}); b.sets = b.sets || {}; return b; }
export const have = (L) => mem().sets[L.id] || [];
export const got = (L) => have(L).length;
export const isOpen = (L) => got(L) >= need(L);
export const allOpen = () => LOOKS.every(isOpen);
export function wantLook() {
  const b = mem();
  let L = byId(b.want);
  if (L && isOpen(L)) L = null;
  // Someone who'd already started a look before looks could be chosen (Chrome) carries on with it, unasked.
  if (!L && !b.want) { const started = LOOKS.filter((x) => got(x) && !isOpen(x)).sort((a, c) => got(c) - got(a))[0]; if (started) { b.want = started.id; store.save(); L = started; } }
  return L;
}
export const needsPick = () => !wantLook() && !allOpen();
export function setWant(id, from) { mem().want = id; store.save(); log("look_pick", { l: id, f: from }); }
// The next back for the look you're collecting: one you don't have yet if there is one, else any of them.
export function nextBack(L) {
  const mine = new Set(have(L)), missing = Array.from({ length: L.backs }, (_, i) => i).filter((i) => !mine.has(i));
  const pool = missing.length ? missing : Array.from({ length: L.backs }, (_, i) => i);
  return pool[Math.floor(Math.random() * pool.length)];
}
export const inUse = () => { const L = byId(store.get().look); return L && isOpen(L) ? L : null; };
export function use(id, from) { store.get().look = id || null; store.save(); log("look_use", { l: id || "daydeck", f: from }); }
// Today's back: a different one each day (never the same two days running), the same all day.
export function todayBack(L, k = dayKey()) {
  const n = Math.round(Date.parse(k + "T12:00:00Z") / 864e5);
  return ((n % L.backs) + L.backs) % L.backs;
}

// ---------------- Drawing a back ----------------
// One back of a look, filling whatever holds it. Art fills the card (its own rounded corners match the card's);
// Chrome lays its piece over the dark Chrome card, reaching just past the edges into the corners; Mono is type.
export function backEl(L, i = 0) {
  if (L.kind === "mono") return h("div.lk-back.lk-mono", { "aria-hidden": "true" }, h("span", null, "Day", h("br"), "deck"));
  return h(`div.lk-back.lk-${L.kind}`, { "aria-hidden": "true" }, h("img", { src: src(L, i), alt: "", draggable: "false" }));
}
// A small fanned hand, one spot per card the look needs: collected backs in colour (the newest lifted, with a ring in
// its colour), the rest as dashed outlines. Used under a look card in a box and on the Looks shelf.
export function handEl(L, { newest = false, size = 34 } = {}) {
  const mine = have(L), n = need(L), step = n > 5 ? 5 : 7, drop = n > 5 ? 2.5 : 4;
  const el = vars(h("div.lk-hand", { role: "img", "aria-label": `${L.name}: ${mine.length} of ${n} cards collected` }), { "--w": size + "px" });
  for (let j = 0; j < n; j++) {
    const side = j - (n - 1) / 2, on = newest && j === mine.length - 1;
    const spot = vars(h("div.lk-spot" + (j < mine.length ? "" : ".empty") + (on ? ".on" : ""), {
      style: { transform: `translateY(${(Math.abs(side) * drop - (on ? 6 : 0)).toFixed(1)}px) rotate(${(side * step).toFixed(1)}deg)${on ? " scale(1.14)" : ""}` } },
      j < mine.length ? backEl(L, mine[j]) : null), { "--ring": `rgb(${colOf(L, mine[j] || 0)})` });
    el.append(spot);
  }
  return el;
}

// ---------------- Full-screen moments: the stage ----------------
// Like the box: everything is laid out on a 430 x 932 stage scaled to fit the phone; words are never scaled, only
// placed to line up with it.
function stageRoot(cls, label) {
  const root = h(`div.lk-full.${cls}`, { role: "dialog", "aria-modal": "true", "aria-label": label });
  const stage = h("div.lk-stage");
  root.append(stage);
  const fit = () => {
    const z = Math.min(innerWidth / 430, innerHeight / 932);
    root.style.setProperty("--z", z.toFixed(4)); root.style.setProperty("--oy", Math.max(0, (innerHeight - 932 * z) / 2).toFixed(1) + "px");
  };
  fit(); addEventListener("resize", fit);
  const close = (then) => {
    root.classList.remove("on"); removeEventListener("resize", fit);
    setTimeout(() => { root.remove(); document.body.classList.remove("in-flow"); then && then(); }, reduceMotion() ? 150 : 450);
  };
  const show = () => { document.body.classList.add("in-flow"); document.body.append(root); requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("on"))); };
  return { root, stage, close, show };
}
const at = (y) => `calc(var(--oy) + ${y}px * var(--z))`;

// ---------------- Pick a look (a rolodex you swipe, round and round) ----------------
// mode "first": the first box asks before it opens. "next": after a look opens, the same rolodex picks the next one,
// without the looks already yours. Collect sets it. There's no "Choose later" (alex 2026-11-26): a look is always
// picked, and looks already yours are never offered again, whichever question it is.
export function pickLook(mode, onDone) {
  const list = LOOKS.filter((L) => !isOpen(L));
  if (!list.length) return onDone && onDone(null);
  const still = reduceMotion(), N = list.length, STEP = 150;
  const { root, stage, close, show } = stageRoot("lk-pick", mode === "next" ? "Pick your next look" : "Pick a look to collect");
  let i = mode === "next" ? Math.max(0, list.findIndex((L) => L.rank !== "open")) : 0, dx = 0, drag = false, back = 0, auto = true, moved = false, prev = {};
  const xAt = (p) => Math.sign(p) * (Math.abs(p) <= 1 ? Math.abs(p) * 132 : 132 + (Math.abs(p) - 1) * 62);
  const wrap = (x) => x - N * Math.round(x / N);
  const cur = () => list[((i % N) + N) % N];

  const halo = h("div.lk-halo");
  const roll = h("div.lk-roll", { role: "group", "aria-roledescription": "carousel", "aria-label": "Looks" });
  const cards = list.map((L, k) => {
    const c = h("button.lk-rc", { type: "button", "aria-label": `${L.name}, ${rankName(L)}, ${got(L)} of ${need(L)} cards` }, backEl(L, 0));
    c.addEventListener("click", () => { if (!moved) go(i + Math.round(wrap(k - i))); });
    roll.append(c); return c;
  });
  const hand = h("div.lk-mini", { role: "group" });
  stage.append(halo, roll, hand);
  const eyebrow = h("span.lk-eye", null, mode === "next" ? "Pick your next look" : "Pick a look to collect");
  const rank = h("h1.lk-rank", { "aria-live": "polite" });
  const name = h("span.lk-name"), count = h("span.lk-count");
  const dots = h("div.lk-dots", null, list.map((L, k) => h("button", { type: "button", "aria-label": `Show ${L.name}`, onclick: () => go(i + Math.round(wrap(k - i))) }, h("i"))));
  const collect = h("button.btn-main", { type: "button", onclick: () => { const L = cur(); setWant(L.id, mode); clearInterval(timer); close(() => onDone && onDone(L.id)); } });
  root.append(h("div.lk-top", { style: { top: at(76) } }, eyebrow, rank), h("div.lk-under", { style: { top: at(640) } }, name, count, dots), h("div.lk-btns", null, collect));

  function paintHand(deal) {
    const L = cur();
    if (L.backs < 2) { hand.replaceChildren(); hand.hidden = true; return; }
    hand.hidden = false; hand.setAttribute("aria-label", `${L.backs} different backs`);
    hand.replaceChildren(...Array.from({ length: L.backs }, (_, j) => {
      const m = L.backs, side = j - (m - 1) / 2;
      const b = h("button.lk-mc", { type: "button", "aria-label": `Show back ${j + 1} of ${m}`, onclick: () => { back = j; auto = false; paint(); } }, backEl(L, j));
      b.dataset.side = String(side);
      b.style.setProperty("--ring", `rgb(${colOf(L, j)})`);
      if (deal && !still) { b.style.transition = "none"; b.style.transform = "translateY(46px) scale(.4)"; b.style.opacity = "0"; b.style.transitionDelay = j * 70 + "ms"; }
      return b;
    }));
    if (deal && !still) requestAnimationFrame(() => requestAnimationFrame(() => hand.querySelectorAll(".lk-mc").forEach((b) => { b.style.transition = ""; b.style.opacity = ""; paintMini(b); })));
  }
  function paintMini(b) {
    const j = [...hand.children].indexOf(b), on = j === back % cur().backs;
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
    const side = +b.dataset.side;
    b.style.transform = `translateY(${Math.abs(side) * 4 - (on ? 10 : 0)}px) rotate(${side * 7}deg)${on ? " scale(1.14)" : ""}`;
  }
  function paint() {
    const L = cur(), k0 = ((i % N) + N) % N;
    cards.forEach((c, k) => {
      const p = wrap(k - i + dx / STEP), a = Math.abs(p), jump = prev[k] != null && Math.abs(p - prev[k]) > N / 2;
      prev[k] = p;
      c.style.transition = drag || jump || still ? "none" : "";
      c.style.transform = `translateX(${xAt(p).toFixed(1)}px) translateZ(${(-Math.min(a, 2.5) * 90).toFixed(1)}px) rotateY(${(-Math.max(-1, Math.min(1, p)) * 38).toFixed(1)}deg)`;
      c.style.opacity = a > 2.6 ? "0" : "1";
      c.style.filter = `brightness(${Math.max(0.55, 1 - a * 0.2).toFixed(2)})`;
      c.style.zIndex = String(20 - Math.round(a * 4));
      c.classList.toggle("mid", k === k0 && a < 0.5);
      c.style.setProperty("--ring", `rgb(${colOf(list[k], k === k0 ? back : 0)})`);
      c.setAttribute("aria-current", String(k === k0));
    });
    // the middle card shows the back that's lifted in the hand
    if (L.backs > 1) { const want = back % L.backs, img = cards[k0].querySelector("img"), s = src(L, want); if (img && !img.src.endsWith(s)) img.src = s; }
    hand.querySelectorAll(".lk-mc").forEach(paintMini);
    halo.style.setProperty("--c", colOf(L, back));
    rank.textContent = rankName(L); name.textContent = L.name; count.textContent = `${got(L)}/${need(L)} cards`;
    collect.textContent = `Collect ${L.name}`;
    [...dots.children].forEach((d, k) => d.classList.toggle("on", k === k0));
  }
  function go(k) {
    const was = ((i % N) + N) % N;
    if (k !== i) { const L0 = list[was]; if (L0.backs > 1) { const img = cards[was].querySelector("img"); if (img) img.src = src(L0, 0); } }
    const changed = k !== i; i = k; dx = 0;
    if (changed) { back = 0; auto = true; paintHand(true); }
    paint();
  }
  let p0 = null;
  roll.addEventListener("pointerdown", (e) => { p0 = { x: e.clientX, y: e.clientY, on: false }; moved = false; });
  roll.addEventListener("pointermove", (e) => {
    if (!p0) return;
    const d = e.clientX - p0.x;
    if (!p0.on) { if (Math.abs(d) < 8 || Math.abs(d) < Math.abs(e.clientY - p0.y)) return; p0.on = true; moved = true; try { roll.setPointerCapture(e.pointerId); } catch (err) {} }
    const z = parseFloat(getComputedStyle(root).getPropertyValue("--z")) || 1;
    dx = d / z; drag = true; paint();
  });
  const up = () => {
    if (!p0) return; const was = p0.on; p0 = null; if (!was) return;
    drag = false; const k = Math.round(i - dx / STEP);
    go(dx < -40 && k === i ? i + 1 : dx > 40 && k === i ? i - 1 : k);
    setTimeout(() => { moved = false; }, 0);
  };
  roll.addEventListener("pointerup", up); roll.addEventListener("pointercancel", up);
  root.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") go(i + 1); if (e.key === "ArrowLeft") go(i - 1); });
  // the backs take turns on the big card until one is tapped
  const timer = still ? 0 : setInterval(() => { if (!drag && auto && cur().backs > 1) { back++; paint(); } }, 2400);
  paintHand(true); paint(); show();
  log("look_pick_seen", mode);
  setTimeout(() => collect.focus({ preventScroll: true }), 500);
}

// ---------------- A look up close (alex 2026-11-25) ----------------
// Tap a look on the shelf: it fills the screen, big, with every back it has underneath. Swipe the card, or tap a
// small back, to see each one. The button says what you can do with it: Use (open), Collect (not started); while
// it's the one you're collecting, or it's on today's card, a quiet line says so instead.
export function viewLook(L, onChange) {
  const still = reduceMotion(), m = L.backs;
  const { root, stage, close, show } = stageRoot("lk-view", L.name);
  let back = L === inUse() ? todayBack(L) : 0;
  const halo = h("div.lk-halo");
  const big = h("div.lk-big", { role: "img" });
  const minis = h("div.lk-mini.lk-vmini", { role: "group", "aria-label": `${m} different backs` });
  stage.append(halo, big, minis);
  const x = h("button.lk-x", { type: "button", "aria-label": "Close", onclick: () => close() }, "×");
  const which = h("span.lk-count");
  const under = h("div.lk-under", { style: { top: at(m > 1 ? 690 : 640) } });
  const n = got(L), w = wantLook();
  if (isOpen(L)) under.append(h("span.lk-count", null, m > 1 ? `${m} backs` : "One back"));
  else under.append(h("span.lk-count", null, `${n}/${need(L)} cards`));
  const btns = h("div.lk-btns");
  const done = (then) => close(() => { onChange && onChange(); then && then(); });
  if (isOpen(L) && L !== inUse()) btns.append(h("button.btn-main", { type: "button", onclick: () => { use(L.id, "view"); done(); } }, "Use"));
  else if (isOpen(L)) btns.append(h("p.lk-note", null, "On today's card"));
  else if (L === w) btns.append(h("p.lk-note", null, "You're collecting this one"));
  else btns.append(h("button.btn-main", { type: "button", onclick: () => { setWant(L.id, "view"); done(); } }, "Collect"));
  root.append(x, h("div.lk-top", { style: { top: at(84) } }, h("span.lk-eye", null, rankName(L)), h("h1.lk-rank", null, L.name)), under, btns);

  function paint() {
    const j = ((back % m) + m) % m;
    big.replaceChildren(backEl(L, j));
    big.setAttribute("aria-label", m > 1 ? `${L.name}, back ${j + 1} of ${m}` : L.name);
    big.style.setProperty("--ring", `rgb(${colOf(L, j)})`);
    halo.style.setProperty("--c", colOf(L, j));
    minis.querySelectorAll(".lk-mc").forEach((b, k) => {
      const on = k === j, side = k - (m - 1) / 2;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
      b.style.transform = `translateY(${Math.abs(side) * 4 - (on ? 10 : 0)}px) rotate(${side * 7}deg)${on ? " scale(1.14)" : ""}`;
    });
  }
  if (m > 1) minis.append(...Array.from({ length: m }, (_, k) => {
    const b = h("button.lk-mc", { type: "button", "aria-label": `Show back ${k + 1} of ${m}`, onclick: () => { back = k; paint(); } }, backEl(L, k));
    b.style.setProperty("--ring", `rgb(${colOf(L, k)})`);
    return b;
  }));
  else minis.hidden = true;
  // swipe the big card for the next or last back
  let p0 = null;
  big.addEventListener("pointerdown", (e) => { p0 = { x: e.clientX, y: e.clientY }; });
  const up = (e) => {
    if (!p0 || m < 2) { p0 = null; return; }
    const d = e.clientX - p0.x, dy = e.clientY - p0.y; p0 = null;
    if (Math.abs(d) > 40 && Math.abs(d) > Math.abs(dy)) { back += d < 0 ? 1 : -1; paint(); }
  };
  big.addEventListener("pointerup", up); big.addEventListener("pointercancel", () => { p0 = null; });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    if (m > 1 && e.key === "ArrowRight") { back++; paint(); }
    if (m > 1 && e.key === "ArrowLeft") { back--; paint(); }
  });
  if (still) root.classList.add("still");
  paint(); show();
  log("look_view", L.id);
  setTimeout(() => x.focus({ preventScroll: true }), 500);
}

// ---------------- A look opens ----------------
// The collected cards arrive as one stack, spread into a fan from the middle out, the light blooms in the look's
// colour with one ring spreading out, a shine sweeps each card, then the words. Tap the cards to see it again.
// Use it now puts it on today's card; Not now leaves it on the shelf.
export function opened(L, onDone) {
  const still = reduceMotion();
  const { root, stage, close, show } = stageRoot("lk-open", `${L.name} is open`);
  const m = L.backs, c = colOf(L, 0);
  const halo = vars(h("div.lk-bloom"), { "--c": c }), ring = vars(h("div.lk-ring"), { "--c": c });
  const fan = h("button.lk-fan", { type: "button", "aria-label": `The ${L.name} cards. Tap to see it again.` });
  const order = Array.from({ length: m }, (_, j) => Math.abs(j - (m - 1) / 2));   // opens from the middle out
  const cards = Array.from({ length: m }, (_, j) => {
    const side = j - (m - 1) / 2;
    const el = vars(h("div.lk-fc", { style: { zIndex: String(10 - Math.round(order[j] * 2)) } }, backEl(L, j), h("i.lk-sh")),
      { "--ring": `rgb(${colOf(L, j)})`, "--to": `translateX(${side * 66}px) translateY(${Math.abs(side) * 10 - 6}px) rotate(${side * 7}deg)`, "--from": `translateY(34px) rotate(${(j % 2 ? 1 : -1) * (j + 1)}deg) scale(.92)`, "--d": order[j] * 70 + "ms" });
    fan.append(el); return el;
  });
  stage.append(halo, ring, fan);
  const top = h("div.lk-top.lk-late", { style: { top: at(96) } }, h("span.lk-eye", null, `${need(L)}/${need(L)} cards`), h("h1.lk-rank", null, `${L.name} is open`), h("span.lk-count", null, rankName(L)));
  const line = h("p.lk-line.lk-late", { style: { top: at(596) } }, m > 1 ? `Use it and your daily card comes in a different ${L.name} back each day.` : `Use it and your daily card comes as ${L.name}.`);
  const useBtn = h("button.btn-main", { type: "button", onclick: () => { use(L.id, "open"); close(() => onDone && onDone()); } }, "Use it now");
  const notNow = h("button.btn-quiet", { type: "button", onclick: () => { log("look_notnow", L.id); close(() => onDone && onDone()); } }, "Not now");
  const btns = h("div.lk-btns.lk-late", null, useBtn, notNow, h("span.lk-note", null, "You can switch looks any time in Cards."));
  root.append(top, line, btns);
  let t = [];
  const play = () => {
    t.forEach(clearTimeout); t = [];
    if (still) { root.dataset.ph = "5"; return; }
    root.dataset.ph = "0"; void root.offsetWidth;
    [[1, 450], [2, 1150], [3, 1550], [4, 2050], [5, 2500]].forEach(([ph, ms]) => t.push(setTimeout(() => { root.dataset.ph = String(ph); }, ms)));
  };
  fan.addEventListener("click", play);
  show(); play();
  log("look_open", L.id);
  setTimeout(() => useBtn.focus({ preventScroll: true }), still ? 300 : 2600);
  void cards;
}
// After a look opens in a box: show the moment, then ask which look to collect next (while there's one left).
export function afterOpen(L, onDone) {
  opened(L, () => { if (allOpen()) return onDone && onDone(); pickLook("next", () => onDone && onDone()); });
}

// ---------------- The Looks shelf (Cards › Looks) ----------------
// Yours (the Daydeck card and every open look: Use / In use), Collecting (the look you're working towards, as the hand
// of spots), Still to collect (Collect). Every button here is one size, whatever it says (DESIGN.md rule 13b).
export function shelf(redraw) {
  const using = inUse(), w = wantLook();
  // Tap a look's picture or name to see it up close, with all its backs (alex 2026-11-25).
  const row = (thumb, title, sub, btn, L) => h("div.lk-srow", null,
    h(L ? "button.lk-sopen" : "div.lk-sopen", L ? { type: "button", "aria-label": `See ${title} up close`, onclick: () => viewLook(L, redraw) } : null,
      thumb, h("div.lk-stext", null, h("span.t", null, title), h("span.s", null, sub))), btn);
  const thumbOf = (L) => h("div.lk-thumb", null, L ? backEl(L, L === using ? todayBack(L) : 0) : h("div.lk-back.lk-daydeck"));
  const useBtn = (id, on) => h("button.lk-btn" + (on ? ".in" : ""), { type: "button", "aria-pressed": String(on), onclick: () => { if (on) return; use(id, "shelf"); redraw(); } }, on ? "In use" : "Use");
  const mine = LOOKS.filter(isOpen);
  const out = [h("h2.ph-h", null, "Yours"),
    h("div.lk-list", null, row(thumbOf(null), "Daydeck", "The everyday card", useBtn(null, !using)),
      ...mine.map((L) => row(thumbOf(L), L.name, `${rankName(L)}${L.backs > 1 ? ` · ${L.backs} backs` : ""}`, useBtn(L.id, using === L), L)))];
  if (w) out.push(h("h2.ph-h", null, "Collecting"), h("button.lk-coll", { type: "button", "aria-label": `See ${w.name} up close`, onclick: () => viewLook(w, redraw) },
    h("div.lk-chead", null, h("span.t", null, w.name, h("span.r", null, ` · ${rankName(w)}`)), h("span.n", null, `${got(w)}/${need(w)} cards`)), handEl(w, { size: 38 })));
  const rest = LOOKS.filter((L) => !isOpen(L) && L !== w);
  if (rest.length) out.push(h("h2.ph-h", null, "Still to collect"), h("div.lk-list", null, rest.map((L) =>
    row(thumbOf(L), L.name, `${rankName(L)} · ${got(L)}/${need(L)} cards`, h("button.lk-btn", { type: "button", onclick: () => { setWant(L.id, "shelf"); redraw(); } }, "Collect"), L))));
  if (!rest.length && !w) out.push(h("p.lk-done", null, "You've collected every look. New ones are on the way."));
  return out;
}
