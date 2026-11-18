// The tester page (v2/testers.html). Kept in its own file so the page can refuse any inline or outside script.
import { MOODS, MOOD_COL } from "./util.js";
import { SLEEP_TAGS, SLEEP_MORE, FEELINGS } from "./words.js";
import { BANK } from "./cards-data.js";
const HOW = ["Didn't get to it", "Drained", "Okay", "Good", "Loved it"];
// Same order as FELT in js/deck.js: testers send positions in this list, never words.
const FELT = ["Enjoyed it", "Proud of myself", "Glad it's done", "Calmer", "Closer to someone", "More energy", "Felt like me", "Hard", "Drained me", "Not for me"];

const SERVICE = "https://intentionally-push.lextdo.workers.dev";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
const kd = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d, 12); };
const dayDiff = (a, b) => Math.round((kd(b) - kd(a)) / 864e5);
const keyOf = (t) => { const d = new Date(t - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

let pw = ""; try { pw = localStorage.getItem("daydeck-tester-pw") || ""; } catch {}
const forget = () => { pw = ""; $("pw").value = ""; try { localStorage.removeItem("daydeck-tester-pw"); } catch {} };
$("pw").value = pw;
$("login").addEventListener("submit", (e) => { e.preventDefault(); pw = $("pw").value.trim(); try { localStorage.setItem("daydeck-tester-pw", pw); } catch {} load(); });
if (pw) load();

let raw = null, removedMsg = "";
async function load() {
  $("status").textContent = "Loading…";
  try {
    const res = await fetch(`${SERVICE}/t/all`, { headers: { Authorization: "Bearer " + pw } });
    // A wrong password is forgotten at once, so opening the page again doesn't use up another try.
    if (res.status === 403) { forget(); const left = (await res.json().catch(() => ({}))).left;
      $("status").textContent = left > 0 ? `That password didn't work. ${left} ${left === 1 ? "try" : "tries"} left before this connection is locked for a week.`
        : "That password didn't work. This connection is now locked for a week."; return; }
    if (res.status === 429) { forget(); $("status").textContent = "This connection is locked for a week after 3 wrong passwords. To get back in sooner, set a new TESTER_KEY on GitHub and run \"Push service\"."; return; }
    if (!res.ok) throw new Error(res.status);
    raw = await res.json();
  } catch { $("status").textContent = "Couldn't reach the Daydeck service. Check you're online and try again."; return; }
  $("login").hidden = true;
  render(raw);
}

function bars(rows, max, unit = "") {
  max = max || Math.max(1, ...rows.map((r) => r[1]));
  return `<div class="bars">${rows.map(([l, v]) => `<div class="bar"><span>${esc(l)}</span><span class="t"><i style="width:${Math.min(100, v / max * 100)}%"></i></span><span class="n">${v}${unit}</span></div>`).join("")}</div>`;
}
const GROUP = { "Which cards need a look?": "cards", "Card thumbs": "cards", "Cards people make": "cards", "Do card reminders help?": "cards",
  "How did testers feel?": "checkins", "Do nudges bring people in?": "checkins", "Which words do people use, and which never?": "checkins", "Dragging the sun and moon": "checkins", "Going to sleep": "checkins", "Do the patterns feel true?": "checkins",
  "How does setup go?": "setup", "Which pillars and mindsets do people choose?": "setup", "How fast do people level up?": "setup", "Do people open their boxes?": "setup", "Do people open their weekly wrapped?": "checkins" };
const TABS = [["overview", "Overview"], ["cards", "Cards"], ["checkins", "Check-ins"], ["setup", "Setup"], ["testers", "Testers"]];
const sec = (title, ask, body, means, later) => `<section data-g="${GROUP[title] || "overview"}" class="${later ? "later" : ""}"><h2>${title}</h2><p class="ask">${ask}</p>${body}${means ? `<p class="means"><b>What this means:</b> ${means}</p>` : ""}</section>`;
const item = (q, meta, chip, look) => `<div class="item"><span>${esc(q)}</span><span class="meta">${esc(meta)}</span>${chip ? `<span class="chip ${look ? "look" : "ok"}">${esc(chip)}</span>` : ""}</div>`;
const notYet = (title, what) => sec(title, `Starts filling in once ${what} is built in the app.`, "", "", true);

// ---- Checking records before they're used ----
const BAD = Symbol("bad");
const parse = (j) => { try { return JSON.parse(j); } catch { return BAD; } };
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const isNum = Number.isFinite, isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const isArr = (x) => Array.isArray(x), arrOrNone = (x) => x == null || Array.isArray(x);
const SHAPE = {
  level: (v) => isInt(v, 1, 9999), level_start: (v) => isInt(v, 1, 9999), level_reset: (v) => isInt(v, 1, 9999), box_seen: (v) => isInt(v, 1, 9999),
  box_open: (v) => isObj(v) && isInt(v.n, 1, 9999) && isArr(v.c) && v.c.every(isNum) && isArr(v.x) && v.x.every((x) => ["draw", "rest", "pick", "send"].includes(x)) && (v.s == null || /^[a-z]{1,20}$/.test(v.s)) && isInt(v.p, 0, 99),
  extra_use: (v) => ["draw", "rest", "pick", "send"].includes(v),
  card_draw: arrOrNone, card_redraw: arrOrNone, helps_seen: arrOrNone, pick_pillars: arrOrNone,
  card_keep: (v) => isObj(v) && isNum(v.id),
  card_how: (v) => isObj(v) && isNum(v.id) && isInt(v.how, 0, 4),
  card_felt: (v) => isObj(v) && isNum(v.id) && isArr(v.f) && v.f.every((i) => isInt(i, 0, 9)),
  card_thumb: (v) => isObj(v) && isNum(v.id) && isNum(v.v) && arrOrNone(v.m),
  card_smaller: (v) => isObj(v) && isNum(v.from),
  own_card: (v) => isObj(v) && typeof v.p === "string" && v.p.length < 30 && isArr(v.f) && v.f.every((i) => isInt(i, 0, 9)) && isInt(v.deck, 0, 1),
  pick_mindset: (v) => v == null || (isObj(v) && arrOrNone(v.m)),
};
const okEvent = (name, val) => typeof name === "string" && (!SHAPE[name] || SHAPE[name](val));
const okDay = (d) => isObj(d) && (d.mood == null || isInt(d.mood, 0, 6)) && arrOrNone(d.feel) && arrOrNone(d.pil)
  && (d.sleep == null || (isObj(d.sleep) && arrOrNone(d.sleep.tags)));
let skipped = 0;
const PLACES = 60; // same as PLACES in push/worker.js
// Only a real number counts. Anyone can send the service records, so text where a number belongs must never reach the page.
const count = (x) => (Number.isFinite(x) && x > 0 ? x : 0);

function render(D) {
  skipped = 0;
  try { drawAll(D); }
  catch (err) {
    // Last resort: still show the tester list (with its Remove buttons) so a bad record can be removed.
    drawAll({ ...D, days: [], events: [] });
    $("status").textContent += ` · Some data couldn't be shown (${String(err && err.message || err).slice(0, 80)}). Remove the tester it came from, or send the downloaded data to Claude.`;
    return;
  }
  if (skipped) $("status").textContent += ` · ${skipped} record${skipped === 1 ? "" : "s"} skipped because ${skipped === 1 ? "it" : "they"} didn't look right`;
}

function drawAll(D) {
  const testers = D.testers, T = testers.length;
  // Records that don't look the way the app sends them (a bug, or someone sending junk) are skipped, not shown.
  const days = {}; D.days.forEach((r) => { const d = parse(r.data); if (okDay(d)) (days[r.code] = days[r.code] || {})[r.day] = d; else skipped++; });
  const ev = []; D.events.forEach((e) => { const val = e.val == null ? null : parse(e.val); if (val !== BAD && okEvent(e.name, val) && Number.isFinite(e.t)) ev.push({ code: e.code, t: e.t, name: e.name, val }); else skipped++; });
  const by = (n) => ev.filter((e) => e.name === n);
  const who = (n) => new Set(by(n).map((e) => e.code)).size;
  const today = keyOf(Date.now());
  $("status").textContent = `${T} tester${T === 1 ? "" : "s"} · updated ${new Date(D.at).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`;
  if (!T) { $("out").innerHTML = `<p class="sub">No testers yet. Send testers the invite link: <b>https://lextdo23.github.io/intentionally/v2/?tester</b></p>`; return; }

  // Tiles
  const active = testers.filter((t) => Object.keys(days[t.code] || {}).some((k) => dayDiff(k, today) < 7)).length;
  const pmSecs = median(by("pm_done").map((e) => e.val && e.val.secs).filter(Number.isFinite));
  const errors = by("error").length;
  let html = `<div class="tiles" data-g="overview"><div class="tile"><b>${active} of ${T}</b><span>checked in this past week</span></div>
    <div class="tile"><b>${pmSecs == null ? "–" : pmSecs + " s"}</b><span>a usual evening check-in</span></div>
    <div class="tile"><b>${errors}</b><span>error${errors === 1 ? "" : "s"} so far</span></div></div>`;

  // 1. Coming back
  const span = Math.min(42, Math.max(7, ...testers.map((t) => t.started ? dayDiff(t.started, today) + 1 : 1)));
  let grid = `<div class="grid" style="grid-template-columns:auto repeat(${span},16px)"><span></span>${Array.from({ length: span }, (_, i) => `<span class="hd">${(i + 1) % 7 === 1 ? i + 1 : ""}</span>`).join("")}`;
  testers.forEach((t) => {
    grid += `<span class="lab">${esc(t.code)}</span>`;
    const ds = days[t.code] || {}, start = t.started || keyOf(t.joined), len = dayDiff(start, today) + 1;
    for (let i = 0; i < span; i++) {
      if (i >= len) { grid += `<span class="cell none"></span>`; continue; }
      const k = keyOf(kd(start).getTime() + 4 * 3600e3 + i * 864e5), d = ds[k] || {};
      grid += `<span class="cell" title="${k}"><i class="a ${d.sleep ? "on" : ""}"></i><i class="p ${d.mood != null ? "on" : ""}"></i></span>`;
    }
  });
  grid += "</div>";
  html += sec("Do people come back?", "Each row is one tester, each square one day since they started. Top half is the morning, bottom half the evening.",
    `<div class="gridbox">${grid}</div><div class="key"><span><i style="background:var(--sun)"></i>Morning done</span><span><i style="background:var(--cool)"></i>Evening done</span><span><i style="background:var(--faint)"></i>Not that day</span></div>`,
    "look for the day where rows go quiet. That's where people drift off, and the screen to look at first.");

  // 2. Where people give up
  const quits = (k) => by(k + "_quit").map((e) => e.val);
  const amS = by("am_start").length, amD = by("am_done").length, amQ = quits("am");
  const pmS = by("pm_start").length, pmF = by("pm_feelings").length, pmD = by("pm_done").length;
  const amRest = amD + amQ.filter((s) => s === "rested" || s === "extras").length;
  html += sec("Where do people give up?", "Of every check-in that was started, how many reached each screen. People sometimes close a check-in on purpose to come back later, so expect a few.",
    `<p class="note">Start your day</p>${bars([["Opened", 100], ["Picked how rested", pct(amRest, amS)], ["Done", pct(amD, amS)]], 100, "%")}
     <p class="note">End of your day</p>${bars([["Opened", 100], ["Reached feelings", pct(pmF, pmS)], ["Done", pct(pmD, pmS)]], 100, "%")}
     <p class="note">${amS} morning and ${pmS} evening check-ins opened.</p>`,
    "the biggest drop between two bars is the screen to make simpler.");

  // 3. Homework
  const wk = (e) => { const t = testers.find((x) => x.code === e.code); return Math.floor((e.t - (t ? t.joined : e.t)) / (7 * 864e5)) + 1; };
  const timeRows = [];
  for (const [k, l] of [["am", "Morning"], ["pm", "Evening"]]) {
    const done = by(k + "_done").filter((e) => e.val && Number.isFinite(e.val.secs)), weeks = [...new Set(done.map(wk))].sort((a, b) => a - b);
    weeks.slice(0, 6).forEach((w) => timeRows.push([`${l} · week ${w}`, median(done.filter((e) => wk(e) === w).map((e) => e.val.secs))]));
  }
  html += sec("Does it feel like homework?", "How long a usual check-in takes, by week of testing.", timeRows.length ? bars(timeRows, 90, " s") : `<p class="sub">No check-ins yet.</p>`,
    "check-ins should get quicker as people learn them. Over about a minute is a warning sign.");

  // 4. Features used
  const restWho = testers.filter((t) => Object.values(days[t.code] || {}).some((d) => d.rest)).length;
  html += sec("Which features get used?", `How many of the ${T} testers used each one at least once.`,
    bars([["Your days", who("days_open")], ["Tapped a day in Your days", who("day_tap")], ["Switched Week, Month, Year", who("days_view")], ["Arranged Your days", who("arrange")],
      ["Added more about last night", who("am_extras")], ["Opened Show more", who("show_more")], ["Added their own word", who("own_word")], ["Rest day", restWho], ["Sleep button", who("sleep_button")], ["Saw the update note", who("update_note")], ["Opened Settings", who("settings_open")], ["Saved a copy", who("save_copy")], ["Restored from a file", who("restore")]], T),
    "features hardly anyone uses can stay small or go. Ones used a lot are worth polishing.");

  // 5. Mood by week
  const moodWeeks = [];
  testers.forEach((t) => Object.entries(days[t.code] || {}).forEach(([k, d]) => { if (d.mood == null) return; const w = Math.floor(dayDiff(t.started || k, k) / 7); (moodWeeks[w] = moodWeeks[w] || Array(7).fill(0))[d.mood]++; }));
  html += sec("How did testers feel?", "Every evening mood from every tester, by week of testing. This is for interest only: a small group can't prove the app helps.",
    `<div class="bars">${moodWeeks.map((w, i) => { if (!w) return ""; const tot = w.reduce((a, b) => a + b, 0); return `<div class="mw"><span>Week ${i + 1}</span><span class="stack">${w.map((n, j) => `<i title="${MOODS[j]}: ${n}" style="width:${n / tot * 100}%;background:${MOOD_COL[j]}"></i>`).join("")}</span></div>`; }).join("") || `<p class="sub">No moods yet.</p>`}</div>
     <div class="mkey">${MOODS.map((m, j) => `<span><i style="background:${MOOD_COL[j]}"></i>${m}</span>`).join("")}</div>`, "");

  // 6. Nudges
  const nud = testers.map((t) => { try { return JSON.parse(t.nudges || "{}"); } catch { return {}; } });
  const amOn = nud.filter((n) => n.am && n.am !== "off").length, pmOn = nud.filter((n) => n.pm && n.pm !== "off").length;
  const fromNudge = by("open").filter((e) => e.val === "nudge").length;
  const nSent = (k) => by("nudge_sent").filter((e) => e.val === k).length, nTap = (k) => by("nudge_tap").filter((e) => e.val === k).length;
  const sAm = nSent("am"), sPm = nSent("pm"), tAm = nTap("am"), tPm = nTap("pm");
  const hours = (n) => { const c = Array(24).fill(0); by(n).forEach((e) => c[new Date(e.t).getHours()]++); return c; };
  const hRows = (c) => c.map((n, h) => [`${h % 12 || 12} ${h < 12 ? "am" : "pm"}`, n]).filter((r) => r[1]);
  const within = (k) => { let hit = 0, all = 0; by(k + "_done").forEach((e) => { const t = testers.findIndex((x) => x.code === e.code), set = nud[t] && nud[t][k]; if (!set || set === "off") return; all++; const [hh, mm] = set.split(":").map(Number), d = new Date(e.t), n = new Date(d); n.setHours(hh, mm, 0, 0); const gap = (d - n) / 6e4; if (gap >= 0 && gap <= 60) hit++; }); return [hit, all]; };
  const [wa, aa] = within("am"), [wp, ap] = within("pm");
  html += sec("Do nudges bring people in?", "Who has nudges on, how often a nudge opened the app, and when people actually check in.",
    bars([["Morning nudge on", amOn], ["Evening nudge on", pmOn]], T) +
    `<p class="note">Nudges that reached phones, and how many were tapped</p>` +
    bars([["Morning: sent", sAm], ["Morning: tapped", tAm], ["Evening: sent", sPm], ["Evening: tapped", tPm]]) +
    bars([["Morning: checked in within an hour of the nudge", pct(wa, aa)], ["Evening: checked in within an hour of the nudge", pct(wp, ap)]], 100, "%") +
    `<p class="note">The app was opened from a nudge ${fromNudge} time${fromNudge === 1 ? "" : "s"}.</p>
     <p class="note">When mornings get done</p>${bars(hRows(hours("am_done")))}<p class="note">When evenings get done</p>${bars(hRows(hours("pm_done")))}`,
    "if most check-ins happen well after the nudge time, the default time should move closer to when people really check in.");

  // 7. Words never picked
  const allDays = testers.flatMap((t) => Object.values(days[t.code] || {}));
  const tagC = {}, feelC = {}; let pmDays = 0, notSure = 0, ownW = 0;
  allDays.forEach((d) => { (d.sleep && d.sleep.tags || []).forEach((w) => (tagC[w] = (tagC[w] || 0) + 1)); ownW += count(d.sleep && d.sleep.own) + count(d.feelOwn);
    if (d.mood != null) { pmDays++; (d.feel || []).forEach((w) => (feelC[w] = (feelC[w] || 0) + 1)); if ((d.feel || []).includes("Not sure")) notSure++; } });
  const tagRows = SLEEP_TAGS.concat(SLEEP_MORE).map((w) => [w, tagC[w] || 0]).sort((a, b) => a[1] - b[1]);
  const feelRows = FEELINGS.map((f) => [f[0], feelC[f[0]] || 0]).sort((a, b) => a[1] - b[1]);
  const never = tagRows.filter((r) => !r[1]).map((r) => r[0]), neverF = feelRows.filter((r) => !r[1]).map((r) => r[0]);
  html += sec("Which words do people use, and which never?", "How often each sleep tag and feeling was picked, least picked first.",
    `<p class="sub">Never picked: ${never.length ? esc(never.join(", ")) : "none"} (sleep) · ${neverF.length ? esc(neverF.join(", ")) : "none"} (feelings)</p>
     <p class="note">"Not sure" was picked on ${pct(notSure, pmDays)}% of evenings. People added their own words ${ownW} times (the words themselves are never sent).</p>
     <details><summary class="note" style="cursor:pointer;min-height:44px;display:flex;align-items:center">Show every word</summary>${bars(tagRows)}<div style="height:16px"></div>${bars(feelRows)}</details>`,
    "words nobody picks can move into Show more or be cut, so the first six are ones people really use.");

  // 8. Drag vs wheel
  const sets = {}; by("am_done").forEach((e) => { const s = (e.val && e.val.set) || "none"; sets[s] = (sets[s] || 0) + 1; });
  html += sec("Dragging the sun and moon", "How bed and wake times were set in each morning check-in.",
    bars([["Dragged the sun and moon", sets.drag || 0], ["Tapped a box for the time wheel", sets.wheel || 0], ["Both", sets.both || 0], ["Left as it was", sets.none || 0]]),
    "if most people use the wheel, dragging may be too fiddly. \"Left as it was\" means last night's times were already right.");

  // 8b. Going to sleep (sleep button + sounds)
  const sndN = {}; by("sleep_sound").forEach((e) => (sndN[e.val] = (sndN[e.val] || 0) + 1));
  const lenN = {}; by("sleep_len").forEach((e) => (lenN[e.val] = (lenN[e.val] || 0) + 1));
  const pre = by("sleep_prefill"), moved = pre.filter((e) => e.val && e.val.moved).length;
  const SND = { none: "No sound", brown: "Brown noise", pink: "Pink noise", white: "White noise", fan: "Fan", "gentle-rain": "Gentle rain", "window-rain": "Rain on a window", storm: "Rainstorm", river: "River", waves: "Ocean waves", wind: "Wind", pad: "Soft pad", hum: "Soft hum" };
  const LEN = { 15: "15 minutes", 30: "30 minutes", 60: "1 hour", 120: "2 hours", 0: "All night" };
  html += sec("Going to sleep", `${who("sleep_button")} of ${T} testers have used the sleep button, ${by("sleep_button").length} nights in all. Which sounds they pick (each pick or switch counts once), how long they play, and whether the morning times needed moving.`,
    by("sleep_button").length ? `${bars(Object.keys(SND).map((k) => [SND[k], sndN[k] || 0]))}<div style="height:16px"></div>${bars(Object.keys(LEN).map((k) => [LEN[k], lenN[k] || 0]))}
     <p class="note">Mornings that started from the button: ${pre.length}. Times moved: ${moved} (${pct(moved, pre.length)}%). Changed their mind within a minute: ${by("sleep_cancel").length}.</p>` : `<p class="sub">Nobody has used the sleep button yet.</p>`,
    "sounds nobody picks can go. If most mornings need moving, people tap the button long before sleeping, or open the app long after waking.");

  // 9. Patterns
  const shown = {}, hid = {};
  by("helps_seen").forEach((e) => (e.val || []).forEach((id) => (shown[id] = (shown[id] || 0) + 1)));
  by("help_hide").forEach((e) => (hid[e.val] = (hid[e.val] || 0) + 1));
  const pats = Object.keys(shown).sort((a, b) => (hid[b] || 0) / shown[b] - (hid[a] || 0) / shown[a]);
  html += sec("Do the patterns feel true?", "Lines shown in \"What seems to help you\", and how often testers tapped \"That's not it\". Lines starting r- are from research; the rest are people's own patterns.",
    pats.length ? `<div class="items">${pats.map((id) => item(id, `Shown ${shown[id]} times · dismissed ${hid[id] || 0}`, (hid[id] || 0) / shown[id] >= 0.25 ? "Often dismissed" : "Feels true", (hid[id] || 0) / shown[id] >= 0.25)).join("")}</div>` : `<p class="sub">Nobody has opened Your days yet.</p>`,
    "lines people dismiss a lot need rewording or removing.");

  // 10. Errors and phones
  const errs = {}; by("error").forEach((e) => { const k = String(e.val); (errs[k] = errs[k] || { n: 0, who: new Set() }).n++; errs[k].who.add(e.code); });
  const phones = {}; testers.forEach((t) => (phones[t.phone || "?"] = (phones[t.phone || "?"] || 0) + 1));
  const ver = {}; testers.forEach((t) => (ver[t.version || "?"] = (ver[t.version || "?"] || 0) + 1));
  const errList = Object.entries(errs).sort((a, b) => b[1].who.size - a[1].who.size || b[1].n - a[1].n);
  html += sec("Errors and phones", "Problems the app ran into, and which phones and app versions testers have.",
    (errList.length ? `<div class="items">${errList.slice(0, 20).map(([m, x]) => item(m, `${x.who.size} tester${x.who.size === 1 ? "" : "s"} · ${x.n} time${x.n === 1 ? "" : "s"}`, x.who.size > 1 ? "Fix first" : "Minor", x.who.size > 1)).join("")}</div>` : `<p class="sub">No errors so far.</p>`) +
    bars(Object.entries(phones).sort((a, b) => b[1] - a[1]), T) + `<p class="note">App versions: ${esc(Object.entries(ver).map(([v, n]) => `${v} (${n})`).join(", "))}</p>`,
    "download the data and send it to Claude to look into any error.");

  // 11. Not built yet
  // 11. Cards
  const cs = {}; const C = (id) => (cs[id] = cs[id] || { drawn: 0, kept: 0, passed: 0, up: 0, down: 0, how: [0, 0, 0, 0, 0], smaller: 0, saved: 0 });
  by("card_draw").concat(by("card_redraw")).forEach((e) => (e.val || []).forEach((id) => C(id).drawn++));
  by("card_keep").forEach((e) => C(e.val.id).kept++);
  by("card_how").forEach((e) => C(e.val.id).how[e.val.how]++);
  const misfit = {}; by("card_thumb").forEach((e) => { const c = C(e.val.id); if (e.val.v > 0) c.up++; else { c.down++; (e.val.m || []).forEach((m) => { const k = `${e.val.p}: ${m}`; (misfit[k] = misfit[k] || 0); misfit[k]++; }); (c.downM = c.downM || new Set()); (e.val.m || []).forEach((m) => c.downM.add(m)); } });
  by("card_smaller").forEach((e) => C(e.val.from).smaller++);
  by("card_save").forEach((e) => C(e.val).saved++);
  const draws = by("card_draw").length, howAll = [0, 0, 0, 0, 0]; by("card_how").forEach((e) => howAll[e.val.how]++);
  const feltAll = FELT.map(() => 0); by("card_felt").forEach((e) => e.val.f.forEach((i) => feltAll[i]++));
  delete cs[0];   // 0 = a card someone made themselves: never named here
  const look = Object.entries(cs).map(([id, c]) => [+id, c, c.down * 3 + c.how[0] + c.how[1] + (c.drawn - c.kept > 3 && !c.kept ? 2 : 0)]).filter((x) => x[2] > 0).sort((a, b) => b[2] - a[2]);
  const name = (id) => { const r = BANK[id - 1]; return r ? `#${id} ${r[4]}` : `#${id}`; };
  // Card reminders (alex 2026-11-17): sent, tapped, card done afterwards, switched off. "First" is the day's first
  // reminder (usually lunch), "second" the later one (usually after work).
  {
    const sent = by("nudge_sent").filter((e) => e.val === "card"), taps = by("nudge_tap").filter((e) => e.val === "card");
    const slot = new Map(), seen = {};
    sent.slice().sort((a, b) => a.t - b.t).forEach((e) => { const k = e.code + keyOf(e.t); seen[k] = (seen[k] || 0) + 1; slot.set(e, seen[k] === 1 ? 0 : 1); });
    const tapSlot = (e) => { const s = sent.filter((x) => x.code === e.code && x.t <= e.t).sort((a, b) => b.t - a.t)[0]; return s ? slot.get(s) : 0; };
    // Done after a reminder = "I did it" later that day, before the day's next reminder (so each one counts once).
    const did = (e) => { const nx = sent.filter((x) => x.code === e.code && x.t > e.t && keyOf(x.t) === keyOf(e.t)).reduce((m, x) => Math.min(m, x.t), Infinity);
      return by("card_did").some((x) => x.code === e.code && x.t > e.t && x.t < nx && keyOf(x.t) === keyOf(e.t)); };
    const row = (i) => { const s = sent.filter((e) => slot.get(e) === i); return [s.length, taps.filter((e) => tapSlot(e) === i).length, s.filter(did).length]; };
    const [s1, t1, d1] = row(0), [s2, t2, d2] = row(1), off = new Set(by("nudge_card").filter((e) => e.val === "off").map((e) => e.code)).size;
    html += sec("Do card reminders help?", "Reminders sent when a tester's card wasn't done yet, how many were tapped, and how often the card got done afterwards (before the next reminder, or by the end of the day). First is the day's first reminder (usually 12:30pm), second the later one (usually after work).",
      sent.length ? `<p class="note">First reminder</p>${bars([["Sent", s1], ["Tapped", t1], ["Card done after", d1]], Math.max(1, s1))}
        <p class="note">Second reminder</p>${bars([["Sent", s2], ["Tapped", t2], ["Card done after", d2]], Math.max(1, s2))}
        <p class="note">Testers who turned card reminders off</p>${bars([["Turned off", off]], Math.max(1, T))}` : `<p class="sub">No card reminders sent yet. They count once a tester opens the app after one arrives.</p>`,
      "if the second reminder gets done more often than the first, lunch may be too early; if few cards get done after either, the reminder words or times need a rethink.");
  }

  html += sec("Which cards need a look?", "How the daily card draw goes, and which cards people pass over, don't get to, or mark as needing work. Only card numbers are sent; the words come from the app's own list.",
    draws ? bars([["Mornings with a draw", draws], ["Drew again", by("card_redraw").length], ["Kept a card", by("card_keep").length], ["Made it smaller", by("card_smaller").length], ["Saved for later", by("card_save").length], ["Rest days", by("card_rest").length], ["Said \"Not now\"", by("card_later").length], ["Tapped \"I did it\" on home", by("card_did").length], ["Took \"I did it\" back", by("card_undo").length], ["Said how it felt right after \"I did it\"", by("card_felt").filter((e) => e.val && e.val.home).length], ["Said \"Not now\" to how it felt", by("card_felt_later").length], ["Turned the card by hand", by("card_spin").length]], draws) +
      `<p class="note">How it went, in the evening:</p>` + bars(HOW.map((w, i) => [w, howAll[i]])) +
      (feltAll.some(Boolean) ? `<p class="note">How doing it felt (pick any, from 17 Nov):</p>` + bars(FELT.map((w, i) => [w, feltAll[i]]).sort((a, b) => b[1] - a[1])) : "") +
      (look.length ? `<div class="items">${look.slice(0, 25).map(([id, c]) => item(name(id), `Drawn ${c.drawn} · kept ${c.kept} · didn't get to it ${c.how[0]} · drained ${c.how[1]} · loved ${c.how[4]} · fits ${c.up}, doesn't fit ${c.down}${c.downM && c.downM.size ? ` (for: ${[...c.downM].join(", ")})` : ""}`, c.down ? "Doesn't fit" : "Watch", true)).join("")}</div>` : `<p class="sub">No card stands out as a problem yet.</p>`) +
      (Object.keys(misfit).length ? `<p class="note">"Doesn't fit" by pillar and mindset:</p>` + bars(Object.entries(misfit).sort((a, b) => b[1] - a[1]).slice(0, 12)) : "")
    : `<p class="sub">No cards drawn yet.</p>`,
    "thumbs ask testers whether a card fits their pillar and where they're at with it, not whether the card is good. A card that doesn't fit may belong under a different mindset. Cards with thumbs down, or often \"Didn't get to it\" or \"Drained\", are the first to rewrite or cut. Lots of \"Drew again\" means the first three often don't fit.");
  // Card thumbs: every rated card (not only the problem ones), by pillar then mindset, with filters (alex 2026-11-17)
  // Cards people make themselves in the evening (from 17 Nov): pillar, feelings and the deck switch. Never their words.
  { const made = by("own_card"), opened = by("own_open").length, byP = {}, felt = FELT.map(() => 0);
    made.forEach((e) => { const p = e.val.p === "own" ? "A pillar of their own" : e.val.p; byP[p] = (byP[p] || 0) + 1; e.val.f.forEach((i) => felt[i]++); });
    html += sec("Cards people make", "In the evening, people can make a card for something else they did that went well. Only the pillar and the feelings they tap are sent, never what they wrote.",
      made.length || opened ? bars([["Started making a card", opened], ["Kept a card", made.length], ["Added it to their deck", made.filter((e) => e.val.deck).length]], Math.max(opened, made.length)) +
        (made.length ? `<p class="note">Which pillar:</p>` + bars(Object.entries(byP).sort((a, b) => b[1] - a[1])) : "") +
        (felt.some(Boolean) ? `<p class="note">How it felt:</p>` + bars(FELT.map((w, i) => [w, felt[i]]).filter((r) => r[1]).sort((a, b) => b[1] - a[1])) : "")
      : `<p class="sub">No one has made a card yet.</p>`,
      "If people make lots of cards for one pillar, the deck may be missing cards they'd like there."); }
  html += sec("Card thumbs", "Every card a tester has rated: does it fit their pillar and where they're at with it? Tap a pillar to see only its cards.", `<div id="thumbs"></div>`,
    "a thumbs down asks \"does this fit me\", not \"is this a good card\". A card that doesn't fit may belong under a different mindset.");
  // Setup: choosing pillars and where you're at
  const pStart = by("pick_start").filter((e) => e.val === "setup"), pDone = by("pick_done").filter((e) => e.val && e.val.first);
  const pQuit = {}; by("pick_quit").forEach((e) => { const k = String(e.val).startsWith("mindset_") ? "On a pillar's question" : "Choosing pillars"; pQuit[k] = (pQuit[k] || 0) + 1; });
  const pSecs = median(pDone.map((e) => e.val.secs).filter(Number.isFinite));
  html += sec("How does setup go?", "Getting started: choosing 3 to 5 pillars, then one short question for each. How many finish, where people stop, and how long it takes.",
    pStart.length ? bars([["Started", 100], ["Chose their pillars", pct(new Set(by("pick_pillars").map((e) => e.code)).size, new Set(pStart.map((e) => e.code)).size)], ["Finished", pct(new Set(pDone.map((e) => e.code)).size, new Set(pStart.map((e) => e.code)).size)]], 100, "%") +
      `<p class="note">A usual setup took ${pSecs == null ? "–" : pSecs + " seconds"}. Stopped part way: ${Object.entries(pQuit).map(([k, n]) => `${esc(k)} ${n}`).join(", ") || "nobody"}. Changed pillars later in Settings: ${by("pick_done").filter((e) => e.val && !e.val.first).length} times.</p>`
    : `<p class="sub">Nobody has started yet.</p>`,
    "if lots of people stop on the pillar screen, there may be too many to choose from. Over two minutes means it feels like homework.");

  // Which pillars and mindsets
  const lastPick = {}; by("pick_pillars").forEach((e) => (lastPick[e.code] = e.val || []));
  const pc = {}; Object.values(lastPick).forEach((l) => l.forEach((n) => (pc[n] = (pc[n] || 0) + 1)));
  const mc = {}, other = {}, kinds = {}; const lastM = {};
  by("pick_mindset").forEach((e) => { if (e.val && e.val.p && e.val.p !== "Own") lastM[e.code + "|" + e.val.p] = e.val; });
  Object.values(lastM).forEach((v) => { (v.m || []).forEach((m) => (mc[v.p + " · " + m] = (mc[v.p + " · " + m] || 0) + 1)); if (v.other) other[v.p] = (other[v.p] || 0) + 1; if (v.kind) kinds[v.kind] = (kinds[v.kind] || 0) + 1; });
  const PILL = ["Friends", "Family", "Love", "Community", "Move", "Food", "Rest", "Outdoors", "Work and study", "Money", "Learn", "Play and create", "Give", "Meaning", "Own"];
  const N = Object.keys(lastPick).length;
  html += sec("Which pillars and mindsets do people choose?", `Each tester's latest choice (${N} so far). "Own" is a pillar they named themselves; the name is never sent.`,
    N ? bars(PILL.map((n) => [n === "Own" ? "Their own pillar" : n, pc[n] || 0]).sort((a, b) => b[1] - a[1]), N) +
      `<details><summary class="note" style="cursor:pointer;min-height:44px;display:flex;align-items:center">Show where people are at, per pillar</summary>${bars(Object.entries(mc).sort((a, b) => b[1] - a[1]))}</details>
       <p class="note">"Something else" picked: ${Object.entries(other).map(([k, n]) => `${esc(k)} ${n}`).join(", ") || "never"}. Kinds of moving: ${Object.entries(kinds).map(([k, n]) => `${esc(k)} ${n}`).join(", ") || "none picked"}.</p>`
    : `<p class="sub">Nobody has chosen pillars yet.</p>`,
    "pillars nobody picks can be cut or merged; lots of \"Something else\" on one pillar means its list is missing something.");
  // Levels (from 17 Nov): each level reached, and the level a tester started at (people from before levels start higher).
  // Everyone went back to level 1 on 18 Nov (level_reset): only levels after a tester's reset count.
  { const top = {}, reach = {}, resetAt = {};
    by("level_reset").forEach((e) => (resetAt[e.code] = Math.max(resetAt[e.code] || 0, e.t)));
    by("level_reset").forEach((e) => (top[e.code] = top[e.code] || 1));
    by("level_start").concat(by("level")).filter((e) => !resetAt[e.code] || e.t > resetAt[e.code]).forEach((e) => { if (Number.isInteger(e.val)) top[e.code] = Math.max(top[e.code] || 1, e.val); });
    by("level").filter((e) => !resetAt[e.code] || e.t > resetAt[e.code]).forEach((e) => { const t = testers.find((x) => x.code === e.code), from = resetAt[e.code] || (t && t.joined); if (from && [2, 3, 5, 10].includes(e.val)) (reach[e.val] = reach[e.val] || []).push(Math.max(1, Math.round((e.t - from) / 864e5) + 1)); });
    const n = Object.keys(top).length, hist = {}; Object.values(top).forEach((l) => { const k = l >= 10 ? "Level 10 or more" : `Level ${l}`; hist[k] = (hist[k] || 0) + 1; });
    const day = (l) => { const m = median(reach[l] || []); return m == null ? "–" : `day ${m}`; };
    html += sec("How fast do people level up?", "Each tester's level now, and on which day after joining people usually reach a level. Each level brings a box.",
      n ? bars(Object.entries(hist).sort((a, b) => (parseInt(a[0].replace(/\D/g, "")) || 0) - (parseInt(b[0].replace(/\D/g, "")) || 0)), n) +
        `<p class="note">Usually reached: level 2 on ${day(2)}, level 3 on ${day(3)}, level 5 on ${day(5)}, level 10 on ${day(10)}. Planned for a usual week: level 2 on day 1, level 3 by day 3, level 5 by day 8, level 10 by day 28.</p>`
      : `<p class="sub">No levels yet. They start counting once a tester opens the new version.</p>`,
      "if people are much slower than planned, boxes feel far away and the points or the curve need easing; much faster and boxes lose their meaning."); }

  // Boxes (from 18 Nov): earned, seen, opened, kept for later, finished; which extras came and which got used.
  { const seen = who("box_seen"), opened = who("box_open"), fin = who("box_done"), later = by("box_later").length;
    const XN = { draw: "One more draw", rest: "A rest day", pick: "Pick my own", send: "Send a card" };
    const got = {}, used = {}; by("box_open").forEach((e) => e.val.x.forEach((x) => (got[x] = (got[x] || 0) + 1))); by("extra_use").forEach((e) => (used[e.val] = (used[e.val] || 0) + 1));
    const looks = {}; by("box_open").forEach((e) => { if (e.val.s) looks[e.val.s] = Math.max(looks[e.val.s] || 0, e.val.p); });
    html += sec("Do people open their boxes?", "Testers who saw a box, opened one and reached the end. Then which extras came out of boxes and how many got used.",
      seen || opened ? bars([["Saw a box", seen], ["Opened one", opened], ["Reached the end", fin]], Math.max(seen, opened)) +
        `<p class="note">Boxes opened: ${by("box_open").length}. Kept for later: ${later} times.</p>` +
        bars(Object.keys(XN).filter((k) => got[k]).map((k) => [`${XN[k]} came`, got[k]]), 0) +
        `<p class="note">Used: ${Object.keys(XN).filter((k) => used[k]).map((k) => `${XN[k]} ${used[k]}`).join(", ") || "none yet"}. Furthest into a look: ${Object.entries(looks).map(([k, n]) => `${esc(k)} ${n}`).join(", ") || "none yet"}.</p>`
      : `<p class="sub">No boxes yet. They come with each level from level 2.</p>`,
      "lots of boxes kept for later, or opened but never finished, means opening isn't wanted (or takes too long); extras that come but never get used can be swapped out."); }

  // Weekly wrapped (from 17 Nov): ready vs opened vs finished, where people stop, the guess, what they keep, sharing.
  { const ready = who("wrap_ready"), opened = who("wrap_open"), fin = who("wrap_done");
    const quits = {}; by("wrap_quit").forEach((e) => (quits[e.val || "?"] = (quits[e.val || "?"] || 0) + 1));
    const SCR = { name: "1 Name of the week", best: "2 Guess your best day", find: "3 Something we noticed", works: "4 What works for you", next: "5 Shape next week", poster: "6 Your week on a card" };
    const g = {}; by("wrap_guess").forEach((e) => (g[e.val] = (g[e.val] || 0) + 1));
    const keep = {}; by("wrap_keep").forEach((e) => String(e.val || "").split(",").filter(Boolean).forEach((k) => (keep[k] = (keep[k] || 0) + 1)));
    const KEEP = { nudge: "Wind-down nudge", more: "More cards from what worked", try: "Try a rarely drawn pillar", tiny: "Only tiny cards", rest: "A rest day midweek", same: "Keep it as it is" };
    const stops = {}; by("wrap_stop").forEach((e) => (stops[e.val] = (stops[e.val] || 0) + 1));
    const names = {}; by("wrap_name").forEach((e) => (names[e.val] = (names[e.val] || 0) + 1));
    html += sec("Do people open their weekly wrapped?", "Testers whose wrapped was ready, who opened it and who reached the last card. Then where people closed it, how the best-day guess went, what they kept for next week, and sharing.",
      ready || opened ? bars([["Wrapped was ready", ready], ["Opened it", opened], ["Reached the last card", fin]], Math.max(ready, opened)) +
        `<p class="note">Closed early on: ${Object.entries(quits).map(([k, n]) => `${esc(SCR[k] || k)} ${n}`).join(", ") || "never"}.</p>` +
        `<p class="note">Best-day guess: right ${g.right || 0}, close ${g.close || 0}, off ${g.off || 0}, no guess ${g.none || 0}.</p>` +
        bars(Object.entries(KEEP).map(([k, l]) => [l, keep[k] || 0]).sort((a, b) => b[1] - a[1])) +
        `<p class="note">"Not now" ${by("wrap_notnow").length}. Stopped early from home or Settings: ${Object.entries(stops).map(([k, n]) => `${esc(KEEP[k] || k)} ${n}`).join(", ") || "never"}. Shared ${by("wrap_share").length} (without moods ${by("wrap_share").filter((e) => e.val === "no_moods").length}). Week names given: ${Object.entries(names).map(([k, n]) => `${esc(k)} ${n}`).join(", ") || "none yet"}.</p>`
      : `<p class="sub">No wrapped yet. The first one is ready on a tester's day 7.</p>`,
      "lots of closing on one screen means that screen is slow or unclear; ideas nobody keeps, or keep then stop, can be cut."); }

  // 12. Safety
  html += sec("Safety", "Counts only, never tied to anything a tester wrote. For the safety reviewer.",
    bars([["\"Need to talk to someone?\" tapped", by("lifeline_tap").length], ["Testers who tapped it", who("lifeline_tap")]]), "");

  // Testers table + actions
  const fmt = (t) => new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  html += `<section data-g="testers"><h2>Testers</h2><p class="ask">Everyone sharing with you.</p><p class="note">${testers.length} of ${PLACES} places used. The service takes up to ${PLACES} testers; remove someone to free a place.</p>${removedMsg ? `<p class="sub" aria-live="polite">${esc(removedMsg)}</p>` : ""}
    <div class="items">${testers.map((t) => `<div class="tcard" data-code="${esc(t.code)}"><div class="ttop"><div class="who"><b>${esc(t.code)}</b>
      <span>${esc(t.phone || "")} · app ${esc(t.version || "?")} · joined ${fmt(t.joined)} · last sent ${fmt(t.seen)} · ${Object.keys(days[t.code] || {}).length} days noted</span></div>
      <button class="rm">Remove</button></div></div>`).join("")}</div>
    <p class="note">Invite link for testers: https://lextdo23.github.io/intentionally/v2/?tester</p></section>`;
  html += `<section data-g="testers" class="foot"><h2>Your data</h2><p class="ask" style="margin:0">Download everything to keep a copy or to send to Claude. When testing ends, delete it all.</p>
    <div class="row"><button id="dl" class="main">Download all data</button><button id="wipe">Delete all tester data</button></div><p class="note" id="wipemsg" aria-live="polite"></p></section>`;
  // Needs a look: the few things worth seeing first, each one opens its tab.
  const needs = [];
  const tLast = {}; by("card_thumb").forEach((e) => { if (e.val && e.val.id) tLast[e.code + "|" + e.val.id] = e.val.v; });
  const downCards = new Set(Object.entries(tLast).filter(([, v]) => v < 0).map(([k]) => k.split("|")[1])).size;
  if (downCards) needs.push(["cards", `${downCards} card${downCards === 1 ? "" : "s"} marked "doesn't fit"`, "Cards"]);
  if (errors) needs.push(["overview", `${errors} error${errors === 1 ? "" : "s"} from testers' phones`, "Errors and phones"]);
  if (amS >= 5 && pct(amD, amS) < 70) needs.push(["overview", `Only ${pct(amD, amS)}% of mornings get finished`, "Where people give up"]);
  if (pmS >= 5 && pct(pmD, pmS) < 70) needs.push(["overview", `Only ${pct(pmD, pmS)}% of evenings get finished`, "Where people give up"]);
  if (pmSecs != null && pmSecs > 60) needs.push(["overview", `A usual evening takes ${pmSecs} seconds`, "Homework"]);
  const quiet = testers.filter((t) => { const ks = Object.keys(days[t.code] || {}).sort(); const lastK = ks[ks.length - 1]; return t.joined < Date.now() - 3 * 864e5 && (!lastK || dayDiff(lastK, today) >= 3); }).length;
  if (quiet) needs.push(["overview", `${quiet} tester${quiet === 1 ? " hasn't" : "s haven't"} checked in for 3 days or more`, "Coming back"]);
  const needsBox = `<div class="needs" data-g="overview"><h2>NEEDS A LOOK</h2>${needs.length ? needs.map(([g, t, w], i) => `<button type="button" data-go="${g}"><span>${esc(t)}</span><span>${esc(w)} ›</span></button>`).join("") : `<p>Nothing stands out right now.</p>`}</div>`;
  html = html.replace('<div class="tiles" data-g="overview">', needsBox + '<div class="tiles" data-g="overview">');
  $("out").innerHTML = `<nav class="ttabs" role="tablist" aria-label="Sections">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}">${l}</button>`).join("")}</nav>` + html;
  thumbsView(by("card_thumb"));
  let tab = "overview"; try { tab = localStorage.getItem("daydeck-tester-tab") || tab; } catch {}
  const show = (k, top) => {
    if (!TABS.some(([x]) => x === k)) k = "overview";
    document.querySelectorAll("#out [data-g]").forEach((el) => (el.hidden = el.dataset.g !== k));
    document.querySelectorAll(".ttabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === k)));
    try { localStorage.setItem("daydeck-tester-tab", k); } catch {}
    if (top) document.querySelector(".ttabs").scrollIntoView({ block: "start" });
  };
  document.querySelectorAll(".ttabs button").forEach((b) => (b.onclick = () => show(b.dataset.tab, true)));
  document.querySelectorAll(".needs [data-go]").forEach((b) => (b.onclick = () => show(b.dataset.go, true)));
  show(tab, false);

  // Remove a tester: one tap asks, the second removes. Deletes what they shared and stops their phone sending.
  document.querySelectorAll(".tcard").forEach((card) => {
    const code = card.dataset.code;
    card.querySelector(".rm").onclick = () => {
      card.querySelector(".rm").hidden = true;
      const box = document.createElement("div"); box.className = "confirm";
      box.innerHTML = `<p>Remove ${esc(code)}? Everything they've shared is deleted and their phone stops sending. This can't be undone.</p><div class="row two"><button class="keep">Keep</button><button class="danger">Remove tester</button></div><p class="note" aria-live="polite"></p>`;
      card.append(box);
      box.querySelector(".keep").onclick = () => { box.remove(); card.querySelector(".rm").hidden = false; };
      box.querySelector(".danger").onclick = async () => {
        const res = await fetch(`${SERVICE}/t/remove`, { method: "POST", headers: { Authorization: "Bearer " + pw, "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).catch(() => null);
        if (!res || !res.ok) { box.querySelector(".note").textContent = "Couldn't remove. Check you're online and try again."; return; }
        raw.testers = raw.testers.filter((t) => t.code !== code); raw.days = raw.days.filter((d) => d.code !== code); raw.events = raw.events.filter((e) => e.code !== code);
        removedMsg = `${code} removed. Their data is deleted.`; render(raw);
      };
    };
  });
  $("dl").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(raw, null, 1)], { type: "application/json" })); a.download = `daydeck-testers-${today}.json`; a.click(); };
  let armed = false;
  $("wipe").onclick = async () => {
    if (!armed) { armed = true; $("wipe").textContent = "Tap again to delete everything"; $("wipemsg").textContent = "This can't be undone. Download a copy first if you want one."; return; }
    const res = await fetch(`${SERVICE}/t/wipe`, { method: "POST", headers: { Authorization: "Bearer " + pw } }).catch(() => null);
    $("wipemsg").textContent = res && res.ok ? "Deleted. Reload to see the empty page." : "Couldn't delete. Check you're online and try again.";
  };
}
window.__render = (d) => { raw = d; $("login").hidden = true; render(d); };
// ---------------- Card thumbs ----------------
const PCOL = { Friends: "#d9b3a6", Family: "#d9b3a6", Love: "#d9b3a6", Community: "#d9b3a6", Move: "#a9c4b5", Outdoors: "#a9c4b5",
  Food: "#cfc59b", "Work and study": "#cfc59b", Money: "#cfc59b", Rest: "#a9b9d6", Learn: "#a9b9d6", "Play and create": "#c4b4c9", Give: "#c4b4c9", Meaning: "#c4b4c9" };
const TH = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M7 10v11H4V10h3zM7 10l4-8a2.5 2.5 0 0 1 2.5 2.5V9h5.6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 17.7 21H7"/></svg>`;
function thumbsView(events) {
  const box = $("thumbs"); if (!box) return;
  // One answer per tester per card (the latest), then add them up per card.
  const last = {}; events.forEach((e) => { if (e.val && e.val.id) last[e.code + "|" + e.val.id] = e; });
  const cards = {};
  Object.values(last).forEach((e) => {
    const r = BANK[e.val.id - 1]; if (!r) return;
    const c = (cards[r[0]] = cards[r[0]] || { id: r[0], pillar: r[1], size: r[2], forWho: Array.isArray(r[3]) ? r[3] : [r[3]], text: r[4], up: 0, down: 0, upBy: [], downBy: [] });
    if (e.val.v > 0) { c.up++; c.upBy.push(e.code); } else { c.down++; c.downBy.push(e.code); }
  });
  const all = Object.values(cards);
  if (!all.length) { box.innerHTML = `<p class="sub">No thumbs yet.</p>`; return; }
  const ups = all.reduce((a, c) => a + c.up, 0), downs = all.reduce((a, c) => a + c.down, 0);
  // Pillars, most rated first; each split by the mindset the card was written for.
  const pil = {}; all.forEach((c) => {
    const p = (pil[c.pillar] = pil[c.pillar] || { name: c.pillar, up: 0, down: 0, ms: {} }); p.up += c.up; p.down += c.down;
    c.forWho.forEach((m) => { const x = (p.ms[m] = p.ms[m] || [0, 0]); x[0] += c.up; x[1] += c.down; });
  });
  const pils = Object.values(pil).sort((a, b) => (b.up + b.down) - (a.up + a.down) || a.name.localeCompare(b.name));
  const st = { pillar: "", show: "all", sort: "liked", more: false };
  const draw = () => {
    const tot = (p) => p.up + p.down;
    let list = all.filter((c) => (!st.pillar || c.pillar === st.pillar) && (st.show === "all" || (st.show === "up" ? c.up : c.down)));
    const net = (c) => c.up - c.down;
    list.sort(st.sort === "liked" ? (a, b) => net(b) - net(a) || b.up - a.up || a.id - b.id
      : st.sort === "least" ? (a, b) => net(a) - net(b) || b.down - a.down || a.id - b.id
      : (a, b) => (b.up + b.down) - (a.up + a.down) || a.id - b.id);
    const shown = st.more ? list : list.slice(0, 20);
    box.innerHTML = `<div style="display:flex;flex-direction:column;gap:16px">
      <div class="tiles"><div class="tile"><b>${all.length}</b><span>cards rated, of ${BANK.length}</span></div>
        <div class="tile"><b>${ups}</b><span>thumbs up</span></div><div class="tile"><b>${downs}</b><span>thumbs down</span></div></div>
      <div class="pils">${pils.map((p) => `<button type="button" class="pil" data-p="${esc(p.name)}" aria-pressed="${st.pillar === p.name}">
        <span class="ph"><i class="dot" style="background:${PCOL[p.name] || "#a9a59d"}"></i>${esc(p.name)}<span class="n">${p.up} fit · ${p.down} ${p.down === 1 ? "doesn't" : "don't"}</span></span>
        <span class="split"><i class="u" style="width:${p.up / tot(p) * 100}%"></i><i class="d" style="width:${p.down / tot(p) * 100}%"></i></span>
        ${st.pillar === p.name ? `<span class="ms">${Object.entries(p.ms).sort((a, b) => (b[1][0] + b[1][1]) - (a[1][0] + a[1][1])).map(([m, [u, d]]) => `<span class="m${d ? " warn" : ""}"><span>${esc(m)}</span><b>${u} fit · ${d} ${d === 1 ? "doesn't" : "don't"}</b></span>`).join("")}</span>` : ""}
      </button>`).join("")}</div>
      <div class="row"><select id="tpil" aria-label="Pillar"><option value="">All pillars</option>${pils.map((p) => `<option ${st.pillar === p.name ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
        <select id="tsort" aria-label="Order"><option value="liked" ${st.sort === "liked" ? "selected" : ""}>Most liked first</option><option value="least" ${st.sort === "least" ? "selected" : ""}>Least liked first</option><option value="most" ${st.sort === "most" ? "selected" : ""}>Most rated first</option></select></div>
      <div class="seg" role="group" aria-label="Show">${[["all", "All"], ["up", "Fits"], ["down", "Doesn't fit"]].map(([k, l]) => `<button type="button" data-s="${k}" aria-pressed="${st.show === k}">${l}</button>`).join("")}</div>
      <div class="items">${shown.map((c) => `<div class="titem"><span>#${c.id} ${esc(c.text)}</span><span class="meta">${esc(c.pillar)} · ${esc(c.forWho.join(", "))} · ${esc(c.size)}</span>
        <span class="votes">${c.up ? `<span class="v up" title="Fits">${TH}${c.up}</span>` : ""}${c.down ? `<span class="v dn" title="Doesn't fit">${TH}${c.down}</span>` : ""}
        ${c.upBy.length ? `<span class="v who">fits: ${esc(c.upBy.join(", "))}</span>` : ""}${c.downBy.length ? `<span class="v who">doesn't fit: ${esc(c.downBy.join(", "))}</span>` : ""}</span></div>`).join("") || `<p class="sub">No cards here yet.</p>`}</div>
      ${list.length > shown.length ? `<button type="button" id="tmore">Show all ${list.length}</button>` : ""}</div>`;
    box.querySelectorAll(".pil").forEach((b) => (b.onclick = () => { st.pillar = st.pillar === b.dataset.p ? "" : b.dataset.p; st.more = false; draw(); }));
    box.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => { st.show = b.dataset.s; st.more = false; draw(); }));
    $("tpil").onchange = (e) => { st.pillar = e.target.value; st.more = false; draw(); };
    $("tsort").onchange = (e) => { st.sort = e.target.value; draw(); };
    if ($("tmore")) $("tmore").onclick = () => { st.more = true; draw(); };
  };
  draw();
}
