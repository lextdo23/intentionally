// The sign-up screens (js/account.js, alex 2026-11-20): email, code, username and picture, Face ID; "Use without an
// account"; and "Your account" in Settings. Runs on a pretend iPhone 15 Pro Max with a pretend Daydeck service and a
// pretend Face ID, so no real email is sent. Made-up data only. Set SHOTS=1 to save a picture of each screen.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const { serve, checker } = require("./helpers.cjs");

const SHOTS = process.env.SHOTS ? path.join(__dirname, "..", "..", "signup-shots") : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  // Pretend Face ID: makes and uses a "passkey" without a real phone.
  await ctx.addInitScript(() => {
    const buf = (s) => new TextEncoder().encode(s).buffer;
    window.PublicKeyCredential = window.PublicKeyCredential || function () {};
    window.__faceid = "yes";
    navigator.credentials.create = async () => { if (window.__faceid !== "yes") throw new DOMException("cancelled", "NotAllowedError"); return { id: "k1", rawId: buf("k1"), type: "public-key", response: { clientDataJSON: buf("{}"), attestationObject: buf("att") } }; };
    navigator.credentials.get = async () => ({ id: "k1", rawId: buf("k1"), type: "public-key", response: { clientDataJSON: buf("{}"), authenticatorData: buf("ad"), signature: buf("sig"), userHandle: null } });
  });
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));

  // The pretend Daydeck service.
  const seen = [], state = { token: null, name: null };
  const users = { "josh@example.com": "josh_k" };
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", async (route) => {
    const req = route.request(), url = new URL(req.url()), body = req.postData() ? JSON.parse(req.postData()) : null;
    const key = req.method() + " " + url.pathname, auth = req.headers().authorization || "";
    seen.push({ key, body, auth });
    const send = (o, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(o), headers: { "access-control-allow-origin": "*" } });
    if (key === "POST /a/code") { if (body.email === "mia@example.com") await new Promise((r) => setTimeout(r, 700)); return send(body.email === "slow@example.com" ? { error: "slow_down", wait: 42 } : { ok: true }); }
    if (key === "POST /a/verify") return send(body.code === "123456" ? (users[body.email] ? { ok: true, ticket: "T", existing: true, username: users[body.email] } : { ok: true, ticket: "T", existing: false }) : { error: "bad_code", left: 3 });
    if (key === "GET /a/name") { const u = url.searchParams.get("u"); return send(u === "mia" ? { ok: false, why: "taken", try: ["mia_", "mia.42"] } : u === "admin" ? { ok: false, why: "reserved" } : { ok: true }); }
    if (key === "POST /a/passkey/options") return send({ ok: true, options: { rp: { id: "daydeck.day", name: "Daydeck" }, user: { id: "aGFuZGxl", name: "@x", displayName: "@x" }, challenge: "Y2hhbGxlbmdl", pubKeyCredParams: [{ type: "public-key", alg: -7 }], excludeCredentials: [] } });
    if (key === "POST /a/finish") { state.token = "S1"; state.name = body.username || users["josh@example.com"]; return send({ ok: true, session: "S1", user: { username: state.name, email: "mia@example.com", renameAfter: Date.now() + 30 * 864e5 }, passkey: !!body.credential, created: !!body.username }); }
    if (key === "GET /a/me") return auth === "Bearer S1" ? send({ ok: true, user: { username: state.name, email: "mia@example.com", renameAfter: Date.now() + 30 * 864e5 }, passkeys: 1 }) : send({ error: "signed_out" }, 401);
    if (key === "POST /a/signin/options") return send({ ok: true, options: { challenge: "Y2hhbGxlbmdl", rpId: "daydeck.day" } });
    if (key === "POST /a/signin") return send({ ok: true, session: "S1", user: { username: "mia.k", email: "mia@example.com", renameAfter: 0 } });
    if (key === "POST /a/signout") return send({ ok: true });
    if (key === "POST /a/delete") return send({ ok: true });
    return send({ ok: true });
  });
  const shot = async (name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + ".png") }); };
  const btn = (text) => p.locator("#acct .acct-screen:last-child button", { hasText: text }).first();
  const msg = () => p.locator("#acct .acct-screen:last-child .acct-msg").first().textContent();

  // ---- Not in test mode: nothing changes ----
  await p.goto(server.url);
  await p.evaluate(() => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: null, days: {}, seen: { note: "sleep" } })));
  await p.reload(); await p.waitForTimeout(1200);
  check(!(await p.$("#acct")), "outside test mode, nobody sees the sign-up screens yet");

  // ---- Test mode: the sign-up shows first ----
  await p.goto(server.url + "?test"); await p.waitForTimeout(1200);
  check(!!(await p.$("#acct")), "in test mode, the sign-up shows when the app opens");
  check(/Keep your days safe/.test(await p.textContent("#acct")) && /Lifeline 13 11 14/.test(await p.textContent("#acct")), "it says Keep your days safe, and Lifeline is still there");
  check(await btn("Continue").getAttribute("aria-disabled") === "true", "Continue waits for an email");
  await shot("1-email");

  await p.fill("#acct input[type=email]", "slow@example.com"); await btn("Continue").click(); await p.waitForTimeout(300);
  check(/new code in 42 seconds/.test(await msg()), "if codes are coming too fast, it says how long to wait");
  await p.fill("#acct input[type=email]", "Mia@Example.com "); await btn("Continue").click(); await p.waitForTimeout(200);
  check(await p.evaluate(() => { const b = [...document.querySelectorAll("#acct .btn-main")].pop(); return b.classList.contains("busy") && getComputedStyle(b, "::after").borderTopStyle === "solid"; }), "while waiting, the button shows a small turning ring");
  await shot("1b-waiting");
  await p.waitForTimeout(900);
  check(seen.find((x) => x.key === "POST /a/code" && x.body.email === "mia@example.com"), "the email is sent tidied (no capitals or spaces)");

  // ---- The code ----
  const codeText = await p.textContent("#acct .acct-screen:last-child");
  check(/Check your email/.test(codeText) && /mia@example\.com/.test(codeText), "the code screen shows where the code went");
  check(/Works for (9:5\d|10:00)/.test(codeText), "it counts down how long the code works");
  check(!/may offer the code/.test(codeText), "the old iPhone line is gone");
  check(await p.getAttribute("#acct .acct-code-input", "autocomplete") === "one-time-code", "the code box lets iPhone offer the code from Mail");
  await shot("2-code");
  await p.fill("#acct .acct-code-input", "999999"); await p.waitForTimeout(400);
  check(/isn't right\. 3 tries left/.test(await msg()), "a wrong code says how many tries are left");
  // Pasting: a whole line from the email, or "123 456", keeps just the code.
  await p.evaluate(() => { const i = document.querySelector("#acct .acct-code-input"), dt = new DataTransfer(); dt.setData("text/plain", "Your Daydeck code is 123 456. It works for 10 minutes."); i.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); });
  check(await p.$eval("#acct .acct-code-input", (i) => i.value) === "123456", "pasting a code works, even with spaces or words around it");
  await p.waitForTimeout(800);

  // ---- Username and picture ----
  const nameText = await p.textContent("#acct .acct-screen:last-child");
  check(/Pick a username/.test(nameText) && /Add a photo, if you like/.test(nameText), "a right code goes straight on to the username");
  check(!/how friends will find you/.test(nameText), "the friends line is gone");
  check(!!(await p.$("#acct .acct-pic svg")), "everyone starts with a little picture (the smile)");
  await p.fill("#acct .acct-name", "mia"); await p.waitForTimeout(800);
  check(/Taken/.test(await msg()) && (await p.$$("#acct .acct-chip")).length === 2, "a taken name offers others");
  await shot("3-username-taken");
  await p.fill("#acct .acct-name", "admin"); await p.waitForTimeout(800);
  check(/kept for Daydeck/.test(await msg()), "names posing as Daydeck are refused");
  await p.fill("#acct .acct-name", "mia."); await p.waitForTimeout(300);
  check(/start or end with a full stop/.test(await msg()), "a full stop at the end is explained straight away");
  await p.fill("#acct .acct-name", "<b>hi</b>"); await p.waitForTimeout(300);
  check(/Only letters, numbers/.test(await msg()) && (await btn("Continue").getAttribute("aria-disabled")) === "true", "anything that looks like code is refused on the phone too");
  await p.fill("#acct .acct-name", "mi"); await p.waitForTimeout(500);
  check(await btn("Continue").getAttribute("aria-disabled") === "true", "too short can't go on");
  await p.click("#acct .acct-chip >> nth=0").catch(() => {});
  await p.fill("#acct .acct-name", "mia.k"); await p.waitForTimeout(800);
  check(/free/.test(await msg()) && (await btn("Continue").getAttribute("aria-disabled")) === "false", "a free name can go on");

  // The picture: pick a little one.
  await p.click("#acct .acct-pic"); await p.waitForTimeout(700);
  check((await p.$$(".sheet .pic-pick")).length === 8, "tapping the picture offers the eight little ones");
  check(/Take photo/.test(await p.textContent(".sheet")) && /Choose photo/.test(await p.textContent(".sheet")), "and taking or choosing a photo");
  await shot("3b-picture");
  await p.click('.sheet .pic-pick[aria-label="Frog"]'); await p.waitForTimeout(600);
  check(await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck-account")).pic.id) === "frog", "the picked one is kept on this phone");
  await shot("3c-username-ok");
  await btn("Continue").click(); await p.waitForTimeout(500);

  // ---- Face ID ----
  const faceText = await p.textContent("#acct .acct-screen:last-child");
  check(/Add Face ID/.test(faceText) && !/Nothing to remember|never leaves/.test(faceText), "Face ID is short: no explaining");
  await shot("4-faceid");
  await p.evaluate(() => (window.__faceid = "no"));
  await btn("Continue").click(); await p.waitForTimeout(500);
  check(/didn't finish/.test(await msg()), "if Face ID is cancelled, it says so calmly and stays");
  await p.evaluate(() => (window.__faceid = "yes"));
  await btn("Continue").click(); await p.waitForTimeout(900);
  const fin = seen.filter((x) => x.key === "POST /a/finish").pop();
  check(fin && fin.body.username === "mia.k" && fin.body.credential && fin.body.credential.response.attestationObject, "Face ID's key goes to the service with the username");
  check(!(await p.$("#acct")), "then the sign-up closes");
  const acct = await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck-account")));
  check(acct.token === "S1" && acct.user.username === "mia.k", "the phone stays signed in");
  check(!JSON.stringify(await p.evaluate(() => localStorage.getItem("daydeck"))).includes("S1"), "the sign-in key is kept apart from the days, so Save a copy never carries it");

  // ---- Next time: no sign-up, still signed in, and the sign-in is checked (which keeps it going) ----
  seen.length = 0;
  await p.reload(); await p.waitForTimeout(1200);
  check(!(await p.$("#acct")), "opening again doesn't ask again");
  check(seen.some((x) => x.key === "GET /a/me" && x.auth === "Bearer S1"), "the app checks in quietly, which keeps the sign-in going");

  // ---- Settings: Your account ----
  await p.evaluate(() => document.querySelector(".tip-layer")?.remove());
  await p.click('button[aria-label="Settings"]'); await p.waitForTimeout(800);
  const setText = await p.textContent("#settings");
  check(/Your account/.test(setText) && /@mia\.k/.test(setText) && /mia@example\.com/.test(setText) && /Sign out/.test(setText) && /Delete account/.test(setText), "Settings shows the account: picture, username, email, sign out, delete");
  await shot("6-settings");
  const del = p.locator("#settings button", { hasText: "Delete account" });
  await del.click(); await p.waitForTimeout(200);
  check(/Tap again/.test(await p.textContent("#settings")), "delete asks for a second tap");
  await p.locator("#settings button", { hasText: "Tap again" }).click(); await p.waitForTimeout(600);
  check(seen.some((x) => x.key === "POST /a/delete"), "and then deletes the account");
  check(/Make an account/.test(await p.textContent("#settings")) && /Sign in with Face ID/.test(await p.textContent("#settings")), "then Settings offers making one, or signing in with Face ID");
  await shot("6b-settings-signed-out");
  await p.locator("#settings button", { hasText: "Sign in with Face ID" }).click(); await p.waitForTimeout(700);
  check(await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck-account")).token) === "S1", "Face ID signs back in");
  await p.locator("#settings button", { hasText: "Sign out" }).click(); await p.waitForTimeout(600);
  check(!(await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck-account")).token)), "sign out forgets the sign-in on this phone");
  await p.click('#settings button[aria-label="Back to home"]'); await p.waitForTimeout(600);

  // ---- An existing account on a new phone: email, code, then straight to Face ID ----
  await p.evaluate(() => { localStorage.removeItem("daydeck-account"); });
  await p.reload(); await p.waitForTimeout(1200);
  await p.fill("#acct input[type=email]", "josh@example.com"); await btn("Continue").click(); await p.waitForTimeout(500);
  await p.fill("#acct .acct-code-input", "123456"); await p.waitForTimeout(700);
  check(/Add Face ID/.test(await p.textContent("#acct .acct-screen:last-child")), "an email that already has an account skips the username");
  await btn("Not now").click(); await p.waitForTimeout(800);
  check(!(await p.$("#acct")) && (await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck-account")).user.username)) === "josh_k", "Not now still signs them in, with their own username");

  // ---- Use without an account ----
  await p.evaluate(() => localStorage.removeItem("daydeck-account"));
  await p.reload(); await p.waitForTimeout(1200);
  await btn("Use without an account").click(); await p.waitForTimeout(700);
  const sheet = await p.textContent(".sheet");
  check(/stay only on this phone/.test(sheet) && /Friends and sharing/.test(sheet) && /any time in Settings/.test(sheet), "without an account: one calm sheet with the three points");
  await shot("5-without");
  await p.locator(".sheet button", { hasText: "Continue without" }).click(); await p.waitForTimeout(800);
  check(!(await p.$("#acct")), "Continue without goes to the app");
  await p.reload(); await p.waitForTimeout(1200);
  check(!(await p.$("#acct")), "and isn't asked again");

  // ---- Tester mode never hears the email, username or code ----
  const logs = await p.evaluate(() => JSON.stringify((JSON.parse(localStorage.getItem("daydeck")).tester || {}).queue || []));
  check(!/mia@|josh@|mia\.k|josh_k|123456/.test(logs), "nothing typed is ever logged");

  check(errors.length === 0, "no errors on the page" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
