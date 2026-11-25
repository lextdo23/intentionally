// Builds the review page from the checker's results (cards/results/check.json) and the pretend-person check
// (cards/results/people/<Pillar>.json). One page, reused for every run.
//
//   node cards/report.cjs [where to save the page]
//
// The page is for alex to read on the phone: what the checker found, which cards some people didn't connect with and
// why, which mindsets are short of cards, and look-alikes. It is plain HTML with nothing outside it.
const fs = require("fs"), path = require("path");
const out = process.argv[2] || path.join(__dirname, "results", "card-check.html");
const check = JSON.parse(fs.readFileSync(path.join(__dirname, "results", "check.json"), "utf8"));
const people = JSON.parse(fs.readFileSync(path.join(__dirname, "people.json"), "utf8")).people;
const who = Object.fromEntries(people.map((p) => [p.id, p]));
const dir = path.join(__dirname, "results", "people");
const sims = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))) : [];
const byN = Object.fromEntries(check.cards.map((c) => [c.n, c]));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ORDER = ["Friends", "Family", "Love", "Community", "Move", "Rest", "Work and study", "Play and create", "Meaning", "Self"];
const TINT = { Friends: "#d9b3a6", Family: "#d9b3a6", Love: "#d9b3a6", Community: "#d9b3a6", Move: "#a9c4b5", Rest: "#a9b9d6", "Work and study": "#cfc59b", "Play and create": "#c4b4c9", Meaning: "#c4b4c9", Self: "#a9c9cf" };
const short = (p) => `${p.name}, ${p.age}`;
const life = (p) => p.life.split(",")[0];
const forTxt = (c) => (c.for === "Everyone" ? "Everyone" : c.for.join(" · "));
const group = (pillar, mindsets) => { const ids = new Set(); for (const m of mindsets) for (const p of people) if ((p.picked[pillar] || []).includes(m)) ids.add(p.id); return ids.size; };

const cardFace = (c) => `<div class="face"><div class="tag"><i style="background:${TINT[c.pillar] || "#a9a59d"}"></i>${esc(c.pillar)} · ${esc(c.size)}</div>
  <div class="task">${esc(c.card)}</div><div class="why">${esc(c.why)} <span>${esc(c.src)}</span></div>
  <div class="meta">#${c.n} · for ${esc(forTxt(c))}</div></div>`;

// Fit numbers
const places = [["hand", "In the hand of three"], ["kept", "The kept card"], ["home", "Today's card on home"], ["lifts", "What lifts you"]];
const fitRows = places.map(([k, label]) => {
  const r = check.cards.map((c) => c.room && c.room[k]).filter((x) => x != null), bad = r.filter((x) => x < 0).length, ok = r.filter((x) => x >= 0).sort((a, b) => a - b);
  return { k, label, bad, mid: ok.length ? ok[ok.length >> 1] : 0, n: r.length };
});
const tight = check.cards.filter((c) => c.room && ["hand", "kept", "home"].reduce((a, p) => (c.room[p] < c.room[a] ? p : a), "hand") === "hand").length;
const under5 = check.cards.filter((c) => c.room && Math.min(c.room.hand, c.room.kept, c.room.home) < 5).length;

// Pretend people
const splits = sims.flatMap((s) => s.splits.map((x) => ({ ...x, pillar: s.pillar }))).sort((a, b) => ORDER.indexOf(a.pillar) - ORDER.indexOf(b.pillar) || b.missed.length - a.missed.length);
const simHtml = ORDER.map((pl) => {
  const list = splits.filter((s) => s.pillar === pl), cards = check.cards.filter((c) => c.pillar === pl);
  if (!cards.length) return "";
  const body = list.length ? list.map((s) => { const c = byN[s.card]; if (!c) return "";
    const ms = c.for === "Everyone" ? [] : c.for, size = c.for === "Everyone" ? people.filter((p) => p.picked[pl]).length : group(pl, ms);
    return `<article class="split">${cardFace(c)}
      <div class="said"><p class="count"><b>${s.missed.length} of ${size}</b> who'd be dealt it didn't see the point</p>
      <ul class="who">${s.missed.map((id) => `<li><b>${esc(short(who[id]))}</b> ${esc(life(who[id]))}</li>`).join("")}</ul>
      <p>${esc(s.why)}</p><p class="fix"><b>Idea:</b> ${esc(s.fix)}</p></div></article>`; }).join("")
    : `<p class="quiet">Every card made sense to everyone who'd be dealt it.</p>`;
  return `<section class="pillar"><h3><i style="background:${TINT[pl]}"></i>${esc(pl)} <span>${list.length} of ${cards.length} cards split</span></h3>${body}</section>`;
}).join("");

// Counts
const thin = check.counts.filter((m) => !m.ok);
// Look-alikes, each pair once
const seen = new Set(), pairs = [];
for (const c of check.cards) for (const i of c.issues.filter((i) => i.rule === "B4")) { const o = i.msg.match(/^looks like #(\d+)/); if (!o) continue; const k = [c.n, +o[1]].sort((a, b) => a - b).join("-"); if (seen.has(k)) continue; seen.add(k); pairs.push([c, byN[+o[1]]]); }
const words = check.cards.flatMap((c) => c.issues.filter((i) => !["B4", "F1"].includes(i.rule)).map((i) => ({ c, i })));

const html = `<title>Card check</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* Daydeck's own look: plain black, warm ink, marigold for the one thing that matters. Single dark theme on purpose. */
:root { --bg: #0a0a0b; --card: #151517; --line: #2a2a2d; --ink: #efede9; --dim: #a9a59d; --faint: #77746e; --sun: #ffa51f; --good: #7ab57a;
  --ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", sans-serif; color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font: 17px/1.45 var(--ui); }
.wrap { max-width: 720px; margin: 0 auto; padding-block: 24px 64px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 40px; }
h1 { font-size: 34px; line-height: 1.1; margin: 0; letter-spacing: -.01em; }
h2 { font-size: 22px; margin: 0 0 8px; }
h3 { font-size: 20px; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
h3 i, .tag i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
h3 span { font-size: 15px; font-weight: 400; color: var(--dim); }
p { margin: 0; }
.lead { color: var(--dim); font-size: 15px; margin-top: 8px; }
.top { display: grid; gap: 12px; }
.sum { display: grid; gap: 12px; padding: 0; margin: 0; list-style: none; }
.sum li { background: var(--card); border-radius: 16px; padding: 16px; }
.sum b { color: var(--sun); }
section { display: grid; gap: 16px; }
.pillar { gap: 12px; }
.split { display: grid; grid-template-columns: 220px 1fr; gap: 16px; background: var(--card); border-radius: 16px; padding: 16px; }
@media (max-width: 560px) { .split { grid-template-columns: 1fr; } }
.face { border: 1px solid rgba(239, 237, 233, .55); border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 8px; background: #0f0f11; min-width: 0; }
.tag { font-size: 12px; color: var(--dim); display: flex; align-items: center; gap: 6px; }
.task { font-size: 17px; font-weight: 600; line-height: 1.3; }
.why { font-size: 13px; color: #b8b4ad; }
.why span, .meta { color: var(--faint); font-size: 12px; }
.said { display: grid; gap: 8px; align-content: start; font-size: 15px; min-width: 0; }
.count { color: var(--ink); }
.count b { color: var(--sun); }
.who { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; color: var(--dim); }
.who b { color: var(--ink); font-weight: 600; }
.fix { color: var(--dim); }
.fix b { color: var(--ink); }
.quiet { color: var(--dim); font-size: 15px; }
table { border-collapse: collapse; width: 100%; font-size: 15px; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 8px 8px 8px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--dim); font-weight: 500; font-size: 13px; }
td.n { text-align: right; padding-right: 0; }
.bad { color: var(--sun); font-weight: 600; }
.ok { color: var(--good); }
.scroll { overflow-x: auto; }
.pair { background: var(--card); border-radius: 16px; padding: 12px 16px; font-size: 15px; display: grid; gap: 4px; }
.pair span { color: var(--faint); font-size: 13px; }
.note { font-size: 13px; color: var(--faint); }
</style>
<div class="wrap">
<header class="top">
  <h1>Card check</h1>
  <p class="lead">All ${check.cards.length} cards in Daydeck today, checked ${new Date(check.made).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" })}: the rulebook's automatic checks, fit on today's card sizes at iPhone 15 Pro Max size, and ${people.length} pretend people reading every card for the mindsets they picked.</p>
</header>

<ul class="sum">
  <li><b>Fit:</b> every card fits the hand, the kept card and today's card on home. The bigger home card has about ${fitRows[2].mid} letters to spare, but the hand of three is the tightest place for ${tight} of ${check.cards.length} cards, with a middle of ${fitRows[0].mid} spare, so steps can't get much longer unless the hand changes. What lifts you cuts off ${fitRows[3].bad} cards.</li>
  <li><b>Pretend people:</b> ${splits.length} cards made sense to some of the people who picked that mindset but not to others, because of something in their life (shifts, a wheelchair, living at home, no desk, culture). Each one is below with who it missed and an idea.</li>
  <li><b>Not enough cards:</b> ${thin.length} mindsets have fewer than 8 cards of their own or are missing a size (all in Rest and Community, plus one in Self).</li>
  <li><b>Look-alikes:</b> ${pairs.length} pairs of cards are very alike, mostly across pillars. They only both show for someone who picked both pillars.</li>
</ul>

<section>
  <h2>What the pretend people found</h2>
  <p class="lead">Each mindset has 6 or 7 people who picked it, with different lives. They read each card as part of a hand of three, asking only "does this make sense for the pillar and mindset I chose?" (not "could I do it today"). These are Claude playing those people: good at spotting cards that assume something about someone's life, but not a stand-in for real testers.</p>
  ${simHtml}
</section>

<section>
  <h2>Fit on today's card sizes</h2>
  <p class="lead">Measured on the app's own card, as it is today. "Spare" is how many more letters the step could take before it stops fitting.</p>
  <div class="scroll"><table><thead><tr><th>Where</th><th>Too long</th><th>Spare (middle)</th></tr></thead><tbody>
  ${fitRows.map((r) => `<tr><td>${r.label}</td><td class="${r.bad ? "bad" : "ok"}">${r.bad ? r.bad : "None"}</td><td>${r.bad === r.n ? "–" : r.mid + " letters"}</td></tr>`).join("")}
  </tbody></table></div>
  <p class="note">${under5} cards have fewer than 5 letters to spare somewhere, almost always in the hand. What lifts you (Your days) shows 4 lines at 20 points, which is the question still open from the card-fit work: 17 points would fit them all.</p>
</section>

<section>
  <h2>Mindsets short of cards</h2>
  <p class="lead">The rule is at least 8 cards of its own for each mindset, with Tiny, Small and Bigger. Cards for everyone don't count.</p>
  <div class="scroll"><table><thead><tr><th>Mindset</th><th>Own cards</th><th>Missing</th></tr></thead><tbody>
  ${thin.map((m) => `<tr><td>${esc(m.pillar)} · ${esc(m.mindset)}</td><td class="n ${m.own < 8 ? "bad" : ""}">${m.own}</td><td>${m.missingSizes && m.missingSizes.length ? esc(m.missingSizes.join(", ")) : ""}</td></tr>`).join("")}
  </tbody></table></div>
  <p class="note">Community was accepted with fewer cards in its review (19 Nov). Rest was approved before rule B1 was written.</p>
</section>

<section>
  <h2>Look-alikes</h2>
  ${pairs.map(([a, b]) => `<div class="pair"><div>#${a.n} ${esc(a.card)} <span>${esc(a.pillar)}</span></div><div>#${b.n} ${esc(b.card)} <span>${esc(b.pillar)}</span></div></div>`).join("")}
</section>

${words.length ? `<section><h2>Words to look at</h2><div class="scroll"><table><thead><tr><th>Card</th><th>Flag</th></tr></thead><tbody>
  ${words.map(({ c, i }) => `<tr><td>#${c.n} ${esc(c.card)}</td><td>${esc(i.msg)}</td></tr>`).join("")}</tbody></table></div>
  <p class="note">The checker flags words that often break a rule. Most of these are fine when read in full.</p></section>` : ""}
</div>`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Saved ${out} (${splits.length} splits, ${thin.length} short mindsets, ${pairs.length} look-alike pairs)`);
