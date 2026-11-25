// Boxes (alex 2026-11-17/18, thread "Design the pack opening"). Each level reached earns a box: one plain Daydeck box,
// so what's inside stays a surprise. Inside, in this order: two cards new to you (one each from two of your pillars,
// joining your draws from tomorrow), one extra to keep for when you need it, and last, the highlight: one card of a
// look (a set, front and back matching, never a repeat). Opening mockup: https://claude.ai/artifact/Y57V5Z2BzKqEhja9A4SbD8
//
// Extras and odds (alex): one more draw 45, a rest day 15, Pick my own 10, out of 70. "Send a card" came out of the
// boxes for good (alex 2026-11-18: sending is a task, not a reward), so its old 30 is shared by the other three in the
// same proportions (about 64%, 21% and 14%). Pick my own always comes in the 2nd box.
// No more than 2 unused rest days are kept.
// Looks (alex 2026-11-25, js/looks.js): the look card is always from the look you're collecting. The first box asks
// which (a rolodex) before it opens; choosing later means that box brings a second extra instead. When the last card
// of a look comes, Done shows it opening, then asks which look to collect next.
import { h, dayKey, addDays, reduceMotion } from "./util.js";
import * as store from "./store.js";
import * as deck from "./deck.js";
import * as levels from "./levels.js";
import { LIVE as BANK } from "./cards-data.js";   // only live cards come out of boxes
import { log } from "./tester.js";
import * as looks from "./looks.js";

export const LOOKS = looks.LOOKS;
export const EXTRA = {
  draw: { name: "One more draw", text: "For a morning when none of the three fit. It waits until you need it." },
  rest: { name: "A rest day", text: "One more rest day, for a week that needs it. It waits until you need it." },
  pick: { name: "Pick my own", text: "For a morning you know what you need: choose any card from your deck. It waits until you need it." },
};
const ODDS = { draw: 45, rest: 15, pick: 10 };
const MAX_REST = 2;

export function mem() {
  const s = store.get(), b = (s.boxes = s.boxes || {});
  b.extras = Object.assign({ draw: 0, rest: 0, pick: 0 }, b.extras || {});
  b.sets = b.sets || {}; b.added = b.added || []; b.boost = b.boost || {};
  return b;
}
export const waiting = () => levels.packsWaiting();
export const extras = () => mem().extras;
export function useExtra(kind) {
  const x = mem().extras;
  if (!x[kind]) return false;
  x[kind]--; store.save(); log("extra_use", kind);
  return true;
}

const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pickW = (items, ws) => { let r = Math.random() * ws.reduce((a, b) => a + b, 0); for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; } return items[items.length - 1]; };

// Cards of your pillars you haven't met yet: from your own deck first, then the rest of the bank for those pillars.
// Two different pillars when that's possible.
function newCards(want) {
  const m = deck.mem(), b = mem(), mine = deck.myPillars().map((p) => p.name), inDeck = new Set(deck.deck());
  const fresh = (id) => !m.seen[id] && !b.boost[id];
  const pools = [[...inDeck].filter((id) => typeof id === "number" && fresh(id)),
    BANK.filter((r) => mine.includes(r[1]) && !inDeck.has(r[0]) && fresh(r[0])).map((r) => r[0])];
  const out = [];
  for (const sameOk of [false, true]) for (const pool of pools) for (const id of shuffle(pool)) {
    if (out.length >= want) break;
    if (out.includes(id) || (!sameOk && out.some((o) => deck.card(o).pillar === deck.card(id).pillar))) continue;
    out.push(id);
  }
  return out;
}
function rollExtra(already) {
  const held = mem().extras.rest + already.filter((x) => x === "rest").length;
  const kinds = Object.keys(ODDS).filter((k) => k !== "rest" || held < MAX_REST);
  return pickW(kinds, kinds.map((k) => ODDS[k]));
}
// The next card of the look you're collecting (backs you don't have yet come first). None picked: no look card.
function nextPiece() {
  const L = looks.wantLook();
  return L ? { look: L.id, i: looks.nextBack(L) } : null;
}

// What's in the next box. Decided when the box is shown, kept once it's opened (so closing the app halfway loses nothing).
function planBox() {
  const n = ((store.get().levels || {}).opened || 0) + 1, out = [], xs = [];
  newCards(2).forEach((id) => out.push({ kind: "new", id }));
  const x1 = n === 2 ? "pick" : rollExtra(xs); xs.push(x1); out.push({ kind: "extra", x: x1 });
  const piece = nextPiece();
  if (piece) out.push({ kind: "set", ...piece });
  else { const x2 = rollExtra(xs); xs.push(x2); out.push({ kind: "extra", x: x2 }); }
  return out;
}
function keepBox(out) {
  const b = mem(), lv = (store.get().levels = store.get().levels || {}), n = (lv.opened || 0) + 1, from = addDays(dayKey(), 1);
  const inDeck = new Set(deck.deck());
  out.forEach((c) => {
    if (c.kind === "new") { b.boost[c.id] = from; if (!inDeck.has(c.id)) b.added.push(c.id); }
    else if (c.kind === "extra") b.extras[c.x]++;
    else (b.sets[c.look] = b.sets[c.look] || []).push(c.i);
  });
  lv.opened = n; store.save();
  const set = out.find((c) => c.kind === "set");
  log("box_open", { n, c: out.filter((c) => c.kind === "new").map((c) => c.id), x: out.filter((c) => c.kind === "extra").map((c) => c.x), s: set ? set.look : null, p: set ? b.sets[set.look].length : 0 });
}

// ---------------- The screen ----------------
const PACE = [["6.4s", "10.2s", "-1.3s"], ["7.6s", "12.4s", "-4.1s"], ["8.3s", "9.6s", "-2.6s"], ["7s", "11.4s", "-5.2s"]];
const INBOX = [30, 10, -10, -30];                             // where each card sits inside the box, front to back
const FAN = [[-16, -4], [-5, -1.3], [6, 1.5], [17, 4.2]];      // spread as they come out: x, tilt
const ROWX = { 1: [0], 2: [-65, 65], 3: [-130, 0, 130] };
const ROWY = -262, ROWS = 0.42, BIG = [0, 74, 0.86], UP = [0, 3, 0.9, 130];

// Builds a box of w x h x d inside el. faces: { front, back, left, right, top, bottom } = class names.
function cuboid(el, w, hh, d, faces, kids = {}) {
  const T = {
    front: [w, hh, `translateZ(${d / 2}px)`], back: [w, hh, `rotateY(180deg) translateZ(${d / 2}px)`],
    right: [d, hh, `translateX(${(w - d) / 2}px) rotateY(90deg) translateZ(${w / 2}px)`], left: [d, hh, `translateX(${(w - d) / 2}px) rotateY(-90deg) translateZ(${w / 2}px)`],
    top: [w, d, `translateY(${(hh - d) / 2}px) rotateX(90deg) translateZ(${hh / 2}px)`], bottom: [w, d, `translateY(${(hh - d) / 2}px) rotateX(-90deg) translateZ(${hh / 2}px)`],
  };
  for (const [k, cls] of Object.entries(faces)) {
    const [fw, fh, tr] = T[k], f = h("div.bx-f." + cls, { style: { width: fw + "px", height: fh + "px", transform: tr } }, kids[k] || null);
    el.append(f);
  }
}
const face = (tr, wh, cls) => h("div.bx-f." + cls, { style: Object.assign({ transform: tr }, wh) });

function front(c) {
  if (c.kind === "set") {
    const L = looks.byId(c.look);
    return h("div.face.fr.lk-face", { role: "img", "aria-label": `${L.name} card` }, looks.backEl(L, c.i), h("div.sheen"));
  }
  if (c.kind === "extra") {
    const e = EXTRA[c.x];
    return h("div.face.fr", null, h("div.tagrow", null, h("span.tg.x", null, h("i"), "Extra")), h("span.tk", null, e.name), h("span.wy", null, e.text));
  }
  const d = deck.card(c.id);
  return h("div.face.fr", null, h("div.tagrow", null, h("span.tg", null, h("i", { style: { background: deck.PILLAR_COL[d.pillar] || "#a9a59d" } }), d.pillar), h("span.nw", null, "New")),
    h("span.tk", null, d.text), d.source ? h("span.wy", null, d.source) : null);
}
// What's said under a card once it's turned, and the label once it's put down.
function words(c) {
  if (c.kind === "new") { const p = deck.card(c.id).pillar; return { n: `New for ${p}`, s: "Joins your draws from tomorrow", l: p, ls: "New card" }; }
  if (c.kind === "extra") return { n: EXTRA[c.x].name, s: "Kept for when you need it", l: EXTRA[c.x].name, ls: "Extra" };
  const L = looks.byId(c.look), got = looks.got(L), n = looks.need(L);
  return { n: `${L.name} · ${looks.rankName(L)}`, s: `${got}/${n} cards`, l: L.name, ls: `${got}/${n} cards`, hand: L };
}

export function openBox(onDone) {
  if (waiting() < 1) return;
  // The first box (or any box while no look is picked) asks which look to collect, before it opens.
  if (looks.needsPick() && !mem().askedFor?.[(store.get().levels || {}).opened || 0]) {
    const b = mem(); b.askedFor = { [(store.get().levels || {}).opened || 0]: 1 }; store.save();
    return looks.pickLook("first", () => openBoxNow(onDone));
  }
  openBoxNow(onDone);
}
function openBoxNow(onDone) {
  const reduce = reduceMotion();
  const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? Math.min(ms, 150) : ms));
  const set = (n, k, v) => n.style.setProperty(k, v);
  const lvl = ((store.get().levels || {}).opened || 0) + 2;
  const items = planBox(), cards = [];
  let step = -1, busy = false, kept = false;

  const root = h("div.bx", { role: "dialog", "aria-modal": "true", "aria-label": "A new box" });
  const stage = h("div.bx-stage"), halo2 = h("div.bx-halo2"), beam = h("div.bx-beam");
  const body = h("div.bx-p3.bx-body"), lid = h("div.bx-p3.bx-lid");
  const box = h("div.bx-p3.bx-box", { role: "button", tabindex: "0", "aria-label": "Open the box" }, body, lid);
  const tilt = h("div.bx-tilt", null, beam, box);
  const anchor = h("div.bx-anchor", null, h("div.bx-bob", null, h("div.bx-sway", null, tilt)));
  stage.append(h("div.bx-halo"), halo2, h("div.bx-scene", null, anchor));
  const top = h("div.bx-top", null, h("span.lv", null, `Level ${lvl}`), h("span.t", null, "A new box"));
  const capN = h("span.n"), capS = h("span.s"), dots = h("div.bx-dots", { hidden: true }), cap = h("div.bx-cap", { "aria-live": "polite" }, capN, capS, dots);
  const hint = h("p.bx-hint", { "aria-live": "polite" }, "Tap the box to open it");
  const later = h("button.btn-quiet", { onclick: () => { if (busy || step > -1) return; log("box_later"); leave(); } }, "Keep it for later");
  const done = h("button.btn-main", { hidden: true, onclick: () => { log("box_done"); leave(opening); } }, "Done");
  root.append(stage, top, cap, hint, h("div.bx-btns", null, done, later));

  cuboid(body, 260, 338, 200, { front: "bx-front", back: "bx-dark", left: "bx-shL", right: "bx-shR", bottom: "bx-dark" },
    { front: [h("div.frame"), h("div.word", null, "DAYDECK"), h("div.nm", null, "A NEW BOX"), h("div.sub", null, `${items.length} CARDS INSIDE`)] });
  body.append(face("translateX(4px) translateY(-92px) rotateX(90deg) translateZ(-4px)", { width: "252px", height: "192px" }, "bx-glowfloor"));
  [["252px", "translateX(4px) translateY(4px) translateZ(-96px)"], ["192px", "translateX(30px) translateY(4px) rotateY(90deg) translateZ(-126px)"],
    ["192px", "translateX(30px) translateY(4px) rotateY(-90deg) translateZ(-126px)"]].forEach(([w, tr]) => body.append(face(tr, { width: w, height: "330px" }, "bx-inner")));
  cuboid(lid, 268, 58, 208, { front: "bx-lfront", back: "bx-lfront", left: "bx-shL", right: "bx-shR", top: "bx-ltop", bottom: "bx-linside" });

  const fit = () => {
    const z = Math.min(innerWidth / 430, innerHeight / 932);
    set(root, "--z", z.toFixed(4)); set(root, "--oy", Math.max(0, (innerHeight - 932 * z) / 2).toFixed(1) + "px");
  };
  fit(); addEventListener("resize", fit);

  const place = (c, x, y, s, z = 0, rz = 0, rx = 0) => { set(c, "--x", x + "px"); set(c, "--y", y + "px"); set(c, "--s", s); set(c, "--zz", z + "px"); set(c, "--rz", rz + "deg"); set(c, "--rx", rx + "deg"); };
  const amp = (c, sa, oa) => { set(c, "--bx-sa", sa); set(c, "--bx-oa", oa); };

  // Cards are made once the box opens (that's when what's inside is decided).
  const makeCards = () => {
    items.forEach((it, i) => {
      const inn = h("div.in", null, h("div.face.bk"), front(it));
      const mo = h("div.bx-mo", null, h("div.glow"), inn);
      set(mo, "--d1", PACE[i % 4][0]); set(mo, "--d2", PACE[i % 4][1]); set(mo, "--dl", PACE[i % 4][2]);
      const c = h("div.bx-p3.bx-card", { "aria-label": "Face-down card" }, h("div.bx-ms", null, mo));
      c.addEventListener("click", () => next());
      place(c, 0, 0, 0.96, INBOX[i % 4]);
      cards.push(c);
    });
    cards.slice().reverse().forEach((c) => tilt.append(c));   // the first card sits in front
  };
  // A look that this box finished opens after Done (then the next look is picked).
  let opening = null;
  const leave = (L) => {
    root.classList.remove("on"); removeEventListener("resize", fit);
    setTimeout(() => { root.remove(); document.body.classList.remove("in-flow"); if (L) looks.afterOpen(L, () => onDone && onDone(kept)); else onDone && onDone(kept); }, reduce ? 150 : 500);
  };

  async function open() {
    if (busy || step > -1) return; busy = true;
    const setItem = items.find((c) => c.kind === "set"), L0 = setItem && looks.byId(setItem.look), wasOpen = L0 && looks.isOpen(L0);
    keepBox(items); kept = true; makeCards();
    if (L0 && !wasOpen && looks.isOpen(L0)) opening = L0;
    hint.style.opacity = 0; later.hidden = true; top.style.opacity = 0;
    lid.classList.add("open"); beam.classList.add("on");          // the lid swings open on its back hinge, light spills out
    await wait(1700);
    // the box keeps its shape and slides down out of view while the cards lift out of it, one at a time
    box.classList.add("gone"); beam.classList.remove("on");
    for (let i = cards.length - 1; i >= 0; i--) {
      const c = cards[i]; c.classList.add("rise");
      place(c, FAN[i % 4][0], -150 + i * 6, 1, INBOX[i % 4], FAN[i % 4][1], -6); amp(c, 0.5, 0);
      await wait(240);
    }
    await wait(900);
    root.classList.add("cards");                                  // the pile settles in the middle and floats as one
    cards.forEach((c, i) => { c.classList.remove("rise"); place(c, i * 1.5, 3 - i * 2, 1, -i * 4, i ? (i % 2 ? 1.2 : -1.4) : 0); amp(c, 1, 0); });
    await wait(1000);
    hint.textContent = "Tap to turn it over"; hint.style.opacity = 1;
    step = 0; busy = false;
  }

  const last = () => cards.length - 1;
  async function next() {
    if (step < 0) return open();
    if (busy || step > last() + 1) return; busy = true;
    hint.style.opacity = 0; cap.classList.remove("on");
    const row = ROWX[Math.min(3, last())] || [0];
    if (step > 0 && step <= last()) { const c0 = cards[step - 1]; place(c0, row[step - 1] || 0, ROWY, ROWS, 30); amp(c0, 0, 0.25); await wait(500); }
    if (step === last() + 1) {   // the last card settles, bigger, below the row
      const c = cards[last()]; place(c, BIG[0], BIG[1], BIG[2], 30); amp(c, 0, 0.6);
      halo2.classList.remove("breathe"); halo2.classList.add("soft"); set(halo2, "--hy", "570px");
      root.classList.add("fin"); done.hidden = false; done.focus({ preventScroll: true }); step++; busy = false; return;
    }
    const c = cards[step], it = items[step], w = words(it);
    if (step === last() && it.kind === "set") {   // the set card: glow builds first, then a slow turn and a shine
      halo2.style.setProperty("--lkc", looks.colOf(looks.byId(it.look), it.i)); halo2.classList.add("lk");   // the light takes the look's colour
      halo2.classList.add("on"); c.classList.add("charge"); place(c, ...UP); amp(c, 0, 1);
      await wait(2400);
      c.classList.add("slow", "up");
      await wait(1500);
      c.classList.add("shine"); halo2.classList.add("breathe");
      await wait(900);
    } else {   // lift it off the pile first, then turn it, so it never passes through the others
      place(c, ...UP); amp(c, 0, 1);
      await wait(800);
      c.classList.add("up");
      await wait(800);
    }
    c.setAttribute("aria-label", `${w.n}. ${w.s}`);
    capN.textContent = w.n; capS.textContent = w.s;
    dots.hidden = !w.dots;
    if (w.dots) dots.replaceChildren(...Array.from({ length: w.dots[1] }, (_, i) => h(i < w.dots[0] ? "i.on" : "i")));
    cap.querySelector(".lk-hand")?.remove();
    if (w.hand) cap.append(looks.handEl(w.hand, { newest: true }));
    cap.classList.add("on");
    // its label for the end
    const isBig = step === last(), x = isBig ? 0 : (row[step] || 0), y = isBig ? 726 : 301;
    root.append(h("div.bx-lab" + (isBig ? ".big" : ""), { style: { left: `calc(50% + ${x}px * var(--z))`, top: `calc(var(--oy) + ${y}px * var(--z))` } }, w.l, h("span", null, w.ls)));
    step++; busy = false;
  }

  box.addEventListener("click", open);
  box.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  document.body.classList.add("in-flow");
  document.body.append(root);
  log("box_seen", lvl);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("on")));
}
