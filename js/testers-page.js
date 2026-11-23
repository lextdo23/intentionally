// The tester page (testers.html). Kept in its own file so the page can refuse any inline or outside script.
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
  "How did testers feel?": "checkins", "Do nudges bring people in?": "checkins", "Which words do people use, and which never?": "checkins", "Dragging the sun and moon": "checkins", "Going to sleep": "checkins", "Do the patterns feel true?": "checkins", "Is the sleep chart read?": "checkins", "Do people share with their doctor?": "checkins", "Do people use Crumbs?": "checkins", "Do people read how activities felt?": "cards",
  "How does setup go?": "setup", "How does signing up go?": "setup", "How do people get around?": "setup", "Do people add friends?": "setup", "Do people share moments?": "setup", "Which pillars and mindsets do people choose?": "setup", "How fast do people level up?": "setup", "Do people open their boxes?": "setup", "Do people open their weekly wrapped?": "checkins", "Do weekly recap reminders help?": "checkins", "Do people take photos?": "cards", "Cards waiting for you": "library", "Reports waiting for you": "reports", "How the card library is used": "library" };
const TABS = [["overview", "Overview"], ["reports", "Reports"], ["cards", "Cards"], ["library", "Library"], ["checkins", "Check-ins"], ["setup", "Setup"], ["testers", "Testers"]];
const sec = (title, ask, body, means, later) => `<section data-g="${GROUP[title] || "overview"}" class="${later ? "later" : ""}"><h2>${title}</h2><p class="ask">${ask}</p>${body}${means ? `<p class="means"><b>What this means:</b> ${means}</p>` : ""}</section>`;
const item = (q, meta, chip, look) => `<div class="item"><span>${esc(q)}</span><span class="meta">${esc(meta)}</span>${chip ? `<span class="chip ${look ? "look" : "ok"}">${esc(chip)}</span>` : ""}</div>`;
const notYet = (title, what) => sec(title, `Starts filling in once ${what} is built in the app.`, "", "", true);

// ---- Checking records before they're used ----
const BAD = Symbol("bad");
const parse = (j) => { try { return JSON.parse(j); } catch { return BAD; } };
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const isNum = Number.isFinite, isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const isArr = (x) => Array.isArray(x), arrOrNone = (x) => x == null || Array.isArray(x);
// What each level opens (same ids as UNLOCKS in levels.js).
const UNLOCK_NAMES = [["days", "Your days"], ["own", "Own card"], ["friends", "Friends"], ["library", "Card library"], ["months", "Month and Year"]];
const SHAPE = {
  level: (v) => isInt(v, 1, 9999), levels_open: (v) => isInt(v, 1, 9999), unlock: (v) => UNLOCK_NAMES.some(([id]) => id === v), level_start: (v) => isInt(v, 1, 9999), level_reset: (v) => isInt(v, 1, 9999), box_seen: (v) => isInt(v, 1, 9999),
  box_open: (v) => isObj(v) && isInt(v.n, 1, 9999) && isArr(v.c) && v.c.every(isNum) && isArr(v.x) && v.x.every((x) => ["draw", "rest", "pick", "send"].includes(x)) && (v.s == null || /^[a-z]{1,20}$/.test(v.s)) && isInt(v.p, 0, 99),
  extra_use: (v) => ["draw", "rest", "pick", "send"].includes(v),
  friend: (v) => ["ask", "accept", "decline", "cancel", "remove", "block", "unblock", "invite", "join", "find"].includes(v),
  friends_adult: (v) => v === 1, friends_add_open: (v) => v === 1, friend_profile: (v) => v === 0 || v === 1,
  share: (v) => isObj(v) && ["photo", "card", "own", "rest", "week"].includes(v.kind) && isInt(v.ago, 0, 4) && isInt(v.mood, 0, 1) && isInt(v.cap, 0, 1) && isInt(v.again, 0, 1) && ["pill", "home", "recap"].includes(v.from),
  report: (v) => isObj(v) && ["moment", "person"].includes(v.kind) && isInt(v.why, 0, 4), report_open: (v) => ["moment", "person"].includes(v),
  share_open: (v) => ["pill", "home"].includes(v), see: (v) => v === 0 || v === 1, unshare: (v) => v === 1, hide: (v) => v === 1, unhide: (v) => v === 1, grid_open: (v) => v === 1, photo_backed: (v) => v === 1, photo_backup: (v) => v === "on" || v === "off", photo_backup_note: (v) => v === 1, photo_backup_wait: (v) => ["daily_limit", "photos_full", "photos_off"].includes(v), friends_list: (v) => v === 1,
  friend_set: (v) => isObj(v) && Object.keys(v).every((k) => ["requests", "count", "mood"].includes(k)) && Object.values(v).every((x) => x === 0 || x === 1),
  profile: (v) => isObj(v) && isInt(v.name, 0, 1) && isInt(v.season, 0, 1),
  card_draw: arrOrNone, card_redraw: arrOrNone, helps_seen: arrOrNone, pick_pillars: arrOrNone,
  card_keep: (v) => isObj(v) && isNum(v.id),
  card_how: (v) => isObj(v) && isNum(v.id) && isInt(v.how, 0, 4),
  card_felt: (v) => isObj(v) && isNum(v.id) && isArr(v.f) && v.f.every((i) => isInt(i, 0, 9)),
  card_thumb: (v) => isObj(v) && isNum(v.id) && isNum(v.v) && arrOrNone(v.m),
  card_smaller: (v) => isObj(v) && isNum(v.from),
  own_card: (v) => isObj(v) && typeof v.p === "string" && v.p.length < 30 && isArr(v.f) && v.f.every((i) => isInt(i, 0, 9)) && isInt(v.deck, 0, 1),
  pick_mindset: (v) => v == null || (isObj(v) && arrOrNone(v.m)),
  acts_seen: (v) => ["worth", "moment", "both", "lift", "empty"].includes(v), acts_open: (v) => v == null, lifts_view: (v) => v === "any" || v === "harder",
  lifts_seen: (v) => isObj(v) && isInt(v.any, 0, 3) && isInt(v.harder, 0, 3),
  doctor_open: (v) => v == null,
  crumbs_offer: (v) => v == null, crumb_open: (v) => v == null, crumb_delete: (v) => v == null,
  crumbs_on: (v) => ["offer", "settings", "off", "later"].includes(v), crumbs_seen: (v) => isInt(v, 1, 20),
  crumb_add: (v) => isObj(v) && isInt(v.n, 0, 1), crumb_edit: (v) => isObj(v) && isInt(v.n, 0, 1),
  doctor_made: (v) => isObj(v) && isInt(v.d, 1, 84) && typeof v.p === "string" && /^m?s?a?h?$/.test(v.p) && isInt(v.t, 0, 1) && isInt(v.n, 0, 1),
  sleep_seen: (v) => ["up", "range", "down", "none", "steady", "empty"].includes(v), sleep_view: (v) => v === "hours" || v === "date",
  repick: (v) => v === "pick" || v === "later", repick_shown: (v) => isObj(v) && isInt(v.gone, 0, 20),
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
  // Reports show even before there are testers: they come from everyone using friends, not just testers.
  if (!T) { $("out").innerHTML = `<p class="sub">No testers yet. Send testers the invite link: <b>https://daydeck.day/?tester</b></p>` + reportsSec().replace(/ data-g="reports"/, ""); reportsView(); return; }

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

  // 9b. Mood and sleep card (alex 2026-11-22)
  const sk = {}; by("sleep_seen").forEach((e) => (sk[e.val] = (sk[e.val] || 0) + 1));
  const KIND = { up: "Best days after X hours or more", range: "Best days after X to Y hours", down: "Best days after under X hours", none: "No clear link yet", steady: "Sleep has been steady", empty: "Still filling in" };
  const sv = { hours: 0, date: 0 }; by("sleep_view").forEach((e) => (sv[e.val] = (sv[e.val] || 0) + 1));
  html += sec("Is the sleep chart read?", "What the Mood and sleep card told testers, and whether they slid across it, switched order or opened a day from it.",
    by("sleep_seen").length ? `${bars(Object.keys(KIND).map((k) => [KIND[k], sk[k] || 0]))}<div style="height:16px"></div>${bars([["Slid across the nights", who("sleep_slide")], ["Opened a day from it", who("sleep_day_open")], ["Switched to By date", who("sleep_view")], ["Followed the link to What seems to help", who("sleep_to_helps")]], T)}
     <p class="note">Switches: By date ${sv.date}, back to By hours ${sv.hours}.</p>` : `<p class="sub">Nobody has opened Your days since the new sleep chart.</p>`,
    "if hardly anyone slides across or opens a day, the chart is being read at a glance only, which is fine. Lots of 'No clear link' means people's moods hang on other things, or need more nights.");

  // 9c. How activities felt (alex 2026-11-22): Mood and activities, What lifts you, Getting easier
  const ak = {}; by("acts_seen").forEach((e) => (ak[e.val] = (ak[e.val] || 0) + 1));
  const AK = { worth: "Hard to do, but the day went well", moment: "Helped in the moment, on lower days", both: "Lifted you, and the days went well", lift: "Lifted you most", empty: "Still filling in" };
  const hardSide = by("lifts_seen").filter((e) => e.val && e.val.harder > 0).length;
  html += sec("Do people read how activities felt?", "What the Mood and activities card told testers, and whether they opened a pillar's cards or the Harder days side of What lifts you.",
    by("acts_seen").length ? `${bars(Object.keys(AK).map((k) => [AK[k], ak[k] || 0]))}<div style="height:16px"></div>${bars([["Opened a pillar's cards", who("acts_open")], ["Switched to Harder days", who("lifts_view")]], T)}
     <p class="note">Times What lifts you had a Harder days side to show: ${hardSide}.</p>` : `<p class="sub">Nobody has opened Your days since these cards arrived.</p>`,
    "lots of 'Still filling in' means people answer few cards. If nobody opens Harder days, it may need a gentler way in.");

  const made = by("doctor_made").filter((e) => e.val);
  const partN = (c) => made.filter((e) => e.val.p.includes(c)).length;
  html += sec("Do people share with their doctor?", "Who opened Share with your doctor, who made the summary, and what they put in it. Never what it said.",
    by("doctor_open").length ? `${bars([["Opened it", who("doctor_open")], ["Made a summary", who("doctor_made")]], T)}
     ${made.length ? `<div style="height:16px"></div>${bars([["Mood and feelings", partN("m")], ["Sleep", partN("s")], ["Activities", partN("a")], ["Health notes", partN("h")], ["Added things to talk about", made.filter((e) => e.val.t).length], ["Put their name on it", made.filter((e) => e.val.n).length]], made.length)}
     <p class="note">Summaries made: ${made.length}. Usual length: ${Math.round(made.map((e) => e.val.d).sort((a, b) => a - b)[Math.floor(made.length / 2)])} days.</p>` : ""}` : `<p class="sub">Nobody has opened Share with your doctor yet.</p>`,
    "lots of opens but few summaries could mean the screen asks too much. If health notes are rarely added, that's fine: they're off unless chosen.");

  // Crumbs (alex 2026-11-23): only that things happened, and whether words were added. Never the face or the words.
  const onFrom = (x) => new Set(by("crumbs_on").filter((e) => e.val === x).map((e) => e.code)).size;
  const added = by("crumb_add").filter((e) => e.val);
  html += sec("Do people use Crumbs?", "Who was offered Crumbs, who turned it on, and who drops crumbs and sees them when ending the day. Never which face or what they wrote.",
    by("crumbs_offer").length || by("crumbs_on").length ? `${bars([["Offered it", who("crumbs_offer")], ["Turned it on from the offer", onFrom("offer")], ["Turned it on in Settings", onFrom("settings")], ["Said not now", onFrom("later")], ["Turned it off", onFrom("off")]], T)}
     <div style="height:16px"></div>${bars([["Dropped a crumb", who("crumb_add")], ["Saw their crumbs when ending the day", who("crumbs_seen")], ["Changed or removed one", new Set(by("crumb_edit").concat(by("crumb_delete")).map((e) => e.code)).size]], T)}
     <p class="note">Crumbs dropped: ${added.length}. With words: ${added.filter((e) => e.val.n).length}.</p>` : `<p class="sub">Nobody has been offered Crumbs yet.</p>`,
    "lots of 'not now' is fine: it's for people who find ending the day hard. If people turn it on but rarely drop crumbs, the button may be hard to find.");

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
  // The card library (alex 2026-11-18): cards people chose to show to everyone wait here for alex's Yes or No.
  // The waiting list comes straight from the service (libraryView), not from tester data.
  // Reports (social step 5): what friends reported, for alex to look at. Typed words only ever go on the page as text.
  html += reportsSec();
  html += sec("Cards waiting for you", "Cards people chose to show to everyone. Fix the words if you need to, then say Yes or No. Only Yes cards are ever shown, and the maker only hears back on a Yes.",
    `<details class="rules"><summary>Your rules for checking</summary><p class="note"><b>Say No if the card:</b> is rude, cruel, sexual, or mentions drugs or getting drunk · could hurt someone (risky stunts, extreme fasting, pushing past pain) · mentions calories, weight, or good and bad food · names a real person, phone number, address, @handle or website · is an ad or tells you to buy something · is a joke or nonsense, not something you could do · talks about self-harm or suicide (never public).</p><p class="note"><b>Fix and say Yes if:</b> it has spelling or grammar slips · it's too long (trim to one clear action). Things like a partner, a car or a coffee are fine; a trip overseas isn't.</p></details><div id="libq"><p class="sub">Loading…</p></div>`, "");
  { const opens = by("lib_open").length, views = by("lib_view").length, adds = by("lib_add"), shares = by("lib_share"), ups = by("lib_up").length, removes = by("lib_remove").length;
    const addP = {}; adds.forEach((e) => { const p = e.val && e.val.p; if (typeof p === "string" && p.length < 30) addP[p] = (addP[p] || 0) + 1; });
    html += sec("How the card library is used", "From testers only: opening Cards, looking at a card, adding it, sharing their own, and thumbs up. Never what anyone wrote.",
      opens ? bars([["Opened Cards", opens], ["Looked at a library card", views], ["Added one to their deck", adds.length], ["Took one back out", removes], ["Shared a card they made", shares.length], ["Gave a thumbs up", ups]], Math.max(opens, views)) +
        (adds.length ? `<p class="note">Cards added, by pillar:</p>` + bars(Object.entries(addP).sort((a, b) => b[1] - a[1])) : "")
      : `<p class="sub">No tester has opened Cards yet.</p>`,
      "lots of looking but little adding means the library cards don't fit yet; shared cards show which pillars people feel the deck is missing."); }
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

  // Accounts (alex 2026-11-20): the sign-up screens. Only steps and choices; never an email, username or code.
  { const people = (n, f = () => true) => new Set(by(n).filter(f).map((e) => e.code)).size;
    const opened = people("signup_open");
    const steps = [["Saw Keep your days safe", opened], ["Got a code", people("signup_step", (e) => e.val === "code")],
      ["Picked a username", people("signup_step", (e) => e.val === "faceid")], ["Made an account", people("signup_done", (e) => e.val === "new")]];
    const face = {}; by("signup_faceid").forEach((e) => (face[e.val] = (face[e.val] || 0) + 1));
    const errs = {}; by("signup_error").forEach((e) => { if (typeof e.val === "string" && e.val.length < 30) errs[e.val] = (errs[e.val] || 0) + 1; });
    const pics = {}; by("avatar").forEach((e) => { if (typeof e.val === "string" && e.val.length < 20) pics[e.val] = (pics[e.val] || 0) + 1; });
    html += sec("How does signing up go?", "The sign-up screens (test mode only for now): email, code, username, Face ID. How far people get, who carries on without an account, and which pictures they pick. Never anyone's email, username or code.",
      opened ? bars(steps, opened) +
        `<p class="note">Carried on without an account: ${people("signup_without", (e) => e.val === "yes")}. Got back into an account they already had: ${people("signup_done", (e) => e.val === "back_in")}. Face ID: added ${face.yes || 0}, not now ${face.not_now || 0}, stopped part way ${face.stopped || 0}. Signed in with Face ID later: ${by("signin").filter((e) => e.val === "ok").length}. Signed out: ${by("signout").length}. Deleted their account: ${by("account_delete").length}.</p>` +
        `<p class="note">Things that went wrong: ${Object.entries(errs).map(([k, n]) => `${esc(k)} ${n}`).join(", ") || "nothing"}.</p>` +
        `<p class="note">Backups: first ones ${by("sync").filter((e) => e.val === "first").length}, since then ${by("sync").filter((e) => e.val === "ok").length}, changes brought in from another phone ${by("sync_in").length}, phones emptied and signed out (backup kept) ${by("sync").filter((e) => e.val === "cleared").length}. Problems: ${(() => { const c = {}; by("sync_error").forEach((e) => { if (typeof e.val === "string" && e.val.length < 30) c[e.val] = (c[e.val] || 0) + 1; }); return Object.entries(c).map(([k, n]) => `${esc(k)} ${n}`).join(", ") || "none"; })()}.</p>` +
        (Object.keys(pics).length ? `<p class="note">Pictures picked:</p>` + bars(Object.entries(pics).sort((a, b) => b[1] - a[1])) : "")
      : `<p class="sub">Nobody has seen the sign-up yet.</p>`,
      "lots stopping at the code means emails are slow or landing in junk; lots choosing \"without an account\" means the first screen doesn't explain why it helps."); }

  // The glass pill (social stage 1, alex 2026-11-20): which tabs people open. Test mode only for now.
  { const t = {}; by("tab").forEach((e) => { if (["today","friends","you"].includes(e.val)) t[e.val] = (t[e.val] || 0) + 1; });
    const n = Object.values(t).reduce((a, b) => a + b, 0);
    html += sec("How do people get around?", "Taps on the glass pill's tabs: Today, Friends and You (test mode only while friends are being built).",
      n ? bars([["Today", t.today || 0], ["Friends", t.friends || 0], ["You", t.you || 0]], n) : `<p class="sub">Nobody has used the pill yet.</p>`,
      "lots of Friends taps means people want it; very few means it can wait."); }
  // Photo backup: how many photos went up, who turned it off, and any limits reached.
  { const up = by("photo_backed").length, offs = by("photo_backup").filter((e) => e.val === "off").length, ons = by("photo_backup").filter((e) => e.val === "on").length, waits = by("photo_backup_wait");
    html += sec("Is photo backup working?", "Photos backed up to people's accounts (privately; you never see them), and anyone who turned it off.",
      `<p class="note">${up} photos backed up. Turned off: ${offs} (turned back on: ${ons}). Saw the one-time note: ${by("photo_backup_note").length}. Limits reached: ${waits.length ? waits.map((e) => e.val.replace("_", " ")).join(", ") : "none"}.</p>`,
      "lots of people turning it off means the note or the reason isn't landing; \"photos full\" means it's time to raise the 50 GB ceiling."); }
  // Friends (social step 2): what people do, never who or what they typed.
  { const f = {}; by("friend").forEach((e) => (f[e.val] = (f[e.val] || 0) + 1));
    const who = (n) => new Set(by(n).map((e) => e.code)).size;
    const adults = who("friends_adult"), askers = new Set(by("friend").filter((e) => ["ask", "invite", "accept"].includes(e.val)).map((e) => e.code)).size;
    const prof = {}; by("profile").forEach((e) => (prof[e.code] = e.val)); const P = Object.values(prof);
    const quiet = {}; by("friend_set").forEach((e) => { for (const [k, v] of Object.entries(e.val || {})) if (v === 0) quiet[k] = (quiet[k] || 0) + 1; });
    html += sec("Do people add friends?", "Friends opens at level 4. Only what people do is counted: never names, usernames or what they type.",
      adults ? bars([["Requests sent", f.ask || 0], ["Accepted", f.accept || 0], ["Not now", f.decline || 0], ["Invite links shared", f.invite || 0], ["Invite links opened", f.join || 0], ["Removed a friend", f.remove || 0], ["Blocked someone", f.block || 0]]) +
        `<p class="note">${adults} ticked "I'm 18 or over"; ${askers} have reached out to someone. Profiles edited: ${P.length} (${P.filter((v) => v.name).length} with a name, ${P.filter((v) => v.season).length} with a This season line). Turned requests off: ${quiet.requests || 0}. Hid their friends count: ${quiet.count || 0}.</p>`
        : `<p class="sub">Nobody has opened Friends yet.</p>`,
      "lots of ticks but few requests means adding friends is too hard, or people aren't sure who to add. Blocks are worth a look if they climb."); }
  // Moments (social step 3): what kind of thing, and whether words or a mood came with it. Never the words.
  { const sh = by("share"), opens = by("share_open"), n = sh.length;
    const k = {}; sh.forEach((e) => (k[e.val.kind] = (k[e.val.kind] || 0) + 1));
    const pct = (f) => (n ? Math.round(100 * sh.filter(f).length / n) + "%" : "–");
    const sees = by("see").filter((e) => e.val === 1).length, from = (w) => opens.filter((e) => e.val === w).length;
    html += sec("Do people share moments?", "Shares from Share a moment (in the pill), Share with friends (under a done card) and Share to profile (at the end of the weekly recap). Only what kind of thing was shared, never the words.",
      opens.length ? bars([["Their photo", k.photo || 0], ["Their card", k.card || 0], ["A card they made", k.own || 0], ["A rest day", k.rest || 0], ["Their week's card (from the recap)", k.week || 0]], n || 1) +
        `<p class="note">Opened ${opens.length} times (${from("pill")} from the pill, ${from("home")} from under the card); shared ${n} (${opens.length ? Math.round(100 * n / opens.length) : 0}% of opens). With a caption: ${pct((e) => e.val.cap)}. With how the day felt: ${pct((e) => e.val.mood)}. From an earlier day: ${pct((e) => e.val.ago > 0)}. "I see you" said ${sees} times. Moments removed: ${by("unshare").length}. Friends' moments hidden: ${by("hide").length}. Grids opened: ${by("grid_open").length}. Friends list opened: ${by("friends_list").length}.</p>`
        : `<p class="sub">Nobody has shared a moment yet.</p>`,
      "many opens but few shares means the share screen asks too much; lots of hides means feeds feel noisy."); }

  // Which pillars and mindsets
  const lastPick = {}; by("pick_pillars").forEach((e) => (lastPick[e.code] = e.val || []));
  const pc = {}; Object.values(lastPick).forEach((l) => l.forEach((n) => (pc[n] = (pc[n] || 0) + 1)));
  const mc = {}, other = {}, kinds = {}; const lastM = {};
  by("pick_mindset").forEach((e) => { if (e.val && e.val.p && e.val.p !== "Own") lastM[e.code + "|" + e.val.p] = e.val; });
  Object.values(lastM).forEach((v) => { (v.m || []).forEach((m) => (mc[v.p + " · " + m] = (mc[v.p + " · " + m] || 0) + 1)); if (v.other) other[v.p] = (other[v.p] || 0) + 1; if (v.kind) kinds[v.kind] = (kinds[v.kind] || 0) + 1; });
  // Outdoors, Learn, Give, Food and Money are set aside for now (alex 2026-11-19); they show only if someone picked them before.
  const PILL = ["Friends", "Family", "Love", "Community", "Move", "Rest", "Work and study", "Play and create", "Meaning", "Self", "Own"]
    .concat(["Outdoors", "Learn", "Give", "Food", "Money"].filter((n) => pc[n]));
  const N = Object.keys(lastPick).length;
  html += sec("Which pillars and mindsets do people choose?", `Each tester's latest choice (${N} so far). "Own" is a pillar they named themselves; the name is never sent.`,
    N ? bars(PILL.map((n) => [n === "Own" ? "Their own pillar" : n, pc[n] || 0]).sort((a, b) => b[1] - a[1]), N) +
      `<details><summary class="note" style="cursor:pointer;min-height:44px;display:flex;align-items:center">Show where people are at, per pillar</summary>${bars(Object.entries(mc).sort((a, b) => b[1] - a[1]))}</details>
       <p class="note">"Something else" picked (before it was taken out on 20 Nov): ${Object.entries(other).map(([k, n]) => `${esc(k)} ${n}`).join(", ") || "never"}. Kinds of moving: ${Object.entries(kinds).map(([k, n]) => `${esc(k)} ${n}`).join(", ") || "none picked"}.</p>`
    : `<p class="sub">Nobody has chosen pillars yet.</p>`,
    "pillars nobody picks can be cut or merged.");
  // Pillars and mindsets were reworked on 20 Nov: people with old answers are asked once to pick again.
  { const shown = new Set(by("repick_shown").map((e) => e.code)).size, again = new Set(by("repick").filter((e) => e.val === "pick").map((e) => e.code)).size,
      later = new Set(by("repick").filter((e) => e.val === "later").map((e) => e.code)).size, lost = by("repick_shown").filter((e) => e.val && e.val.gone > 0).length;
    html += sec("Picking again after the rework", "On 20 Nov the pillars and where-you're-at answers changed. Testers with old answers are asked once to pick again.",
      shown ? `<p class="note">Asked: ${shown}. Picked again: ${again}. Said not now: ${later}. Had a pillar that's now set aside: ${lost}.</p>` : `<p class="sub">Nobody has been asked yet.</p>`,
      "lots of \"not now\" means the screen feels like a chore; check their decks still have enough cards."); }
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
        `<p class="note">Usually reached: level 2 on ${day(2)}, level 3 on ${day(3)}, level 5 on ${day(5)}, level 10 on ${day(10)}. Planned for a usual week: level 2 on day 1, level 3 by day 3, level 5 by day 8, level 10 by day 28.</p>` +
        `<p class="note">New things opened by a level (testers who joined after 18 Nov): ${UNLOCK_NAMES.map(([id, nm]) => `${nm} ${new Set(by("unlock").filter((e) => e.val === id).map((e) => e.code)).size}`).join(", ")}. Your levels page opened ${by("levels_open").length} time${by("levels_open").length === 1 ? "" : "s"} by ${who("levels_open")} tester${who("levels_open") === 1 ? "" : "s"}.</p>`
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

  // Weekly recap reminders (alex 2026-11-22): Sunday's heads-up ("Weekly recap tonight", before ending the day) and
  // Monday's catch-up ("Weekly recap ready", only if it's still waiting). Sent, tapped, and recaps opened from a tap.
  { const n = (what, k) => by("nudge_" + what).filter((e) => e.val === k).length;
    const sun = [n("sent", "recap-sun"), n("tap", "recap-sun")], mon = [n("sent", "recap-mon"), n("tap", "recap-mon")];
    html += sec("Do weekly recap reminders help?", "Sunday's reminder arrives at the evening nudge time (7pm if evenings are off) until the day is ended. Monday's arrives at the morning nudge time (8am if mornings are off), only if the recap is still waiting. How many were sent and tapped, and recaps opened straight from Monday's.",
      sun[0] || mon[0] ? `<p class="note">Sunday: Weekly recap tonight</p>${bars([["Sent", sun[0]], ["Tapped", sun[1]]], Math.max(1, sun[0]))}
        <p class="note">Monday: Weekly recap ready</p>${bars([["Sent", mon[0]], ["Tapped", mon[1]], ["Recap opened from it", by("wrap_from_nudge").length]], Math.max(1, mon[0]))}`
      : `<p class="sub">None sent yet. The first go out on a tester's first Sunday from day 7, if they have morning or evening nudges on.</p>`,
      "if many Monday reminders go out, people aren't ending Sunday, so Sunday's words or time need a rethink; if few are tapped, the reminders may be noise."); }

  // Weekly wrapped (from 17 Nov): ready vs opened vs finished, where people stop, the guess, what they keep, sharing.
  { const ready = who("wrap_ready"), opened = who("wrap_open"), fin = who("wrap_done");
    const quits = {}; by("wrap_quit").forEach((e) => (quits[e.val || "?"] = (quits[e.val || "?"] || 0) + 1));
    const SCR = { name: "1 Name of the week", best: "2 Guess your best day", find: "3 Something we noticed", works: "4 What works for you", next: "5 Shape next week", poster: "6 Your week on a card", share: "7 Share it" };
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

  // Photos of the daily card (from 18 Nov). Only that a photo was added, changed or removed, never the picture.
  { const off = who("photo_offer"), add = who("photo_add"), cam = by("photo_add").filter((e) => e.val === "cam").length, lib = by("photo_add").filter((e) => e.val === "lib").length;
    const views = {}; by("photos_view").forEach((e) => { const v = e.val && e.val.v; if (v) views[v] = (views[v] || 0) + 1; });
    html += sec("Do people take photos?", "Testers offered \"Add a photo\" after doing their card, who added one, and how they took it. Then whether people look back at them. Only the fact that a photo was added is sent, never the photo.",
      off || add ? bars([["Were offered a photo", off], ["Added one", add], ["Opened Your photos", who("photos_open")]], Math.max(off, add)) +
        `<p class="note">Photos added: ${by("photo_add").length} (camera ${cam}, from their photos ${lib}). Offered ${by("photo_offer").length} times. Changed ${by("photo_change").length}, removed ${by("photo_remove").length}.</p>` +
        `<p class="note">Your photos opened ${by("photos_open").length} times, a photo opened ${by("photo_open").length} times, its day slid up ${by("photo_info").length} times. Zoom picked: ${Object.entries(views).map(([k, n]) => `${esc(k)} ${n}`).join(", ") || "never"}.</p>` +
        `<p class="note">Camera not allowed: ${by("photo_cam_denied").length}. Card words turned off: ${by("photo_words").filter((e) => e.val === "off").length}. Shared a photo ${by("photo_share").length}, saved all ${by("photos_save").length}. Copies saved with photos in them: ${by("save_copy").filter((e) => e.val > 0).length}; restores that brought photos back: ${by("restore").filter((e) => e.val > 0).length}. iPhone agreed to keep the photos: ${by("photo_keep").filter((e) => e.val === "yes").length} of ${by("photo_keep").length}.</p>`
      : `<p class="sub">No photos yet. "Add a photo" shows after a tester does their card.</p>`,
      "few photos after lots of offers means it isn't wanted or is too fiddly; lots of \"camera not allowed\" means the ask needs explaining first; photos added but never looked at means the record isn't the draw."); }

  // 12. Safety
  html += sec("Safety", "Counts only, never tied to anything a tester wrote. For the safety reviewer.",
    bars([["\"Need to talk to someone?\" tapped", by("lifeline_tap").length], ["Testers who tapped it", who("lifeline_tap")]]), "");

  // Testers table + actions
  const fmt = (t) => new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  html += `<section data-g="testers"><h2>Testers</h2><p class="ask">Everyone sharing with you.</p><p class="note">${testers.length} of ${PLACES} places used. The service takes up to ${PLACES} testers; remove someone to free a place.</p>${removedMsg ? `<p class="sub" aria-live="polite">${esc(removedMsg)}</p>` : ""}
    <div class="items">${testers.map((t) => `<div class="tcard" data-code="${esc(t.code)}"><div class="ttop"><div class="who"><b>${esc(t.code)}</b>
      <span>${esc(t.phone || "")} · app ${esc(t.version || "?")} · joined ${fmt(t.joined)} · last sent ${fmt(t.seen)} · ${Object.keys(days[t.code] || {}).length} days noted</span></div>
      <button class="rm">Remove</button></div></div>`).join("")}</div>
    <p class="note">Invite link for testers: https://daydeck.day/?tester</p></section>`;
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
  libraryView();
  reportsView();
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
  Food: "#cfc59b", "Work and study": "#cfc59b", Money: "#cfc59b", Rest: "#a9b9d6", Learn: "#a9b9d6", "Play and create": "#c4b4c9", Give: "#c4b4c9", Meaning: "#c4b4c9",
  Self: "#a9c9cf" };
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

// ---------------- The card library: cards waiting for alex ----------------
// Everything here is typed by people, so it's only ever put on the page as text (esc / textContent), never as HTML.
const ago = (t) => { const d = Math.round((Date.now() - t) / 864e5); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
async function libraryView() {
  const box = $("libq"); if (!box) return;
  let q, list;
  try {
    const [a, b] = await Promise.all([fetch(`${SERVICE}/l/queue`, { headers: { Authorization: "Bearer " + pw } }), fetch(`${SERVICE}/l/list`)]);
    if (!a.ok) throw new Error(a.status);
    q = await a.json(); list = b.ok ? await b.json() : { cards: [] };
  } catch { box.innerHTML = `<p class="sub">Couldn't load the waiting cards. Check you're online and reload.</p>`; return; }
  const ups = {}; (list.cards || []).forEach((c) => (ups[c.id] = c.up || 0));
  const PILS = Object.keys(PCOL);
  const draw = () => {
    const wait = q.wait || [], done = (q.done || []).slice(0, 30);
    box.innerHTML = `<div class="items">${wait.length ? "" : `<p class="sub">Nothing waiting. New cards show here when someone shares one.</p>`}</div>
      ${done.length ? `<p class="note" style="margin-top:16px">Checked lately:</p><div class="items done"></div>` : ""}`;
    const items = box.querySelector(".items");
    wait.forEach((c) => {
      const el = document.createElement("div"); el.className = "lcard";
      el.innerHTML = `<p class="meta"><i class="dot"></i><span class="m"></span></p>
        <label class="note">Card<textarea rows="2" maxlength="90" class="lt"></textarea></label>
        <div class="row"><label class="note" style="flex:1 1 160px">Name on card<input class="ln" maxlength="24" placeholder="Anonymous daydeck user"></label>
          <label class="note" style="flex:1 1 140px">Pillar<select class="lp">${PILS.map((p) => `<option>${esc(p)}</option>`).join("")}</select></label></div>
        <div class="row two"><button class="no">No</button><button class="main yes">Yes</button></div><p class="note msg" aria-live="polite"></p>`;
      el.querySelector(".dot").style.background = PCOL[c.pillar] || "#a9a59d";
      el.querySelector(".m").textContent = `${c.pillar}${c.mind && c.mind.length ? " · " + c.mind.join(", ") : ""} · ${ago(c.t)}`;
      el.querySelector(".lt").value = c.text; el.querySelector(".ln").value = c.name || ""; el.querySelector(".lp").value = PILS.includes(c.pillar) ? c.pillar : "Friends";
      const answer = async (ok) => {
        const body = { id: c.id, ok, text: el.querySelector(".lt").value.trim(), name: el.querySelector(".ln").value.trim(), pillar: el.querySelector(".lp").value };
        if (ok && !body.text) { el.querySelector(".msg").textContent = "The card needs some words."; return; }
        el.querySelectorAll("button").forEach((b) => (b.disabled = true));
        const res = await fetch(`${SERVICE}/l/review`, { method: "POST", headers: { Authorization: "Bearer " + pw, "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
        if (!res || !res.ok) { el.querySelector(".msg").textContent = "Couldn't save. Check you're online and try again."; el.querySelectorAll("button").forEach((b) => (b.disabled = false)); return; }
        q.wait = q.wait.filter((x) => x.id !== c.id);
        q.done = [Object.assign({}, c, ok ? { text: body.text, name: body.name, pillar: body.pillar } : {}, { state: ok ? "in" : "no", seen: Date.now() })].concat(q.done || []);
        draw();
      };
      el.querySelector(".yes").onclick = () => answer(true);
      el.querySelector(".no").onclick = () => answer(false);
      items.append(el);
    });
    const dl = box.querySelector(".items.done");
    if (dl) done.forEach((c) => {
      const el = document.createElement("div"); el.className = "item";
      el.innerHTML = `<span class="t"></span><span class="meta"></span><span class="chip"></span>`;
      el.querySelector(".t").textContent = c.text;
      el.querySelector(".meta").textContent = `${c.pillar} · ${c.name || "Anonymous daydeck user"} · ${ago(c.seen || c.t)}${c.state === "in" ? ` · ${ups[c.id] || 0} thumbs up` : ""}`;
      const chip = el.querySelector(".chip"); chip.textContent = c.state === "in" ? "Yes" : "No"; chip.classList.add(c.state === "in" ? "ok" : "look");
      dl.append(el);
    });
  };
  draw();
}

// ---------------- Reports: what friends reported ----------------
// Reports (social step 5): what friends reported, for alex to look at. Typed words only ever go on the page as text.
function reportsSec() {
  return sec("Reports waiting for you", "Things people reported from the ••• on a friend's moment or profile. The person reported is never told who reported them. A moment reported by three people is already held back from feeds until you answer.",
    `<details class="rules"><summary>Your rules for reports</summary><p class="note">These follow the <a href="guidelines.html" target="_blank" rel="noopener">Friends guidelines</a> people agree to. <b>Remove the moment</b> if it's cruel, bullying, hateful, sexual, violent, about drugs or getting drunk, shows or encourages self-harm, suicide or disordered eating (weights, calories, before and after), or shares someone else's private details or a photo of them they wouldn't want shared. <b>Pause their sharing</b> if they keep doing it, or the account looks fake or spammy. <b>Keep it</b> if it's just something the reporter didn't like. For "They might not be safe": the reporter has already been shown 000 and Lifeline; keep the moment unless it encourages self-harm.</p></details><div id="repq"><p class="sub">Loading…</p></div>`, "");
}
const WHY = { hurtful: "Hurtful, bullying or hateful", sexual: "Sexual or violent", risk: "They might not be safe", spam: "Spam or a fake account", else: "Something else" };
const STATE = { kept: ["Kept", "ok"], removed: ["Removed", "look"], paused: ["Sharing paused", "look"] };
async function reportsView() {
  const box = $("repq"); if (!box) return;
  let q;
  try { const a = await fetch(`${SERVICE}/t/reports`, { headers: { Authorization: "Bearer " + pw } }); if (!a.ok) throw new Error(a.status); q = await a.json(); if (!Array.isArray(q.open) || !Array.isArray(q.done)) throw new Error("shape"); }
  catch { box.innerHTML = `<p class="sub">Couldn't load reports. Check you're online and reload.</p>`; return; }
  const tabBtn = document.querySelector('.ttabs [data-tab="reports"]');
  if (tabBtn && q.open.length) tabBtn.textContent = `Reports (${q.open.length})`;
  const what = (r) => {
    const s = r.snap || {}, wrap = document.createElement("div"); wrap.className = "rsnap";
    if (r.moment) {
      if (r.photo) { const im = document.createElement("img"); im.alt = "The reported photo"; im.src = r.photo; wrap.append(im); }
      else if (s.kind === "photo" || s.kind === "week") { const p = document.createElement("p"); p.className = "note"; p.textContent = "(The photo was let go after review.)"; wrap.append(p); }
      if (s.text) { const p = document.createElement("p"); p.className = "rtext"; p.textContent = s.text; wrap.append(p); }
      if (s.kind === "rest") { const p = document.createElement("p"); p.className = "rtext"; p.textContent = "A rest day"; wrap.append(p); }
      if (s.cap) { const p = document.createElement("p"); p.textContent = `Caption: "${s.cap}"`; wrap.append(p); }
      if (s.mood) { const p = document.createElement("p"); p.className = "note"; p.textContent = `Felt ${s.mood}${s.feel && s.feel.length ? " · " + s.feel.join(", ") : ""}`; wrap.append(p); }
    } else {
      const p = document.createElement("p"); p.textContent = `Their profile: name "${(s.profile || {}).name || "(none)"}", This season "${(s.profile || {}).season || "(none)"}".`; wrap.append(p);
      if (r.photo) { const im = document.createElement("img"); im.alt = "Their profile photo"; im.src = r.photo; wrap.append(im); const n = document.createElement("p"); n.className = "note"; n.textContent = "Their profile photo. Pausing their sharing also hides it from friends (they see the smile)."; wrap.append(n); }
    }
    return wrap;
  };
  const draw = () => {
    box.innerHTML = `<div class="items open">${q.open.length ? "" : `<p class="sub">Nothing waiting. New reports show here, and you'll get an email at hello@daydeck.day.</p>`}</div>
      ${q.done.length ? `<p class="note" style="margin-top:16px">Answered lately (kept for 90 days):</p><div class="items done"></div>` : ""}`;
    const items = box.querySelector(".items.open");
    q.open.forEach((r) => {
      const el = document.createElement("div"); el.className = "lcard";
      el.innerHTML = `<p class="meta"><span class="m"></span></p><p class="who"></p><div class="w"></div><p class="rnote"></p>
        <div class="row two"><button class="keep">Keep it</button>${r.moment && r.still ? `<button class="main remove">Remove the moment</button>` : ""}</div>
        <button class="pause"></button><p class="note msg" aria-live="polite"></p>`;
      el.querySelector(".m").textContent = `${WHY[r.why] || r.why} · ${ago(r.at)} · reported by @${r.by}${r.held ? " · held back from feeds" : ""}`;
      el.querySelector(".who").textContent = `${r.moment ? "A moment by" : "The account"} @${r.who}${r.about > 1 ? ` · ${r.about} reports about them so far` : ""}${r.moment && !r.still ? " · they've since removed it" : ""}`;
      el.querySelector(".w").append(what(r));
      const n = el.querySelector(".rnote"); if (r.note) n.textContent = `Their words: "${r.note}"`; else n.remove();
      el.querySelector(".pause").textContent = r.paused ? "Let them share again" : "Pause their sharing";
      const act = async (a) => {
        el.querySelectorAll("button").forEach((b) => (b.disabled = true));
        const res = await fetch(`${SERVICE}/t/report`, { method: "POST", headers: { Authorization: "Bearer " + pw, "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, act: a }) }).catch(() => null);
        if (!res || !res.ok) { el.querySelector(".msg").textContent = "Couldn't save. Check you're online and try again."; el.querySelectorAll("button").forEach((b) => (b.disabled = false)); return; }
        reportsView();
      };
      el.querySelector(".keep").onclick = () => act("keep");
      const rm = el.querySelector(".remove"); if (rm) rm.onclick = () => act("remove");
      el.querySelector(".pause").onclick = () => act(r.paused ? "unpause" : "pause");
      items.append(el);
    });
    const dl = box.querySelector(".items.done");
    if (dl) q.done.forEach((r) => {
      const el = document.createElement("div"); el.className = "item";
      el.innerHTML = `<span class="t"></span><span class="meta"></span><span class="chip"></span>`;
      el.querySelector(".t").textContent = `@${r.who}: ${(r.snap && (r.snap.cap || r.snap.text)) || (r.moment ? "a moment" : "their account")}`;
      el.querySelector(".meta").textContent = `${WHY[r.why] || r.why} · reported by @${r.by} · answered ${ago(r.done || r.at)}${r.paused ? " · still paused" : ""}`;
      const [label, look] = STATE[r.state] || [r.state, "ok"], chip = el.querySelector(".chip"); chip.textContent = label; chip.classList.add(look);
      dl.append(el);
    });
  };
  draw();
}
