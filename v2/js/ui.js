// Bottom sheets: rise from the bottom, tap outside to close.
import { h } from "./util.js";

export function openSheet(build, { onClose, label } = {}) {
  const wrap = h("div.sheet-host", { role: "dialog", "aria-modal": "true", "aria-label": label || "" });
  const dim = h("div.sheet-dim"), panel = h("div.sheet");
  let closed = false;
  const close = (why) => {
    if (closed) return; closed = true;
    wrap.classList.remove("sheet-open");
    setTimeout(() => wrap.remove(), 420);
    onClose && onClose(why);
  };
  dim.addEventListener("click", () => close("outside"));
  panel.append(h("span.grabber", { "aria-hidden": "true" }));
  build(panel, close);
  wrap.append(dim, panel);
  document.body.append(wrap);
  // Swipe down on the grabber area to close.
  let y0 = null;
  panel.addEventListener("pointerdown", (e) => { if (e.clientY - panel.getBoundingClientRect().top < 40) y0 = e.clientY; });
  panel.addEventListener("pointerup", (e) => { if (y0 != null && e.clientY - y0 > 60) close("swipe"); y0 = null; });
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add("sheet-open")));
  return close;
}

// Pills with a round + at the end, "Show N more" and an "in your words" field.
// opts: { main, more, picked:Set, onToggle(word), onAdd(word), noteOnce(), notSure }
// "Not sure" (feelings only) sits after the first six when closed, and at the very end when open.
export function pillPicker(opts) {
  const root = h("div.col", { style: { gap: "8px" } });
  let open = false;
  const sync = () => root.querySelectorAll("[data-w]").forEach((b) => b.setAttribute("aria-pressed", opts.picked.has(b.dataset.w) ? "true" : "false"));
  const pill = (w, i, extra = "") => h("button.pill" + extra, { "data-w": w, "aria-pressed": "false", style: i != null ? { transitionDelay: `${60 + Math.min(i, 10) * 25}ms` } : null,
    onclick: () => { opts.onToggle(w); sync(); } }, w);
  const draw = (focus) => {
    root.replaceChildren();
    const plusA = h("button.plus", { "aria-label": "Add your own", onclick: () => adding() }, "+");
    const plusB = h("button.plus", { "aria-label": "Add your own", onclick: () => adding() }, "+");
    const nsA = opts.notSure ? pill(opts.notSure, null, ".outline") : null, nsB = opts.notSure ? pill(opts.notSure, opts.more.length, ".outline") : null;
    const wrap = h("div.more-wrap", null, h("div", null, h("div.pills", { style: { paddingTop: "0" } }, opts.more.map((w, i) => pill(w, i)), plusB, nsB)));
    const label = h("button.btn-text", { style: { alignSelf: "center", fontSize: "15px", color: "var(--ink2)" }, "aria-expanded": "false" });
    const set = () => {
      wrap.classList.toggle("open", open);
      plusA.hidden = open; if (nsA) nsA.hidden = open;
      plusB.tabIndex = open ? 0 : -1; wrap.querySelectorAll(".pill").forEach((p) => (p.tabIndex = open ? 0 : -1));
      label.textContent = open ? "Show fewer" : `Show ${opts.more.length} more`; label.setAttribute("aria-expanded", String(open));
    };
    label.addEventListener("click", () => { open = !open; set(); });
    root.append(h("div.pills", null, opts.main.map((w) => pill(w)), plusA, nsA), wrap);
    if (opts.more.length) root.append(label);
    set(); sync();
    const adding = () => {
      if (root.querySelector("input")) return root.querySelector("input").focus();
      const inp = h("input", { placeholder: "In your words", "aria-label": "Your own", maxlength: "40", enterkeyhint: "done" });
      const add = () => {
        const w = inp.value.trim();
        if (!w) { inp.parentNode.remove(); return; }
        opts.onAdd(w); draw();
        if (opts.noteOnce && opts.noteOnce()) root.append(h("span.note", null, "Saved. Your words stay here for next time."));
      };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
      root.insertBefore(h("div.own-row", null, inp, h("button.btn-soft", { onclick: add }, "Add")), label.isConnected ? label : null);
      inp.focus();
    };
  };
  draw();
  return { el: root, redraw: () => draw() };
}

// Round see-through icon buttons (iOS 26 style). kind: "back" | "close" | "settings".
const ICON = {
  back: [["path", { d: "M15 18l-6-6 6-6" }]],
  close: [["path", { d: "M6 6l12 12M18 6L6 18" }]],
  settings: [["circle", { cx: "12", cy: "12", r: "3" }], ["path", { d: "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" }]],
};
export function roundBtn(kind, label, onclick) {
  const svg = h("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": kind === "settings" ? "1.8" : "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
    ICON[kind].map(([t, a]) => h(t, a)));
  return h("button.round", { "aria-label": label, onclick }, svg);
}

// Slide the little sun across to act (like "slide to power off"), so a stray tap can't start it.
// A tap just nudges the sun to show it slides. Keyboards and screen readers can still press it.
export function slideTo(label, act) {
  const knob = h("button.slide-knob", { "aria-label": label });
  const words = h("span.slide-words", { "aria-hidden": "true" }, "Slide to " + label.charAt(0).toLowerCase() + label.slice(1));
  const track = h("div.slide", null, words, knob);
  let x0 = null, dx = 0, moved = false, done = false;
  const max = () => track.clientWidth - knob.offsetWidth - 8;
  const put = (x, anim) => {
    knob.style.transition = anim ? "transform .35s var(--spring)" : "none";
    knob.style.transform = `translateX(${x}px)`;
    words.style.opacity = String(Math.max(0, 1 - x / (max() * 0.6)));
  };
  const finish = () => { done = true; put(max(), true); navigator.vibrate?.(10); setTimeout(act, 220); setTimeout(() => { done = false; put(0, false); }, 900); };
  knob.addEventListener("pointerdown", (e) => { if (done) return; x0 = e.clientX; dx = 0; moved = false; knob.setPointerCapture(e.pointerId); });
  knob.addEventListener("pointermove", (e) => { if (x0 == null) return; dx = Math.max(0, Math.min(max(), e.clientX - x0)); if (dx > 4) moved = true; put(dx, false); });
  const up = () => { if (x0 == null) return; x0 = null; if (dx >= max() * 0.85) finish(); else put(0, true); };
  knob.addEventListener("pointerup", up);
  knob.addEventListener("pointercancel", up);
  knob.addEventListener("click", (e) => {
    if (done || moved) return;
    if (e.detail === 0) { finish(); return; } // keyboard or screen reader
    put(40, true); setTimeout(() => put(0, true), 260); // a tap: show it slides
  });
  return track;
}
