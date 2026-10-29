// The sky: a charcoal night with a warm sun (you) glowing at the centre, a still planet per pillar set evenly
// around it, and one star per thought you've caught. There are no decorative stars: an empty sky means a clear head.
import { now } from "./clock.js";

// The sky is drawn on a 300-wide canvas (the size the designs were made at) and stretched to fill the screen.
const W = 300, H = 650, CX = W / 2, CY = H * 0.46;
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

// `lit` is the direction the sun is in, so the lit side faces it and the shadow falls on the far side.
export function planet(id, i, r, c, lit = { x: -.78, y: -.62 }) {
  const k = `${id}p${i}`, look = i % FEAT.length;
  const bands = look === 1
    ? [[-.62, .2, 1], [-.22, .14, 0], [.12, .22, 1], [.5, .14, 0]].map(([y, h, l]) => `<rect x="${-r}" y="${f2(y * r)}" width="${2 * r}" height="${f2(h * r)}" fill="${l ? "#fff" : "#000"}" opacity="${l ? .1 : .12}"/>`).join("")
    : look === 2 ? `<rect x="${-r}" y="${f2(-.14 * r)}" width="${2 * r}" height="${f2(.28 * r)}" fill="#fff" opacity=".1"/>` : "";
  // The sun's direction, turned into the planet's tilted frame, so each crater and bump is lit on the right side.
  const L = Math.hypot(lit.x, lit.y) || 1, t = -TILT[i] * Math.PI / 180, lx = lit.x / L, ly = lit.y / L;
  const sun = `data-sx="${f2(lx * Math.cos(t) - ly * Math.sin(t))}" data-sy="${f2(lx * Math.sin(t) + ly * Math.cos(t))}"`;
  return `<g class="wob" style="--wd:${TURN[i] / 2}s"><defs><clipPath id="${k}c"><circle r="${r}"/></clipPath>
    <mask id="${k}m"><rect x="${-2 * r}" y="${-2 * r}" width="${4 * r}" height="${4 * r}" fill="#fff"/><circle cx="${f2(lit.x * .38 * r)}" cy="${f2(lit.y * .38 * r)}" r="${f2(r * 1.04)}" fill="#000"/></mask></defs>
    <g clip-path="url(#${k}c)"><circle r="${r}" fill="${c}"/><g transform="rotate(${TILT[i]})">${bands}<g data-spin="${look}" data-seed="${i}" data-turn="${TURN[i]}" data-r="${r}" ${sun}></g></g>
    <circle r="${r}" fill="#000" opacity=".3" mask="url(#${k}m)"/></g></g>`;
}

// Where each planet rests, as offsets from the sun. The two focus pillars take the places either side of you;
// the rest sit above and below, so the whole system is balanced (a line, a diamond or a gentle crown).
const SLOTS = {
  3: [[-100, 0], [100, 0], [0, 64]],
  4: [[-104, 0], [104, 0], [0, -66], [0, 66]],
  5: [[-108, 6], [108, 6], [-56, -58], [56, -58], [0, 70]],
};
// One quiet family of colours: focus pillars keep their tint, the others keep only a hint of it.
const mix = (a, b, t) => "#" + [1, 3, 5].map((n) => Math.round(parseInt(a.substr(n, 2), 16) * (1 - t) + parseInt(b.substr(n, 2), 16) * t).toString(16).padStart(2, "0")).join("");
export const shade = (p) => p.focus ? p.tint : mix(p.tint, "#a8a29d", .7);
export function layout(pillars) {
  const n = pillars.length, slots = SLOTS[Math.min(5, Math.max(3, n))] ?? SLOTS[4];
  const order = [...pillars.filter((p) => p.focus), ...pillars.filter((p) => !p.focus)];
  const at = {};
  order.forEach((p, k) => {
    const [dx, dy] = slots[k] ?? [0, 0], d = Math.hypot(dx, dy) || 1;
    at[p.id] = { x: CX + dx, y: CY + dy, r: p.focus ? 14 : 10, lit: { x: -dx / d, y: -dy / d } };
  });
  return at;
}
// Thoughts never pass behind the sun or a planet: close to one, space bends outward like a lens,
// so a star glides round the edge and carries on. Set each time the sky is drawn.
let bodies = [];

// Texture: small craters and bumps scattered over each planet, drawn flat like the other marks.
// A crater is a dip (shadow on the wall nearest the sun, light on the far wall); a bump is a mound (lit top, shadow behind).
function spots(seed) {
  let n = seed * 7919 + 17;
  const r = () => (n = (n * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 22 }, () => ({ lon: r() * Math.PI * 2, lat: Math.asin(r() * 2 - 1) * .85, s: .07 + r() * r() * .13, bump: r() < .5 }));
}
// Each part of a spot: [fill, opacity, size, how far it shifts towards (+) or away from (-) the sun].
const CRATER = [["#000", .13, 1, 0], ["#fff", .12, .8, -1], ["#000", .14, .72, .45]];
const BUMP = [["#000", .2, 1, -1], ["#fff", .2, .78, .35]];

let spinning = 0;
export function startSpin(root) {
  cancelAnimationFrame(spinning);
  const cx = (ROAM.x0 + ROAM.x1) / 2, cy = (ROAM.y0 + ROAM.y1) / 2, rx = (ROAM.x1 - ROAM.x0) / 2, ry = (ROAM.y1 - ROAM.y0) / 2;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const roamers = [...root.querySelectorAll("[data-roam]")].map((g) => {
    const x = +g.dataset.x, y = +g.dataset.y, born = +g.dataset.born, lap = +g.dataset.lap * 1000, T0 = (born / lap) * Math.PI * 2;
    const home = g.dataset.home && g.dataset.home.split(",").map(Number);
    return { g, x, y, born, lap, home, since: +g.dataset.since || 0, gone: g.dataset.gone ? +g.dataset.gone : null, a: Math.asin(clamp((x - cx) / rx)) - 3 * T0, b: Math.asin(clamp((y - cy) / ry)) - 2 * T0 };
  });
  const ease = (t) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  // Where a star is at time T: on its lap of the open sky, or, once sorted, drifting round its pillar's planet.
  // With reduced motion on, the clock stands still, so a star rests where it landed (or beside its planet).
  const place = ({ x, y, born, lap, home, since, a, b }, T) => {
    const u = (T / lap) * Math.PI * 2;
    let px = cx + rx * Math.sin(3 * u + a), py = cy + ry * Math.sin(2 * u + b);
    if (home) {
      const [hx, hy, R, per, ph] = home, v = (T / 1000 / per) * Math.PI * 2 + ph, w = still ? 1 : ease(clamp((T - since) / 2600));
      px += (hx + Math.cos(v) * R - px) * w; py += (hy + Math.sin(v) * R * .55 - py) * w;
    }
    for (const o of bodies) {
      const dx = px - o.x, dy = py - o.y, d = Math.hypot(dx, dy) || .01, K = o.r + 9, F = K * 1.6;
      if (d < F) { const d2 = K + d * (F - K) / F; px = o.x + dx / d * d2; py = o.y + dy / d * d2; }
    }
    return [px - x, py - y];
  };
  const els = [...root.querySelectorAll("[data-spin]")].map((g) => {
    const look = +g.dataset.spin;
    const tex = spots(+g.dataset.seed);
    g.innerHTML = FEAT[look].map(([, , , l]) => `<ellipse fill="${l ? "#fff" : "#000"}"/>`).join("")
      + tex.map((p) => (p.bump ? BUMP : CRATER).map(([c]) => `<ellipse fill="${c}"/>`).join("")).join("");
    return { look, tex, r: +g.dataset.r, turn: +g.dataset.turn, sx: +g.dataset.sx, sy: +g.dataset.sy, kids: [...g.children] };
  });
  // Ring letters keep the true 13px name size on screen, however much the sky is stretched.
  const k = root.querySelector("svg.sky")?.getScreenCTM()?.a || 1, fs = 13 / k;
  const rings = [...root.querySelectorAll(".ring")].map((g) => {
    const txt = (g.dataset.name + "  ·  ").repeat(2), pr = +g.dataset.pr;
    const R = Math.max(pr * 1.75, (txt.length * fs * .56) / (Math.PI * 2)) + 2;
    g.innerHTML = [...txt].map((ch) => `<text font-size="${f2(fs)}" font-weight="500" fill="${INK}" text-anchor="middle">${ch === " " ? "&#160;" : esc(ch)}</text>`).join("");
    // Start with the first copy of the name centred on the near side.
    const step = Math.PI * 2 / txt.length;
    return { kids: [...g.children], near: g.dataset.layer === "front", x: +g.dataset.x, y: +g.dataset.y + fs * .35, R, step, th: Math.PI / 2 + (g.dataset.name.length - 1) / 2 * step, k: +g.dataset.k };
  });
  const placeRing = ({ kids, near, x, y, R, step, th, k }, T) => {
    const th0 = th + (still ? 0 : -(T / 20000) * Math.PI * 2 + k * 1.3);
    kids.forEach((el, i) => {
      const a = th0 - i * step, sn = Math.sin(a);
      if ((sn > 0) !== near) { el.setAttribute("opacity", 0); return; }
      el.setAttribute("transform", `translate(${f2(x + R * Math.cos(a))},${f2(y + R * .3 * sn)}) scale(${f2(Math.max(.08, Math.abs(sn)) * (near ? 1 : -1))},1)`);
      el.setAttribute("opacity", f2(near ? Math.min(1, sn * 2.2) * .92 : Math.min(1, -sn * 2) * .22));
    });
  };
  // The sun breathes: in over about four seconds, out over about five.
  const glow = root.querySelector('[data-breath="glow"]'), disc = root.querySelector('[data-breath="disc"]');
  const breathe = (T) => {
    const ph = (T / 9000) % 1, b = ph < .45 ? .5 - .5 * Math.cos(Math.PI * ph / .45) : .5 + .5 * Math.cos(Math.PI * (ph - .45) / .55);
    glow?.setAttribute("r", f2(114 + b * 14)); glow?.setAttribute("opacity", f2(.82 + b * .18)); disc?.setAttribute("r", f2(15.4 + b * 1.6));
  };
  const frame = (ms) => {
    const T = Date.now();
    for (const g of rings) placeRing(g, T);
    if (!still) breathe(T);
    for (const r of roamers) {
      const [dx, dy] = place(r, still ? r.born : Date.now());
      // A thought let go sinks softly and fades away.
      const g = r.gone === null ? 0 : still ? 1 : clamp((T - r.gone) / 2600);
      r.g.setAttribute("transform", `translate(${f2(dx)},${f2(dy + (g > 0 ? ease(g) * 60 : 0))})`);
      if (r.gone !== null) r.g.setAttribute("opacity", f2(Math.max(0, 1 - g)));
    }
    for (const { look, tex, r, turn, sx, sy, kids } of els) {
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
      let k = FEAT[look].length;
      for (const p of tex) {
        const parts = p.bump ? BUMP : CRATER, a = p.lon + t, z = Math.cos(a);
        if (z <= 0) { for (let q = 0; q < parts.length; q++) kids[k++].setAttribute("opacity", 0); continue; }
        const x = r * Math.cos(p.lat) * Math.sin(a), y = r * Math.sin(p.lat), rx = p.s * r * z, ry = p.s * r, d = p.s * r * .4, fade = Math.min(1, z * 3);
        for (const [, op, size, shift] of parts) {
          const el = kids[k++];
          el.setAttribute("cx", f2(x + sx * d * shift * z)); el.setAttribute("cy", f2(y + sy * d * shift));
          el.setAttribute("rx", f2(rx * size)); el.setAttribute("ry", f2(ry * size));
          el.setAttribute("opacity", (op * fade).toFixed(3));
        }
      }
    }
    if (!still) spinning = requestAnimationFrame(frame);
  };
  spinning = requestAnimationFrame(frame);
}

// Where a new star should sit: anywhere in the open sky, away from the planets and the text at the top and bottom.
export function placeStar(existing = []) {
  for (let tries = 0; tries < 40; tries++) {
    const x = 0.06 + Math.random() * 0.88, y = 0.22 + Math.random() * 0.44;
    const nearOrbits = Math.abs(y * H - CY) < 84 && Math.abs(x * W - CX) < 130;
    const crowded = existing.some((s) => Math.hypot((s.x - x) * W, (s.y - y) * H) < 14);
    if (!nearOrbits && !crowded) return { x, y };
  }
  return { x: Math.random(), y: 0.2 + Math.random() * 0.4 };
}

// Each star takes a long, slow lap of the whole open sky (between the greeting and the dock): it swings
// side to side three times and up and down twice per lap, so over one lap it passes through all of it.
// The lap is timed from the wall clock and starts exactly where the star first landed, so a star never jumps.
const ROAM = { x0: 18, x1: 282, y0: 130, y1: 450 };
// A sorted thought leaves its lap and settles into a slow loop round its pillar's planet.
let homes = {};
const roamAttrs = (t) => {
  let h = 0; for (const c of String(t.id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const real = now() - Date.now(), p = t.pillarId && homes[t.pillarId];
  const home = p ? ` data-home="${f2(p.x)},${f2(p.y)},${f2(p.r + 14 + h % 12)},${50 + h % 30},${f2((h % 628) / 100)}" data-since="${(t.sortedAt ?? 0) - real}"` : "";
  const gone = t.status === "let-go" ? ` data-gone="${t.letGoAt - real}"` : "";
  return `data-roam data-x="${f2(t.x * W)}" data-y="${f2(t.y * H)}" data-born="${t.createdAt - real}" data-lap="${360 + h % 240}"${home}${gone}`;
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
  // The ring rides the star's lap too, so it opens exactly where the star touches down.
  return `<g class="arrive" style="--dx:${f2(o.x - x)}px;--dy:${f2(o.y - y)}px">${roam}</g><g ${roamAttrs(t)}>${ring}</g>`;
}

export function renderSky({ pillars, thoughts, runningId, arriving, from, labels }) {
  const at = layout(pillars);
  // A thought that's just about you circles the sun.
  homes = { ...at, me: { x: CX, y: CY, r: 22 } };
  bodies = [{ x: CX, y: CY, r: 16 }, ...Object.values(at)];
  const defs = `<defs>
    <filter id="soft" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.4"/></filter>
    <radialGradient id="sunglow"><stop offset="0" stop-color="#f6cf9f" stop-opacity=".55"/><stop offset=".35" stop-color="${SUN}" stop-opacity=".18"/><stop offset="1" stop-color="${SUN}" stop-opacity="0"/></radialGradient></defs>`;
  // The night itself (gradient, soft cloud and film grain) is a ready-made picture: drawing it live was slow on phones.
  // img/sky.jpg is rendered from the original drawing; see README for how to remake it.
  const base = `<image href="img/sky.jpg" width="${W}" height="${H}" preserveAspectRatio="none"/>`;
  // A thought let go a moment ago stays just long enough to sink away.
  const stars = thoughts.filter((t) => t.status === "active" || (t.status === "let-go" && now() - t.letGoAt < 3500))
    .map((t, i) => star(t, i, arriving, from)).join("");
  // You are the one bright thing in the sky: a wide warm glow with the sun at its heart.
  const sun = `<circle data-breath="glow" cx="${CX}" cy="${CY}" r="120" fill="url(#sunglow)"/><g class="sundisc"><circle data-breath="disc" cx="${CX}" cy="${CY}" r="16" fill="#f7d3a8"/><circle cx="${CX}" cy="${CY}" r="11" fill="#fff4e6"/></g>
    <g data-target="me" transform="translate(${CX},${CY})"><circle class="halo" r="24"/></g>`;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Planets hold still; only their surfaces turn. The running planet glows softly.
  const planets = pillars.map((p, i) => {
    const o = at[p.id], run = p.id === runningId;
    const pulse = still ? "" : `<animate attributeName="opacity" values=".15;.4;.15" dur="3s" repeatCount="indefinite"/>`;
    const glow = run ? `<circle r="${f2(o.r * 3.4)}" fill="${p.tint}" opacity=".3" filter="url(#soft)">${pulse}</circle>` : "";
    return `<g transform="translate(${f2(o.x)},${f2(o.y)})" data-orbit="${p.id}" data-target="${p.id}" data-size="${o.r}"${run ? ' class="focus"' : ""}>${glow}${planet("sky", i, o.r, shade(p), o.lit)}<circle class="halo" r="${o.r + 7}"/></g>`;
  }).join("");
  // Each planet wears its name as a level ring, like Saturn's, turning slowly: read on the near side,
  // passing faintly behind the planet on the far side. The letters are laid out once the sky is on screen.
  const ring = (layer) => `<g class="rings">${pillars.map((p, i) => { const o = at[p.id];
    return `<g class="ring" data-layer="${layer}" data-k="${i}" data-name="${esc(p.name)}" data-x="${f2(o.x)}" data-y="${f2(o.y)}" data-pr="${o.r}"></g>`; }).join("")}</g>`;
  const tags = pillars.map((p) => {
    const o = at[p.id], s = Math.max(44, o.r * 2 + 16);
    const hit = `<rect class="hit" data-planet="${p.id}" role="button" tabindex="0" aria-label="${esc(p.name)}: ideas and add time" x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${s / 2}" fill="transparent"/>`;
    return `<g transform="translate(${f2(o.x)},${f2(o.y)})">${hit}</g>`;
  }).join("") + `<rect class="hit sunhit" data-sun="me" role="button" tabindex="0" aria-label="Just me" x="${CX - 26}" y="${CY - 26}" width="52" height="52" rx="26" fill="transparent"/>`;
  // Test-mode only for now: each star's words on a small tag beneath it, like a planet's name but quieter.
  const words = labels ? thoughts.filter((t) => t.status === "active").map((t, i) => {
    const short = t.text.length > 20 ? t.text.slice(0, 19).trimEnd() + "…" : t.text;
    return `<g class="ttag" ${roamAttrs(t)}><rect class="tag" fill="#000" fill-opacity=".3"/><text class="tagt" data-fs="11" data-top="${f2(t.y * H + 5)}" x="${f2(t.x * W)}" y="${f2(t.y * H + 15)}" text-anchor="middle" font-size="11" font-weight="500" fill="${INK}" fill-opacity=".8">“${esc(short)}”</text></g>`;
  }).join("") : "";
  // Stars are drawn above the sun and planets, so even mid-curve a thought is never hidden.
  return `<svg class="sky" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="group" aria-label="${skyLabel(pillars, thoughts)}">${defs}${base}<g class="world">${sun}${ring("back")}${planets}${ring("front")}<g class="stars">${stars}${words}</g><g class="tags">${tags}</g></g></svg>`;
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
  return `Your sky: ${pillars.map((p) => p.name).join(", ")} around you. ${active ? `${active} thought${active === 1 ? "" : "s"} on your mind.` : "No thoughts on your mind right now."}`;
}

// While sorting: which planet (or the sun, "me") is under a finger, where one sits on screen, and soft rings
// round the one a card is held over and round the star being sorted.
export function targetAt(x, y) {
  const m = document.querySelector("svg.sky")?.getScreenCTM();
  if (!m) return null;
  const q = new DOMPoint(x, y).matrixTransform(m.inverse());
  let best = null, bd = Infinity;
  for (const [id, o] of Object.entries(homes)) {
    const d = Math.hypot(q.x - o.x, q.y - o.y);
    if (d < (id === "me" ? 16 : o.r) + 22 && d < bd) { best = id; bd = d; }
  }
  return best;
}
export function targetPoint(id) {
  const m = document.querySelector("svg.sky")?.getScreenCTM(), o = homes[id];
  return m && o ? new DOMPoint(o.x, o.y).matrixTransform(m) : null;
}
export function markTarget(id) {
  document.querySelectorAll("svg.sky [data-target]").forEach((g) => g.classList.toggle("hot", g.dataset.target === id));
}
export function markStar(id) {
  document.querySelectorAll("svg.sky .now").forEach((g) => { g.classList.remove("now"); g.querySelector(".nowring")?.remove(); });
  const hit = id && document.querySelector(`svg.sky [data-star="${id}"]`);
  if (!hit) return;
  hit.parentNode.classList.add("now");
  hit.insertAdjacentHTML("beforebegin", `<circle class="nowring" cx="${hit.getAttribute("cx")}" cy="${hit.getAttribute("cy")}" r="10" fill="none" stroke="${INK}" stroke-width=".7"/>`);
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Starting a timer glides the sky in towards that planet until it fills the middle of the screen;
// stopping glides back out. The camera keeps its place when the sky is redrawn, so nothing jumps.
const cam = { id: null, k: 0, dir: 0, raf: 0, last: 0 };
const FOCUS = { x: CX, y: H * 0.42 }, PLANET_R = 58, GLIDE = 1400;
const glide = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export function zoomTo(id) { if (id) cam.id = id; cam.dir = id ? 1 : -1; runCamera(); }
export function zoomNow(id) { cam.id = id; cam.k = id ? 1 : 0; cam.dir = 0; runCamera(); }
export const zoomedOn = () => cam.id;
export function runCamera() {
  cancelAnimationFrame(cam.raf);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still && cam.dir) { cam.k = cam.dir > 0 ? 1 : 0; cam.dir = 0; }
  cam.last = performance.now();
  const frame = (ms) => {
    const world = document.querySelector("svg.sky .world");
    if (!world) return;
    cam.k = Math.max(0, Math.min(1, cam.k + cam.dir * (ms - cam.last) / GLIDE)); cam.last = ms;
    if (cam.k === 0 && cam.dir <= 0) { cam.id = null; cam.dir = 0; }
    const g = cam.id && world.querySelector(`[data-orbit="${cam.id}"]`);
    if (!g) { world.removeAttribute("transform"); return; }
    const m = world.getCTM().inverse().multiply(g.getCTM()), e = glide(cam.k), s = 1 + (PLANET_R / +g.dataset.size - 1) * e;
    const fx = m.e + (FOCUS.x - m.e) * e, fy = m.f + (FOCUS.y - m.f) * e;
    world.setAttribute("transform", `translate(${f2(fx - m.e * s)},${f2(fy - m.f * s)}) scale(${s.toFixed(4)})`);
    // Keeps running while zoomed in; stops once fully zoomed out.
    if (cam.id) cam.raf = requestAnimationFrame(frame);
    else world.removeAttribute("transform");
  };
  cam.raf = requestAnimationFrame(frame);
}
