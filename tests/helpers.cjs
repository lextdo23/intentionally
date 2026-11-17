// Shared bits for the tests: a tiny file server for the repo, and a pass/fail counter.
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/json" };

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

module.exports = { serve, checker };
