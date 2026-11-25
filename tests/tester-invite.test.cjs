// The one-time "Help shape Daydeck" invite (alex 2026-11-25), and "Start again" keeping someone testing.
// Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");
const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const { check, done } = checker();
  const server = await serve(), b = await chromium.launch();
  const errors = [];

  async function phone({ data, acct = { skip: 1 } }) {
    const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
    const sent = [];
    await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => { const u = r.request().url().split(".dev")[1]; sent.push(u);
      const body = u === "/a/me" ? JSON.stringify({ ok: true, user: acct.user || {}, passkeys: 1 }) : '{"ok":true}';
      r.fulfill({ status: 200, contentType: "application/json", body, headers: { "access-control-allow-origin": "*" } }); });
    const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(server.url);
    await p.evaluate(({ data, acct }) => { localStorage.setItem("daydeck-account", JSON.stringify(acct)); localStorage.setItem("daydeck", JSON.stringify(data)); }, { data, acct });
    await p.reload(); await p.waitForTimeout(2200);
    // A level-up moment goes first; the invite waits for it.
    if (await p.locator(".lu").count()) { await p.locator(".lu button", { hasText: "Later" }).click().catch(() => {}); await p.waitForTimeout(2500); }
    return { p, ctx, sent };
  }
  const sheet = async (p) => (await p.locator(".sheet").allInnerTexts()).join(" ");
  const used = (extra = {}) => Object.assign({ v: 1, started: day(5), days: { [day(2)]: { mood: 3 }, [day(1)]: { mood: 4 } }, seen: { note: "old" }, levels: { seen: 1, reset: 2, base: 0 } }, extra);

  // Someone already using Daydeck: the invite comes first, ahead of "What's new"; Not now means never again.
  { const { p, ctx } = await phone({ data: used() });
    check((await sheet(p)).includes("Help shape Daydeck"), "someone already using Daydeck sees the invite on the next open");
    check(!(await sheet(p)).includes("New:"), "it comes before What's new");
    await p.getByText("Not now").click(); await p.waitForTimeout(800);
    await p.reload(); await p.waitForTimeout(2200);
    check(!(await sheet(p)).includes("Help shape Daydeck"), "after Not now it never comes back");
    await ctx.close(); }

  // Joining from the invite: a code, and the service hears from them.
  { const { p, ctx, sent } = await phone({ data: used() });
    await p.getByText("Share while testing").click(); await p.waitForTimeout(1500);
    check(/Your tester code is T-[A-Z0-9]{4}/.test(await sheet(p)), "joining from the invite shows a tester code");
    check(sent.includes("/t/send"), "and sends to the service");
    await p.getByText("Done").click(); await p.waitForTimeout(600);
    await p.reload(); await p.waitForTimeout(2200);
    check(!(await sheet(p)).includes("Help shape Daydeck"), "a tester isn't invited again");
    // Start again (test mode) keeps them testing.
    await p.evaluate(async () => { const s = await import("./js/store.js"); s.reset({ keepTester: true }); });
    const t = await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).tester);
    check(t && t.on && /^T-/.test(t.code), "Start again keeps tester mode and its code");
    await p.evaluate(async () => { const s = await import("./js/store.js"); s.reset(); });
    check(!(await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).tester)), "a plain reset (Delete everything) still clears it");
    await ctx.close(); }

  // Not invited: brand-new (no evening yet), stopped on purpose, alex's test account.
  { const { p, ctx } = await phone({ data: { v: 1, started: null, days: {}, seen: { note: "sleep" } } });
    check(!(await sheet(p)).includes("Help shape Daydeck"), "someone brand new isn't invited before their first evening check-in");
    await ctx.close(); }
  { const { p, ctx } = await phone({ data: used({ tester: { on: false, consent: 0, left: true } }) });
    check(!(await sheet(p)).includes("Help shape Daydeck"), "someone who pressed Stop isn't invited again");
    await ctx.close(); }
  { const acct = { token: "T", user: { username: "alex.test", email: "x@example.com", test: true } };
    const { p, ctx } = await phone({ data: used(), acct });
    check(!(await sheet(p)).includes("Help shape Daydeck"), "alex's test account isn't invited");
    await ctx.close(); }

  check(errors.length === 0, "no errors on the page" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close();
  done();
})();
