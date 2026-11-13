// Choosing pillars (3 to 5) and, for each, where you're at right now (1 or 2 mindsets).
// Saved as  pillars: [{ name: "Friends", mindsets: ["I feel lonely"] }]  using the card bank's own names,
// plus optional  kind: "Gym"  (Move),  own: true  (a pillar the person named),  note / other  (their own words, never sent).
// The screens say things in plain first-person lines; MINDSETS maps each line to the card bank's name for it.
import { h, LIFELINE } from "./util.js";
import * as store from "./store.js";
import { roundBtn } from "./ui.js";
import { log } from "./tester.js";
import { show, close, step, where, spacer, mainBtn, begin } from "./checkin.js";

export const GROUPS = [
  ["People", ["Friends", "Family", "Love", "Community"]],
  ["Body and mind", ["Move", "Food", "Rest", "Outdoors"]],
  ["Doing", ["Work and study", "Money", "Learn", "Play and create"]],
  ["Purpose", ["Give", "Meaning"]],
];
// [words on screen, name in the card bank]
export const MINDSETS = {
  "Friends": [["I don't feel close to my friends", "I feel lonely"], ["I want deeper friendships", "Deeper friendships"], ["We're close, but I rarely see them", "See them more"], ["I want to meet new people", "Meet new people (incl. starting from scratch)"]],
  "Family": [["I want to be closer", "Be closer"], ["It's complicated", "It's complicated"], ["I've just moved out", "Just moved out"]],
  "Love": [["I'm in a relationship", "In a relationship"], ["I'd like to meet someone", "I'd like to meet someone"], ["I'm single and okay", "Single and okay"], ["I've just had a break-up", "Just had a break-up"]],
  "Community": [["I want to feel part of something", "Part of something"], ["I've just moved somewhere new", "Just moved"], ["I want to find my people", "Find my people"]],
  "Move": [["I want to start", "I want to start"], ["I want to keep going", "Keep going"], ["I'm coming back after a break", "Coming back after a break"]],
  "Food": [["I forget to eat properly", "I forget to eat properly"], ["I want to cook more", "Cook more"], ["I want to enjoy food again", "Enjoy food again"]],
  "Rest": [["I'm exhausted", "I'm exhausted"], ["I can't switch off", "Can't switch off"], ["I want better sleep", "Better sleep"], ["I'm on my phone too late", "On my phone too late"]],
  "Outdoors": [["I'm inside too much", "I'm inside too much"], ["I want to explore more", "Explore more"]],
  "Work and study": [["I want to get ahead", "Get ahead"], ["It's eating my life", "It's eating my life"], ["I'm stuck", "I'm stuck"], ["I'm looking for work", "Looking for work"], ["Study is swamping me", "Study is swamping me"], ["I want to feel good at what I do", "Feel good at what I do"]],
  "Money": [["I'm stressed about money", "Stressed about money"], ["I avoid looking at my account", "Avoid looking at my account"], ["I want to save for something", "Save for something"]],
  "Learn": [["I want a new skill", "A new skill"], ["I want to read more", "Read more"], ["I'm curious about something", "Curious about something"], ["I want to finish something I started", "Finish something I started"]],
  "Play and create": [["I've lost my hobbies", "Lost my hobbies"], ["I want to make something", "Make something"], ["I just want more fun", "More fun"], ["I want less screen time", "Less screen time"]],
  "Give": [["I want to help more", "Help more"], ["I want to be kinder", "Be kinder"]],
  "Meaning": [["I want to work out what matters to me", "Work out what matters to me"], ["I want to connect with my culture", "Connect with my culture"]],
};
const ASK = { "Friends": "friends", "Family": "family", "Love": "love", "Community": "community", "Move": "moving your body", "Food": "food", "Rest": "rest",
  "Outdoors": "the outdoors", "Work and study": "work and study", "Money": "money", "Learn": "learning", "Play and create": "play and making things", "Give": "giving", "Meaning": "meaning" };
export const MOVE_KINDS = ["Gym", "Running", "Walking", "Yoga", "Sport", "Dance"];
const OTHER = "Something else";
const MAX = 5, MIN = 3;

const and = (list) => list.length < 2 ? list.join("") : list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
const top = (s) => { s.querySelector(".step-body").style.justifyContent = "flex-start"; return s; };

// first: part of getting started, ends with "Draw your first card". Otherwise (from Settings) ends with "Save".
export function pickPillars(onDone, { first = false } = {}) { begin(onDone); pickSteps(() => close(true), { first }); }

// The screens, inside a flow that's already open (the morning check-in or a draw from home).
export function pickSteps(then, { first = false } = {}) {
  const had = store.get().pillars || [];
  const st = {
    picked: had.filter((p) => !p.own).map((p) => p.name),
    own: had.filter((p) => p.own).map((p) => p.name),
    ms: Object.fromEntries(had.map((p) => [p.name, (p.mindsets || []).slice().concat(p.other != null ? [OTHER] : [])])),
    other: Object.fromEntries(had.map((p) => [p.name, p.other || p.note || ""])),
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
    show(top(step([spacer(), where(first ? "Getting started" : "Your pillars"), closeBtn()],
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
    const head = [back, where(`${p} · ${st.i + 1} of ${list.length}`), closeBtn()];
    const label = last ? (first ? "Make my deck" : "Save") : "Next";

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
    const note = h("p.note", { "aria-live": "polite" }), otherWrap = h("div");
    const btn = mainBtn(label, picked.length > 0, () => {
      log("pick_mindset", { p, m: picked.filter((x) => x !== OTHER), other: picked.includes(OTHER), kind: p === "Move" ? (st.kind[p] ? (MOVE_KINDS.includes(st.kind[p]) ? st.kind[p] : "Own") : null) : undefined });
      st.i++; mindset();
    });
    const rows = [];
    const drawOther = () => {
      if (!picked.includes(OTHER)) return otherWrap.replaceChildren();
      const inp = h("input", { placeholder: "In your own words (optional)", maxlength: "80", "aria-label": "In your own words" });
      inp.value = st.other[p] || ""; inp.addEventListener("input", () => (st.other[p] = inp.value));
      otherWrap.replaceChildren(h("div.own-row", null, inp));
    };
    const refresh = () => {
      rows.forEach(([el, key]) => { const on = picked.includes(key); el.setAttribute("aria-pressed", String(on)); el.classList.toggle("off", !on && picked.length >= 2); });
      btn.setAttribute("aria-disabled", String(!picked.length));
    };
    const tap = (key) => {
      if (picked.includes(key)) picked.splice(picked.indexOf(key), 1);
      else if (picked.length >= 2) { note.textContent = "Two is plenty. Tap one to change it."; return; }
      else picked.push(key);
      note.textContent = "";
      if (key === OTHER) drawOther();
      refresh();
    };
    const list2 = MINDSETS[p].concat([[OTHER, OTHER]]);
    const rowsEl = h("div.mrows", null, list2.map(([shown, key]) => { const el = h("button.mrow", { onclick: () => tap(key) }, shown); rows.push([el, key]); return el; }));
    drawOther(); refresh();

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
        h("div.rise", null, rowsEl), h("div.rise", null, otherWrap), kind, h("div.rise", null, note)],
      [btn, LIFELINE()])));
  }

  // ---------- Save ----------
  function finish() {
    const s = store.get();
    s.pillars = all().map((name) => {
      if (st.own.includes(name)) { const o = { name, own: true, mindsets: [] }; const t = (st.other[name] || "").trim(); if (t) o.note = t; return o; }
      const m = st.ms[name] || [], o = { name, mindsets: m.filter((x) => x !== OTHER) };
      if (m.includes(OTHER)) o.other = (st.other[name] || "").trim();
      if (st.kind[name]) o.kind = st.kind[name];
      return o;
    });
    store.save();
    log("pick_done", { secs: Math.round((Date.now() - st.t0) / 1000), n: s.pillars.length, own: st.own.length, first });
    if (!first) return then();
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

// For Settings: "Friends, Rest and Move".
export const pillarWords = () => and((store.get().pillars || []).map((p) => p.name));
