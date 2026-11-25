// Sending a ping to a phone (Web Push). Shared by the timed nudges (worker.js) and friend notifications (friends.js).
// Timed nudges are empty: the phone picks their words. A friend notification carries a few words of its own (whose
// moment it was), sealed so only that one phone can read them: the phone makers' push services only ever see
// scrambled bytes (RFC 8291, "aes128gcm").

const enc = new TextEncoder();
const CONTACT = "https://daydeck.day/";
export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s) => { const t = atob(String(s).replace(/-/g, "+").replace(/_/g, "/")); const a = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i); return a; };
const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

// Only the phone makers' own push services, so the service can't be used to call anywhere else.
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
export function pushable(endpoint) {
  try {
    const u = new URL(endpoint);
    return endpoint.length < 1000 && u.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}

// The service's own signing keys (the Keys store in worker.js).
export const vapid = (env) => env.KEYS.get(env.KEYS.idFromName("vapid")).get();

export async function sign(claims, jwk) {
  const part = (o) => b64u(enc.encode(JSON.stringify(o)));
  const data = `${part({ typ: "JWT", alg: "ES256" })}.${part(claims)}`;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return `${data}.${b64u(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(data)))}`;
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// Seals the words for one phone, using the two keys the phone gave when it signed up for pings (p256dh and auth).
export async function seal(text, p256dh, auth) {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  const mine = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const as = new Uint8Array(await crypto.subtle.exportKey("raw", mine.publicKey));
  const theirs = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: theirs }, mine.privateKey, 256));
  const ikm = await hmac(await hmac(secret, shared), cat(enc.encode("WebPush: info\0"), ua, as, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16)), prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(enc.encode(text), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([as.length]), as, body);   // record size 4096
}

// Sends a ping. With no words it's empty (timed nudges); with words they're sealed for that phone.
// Returns true when the phone has gone away for good (it switched notifications off, or Daydeck was removed).
export async function ping(env, endpoint, words = null, keys = null, ttl = 3600) {
  const k = await vapid(env);
  const jwt = await sign({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACT }, k.private);
  // "high": a "normal" ping can be held back while a phone sits idle (overnight, so mornings), then thrown
  // away when its hour runs out. These are timed nudges, so they should arrive on time.
  const headers = { TTL: String(ttl), Urgency: "high", Authorization: `vapid t=${jwt}, k=${k.public}` };
  let body = "";
  if (words != null && keys) { body = await seal(JSON.stringify(words), keys.p256dh, keys.auth); headers["Content-Encoding"] = "aes128gcm"; headers["Content-Type"] = "application/octet-stream"; }
  const res = await fetch(endpoint, { method: "POST", body, headers });
  return res.status === 404 || res.status === 410;
}
