// Tester consent screen: says who sees the data, that nobody watches it live, support numbers, how long it's kept,
// and that Lifeline taps are counted. Joining, and stopping with delete, still work. Made-up data only.
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");

const root = path.join(__dirname, "..");
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split("?")[0].replace(/^\/intentionally/, "")));
  const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "index.html") : p;
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const types = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/json" };
  res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});

const MUST = [
  "How many times you tap the Lifeline link",
  "sometimes with help from Claude, an AI assistant made by Anthropic",
  "Nobody watches it as it comes in",
  "call Lifeline on 13 11 14, or 000 in an emergency",
  "It's kept for as long as Daydeck is being tested",
  "backup copies are gone within 30 days",
  "Anything you type in your own words",
];
const MUST_NOT = ["Only the person making Daydeck can see it", "crisis"];

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/intentionally/v2/`;
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 430, height: 932 } }), p = await ctx.newPage();
  const errors = [], calls = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => { calls.push(r.request().url().split(".dev")[1]);
    r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }); });
  let fails = 0; const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) fails++; };

  await p.goto(url + "?tester"); await p.waitForTimeout(1500);
  const text = await p.locator(".sheet").innerText();
  MUST.forEach((m) => check(text.includes(m), `shows: "${m}"`));
  MUST_NOT.forEach((m) => check(!text.toLowerCase().includes(m.toLowerCase()), `doesn't show: "${m}"`));

  await p.getByText("Share while testing").click(); await p.waitForTimeout(1200);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).tester);
  check(st && st.on && /^T-[A-Z0-9]{4}$/.test(st.code), "joining turns tester mode on with a code");
  check(calls.includes("/t/send"), "joining sends to the service");

  const stop = p.getByText("Stop and delete what I've shared");
  await stop.click(); await p.getByText("Tap again to stop and delete").click(); await p.waitForTimeout(800);
  const st2 = await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).tester);
  check(calls.includes("/t/leave") && st2 && !st2.on, "stop and delete asks the service to delete and turns tester mode off");
  check(errors.length === 0, "no errors on the page" + (errors.length ? ": " + errors.join(" | ") : ""));

  await b.close(); server.close();
  console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks passed"); process.exit(fails ? 1 : 0);
})();
