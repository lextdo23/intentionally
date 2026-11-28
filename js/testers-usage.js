// Usage tab on the tester page (alex 2026-11-26): the technical side of how testers use Daydeck. How long each
// person has been on it, how often they open it, how long each visit lasts, what they do each time, whether
// they come back, and whether it runs without errors. Built only from what tester mode already sends:
// "open" (every open or return to the app), "close" (seconds the app was open, from app d134), and the
// ordinary logs of what was tapped. Nothing here is new data about a person; it's the same records, grouped by visit.

// Not things a person does: the app's own bookkeeping. Lifeline taps stay out on purpose, so they're never
// tied to anything else a tester did (they're counted only in Safety).
const SYS = new Set(["open", "close", "nudge_sent", "nudge_tap", "sync", "sync_in", "sync_error", "error", "join",
  "consent_again", "update_note", "badge", "tab", "lifeline_tap", "am_line", "am_line_tap", "am_open"]);
// A return within a minute of leaving (checking a text, the code in Mail) is the same visit.
export const SAME_VISIT = 60e3;

// Which part of the app a log comes from, in words alex uses.
export function area(n) {
  if (/^am_/.test(n)) return "Morning check-in";
  if (/^pm_/.test(n)) return "Evening check-in";
  if (n === "own_word" || n === "show_more") return "A check-in";
  if (/^sleep_(button|sound|len|pause|cancel|prefill)$/.test(n)) return "Going to sleep";
  if (/^(sleep_|days_|day_tap|acts_|lifts_|helps_|help_hide|arrange|doctor_)/.test(n)) return "Your days";
  if (/^(card_|nfm_|rest_ask|plan_|week_|stack_)/.test(n)) return "Today's card";
  if (/^(pick_|repick)/.test(n)) return "Pillars";
  if (/^(box_|look_)/.test(n)) return "Boxes and looks";
  if (/^(lib_|own_|extra_use)/.test(n)) return "Cards and own cards";
  if (/^photo_(adjust|replace)/.test(n)) return "Friends";   // framing or swapping a photo while sharing or editing a moment
  if (/^photos?_/.test(n)) return "Photos";
  if (/^crumb/.test(n)) return "Crumbs";
  if (/^wrap_/.test(n)) return "Weekly recap";
  if (/^(level|unlock|locked_tap)/.test(n)) return "Levels";
  if (/^(friend|share|see$|unshare|edit_open|moment_edit|hide$|unhide|report|grid_open|common_open|notes_open|profile|avatar|comment|uncomment|seen_by|csee$)/.test(n)) return "Friends";
  if (/^(setup|signup_|signin)/.test(n)) return "Setup and sign-up";
  if (/^(settings_open|rename|name$|signout|account_delete|restore|save_copy|nudge_allow|notif_)/.test(n)) return "Settings";
  return "Other";
}
const ORDER = ["Morning check-in", "Today's card", "Photos", "Evening check-in", "A check-in", "Going to sleep", "Your days", "Friends",
  "Crumbs", "Weekly recap", "Boxes and looks", "Cards and own cards", "Pillars", "Levels", "Setup and sign-up", "Settings", "Other"];

// Groups every tester's records into visits: from an open to leaving the app.
export function visits(ev) {
  const byCode = {};
  ev.forEach((e) => (byCode[e.code] = byCode[e.code] || []).push(e));
  const out = [];
  for (const [code, list] of Object.entries(byCode)) {
    list.sort((a, b) => a.t - b.t);
    let cur = null;
    const finish = () => { if (cur) out.push(cur); cur = null; };
    for (const e of list) {
      if (e.name === "open" || (e.name === "join" && !cur)) {
        if (cur && cur.left && e.t - cur.end <= SAME_VISIT) { cur.left = false; continue; }
        finish();
        cur = { code, t: e.t, end: e.t, secs: 0, closes: 0, opens: 1, left: false, nudge: e.val === "nudge", areas: new Set(), taps: 0, tabs: new Set(), errors: 0 };
        continue;
      }
      if (!cur) continue;
      if (e.name === "close") { if (Number.isInteger(e.val) && e.val >= 0) { cur.secs += e.val; cur.closes++; } cur.end = e.t; cur.left = true; continue; }
      if (cur.left) continue;   // logged while away (nudges noted later): not part of the visit
      if (e.t > cur.end) cur.end = e.t;
      if (e.name === "error") cur.errors++;
      else if (e.name === "tab" && typeof e.val === "string") cur.tabs.add(e.val);
      else if (!SYS.has(e.name)) { cur.areas.add(area(e.name)); cur.taps++; }
    }
    finish();
  }
  // A visit's length is known only once the app has said how long it was open (app d134 on).
  out.forEach((v) => { v.known = v.closes > 0; });
  return out.sort((a, b) => a.t - b.t);
}

const clock = (m) => m == null ? "–" : `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "am" : "pm"}`;
export const dur = (s) => s == null ? "–" : s < 60 ? `${s} sec` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} hr ${Math.round((s % 3600) / 60)} min`;
const gapWords = (ms) => ms == null ? "–" : ms < 3600e3 ? `${Math.max(1, Math.round(ms / 6e4))} min` : ms < 48 * 3600e3 ? `${Math.round(ms / 3600e3)} hr` : `${Math.round(ms / 864e5)} days`;

// The whole Usage tab, as page sections. h holds the tester page's own helpers.
export function usageHtml(testers, ev, today, h) {
  const { bars, sec, esc, median, keyOf, dayDiff, pct } = h;
  const V = visits(ev), vOf = (c) => V.filter((v) => v.code === c);
  const startOf = (t) => t.started || keyOf(t.joined);
  const perDay = {};   // code -> day -> visits
  V.forEach((v) => { const k = keyOf(v.t); ((perDay[v.code] = perDay[v.code] || {})[k] = perDay[v.code][k] || []).push(v); });
  const dayRows = Object.values(perDay).flatMap((d) => Object.values(d));
  const known = V.filter((v) => v.known), dayTotals = dayRows.filter((r) => r.every((v) => v.known)).map((r) => r.reduce((s, v) => s + v.secs, 0));
  let html = "";

  // Tiles
  const usualVisits = median(dayRows.map((r) => r.length)), usualLen = median(known.map((v) => v.secs)), usualDay = median(dayTotals);
  html += `<div class="tiles" data-g="usage"><div class="tile"><b>${usualVisits == null ? "–" : usualVisits}</b><span>visits on a usual day</span></div>
    <div class="tile"><b>${dur(usualLen)}</b><span>a usual visit</span></div>
    <div class="tile"><b>${dur(usualDay)}</b><span>time in the app on a usual day</span></div></div>`;
  if (!V.length) return html + sec("How long has each tester been on Daydeck?", "Fills in as testers open the app.", `<p class="sub">No visits yet.</p>`, "");

  // 1. Each tester
  const rows = testers.map((t) => {
    const vs = vOf(t.code), s = startOf(t), len = Math.max(1, dayDiff(s, today) + 1), d = perDay[t.code] || {}, dk = Object.keys(d);
    const kn = vs.filter((v) => v.known), tot = Object.values(d).filter((r) => r.every((v) => v.known)).map((r) => r.reduce((a, v) => a + v.secs, 0));
    const did = ev.filter((e) => e.code === t.code && e.name === "card_did").map((e) => { const x = new Date(e.t); return x.getHours() * 60 + x.getMinutes(); });
    return { t, len, card: median(did), opened: dk.length, perDay: median(Object.values(d).map((r) => r.length)), visit: median(kn.map((v) => v.secs)), day: median(tot), last: vs.length ? vs[vs.length - 1].t : null, n: vs.length };
  }).sort((a, b) => (b.last || 0) - (a.last || 0));
  const when = (t) => { if (!t) return "–"; const d = dayDiff(keyOf(t), today); return d <= 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`; };
  html += sec("How long has each tester been on Daydeck?", "One row per tester: how long since they started, how many of those days they opened it, and how they use it on a day they do.",
    `<div class="tbl"><table><thead><tr><th>Tester</th><th>On Daydeck</th><th>Days opened</th><th>Visits a day</th><th>A visit</th><th>Time a day</th><th>Card done at</th><th>Last open</th></tr></thead><tbody>${rows.map((r) =>
      `<tr><td>${esc(r.t.code)}</td><td>${r.len} day${r.len === 1 ? "" : "s"}</td><td>${r.opened} of ${r.len} (${pct(r.opened, r.len)}%)</td><td>${r.perDay ?? "–"}</td><td>${dur(r.visit)}</td><td>${dur(r.day)}</td><td>${clock(r.card)}</td><td>${when(r.last)}</td></tr>`).join("")}</tbody></table></div>
     <p class="note">"Days opened" is what other apps call stickiness: the share of days someone comes back. Visits and times are the usual (middle) day, so one long evening doesn't skew it.</p>`,
    "Daydeck is built for two short visits a day, so a good row looks like most days opened, about 2 visits a day, and a few minutes in total. Lots of days but long times can mean a screen is slow or confusing.");

  // 2. Coming back after day one
  const ret = [1, 2, 7, 14, 30].map((n) => {
    const ok = testers.filter((t) => dayDiff(startOf(t), today) >= n);
    const back = ok.filter((t) => Object.keys(perDay[t.code] || {}).some((k) => dayDiff(startOf(t), k) === n)).length;
    return [n, back, ok.length];
  });
  const anyBack = testers.filter((t) => dayDiff(startOf(t), today) >= 1), anyBackN = anyBack.filter((t) => Object.keys(perDay[t.code] || {}).some((k) => dayDiff(startOf(t), k) >= 1)).length;
  html += sec("Do people come back after day one?", "Of testers who started long enough ago, how many opened Daydeck again exactly that many days after they started.",
    bars(ret.filter(([, , n]) => n).map(([n, b, all]) => [`${n} day${n === 1 ? "" : "s"} after starting (${b} of ${all})`, pct(b, all)]), 100, "%") +
    `<p class="note">Opened it again on any later day: ${anyBackN} of ${anyBack.length}. ${ret.filter(([, , n]) => !n).length ? "Rows appear once someone has been on Daydeck that long." : ""}</p>`,
    "this is the number most apps watch first (day 1, day 7, day 30). In studies of mental health apps only about 4 in 100 people are still using one after a month, so any tester still here at day 30 is a good sign. A big drop between two rows points at what happened in between.");

  // 3. How often
  const buckets = [1, 2, 3, 4].map((n) => [`${n} visit${n === 1 ? "" : "s"}`, dayRows.filter((r) => r.length === n).length]).concat([["5 or more", dayRows.filter((r) => r.length >= 5).length]]);
  const hours = Array(24).fill(0); V.forEach((v) => hours[new Date(v.t).getHours()]++);
  const gaps = []; testers.forEach((t) => { const vs = vOf(t.code); for (let i = 1; i < vs.length; i++) gaps.push(vs[i].t - vs[i - 1].end); });
  const fromNudge = V.filter((v) => v.nudge).length;
  html += sec("How often do people open it?", "Visits on each day someone opened Daydeck, what time of day visits start, and how long people go between visits. Leaving and coming back within a minute counts as one visit.",
    bars(buckets, dayRows.length) + `<div style="height:16px"></div><p class="note">When visits start</p>` + bars(hours.map((n, hr) => [`${hr % 12 || 12} ${hr < 12 ? "am" : "pm"}`, n]).filter((r) => r[1])) +
    `<p class="note">${V.length} visits in all. Usual time between visits: ${gapWords(median(gaps))}. Started from a notification: ${fromNudge} (${pct(fromNudge, V.length)}%).</p>`,
    "most apps say how often matters more than how long. For Daydeck two clusters, morning and evening, mean the routine has stuck. Lots of 1-visit days means people do one half of the day and skip the other.");

  // 4. How long
  const LEN = [["Under 10 sec", 0, 10], ["10 to 30 sec", 10, 30], ["30 sec to 1 min", 30, 60], ["1 to 2 min", 60, 120], ["2 to 5 min", 120, 300], ["5 to 15 min", 300, 900], ["Over 15 min", 900, Infinity]];
  const did = (v, a) => v.areas.has(a), ci = known.filter((v) => did(v, "Morning check-in") || did(v, "Evening check-in")), glance = known.filter((v) => !v.taps);
  html += sec("How long do people stay?", "How long Daydeck stays open each visit, from opening it to leaving it.",
    known.length ? bars(LEN.map(([l, lo, hi]) => [l, known.filter((v) => v.secs >= lo && v.secs < hi).length]), known.length) +
      `<p class="note">A usual visit with a check-in: ${dur(median(ci.map((v) => v.secs)))}. A usual visit where nothing was tapped: ${dur(median(glance.map((v) => v.secs)))}. Known for ${known.length} of ${V.length} visits.</p>`
      : `<p class="sub">Starts filling in once testers have app d134, the version that says how long the app was open.</p>`,
    "longer isn't better here. Daydeck should be quick: a check-in in about a minute, a card in a few. Lots of visits under 10 seconds with nothing tapped means people open it to look and leave, which is fine if home tells them what they need.");

  // 5. What people do
  const withAreas = V.filter((v) => v.taps), counts = {}; withAreas.forEach((v) => v.areas.forEach((a) => (counts[a] = (counts[a] || 0) + 1)));
  const combos = {}; withAreas.forEach((v) => { const k = ORDER.filter((a) => v.areas.has(a)).join(" + "); combos[k] = (combos[k] || 0) + 1; });
  const tabs = {}; V.forEach((v) => v.tabs.forEach((t) => (tabs[t] = (tabs[t] || 0) + 1)));
  const NAMES = { today: "Today", friends: "Friends", you: "You" };
  html += sec("What do people do each visit?", "For every visit, which parts of Daydeck were used. A visit can use several.",
    bars([["Just looked (nothing tapped)", V.length - withAreas.length]].concat(ORDER.filter((a) => counts[a]).map((a) => [a, counts[a]])), V.length) +
    `<div style="height:16px"></div><p class="note">Most common visits</p>` + bars(Object.entries(combos).sort((a, b) => b[1] - a[1]).slice(0, 6), withAreas.length) +
    (Object.keys(tabs).length ? `<p class="note">Visits that moved to another tab: ${Object.entries(tabs).map(([k, n]) => `${esc(NAMES[k] || k)} ${n}`).join(", ")}.</p>` : ""),
    "the most common visits are Daydeck's real loop. If \"Just looked\" is high, people are checking in on the app without anything to do; if a part is rarely used, it may be hard to find.");

  // 5b. When the card gets done (alex 2026-11-26): the time "I did it" was tapped, how long after keeping the card,
  // and whether it was done in the same visit it was drawn.
  const doneE = ev.filter((e) => e.name === "card_did"), keepE = ev.filter((e) => e.name === "card_keep");
  const after = doneE.map((d) => { const k = keepE.filter((e) => e.code === d.code && e.t <= d.t && keyOf(e.t) === keyOf(d.t)).pop(); return k ? d.t - k.t : null; }).filter((x) => x != null);
  const sameVisit = doneE.filter((d) => V.some((v) => v.code === d.code && v.t <= d.t && d.t <= v.end && keepE.some((e) => e.code === d.code && e.t >= v.t && e.t <= d.t))).length;
  const PART = [["Morning (before 12)", 4, 12], ["Afternoon (12 to 5 pm)", 12, 17], ["Evening (5 to 9 pm)", 17, 21], ["Night (after 9 pm)", 21, 28]];
  const hr = (t) => { const x = new Date(t).getHours(); return x < 4 ? x + 24 : x; };
  const AFTER = [["Under 30 min", 0, 30], ["30 min to 2 hr", 30, 120], ["2 to 6 hr", 120, 360], ["Over 6 hr", 360, Infinity]];
  const doneHours = Array(24).fill(0); doneE.forEach((e) => doneHours[new Date(e.t).getHours()]++);
  html += sec("When do people do their card?", "The time testers tapped \"I did it\", and how long that came after keeping the card that morning.",
    doneE.length ? bars(PART.map(([l, lo, hi]) => [l, doneE.filter((e) => hr(e.t) >= lo && hr(e.t) < hi).length]), doneE.length) +
      `<div style="height:16px"></div><p class="note">How long after keeping the card</p>` + bars(AFTER.map(([l, lo, hi]) => [l, after.filter((ms) => ms / 6e4 >= lo && ms / 6e4 < hi).length]), after.length) +
      `<div style="height:16px"></div><p class="note">Hour by hour</p>` + bars(doneHours.map((n, h) => [`${h % 12 || 12} ${h < 12 ? "am" : "pm"}`, n]).filter((r) => r[1])) +
      `<p class="note">${doneE.length} card${doneE.length === 1 ? "" : "s"} done. Usual time after keeping it: ${gapWords(median(after))}. Done in the same visit it was drawn: ${sameVisit} (${pct(sameVisit, doneE.length)}%). Each tester's usual time is in the table above.</p>`
      : `<p class="sub">No cards done yet.</p>`,
    "lots done in the same visit means people pick cards they can do on the spot; most done in the evening means the card waits for after work or uni, which is when card reminders should land. Cards done many hours later show the card is carried through the day.");

  // 6. Recent visits
  const fmt = (t) => new Date(t).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  html += sec("Recent visits", "Each tester's last 15 visits, newest first: when, how long, and what they did. Tap a tester to open their list.",
    `<div class="visits">${rows.filter((r) => r.n).map((r) => `<details><summary><b>${esc(r.t.code)}</b> · ${r.n} visit${r.n === 1 ? "" : "s"}</summary><ul>${vOf(r.t.code).slice(-15).reverse().map((v) =>
      `<li><span>${esc(fmt(v.t))}${v.nudge ? " · from a notification" : ""}</span><span class="meta">${v.known ? dur(v.secs) : "length unknown"} · ${v.taps ? esc(ORDER.filter((a) => v.areas.has(a)).join(", ")) : "just looked"}${v.errors ? ` · ${v.errors} error${v.errors === 1 ? "" : "s"}` : ""}</span></li>`).join("")}</ul></details>`).join("")}</div>`,
    "");

  // 7. Running smoothly
  const errV = V.filter((v) => v.errors).length, sync = ev.filter((e) => e.name === "sync_error").length;
  const vers = {}; testers.forEach((t) => (vers[t.version || "?"] = (vers[t.version || "?"] || 0) + 1));
  html += sec("Does it run smoothly?", "Visits where the app hit an error, backup errors, and which app version each tester is on.",
    bars([["Visits with no errors", V.length - errV], ["Visits with an error", errV]], V.length) +
    `<p class="note">Error-free visits: ${pct(V.length - errV, V.length)}%. Backup errors: ${sync}. App versions: ${Object.entries(vers).map(([k, n]) => `${esc(k)} (${n})`).join(", ")}.</p>`,
    "other apps aim for 99% or more error-free. The errors themselves (what went wrong) are listed on the Overview tab. Testers on an old version won't have the newest fixes or the visit length.");
  return html;
}
