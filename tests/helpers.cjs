// Shared bits for the tests: a tiny file server for the repo, and a pass/fail counter.
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/json", ".webp": "image/webp", ".png": "image/png" };

// Serves the repo at /intentionally/, like GitHub Pages. Returns the base address.
async function serve() {
  const server = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(req.url.split("?")[0].replace(/^\/intentionally/, "")));
    const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "index.html") : p;
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  return { url: `http://localhost:${server.address().port}/intentionally/`, close: () => server.close() };
}

function checker() {
  let fails = 0;
  const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) fails++; };
  const done = () => { console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks passed"); process.exit(fails ? 1 : 0); };
  return { check, done };
}

// The real notifications service (push/worker.js and push/accounts.js), runnable in Node: Cloudflare's base class is
// swapped for a tiny stand-in, and both files are copied to a scratch folder so they can find each other.
async function loadWorker() {
  const os = require("os"), dir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-"));
  const stand = "class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }";
  for (const f of ["worker.js", "accounts.js"]) {
    const src = fs.readFileSync(path.join(root, "push", f), "utf8").replace(/^import \{ DurableObject \} from "cloudflare:workers";/m, stand);
    fs.writeFileSync(path.join(dir, f.replace(/\.js$/, ".mjs")), src.replace(/from "\.\/accounts\.js"/g, 'from "./accounts.mjs"'));
  }
  return import(path.join(dir, "worker.mjs"));
}

// Cloudflare's SQL storage, played by Node's built-in SQLite.
function fakeSql() {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(":memory:");
  return { exec(q, ...args) {
    if (!args.length && q.trim().split(";").filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [], one: () => null }; }
    const st = db.prepare(q), rows = /^\s*select/i.test(q) ? st.all(...args) : (st.run(...args), []);
    return { toArray: () => rows, one: () => rows[0] };
  } };
}

module.exports = { serve, checker, loadWorker, fakeSql };
