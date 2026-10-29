// Sorting: one loose thought at a time, in your sky or on a page of cards.
// Drag the card up onto a planet (or the sun, if it's just about you) to sort it, swipe it left to let it go,
// or right if you're not sure yet. Nothing on the card says so: the words fade in behind it as it moves.
// The sort layer lives outside the home screen, so the sky can redraw underneath without disturbing it.
import * as store from "./store.js";
import { now } from "./clock.js";
import { planet, shade, sparkle, POINTS, esc, targetAt, targetPoint, markTarget, markStar } from "./sky.js";
import { KIND_LABEL } from "./thoughts.js";

const TIPS = 3;            // the one-line tip shows on the first few sorts, then never again
const SWIPE = 90;          // how far a card has to travel sideways to count
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const X = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>`;
const STACK = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M8 5h8"/></svg>`;
const starIcon = (kind) => `<svg class="kstar k-${kind}" viewBox="-12 -12 24 24" width="13" height="13" aria-hidden="true"><path d="${sparkle(POINTS[kind], 10)}"/></svg>`;

let S = null;        // { view: "sky" | "page", queue: [ids], done: [ids handled on the page], tip, last, layer }
let toastFn = () => {};

export const active = () => !!S;
export const view = () => S?.view;
export const left = () => S?.queue.length ?? 0;

// Loose thoughts: in the sky, not yet given a home. Ones you weren't sure about wait at the back.
export function loose() {
  const all = store.get().thoughts.filter((t) => t.status === "active" && !t.pillarId);
  return [...all.filter((t) => !t.unsureAt), ...all.filter((t) => t.unsureAt)];
}

const thought = (id) => store.get().thoughts.find((t) => t.id === id);
const nameOf = (id) => id === "me" ? "you" : store.get().pillars.find((p) => p.id === id)?.name ?? "";

export function open(toast) {
  toastFn = toast;
  const queue = loose().map((t) => t.id);
  if (!queue.length) return toast("Nothing to sort right now. Every thought has a home.");
  const shown = store.get().tips?.sort ?? 0;
  S = { view: "sky", queue, done: [], tip: shown < TIPS, last: null, layer: document.createElement("div") };
  if (S.tip) store.update((s) => { s.tips = { ...s.tips, sort: shown + 1 }; });
  S.layer.className = "sortlayer";
  S.layer.innerHTML = `<button type="button" class="so-x" aria-label="Stop sorting">${X}</button><div class="so-body"></div>`;
  document.body.append(S.layer);
  S.layer.querySelector(".so-x").addEventListener("click", close);
  S.layer.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  refresh();
  showSky();
}

// Stop sorting and go home. Anything sorted or let go on the page happens now, a beat apart, so you see it.
export function close() {
  if (!S) return;
  const { done, layer, view: was } = S;
  S = null;
  layer.classList.add("out");
  setTimeout(() => layer.remove(), still() ? 0 : 400);
  markTarget(null); markStar(null);
  if (was === "page" && done.length) {
    const t0 = now() + 500;
    store.update((s) => done.forEach((id, n) => {
      const t = s.thoughts.find((x) => x.id === id);
      if (t?.status === "let-go") t.letGoAt = t0 + n * 250;
      else if (t?.pillarId) t.sortedAt = t0 + n * 250;
    }));
  } else refresh();
}

// The home screen redraws on every change; it calls this so the sorting look carries over.
export function afterRender() { if (S && S.view === "sky") markStar(S.queue[0]); }
const refresh = () => store.update(() => {});

// Tapping a planet (or the sun) in the sky while sorting.
export function choose(target) {
  const card = S?.layer.querySelector(".so-card.front");
  if (card && S.queue[0]) sortInto(card, target);
}

/* ---------- In your sky: the card waits at the bottom while its star glows ---------- */

function showSky() {
  S.view = "sky";
  const body = S.layer.querySelector(".so-body");
  body.className = "so-body so-sky";
  body.innerHTML = `<div class="so-deck"></div><p class="so-line" role="status"></p>`;
  deal();
}

/* ---------- On a page: the planets in a row above a stack of every loose thought ---------- */

function showPage() {
  S.view = "page";
  const s = store.get();
  const body = S.layer.querySelector(".so-body");
  body.className = "so-body so-page";
  const sun = `<svg viewBox="-15 -15 30 30" aria-hidden="true"><circle r="14" fill="#f2c08f" opacity=".25"/><circle r="10" fill="#f7d3a8"/><circle r="7" fill="#fff4e6"/></svg>`;
  body.innerHTML = `<h2 class="so-ask">Which part of your life is this about?</h2><p class="so-count"></p>
    <div class="so-pls">${s.pillars.map((p, i) => `<button type="button" data-to="${p.id}"><svg viewBox="-15 -15 30 30" aria-hidden="true">${planet("so", i, 13, shade(p))}</svg><span>${esc(p.name)}</span></button>`).join("")}
      <button type="button" data-to="me">${sun}<span>Just me</span></button></div>
    <div class="so-deck"></div><p class="so-line" role="status"></p>`;
  body.querySelectorAll("[data-to]").forEach((b) => b.addEventListener("click", () => choose(b.dataset.to)));
  refresh();
  deal();
}

/* ---------- The cards ---------- */

function deal() {
  const deck = S.layer.querySelector(".so-deck");
  const ids = S.queue.slice(0, S.view === "page" ? 4 : 1);
  const count = S.layer.querySelector(".so-count");
  if (count) count.textContent = S.queue.length ? `${S.queue.length} to sort` : "";
  markStar(S.view === "sky" ? S.queue[0] : null);
  if (!ids.length) return finish();
  const first = !deck.querySelector(".so-card");
  deck.innerHTML = `<span class="so-rev l" aria-hidden="true">Let it go</span><span class="so-rev r" aria-hidden="true">Not sure yet</span>` +
    ids.map((id, n) => card(thought(id), n, n === 0 && S.tip && first)).reverse().join("");
  const front = deck.querySelector(".so-card.front");
  requestAnimationFrame(() => requestAnimationFrame(() => deck.querySelectorAll(".so-card").forEach((c) => c.classList.remove("enter"))));
  if (S.tip && first && !still()) front.classList.add("nudge");
  front.addEventListener("animationend", () => front.classList.remove("nudge"));
  const tip = front.querySelector(".so-tip");
  if (tip) setTimeout(() => tip.classList.add("fade"), 4500);
  front.querySelector("[data-page]")?.addEventListener("click", showPage);
  front.querySelector("[data-go]").addEventListener("click", () => letGo(front));
  front.querySelector("[data-unsure]").addEventListener("click", () => unsure(front));
  handle(front, deck);
}

function card(t, n, tip) {
  const front = n === 0;
  return `<div class="so-card ${front ? "front" : "back"} enter" style="--n:${n}" ${front ? `role="group" aria-label="Sorting “${esc(t.text)}”"` : 'aria-hidden="true"'}>
    <div class="so-top"><p class="so-kind k-${t.kind}">${starIcon(t.kind)}${KIND_LABEL[t.kind]}</p>
      ${front && S.view === "sky" ? `<button type="button" class="so-pg" data-page aria-label="Sort on a page">${STACK}</button>` : ""}</div>
    <blockquote class="so-q">“${esc(t.text)}”</blockquote>
    ${tip ? `<p class="so-tip">Drag it to a planet, or swipe it aside.</p>` : ""}
    ${front ? `<button type="button" class="sr" data-go>Let it go</button><button type="button" class="sr" data-unsure>Not sure yet</button>` : ""}</div>`;
}

// One finger on the card: up towards a planet sorts it; flat to the side lets it go (left) or leaves it for now (right).
function handle(el, deck) {
  const rl = deck.querySelector(".so-rev.l"), rr = deck.querySelector(".so-rev.r");
  let x0 = null, y0 = 0, dx = 0, dy = 0, mode = null, hot = null;
  const over = (x, y) => {
    if (S.view === "sky") return targetAt(x, y);
    el.style.pointerEvents = "none";
    const b = document.elementFromPoint(x, y)?.closest("[data-to]");
    el.style.pointerEvents = "";
    return b?.dataset.to ?? null;
  };
  const light = (id) => {
    if (id === hot) return;
    hot = id;
    if (S.view === "sky") markTarget(id);
    else S.layer.querySelectorAll("[data-to]").forEach((b) => b.classList.toggle("hot", b.dataset.to === id));
  };
  el.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button") || !S) return;
    x0 = e.clientX; y0 = e.clientY; dx = dy = 0; mode = null;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (x0 === null) return;
    dx = e.clientX - x0; dy = e.clientY - y0;
    if (!mode && Math.hypot(dx, dy) > 8) { mode = dy < 0 && -dy > Math.abs(dx) * .8 ? "up" : "side"; el.classList.add("drag"); el.classList.remove("nudge"); }
    if (mode === "up") {
      el.style.transform = `translate(${dx}px,${dy}px) scale(${Math.max(.5, 1 + dy / 400)})`;
      light(over(e.clientX, e.clientY));
    } else if (mode === "side") {
      el.style.transform = `translateX(${dx}px) rotate(${Math.max(-6, Math.min(6, dx / 25))}deg)`;
      const a = Math.min(1, Math.abs(dx) / SWIPE) * .9;
      rl.style.opacity = dx < 0 ? a : 0; rr.style.opacity = dx > 0 ? a : 0;
    }
  });
  const end = () => {
    if (x0 === null) return;
    x0 = null;
    el.classList.remove("drag");
    const target = hot;
    light(null);
    if (mode === "up" && target) return sortInto(el, target);
    if (mode === "side" && dx < -SWIPE) return letGo(el);
    if (mode === "side" && dx > SWIPE) return unsure(el);
    el.style.transform = "";
    rl.style.opacity = rr.style.opacity = 0;
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

// The card shrinks away into the planet it was given to; in the sky, its star flies over and starts circling.
function sortInto(el, target) {
  const id = S.queue.shift();
  const before = store.sortThought(id, target);
  if (S.view === "page") S.done.push(id);
  const r = el.getBoundingClientRect();
  const to = S.view === "sky" ? targetPoint(target) : (() => { const b = S.layer.querySelector(`[data-to="${target}"]`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })();
  if (to) el.style.transform = `translate(${to.x - (r.left + r.width / 2)}px,${to.y - (r.top + r.height / 2)}px) scale(.15)`;
  el.classList.add("leave");
  say(target === "me" ? "Sorted. It's about you." : `Sorted into ${nameOf(target)}.`, before);
  next(450);
}

// Letting go is a relief: the card sinks, softens and crumbles away downwards; in the sky, its star sinks too.
function letGo(el) {
  const id = S.queue.shift(), t = thought(id);
  const before = store.letThoughtGo(id);
  if (S.view === "page") S.done.push(id);
  hideRev();
  if (!still()) {
    const r = el.getBoundingClientRect();
    for (let n = 0; n < 34; n++) {
      const d = document.createElement("span"), z = 1.5 + Math.random() * 2;
      d.className = "so-dust";
      Object.assign(d.style, { width: `${z}px`, height: `${z}px`, left: `${r.left + Math.random() * r.width}px`, top: `${r.top + Math.random() * r.height}px` });
      S.layer.append(d);
      d.animate([{ opacity: 0, transform: "none" }, { opacity: .7, offset: .2 }, { opacity: 0, transform: `translate(${(Math.random() - .5) * 40}px,${70 + Math.random() * 120}px)` }],
        { duration: 1400 + Math.random() * 900, delay: 150 + Math.random() * 450, easing: "cubic-bezier(.4,0,.8,.6)", fill: "both" }).onfinish = () => d.remove();
    }
    el.style.transform = `${el.style.transform.replace(/rotate\([^)]*\)/, "")} translateY(60px) scale(.94)`;
  }
  el.classList.add("sink");
  const line = t.kind === "worry" ? "That was a moment, not the truth." : "You felt it. You don't have to keep it.";
  setTimeout(() => say(line, before), still() ? 0 : 800);
  next(still() ? 300 : 1300);
}

// Not sure yet: the card slides off to the side and the thought waits in your sky for another time.
function unsure(el) {
  const id = S.queue.shift();
  const before = store.notSureYet(id);
  hideRev();
  el.style.transform = "translateX(120%) rotate(6deg)";
  el.classList.add("leave");
  say("That's okay. It'll wait in your sky.", before);
  next(450);
}

function hideRev() { S.layer.querySelectorAll(".so-rev").forEach((r) => { r.style.transition = "opacity .4s"; r.style.opacity = 0; }); }

function next(ms) {
  const session = S;
  setTimeout(() => { if (S === session) deal(); }, ms);
  refresh();
}

// The quiet line under the card, with a way to take the last choice back.
function say(msg, before) {
  if (!S) return;
  S.last = before;
  const line = S.layer.querySelector(".so-line");
  line.innerHTML = `${esc(msg)} <button type="button" class="so-undo">Undo</button>`;
  line.classList.add("on");
  clearTimeout(line.t);
  line.t = setTimeout(() => line.classList.remove("on"), 4000);
  line.querySelector(".so-undo").addEventListener("click", () => {
    if (!S || !S.last) return;
    const b = S.last;
    S.last = null;
    store.restoreThought(b);
    S.queue = [b.id, ...S.queue.filter((x) => x !== b.id)];
    S.done = S.done.filter((x) => x !== b.id);
    line.classList.remove("on");
    clearTimeout(S.endT);
    deal();
  });
}

function finish() {
  const session = S;
  const deck = S.layer.querySelector(".so-deck");
  deck.innerHTML = S.view === "page" ? `<p class="so-done">All done for now.</p>` : "";
  session.endT = setTimeout(() => { if (S === session) { close(); toastFn("All sorted for now."); } }, 2600);
}
