// Card library service: share, wait for alex, Yes/No, the public list, thumbs once per phone, unshare.
// Runs the real push/worker.js in Node with a stand-in for Cloudflare's storage. Made-up cards only.
const fs = require("fs"), path = require("path"), os = require("os");
const { DatabaseSync } = require("node:sqlite");
const { checker } = require("./helpers.cjs");

function fakeSql() {
  const db = new DatabaseSync(":memory:");
  return { exec(q, ...args) {
    if (!args.length && q.trim().split(";").filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [], one: () => null }; }
    const st = db.prepare(q), rows = /^\s*select/i.test(q) ? st.all(...args) : (st.run(...args), []);
    return { toArray: () => rows, one: () => rows[0] };
  } };
}

(async () => {
  const { check, done } = checker();
  const src = fs.readFileSync(path.join(__dirname, "..", "push", "worker.js"), "utf8")
    .replace(/^import \{ DurableObject \} from "cloudflare:workers";/m, "class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "worker-")), "worker.mjs");
  fs.writeFileSync(file, src);
  const mod = await import(file);
  const store = new mod.Testers({ storage: { sql: fakeSql() } }, {});
  const env = { TESTERS: { idFromName: () => "all", get: () => store }, TESTER_KEY: "made-up-password-for-tests" };
  const hex = (n) => n.toString(16).padStart(32, "0");
  const call = async (p, body, { admin = false, ip = "1.1.1.1", method = "POST" } = {}) => {
    const headers = { "CF-Connecting-IP": ip }; if (admin) headers.Authorization = "Bearer " + env.TESTER_KEY;
    const res = await mod.default.fetch(new Request("https://service.test" + p, { method, headers, body: method === "POST" ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, body: await res.json() };
  };

  const a = await call("/l/share", { key: hex(1), text: "  Send a voice   note <b>instead</b> of a text ", name: "Sam", pillar: "Friends", mind: ["See them more"] });
  check(a.status === 200 && /^[a-z0-9]{10}$/.test(a.body.id), "a card can be shared and gets a random id");
  const bad = await call("/l/share", { key: hex(1), text: "Hi", name: "", pillar: "Not a pillar" });
  check(bad.status === 400, "a card with a pillar that isn't Daydeck's is refused");
  const noKey = await call("/l/share", { text: "Hi", pillar: "Rest" });
  check(noKey.status === 400, "a card without a phone key is refused");
  let list = (await call("/l/list", null, { method: "GET" })).body;
  check(list.cards.length === 0, "a card waiting to be checked is not in the public list");
  const q0 = await call("/l/queue", null, { method: "GET" });
  check(q0.status === 403, "the waiting list needs alex's password");
  const q = (await call("/l/queue", null, { method: "GET", admin: true })).body;
  check(q.wait.length === 1 && q.wait[0].text === "Send a voice note binstead/b of a text" && q.wait[0].name === "Sam", "alex sees it waiting, with angle brackets and extra spaces taken out");
  let st = (await call("/l/status", { key: hex(1), ids: [a.body.id] })).body.status;
  check(st[a.body.id] === "wait", "the maker's phone sees it waiting");
  check((await call("/l/status", { key: hex(9), ids: [a.body.id] })).body.status[a.body.id] === "gone", "another phone can't see someone else's card's state");
  const r = await call("/l/review", { id: a.body.id, ok: true, text: "Send a voice note instead of a text", name: "Sam" }, { admin: true });
  check(r.status === 200, "alex can say Yes, with the words fixed");
  list = (await call("/l/list", null, { method: "GET" })).body;
  check(list.cards.length === 1 && list.cards[0].text === "Send a voice note instead of a text" && list.cards[0].up === 0 && list.cards[0].mind[0] === "See them more", "a Yes card is in the public list with the fixed words");
  check(!("owner" in list.cards[0]) && !("who" in list.cards[0]), "the public list never shows who shared it");
  check((await call("/l/up", { key: hex(1), id: a.body.id })).body.error === "own card", "the maker can't thumbs-up their own card");
  await call("/l/up", { key: hex(2), id: a.body.id }); await call("/l/up", { key: hex(2), id: a.body.id }); await call("/l/up", { key: hex(3), id: a.body.id, }, { ip: "2.2.2.2" });
  list = (await call("/l/list", null, { method: "GET" })).body;
  check(list.cards[0].up === 2, `thumbs count once per phone (${list.cards[0].up})`);
  const b = await call("/l/share", { key: hex(4), text: "Something rude", name: "", pillar: "Rest" });
  await call("/l/review", { id: b.body.id, ok: false }, { admin: true });
  check((await call("/l/list", null, { method: "GET" })).body.cards.length === 1, "a No card never shows");
  check((await call("/l/status", { key: hex(4), ids: [b.body.id] })).body.status[b.body.id] === "no", "its maker's phone knows it was a No (and says nothing)");
  check((await call("/l/up", { key: hex(2), id: b.body.id })).body.error === "gone", "a No card can't get thumbs");
  let n = 0; for (let i = 0; i < 12; i++) if ((await call("/l/share", { key: hex(5), text: "Card " + i, pillar: "Move" }, { ip: "3.3.3.3" })).body.ok) n++;
  check(n === 10, `one internet address can share 10 cards a day (${n})`);
  await call("/l/unshare", { key: hex(9), ids: [a.body.id] });
  check((await call("/l/list", null, { method: "GET" })).body.cards.length === 1, "someone else can't take a card down");
  await call("/l/unshare", { key: hex(1), ids: [a.body.id] });
  check((await call("/l/list", null, { method: "GET" })).body.cards.length === 0 && store.sql.exec("SELECT COUNT(*) AS c FROM libups").one().c === 0, "the maker can take it back down, thumbs and all");
  await call("/t/wipe", {}, { admin: true });
  check(store.sql.exec("SELECT COUNT(*) AS c FROM lib").one().c > 0, "deleting tester data leaves the library alone");
  done();
})();
