// The sky: a charcoal night with a warm sun (you) at the centre, a planet per pillar on a tilted orbit,
// and one star per thought you've caught. There are no decorative stars: an empty sky means a clear head.
import { orbit } from "./pillars.js";
import { now } from "./clock.js";

// The sky is drawn on a 300-wide canvas (the size the designs were made at) and stretched to fill the screen.
const W = 300, H = 650, CX = W / 2, CY = H * 0.36;
const SUN = "#f2c08f", INK = "#efede9";

// Thought stars are soft sparkles; the number of points tells the kind apart.
export const POINTS = { kind: 4, worry: 6, want: 8 };
const TINT = { kind: "#fff3e2", worry: "#ffd6c8", want: "#dbe8ff" };
const GLOW = { kind: "#ffe1b8", worry: "#ffab94", want: "#8fb3ff" };

export function sparkle(n, r) {
  const inner = n === 4 ? 0.28 : n === 6 ? 0.3 : 0.34;
  const P = (a, rr) => `${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`;
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 / n) * i - Math.PI / 2, b = a + Math.PI / n, c = a + Math.PI * 2 / n;
    d += (i === 0 ? `M${P(a, r)}` : "") + ` Q${P(b, r * inner)} ${P(c, r)}`;
  }
  return d + "Z";
}

// Planets are flat with a crisp shadow. Surface marks sit on a real sphere: as the planet turns they
// curve round, squash at the edges and disappear behind it, so different sides come into view.
const FEAT = [
  // [longitude, latitude, size, light?, stretch]
  [[0, .3, .22], [1.2, -.4, .16], [2.3, .1, .26], [3.3, .5, .12], [4.2, -.2, .2], [5.3, .45, .14], [.6, -.6, .1]],
  [[.8, .3, .22, 0, 1.8], [3, -.25, .13, 1, 2.2], [4.6, .4, .1, 0, 1.6], [5.6, -.1, .08, 1, 2]],
  [[1, .4, .13], [3.5, -.3, .16], [5, .1, .1, 1, 2]],
  [[0, -.2, .2, 1, 2.6], [2, .35, .18, 0, 2.2], [3.8, -.4, .16, 1, 2], [5, .2, .2, 0, 2.4]],
];
const TILT = [-8, -12, -18, -6, -14], TURN = [30, 22, 36, 26, 28];
const f2 = (n) => n.toFixed(2);

export function planet(id, i, r, c) {
  const k = `${id}p${i}`, look = i % FEAT.length;
  const bands = look === 1
    ? [[-.62, .2, 1], [-.22, .14, 0], [.12, .22, 1], [.5, .14, 0]].map(([y, h, l]) => `<rect x="${-r}" y="${f2(y * r)}" width="${2 * r}" height="${f2(h * r)}" fill="${l ? "#fff" : "#000"}" opacity="${l ? .1 : .12}"/>`).join("")
    : look === 2 ? `<rect x="${-r}" y="${f2(-.14 * r)}" width="${2 * r}" height="${f2(.28 * r)}" fill="#fff" opacity=".1"/>` : "";
  return `<g class="wob" style="--wd:${TURN[i] / 2}s"><defs><clipPath id="${k}c"><circle r="${r}"/></clipPath>
    <mask id="${k}m"><rect x="${-2 * r}" y="${-2 * r}" width="${4 * r}" height="${4 * r}" fill="#fff"/><circle cx="${f2(-.3 * r)}" cy="${f2(-.24 * r)}" r="${f2(r * 1.04)}" fill="#000"/></mask></defs>
    <g clip-path="url(#${k}c)"><circle r="${r}" fill="${c}"/><g transform="rotate(${TILT[i]})">${bands}<g data-spin="${look}" data-turn="${TURN[i]}" data-r="${r}"></g></g>
    <circle r="${r}" fill="#000" opacity=".3" mask="url(#${k}m)"/></g></g>`;
}

let spinning = 0;
export function startSpin(root) {
  cancelAnimationFrame(spinning);
  const cx = (ROAM.x0 + ROAM.x1) / 2, cy = (ROAM.y0 + ROAM.y1) / 2, rx = (ROAM.x1 - ROAM.x0) / 2, ry = (ROAM.y1 - ROAM.y0) / 2;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // With reduced motion on, every star simply rests where it landed.
  const roamers = still ? [] : [...root.querySelectorAll("[data-roam]")].map((g) => {
    const x = +g.dataset.x, y = +g.dataset.y, lap = +g.dataset.lap * 1000, T0 = (+g.dataset.born / lap) * Math.PI * 2;
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    return { g, x, y, lap, a: Math.asin(clamp((x - cx) / rx)) - 3 * T0, b: Math.asin(clamp((y - cy) / ry)) - 2 * T0 };
  });
  const els = [...root.querySelectorAll("[data-spin]")].map((g) => {
    const look = +g.dataset.spin;
    g.innerHTML = FEAT[look].map(([, , , l]) => `<ellipse fill="${l ? "#fff" : "#000"}"/>`).join("");
    return { look, r: +g.dataset.r, turn: +g.dataset.turn, kids: [...g.children] };
  });
  const frame = (ms) => {
    const T = Date.now();
    for (const { g, x, y, lap, a, b } of roamers) {
      const u = (T / lap) * Math.PI * 2;
      g.setAttribute("transform", `translate(${f2(cx + rx * Math.sin(3 * u + a) - x)},${f2(cy + ry * Math.sin(2 * u + b) - y)})`);
    }
    for (const { look, r, turn, kids } of els) {
      const t = (ms / 1000) * Math.PI * 2 / turn;
      FEAT[look].forEach(([lon, lat, s, l, e = 1], n) => {
        const a = lon + t, z = Math.cos(a), el = kids[n];
        if (z <= 0) { el.setAttribute("opacity", 0); return; }
        el.setAttribute("cx", f2(r * Math.cos(lat) * Math.sin(a)));
        el.setAttribute("cy", f2(r * Math.sin(lat)));
        el.setAttribute("rx", f2(s * r * e * z));
        el.setAttribute("ry", f2(s * r));
        el.setAttribute("opacity", ((l ? .2 : .16) * Math.min(1, z * 3)).toFixed(3));
      });
    }
    if (!still) spinning = requestAnimationFrame(frame);
  };
  spinning = requestAnimationFrame(frame);
}

const ellipse = (o) => `M${CX - o.rx},${CY} a${o.rx},${o.ry} 0 1,0 ${2 * o.rx},0 a${o.rx},${o.ry} 0 1,0 ${-2 * o.rx},0`;

// Where a new star should sit: anywhere in the open sky, away from the orbits and the text at the top and bottom.
export function placeStar(existing = []) {
  for (let tries = 0; tries < 40; tries++) {
    const x = 0.06 + Math.random() * 0.88, y = 0.2 + Math.random() * 0.4;
    const nearOrbits = Math.abs(y * H - CY) < 54 && Math.abs(x * W - CX) < 140;
    const crowded = existing.some((s) => Math.hypot((s.x - x) * W, (s.y - y) * H) < 14);
    if (!nearOrbits && !crowded) return { x, y };
  }
  return { x: Math.random(), y: 0.2 + Math.random() * 0.4 };
}

// Each star takes a long, slow lap of the whole open sky (between the greeting and the dock): it swings
// side to side three times and up and down twice per lap, so over one lap it passes through all of it.
// The lap is timed from the wall clock and starts exactly where the star first landed, so a star never jumps.
const ROAM = { x0: 18, x1: 282, y0: 105, y1: 440 };
const roamAttrs = (t) => {
  let h = 0; for (const c of String(t.id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `data-roam data-x="${f2(t.x * W)}" data-y="${f2(t.y * H)}" data-born="${t.createdAt - (now() - Date.now())}" data-lap="${360 + h % 240}"`;
};

// A star for a thought. `arriving` marks one just caught: it lifts out of the gold button it was added with
// (`from`, in sky units) and drifts down into place.
function star(t, i, arriving, from) {
  const r = 1.4 + Math.min(t.count - 1, 4) * 0.7, big = t.count > 1, x = t.x * W, y = t.y * H;
  const R = big ? r * 1.35 + .6 : r * .9 + .9;
  const kind = t.kind === "worry" ? "A worry" : t.kind === "want" ? "A want" : "A kind thought";
  const times = t.count > 1 ? `, came up ${t.count} times` : "";
  const body = `<g class="tw" style="--d:${(7 + (i * 1.7) % 6).toFixed(1)}s;--dd:${(18 + (i * 3.1) % 12).toFixed(1)}s;animation-delay:-${(i * 1.3) % 9}s,-${(i * 2.7) % 20}s">
    <circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(R * 1.3)}" fill="${GLOW[t.kind]}" opacity="${big ? .26 : .12}" filter="url(#soft)"/>
    <path transform="translate(${f2(x)},${f2(y)})" d="${sparkle(POINTS[t.kind], R)}" fill="${TINT[t.kind]}"/></g>
    <circle class="hit" data-star="${t.id}" role="button" tabindex="0" aria-label="${kind}: “${esc(t.text)}”${times}" cx="${f2(x)}" cy="${f2(y)}" r="17" fill="transparent"/>`;
  const roam = `<g ${roamAttrs(t)}>${body}</g>`;
  if (t.id !== arriving) return roam;
  const o = from || { x: CX, y: H * 0.9 };
  const ring = `<circle class="burst" cx="${f2(x)}" cy="${f2(y)}" r="${f2(R * 3)}" fill="none" stroke="${TINT[t.kind]}" stroke-width=".8"/>`;
  return `<g class="arrive" style="--dx:${f2(o.x - x)}px;--dy:${f2(o.y - y)}px">${roam}</g>${ring}`;
}

export function renderSky({ pillars, thoughts, runningId, arriving, from, labels }) {
  const n = pillars.length;
  const orbits = pillars.map((p, i) => orbit(i, n));
  const defs = `<defs>
    <filter id="soft" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.4"/></filter>
    <filter id="wide" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="16"/></filter></defs>`;
  // The night itself (gradient, soft cloud and film grain) is a ready-made picture: drawing it live was slow on phones.
  // img/sky.jpg is rendered from the original drawing; see README for how to remake it.
  const base = `<image href="img/sky.jpg" width="${W}" height="${H}" preserveAspectRatio="none"/>`;
  const rings = orbits.map((o) => `<path d="${ellipse(o)}" fill="none" stroke="${INK}" stroke-opacity=".07" stroke-width=".8"/>`).join("");
  const stars = thoughts.filter((t) => t.status === "active").map((t, i) => star(t, i, arriving, from)).join("");
  const sun = `<circle cx="${CX}" cy="${CY}" r="34" fill="${SUN}" opacity=".22" filter="url(#wide)"/><circle cx="${CX}" cy="${CY}" r="7" fill="${SUN}" opacity=".6" filter="url(#soft)"/><circle cx="${CX}" cy="${CY}" r="4" fill="#fff8f0"/>`;
  // Orbits are timed from the wall clock, so redrawing the sky never makes a planet jump.
  // With reduced motion on, planets rest at a fixed point on their orbit and the timer glow holds still.
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Name tags ride the same orbits in a layer of their own, so a passing planet never covers a name.
  const at = (o) => still ? ` transform="translate(${f2(CX - o.rx * Math.cos(o.offset * Math.PI * 2))},${f2(CY + o.ry * Math.sin(o.offset * Math.PI * 2))})"` : "";
  const move = (o) => still ? "" : `<animateMotion dur="${o.period}s" begin="-${f2((Date.now() / 1000 + o.period * o.offset) % o.period)}s" repeatCount="indefinite" path="${ellipse(o)}"/>`;
  const planets = pillars.map((p, i) => {
    const o = orbits[i], run = p.id === runningId;
    const pulse = still ? "" : `<animate attributeName="opacity" values=".15;.4;.15" dur="3s" repeatCount="indefinite"/>`;
    const glow = run ? `<circle r="${f2(o.size * 3.4)}" fill="${p.tint}" opacity=".3" filter="url(#soft)">${pulse}</circle>` : "";
    return `<g${at(o)}>${glow}${planet("sky", i, o.size, p.tint)}${move(o)}</g>`;
  }).join("");
  const tags = pillars.map((p, i) => {
    const o = orbits[i];
    const hit = `<rect class="hit" data-planet="${p.id}" role="button" tabindex="0" aria-label="${esc(p.name)}: ideas and add time" x="-30" y="-22" width="60" height="${f2(o.size + 44)}" rx="12" fill="transparent"/>`;
    return `<g${at(o)}><rect class="tag" fill="#000" fill-opacity=".3"/><text class="tagt" data-fs="13" data-top="${f2(o.size + 3.5)}" x="0" y="${f2(o.size + 16.5)}" text-anchor="middle" font-size="13" font-weight="500" fill="${INK}">${esc(p.name)}</text>${hit}${move(o)}</g>`;
  }).join("");
  // Test-mode only for now: each star's words on a small tag beneath it, like a planet's name but quieter.
  const words = labels ? thoughts.filter((t) => t.status === "active").map((t, i) => {
    const short = t.text.length > 20 ? t.text.slice(0, 19).trimEnd() + "…" : t.text;
    return `<g class="ttag" ${roamAttrs(t)}><rect class="tag" fill="#000" fill-opacity=".3"/><text class="tagt" data-fs="11" data-top="${f2(t.y * H + 5)}" x="${f2(t.x * W)}" y="${f2(t.y * H + 15)}" text-anchor="middle" font-size="11" font-weight="500" fill="${INK}" fill-opacity=".8">“${esc(short)}”</text></g>`;
  }).join("") : "";
  return `<svg class="sky" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="group" aria-label="${skyLabel(pillars, thoughts)}">${defs}${base}${rings}${stars}${words}${sun}${planets}${tags}</svg>`;
}

// Size each name tag to its word once it is on screen: 2.5px either side, a hair above and below.
// The sky is stretched to fill the screen, so tag text is shrunk back to keep its true size on screen.
export function fitTags(root) {
  const k = root.querySelector("svg.sky")?.getScreenCTM()?.a || 1;
  root.querySelectorAll("text.tagt").forEach((t) => {
    const fs = +t.dataset.fs / k;
    t.setAttribute("font-size", f2(fs)); t.setAttribute("y", f2(+t.dataset.top + fs));
    // A thought's tag never runs off the side of the screen.
    if (t.parentNode.classList.contains("ttag")) {
      const b = t.getBBox(), shift = Math.max(8 - b.x, 0) - Math.max(b.x + b.width - (W - 8), 0);
      if (shift) t.setAttribute("x", f2(+t.getAttribute("x") + shift));
    }
    const b = t.getBBox(), r = t.previousElementSibling, pad = 2.5 / k;
    r.setAttribute("x", b.x - pad); r.setAttribute("y", b.y - .5 / k);
    r.setAttribute("width", b.width + pad * 2); r.setAttribute("height", b.height + 1 / k);
  });
}

function skyLabel(pillars, thoughts) {
  const active = thoughts.filter((t) => t.status === "active").length;
  return `Your sky: ${pillars.map((p) => p.name).join(", ")} orbiting you. ${active ? `${active} thought${active === 1 ? "" : "s"} on your mind.` : "No thoughts on your mind right now."}`;
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
