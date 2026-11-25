// The card checker: runs every rule a computer can check on a set of cards (see cards/RULES.md, rules marked [checker]).
//
//   node cards/check.cjs                    checks every live card in the app (js/cards-data.js)
//   node cards/check.cjs drafts.json        checks draft cards (same shape as card-review/rounds/*_final.json)
//   node cards/check.cjs --no-fit           skips the fit check (quicker, no browser)
//
// Writes cards/results/check.json (one entry per card: problems, warnings, and how much room it has left) and prints
// a short summary. Fit is measured on the app's own card, as it is today, at alex's phone size (430 x 932), in every
// place a card shows. Nothing is changed in the app. Inter stands in for the iPhone's font; it's a touch wider, so the
// fit check errs on the safe side.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const args = process.argv.slice(2), noFit = args.includes("--no-fit"), file = args.find((a) => !a.startsWith("--"));
const limit = +((args.find((a) => a.startsWith("--limit=")) || "").split("=")[1] || 0);   // --limit=20: only the first 20 (for trying it out)

// ---- Rule checks that only need the words ----
const US = { color: "colour", favorite: "favourite", organize: "organise", realize: "realise", recognize: "recognise", center: "centre",
  behavior: "behaviour", neighbor: "neighbour", apologize: "apologise", prioritize: "prioritise", practicing: "practising", traveling: "travelling",
  mom: "mum", gotten: "got", analyze: "analyse", fiber: "fibre", humor: "humour", honor: "honour",
  labor: "labour", flavor: "flavour", catalog: "catalogue", "check out": "(fine, but check it isn't US for 'look at')", vacation: "holiday", cellphone: "phone",
  college: "uni", semester: "semester (fine at uni)", math: "maths", "zip code": "postcode", apartment: "flat or apartment", fall: null, sidewalk: "footpath" };
const SPELL = Object.entries(US).filter(([, v]) => v && !v.startsWith("(fine")).map(([k, v]) => [new RegExp(`\\b${k}(s|ed|ing|er)?\\b`, "i"), k, v]);
const WORDS = [
  // [where, pattern, rule, problem or warning, message]
  ["any", /\bcrisis\b/i, "E1", "problem", 'says "crisis"'],
  ["for", /something else/i, "A4", "problem", 'is for "Something else"'],
  ["step", /\bnext time\b/i, "C1", "warning", 'says "next time" (the task must be for today)'],
  ["step", /\bremind yourself\b|\btell yourself\b/i, "C1", "warning", "may be only a thought, not a thing to do"],
  ["step", /\breconnect\b|\bbe more\b|\btry to be\b/i, "C1", "warning", "may be open-ended"],
  ["step", /\bone small change\b|\bsomething new\b(?! like)/i, "C1", "warning", "doesn't name the actual thing"],
  ["step", /\bbuy\b|\bpurchase\b|\bsubscri|\bcheap\b|\$\d|\bpay for\b/i, "C6", "warning", "may need something bought"],
  ["why", /\b(two|three|four|five|2|3|4|5) (studies|experiments|trials)\b/i, "D5b", "problem", 'counts a few studies (say "Studies show" instead)'],
  ["step", /\byou should\b|\byou must\b|\bstreak\b|\btarget\b/i, "E3", "warning", "may sound like pressure"],
  ["any", /\bweight|\bweigh-in|\bcalorie|\bdiet\b|\bslim\b|\bfat\b|\bappearance\b|\bhow you look\b|\bmirror\b/i, "E2", "self", "mentions weight, food or looks"],
];
const SELF_BODY = /\bexercis|\bworkout\b|\bgym\b|\beat\b|\beating\b|\bfood\b|\bmeal\b/i;
const sentences = (t) => t.split(/(?<=[.!?])\s+/).filter(Boolean).length;
const nWords = (t) => t.trim().split(/\s+/).length;

function wordChecks(c) {
  const out = [];
  const add = (level, rule, msg) => out.push({ level, rule, msg });
  const forTxt = Array.isArray(c.for) ? c.for.join(" ") : c.for;
  for (const [where, re, rule, level, msg] of WORDS) {
    const t = where === "step" ? c.card : where === "for" ? forTxt : where === "why" ? c.why : `${c.card} ${c.why}`;
    if (!re.test(t)) continue;
    if (level === "self") { if (c.pillar === "Self") add("problem", rule, msg + " on a Self card"); else add("warning", rule, msg); }
    else add(level, rule, msg);
  }
  if (c.pillar === "Self" && SELF_BODY.test(`${c.card} ${c.why}`)) add("warning", "E2", "Self card mentions exercise or food");
  for (const [re, us, au] of SPELL) if (re.test(`${c.card} ${c.why}`)) add("warning", "G1", `"${us}": Australian is "${au}"`);
  if (!c.why) add("problem", "D7", "has no why line");
  else {
    const w = nWords(c.why);
    if (w < 12 || w > 25) add("warning", "D8", `why line is ${w} words (aim for 12 to 25)`);
    if (sentences(c.why) < 2) add("warning", "D1", "why line isn't a takeaway then a study (one sentence)");
  }
  if (!c.src) add("problem", "D7", "has no study");
  else if (!/(and colleagues|\band\b .+|^[A-Z][^,]+), (19|20)\d\d[a-z]?$/.test(c.src)) add("warning", "D9", `source "${c.src}" isn't "Surname and colleagues, year"`);
  if (!["Tiny", "Small", "Bigger"].includes(c.size)) add("problem", "B2", `size "${c.size}" isn't Tiny, Small or Bigger`);
  if (c.draft && !c.chk) add("warning", "D6", "doesn't say what the study was checked against");
  return out;
}

// ---- Near-copies: cards whose steps share most of their meaningful words ----
const STOP = new Set("a an the and or of to in on at for with your you it its is be by as up out one two three this that from about who what them they their if into than then do some any each so just".split(" "));
const stem = (w) => w.replace(/(ing|ed|es|s)$/, "");
const bag = (t) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem));
function nearCopies(cards, all) {
  const bags = all.map((c) => [c, bag(c.card)]), out = {};
  for (const c of cards) {
    const b = bag(c.card);
    for (const [o, ob] of bags) {
      if (o.key === c.key) continue;
      const both = [...b].filter((w) => ob.has(w)).length, sim = both / Math.min(b.size, ob.size || 1);
      if ((both >= 4 && sim >= 0.6) || (both >= 3 && sim >= 0.8)) (out[c.key] = out[c.key] || []).push({ key: o.key, pillar: o.pillar, card: o.card, sim: Math.round(sim * 100) });
    }
  }
  return out;
}

// ---- Counts per mindset ----
function counts(cards, mindsets) {
  const out = [];
  for (const [pillar, list] of Object.entries(mindsets)) {
    const mine = cards.filter((c) => c.pillar === pillar);
    if (!mine.length) continue;
    for (const m of list) {
      const own = mine.filter((c) => Array.isArray(c.for) && c.for.includes(m));
      const sizes = ["Tiny", "Small", "Bigger"].filter((s) => !own.some((c) => c.size === s));
      out.push({ pillar, mindset: m, own: own.length, everyone: mine.filter((c) => c.for === "Everyone").length, missingSizes: sizes,
        ok: own.length >= 8 && !sizes.length });
    }
    const unknown = [...new Set(mine.flatMap((c) => (Array.isArray(c.for) ? c.for : [])).filter((m) => !list.includes(m)))];
    if (unknown.length) out.push({ pillar, mindset: unknown.join(", "), own: 0, unknown: true, ok: false });
  }
  return out;
}

// ---- Fit: the app's own card, in every place it shows ----
async function fit(cards, drafts) {
  const { chromium } = require("playwright");
  const { serve } = require(path.join(root, "tests", "helpers.cjs"));
  const server = await serve(), b = await chromium.launch(), p = await b.newPage({ viewport: { width: 430, height: 932 }, reducedMotion: "reduce" });
  await p.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.abort());
  await p.goto(server.url);
  await p.evaluate(() => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: "2026-11-10", days: {}, seen: { note: "x" }, tester: { on: true, consent: 99 } })));
  await p.reload(); await p.waitForTimeout(800);
  const res = await p.evaluate(async ({ list, drafts }) => {
    const st = document.createElement("style"); st.textContent = "body, button { font-family: Inter, sans-serif !important } * { animation: none !important; transition: none !important }"; document.head.append(st);
    document.documentElement.style.setProperty("--k", (430 / 320).toFixed(3));
    const { BANK } = await import("./js/cards-data.js"), draw = await import("./js/draw.js"); await document.fonts.ready;
    const w = document.createElement("div"); w.style.cssText = "position:absolute;left:0;top:0;width:430px"; document.body.append(w);
    const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // Draft cards borrow a spare row at the end of the bank, so the app draws them like any other card.
    const ids = list.map((c) => {
      if (!drafts) return c.n;
      BANK.push([BANK.length + 1, c.pillar, c.size, c.for, c.card, c.why, c.src]); return BANK.length;
    });
    // Each place returns true when the card fits there.
    const places = {
      hand: async (id) => { const stage = document.createElement("div"); stage.className = "stage"; w.replaceChildren(stage);
        const el = draw.cardEl(id); el.classList.add("hc", "up"); stage.append(el);
        const f = el.querySelector(".front"), th = f.querySelector(".thumbs"), task = f.querySelector(".task");
        return !(f.scrollHeight > f.clientHeight + 1) && !(th && th.getBoundingClientRect().top < task.getBoundingClientRect().bottom - 1); },
      kept: async (id) => { const holder = document.createElement("div"); holder.className = "big-holder"; w.replaceChildren(holder);
        const el = draw.cardEl(id, { big: true, tag: "div" }); el.classList.add("up"); holder.append(el); const f = el.querySelector(".front");
        const again = document.createElement("span"); again.className = "again"; again.textContent = "Back again · done 3 times"; f.querySelector(".task").after(again);
        return !(f.scrollHeight > f.clientHeight + 1); },
      home: async (id) => { for (const state of ["up", "done"]) { w.replaceChildren(); const lift = draw.homeCard(id, { state, felt: ["Enjoyed it", "Calmer"], onCam: () => {}, onDid: () => {} }); w.append(lift); await raf();
        if (lift.querySelector(".home-card").style.height) return false; } return true; },
      lifts: async (id) => { const r = BANK[id - 1]; const c = document.createElement("div"); c.className = "lifts-card";
        c.innerHTML = '<span class="lifts-p"><i></i>x</span><span class="lifts-t"></span><span class="lifts-chip">Enjoyed it</span><span class="lifts-n">Lifted you 3 times</span>';
        c.querySelector(".lifts-p").lastChild.textContent = r[1]; const t = c.querySelector(".lifts-t"); t.textContent = r[4]; w.replaceChildren(c);
        return !(t.scrollHeight > t.clientHeight + 1); },
    };
    // How many more letters a step can take before it stops fitting (searching in steps of whole words).
    const PAD = " and then a few more words to see how much room is left on this card for longer steps".split(" ");
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const id = ids[i], row = BANK[id - 1], text = row[4], r = { key: list[i].key, fits: {}, room: {} };
      for (const [name, ok] of Object.entries(places)) {
        row[4] = text; const fitsNow = await ok(id); r.fits[name] = fitsNow;
        if (!fitsNow) { let lo = 0, hi = text.split(" ").length; while (lo < hi) { const mid = (lo + hi + 1) >> 1; row[4] = text.split(" ").slice(0, mid).join(" "); if (await ok(id)) lo = mid; else hi = mid - 1; }
          r.room[name] = -(text.length - text.split(" ").slice(0, lo).join(" ").length); }
        else { let lo = 0, hi = PAD.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; row[4] = text + PAD.slice(1, mid + 1).join(" ").replace(/^/, " "); if (await ok(id)) lo = mid; else hi = mid - 1; }
          r.room[name] = lo ? (" " + PAD.slice(1, lo + 1).join(" ")).length : 0; }
      }
      row[4] = text; out.push(r);
    }
    return out;
  }, { list: cards.map((c) => ({ key: c.key, n: c.n, pillar: c.pillar, size: c.size, for: c.for, card: c.card, why: c.why, src: c.src })), drafts });
  await b.close(); server.close();
  return res;
}

(async () => {
  const data = await import(path.join(root, "js", "cards-data.js"));
  // pillars.js needs a browser, so its list of mindsets is read straight from the file.
  const src = fs.readFileSync(path.join(root, "js", "pillars.js"), "utf8"), MINDSETS = new Function(`return ${src.match(/export const MINDSETS = (\{[\s\S]*?\n\});/)[1]}`)();
  const live = data.LIVE.map((r) => ({ key: "#" + r[0], n: r[0], pillar: r[1], size: r[2], for: r[3], card: r[4], why: r[5], src: r[6] }));
  let cards = limit ? live.slice(0, limit) : live, drafts = false, mindsets;
  if (file) {
    const j = JSON.parse(fs.readFileSync(path.resolve(file), "utf8")), list = j.cards || j;
    cards = list.map((c) => ({ key: `${c.pillar || j.pillar}-${c.id}`, pillar: c.pillar || j.pillar, size: c.size, for: c.for, card: c.card, why: c.why, src: c.src, chk: c.chk, draft: true }));
    drafts = true; mindsets = j.mindsets ? { [j.pillar]: j.mindsets } : null;
  }
  if (!mindsets) mindsets = Object.fromEntries(Object.entries(MINDSETS || {}).map(([p, l]) => [p, l.map(([, k]) => k)]));
  const near = nearCopies(cards, drafts ? live.concat(cards) : live);
  const fits = noFit ? [] : await fit(cards, drafts);
  const byKey = Object.fromEntries(fits.map((f) => [f.key, f]));
  const result = cards.map((c) => {
    const issues = wordChecks(c), f = byKey[c.key];
    if (f) for (const [place, ok] of Object.entries(f.fits)) if (!ok) issues.push({ level: place === "lifts" ? "warning" : "problem", rule: "F1",
      msg: `${{ hand: "cut off in the hand", kept: "scrolls on the kept card", home: "stretches today's card on home", lifts: "cut off in What lifts you" }[place]} (${-f.room[place]} letters too long)` });
    if (near[c.key]) for (const o of near[c.key]) issues.push({ level: "warning", rule: "B4", msg: `looks like ${o.key} (${o.pillar}): "${o.card}"` });
    return { ...c, issues, fits: f && f.fits, room: f && f.room };
  });
  const out = { made: new Date().toISOString(), source: file ? path.basename(file) : "live cards", cards: result, counts: counts(cards, mindsets) };
  fs.mkdirSync(path.join(__dirname, "results"), { recursive: true });
  const name = file ? `check-${path.basename(file, ".json")}.json` : "check.json";
  fs.writeFileSync(path.join(__dirname, "results", name), JSON.stringify(out, null, 1));
  const prob = result.filter((c) => c.issues.some((i) => i.level === "problem")), warn = result.filter((c) => c.issues.some((i) => i.level === "warning"));
  console.log(`${result.length} cards checked: ${prob.length} with a problem, ${warn.length} with something to look at.`);
  const thin = out.counts.filter((m) => !m.ok);
  if (thin.length) console.log(`Mindsets short of 8 own cards or a size:\n  ${thin.map((m) => `${m.pillar} · ${m.mindset}: ${m.own} own${m.missingSizes && m.missingSizes.length ? `, no ${m.missingSizes.join("/")}` : ""}`).join("\n  ")}`);
  if (!noFit) for (const place of ["hand", "kept", "home", "lifts"]) {
    const r = fits.map((f) => f.room[place]), bad = r.filter((x) => x < 0).length, ok = r.filter((x) => x >= 0).sort((a, b) => a - b);
    console.log(`Fit, ${place}: ${bad} too long; the rest have ${ok.length ? `${ok[0]} to ${ok[ok.length - 1]} letters spare (middle ${ok[ok.length >> 1]})` : "-"}`);
  }
  console.log(`Saved cards/results/${name}`);
})();
