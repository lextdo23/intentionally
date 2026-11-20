// Accounts service (push/accounts.js): sign up with an email code, a username and a passkey; sign in with the
// passkey; back up days; rename; sign out; delete. Runs the real service in Node with a pretend phone that makes
// real passkeys (the same maths as Face ID), and a stand-in for Resend that catches the emails. Made-up data only.
const { checker, loadWorker, fakeSql } = require("./helpers.cjs");
const { webcrypto: wc } = require("crypto");
const subtle = wc.subtle;

// ---- a tiny CBOR writer, for the pretend phone ----
function cb(v) {
  const head = (major, n) => n < 24 ? [major << 5 | n] : n < 256 ? [major << 5 | 24, n] : [major << 5 | 25, n >> 8, n & 255];
  if (typeof v === "number") return Uint8Array.from(v >= 0 ? head(0, v) : head(1, -1 - v));
  if (typeof v === "string") { const b = new TextEncoder().encode(v); return Uint8Array.from([...head(3, b.length), ...b]); }
  if (v instanceof Uint8Array) return Uint8Array.from([...head(2, v.length), ...v]);
  if (v instanceof Map) { const parts = [Uint8Array.from(head(5, v.size))]; for (const [k, x] of v) parts.push(cb(k), cb(x)); return cat(...parts); }
  throw new Error("cbor");
}
const cat = (...p) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const b64u = (b) => Buffer.from(b).toString("base64url");
const sha = async (b) => new Uint8Array(await subtle.digest("SHA-256", typeof b === "string" ? new TextEncoder().encode(b) : b));
const rawToDer = (raw) => {
  const part = (x) => { let i = 0; while (i < x.length - 1 && x[i] === 0) i++; x = x.slice(i); if (x[0] & 0x80) x = cat(Uint8Array.of(0), x); return cat(Uint8Array.of(2, x.length), x); };
  const body = cat(part(raw.slice(0, 32)), part(raw.slice(32)));
  return cat(Uint8Array.of(0x30, body.length), body);
};

// ---- the pretend phone: keeps passkeys, makes and signs like an iPhone ----
async function phone() {
  const keys = new Map();
  return {
    async create(options, { origin = "https://daydeck.day", rp = options.rp.id } = {}) {
      const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      const jwk = await subtle.exportKey("jwk", pair.publicKey), id = wc.getRandomValues(new Uint8Array(16));
      keys.set(b64u(id), pair.privateKey);
      const cose = cb(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]));
      const authData = cat(await sha(rp), Uint8Array.of(0x45), new Uint8Array(4), new Uint8Array(16), Uint8Array.of(0, id.length), id, cose);
      const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin }));
      return { id: b64u(id), rawId: b64u(id), type: "public-key", response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(cb(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]))) } };
    },
    async sign(options, { origin = "https://daydeck.day", count = 0, which } = {}) {
      const [id, key] = which ? [which, keys.get(which)] : [...keys.entries()].pop();
      const authData = cat(await sha(options.rpId), Uint8Array.of(0x05), Uint8Array.of(0, 0, 0, count));
      const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin }));
      const raw = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, cat(authData, await sha(clientDataJSON))));
      return { id, rawId: id, type: "public-key", response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authData), signature: b64u(rawToDer(raw)) } };
    },
  };
}

(async () => {
  const { check, done } = checker();
  const mod = await loadWorker(), worker = mod.default;
  // Cloudflare's storage, played by Node.
  const made = {};
  const ns = (Cls, env) => ({ idFromName: (n) => n, get: (n) => made[Cls.name + n] ||= (() => { const sql = fakeSql(); return new Cls({ storage: { sql, deleteAll: async () => { sql.exec("DELETE FROM b"); } } }, env); })() });
  const env = {}; env.ACCOUNTS = ns(mod.Accounts, env); env.VAULTS = ns(mod.Vault, env);
  // Resend, played by a stand-in that keeps every email.
  const mail = []; let mailOk = true;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com/")) { mail.push({ auth: init.headers.Authorization, ...JSON.parse(init.body) }); return new Response("{}", { status: mailOk ? 200 : 500 }); }
    return realFetch(url, init);
  };
  const call = async (method, path, body, { token, ip = "203.0.113.5", origin = "https://daydeck.day" } = {}) => {
    const headers = { Origin: origin, "CF-Connecting-IP": ip };
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = "Bearer " + token;
    const res = await worker.fetch(new Request("https://service.example" + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, cors: res.headers.get("Access-Control-Allow-Origin"), ...(await res.json()) };
  };
  const codeFor = (email) => { const m = [...mail].reverse().find((x) => x.to[0] === email); return m && /(\d{6})/.exec(m.subject)[1]; };

  // ---- Email codes ----
  let r = await call("POST", "/a/code", { email: "mia@example.com" });
  check(r.error === "email_off", "with no Resend key set, no code is sent (and it says why)");
  env.RESEND_API_KEY = "re_made_up_for_testing";
  r = await call("POST", "/a/code", { email: "not an email" });
  check(r.error === "bad_email", "a made-up email shape is refused");
  r = await call("POST", "/a/code", { email: "  Mia@Example.com " });
  check(r.ok && mail.length === 1, "a code is emailed");
  const m1 = mail[0];
  check(m1.from === "Daydeck <hello@daydeck.day>" && m1.to[0] === "mia@example.com" && m1.auth === "Bearer re_made_up_for_testing", "from hello@daydeck.day, to the tidied address, using the secret key");
  check(/^\d{6} is your Daydeck code$/.test(m1.subject) && m1.text.includes(codeFor("mia@example.com")) && !/https?:\/\//.test(m1.text + m1.html), "the code is in the subject and the email, and there's no link to tap");
  check(r.cors === "https://daydeck.day", "the service answers daydeck.day");
  r = await call("POST", "/a/code", { email: "mia@example.com" });
  check(r.error === "slow_down" && r.wait > 0, "asking again straight away is told to wait a moment");
  r = await call("POST", "/a/verify", { email: "mia@example.com", code: "000000" === codeFor("mia@example.com") ? "111111" : "000000" });
  check(r.error === "bad_code" && r.left === 4, "a wrong code is refused, with tries left");
  r = await call("POST", "/a/verify", { email: "mia@example.com", code: codeFor("mia@example.com") });
  check(r.ok && r.ticket && r.existing === false, "the right code gives a ticket to finish signing up");
  const ticket = r.ticket;
  r = await call("POST", "/a/verify", { email: "mia@example.com", code: codeFor("mia@example.com") });
  check(r.error === "no_code", "a code only works once");

  // ---- Usernames ----
  const name = async (u) => call("GET", "/a/name?u=" + encodeURIComponent(u));
  check((await name("ab")).why === "short" && (await name("a".repeat(21))).why === "long", "too short and too long are refused");
  check((await name("mia k")).why === "shape" && (await name(".mia")).why === "dot_ends" && (await name("mia.")).why === "dot_ends" && (await name("mia..k")).why === "dots", "spaces, a full stop at either end and double full stops are refused");
  check((await name("12345678")).why === "no_letter", "a name needs at least one letter (so it can't look like a code or phone number)");
  const sneaky = ["<script>", "mia'--", "a\"b", "mia;drop", "ｍｉａ", "\u0430dmin", "mia\u200bk", "mia/../k", "%3cb%3e", "mia@x", "mia-k", "😀mia"];
  const outs = await Promise.all(sneaky.map(name));
  check(outs.every((o) => o.ok === false && o.why === "shape"), "code, quote marks, lookalike letters from other alphabets, invisible characters and emoji are all refused");
  check((await name("adm1n_mia")).why === "reserved" && (await name("dayd3ck")).why === "reserved" && (await name("he1p")).why === "reserved" && (await name("sh1t.x")).why === "blocked", "numbers standing in for letters can't sneak past (adm1n, dayd3ck, he1p)");
  check((await name("api")).why === "reserved" && (await name("everyone")).why === "reserved", "words the app may need later (api, everyone) are kept");
  check((await name("Daydeck_HQ")).why === "reserved" && (await name("support")).why === "reserved" && (await name("the.official")).why === "reserved" && (await name("lifeline")).why === "reserved", "names posing as Daydeck, staff or a crisis line are refused");
  check((await name("shit_happens")).why === "blocked", "offensive words are refused");
  check((await name("Mia.K")).ok, "a good name is free");

  // ---- Saving a passkey (Face ID) ----
  const ph = await phone();
  r = await call("POST", "/a/passkey/options", { ticket, username: "Mia.K" });
  check(r.ok && r.options.rp.id === "daydeck.day" && r.options.authenticatorSelection.residentKey === "required" && r.options.user.name === "@Mia.K", "Face ID is asked to save a passkey for daydeck.day, named @Mia.K");
  const wrongSite = await (await phone()).create(r.options, { origin: "https://evil.example" });
  let f = await call("POST", "/a/finish", { ticket, username: "Mia.K", credential: wrongSite });
  check(f.error === "bad_passkey", "a passkey made on another website is refused");
  r = await call("POST", "/a/passkey/options", { ticket, username: "Mia.K" });
  const cred = await ph.create(r.options);
  f = await call("POST", "/a/finish", { ticket, username: "Mia.K", credential: cred });
  check(f.ok && f.session && f.created && f.passkey && f.user.username === "Mia.K", "signing up finishes: account made, passkey saved, signed in");
  const s1 = f.session;
  r = await call("POST", "/a/finish", { ticket, username: "Mia.K", credential: cred });
  check(r.error === "expired", "the same ticket can't be used twice");
  r = await call("GET", "/a/me", null, { token: s1 });
  check(r.ok && r.user.username === "Mia.K" && r.user.email === "mia@example.com" && r.passkeys === 1, "signed in, the account shows its username, email and one passkey");
  r = await name("MIA.K");
  check(r.why === "taken" && r.try.length >= 2 && r.try.every((x) => x !== "mia.k" && /^[a-z0-9._]{3,20}$/.test(x)), `a taken name (any capitals) gets suggestions: ${r.try.join(", ")}`);

  // ---- Signing in with the passkey ----
  r = await call("POST", "/a/signin/options", {});
  check(r.ok && r.options.rpId === "daydeck.day" && r.options.challenge, "sign-in asks Face ID for a daydeck.day passkey");
  let a = await ph.sign(r.options, { count: 1 });
  let si = await call("POST", "/a/signin", { credential: a });
  check(si.ok && si.session && si.user.username === "Mia.K", "Face ID signs in");
  si = await call("POST", "/a/signin", { credential: a });
  check(si.error === "expired", "a sign-in can't be replayed");
  r = await call("POST", "/a/signin/options", {});
  a = await ph.sign(r.options); const sig = Buffer.from(a.response.signature, "base64url"); sig[sig.length - 3] ^= 1; a.response.signature = b64u(sig);
  check((await call("POST", "/a/signin", { credential: a })).error === "bad_passkey", "a tampered signature is refused");
  r = await call("POST", "/a/signin/options", {});
  check((await call("POST", "/a/signin", { credential: await ph.sign(r.options, { origin: "https://evil.example" }) })).error === "bad_passkey", "a sign-in from another website is refused");
  const stranger = await phone();
  r = await call("POST", "/a/passkey/options", { ticket, username: "x" });
  check(r.error === "expired", "options need a fresh ticket or a session");

  // ---- Backup ----
  r = await call("GET", "/a/backup", null, { token: s1 });
  check(r.ok && r.data === null && r.at === 0, "a new account's backup is empty");
  const days = { days: { "2026-11-19": { mood: 3, notes: "made-up words" } } };
  r = await call("POST", "/a/backup", { data: days, base: 0 }, { token: s1 });
  check(r.ok && r.at > 0, "days are backed up");
  const at1 = r.at;
  r = await call("GET", "/a/backup", null, { token: si.session || s1 });
  check(r.ok && r.data.days["2026-11-19"].mood === 3 && r.at === at1, "the backup reads back");
  r = await call("POST", "/a/backup", { data: { days: {} }, base: at1 - 5 }, { token: s1 });
  check(r.conflict && r.data.days["2026-11-19"], "a phone with an older backup doesn't overwrite a newer one; it gets the newer one back to merge");
  check((await call("GET", "/a/backup")).status === 401, "a backup can't be read without signing in");

  // ---- Staying signed in: using the app pushes the end back (alex 2026-11-20) ----
  { const book = made["Accountsbook"], DAYMS = 864e5;
    book.sql.exec("UPDATE sessions SET exp = ?", Date.now() + 3 * DAYMS);   // pretend this sign-in has 3 days left
    check((await call("GET", "/a/me", null, { token: s1 })).ok, "a sign-in near its end still works");
    const left = Math.max(...book.sql.exec("SELECT exp FROM sessions").toArray().map((x) => x.exp)) - Date.now();
    check(left > 179 * DAYMS, "and using the app renews it for another 180 days, so nobody has to sign in again"); }

  // ---- Username changes ----
  r = await call("POST", "/a/username", { username: "mia.k" }, { token: s1 });
  check(r.ok && r.user.username === "mia.k", "changing only the capitals is always fine");
  r = await call("POST", "/a/username", { username: "mia.knew" }, { token: s1 });
  check(r.error === "too_soon" && r.after > Date.now(), "a new name has to wait 30 days after the last change");

  // ---- Back in after losing the passkey: email code, then Face ID again or not ----
  mail.length = 0;
  r = await call("POST", "/a/code", { email: "mia@example.com" }, { ip: "203.0.113.9" });
  check(r.error === "slow_down" || r.ok, "a second code can be asked for (after a minute)");
  // Pretend a minute has passed: clear the gap for this test only.
  const bookObj = made["Accountsbook"]; bookObj.sql.exec("UPDATE sends SET at = at - 120000");
  r = await call("POST", "/a/code", { email: "mia@example.com" }, { ip: "203.0.113.9" });
  r = await call("POST", "/a/verify", { email: "mia@example.com", code: codeFor("mia@example.com") });
  check(r.ok && r.existing === true && r.username === "mia.k", "an existing email gets a ticket to get back in, and is told its username");
  f = await call("POST", "/a/finish", { ticket: r.ticket, credential: null });
  check(f.ok && f.session && f.created === false && f.passkey === false, "getting back in works even without Face ID");

  // ---- Wrong codes run out ----
  bookObj.sql.exec("UPDATE sends SET at = at - 120000");
  await call("POST", "/a/code", { email: "josh@example.com" }, { ip: "198.51.100.7" });
  for (let i = 0; i < 5; i++) await call("POST", "/a/verify", { email: "josh@example.com", code: "999999" === codeFor("josh@example.com") ? "888888" : "999999" });
  r = await call("POST", "/a/verify", { email: "josh@example.com", code: codeFor("josh@example.com") });
  check(r.error === "too_many_tries" || r.error === "no_code", "after 5 wrong tries the code stops working");

  // ---- Email trouble ----
  mailOk = false;
  r = await call("POST", "/a/code", { email: "sam@example.com" }, { ip: "198.51.100.8" });
  check(r.error === "email_failed", "if the email can't be sent, it says so");
  mailOk = true;

  // ---- Daily cap, to stay inside Resend's free plan ----
  bookObj.sql.exec("DELETE FROM sends");
  let last;
  for (let i = 0; i < 91; i++) last = await call("POST", "/a/code", { email: `person${i}@example.com` }, { ip: `192.0.2.${i}` });
  check(last.error === "busy", "after 90 emails in a day, codes pause until tomorrow");

  // ---- Delete ----
  r = await call("POST", "/a/delete", {}, { token: s1 });
  check(r.ok, "the account is deleted");
  check((await call("GET", "/a/me", null, { token: f.session })).status === 401, "every sign-in for it stops working");
  check((await call("GET", "/a/backup", null, { token: s1 })).status === 401, "its backup can't be read");
  const v = made["Vault" + Object.keys(made).find((k) => k.startsWith("Vault")).slice(5)];
  check(v.read().data === null, "its backup is erased");
  check((await name("mia.k")).why === "taken", "its name stays held for a while, so nobody can pose as them");
  r = await call("POST", "/a/signin/options", {});
  check((await call("POST", "/a/signin", { credential: await ph.sign(r.options) })).error === "unknown_passkey", "its passkey no longer signs in");

  // ---- Nothing kept as it is ----
  const dump = JSON.stringify(["codes", "tickets", "sessions", "sends"].map((t) => bookObj.sql.exec(`SELECT * FROM ${t}`).toArray()));
  check(!dump.includes("203.0.113") && !dump.includes(s1), "network addresses and sessions are only stored scrambled");
  globalThis.fetch = realFetch;
  done();
})();
