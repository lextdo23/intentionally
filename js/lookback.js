// The weekly look back: a calm ritual in the night sky, led by the sun. It starts small and grows a little
// with each step, so you can see there's more to come. Tap the sun to move on.
//   Arrive → Breathe → Notice → Thoughts → Write → Intend → Close   (the five-minute version skips Write)
import * as store from "./store.js";
import { now } from "./clock.js";
import { sparkle, POINTS, esc, shade } from "./sky.js";
import { KIND_LABEL } from "./thoughts.js";
import { STRUGGLES, GENERAL_WORRY, GENERAL_WANT, EATING_HELPS, about, aboutEating, keyWords, likely } from "./helps.js";
import { stats, sentences, lastLook, range, dayName, times } from "./week.js";

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ms = (n) => still() ? Math.min(n, 300) : n;
const q = (t) => `“${esc(t)}”`;
const X = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>`;
const starIcon = (kind, size = 14) => `<svg class="kstar k-${kind}" viewBox="-12 -12 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${sparkle(POINTS[kind], 10)}"/></svg>`;
export const LINES = `<div class="lines">
  <p><b>Lifeline, call</b><a href="tel:131114">13 11 14</a></p>
  <p><b>Lifeline, text</b><a href="sms:0477131114">0477 13 11 14</a></p>
  <p><b>Lifeline, chat online</b><a href="https://www.lifeline.org.au/crisis-chat/" target="_blank" rel="noopener">Open</a></p>
  <p><b>Beyond Blue</b><a href="tel:1300224636">1300 22 4636</a></p></div>`;
const BUTTERFLY = `<div class="lines"><p><b>Butterfly, 8am to midnight</b><a href="tel:1800334673">1800 33 4673</a></p></div>`;

let L = null;
let hooks = { support() {}, weekInFull() {}, record() {}, done() {} };
export const active = () => !!L;

// The look of the sun at each step: it starts small and pale, and grows warmer and golder as you go.
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
function sunLook(stage, last) {
  const t = stage / last, rgb = (c) => `rgb(${c.join(",")})`;
  return { s: 14 + t * 18, c: rgb(mix([236, 238, 242], [255, 238, 214], t)), r: rgb(mix([196, 202, 214], [242, 192, 143], t)),
    g: `rgba(${mix([200, 210, 230], [242, 192, 143], t).join(",")},${(.14 + t * .24).toFixed(2)})` };
}

export function open(h) {
  if (L) return;
  hooks = { ...hooks, ...h };
  const s = store.get(), first = !s.weeks.length;
  // The first look back covers the past week, even if the app is newer than that.
  const to = now(), from = first ? Math.min(s.createdAt, to - 7 * 86400000) : lastLook(s);
  L = { from, to, first, short: first ? true : !!s.lookShort, feel: null, wrote: "", prompt: "", notes: [], next: [],
    prevIntention: s.intention, newIntention: undefined, timers: [], onSun: null, stage: 0 };
  L.layer = document.createElement("div");
  L.layer.className = "lb";
  L.layer.setAttribute("role", "dialog");
  L.layer.setAttribute("aria-modal", "true");
  L.layer.setAttribute("aria-label", "Your look back");
  L.layer.innerHTML = `<div class="lb-path" aria-hidden="true"></div>
    <button type="button" class="lb-x" aria-label="Pause the look back">${X}</button>
    <div class="lb-sunw"><span class="lb-rings"></span><div class="lb-sun"><i></i></div><span class="call"></span><span class="call b"></span>
      <button type="button" class="lb-tap" aria-label="The sun: tap to go on"></button></div>
    <div class="lb-body"></div>
    <button type="button" class="lb-sup">Need support?</button>`;
  document.body.append(L.layer);
  requestAnimationFrame(() => L?.layer.classList.add("in"));
  L.layer.querySelector(".lb-x").addEventListener("click", close);
  L.layer.querySelector(".lb-sup").addEventListener("click", () => hooks.support());
  L.layer.querySelector(".lb-tap").addEventListener("click", () => L?.onSun?.());
  L.layer.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.querySelector(".sheet")) close(); });
  go(0);
}

// Leaving part way (the ×) keeps nothing; the week waits in your sky for whenever you come back.
export function close() {
  if (!L) return;
  const { layer, timers } = L;
  timers.forEach(clearTimeout);
  L = null;
  layer.classList.remove("in");
  setTimeout(() => layer.remove(), still() ? 0 : 500);
  hooks.done();
}

const later = (fn, n) => { const s = L; L.timers.push(setTimeout(() => { if (L === s) fn(); }, ms(n))); };
const steps = () => L.short ? ["Arrive", "Breathe", "Notice", "Thoughts", "Intend", "Close"] : ["Arrive", "Breathe", "Notice", "Thoughts", "Write", "Intend", "Close"];
const STEP = { Arrive: arrive, Breathe: breathe, Notice: notice, Thoughts: thoughts, Write: write, Intend: intend, Close: closing };

function go(i) {
  if (!L) return;
  L.stage = i;
  L.timers.forEach(clearTimeout); L.timers = [];
  const names = steps();
  L.layer.querySelector(".lb-path").innerHTML = names.map((_, k) => `<i class="${k < i ? "d" : k === i ? "n" : ""}"></i>`).join("");
  L.body = L.layer.querySelector(".lb-body");
  L.body.innerHTML = "";
  L.onSun = null;
  STEP[names[i]]();
}
const nextStep = () => go(L.stage + 1);

// Place the sun for this step: its size and colour show how far along you are, rings mark each finished step.
function sun(y, { calling = false } = {}) {
  const w = L.layer.querySelector(".lb-sunw"), last = steps().length - 1, k = sunLook(L.stage, last);
  w.style.cssText = `--y:${y};--s:${k.s}px;--c:${k.c};--r:${k.r};--g:${k.g}`;
  w.classList.remove("done");
  w.querySelector(".lb-rings").innerHTML = Array.from({ length: L.stage }, (_, i) => { const d = k.s + 14 + i * 9;
    return `<i style="width:${d}px;height:${d}px;left:${-d / 2}px;top:${-d / 2}px;border-color:rgba(247,211,168,${(.42 - i * .045).toFixed(2)})"></i>`; }).join("");
  callSun(calling);
}
function callSun(on) { L.layer.querySelector(".lb-sunw").classList.toggle("calling", on); }
// A step is done: the sun warms and a soft ring blooms out from it.
function bloom() { const w = L.layer.querySelector(".lb-sunw"); w.classList.remove("done"); void w.offsetWidth; w.classList.add("done"); callSun(false); }
// "Tap the sun to go on", under the sun, and the sun's soft call.
function askSun(text, fn) {
  const a = L.body.querySelector(".lb-ask");
  if (a) { a.textContent = text; a.classList.add("on", "pulse"); }
  L.onSun = () => { L.onSun = null; a?.classList.remove("pulse"); bloom(); later(fn, 900); };
  callSun(true);
}
const fade = (root) => root.querySelectorAll(".fx").forEach((el, i) => later(() => el.classList.add("on"), 300 + i * (+el.dataset.gap || 700)));

/* ---------- Arrive: the same opening words every week ---------- */

function arrive() {
  sun("24%");
  const name = store.get().name;
  const say = () => L.short ? "Five minutes for you." : "Ten minutes for you.";
  L.body.innerHTML = `<p class="lb-ask fx" style="top:calc(24% + 52px)"></p>
    <div class="lb-words" style="top:44%"><p class="t1 fx">${L.first ? "Your first look back." : `Welcome back${name ? `, ${esc(name)}` : ""}.`}</p>
      <p class="t2 fx" id="how">${say()}</p><p class="t3 fx">Find somewhere cosy. Maybe make a tea.</p></div>
    <div class="lb-words bottom"><p class="steps fx" id="steps"></p><button type="button" class="lb-link fx" id="len"></button></div>`;
  const len = L.body.querySelector("#len"), how = L.body.querySelector("#how"), list = L.body.querySelector("#steps");
  const draw = () => {
    how.textContent = say();
    list.innerHTML = steps().slice(1, -1).map((n) => `<span>${n}</span>`).join("");
    len.textContent = L.short ? "Got more time? Make it ten minutes" : "Short on time? Make it five minutes";
  };
  draw();
  len.addEventListener("click", () => { L.short = !L.short; store.update((s) => { s.lookShort = L.short; }); draw(); go(0); });
  fade(L.body);
  later(() => askSun("Tap the sun when you’re ready", nextStep), 2400);
}

/* ---------- Breathe: cyclic sighing, led by the sun ---------- */
// Cyclic sighing (Balban and others, Stanford, 2023): a full breath in through the nose, a short top-up breath in,
// then a long slow breath out through the mouth. What matters is that the breath out is the longest part.
const IN1 = 3000, IN2 = 1000, OUT = 7000, REST = 600;

function breathe() {
  sun("32%");
  L.body.innerHTML = `<p class="lb-ask fx" style="top:calc(32% + 76px)"></p>
    <div class="lb-words" style="top:calc(32% + 112px);gap:20px">
      <p class="t1 cue fx">Follow the sun. In through your nose, out through your mouth.</p>
      <div class="guide fx"><div class="seg" style="flex:3"><u><s></s></u><b>Breathe in</b></div><div class="seg" style="flex:1.7"><u><s></s></u><b>Top up</b></div><div class="seg" style="flex:7"><u><s></s></u><b>Let it all out, slowly</b></div></div>
      <p class="secs fx" aria-live="polite">1 minute</p></div>
    <div class="lb-words bottom"><div class="choice fx" id="len" role="group" aria-label="How long"><button type="button" class="on" data-m="1">1 min</button><span>·</span><button type="button" data-m="3">3 min</button><span>·</span><button type="button" data-m="5">5 min</button></div>
      <button type="button" class="lb-link quiet fx" id="skip">Skip the breath</button></div>`;
  const b = L.body, w = L.layer.querySelector(".lb-sun"), cue = b.querySelector(".cue"), secs = b.querySelector(".secs"), len = b.querySelector("#len");
  const segs = b.querySelectorAll(".seg"), fills = b.querySelectorAll(".seg s");
  let minutes = 1, going = false;
  fade(b);
  later(() => askSun("Tap the sun to begin", start), 1400);
  len.addEventListener("click", (e) => { const x = e.target.closest("button"); if (!x || going) return; minutes = +x.dataset.m;
    len.querySelectorAll("button").forEach((c) => c.classList.toggle("on", c === x)); secs.textContent = minutes === 1 ? "1 minute" : `${minutes} minutes`; });
  b.querySelector("#skip").addEventListener("click", () => { w.style.transform = ""; nextStep(); });
  const fill = (i, n) => { segs[i].classList.add("on"); fills[i].style.transition = `transform ${n}ms linear`; fills[i].style.transform = "scaleX(1)"; };
  const reset = () => { segs.forEach((x) => x.classList.remove("on")); fills.forEach((f) => { f.style.transition = "none"; f.style.transform = "scaleX(0)"; }); };
  // The sun grows as you breathe in and shrinks as you breathe out (transform only, so it stays smooth).
  const grow = (k, n, ease) => { w.style.transition = `transform ${n}ms ${ease}`; w.style.transform = `scale(${k})`; };
  const say = (h) => { cue.style.opacity = 0; later(() => { cue.textContent = h; cue.style.opacity = 1; }, 300); };
  function start() {
    going = true; len.style.visibility = "hidden"; b.querySelector(".lb-ask").classList.remove("on");
    L.layer.querySelector(".lb-sunw").classList.remove("done");
    const end = Date.now() + minutes * 60000;
    const tick = () => { const left = Math.max(0, Math.round((end - Date.now()) / 1000));
      secs.textContent = left >= 60 ? `${Math.ceil(left / 60)} min left` : `${left} seconds left`;
      if (left <= 0) return finish(); later(tick, 1000); };
    const breath = () => {
      reset();
      fill(0, IN1); say("Breathe in, all the way"); grow(2.6, IN1, "cubic-bezier(.3,.1,.4,1)");
      later(() => { segs[0].classList.remove("on"); fill(1, IN2); say("Top up, a little more"); grow(3.1, IN2, "cubic-bezier(.3,.1,.4,1)"); }, IN1);
      later(() => { segs[1].classList.remove("on"); fill(2, OUT); say("Let it all out, slowly"); grow(1, OUT, "cubic-bezier(.45,0,.4,1)"); }, IN1 + IN2);
      later(breath, IN1 + IN2 + OUT + REST);
    };
    tick();
    if (still()) cue.textContent = "Breathe in, a little more, then slowly out."; else breath();
  }
  function finish() {
    L.timers.forEach(clearTimeout); L.timers = [];
    grow(1, 1200, "ease"); reset();
    cue.textContent = "Well done."; cue.style.opacity = 1; secs.textContent = "";
    b.querySelector("#skip").style.visibility = "hidden";
    later(() => askSun("Tap the sun to go on", nextStep), 1400);
  }
}

/* ---------- Notice: one tap for how the week felt, then the week in a few sentences ---------- */

const FEEL = ["Light", "Okay", "Heavy", "Very heavy"];
function notice() {
  sun("20%");
  L.body.innerHTML = `<p class="lb-ask" style="top:calc(20% + 48px)"></p>
    <div class="lb-words" style="top:36%" id="feel"><p class="t1 fx">How heavy did this week feel?</p>
      <div class="lb-opts row fx" role="group" aria-label="How heavy did this week feel">${FEEL.map((f, i) => `<button type="button" class="op" data-f="${i}">${f}</button>`).join("")}</div>
      <p class="t3 fx">Just for you. It helps the app know when to offer more support.</p></div>`;
  fade(L.body);
  L.body.querySelector("#feel .lb-opts").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]");
    if (!b || L.feel != null) return;
    L.feel = +b.dataset.f;
    b.classList.add("on");
    later(() => { const f = L.body.querySelector("#feel"); f.style.opacity = 0; later(week, 700); }, 500);
  });
  function week() {
    const s = store.get(), st = stats(s, L.from, L.to), { quiet, lines, win } = sentences(s, st, L.prevIntention);
    L.st = st;
    L.body.innerHTML = `<p class="lb-ask" style="top:calc(20% + 48px)"></p>
      <div class="lb-words" style="top:34%;gap:12px"><p class="when fx" data-gap="1500">${range(L.from, L.to)}</p>
        ${lines.map((l, i) => `<p class="${i ? "t2" : "t1"} fx" data-gap="1500">${esc(l)}</p>`).join("")}
        ${win ? `<p class="win fx" data-gap="1500">${esc(win)}</p>` : ""}</div>
      <div class="lb-words bottom"><button type="button" class="lb-link fx" data-gap="1500">${quiet ? "See the week anyway" : "See your week in full"}</button></div>`;
    L.body.querySelector(".lb-link").addEventListener("click", () => hooks.weekInFull(L.from, L.to));
    fade(L.body);
    later(() => askSun("Tap the sun to go on", nextStep), 300 + (lines.length + 2) * 1500);
  }
}

/* ---------- Thoughts: one card at a time, like the daily sort ---------- */
// Swipe up when it's settled (the card turns over to ask what helped), left to let it go, right if not yet
// (it asks what could help next week). A kind thought just gets a quiet moment. Heavy thoughts get one gentle question.

function queue() {
  const s = store.get();
  const all = s.thoughts.filter((t) => t.status === "active");
  const weight = (t) => t.heavy ? 100 : t.kind === "worry" ? 30 + (t.count || 1) * 5 : t.kind === "want" ? 20 : 0;
  const list = [...all].sort((a, b) => weight(b) - weight(a));
  // The five-minute version, or a late return, keeps it to the heaviest five. The rest stay safe in your sky.
  const cap = L.short ? 5 : 12;
  L.rest = Math.max(0, list.length - cap);
  return list.slice(0, cap).map((t) => t.id);
}
const pillarOf = (t) => store.get().pillars.find((p) => p.id === t.pillarId);
const thoughtById = (id) => store.get().thoughts.find((t) => t.id === id);

function thoughts() {
  sun("14%");
  L.q = queue();
  L.i = 0;
  L.body.innerHTML = `<div class="orbit" aria-hidden="true"></div><p class="lb-ask" style="top:calc(14% + 54px)"></p>
    <div class="deck"></div><p class="tip" aria-live="polite"></p><p class="line" role="status"></p>`;
  L.tipShown = (store.get().tips?.look ?? 0) < 3;
  if (L.tipShown) store.update((s) => { s.tips = { ...s.tips, look: (s.tips?.look ?? 0) + 1 }; });
  if (!L.q.length) {
    const ln = L.body.querySelector(".line");
    ln.innerHTML = `<span class="lb-big">No thoughts to look at this week.</span><br>Your sky is clear.`; ln.style.top = "40%"; ln.classList.add("on");
    return later(() => askSun("Tap the sun to go on", nextStep), 1200);
  }
  deal();
}

function orbit() {
  const o = L.body.querySelector(".orbit");
  if (!o) return;
  o.innerHTML = L.q.slice(L.i).map((id, j) => { const t = thoughtById(id);
    return t ? `<i style="--t:${70 + j * 12}s;--rr:${[34, -38, -26, 30, 44, -32, 40, -44][j % 8]}px">${starIcon(t.kind, 10)}</i>` : ""; }).join("");
}

function deal() {
  const deck = L.body.querySelector(".deck"), tip = L.body.querySelector(".tip"), ln = L.body.querySelector(".line");
  orbit();
  if (L.i >= L.q.length) {
    deck.innerHTML = ""; tip.classList.remove("on");
    ln.style.top = "40%";
    ln.innerHTML = `<span class="lb-big">That’s every thought.</span><br>${L.rest ? "The rest are safe in your sky." : "You showed up for all of them."}`;
    ln.classList.add("on");
    return later(() => askSun("Tap the sun to go on", nextStep), 900);
  }
  const t = thoughtById(L.q[L.i]), p = pillarOf(t), left = L.q.length - L.i;
  if (!t) { L.i++; return deal(); }
  const s = store.get();
  const last = t.helped?.filter((h) => h.text).at(-1);
  const tag = t.pillarId === "me" ? `<span class="cpl"><i style="background:#fff4e6"></i>Just you</span>` : p ? `<span class="cpl"><i style="background:${shade(p)}"></i>${esc(p.name)}</span>` : "";
  const meta = t.heavy ? "" : t.kind === "kind" ? `<div class="sav"><s></s></div><p class="mt">Take a moment to remember it.</p>`
    : last ? `<p class="mt">${t.count > 1 ? `Came up ${times(t.count)}` : "It’s come back"}</p><p class="ret">Last time, ${esc(last.text.charAt(0).toLowerCase() + last.text.slice(1))} helped.</p>`
    : `<p class="mt">${t.count > 1 ? `Came up ${times(t.count)}` : `Caught on ${dayName(t.createdAt)}`}</p>`;
  deck.innerHTML = [2, 1].filter((n) => n < left).map((n) => `<div class="bk" style="transform:translateY(${-8 * n}px) scale(${1 - n * .05});opacity:${1 - n * .25}"></div>`).join("") +
    `<span class="rv u" aria-hidden="true">${t.kind === "want" ? "I did it" : t.kind === "kind" ? "Keep it" : "Settled"}</span><span class="rv l" aria-hidden="true">Let it go</span><span class="rv r" aria-hidden="true">Not yet</span>
    <div class="cd enter" role="group" aria-label="${esc(KIND_LABEL[t.kind])}: ${esc(t.text)}"><div class="in"><div class="face a">
      <p class="kind">${starIcon(t.kind)} ${KIND_LABEL[t.kind]}${tag}</p><p class="qq">${q(t.text)}</p>${meta}
      ${t.heavy || t.kind === "kind" ? "" : `<div class="sr-acts"><button type="button" class="sr" data-a="u">${t.kind === "want" ? "I did it" : "Settled"}</button><button type="button" class="sr" data-a="r">Not yet</button><button type="button" class="sr" data-a="l">Let it go</button></div>`}
    </div><div class="face b"></div></div></div>`;
  const cd = deck.querySelector(".cd");
  requestAnimationFrame(() => requestAnimationFrame(() => cd.classList.remove("enter")));
  const hint = (text) => { tip.textContent = text; tip.style.top = `${deck.offsetTop + cd.offsetHeight + 16}px`; tip.classList.add("on"); };
  tip.classList.remove("on");
  if (t.heavy) return heavyCard(t, cd, hint);
  if (t.kind === "kind") {
    later(() => cd.querySelector(".sav")?.classList.add("go"), 300);
    return later(() => { done(t, "kept"); away(cd, "u"); }, 5600);
  }
  if (L.tipShown && L.i === 0) hint("Swipe up if it’s settled, left to let it go, right if not yet");
  // A worry that came up once and has no history just settles when swiped up; there's nothing worth asking.
  const oneOff = t.kind === "worry" && (t.count || 1) < 2 && !last;
  const upMode = t.kind === "want" ? "did" : "helped";
  const choose = (d) => {
    tip.classList.remove("on");
    if (d === "l") return letGo(t, cd);
    if (d === "u" && oneOff) { done(t, "settled"); return away(cd, "u"); }
    if (d === "r") { fill(t, cd, needsAbout(t) ? "about" : "next"); cd.classList.add("flip"); return arm(t, cd, "r", 850, hint); }
    if (!cd.querySelector(".face.b").dataset.mode) fill(t, cd, upMode, "u");
    cd.querySelector(".in").style.transform = "rotateX(180deg)";
    arm(t, cd, "u", 500, hint);
  };
  drag(cd, ["u", "l", "r"], choose, oneOff ? null : (on) => { if (on) fill(t, cd, upMode, "u"); else { const bf = cd.querySelector(".face.b"); bf.innerHTML = ""; delete bf.dataset.mode; } });
  cd.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => { if (!cd.dataset.busy) { cd.dataset.busy = 1; choose(b.dataset.a); } }));
}

// Whether a worry's words say clearly what it's about. If not, the card asks first, in one tap.
function needsAbout(t) {
  if (t.struggle || aboutEating(t.text)) return false;
  const a = about(t.text, pillarOf(t)?.name, store.get().learned);
  if (a.sure) { store.editThought(t.id, (x) => { x.struggle = a.struggle; }); return false; }
  return t.kind === "worry";
}

// What could help next week: your own helps for this struggle first, then the bank's, three at most.
function helpsFor(t) {
  const s = store.get(), st = t.struggle ?? about(t.text, pillarOf(t)?.name, s.learned).struggle;
  if (aboutEating(t.text)) return { list: EATING_HELPS, eating: true };
  const bank = st ? STRUGGLES[st].helps : t.kind === "want" ? GENERAL_WANT : GENERAL_WORRY;
  return { list: [...new Set([...(st ? s.myHelps[st] ?? [] : []), ...bank])].slice(0, 3) };
}

// What you actually did this week on this thought's planet, so "What helped?" starts from real life.
function didThisWeek(t) {
  const row = L.st?.rows.find((r) => r.p.id === t.pillarId);
  const acts = row ? Object.values(row.acts).sort((a, b) => b.n - a.n).map((a) => a.label) : [];
  const last = t.helped?.filter((h) => h.text).at(-1)?.text;
  return { last, acts: acts.filter((a) => a !== last).slice(0, 3) };
}

// The back of the card asks the one question that fits.
function fill(t, cd, mode, d) {
  const bf = cd.querySelector(".face.b");
  const opt = (label, cls = "", data = "") => `<button type="button" class="op ${cls}" ${data}>${esc(label)}</button>`;
  let head, list, extra = "";
  if (mode === "helped" || mode === "did") {
    const { last, acts } = didThisWeek(t);
    head = mode === "did" ? "You did it. What helped?" : "What helped?";
    list = (last ? opt(`${last} again`, "last", `data-v="${esc(last)}"`) : "") + acts.map((a) => opt(a, "", `data-v="${esc(a)}"`)).join("") +
      opt("Something else", "", "data-else") + opt(mode === "did" ? "I just went for it" : "Nothing, it just eased", "quiet", 'data-v=""');
  }
  if (mode === "next") {
    const h = helpsFor(t);
    head = "What could help next week?";
    list = h.list.map((x) => opt(x, "", `data-v="${esc(x)}"`)).join("") + opt("Something else", "", "data-else");
    if (h.eating) { head = "Eating gets hard when you’re stretched."; extra = `<p class="soft">Something small still counts.</p>`; list += BUTTERFLY; }
  }
  if (mode === "about") {
    const a = about(t.text, pillarOf(t)?.name, store.get().learned);
    head = "What’s this most about?";
    list = a.chips.map((id) => opt(STRUGGLES[id].name, "", `data-s="${id}"`)).join("") + opt("More", "", "data-more");
  }
  bf.innerHTML = `<p class="bq">${q(t.text)}</p><p class="bh">${head}</p>${extra}<div class="lb-opts">${list}</div>`;
  bf.dataset.mode = mode;
  fit(cd);
  bf.classList.toggle("up", d === "u");
  const many = mode === "helped" || mode === "did";
  bf.querySelector(".lb-opts").addEventListener("click", (e) => {
    const b = e.target.closest(".op");
    if (!b || b.querySelector("input")) return;
    if (b.dataset.more !== undefined) {
      const box = bf.querySelector(".lb-opts");
      box.classList.add("many");
      box.innerHTML = Object.entries(STRUGGLES).map(([id, x]) => opt(x.name, "", `data-s="${id}"`)).join("") + opt("Something else", "", "data-else");
      fit(cd);
      return;
    }
    if (b.dataset.s) {
      b.classList.add("on");
      const id = b.dataset.s;
      // Remember the answer for these words, so the same words match next time.
      store.update((s) => { for (const w of keyWords(t.text)) s.learned[w] = id; });
      store.editThought(t.id, (x) => { x.struggle = id; });
      return later(() => { bf.style.opacity = 0; later(() => { fill(thoughtById(t.id), cd, "next", d); bf.style.opacity = 1; }, 250); }, 300);
    }
    if (b.dataset.else !== undefined) {
      b.innerHTML = `<input placeholder="What was it?" maxlength="60" aria-label="Something else">`;
      b.classList.add("on");
      b.querySelector("input").focus();
      if (!many) bf.querySelectorAll(".op").forEach((o) => o !== b && o.classList.remove("on"));
      return;
    }
    if (many) {
      // "Nothing" stands alone; anything else can be picked together.
      if (b.classList.contains("quiet")) bf.querySelectorAll(".op").forEach((o) => o !== b && o.classList.remove("on"));
      else bf.querySelector(".op.quiet")?.classList.remove("on");
      b.classList.toggle("on");
    } else bf.querySelectorAll(".op").forEach((o) => o.classList.toggle("on", o === b));
  });
}

// The card grows to fit whichever side is showing its longest content.
function fit(cd) {
  requestAnimationFrame(() => { const h = Math.max(172, ...[...cd.querySelectorAll(".face")].map((f) => f.scrollHeight)); cd.style.setProperty("--h", `${h}px`); });
}

// What was picked on the back of the card (and anything typed into "Something else").
function picked(cd) {
  const bf = cd.querySelector(".face.b");
  return [...bf.querySelectorAll(".op.on")].map((o) => o.querySelector("input") ? o.querySelector("input").value.trim() : o.dataset.v ?? null).filter((v) => v !== null && v !== undefined);
}

// Once it has turned over, swipe the same way again when you're done.
function arm(t, cd, d, wait, hint) {
  later(() => {
    if (cd.querySelector(".face.b").dataset.mode !== "about") hint(d === "r" ? "Swipe right again when you’re done" : "Swipe up again when you’re done");
    delete cd.dataset.busy;
    const bf = cd.querySelector(".face.b");
    if (!bf.querySelector(".sr-done")) bf.insertAdjacentHTML("beforeend", `<button type="button" class="sr sr-done">Done</button>`);
    const finish = () => {
      const got = picked(cd), mode = bf.dataset.mode;
      if (d === "u") done(t, "settled", got);
      else done(t, "waiting", got);
      L.body.querySelector(".tip").classList.remove("on");
      away(cd, d);
    };
    bf.querySelector(".sr-done").addEventListener("click", finish);
    drag(cd, [d], finish);
  }, wait);
}

// Save what happened to a thought.
function done(t, outcome, got = []) {
  const texts = got.filter((x) => x), typed = [...cardTyped()];
  const st = t.struggle;
  store.update((s) => {
    const x = s.thoughts.find((y) => y.id === t.id);
    if (!x) return;
    if (outcome === "settled" || outcome === "kept") {
      x.status = "settled"; x.settledAt = now();
      if (got.length) for (const h of got) x.helped.push({ text: h || null, at: now() });
      if (t.kind === "want" && outcome === "settled") x.done = true;
    }
    if (outcome === "waiting") { x.waitingSince = now(); if (texts[0]) x.next = texts[0]; delete x.unsureAt; }
    // Whatever someone writes in "Something else" becomes their own help for that struggle, offered first next time.
    if (st && typed.length) s.myHelps[st] = [...new Set([...typed, ...(s.myHelps[st] ?? [])])].slice(0, 3);
  });
  L.notes.push({ id: t.id, outcome, ...(got.length && { helped: got }) });
  if (outcome === "waiting" && texts[0]) L.next.push({ text: texts[0], pillarId: t.pillarId });
}
function* cardTyped() { for (const i of L.body.querySelectorAll(".face.b .op.on input")) if (i.value.trim()) yield i.value.trim(); }

// No words after: the card simply goes, and the next one comes.
function away(cd, dir) {
  cd.style.transition = "transform .9s cubic-bezier(.5,0,.3,1), opacity .8s";
  cd.style.transform = dir === "u" ? "translateY(-260px) scale(.15)" : dir === "r" ? "translateX(130%) rotate(10deg)" : "translateX(-130%) rotate(-10deg)";
  cd.style.opacity = 0;
  L.body.querySelectorAll(".bk").forEach((b) => { b.style.opacity = 0; });
  L.i++;
  later(deal, 800);
}

// Letting go: the card sinks, softens and crumbles away, with the one line of relief.
function letGo(t, cd) {
  store.letThoughtGo(t.id);
  L.notes.push({ id: t.id, outcome: "let-go" });
  if (!still()) {
    const r = cd.getBoundingClientRect();
    for (let n = 0; n < 30; n++) {
      const d = document.createElement("span"), z = 1.5 + Math.random() * 2;
      d.className = "so-dust";
      Object.assign(d.style, { width: `${z}px`, height: `${z}px`, left: `${r.left + Math.random() * r.width}px`, top: `${r.top + r.height * (.4 + Math.random() * .6)}px` });
      L.layer.append(d);
      d.animate([{ transform: "none", opacity: .8 }, { transform: `translate(${(Math.random() - .5) * 40}px,${80 + Math.random() * 120}px)`, opacity: 0 }],
        { duration: 1600 + Math.random() * 900, easing: "ease-in", fill: "forwards" }).onfinish = () => d.remove();
    }
  }
  cd.style.transition = "transform 1.4s ease-in, opacity 1.2s, filter 1.1s";
  cd.style.transform = "translateY(160px) scale(.92)"; cd.style.filter = "blur(6px)"; cd.style.opacity = 0;
  L.body.querySelectorAll(".bk").forEach((b) => { b.style.opacity = 0; });
  L.i++;
  const ln = L.body.querySelector(".line");
  later(() => {
    orbit();
    ln.style.top = "calc(34% + 60px)";
    ln.textContent = t.kind === "worry" ? "That was a moment, not the truth." : "You felt it. You don’t have to keep it.";
    ln.classList.add("on");
    later(() => { ln.classList.remove("on"); later(deal, 500); }, 2600);
  }, 800);
}

// A heavy thought: no swiping, no "What helped?", no count. One gentle question.
function heavyCard(t, cd, hint) {
  const a = cd.querySelector(".face.a");
  const ask = () => {
    a.innerHTML = `<p class="bq">${q(t.text)}</p><p class="bh">This one was heavy. How is it now?</p>
      <div class="lb-opts">${["Lighter", "Still heavy", "Not sure"].map((x) => `<button type="button" class="op">${x}</button>`).join("")}</div>`;
    fit(cd);
    a.querySelector(".lb-opts").addEventListener("click", (e) => {
      const b = e.target.closest(".op");
      if (!b) return;
      if (b.textContent === "Lighter") { done(t, "settled"); return away(cd, "u"); }
      a.innerHTML = `<p class="bq">${q(t.text)}</p><p class="bh">Thank you for being honest.</p><p class="soft">Talking to someone can help, even just once.</p>${LINES}
        <button type="button" class="sr sr-done">Done</button>`;
      fit(cd);
      hint("Swipe up when you’re ready. It stays in your sky, quietly.");
      const finish = () => { L.notes.push({ id: t.id, outcome: "heavy" }); L.body.querySelector(".tip").classList.remove("on"); away(cd, "u"); };
      a.querySelector(".sr-done").addEventListener("click", finish);
      drag(cd, ["u"], finish);
    });
  };
  ask();
}

// Drag the card; only the directions in `allow` count. Taps on answers still work.
// With `flipUp`, dragging up turns the card over under your finger instead of lifting it.
function drag(cd, allow, done, flipUp) {
  const deck = cd.parentNode, rv = { u: deck.querySelector(".rv.u"), l: deck.querySelector(".rv.l"), r: deck.querySelector(".rv.r") }, inn = cd.querySelector(".in");
  let sx, sy, dx = 0, dy = 0, down = false, ang = 0, filled = false;
  const dir = () => dy < 0 && -dy > Math.abs(dx) * .8 ? "u" : dx < 0 ? "l" : "r";
  cd.onpointerdown = (e) => { if (cd.dataset.busy || e.target.closest("button, input, a")) return; down = true; sx = e.clientX; sy = e.clientY; dx = dy = 0; cd.setPointerCapture(e.pointerId); cd.classList.add("drag"); inn.style.transition = "none"; };
  cd.onpointermove = (e) => {
    if (!down) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    const d = dir(), ok = allow.includes(d);
    if (flipUp && d === "u") {
      ang = Math.min(180, -dy * 1.4); cd.style.transform = ""; inn.style.transform = `rotateX(${ang}deg)`;
      if (ang > 90 !== filled) { filled = ang > 90; flipUp(filled); }
      for (const k in rv) rv[k].style.opacity = 0;
      return;
    }
    if (ang) { ang = 0; inn.style.transform = ""; if (filled) { filled = false; flipUp(false); } }
    cd.style.transform = d === "u" ? `translateY(${ok ? dy : dy / 4}px)` : `translateX(${ok ? dx : dx / 4}px) rotate(${(ok ? dx : dx / 4) / 24}deg)`;
    for (const k in rv) rv[k].style.opacity = k === d && ok ? Math.min(1, (d === "u" ? -dy : Math.abs(dx)) / 90) : 0;
  };
  const up = () => {
    if (!down) return;
    down = false; cd.classList.remove("drag"); inn.style.transition = "";
    const d = dir(), far = (d === "u" ? -dy : Math.abs(dx)) > 90;
    for (const k in rv) rv[k].style.opacity = 0;
    if (ang) {
      const over = ang > 90; ang = 0;
      inn.style.transform = over ? "rotateX(180deg)" : "";
      if (over) { cd.dataset.busy = 1; cd.onpointerdown = null; done("u"); } else if (filled) { filled = false; flipUp(false); }
      return;
    }
    dx = dy = 0;
    if (far && allow.includes(d)) { cd.dataset.busy = 1; cd.onpointerdown = null; cd.style.transform = ""; done(d); } else cd.style.transform = "";
  };
  cd.onpointerup = up;
  cd.onpointercancel = up;
}

/* ---------- Write: one question for the season, with your own old words first ---------- */

const PROMPTS = ["What helped you rest this week, even a little?", "What’s one moment from this week you’d keep?", "What do you need more of next week?"];
function write() {
  sun("17%");
  const s = store.get();
  L.prompt = PROMPTS[s.weeks.length % PROMPTS.length];
  const old = [...s.weeks].reverse().find((w) => w.prompt === L.prompt && w.wrote && now() - w.at > 10 * 86400000);
  const weeksAgo = old ? Math.round((now() - old.at) / (7 * 86400000)) : 0;
  const acts = (L.st?.rows ?? []).flatMap((r) => Object.values(r.acts)).sort((a, b) => b.n - a.n).filter((a) => !a.label.startsWith("Time on")).slice(0, 3);
  const ideas = [...acts.map((a) => `${a.label}, maybe?`), "Or anything at all."];
  L.body.innerHTML = `<p class="lb-ask" style="top:calc(17% + 52px)"></p>
    ${old ? `<div class="lb-words memory" style="top:38%"><p class="small">${count(weeksAgo)} weeks ago you wrote</p><p class="mq">${q(old.wrote)}</p></div>` : ""}
    <div class="lb-words qa" style="top:34%;gap:24px"><p class="t1">${L.prompt}</p>
      <div class="pen"><p class="lb-ghost"><span class="caret"></span><span class="gt">${esc(ideas[0])}</span></p><textarea class="ink" rows="4" maxlength="600" aria-label="Write your answer"></textarea></div></div>
    <div class="lb-words bottom"><p class="small fx">Tap to write, or use your keyboard’s mic. You can skip this.</p></div>`;
  const b = L.body, mem = b.querySelector(".memory"), qa = b.querySelector(".qa"), ta = b.querySelector("textarea"), gh = b.querySelector(".lb-ghost"), gt = b.querySelector(".gt");
  const show = (el, v) => { if (el) { el.style.opacity = v ? 1 : 0; el.style.pointerEvents = v ? "" : "none"; } };
  show(qa, 0);
  if (mem) { later(() => show(mem, 1), 400); later(() => show(mem, 0), 3600); }
  later(() => { show(qa, 1); fade(b); }, mem ? 4200 : 400);
  let i = 0;
  const drift = () => { if (ta.value || ideas.length < 2) return; gt.style.opacity = 0; later(() => { i = (i + 1) % ideas.length; gt.textContent = ideas[i]; gt.style.opacity = 1; }, 800); later(drift, 3600); };
  if (!still()) later(drift, 7600);
  ta.addEventListener("input", () => { gh.style.display = ta.value ? "none" : ""; });
  later(() => askSun("Tap the sun when you’re done", () => { L.wrote = ta.value.trim(); nextStep(); }), mem ? 4200 : 600);
}
const count = (n) => ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"][n] ?? String(n);

/* ---------- Intend: one small thing for next week, with an example you can change ---------- */

function intend() {
  sun("17%");
  const s = store.get();
  // Ideas: what you picked for "next week" just now, then last week's intention if it worked, then the bank.
  const top = L.st ? [...L.st.rows].sort((a, b) => b.thoughts.length - a.thoughts.length)[0]?.p : null;
  const bank = top ? likely(top.name).flatMap((id) => STRUGGLES[id].helps.slice(0, 1)) : [];
  const ideas = [...new Set([...L.next.map((n) => n.text), ...(L.prevIntention?.did?.length ? [L.prevIntention.text] : []), ...bank, ...GENERAL_WORRY])].slice(0, 4);
  let pid = L.next[0]?.pillarId ?? L.prevIntention?.pillarId ?? top?.id ?? s.pillars[0]?.id;
  if (!s.pillars.some((p) => p.id === pid)) pid = s.pillars[0]?.id;
  L.body.innerHTML = `<p class="lb-ask" style="top:calc(17% + 52px)"></p>
    <div class="lb-words qa" style="top:31%;gap:16px"><p class="when fx">For next week</p>
      <p class="t1 fx" style="margin-top:-8px">One small thing that would help?</p>
      <div class="pen fx"><p class="lb-ghost"><span class="caret"></span><span class="gt">${esc(ideas[0])}</span></p><textarea class="ink short" rows="2" maxlength="60" aria-label="Your one small thing"></textarea></div>
      <button type="button" class="lb-link gold fx" id="use">Use this one</button>
      <div class="choice wrap fx" id="for" role="group" aria-label="Which part of your life"><span>For</span>${s.pillars.map((p) => `<button type="button" data-p="${p.id}" class="${p.id === pid ? "on" : ""}">${esc(p.name)}</button>`).join("")}</div></div>
    <div class="lb-words bottom"><button type="button" class="lb-link fx" id="skip">Not this week. Just rest.</button></div>`;
  const b = L.body, ta = b.querySelector("textarea"), gh = b.querySelector(".lb-ghost"), gt = b.querySelector(".gt"), use = b.querySelector("#use"), ask = b.querySelector(".lb-ask");
  fade(b);
  let i = 0;
  const drift = () => { if (ta.value || ideas.length < 2) return; gt.style.opacity = 0; later(() => { if (ta.value) return; i = (i + 1) % ideas.length; gt.textContent = ideas[i]; gt.style.opacity = 1; }, 800); later(drift, 4200); };
  if (!still()) later(drift, 7000);
  const ready = () => {
    const has = !!ta.value.trim();
    gh.style.display = ta.value ? "none" : ""; use.style.visibility = ta.value ? "hidden" : "";
    if (has) askSun("Tap the sun to keep it", keep); else { L.onSun = null; callSun(false); ask.classList.remove("on"); }
  };
  ta.addEventListener("input", ready);
  use.addEventListener("click", () => { ta.value = gt.textContent; ready(); ta.focus(); });
  b.querySelector("#for").addEventListener("click", (e) => { const x = e.target.closest("[data-p]"); if (!x) return; pid = x.dataset.p; b.querySelectorAll("#for [data-p]").forEach((c) => c.classList.toggle("on", c === x)); });
  b.querySelector("#skip").addEventListener("click", () => { L.newIntention = null; bloom(); after(""); });
  function keep() { L.newIntention = { text: ta.value.trim().replace(/\s+/g, " "), pillarId: pid }; after(L.newIntention.text); }
  function after(text) {
    const p = store.get().pillars.find((x) => x.id === pid);
    b.querySelector(".qa").style.opacity = 0; b.querySelector("#skip").style.opacity = 0;
    ask.style.top = "40%"; ask.classList.add("on"); ask.classList.remove("pulse");
    ask.textContent = text ? `It’ll glow by ${p?.name ?? "its planet"} all week.` : "Rest is enough. See you next week.";
    if (text) b.insertAdjacentHTML("beforeend", `<div class="mini" style="--c:${p ? shade(p) : "#a8a29d"}"><i></i><b></b></div><div class="lb-words" style="top:calc(52% + 44px)"><p class="t2">${esc(text)}</p></div>`);
    later(() => askSun("Tap the sun to go on", nextStep), 1600);
  }
}

/* ---------- Close: one last breath, a thank you, and the week is kept ---------- */

function closing() {
  sun("30%");
  save();
  const heavy = L.feel != null && L.feel >= 2;
  L.body.innerHTML = `<div class="lb-words" id="c1" style="top:calc(30% + 84px);gap:8px"><p class="t1 fx">One last breath.</p><p class="t2 fx">In, and slowly out.</p></div>
    <div class="lb-words" id="end" style="top:calc(30% + 84px);gap:8px;opacity:0;pointer-events:none">
      <p class="t1">Thank you for showing up for yourself.</p><p class="t2">Your week is kept in Record.</p>
      ${heavy ? `<p class="t2" style="margin-top:24px">This week felt heavy. You don’t have to carry it on your own.</p><button type="button" class="ghost2" id="talk">Talk to someone</button>` : ""}</div>
    <div class="lb-words bottom" id="eb" style="opacity:0;pointer-events:none;gap:4px"><button type="button" class="ghost2" id="home">Back to your sky</button><button type="button" class="lb-link quiet" id="page">See this week’s page</button></div>`;
  const b = L.body, w = L.layer.querySelector(".lb-sun");
  const show = (el, v) => { el.style.opacity = v ? 1 : 0; el.style.pointerEvents = v ? "" : "none"; };
  fade(b);
  const grow = (k, n) => { w.style.transition = `transform ${n}ms cubic-bezier(.4,.1,.4,1)`; w.style.transform = `scale(${k})`; };
  if (!still()) { later(() => grow(2.4, 4000), 1800); later(() => grow(1, 5000), 5800); }
  later(() => { show(b.querySelector("#c1"), 0); bloom(); L.layer.classList.add("ending"); }, still() ? 600 : 11000);
  later(() => show(b.querySelector("#end"), 1), still() ? 800 : 12200);
  later(() => show(b.querySelector("#eb"), 1), still() ? 1000 : 14200);
  b.querySelector("#talk")?.addEventListener("click", () => hooks.support());
  b.querySelector("#home").addEventListener("click", close);
  b.querySelector("#page").addEventListener("click", () => { close(); hooks.record(); });
}

// The week is kept as soon as Close begins, so leaving from here on loses nothing.
function save() {
  if (L.saved) return;
  L.saved = true;
  const s = store.get(), st = L.st ?? stats(s, L.from, L.to);
  const acts = {};
  for (const r of st.rows) for (const a of Object.values(r.acts)) acts[a.label] = (acts[a.label] ?? 0) + a.n;
  store.update((x) => {
    x.weeks.push({ from: L.from, to: L.to, at: now(), feel: L.feel, wrote: L.wrote, prompt: L.prompt, short: L.short, intention: L.prevIntention, notes: L.notes, acts });
    if (L.newIntention !== undefined) x.intention = L.newIntention ? { ...L.newIntention, setAt: now(), did: [] } : null;
    else x.intention = null;
  });
}
