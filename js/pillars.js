// Choosing pillars (3 to 5) and, for each, where you're at right now (1 or 2 mindsets).
// Saved as  pillars: [{ name: "Friends", mindsets: ["I feel lonely"] }]  using the card bank's own names,
// plus optional  kind: "Gym"  (Move),  own: true  (a pillar the person named),  note  (their own words, never sent).
// The screens say things in plain first-person lines; MINDSETS maps each line to the card bank's name for it.
import { h, LIFELINE } from "./util.js";
import * as store from "./store.js";
import { roundBtn } from "./ui.js";
import { log } from "./tester.js";
import { show as showStep, close, step as makeStep, where, spacer, mainBtn, begin } from "./checkin.js";

// Set aside for now (alex 2026-11-19): Outdoors, Learn, Give, Food and Money come back once they're reworked.
export const GROUPS = [
  ["People", ["Friends", "Family", "Love", "Community"]],
  ["Body and mind", ["Move", "Rest"]],
  ["Doing", ["Work and study", "Play and create"]],
  ["Purpose", ["Meaning"]],
  ["Self", ["Self"]],
];
export const SET_ASIDE = ["Outdoors", "Learn", "Give", "Food", "Money"];
// [words on screen, name in the card bank]. Reworked with alex pillar by pillar (2026-11-19/20). No "Something else".
export const MINDSETS = {
  "Friends": [["I don't feel close to my friends", "I feel lonely"], ["I want deeper friendships", "Deeper friendships"], ["We're close, but I rarely see them", "See them more"], ["I want to meet new people", "Meet new people (incl. starting from scratch)"]],
  "Family": [["I want to be closer", "Be closer"], ["It's complicated", "It's complicated"], ["I've just moved out", "Just moved out"]],
  "Love": [["I'm in a relationship", "In a relationship"], ["I'd like to meet someone", "I'd like to meet someone"], ["I've just had a break-up", "Just had a break-up"]],
  "Community": [["I want to feel part of something", "Part of something"], ["I've just moved somewhere new", "Just moved"], ["I want to find my people", "Find my people"]],
  "Move": [["I sit too much", "Sit too much"], ["I want to start moving", "Start moving"], ["I keep starting and stopping", "Starting and stopping"], ["I already train regularly", "Already train"], ["I want to find something I enjoy", "Find something I enjoy"]],
  "Rest": [["I'm exhausted", "I'm exhausted"], ["I can't switch off", "Can't switch off"], ["I want better sleep", "Better sleep"], ["I'm on my phone too late", "On my phone too late"]],
  "Work and study": [["I have too much on my plate", "Too much on my plate"], ["I keep putting things off", "Putting things off"], ["I want to move forward at work or uni", "Move forward"], ["I'm not sure I'm on the right path", "Right path"], ["I'm looking for work", "Looking for work"]],
  "Play and create": [["I want to get back into an old hobby", "Old hobby"], ["I want to find a new hobby", "New hobby"], ["I want to make something", "Make something"], ["I want more laughs and play", "Laughs and play"], ["I want to scroll less and do more", "Scroll less"]],
  "Meaning": [["I want to work out my values", "Work out my values"], ["My days feel like they're on repeat", "Days on repeat"], ["I want more moments that take my breath away", "Breath away"], ["I want to connect with my heritage", "Connect with my heritage"]],
  "Self": [["I want to be kinder to myself", "Kinder to myself"], ["I want to feel more confident", "More confident"], ["I want to feel okay in my body", "Okay in my body"], ["I compare myself to others", "Compare myself to others"], ["I'm working out who I am", "Working out who I am"], ["I want to understand my feelings better", "Understand my feelings"]],
};
const ASK = { "Friends": "friends", "Family": "family", "Love": "love", "Community": "community", "Move": "moving your body", "Rest": "rest",
  "Work and study": "work and study", "Play and create": "play and making things", "Meaning": "meaning", "Self": "yourself" };
export const MOVE_KINDS = ["Gym", "Running", "Walking", "Yoga", "Sport", "Dance"];
const MAX = 5, MIN = 3;

const and = (list) => list.length < 2 ? list.join("") : list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
const top = (s) => { s.querySelector(".step-body").style.justifyContent = "flex-start"; return s; };

// first: part of getting started, ends with "Draw your first card". Otherwise (from Settings) ends with "Save".
export function pickPillars(onDone, { first = false } = {}) { begin(onDone); pickSteps(() => close(true), { first }); }

// The screens, inside a flow that's already open (the morning check-in or a draw from home).
// ui: first-time setup (js/setup.js, alex 2026-11-26) shows these screens itself, sliding like the rest of setup,
// with its progress dots in place of "Getting started"; Back on the first screen goes back to the welcome.
export function pickSteps(then, { first = false, ui = null } = {}) {
  const show = ui ? ui.show : showStep, step = ui ? ui.step : makeStep;
  const had = store.get().pillars || [];
  const st = {
    picked: had.filter((p) => !p.own && MINDSETS[p.name]).map((p) => p.name),
    own: had.filter((p) => p.own).map((p) => p.name),
    // Only answers that still exist come back: set-aside pillars and old mindsets drop out (alex 2026-11-20).
    ms: Object.fromEntries(had.filter((p) => MINDSETS[p.name]).map((p) => [p.name, (p.mindsets || []).filter((m) => MINDSETS[p.name].some(([, k]) => k === m))])),
    other: Object.fromEntries(had.filter((p) => p.own).map((p) => [p.name, p.note || ""])),
    kind: Object.fromEntries(had.filter((p) => p.kind).map((p) => [p.name, p.kind])),
    kinds: MOVE_KINDS.slice(), i: 0, t0: Date.now(), at: "pillars",
  };
  had.forEach((p) => { if (p.kind && !st.kinds.includes(p.kind)) st.kinds.push(p.kind); });
  const all = () => [...st.picked, ...st.own];
  log("pick_start", first ? "setup" : "settings");
  const quit = () => { log("pick_quit", st.at); close(false); };
  const closeBtn = () => roundBtn("close", "Stop for now", quit);

  // ---------- Step 1: which pillars ----------
  function pillars() {
    st.at = "pillars";
    const note = h("p.note", { "aria-live": "polite" });
    const said = h("p.said", { "aria-live": "polite" });
    const btn = mainBtn("", false, () => { log("pick_pillars", [...st.picked, ...st.own.map(() => "Own")]); st.i = 0; mindset(); });
    const els = {};
    const refresh = () => {
      const n = all().length;
      for (const [name, el] of Object.entries(els)) { const on = st.picked.includes(name); el.setAttribute("aria-pressed", String(on)); el.classList.toggle("off", !on && n >= MAX); }
      btn.textContent = n < MIN ? `Pick ${MIN - n} more` : "Next";
      btn.setAttribute("aria-disabled", String(n < MIN));
      const list = all();
      said.replaceChildren(...(list.length ? ["You picked ", ...list.flatMap((v, i) => [h("b", null, v), i < list.length - 2 ? ", " : i === list.length - 2 ? " and " : ""]), "."] : []));
    };
    const full = () => { note.textContent = "Five is the most. Tap one to swap it out."; };
    const tap = (name) => {
      if (st.picked.includes(name)) st.picked = st.picked.filter((x) => x !== name);
      else if (all().length >= MAX) return full();
      else st.picked.push(name);
      note.textContent = ""; refresh();
    };
    const ownPills = h("div.pills"), ownWrap = h("div");
    const drawOwn = () => ownPills.replaceChildren(
      ...st.own.map((v) => h("button.pill", { "aria-pressed": "true", "aria-label": `${v}, tap to remove`, onclick: () => { st.own = st.own.filter((x) => x !== v); drawOwn(); refresh(); } }, v)),
      h("button.plus", { "aria-label": "Make your own pillar", onclick: () => {
        if (all().length >= MAX) return full();
        ownWrap.replaceChildren(ownField("Name it", 24, (v) => { if (!all().some((x) => x.toLowerCase() === v.toLowerCase())) st.own.push(v); ownWrap.replaceChildren(); drawOwn(); refresh(); }));
      } }, "+"));
    drawOwn();
    const groups = GROUPS.map(([g, names]) => h("div.pick-group.rise", null, h("span.pick-head", null, g),
      h("div.pills", null, names.map((n) => (els[n] = h("button.pill", { onclick: () => tap(n) }, n))))));
    refresh();
    show(top(step(ui ? [roundBtn("back", "Back", ui.back), ui.dots(), spacer()] : [spacer(), where(first ? "Getting started" : "Your pillars"), closeBtn()],
      [h("h1.q.rise", { style: { fontSize: "22px" } }, "What matters to you right now?"), h("p.q2.rise", null, "Pick 3 to 5. You can change them any time."),
        ...groups, h("div.pick-group.rise", null, h("span.pick-head", null, "Your own"), ownPills, ownWrap)],
      [note, said, btn, LIFELINE()])));
  }

  // ---------- Step 2: one short screen per pillar ----------
  function mindset() {
    const list = all();
    if (st.i >= list.length) return finish();
    const p = list[st.i], last = st.i === list.length - 1;
    st.at = "mindset_" + (st.own.includes(p) ? "own" : p);
    const back = roundBtn("back", "Back", () => { if (st.i === 0) pillars(); else { st.i--; mindset(); } });
    const head = ui ? [back, ui.dots(), spacer()] : [back, where(`${p} · ${st.i + 1} of ${list.length}`), closeBtn()];
    const label = last ? (ui ? "Next" : first ? "Make my deck" : "Save") : "Next";

    if (st.own.includes(p)) {
      // Their own pillar: no cards for it yet, so just room to write something, if they want to.
      const ta = h("textarea.pick-text", { rows: "3", maxlength: "160", placeholder: "Write something (optional)", "aria-label": `Where you're at with ${p}` });
      ta.value = st.other[p] || "";
      ta.addEventListener("input", () => (st.other[p] = ta.value));
      show(top(step(head, [h("h1.q.rise", { style: { fontSize: "22px" } }, `Where are you at with ${p.toLowerCase()} right now?`), h("div.rise", null, ta)],
        [mainBtn(label, true, () => { log("pick_mindset", { p: "Own", wrote: !!(st.other[p] || "").trim() }); st.i++; mindset(); }), LIFELINE()])));
      return;
    }

    const picked = st.ms[p] || (st.ms[p] = []);
    const note = h("p.note", { "aria-live": "polite" });
    const btn = mainBtn(label, picked.length > 0, () => {
      log("pick_mindset", { p, m: picked.slice(), kind: p === "Move" ? (st.kind[p] ? (MOVE_KINDS.includes(st.kind[p]) ? st.kind[p] : "Own") : null) : undefined });
      st.i++; mindset();
    });
    const rows = [];
    const refresh = () => {
      rows.forEach(([el, key]) => { const on = picked.includes(key); el.setAttribute("aria-pressed", String(on)); el.classList.toggle("off", !on && picked.length >= 2); });
      btn.setAttribute("aria-disabled", String(!picked.length));
    };
    const tap = (key) => {
      if (picked.includes(key)) picked.splice(picked.indexOf(key), 1);
      else if (picked.length >= 2) { note.textContent = "Two is plenty. Tap one to change it."; return; }
      else picked.push(key);
      note.textContent = "";
      refresh();
    };
    const rowsEl = h("div.mrows", null, MINDSETS[p].map(([shown, key]) => { const el = h("button.mrow", { onclick: () => tap(key) }, shown); rows.push([el, key]); return el; }));
    refresh();

    let kind = null;
    if (p === "Move") {
      const pills = h("div.pills"), addWrap = h("div");
      const draw = () => pills.replaceChildren(
        ...st.kinds.map((k) => h("button.pill", { "aria-pressed": String(st.kind[p] === k), onclick: () => { st.kind[p] = st.kind[p] === k ? null : k; draw(); } }, k)),
        h("button.plus", { "aria-label": "Add your own kind", onclick: () => addWrap.replaceChildren(ownField("e.g. Climbing", 24, (v) => {
          if (!st.kinds.some((k) => k.toLowerCase() === v.toLowerCase())) st.kinds.push(v);
          st.kind[p] = st.kinds.find((k) => k.toLowerCase() === v.toLowerCase()); addWrap.replaceChildren(); draw();
        })) }, "+"));
      draw();
      kind = h("div.pick-group.rise", null, h("span.pick-head", null, "What kind? (optional)"), pills, addWrap);
    }
    show(top(step(head,
      [h("h1.q.rise", { style: { fontSize: "22px" } }, `Where are you at with ${ASK[p]} right now?`), h("p.q2.rise", null, "Pick one or two."),
        h("div.rise", null, rowsEl), kind, h("div.rise", null, note)],
      [btn, LIFELINE()])));
  }

  // ---------- Save ----------
  function finish() {
    const s = store.get();
    s.pillars = all().map((name) => {
      if (st.own.includes(name)) { const o = { name, own: true, mindsets: [] }; const t = (st.other[name] || "").trim(); if (t) o.note = t; return o; }
      const o = { name, mindsets: (st.ms[name] || []).slice() };
      if (st.kind[name]) o.kind = st.kind[name];
      return o;
    });
    store.save();
    log("pick_done", { secs: Math.round((Date.now() - st.t0) / 1000), n: s.pillars.length, own: st.own.length, first });
    if (!first || ui) return then();
    // Getting started: show the deck that was just dealt, then on to the first draw.
    import("./deck.js").then((deck) => {
      const n = deck.deck().length;
      const back = roundBtn("back", "Back", () => { st.i = Math.max(0, all().length - 1); mindset(); });
      show(step([back, where("Your deck"), spacer()],
        [h("div.mini-deck.rise", { "aria-hidden": "true" }, h("i"), h("i"), h("i")), h("p.big-count.rise", null, `${n} cards`),
          h("p.q2.rise", null, "Dealt from what you picked. Change it any time in Settings."),
          h("div.pills.rise", { style: { justifyContent: "center" } }, s.pillars.map((p) => h("span.chip", null, p.name + (p.kind ? ` (${p.kind})` : ""))))],
        [mainBtn("Draw your first card", true, then), LIFELINE()]));
    });
  }

  function ownField(placeholder, max, add) {
    const inp = h("input", { placeholder, maxlength: String(max), "aria-label": placeholder, "data-focus": "" });
    const go = () => { const v = inp.value.trim(); if (v) add(v); };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    setTimeout(() => inp.focus(), 50);
    return h("div.own-row", { style: { marginTop: "8px" } }, inp, h("button.btn-soft", { onclick: go }, "Add"));
  }

  pillars();
}

// Pillars and mindsets were reworked (alex 2026-11-20). Someone who picked a set-aside pillar or an old mindset is asked
// once, gently, to pick again. "Not now" keeps whatever still exists and doesn't ask again.
const fits = (p) => p.own || (MINDSETS[p.name] && p.other == null && (p.mindsets || []).every((m) => MINDSETS[p.name].some(([, k]) => k === m)));
export function needsRepick(s = store.get()) { return Array.isArray(s.pillars) && !s.repicked && s.pillars.some((p) => !fits(p)); }
function tidy(s) {
  s.pillars = s.pillars.filter((p) => p.own || MINDSETS[p.name]).map((p) => {
    if (p.own) return p;
    const o = { name: p.name, mindsets: (p.mindsets || []).filter((m) => MINDSETS[p.name].some(([, k]) => k === m)) };
    if (p.kind) o.kind = p.kind;
    return o;
  });
  s.repicked = 1; store.save();
}
export function repickSteps(then) {
  const s = store.get(), gone = s.pillars.filter((p) => !p.own && !MINDSETS[p.name]).map((p) => p.name);
  log("repick_shown", { gone: gone.length });
  showStep(makeStep([spacer(), where("Your pillars"), spacer()],
    [h("h1.q.rise", { style: { fontSize: "22px" } }, "Your pillars have new choices"),
      h("p.q2.rise", null, "The cards have been reworked, and so have the answers to where you're at. Pick again so your deck fits you."),
      gone.length ? h("p.q2.rise", null, `${and(gone)} ${gone.length > 1 ? "are" : "is"} set aside for now while ${gone.length > 1 ? "they're" : "it's"} reworked. Pick another if you like.`) : null],
    [mainBtn("Pick again", true, () => { log("repick", "pick"); tidy(s); pickSteps(then); }),
      h("button.btn-quiet", { onclick: () => { log("repick", "later"); tidy(s); then(); } }, "Not now"), LIFELINE()]));
}

// For Settings: "Friends, Rest and Move".
export const pillarWords = () => and((store.get().pillars || []).map((p) => p.name));
