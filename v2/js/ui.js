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
    const label = h("button.btn-text", { style: { alignSelf: "center", fontSize: "15px" }, "aria-expanded": "false" });
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
