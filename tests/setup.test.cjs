// First-time setup (js/setup.js, alex 2026-11-26): Add to Home Screen (Safari on iPhone only), Welcome, pillars and
// mindsets, the account, Notifications, Help improve Daydeck, Your deck is ready, then home. Also the new-phone path
// ("I already have an account"), "Use without an account", and people already using Daydeck (who keep the old
// one-time sign-up). A pretend iPhone 15 Pro Max and a pretend Daydeck service: no real email is sent. Made-up data.
// SHOTS=1 saves a picture of each screen.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const { serve, checker } = require("./helpers.cjs");

const SHOTS = process.env.SHOTS ? path.join(__dirname, "..", "..", "setup-shots") : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const seen = [];
  const users = { "josh@example.com": "josh_k" };
  const phone = async (opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: SHOTS ? 2 : 1, hasTouch: true, isMobile: true, ...opts });
    await ctx.route("https://intentionally-push.lextdo.workers.dev/**", async (route) => {
      const req = route.request(), url = new URL(req.url()), body = req.postData() ? JSON.parse(req.postData()) : null;
      const key = req.method() + " " + url.pathname;
      seen.push({ key, body });
      const send = (o, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(o), headers: { "access-control-allow-origin": "*" } });
      if (key === "POST /a/code") return send({ ok: true });
      if (key === "POST /a/verify") return send(body.code === "123456" ? (users[body.email] ? { ok: true, ticket: "T", existing: true, username: users[body.email] } : { ok: true, ticket: "T", existing: false }) : { error: "bad_code", left: 3 });
      if (key === "GET /a/name") { const u = url.searchParams.get("u"); return send(u === "mia" ? { ok: false, why: "taken", try: ["mia_", "mia.42"] } : { ok: true }); }
      if (key === "POST /a/finish") return send({ ok: true, session: "S1", user: { username: body.username || "josh_k", email: "x@example.com" }, created: !!body.username && body.username !== "josh_k" });
      if (key === "POST /a/f/profile") return send(body.name === "Daydeck" ? { error: "name_words" } : { ok: true });
      if (key === "GET /a/me") return send({ ok: true, user: { username: "mia.k", email: "x@example.com" } });
      return send({ ok: true });
    });
    const p = await ctx.newPage();
    p.errors = []; p.on("pageerror", (e) => p.errors.push(e.message));
    return { ctx, p };
  };
  const top = (p) => p.locator("#acct .acct-screen:last-child");
  const btn = (p, text) => top(p).locator("button", { hasText: text }).first();
  const text = (p) => top(p).textContent();
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + ".png") }); };
  const fresh = async (p) => { await p.goto(server.url); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(2000); };
  const pickPillars = async (p) => {
    for (const n of ["Friends", "Rest", "Work and study"]) await top(p).locator("button.pill", { hasText: n }).first().click();
    await btn(p, "Next").click(); await p.waitForTimeout(450);
    for (let i = 0; i < 3; i++) { await top(p).locator(".mrow").first().click(); await btn(p, "Next").click(); await p.waitForTimeout(450); }
  };

  // ---------------- A new person, all the way through ----------------
  { const { ctx, p } = await phone();
    await fresh(p);
    check(!!(await p.$("#acct .setup-welcome")), "a new person sees the welcome first");
    const w = await text(p);
    check(/Welcome to Daydeck/.test(w) && /A card a day, for the parts of life that matter to you\./.test(w), "the welcome says what Daydeck is in one line");
    check(!!(await p.$("#acct .setup-card .home-card.blank")), "with today's card, face down, as it sits on home");
    check(!(await p.$("#acct .setup-dots")), "no dots on the welcome");
    await shot(p, "1-welcome");

    await btn(p, "Let's set up your deck").click(); await p.waitForTimeout(450);
    check(/What matters to you right now\?/.test(await text(p)), "then the pillars come first, before the account");
    check(!/Getting started/.test(await text(p)) && await top(p).locator(".setup-dots i.now").count() === 1 && await top(p).locator(".setup-dots i").count() === 4, "four dots in place of Getting started, on the first");
    await shot(p, "2-pillars");
    await top(p).locator('button[aria-label="Back"]').click(); await p.waitForTimeout(450);
    check(!!(await p.$("#acct .acct-screen:last-child.setup-welcome")), "Back on the pillars goes back to the welcome");
    await btn(p, "Let's set up your deck").click(); await p.waitForTimeout(450);
    await pickPillars(p);

    const e = await text(p);
    check(/Keep your days safe/.test(e) && !/Make an account so/.test(e) && !(await top(p).locator(".acct-sun").count()), "the email screen is just the title and the box");
    check(/Use without an account/.test(e) && /Lifeline/.test(e) && /No passwords/.test(e), "it keeps No passwords, Use without an account and Lifeline");
    check(await top(p).locator(".setup-dots i.on").count() === 1 && await top(p).locator(".setup-dots i.now").count() === 1, "the second dot is now");
    check(!!(await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).pillars.length === 3)), "the pillars are saved before the account");
    await shot(p, "3-email");
    await p.fill("#acct input[type=email]", "mia@example.com"); await btn(p, "Continue").click(); await p.waitForTimeout(500);
    await p.fill("#acct .acct-code-input", "123456"); await p.waitForTimeout(800);

    check(/Pick a username/.test(await text(p)) && /3 to 20 letters, numbers, full stops or underscores\./.test(await text(p)), "then the username, with the rule on one line");
    await p.fill("#acct .acct-name", "mia"); await p.waitForTimeout(800);
    check(await p.$eval("#acct .acct-at", (el) => el.classList.contains("bad") && getComputedStyle(el).outlineColor === "rgb(229, 115, 107)"), "a taken name turns the box red");
    await p.fill("#acct .acct-name", "mia.k"); await p.waitForTimeout(800);
    check(await p.$eval("#acct .acct-at", (el) => el.classList.contains("good") && getComputedStyle(el).outlineColor === "rgb(127, 209, 155)"), "a free name turns it green");
    check(!/That one's free/.test(await text(p)), "with no \"That one's free.\"");
    check(/Name friends see \(optional\)/.test(await text(p)) && await p.getAttribute("#acct .acct-shown", "maxlength") === "30", "an optional name friends see, up to 30");
    await p.fill("#acct .acct-shown", "Daydeck");
    await shot(p, "4-username");
    await btn(p, "Continue").click(); await p.waitForTimeout(800);
    check(/can't be used/.test(await text(p)) && /Pick a username/.test(await text(p)), "a name that isn't allowed says so and stays");
    await p.fill("#acct .acct-shown", "Mia"); await btn(p, "Continue").click(); await p.waitForTimeout(800);
    check(seen.filter((x) => x.key === "POST /a/finish").length === 1, "trying the name again doesn't make a second account");
    check(seen.some((x) => x.key === "POST /a/f/profile" && x.body.name === "Mia"), "the name goes with the friends profile");

    const n = await text(p);
    check(/Notifications/.test(n) && /Pick what you'd like\. Change them any time in Settings\./.test(n), "then Notifications");
    check(/Start your day/.test(n) && /End your day/.test(n) && /Today's card/.test(n) && /Social/.test(n), "Nudges (start, end, today's card) and one Social switch");
    check(await top(p).locator('.switch[aria-checked="true"]').count() === 4, "every switch starts on");
    check(await top(p).locator(".setup-dots i.on").count() === 2, "the third dot is now");
    await shot(p, "5-notifications");
    await top(p).locator('.switch[aria-label="Social"]').click();
    await top(p).locator('input[aria-label="Start your day time"]').fill("07:30");
    await btn(p, "Not now").click(); await p.waitForTimeout(500);
    const st = await p.evaluate(() => ({ n: JSON.parse(localStorage.getItem("daydeck")).notify, f: JSON.parse(localStorage.getItem("daydeck-friends") || "{}") }));
    check(st.n.am.on && st.n.am.t === "07:30" && st.n.pm.on && st.n.card.on && st.f.pings === false, "what they picked is kept (Social off, a new time)");

    const hlp = await text(p);
    check(/Help improve Daydeck/.test(hlp) && /What you tap and choose/.test(hlp) && /Your name or email/.test(hlp) && /random code/.test(hlp), "then Help improve Daydeck, with what's shared and what never is");
    check(await top(p).locator(".setup-tick .y").count() === 2 && await top(p).locator(".setup-tick .n").count() === 3, "two ticks, three crosses");
    await top(p).locator("button", { hasText: "More details" }).click(); await p.waitForTimeout(600);
    check(/What's shared/.test(await p.textContent(".sheet")) && !/Share while testing/.test(await p.textContent(".sheet")), "More details shows the full list, with nothing to agree to there");
    await p.locator(".sheet button", { hasText: "Done" }).click(); await p.waitForTimeout(500);
    await shot(p, "6-help");
    await btn(p, "Share").click(); await p.waitForTimeout(300);
    const t = await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).tester);
    check(t && t.on && t.queue.some((q) => q[1] === "setup" && q[2].acct === "new" && q[2].n.s === 0), "Share starts testing, and sends how setup went (numbers only)");
    check(!JSON.stringify(t.queue).includes("mia"), "never the email, username or name");

    check(!!(await p.$("#acct .setup-deck")) && /Your deck is ready/.test(await text(p)), "then Your deck is ready");
    const count = await p.evaluate(async () => (await import("./js/deck.js")).deck().length);
    check(new RegExp(`${count} cards for Friends, Rest and Work and study\\.`).test(await text(p)), "it says how many cards, and for which pillars");
    check(await top(p).locator(".dr-card").count() === 18 && !(await top(p).locator(".dr-card .front, .dr-card .task").count()), "18 card backs, no faces");
    await p.waitForTimeout(1500); await shot(p, "7a-deck-dealing");
    await p.waitForTimeout(4200); await shot(p, "7b-deck-ready");
    const dates = await top(p).locator(".dr-card .dr-date").allTextContents();
    check(/^Mon /.test(dates[11]) && /^Sun /.test(dates[17]), "the fan is this week, Monday to Sunday");
    await btn(p, "Start your first day").click(); await p.waitForTimeout(800);
    check(!(await p.$("#acct")) && await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).seen.setup === 1), "then home, and setup is done");
    await p.reload(); await p.waitForTimeout(1800);
    check(!(await p.$("#acct")), "and isn't shown again");
    check(p.errors.length === 0, "no errors" + (p.errors.length ? ": " + p.errors.join(" | ") : ""));
    await ctx.close(); }

  // ---------------- A new phone: I already have an account ----------------
  { const { ctx, p } = await phone();
    await fresh(p);
    await btn(p, "I already have an account").click(); await p.waitForTimeout(450);
    const e = await text(p);
    check(/Welcome back/.test(e) && !/Use without an account/.test(e), "a new phone goes straight to the email, with nothing to skip");
    await shot(p, "8-welcome-back");
    await p.fill("#acct input[type=email]", "josh@example.com"); await btn(p, "Continue").click(); await p.waitForTimeout(500);
    await p.fill("#acct .acct-code-input", "123456"); await p.waitForTimeout(1000);
    check(/Notifications/.test(await text(p)), "an account they already have goes straight in, then Notifications");
    await btn(p, "Not now").click(); await p.waitForTimeout(500);
    check(/Help improve Daydeck/.test(await text(p)), "then Help improve Daydeck (it's per phone)");
    await btn(p, "Don't share").click(); await p.waitForTimeout(600);
    check(!(await p.$("#acct")), "then home, with no deck to deal (their pillars come back with their backup)");
    check(await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("daydeck")); return s.seen.testInvite >= 1 && !(s.tester && s.tester.on); }), "Don't share means the invite never comes back");
    check(p.errors.length === 0, "no errors" + (p.errors.length ? ": " + p.errors.join(" | ") : ""));
    await ctx.close(); }

  // ---------------- Use without an account ----------------
  { const { ctx, p } = await phone();
    await fresh(p);
    await btn(p, "Let's set up your deck").click(); await p.waitForTimeout(450);
    await pickPillars(p);
    await btn(p, "Use without an account").click(); await p.waitForTimeout(700);
    await p.locator(".sheet button", { hasText: "Continue without" }).click(); await p.waitForTimeout(700);
    const n = await text(p);
    check(/Notifications/.test(n) && !/Social/.test(n), "without an account: Notifications with Nudges only");
    await btn(p, "Not now").click(); await p.waitForTimeout(500);
    await btn(p, "Don't share").click(); await p.waitForTimeout(500);
    check(/Your deck is ready/.test(await text(p)), "and still the deck");
    await btn(p, "Start your first day").click(); await p.waitForTimeout(800);
    check(!(await p.$("#acct")), "then home");
    await p.reload(); await p.waitForTimeout(1800);
    check(!(await p.$("#acct")), "and nothing more is asked");
    check(p.errors.length === 0, "no errors" + (p.errors.length ? ": " + p.errors.join(" | ") : ""));
    await ctx.close(); }

  // ---------------- Safari on iPhone: Add to Home Screen, with no way past ----------------
  { const { ctx, p } = await phone({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1" });
    await fresh(p);
    const hs = await text(p);
    check(/Put Daydeck on your Home Screen/.test(hs) && /Add to Home Screen/.test(hs) && /Share/.test(hs), "in Safari on iPhone, new people are asked to put Daydeck on their Home Screen");
    check(await top(p).locator("button").count() === 0, "with no way past it");
    check(!/four taps/i.test(hs) && !/Start here/.test(hs), "no \"four taps\" line or Start here arrow");
    await shot(p, "0-home-screen");
    check(p.errors.length === 0, "no errors" + (p.errors.length ? ": " + p.errors.join(" | ") : ""));
    await ctx.close(); }

  // ---------------- People already using Daydeck keep the one-time sign-up ----------------
  { const { ctx, p } = await phone();
    await p.goto(server.url);
    await p.evaluate(() => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: "2026-11-01", days: {}, seen: { note: "sleep", testInvite: 1 } })));
    await p.reload(); await p.waitForTimeout(2000);
    check(/Keep your days safe/.test(await text(p)) && !(await p.$("#acct .setup-dots")), "someone already using Daydeck sees just the sign-up, no setup");
    await ctx.close(); }

  await b.close(); server.close(); done();
})();
