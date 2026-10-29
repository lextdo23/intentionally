// The week in full, and Record. Both read the same numbers; every block leads with one plain sentence,
// then one simple picture, and every bar carries its number so nothing needs a key.
import * as store from "./store.js";
import { esc, shade, sparkle, POINTS } from "./sky.js";
import { stats, long, times, range, feelings, noticed, count } from "./week.js";

const starIcon = (kind, size = 12) => `<svg class="kstar k-${kind}" viewBox="-12 -12 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${sparkle(POINTS[kind], 10)}"/></svg>`;
const dot = (c) => `<i class="pdot" style="background:${c}"></i>`;
const FEEL = ["Light", "Okay", "Heavy", "Very heavy"];

// What helped with thoughts on each planet during the week (heavy thoughts are never quoted, so never listed).
function helpedIn(s, from, to) {
  const by = {};
  for (const t of s.thoughts) for (const h of t.helped ?? []) {
    if (!h.text || h.at < from || h.at >= to + 1) continue;
    const m = (by[t.pillarId] ??= {});
    m[h.text] = (m[h.text] ?? 0) + 1;
  }
  return by;
}

export function overview(s, st) {
  const max = Math.max(1, ...st.rows.map((r) => r.ms));
  const kinds = { worry: 0, want: 0, kind: 0 };
  for (const t of st.touched) kinds[t.kind]++;
  return `<div class="wv-bars">${st.rows.map((r) => `<div class="wv-bar"><p>${dot(shade(r.p))}${esc(r.p.name)}<span>${r.ms ? `${long(r.ms)} · ${times(r.n)}` : "Not this week"}</span></p>
      <u><s style="width:${(r.ms / max) * 100}%;background:${shade(r.p)}"></s></u></div>`).join("")}</div>
    <div class="wv-hr"></div><div class="wv-kinds">${["worry", "want", "kind"].map((k) => `<span>${starIcon(k)} ${kinds[k]} ${k === "worry" ? (kinds[k] === 1 ? "worry" : "worries") : k === "want" ? (kinds[k] === 1 ? "want" : "wants") : "kind"}</span>`).join("")}</div>`;
}

// In depth, by planet: what was on your mind, the time you gave it, your intention, and what helped all sit together.
export function inDepth(s, st, intention) {
  const helped = helpedIn(s, st.from, st.to);
  const N = Math.max(1, ...st.rows.map((r) => r.thoughts.length)), T = Math.max(1, ...st.rows.map((r) => r.ms));
  const byTime = [...st.rows].sort((a, b) => b.ms - a.ms), byMind = [...st.rows].sort((a, b) => b.thoughts.length - a.thoughts.length);
  const glance = [];
  const mind = byMind[0], least = byTime.at(-1);
  if (mind?.thoughts.length >= 2 && mind !== byTime[0]) glance.push([shade(mind.p), `${mind.p.name} was on your mind most${mind === least || !mind.ms ? ", but got the least time" : ""}.`]);
  if (byTime[0]?.ms) glance.push([shade(byTime[0].p), `${byTime[0].p.name} got most of your time.`]);
  const settled = st.touched.filter((t) => t.status !== "active").length;
  if (st.touched.length && settled) glance.push(["rgba(239,237,233,.6)", `You set down ${count(settled)} of your ${count(st.touched.length)} thoughts.`]);
  const order = [...st.rows].sort((a, b) => (b.p.focus - a.p.focus) || (b.thoughts.length + b.ms / 6e5) - (a.thoughts.length + a.ms / 6e5));
  const card = (r) => {
    const still = r.thoughts.filter((t) => t.status === "active" && !t.heavy && (t.count > 1 || t.kind === "want")).slice(0, 2);
    const help = Object.entries(helped[r.p.id] ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const mine = intention?.pillarId === r.p.id ? intention : null;
    const part = (h, rows) => rows.length ? `<p class="wv-sub">${h}</p>${rows.join("")}` : "";
    return `<div class="wv-pc"><div class="wv-pch">${dot(shade(r.p))}<b>${esc(r.p.name)}</b>${r.p.focus ? '<span class="wv-tag">Focus</span>' : ""}</div>
      <div class="wv-m"><span>Thoughts</span><div class="wv-tr"><u style="width:${(r.thoughts.length / N) * 100}%;background:rgba(239,237,233,.6)"></u></div><em>${r.thoughts.length}</em></div>
      <div class="wv-m"><span>Time</span><div class="wv-tr"><u style="width:${(r.ms / T) * 100}%;background:${shade(r.p)}"></u></div><em>${r.ms ? long(r.ms) : "none"}</em></div>
      ${part("Still on your mind", still.map((t) => `<div class="wv-row">“${esc(t.text)}”<span>${t.kind === "want" ? "a want" : times(t.count)}</span></div>`))}
      ${part("Your intention", mine ? [`<div class="wv-row">${esc(mine.text)}<span>${mine.did?.length ? `did it ${times(mine.did.length)}` : "not this time"}</span></div>`] : [])}
      ${part("What helped", help.map(([h, n]) => `<div class="wv-row">${esc(h)}<span>${times(n)}</span></div>`))}</div>`;
  };
  return `${glance.length ? `<div class="wv-blk"><h4>At a glance</h4>${glance.map(([c, l]) => `<p class="wv-say gl">${dot(c)}${esc(l)}</p>`).join("")}</div>` : ""}
    ${order.map(card).join("")}${weeksChart(s)}`;
}

// How the weeks have felt, with the pattern it talks about drawn underneath, once there's enough to show.
function weeksChart(s) {
  const f = feelings(s);
  if (f.length < 2) return "";
  const pat = noticed(s), n = f.length;
  const x = (i) => 92 + i * (200 / Math.max(1, n - 1)), y = (v) => 8 + v * 22, H = pat ? 150 : 84;
  const svg = `<svg class="wv-feel" viewBox="0 0 300 ${H}" role="img" aria-label="How each week felt${pat ? `, with ${esc(pat.label.toLowerCase())} each week underneath` : ""}">
    ${FEEL.map((w, v) => `<line x1="80" x2="296" y1="${y(v)}" y2="${y(v)}"/><text x="0" y="${y(v) + 4}">${w}</text>`).join("")}
    <polyline points="${f.map((w, i) => `${x(i)},${y(w.feel)}`).join(" ")}"/>
    ${f.map((w, i) => `<circle cx="${x(i)}" cy="${y(w.feel)}" r="${i === n - 1 ? 5 : 4}" class="${i === n - 1 ? "now" : ""}"/>`).join("")}
    ${pat ? `<text x="0" y="128">${esc(pat.label.length > 14 ? pat.label.slice(0, 13) + "…" : pat.label)}</text>
      ${pat.series.slice(-n).map((c, i) => `<rect x="${x(i) - 6}" y="${140 - c * 10 - 2}" width="12" height="${c * 10 + 2}" rx="3" class="se"/><text x="${x(i)}" y="${140 - c * 10 - 6}" text-anchor="middle" class="sn">${c}</text>`).join("")}
      <line x1="80" x2="296" y1="140" y2="140"/>` : ""}</svg>`;
  const light = f.at(-1).feel < f[0].feel ? "Lighter than when you started." : f.at(-1).feel > f[0].feel ? "Heavier lately. Go gently." : "About the same lately.";
  return `<div class="wv-blk"><h4>How the weeks have felt</h4><p class="wv-say">${pat ? esc(pat.text) : light}</p>${svg}
    <div class="wv-fl"><span>${n} weeks ago</span><span>This week</span></div></div>`;
}

export function weekHTML(s, from, to, intention, view = "over") {
  const st = stats(s, from, to);
  return `<header class="sh-head"><div><h2 id="sheet-title">Your week in full</h2><p>${range(from, to)}</p></div>
      <button type="button" class="x" data-close aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
    <div class="wv-seg" role="tablist"><button type="button" role="tab" data-v="over" aria-selected="${view === "over"}">Overview</button><button type="button" role="tab" data-v="deep" aria-selected="${view === "deep"}">In depth</button></div>
    <div class="wv">${view === "over" ? overview(s, st) : inDepth(s, st, intention)}</div>`;
}

// Record: what helps you (your own proof), then each week's page. Let-go thoughts leave a faint, wordless trace.
export function recordHTML(s) {
  const all = {};
  for (const t of s.thoughts) for (const h of t.helped ?? []) if (h.text && !t.heavy) {
    const k = h.text; (all[k] ??= { n: 0, pid: t.pillarId }).n++;
  }
  const helps = Object.entries(all).sort((a, b) => b[1].n - a[1].n).slice(0, 6);
  const pill = (id) => s.pillars.find((p) => p.id === id);
  const weeks = [...s.weeks].reverse();
  const page = (w, i) => {
    const notes = w.notes ?? [], kept = notes.filter((n) => n.outcome === "settled" || n.outcome === "kept").map((n) => s.thoughts.find((t) => t.id === n.id)).filter((t) => t && !t.heavy);
    const gone = notes.filter((n) => n.outcome === "let-go").length;
    return `<article class="rc-wk"><p class="rc-when">${range(w.from, w.to)}${w.feel != null ? ` · ${FEEL[w.feel].toLowerCase()}` : ""}</p>
      ${w.wrote ? `<p class="rc-wrote">${esc(w.wrote)}</p>` : ""}
      ${w.intention ? `<p class="rc-int"><b>Your one small thing</b>${esc(w.intention.text)}${w.intention.did?.length ? ` · did it ${times(w.intention.did.length)}` : ""}</p>` : ""}
      ${kept.map((t) => `<div class="rc-th">${starIcon(t.kind)}<span>“${esc(t.text)}”${t.helped?.filter((h) => h.text).length ? `<small>${t.helped.filter((h) => h.text).map((h) => esc(h.text)).join(", ")}</small>` : ""}</span></div>`).join("")}
      ${gone ? `<p class="rc-gone" aria-label="${gone} let go">${"<i></i>".repeat(Math.min(gone, 12))}</p>` : ""}
      <button type="button" class="link" data-week="${s.weeks.length - 1 - i}">See the week in full</button></article>`;
  };
  return `<header class="sh-head"><div><h2 id="sheet-title">Record</h2><p>Your weeks, and what helps you</p></div>
      <button type="button" class="x" data-close aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
    ${helps.length ? `<div class="wv-blk"><h4>What helps you</h4>${helps.map(([h, o]) => `<div class="wv-row">${pill(o.pid) ? dot(shade(pill(o.pid))) : ""}${esc(h)}<span>${times(o.n)}</span></div>`).join("")}</div>` : ""}
    ${weeks.length ? weeks.map(page).join("") : `<p class="rc-empty">Your first look back will start this page.</p>`}
    <button type="button" class="link" data-support>Need support?</button>`;
}
