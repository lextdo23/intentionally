// The notifications service answers the app at daydeck.day, and at the old GitHub address while people move,
// and doesn't hand out permission to any other site. Runs the real push/worker.js in Node. Made-up data only.
const fs = require("fs"), path = require("path"), os = require("os");
const { checker } = require("./helpers.cjs");

(async () => {
  const { check, done } = checker();
  const src = fs.readFileSync(path.join(__dirname, "..", "push", "worker.js"), "utf8")
    .replace(/^import \{ DurableObject \} from "cloudflare:workers";/m, "class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "worker-")), "worker.mjs");
  fs.writeFileSync(file, src);
  const worker = (await import(file)).default;
  const ask = async (origin) => {
    const res = await worker.fetch(new Request("https://service.example/nowhere", { method: "OPTIONS", headers: origin ? { Origin: origin } : {} }), {});
    return res.headers.get("Access-Control-Allow-Origin");
  };
  check(await ask("https://daydeck.day") === "https://daydeck.day", "daydeck.day is allowed");
  check(await ask("https://www.daydeck.day") === "https://www.daydeck.day", "www.daydeck.day is allowed");
  check(await ask("https://lextdo23.github.io") === "https://lextdo23.github.io", "the old GitHub address still works during the move");
  check(await ask("https://evil.example") === "https://daydeck.day", "another site isn't given permission");
  done();
})();
