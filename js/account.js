// Accounts (decided with alex 2026-11-20; CLAUDE.md "Accounts"). Sign up with an email code, a username and
// Face ID (a passkey), or carry on without an account. On for everyone since 2026-11-20: new people see it first,
// and people already using the app see it once.
//
// What's kept on this phone, under "daydeck-account" (apart from "daydeck", so Save a copy never carries it):
// the sign-in key the service gave (token), the username and email, and the profile picture (one of the little
// ones, or a small cleaned photo). The profile photo never leaves the phone until the social side exists.
// Face ID itself never leaves the phone either: the iPhone keeps the passkey and only proves "yes, it's them".
//
// Tester mode hears only the steps and choices (never the email, username, code or picture).
import { h, LIFELINE } from "./util.js";
import { openSheet, roundBtn } from "./ui.js";
import { log, SERVICE } from "./tester.js";
import { clean } from "./photos.js";

const KEY = "daydeck-account";
let me = read();
function read() { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === "object" ? v : {}; } catch { return {}; } }
function keep() { try { localStorage.setItem(KEY, JSON.stringify(me)); } catch { /* storage full or blocked */ } }

export const signedIn = () => !!me.token;
export const user = () => me.user || null;
// Shown to new people (and once to people already using the app), unless they chose to carry on without one.
export const shouldAsk = () => !me.token && !me.skip;
// Accounts are on for everyone (alex 2026-11-20).
export const available = () => true;

// ---------------- Talking to the Daydeck service ----------------
async function api(path, body) {
  const opt = { method: body ? "POST" : "GET", headers: {} };
  if (body) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  if (me.token) opt.headers.Authorization = "Bearer " + me.token;
  try {
    const r = await fetch(SERVICE + path, opt), j = await r.json().catch(() => ({}));
    if (r.status === 401 && me.token && j.error === "signed_out") { forgetSignIn(); }
    return j && typeof j === "object" ? j : {};
  } catch { return { error: "offline" }; }
}
function forgetSignIn() { const was = !!me.token; delete me.token; delete me.user; keep(); if (was) tell("out"); }
// Backup (js/sync.js) listens: "in" after signing up or in, "out" after signing out or deleting.
const hooks = [];
export function onAccount(fn) { hooks.push(fn); }
function tell(what) { hooks.forEach((fn) => { try { fn(what); } catch { /* keep going */ } }); }
// For js/sync.js: talk to the service as this account.
export const call = (path, body) => api(path, body);
// This phone was emptied (Start again, Delete everything): sign out here only; the account and its backup stay.
export function forgetHere() { forgetSignIn(); }

// Once when the app opens: is the sign-in still good? (Using it also keeps it going for another 180 days.)
export async function refresh() {
  if (!me.token) return;
  const r = await api("/a/me");
  if (r.ok && r.user) { me.user = r.user; me.passkeys = r.passkeys; keep(); }
}

// ---------------- Passkeys (Face ID) ----------------
const b64u = (buf) => { const a = new Uint8Array(buf); let s = ""; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
export const passkeysOK = () => !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);

async function makePasskey(o) {
  const c = await navigator.credentials.create({ publicKey: {
    ...o, challenge: unb64u(o.challenge), user: { ...o.user, id: unb64u(o.user.id) },
    excludeCredentials: (o.excludeCredentials || []).map((x) => ({ ...x, id: unb64u(x.id) })),
  } });
  return { id: c.id, rawId: b64u(c.rawId), type: c.type, response: { clientDataJSON: b64u(c.response.clientDataJSON), attestationObject: b64u(c.response.attestationObject) } };
}
async function usePasskey(o) {
  const c = await navigator.credentials.get({ publicKey: { challenge: unb64u(o.challenge), rpId: o.rpId, userVerification: o.userVerification || "preferred", timeout: o.timeout || 60000 } });
  return { id: c.id, rawId: b64u(c.rawId), type: c.type, response: {
    clientDataJSON: b64u(c.response.clientDataJSON), authenticatorData: b64u(c.response.authenticatorData),
    signature: b64u(c.response.signature), userHandle: c.response.userHandle ? b64u(c.response.userHandle) : null } };
}

// ---------------- Profile pictures: the little ones, or a photo ----------------
// Head and shoulders, one tint on a darker shade of itself (alex 2026-11-20). Everyone starts with the smile.
const LITTLE = {
  flower: "<rect width=\"64\" height=\"64\" fill=\"#5e423d\"></rect><ellipse cx=\"32\" cy=\"59.5\" rx=\"19\" ry=\"17\" fill=\"#d9b3a6\"></ellipse><g transform=\"translate(0 2)\"><circle cx=\"32\" cy=\"27\" r=\"11\" fill=\"#d9b3a6\"></circle><g transform=\"translate(25.5 17.5)\"><circle cx=\"0\" cy=\"-2.6\" r=\"2.3\" fill=\"#efede9\"></circle><circle cx=\"2.5\" cy=\"-0.8\" r=\"2.3\" fill=\"#efede9\"></circle><circle cx=\"1.5\" cy=\"2.1\" r=\"2.3\" fill=\"#efede9\"></circle><circle cx=\"-1.5\" cy=\"2.1\" r=\"2.3\" fill=\"#efede9\"></circle><circle cx=\"-2.5\" cy=\"-0.8\" r=\"2.3\" fill=\"#efede9\"></circle><circle cx=\"0\" cy=\"0\" r=\"1.4\" fill=\"#e3c486\"></circle></g></g>",
  smile: "<rect width=\"64\" height=\"64\" fill=\"#4a4844\"></rect><ellipse cx=\"32\" cy=\"59.5\" rx=\"19\" ry=\"17\" fill=\"#cfcac1\"></ellipse><g transform=\"translate(0 2)\"><circle cx=\"32\" cy=\"27\" r=\"11\" fill=\"#cfcac1\"></circle><circle cx=\"28\" cy=\"27\" r=\"0.9\" fill=\"#6b6861\"></circle><circle cx=\"36\" cy=\"27\" r=\"0.9\" fill=\"#6b6861\"></circle><path d=\"M29.5 30 Q32 32.2 34.5 30\" fill=\"none\" stroke-linecap=\"round\" stroke=\"#6b6861\" stroke-width=\"1.2\"></path></g>",
  frog: "<rect width=\"64\" height=\"64\" fill=\"#3a4a41\"></rect><ellipse cx=\"32\" cy=\"59.5\" rx=\"19\" ry=\"17\" fill=\"#a9c4b5\"></ellipse><g transform=\"translate(0 2)\"><circle cx=\"25\" cy=\"19.5\" r=\"5\" fill=\"#a9c4b5\"></circle><circle cx=\"39\" cy=\"19.5\" r=\"5\" fill=\"#a9c4b5\"></circle><ellipse cx=\"32\" cy=\"28\" rx=\"12.5\" ry=\"10\" fill=\"#a9c4b5\"></ellipse><path d=\"M23.5 18.5 q1.5 -1.3 3 0 M37.5 18.5 q1.5 -1.3 3 0\" fill=\"none\" stroke-linecap=\"round\" stroke=\"#6f8c7d\" stroke-width=\"1.3\"></path><path d=\"M28 30 Q32 33 36 30\" fill=\"none\" stroke-linecap=\"round\" stroke=\"#6f8c7d\" stroke-width=\"1.3\"></path></g>",
  cat: "<rect width=\"64\" height=\"64\" fill=\"#3b475c\"></rect><path d=\"M15 60 C11 54 11 47 16 45\" fill=\"none\" stroke-linecap=\"round\" stroke=\"#a9b9d6\" stroke-width=\"3.2\"></path><ellipse cx=\"32\" cy=\"59.5\" rx=\"19\" ry=\"17\" fill=\"#a9b9d6\"></ellipse><g transform=\"translate(0 2)\"><path d=\"M22 24 L22.5 13.5 L29 18.5 Z M42 24 L41.5 13.5 L35 18.5 Z\" fill=\"#a9b9d6\"></path><circle cx=\"32\" cy=\"27\" r=\"11\" fill=\"#a9b9d6\"></circle><g fill=\"none\" stroke-linecap=\"round\" stroke=\"#cbd5e6\" stroke-width=\"0.8\"><path d=\"M16 29 L24 30\"></path><path d=\"M16 32.5 L24 32\"></path><path d=\"M48 29 L40 30\"></path><path d=\"M48 32.5 L40 32\"></path></g></g>",
  bunny: "<rect width=\"64\" height=\"64\" fill=\"#4b4250\"></rect><ellipse cx=\"32\" cy=\"59.5\" rx=\"19\" ry=\"17\" fill=\"#c4b4c9\"></ellipse><g transform=\"translate(0 2)\"><ellipse cx=\"27\" cy=\"13\" rx=\"3.6\" ry=\"9\" fill=\"#c4b4c9\"></ellipse><ellipse cx=\"37\" cy=\"13\" rx=\"3.6\" ry=\"9\" fill=\"#c4b4c9\"></ellipse><circle cx=\"32\" cy=\"27\" r=\"11\" fill=\"#c4b4c9\"></circle><path d=\"M30.8 29.5 H33.2 L32 31 Z\" fill=\"#9f8ea6\"></path></g>",
  bear: "<rect width=\"64\" height=\"64\" fill=\"#4d4834\"></rect><ellipse cx=\"32\" cy=\"59.5\" rx=\"19\" ry=\"17\" fill=\"#cfc59b\"></ellipse><g transform=\"translate(0 2)\"><circle cx=\"23.5\" cy=\"18.5\" r=\"4.5\" fill=\"#cfc59b\"></circle><circle cx=\"40.5\" cy=\"18.5\" r=\"4.5\" fill=\"#cfc59b\"></circle><circle cx=\"32\" cy=\"27\" r=\"11\" fill=\"#cfc59b\"></circle><ellipse cx=\"32\" cy=\"30.5\" rx=\"4.5\" ry=\"3.4\" fill=\"#ddd5b1\"></ellipse><ellipse cx=\"32\" cy=\"29.4\" rx=\"1.5\" ry=\"1.1\" fill=\"#8f8763\"></ellipse></g>",
  chick: "<rect width=\"64\" height=\"64\" fill=\"#5a4533\"></rect><ellipse cx=\"32\" cy=\"59.5\" rx=\"19\" ry=\"17\" fill=\"#f2c08f\"></ellipse><g transform=\"translate(0 2)\"><circle cx=\"32\" cy=\"27\" r=\"11\" fill=\"#f2c08f\"></circle><path d=\"M32 16.5 Q31 12 34.5 11.5 M32 16.5 Q30 13.5 28 14\" fill=\"none\" stroke-linecap=\"round\" stroke=\"#f2c08f\" stroke-width=\"2\"></path><path d=\"M30 29 L34 29 L32 31.6 Z\" fill=\"#d98f62\"></path></g>",
  sprout: "<rect width=\"64\" height=\"64\" fill=\"#4f4632\"></rect><ellipse cx=\"32\" cy=\"59.5\" rx=\"19\" ry=\"17\" fill=\"#e3c486\"></ellipse><g transform=\"translate(0 2)\"><circle cx=\"32\" cy=\"27\" r=\"11\" fill=\"#e3c486\"></circle><path d=\"M32 16.5 V11.5\" fill=\"none\" stroke-linecap=\"round\" stroke=\"#a9c4b5\" stroke-width=\"1.8\"></path><path d=\"M32 12.5 C28.5 12.5 26 10.5 25.5 7 C29 7 31.5 9 32 12.5 Z\" fill=\"#a9c4b5\"></path><path d=\"M32 11.5 C35 11 37.5 9 38.5 6 C35 6 32.5 8 32 11.5 Z\" fill=\"#a9c4b5\"></path></g>",
};
export const LITTLE_IDS = Object.keys(LITTLE);
const LITTLE_NAME = { flower: "Flower", smile: "Smile", frog: "Frog", cat: "Cat", bunny: "Bunny", bear: "Bear", chick: "Chick", sprout: "Sprout" };
let clipN = 0;
export function littleOne(id, size) {
  const n = "pc" + (++clipN), el = h("span.pic", { style: { width: size + "px", height: size + "px" }, "aria-hidden": "true" });
  el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 64 64"><clipPath id="${n}"><circle cx="32" cy="32" r="32"></circle></clipPath><g clip-path="url(#${n})">${LITTLE[id] || LITTLE.smile}</g></svg>`;
  return el;
}
export function picture(size = 56) {
  const p = me.pic || {};
  if (p.kind === "photo" && typeof p.data === "string" && p.data.startsWith("data:image/jpeg;base64,")) {
    return h("span.pic", { style: { width: size + "px", height: size + "px" }, "aria-hidden": "true" }, h("img", { src: p.data, alt: "", draggable: "false" }));
  }
  return littleOne(p.id || "smile", size);
}
// Which little one this person's picture is, for friends to see. A photo stays on this phone until photos are
// backed up (social step 4), so friends see the smile until then.
export const picId = () => { const p = me.pic || {}; return p.kind === "photo" ? "smile" : (LITTLE[p.id] ? p.id : "smile"); };
const camIcon = () => h("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
  h("path", { d: "M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" }), h("circle", { cx: "12", cy: "12.5", r: "3.2" }));

// Tap the picture: take or choose a photo, or pick one of the little ones. The phone's own picker hands over only
// the one photo chosen; Daydeck never gets the photo library.
export function choosePicture(changed) {
  openSheet((panel, close) => {
    const pick = (id) => { me.pic = { kind: "little", id }; keep(); log("avatar", id); close("done"); changed && changed(); };
    const grid = h("div.pic-grid", { role: "list" }, LITTLE_IDS.map((id) => {
      const on = (me.pic || {}).kind !== "photo" && ((me.pic || {}).id || "smile") === id;
      return h("button.pic-pick", { role: "listitem", "aria-label": LITTLE_NAME[id], "aria-pressed": String(on), onclick: () => pick(id) }, littleOne(id, 64));
    }));
    const photo = (capture) => { close("photo"); setTimeout(() => takePhoto(capture, changed), 320); };
    panel.append(h("h2", null, "Your picture"),
      h("div.col", { style: { gap: "8px" } },
        h("button.btn-soft", { style: { minHeight: "52px" }, onclick: () => photo(true) }, "Take photo"),
        h("button.btn-soft", { style: { minHeight: "52px" }, onclick: () => photo(false) }, "Choose photo")),
      h("p.pic-or", null, "Or pick a little one"), grid);
    if ((me.pic || {}).kind === "photo") panel.append(h("button.btn-quiet", { onclick: () => pick("smile") }, "Remove photo"));
  }, { label: "Your picture" });
}
function takePhoto(capture, changed) {
  const input = h("input", { type: "file", accept: "image/*", capture: capture ? "user" : null, style: { position: "fixed", left: "-200px", opacity: "0" } });
  input.addEventListener("change", () => { const f = input.files && input.files[0]; input.remove(); if (f) cropPhoto(f, changed); });
  document.body.append(input); input.click();
}
// Move and zoom the photo inside the circle. What's kept is small (240 by 240), redrawn and cleaned, so nothing
// about the original photo (where, when, which phone) survives.
function cropPhoto(file, changed) {
  const url = URL.createObjectURL(file), img = new Image();
  img.onerror = () => URL.revokeObjectURL(url);
  img.onload = () => openSheet((panel, close) => {
    const V = 260, base = V / Math.min(img.naturalWidth, img.naturalHeight);
    let zoom = 1, x = 0, y = 0;
    const pic = h("img", { src: url, alt: "", draggable: "false", style: { position: "absolute", left: "50%", top: "50%", maxWidth: "none", transformOrigin: "center" } });
    const fit = () => {
      const w = img.naturalWidth * base * zoom, hh = img.naturalHeight * base * zoom;
      x = Math.max(-(w - V) / 2, Math.min((w - V) / 2, x)); y = Math.max(-(hh - V) / 2, Math.min((hh - V) / 2, y));
      Object.assign(pic.style, { width: w + "px", height: hh + "px", transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` });
    };
    const view = h("div.crop", { "data-nodrag": "", style: { width: V + "px", height: V + "px" } }, pic);
    let p0 = null;
    view.addEventListener("pointerdown", (e) => { p0 = [e.clientX - x, e.clientY - y]; view.setPointerCapture(e.pointerId); });
    view.addEventListener("pointermove", (e) => { if (!p0) return; x = e.clientX - p0[0]; y = e.clientY - p0[1]; fit(); });
    view.addEventListener("pointerup", () => (p0 = null)); view.addEventListener("pointercancel", () => (p0 = null));
    const slider = h("input", { type: "range", min: "1", max: "3", step: "0.01", value: "1", "aria-label": "Zoom", class: "crop-zoom" });
    slider.addEventListener("input", () => { zoom = Number(slider.value); fit(); });
    const done = h("button.btn-main", { onclick: async () => {
      const S = 240, c = document.createElement("canvas"); c.width = S; c.height = S;
      const k = S / V, w = img.naturalWidth * base * zoom * k, hh = img.naturalHeight * base * zoom * k;
      c.getContext("2d").drawImage(img, (S - w) / 2 + x * k, (S - hh) / 2 + y * k, w, hh);
      const b = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
      const cleanB = b && await clean(b);
      if (cleanB) {
        const data = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(cleanB); });
        me.pic = { kind: "photo", data }; keep(); log("avatar", "photo");
      }
      URL.revokeObjectURL(url); close("done"); changed && changed();
    } }, "Use photo");
    panel.append(h("h2", null, "Move and zoom"), view, slider, done);
    fit();
  }, { label: "Move and zoom", onClose: (why) => { if (why !== "done") URL.revokeObjectURL(url); } });
  img.src = url;
}

// ---------------- The sign-up screens ----------------
let layer = null, timers = [], flow = {}, onDoneF = null;
const back = (to) => { const b = roundBtn("back", "Back", to); b.classList.add("acct-back"); return b; };
const msgEl = () => h("p.acct-msg", { role: "status", "aria-live": "polite" });
function clearTimers() { timers.forEach(clearInterval); timers = []; }
function show(step) {
  clearTimers();
  const el = step();
  if (!layer.firstChild) { layer.append(el); }
  else { const old = layer.firstChild; old.classList.add("out"); el.classList.add("in"); layer.append(el); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("in"))); setTimeout(() => old.remove(), 300); }
  setTimeout(() => el.querySelector("input:not([type=range]), .btn-main")?.focus({ preventScroll: true }), 320);
}
const screen = (top, bottom, { lead } = {}) => h("div.acct-screen", null, lead || null, h("div.acct-top", null, top), h("div.acct-bottom", null, bottom));
const busy = (btn, on) => { btn.setAttribute("aria-busy", on ? "true" : "false"); btn.classList.toggle("busy", on); };

export function openSignup(onDone, { from = "start" } = {}) {
  if (layer) return;
  onDoneF = onDone; flow = { from };
  layer = h("div", { id: "acct", role: "dialog", "aria-modal": "true", "aria-label": "Keep your days safe" });
  document.body.append(layer); document.body.classList.add("in-acct");
  log("signup_open", from);
  show(stepEmail);
}
function closeSignup(why) {
  if (!layer) return;
  clearTimers();
  const l = layer; layer = null;
  document.body.classList.remove("in-acct"); l.classList.add("gone");
  setTimeout(() => l.remove(), 360);
  onDoneF && onDoneF(why);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WORDS = {
  offline: "You're offline. Try again when you're back online.",
  slow_down: (r) => `You can ask for a new code in ${r.wait || 60} seconds.`,
  too_many: "That's a lot of codes. Try again in an hour.",
  busy: "Daydeck is busy right now. Try again tomorrow.",
  email_failed: "The email didn't send. Try again in a minute.",
  email_off: "Email codes aren't working right now. Try again later.",
  bad_email: "That email doesn't look right.",
  bad_code: (r) => (r.left > 0 ? `That code isn't right. ${r.left} ${r.left === 1 ? "try" : "tries"} left.` : "That code isn't right."),
  too_many_tries: "That code has stopped working. Send a new one.",
  no_code: "That code has stopped working. Send a new one.",
};
const say = (r) => { const w = WORDS[r.error]; return typeof w === "function" ? w(r) : w || "Something went wrong. Try again."; };

function stepEmail() {
  const input = h("input.acct-field", { type: "email", inputmode: "email", autocomplete: "email", autocapitalize: "off", autocorrect: "off", spellcheck: "false", placeholder: "Email", "aria-label": "Email", enterkeyhint: "go" });
  if (flow.email) input.value = flow.email;
  const msg = msgEl();
  const go = h("button.btn-main", { "aria-disabled": "true" }, "Continue");
  const ready = () => go.setAttribute("aria-disabled", String(!EMAIL.test(input.value.trim())));
  input.addEventListener("input", () => { msg.textContent = ""; ready(); });
  const send = async () => {
    if (go.getAttribute("aria-disabled") === "true" || go.classList.contains("busy")) return;
    flow.email = input.value.trim().toLowerCase();
    busy(go, true);
    const r = await api("/a/code", { email: flow.email });
    busy(go, false);
    if (r.ok) { flow.sentAt = Date.now(); log("signup_step", "code"); show(stepCode); }
    else { msg.textContent = say(r); log("signup_error", r.error || "unknown"); }
  };
  go.addEventListener("click", send);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  ready();
  return screen([
    h("div.acct-sun", { "aria-hidden": "true" }),
    h("h1.acct-title", null, "Keep your days safe"),
    h("p.acct-text", null, "Make an account so a lost or new phone never loses your days."),
    h("div.col", { style: { gap: "8px", width: "100%" } }, input, h("p.acct-note", null, "No passwords. We'll email you a 6-digit code. ", h("a.acct-link", { href: "privacy.html" }, "Your privacy")), msg),
  ], [go, h("button.btn-quiet", { onclick: withoutAccount }, "Use without an account"), LIFELINE()],
  { lead: flow.from !== "start" ? (() => { const x = roundBtn("close", "Close", () => closeSignup("closed")); x.classList.add("acct-back"); return x; })() : null });
}

function stepCode() {
  const input = h("input.acct-code-input", { type: "text", inputmode: "numeric", autocomplete: "one-time-code", "aria-label": "6-digit code" });
  const boxes = Array.from({ length: 6 }, () => h("span.acct-box"));
  const code = h("div.acct-code", null, boxes, input);
  const left = h("span.acct-left"), life = h("p.acct-life", null, "Works for ", left);
  const msg = msgEl();
  const go = h("button.btn-main", { "aria-disabled": "true" }, "Continue");
  const draw = () => { const v = input.value; boxes.forEach((b, i) => { b.textContent = v[i] || ""; b.classList.toggle("on", i === Math.min(v.length, 5) && document.activeElement === input); }); go.setAttribute("aria-disabled", String(v.length !== 6)); };
  // Typed, filled in by iPhone from Mail, or pasted ("123 456", or a whole line from the email): keep the 6 digits.
  const digits = (t) => { const c = String(t || "").replace(/[\s-]/g, ""), m = c.match(/\d{6}/); return m ? m[0] : c.replace(/\D/g, "").slice(0, 6); };
  const take = (t) => { input.value = digits(t); msg.textContent = ""; draw(); if (input.value.length === 6) verify(); };
  input.addEventListener("input", () => take(input.value));
  input.addEventListener("paste", (e) => { const t = e.clipboardData && e.clipboardData.getData("text"); if (t) { e.preventDefault(); take(t); log("signup_paste"); } });
  const paste = navigator.clipboard && navigator.clipboard.readText ? h("button.acct-paste", { onclick: async () => {
    try { const t = await navigator.clipboard.readText(); if (digits(t).length === 6) { take(t); log("signup_paste"); } else msg.textContent = "There's no 6-digit code to paste yet."; }
    catch { input.focus(); }
  } }, "Paste code") : null;
  input.addEventListener("focus", draw); input.addEventListener("blur", draw);
  // "Works for 9:42": the code stops working 10 minutes after it was sent.
  const tick = () => {
    const s = Math.max(0, Math.ceil((flow.sentAt + 10 * 60000 - Date.now()) / 1000));
    if (s > 0) { life.firstChild.textContent = "Works for "; left.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
    else { life.firstChild.textContent = "This code has stopped working. Send a new one."; left.textContent = ""; }
  };
  tick(); timers.push(setInterval(tick, 1000));
  const verify = async () => {
    if (input.value.length !== 6 || go.classList.contains("busy")) return;
    busy(go, true);
    const r = await api("/a/verify", { email: flow.email, code: input.value });
    busy(go, false);
    if (r.ok) {
      Object.assign(flow, { ticket: r.ticket, existing: !!r.existing, username: r.username || "" });
      log("signup_step", r.existing ? "back_in" : "name");
      show(r.existing ? (passkeysOK() ? stepFaceID : stepFinishNoPasskey) : stepName);
    } else { msg.textContent = say(r); input.value = ""; draw(); input.focus(); log("signup_error", r.error || "unknown"); }
  };
  go.addEventListener("click", verify);
  const again = h("button.btn-quiet", { onclick: async () => {
    if (again.classList.contains("busy")) return;
    busy(again, true);
    const r = await api("/a/code", { email: flow.email });
    busy(again, false);
    if (r.ok) { flow.sentAt = Date.now(); tick(); msg.textContent = "A new code is on its way."; input.value = ""; draw(); log("signup_resend"); }
    else msg.textContent = say(r);
  } }, "Send a new code");
  draw();
  return screen([
    h("h1.acct-title", null, "Check your email"),
    h("p.acct-text", null, "We sent a 6-digit code to ", h("b", null, flow.email)),
    code, h("div.acct-under", null, life, paste), msg,
  ], [go, again, h("p.acct-note", null, "Not there? Check your junk folder.")], { lead: back(() => show(stepEmail)) });
}

const NAME_WORDS = {
  short: "At least 3 characters.", long: "20 characters at most.", shape: "Only letters, numbers, full stops and underscores.",
  reserved: "That one's kept for Daydeck. Try another.", blocked: "Try a different one.", taken: "Taken. Try one of these:",
  dot_ends: "It can't start or end with a full stop.", dots: "Only one full stop in a row.", no_letter: "It needs at least one letter.",
};
// The same shape rules as the service (push/accounts.js nameProblem), so most problems show straight away.
function localNameProblem(n) {
  if (n.length < 3) return "short";
  if (n.length > 20) return "long";
  if (!/^[a-z0-9._]+$/.test(n)) return "shape";
  if (n.startsWith(".") || n.endsWith(".")) return "dot_ends";
  if (n.includes("..")) return "dots";
  if (!/[a-z]/.test(n)) return "no_letter";
  return null;
}
function stepName() {
  const picBtn = h("button.acct-pic", { "aria-label": "Add a photo, if you like" }, picture(104), h("span.acct-cam", { "aria-hidden": "true" }, camIcon()));
  picBtn.addEventListener("click", () => choosePicture(() => picBtn.replaceChild(picture(104), picBtn.firstChild)));
  const input = h("input.acct-field.acct-name", { type: "text", autocomplete: "username", autocapitalize: "off", autocorrect: "off", spellcheck: "false", maxlength: "20", "aria-label": "Username", placeholder: "username", enterkeyhint: "go" });
  if (flow.username) input.value = flow.username;
  const field = h("label.acct-at", null, h("span", { "aria-hidden": "true" }, "@"), input);
  const msg = msgEl(), chips = h("div.acct-chips");
  const go = h("button.btn-main", { "aria-disabled": "true" }, "Continue");
  let seq = 0, okName = null;
  const check = async () => {
    const n = input.value.trim().toLowerCase(), mine = ++seq;
    okName = null; go.setAttribute("aria-disabled", "true"); chips.replaceChildren(); msg.classList.remove("ok");
    if (!n) { msg.textContent = ""; return; }
    const p = localNameProblem(n);
    if (p) { msg.textContent = n.length < 3 ? "" : NAME_WORDS[p]; return; }
    msg.textContent = "";
    await new Promise((res) => setTimeout(res, 350));
    if (mine !== seq) return;
    msg.textContent = "Checking…"; msg.classList.add("wait");
    const r = await api("/a/name?u=" + encodeURIComponent(n));
    if (mine !== seq) return;
    msg.classList.remove("wait");
    if (r.ok) { okName = input.value.trim(); go.setAttribute("aria-disabled", "false"); msg.textContent = "That one's free."; msg.classList.add("ok"); }
    else if (r.error === "offline") msg.textContent = WORDS.offline;
    else {
      msg.textContent = NAME_WORDS[r.why] || "Try a different one.";
      (r.try || []).forEach((t) => chips.append(h("button.acct-chip", { onclick: () => { input.value = t; log("signup_suggestion"); check(); } }, "@" + t)));
    }
  };
  input.addEventListener("input", () => { input.value = input.value.replace(/\s/g, ""); check(); });
  const next = () => { if (!okName) return; flow.username = okName; log("signup_step", "faceid"); show(passkeysOK() ? stepFaceID : stepFinishNoPasskey); };
  go.addEventListener("click", next);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") next(); });
  if (input.value) check();
  return screen([
    picBtn, h("p.acct-note", { style: { marginTop: "-8px" } }, "Add a photo, if you like"),
    h("h1.acct-title", null, "Pick a username"),
    h("div.col", { style: { gap: "8px", width: "100%" } }, field, msg, chips,
      h("p.acct-note", null, "3 to 20 letters, numbers, full stops or underscores. You can change it later.")),
  ], [go], { lead: back(() => show(stepEmail)) });
}

const faceIcon = () => h("svg", { width: "60", height: "60", viewBox: "0 0 48 48", fill: "none", stroke: "currentColor", "stroke-width": "2.6", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
  ["M6 15V10a4 4 0 0 1 4-4h5", "M33 6h5a4 4 0 0 1 4 4v5", "M42 33v5a4 4 0 0 1-4 4h-5", "M15 42h-5a4 4 0 0 1-4-4v-5", "M17 18v3", "M31 18v3", "M24 18v8l-2 1", "M18 32c3.5 3 8.5 3 12 0"].map((d) => h("path", { d })));
function stepFaceID() {
  const msg = msgEl();
  const go = h("button.btn-main", null, "Continue");
  const later = h("button.btn-quiet", null, "Not now");
  go.addEventListener("click", async () => {
    if (go.classList.contains("busy")) return;
    busy(go, true); msg.textContent = "";
    const o = await api("/a/passkey/options", { ticket: flow.ticket, username: flow.username });
    if (!o.ok) { busy(go, false); return trouble(o, msg); }
    let cred;
    try { cred = await makePasskey(o.options); }
    catch { busy(go, false); msg.textContent = "Face ID didn't finish. Try again, or tap Not now."; log("signup_faceid", "stopped"); return; }
    const r = await api("/a/finish", { ticket: flow.ticket, username: flow.username, credential: cred });
    busy(go, false);
    if (r.ok) { log("signup_faceid", "yes"); return finished(r); }
    trouble(r, msg);
  });
  later.addEventListener("click", () => { log("signup_faceid", "not_now"); finishWithout(later, msg); });
  return screen([h("span.acct-face", null, faceIcon()), h("h1.acct-title", null, "Add Face ID")], [go, later, msg]);
}
// A phone that can't make passkeys: straight on, with the email code as the way back in.
function stepFinishNoPasskey() {
  const msg = msgEl(), go = h("button.btn-main", null, "Continue");
  go.addEventListener("click", () => finishWithout(go, msg));
  setTimeout(() => go.click(), 0);
  return screen([h("h1.acct-title", null, "One moment")], [go, msg]);
}
async function finishWithout(btn, msg) {
  if (btn.classList.contains("busy")) return;
  busy(btn, true);
  const r = await api("/a/finish", { ticket: flow.ticket, username: flow.username, credential: null });
  busy(btn, false);
  if (r.ok) return finished(r);
  trouble(r, msg);
}
function trouble(r, msg) {
  log("signup_error", r.error || "unknown");
  if (r.error === "name") { flow.username = ""; return show(stepName); }        // someone took it a moment ago
  if (r.error === "expired") { msg.textContent = "That took a while, so the code stopped working. Start again with your email."; setTimeout(() => show(stepEmail), 2200); return; }
  msg.textContent = r.error === "offline" ? WORDS.offline : "Something went wrong. Try again.";
}
function finished(r) {
  me.token = r.session; me.user = r.user; delete me.skip; keep();
  log("signup_done", r.created ? "new" : "back_in");
  closeSignup("done");
  tell("in");
}

// "Use without an account": one calm sheet saying what they give up.
const noIcon = (paths) => h("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, paths.map(([t, a]) => h(t, a)));
function withoutAccount() {
  log("signup_without", "asked");
  openSheet((panel, close) => {
    const point = (ic, text) => h("div.acct-point", null, h("span.acct-point-ico", null, ic), h("p", null, text));
    panel.append(h("h2", null, "Using Daydeck without an account"),
      h("div.col", { style: { gap: "16px" } },
        point(noIcon([["rect", { x: "7", y: "3", width: "10", height: "18", rx: "2.5" }], ["path", { d: "M11 18h2" }]]), "Your days stay only on this phone. If you lose it or delete Daydeck, they're gone."),
        point(noIcon([["circle", { cx: "9", cy: "9", r: "3.2" }], ["circle", { cx: "16.5", cy: "10", r: "2.6" }], ["path", { d: "M3.5 19c.8-3 3-4.6 5.5-4.6s4.7 1.6 5.5 4.6" }], ["path", { d: "M15 14.6c2.2 0 4 1.3 4.8 4" }]]), "Friends and sharing, when they come, will need an account."),
        point(noIcon([["circle", { cx: "12", cy: "12", r: "3" }], ["path", { d: "M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" }]]), "You can make one any time in Settings.")),
      h("button.btn-main", { onclick: () => { log("signup_without", "make"); close("make"); } }, "Make an account"),
      h("button.btn-quiet", { onclick: () => { close("without"); me.skip = 1; keep(); log("signup_without", "yes"); closeSignup("without"); } }, "Continue without"));
  }, { label: "Using Daydeck without an account" });
}

// ---------------- Signing in with Face ID (a new phone, or after signing out) ----------------
export async function signIn() {
  if (!passkeysOK()) return { error: "no_passkeys" };
  const o = await api("/a/signin/options", {});
  if (!o.ok) return o;
  let cred;
  try { cred = await usePasskey(o.options); } catch { log("signin", "stopped"); return { error: "stopped" }; }
  const r = await api("/a/signin", { credential: cred });
  if (r.ok) { me.token = r.session; me.user = r.user; delete me.skip; keep(); log("signin", "ok"); tell("in"); }
  else log("signin", r.error || "failed");
  return r;
}
export async function signOut() {
  await api("/a/signout", {});
  forgetSignIn(); log("signout");
}
export async function deleteAccount() {
  const r = await api("/a/delete", {});
  if (r.ok) { forgetSignIn(); log("account_delete"); }
  return r;
}

// ---------------- Settings: "Your account" ----------------
// group and linkRow come from settings.js so the rows look like every other row there.
// "Backed up 5 minutes ago" (js/sync.js status()).
function backedUp(st) {
  if (!st) return null;
  if (st.state === "full") return ["Backup is full. Save a copy to keep everything.", "#d9b3a6"];
  if (!st.last) return st.state === "offline" ? ["Backs up when you're online", "#a9a59d"] : ["Backing up…", "#a9a59d"];
  if (st.state === "offline") return ["Backs up when you're online", "#a9a59d"];
  if (st.state === "trouble") return ["Couldn't back up just now. Trying again soon.", "#a9a59d"];
  const m = Math.floor((Date.now() - st.last) / 60000), hr = Math.floor(m / 60), d = Math.floor(hr / 24);
  const when = m < 1 ? "just now" : m < 60 ? `${m} minute${m === 1 ? "" : "s"} ago` : hr < 24 ? `${hr} hour${hr === 1 ? "" : "s"} ago` : d === 1 ? "yesterday" : `${d} days ago`;
  return ["Backed up " + when, "#a9c4b5"];
}
export function settingsSection(group, linkRow, redraw, syncStatus) {
  if (!available()) return null;
  if (!signedIn()) {
    const msg = h("p.set-foot", { role: "status", "aria-live": "polite" }, "Keeps your days safe if you lose or change phones. Already have one? Sign in with Face ID, or make an account with the same email.");
    const rows = [linkRow("Make an account", null, { onclick: () => openSignup(redraw, { from: "settings" }) })];
    if (passkeysOK()) rows.push(linkRow("Sign in with Face ID", null, { onclick: async () => {
      const r = await signIn();
      if (r.ok) return redraw();
      msg.textContent = r.error === "stopped" ? "Face ID didn't finish. Try again." : r.error === "unknown_passkey" ? "That Face ID key isn't linked to an account any more. Make an account with your email instead." : r.error === "offline" ? WORDS.offline : "That didn't work. Try again, or make an account with your email.";
    } }));
    return group("Your account", rows, msg);
  }
  const u = user() || {};
  const head = h("button.set-row.acct-head", { "aria-label": "Change your picture", onclick: () => choosePicture(redraw) },
    picture(56), h("div.col", { style: { gap: "2px", minWidth: "0" } }, h("span.acct-handle", null, "@" + (u.username || "")), h("span.acct-email", null, u.email || ""),
      (() => { const b = backedUp(syncStatus && syncStatus()); return b ? h("span.acct-backup", null, h("i", { style: { background: b[1] }, "aria-hidden": "true" }), b[0]) : null; })()));
  let armed = false;
  const del = h("button.set-row", { onclick: async () => {
    if (!armed) { armed = true; del.firstChild.textContent = "Tap again to delete your account"; return; }
    const r = await deleteAccount();
    if (r.ok) redraw(); else del.firstChild.textContent = r.error === "offline" ? "You're offline. Try again later." : "That didn't work. Try again.";
  } }, h("span.set-label", { style: { color: "#d9b3a6" } }, "Delete account"));
  return group("Your account", [head,
    linkRow("Username", u.username || "", { onclick: () => rename(redraw) }),
    h("button.set-row", { onclick: async () => { await signOut(); redraw(); } }, h("span.set-label", null, "Sign out")),
    del], "Your days back up whenever you're online. Photos stay on this phone, and travel in Save a copy. Signing out keeps this phone's days; deleting your account erases your backup.");
}
function rename(redraw) {
  openSheet((panel, close) => {
    const u = user() || {};
    const input = h("input.acct-field.acct-name", { type: "text", autocapitalize: "off", autocorrect: "off", spellcheck: "false", maxlength: "20", "aria-label": "Username", value: u.username || "" });
    const msg = h("p.acct-msg", { role: "status", "aria-live": "polite" });
    const soon = u.renameAfter && u.renameAfter > Date.now();
    const save = h("button.btn-main", { onclick: async () => {
      const n = input.value.trim(), p = localNameProblem(n.toLowerCase());
      if (p) { msg.textContent = NAME_WORDS[p]; return; }
      busy(save, true);
      const r = await api("/a/username", { username: n });
      busy(save, false);
      if (r.ok) { me.user = r.user; keep(); log("rename"); close("done"); redraw(); return; }
      if (r.error === "too_soon") msg.textContent = `You can change it again on ${new Date(r.after).toLocaleDateString("en-AU", { day: "numeric", month: "long" })}.`;
      else if (r.error === "name") msg.textContent = (NAME_WORDS[r.why] || "Try a different one.") + (r.try && r.try.length ? " " + r.try.map((t) => "@" + t).join(", ") : "");
      else msg.textContent = r.error === "offline" ? WORDS.offline : "That didn't work. Try again.";
    } }, "Save");
    panel.append(h("h2", null, "Username"), h("label.acct-at", null, h("span", { "aria-hidden": "true" }, "@"), input), msg,
      h("p.acct-note", { style: { textAlign: "left" } }, soon ? `You can change it once every 30 days. Next change from ${new Date(u.renameAfter).toLocaleDateString("en-AU", { day: "numeric", month: "long" })}; changing only the capitals is fine any time.` : "You can change it once every 30 days."),
      save);
  }, { label: "Username" });
}
