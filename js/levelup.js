// The level-up moment (alex 2026-11-24, "B"): the screen dims and the eclipse opens: the moon slides aside so more
// of the sun shows, and "Level 5" rises under it. If the level opened something, the eclipse and "Level 5" glide up
// and stay as the heading while a card is dealt from below and turns over to show what opened, with "Open …" and
// "Later". This replaces the old "Level 4." words and the pointing tip. If nothing opened, it closes by itself.
// Tap anywhere early to skip ahead. Reduce motion shows the end state with no movement. Words never leave the phone.
import { h, reduceMotion } from "./util.js";
import { log } from "./tester.js";

const NS = "http://www.w3.org/2000/svg";
const OPEN = { days: "Open Your days", friends: "Open Friends", library: "Open Cards" };   // own: it's for tonight; recap: it comes on Sunday ("Okay")
let n = 0;

// show(level, unlock, { text, onOpen(id), onDone() }): unlock is levels.opensAt(level) or null; text its longer line.
export function show(level, unlock, { text = "", onOpen, onDone } = {}) {
  const rm = reduceMotion(), D = (ms) => (rm ? 0 : ms), uid = "lu" + (++n);
  const H = innerHeight;
  const anims = [], intro = [];
  const an = (el, kf, o, isIntro = true) => { const a = el.animate(kf, { fill: "both", ...o, duration: D(o.duration), delay: D(o.delay || 0) }); anims.push(a); if (isIntro) intro.push(a); return a; };

  // The eclipse: the sun, with the moon in front of it (the logo).
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 180 180"); svg.setAttribute("class", "lu-ecl"); svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<defs><mask id="${uid}"><rect width="180" height="180" fill="#fff"/><circle class="lu-hole" cx="76" cy="90" r="58" fill="#000"/></mask></defs>`
    + `<circle cx="90" cy="90" r="58" fill="#ffa51f" mask="url(#${uid})"/><circle class="lu-moon" cx="76" cy="90" r="58" fill="#141416"/>`;
  const title = h("div.lu-title", null, h("b", null, `Level ${level}`), unlock ? null : h("span", null, "Every level brings a box."));
  const dim = h("div.lu-dim");
  const root = h("div.lu", { role: "dialog", "aria-label": unlock ? `Level ${level}. ${unlock.name} is open.` : `Level ${level}.` }, dim, svg, title);

  // Where things sit: the eclipse starts at 40% of the screen; with a card, it ends as the heading above it.
  const cardH = Math.min(378, Math.round(H * 0.42)), cardW = Math.round(cardH / 1.4);
  const cardTop = H - 170 - cardH, eclY0 = Math.round(H * 0.40), eclY1 = cardTop - 146;
  svg.style.top = `${eclY0 - 90}px`; title.style.top = `${eclY0 + 104}px`;

  let card = null, btns = null, inner = null;
  if (unlock) {
    inner = h("div.lu-in", null, h("div.lu-face.lu-back"),
      h("div.lu-face.lu-front", null, h("small", null, `Level ${level} opened`), h("b", null, unlock.name), h("p", null, text || unlock.line)));
    card = h("div.lu-card", { style: { width: `${cardW}px`, height: `${cardH}px`, top: `${cardTop}px`, marginLeft: `${-cardW / 2}px` } }, inner);
    const open = OPEN[unlock.id];
    btns = h("div.lu-btns", null,
      h("button.btn-main", { type: "button", onclick: () => close(open ? "open" : "later") }, open || "Okay"),
      open ? h("button.btn-quiet", { type: "button", onclick: () => close("later") }, "Later") : null);
    root.append(card, btns);
  }
  document.body.classList.add("in-levelup");
  document.body.append(root);

  an(dim, [{ opacity: 0 }, { opacity: 0.84 }], { duration: 450, easing: "ease-out" });
  an(svg, [{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "scale(1)" }], { duration: 600, delay: 200, easing: "cubic-bezier(.2,.8,.2,1)" });
  svg.querySelectorAll(".lu-moon, .lu-hole").forEach((c) => an(c, [{ transform: "translateX(0)" }, { transform: "translateX(-16px)" }], { duration: 1300, delay: 650, easing: "cubic-bezier(.4,0,.2,1)" }));
  an(title, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 500, delay: 1350, easing: "ease-out" });
  let ready;   // the moment buttons can be pressed (or, with nothing opened, when it closes itself)
  if (unlock) {
    const dy = eclY1 - eclY0;
    an(svg, [{ transform: "translateY(0) scale(1)" }, { transform: `translateY(${dy}px) scale(.62)` }], { duration: 800, delay: 2300, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
    an(title, [{ transform: "translateY(0)" }, { transform: `translateY(${dy - 30}px)` }], { duration: 800, delay: 2300, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
    an(card, [{ transform: `translateY(${H}px) rotate(-5deg)` }, { transform: "translateY(0) rotate(0)" }], { duration: 800, delay: 2600, easing: "cubic-bezier(.2,.9,.25,1.03)" });
    const flip = an(inner, [{ transform: "rotateY(0)" }, { transform: "rotateY(180deg)" }], { duration: 700, delay: 3600, easing: "cubic-bezier(.45,.05,.25,1)" });
    an(btns, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 400, delay: 4300, easing: "ease-out" });
    flip.finished.then(() => { if (navigator.vibrate) try { navigator.vibrate(12); } catch { /* not on iPhone */ } }).catch(() => {});
    ready = Promise.all(intro.map((a) => a.finished)).catch(() => {});
  } else {
    ready = Promise.all(intro.map((a) => a.finished)).catch(() => {});
    const auto = setTimeout(() => close("auto"), rm ? 2600 : 3800);
    root.addEventListener("click", () => { clearTimeout(auto); close("tap"); });
  }
  // Tap anywhere before the card has turned: skip to the end of the intro.
  if (unlock) dim.addEventListener("click", () => intro.forEach((a) => { try { a.finish(); } catch { /* already done */ } }));
  log("unlock_tip", unlock ? unlock.id : null);

  let gone = false;
  function close(how) {
    if (gone) return; gone = true;
    if (unlock) log("unlock_act", { id: unlock.id, open: how === "open" ? 1 : 0 });
    anims.forEach((a) => { try { a.finish(); } catch { /* fine */ } });
    const out = [];
    if (card) out.push(card.animate([{ transform: "translateY(0)" }, { transform: `translateY(${H}px)` }], { duration: D(500), easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" }));
    [svg, title, btns].filter(Boolean).forEach((e) => out.push(e.animate([{ opacity: getComputedStyle(e).opacity }, { opacity: 0 }], { duration: D(300), fill: "forwards" })));
    out.push(dim.animate([{ opacity: 0.84 }, { opacity: 0 }], { duration: D(450), delay: D(200), easing: "ease-in", fill: "forwards" }));
    Promise.all(out.map((a) => a.finished)).catch(() => {}).then(() => {
      root.remove(); document.body.classList.remove("in-levelup");
      if (how === "open" && onOpen) onOpen(unlock.id);
      onDone && onDone(how);
    });
  }
  return { ready, close };
}
