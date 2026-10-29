// The small service behind Intentionally's notifications (first version, not final).
// It never sees a thought, a name or a pillar. Each phone tells it only *when* to send a ping, and the phone
// itself decides what the ping says. Runs on Cloudflare Workers; setup is in README.md.
import { DurableObject } from "cloudflare:workers";

const DAY = 86400000;
const APP = "https://lextdo23.github.io";
const CONTACT = "https://lextdo23.github.io/intentionally/";
// Only the phone makers' own push services, so the service can't be used to call anywhere else.
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
// A phone that hasn't opened the app for two weeks stops getting the evening question: no nagging.
const QUIET_AFTER = 14 * DAY;

const cors = { "Access-Control-Allow-Origin": APP, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type" };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const { pathname } = new URL(req.url);
    if (req.method === "GET" && pathname === "/key") return reply({ key: (await vapid(env)).public });
    if (req.method === "POST" && pathname === "/plan") {
      const body = await req.json().catch(() => null);
      if (!pushable(body?.endpoint)) return reply({ error: "bad request" }, 400);
      const later = (t) => Number.isFinite(t) && t > Date.now() - DAY && t < Date.now() + 8 * DAY ? t : null;
      await env.PHONES.get(env.PHONES.idFromName(body.endpoint)).plan(body.endpoint, later(body.timerAt), later(body.eveningAt));
      return reply({ ok: true });
    }
    return reply({ error: "not found" }, 404);
  },
};

function pushable(endpoint) {
  try {
    const u = new URL(endpoint);
    return endpoint.length < 1000 && u.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}

// One per phone: holds its address and the next times, and wakes itself up when one is due.
export class Phone extends DurableObject {
  async plan(endpoint, timerAt, eveningAt) {
    const p = { endpoint, timerAt, eveningAt, seen: Date.now() };
    await this.ctx.storage.put("plan", p);
    await this.wake(p);
  }

  async alarm() {
    const p = await this.ctx.storage.get("plan");
    if (!p) return;
    const soon = Date.now() + 30000;
    let due = false;
    if (p.timerAt && p.timerAt <= soon) { due = true; p.timerAt = null; }
    if (p.eveningAt && p.eveningAt <= soon) {
      due = Date.now() - p.seen < QUIET_AFTER;
      while (p.eveningAt <= soon) p.eveningAt += DAY;
      if (!due) p.eveningAt = null;
    }
    if (due && await ping(this.env, p.endpoint)) return this.ctx.storage.deleteAll(); // the phone unsubscribed
    await this.ctx.storage.put("plan", p);
    await this.wake(p);
  }

  async wake(p) {
    const next = Math.min(...[p.timerAt, p.eveningAt].filter(Boolean));
    if (Number.isFinite(next)) await this.ctx.storage.setAlarm(next);
    else await this.ctx.storage.deleteAll();
  }
}

// The service's own signing keys, made once and kept. Phones use the public half to know pings are really from here.
export class Keys extends DurableObject {
  async get() {
    let k = await this.ctx.storage.get("vapid");
    if (!k) {
      const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      k = { public: b64u(await crypto.subtle.exportKey("raw", pair.publicKey)), private: await crypto.subtle.exportKey("jwk", pair.privateKey) };
      await this.ctx.storage.put("vapid", k);
    }
    return k;
  }
}

const vapid = (env) => env.KEYS.get(env.KEYS.idFromName("vapid")).get();

// An empty push: no words travel. Returns true when the phone has gone away for good.
async function ping(env, endpoint) {
  const k = await vapid(env);
  const jwt = await sign({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACT }, k.private);
  const res = await fetch(endpoint, { method: "POST", body: "", headers: { TTL: "3600", Urgency: "normal", Authorization: `vapid t=${jwt}, k=${k.public}` } });
  return res.status === 404 || res.status === 410;
}

async function sign(claims, jwk) {
  const part = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const data = `${part({ typ: "JWT", alg: "ES256" })}.${part(claims)}`;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return `${data}.${b64u(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(data)))}`;
}

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
