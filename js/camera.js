// The camera, inside a big card (alex 2026-11-18, option B "like Snapchat"). What you see in the card is the photo you
// get: the card's shape, with the card's words as a layer on top that you can turn off. Or pick one from your photos.
// Nothing is saved until "Use this photo".
import { h, reduceMotion } from "./util.js";
import * as store from "./store.js";
import { log } from "./tester.js";
import { roundBtn } from "./ui.js";
import * as photos from "./photos.js";

const ico = (d, fill) => h("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: fill ? "currentColor" : "none", stroke: fill ? "none" : "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, ...d.map(([t, a]) => h(t, a)));
const FLIP = [["path", { d: "M4 9a8 8 0 0 1 14.3-3.3L20 7.5M20 4v3.5h-3.5" }], ["path", { d: "M20 15a8 8 0 0 1-14.3 3.3L4 16.5M4 20v-3.5h3.5" }]];
const TXT = [["path", { d: "M5 6h14M12 6v13M9 19h6" }]];
const LIB = [["rect", { x: "4", y: "4", width: "16", height: "16", rx: "3" }], ["circle", { cx: "9", cy: "9.5", r: "1.6" }], ["path", { d: "M20 15l-4.5-4.5L6 20" }]];

export function openCamera(k, { onSaved, onClosed } = {}) {
  const st = store.get(); st.ph = st.ph || {};
  let wordsOn = st.ph.words !== 0, facing = "environment", stream = null, shot = null, src = "cam";
  const host = h("div.cam", { role: "dialog", "aria-modal": "true", "aria-label": "Take a photo" });
  const video = h("video", { playsinline: "", muted: "", autoplay: "" });
  video.muted = true;
  const still = h("canvas.cam-still", { hidden: true });
  const layer = photos.words(k);
  const win = h("div.cam-card", null, video, still, layer || "");
  const msg = h("div.cam-msg", { hidden: true });
  win.append(msg);
  const file = h("input", { type: "file", accept: "image/*", hidden: true });

  const close = () => { stop(); host.classList.remove("in"); setTimeout(() => host.remove(), reduceMotion() ? 0 : 280); onClosed && onClosed(); };
  const x = roundBtn("close", "Close the camera", close); x.classList.add("ph-glass");
  const txt = h("button.round.ph-glass.cam-txt", { "aria-label": "Card words on the photo", "aria-pressed": String(wordsOn), onclick: () => setWords(!wordsOn) }, ico(TXT));
  const flip = h("button.round.ph-glass", { "aria-label": "Switch camera", onclick: () => { facing = facing === "user" ? "environment" : "user"; start(); } }, ico(FLIP));
  const top = h("div.cam-top", null, x, h("div", { style: { display: "flex", gap: "8px" } }, layer ? txt : null, flip));
  const lib = h("button.round.cam-lib", { "aria-label": "Pick from your photos", onclick: () => file.click() }, ico(LIB));
  const shutter = h("button.cam-shutter", { "aria-label": "Take the photo", onclick: take });
  const shoot = h("div.cam-bar", null, lib, shutter, h("span.cam-gap"));
  const use = h("button.btn-main", { onclick: keep }, "Use this photo");
  const again = h("button.btn-soft", { onclick: retake }, "Retake");
  const after = h("div.cam-after", { hidden: true }, use, again);
  host.append(top, h("div.cam-mid", null, win), shoot, after, file);
  document.body.append(host);
  requestAnimationFrame(() => requestAnimationFrame(() => host.classList.add("in")));
  x.focus({ preventScroll: true });
  host.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  function setWords(on) { wordsOn = on; txt.setAttribute("aria-pressed", String(on)); layer && layer.classList.toggle("off", !on); st.ph.words = on ? 1 : 0; store.save(); }
  setWords(wordsOn);

  function stop() { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; }
  async function start() {
    stop();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return denied();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
      if (!host.isConnected) return stop();
      video.srcObject = stream; video.classList.toggle("mirror", facing === "user");
      msg.hidden = true; shutter.disabled = false; flip.hidden = false;
      await video.play().catch(() => {});
    } catch { denied(); }
  }
  function denied() {
    log("photo_cam_denied");
    shutter.disabled = true; flip.hidden = true;
    msg.hidden = false;
    msg.replaceChildren(h("p", null, "Daydeck can't use the camera."), h("p.sub", null, "You can pick a photo instead, or allow the camera in Settings, then Safari."),
      h("button.btn-soft", { onclick: () => file.click() }, "Pick a photo"));
  }
  function show(canvas) {
    shot = canvas;
    still.width = canvas.width; still.height = canvas.height; still.getContext("2d").drawImage(canvas, 0, 0);
    still.hidden = false; video.hidden = true; msg.hidden = true;
    shoot.hidden = true; after.hidden = false; flip.hidden = true;
    use.focus({ preventScroll: true });
  }
  function take() {
    if (!stream || !video.videoWidth) return;
    src = "cam";
    show(photos.toCard(video, video.videoWidth, video.videoHeight, { mirror: facing === "user" }));
    stop();
  }
  function retake() {
    shot = null; still.hidden = true; video.hidden = false;
    shoot.hidden = false; after.hidden = true;
    start();
  }
  file.addEventListener("change", async () => {
    const f = file.files && file.files[0]; file.value = "";
    if (!f) return;
    try {
      const bmp = await loadPhoto(f);
      src = "lib"; stop();
      show(photos.toCard(bmp, bmp.width || bmp.naturalWidth, bmp.height || bmp.naturalHeight));
    } catch { msg.hidden = false; msg.replaceChildren(h("p", null, "That photo didn't open. Try another one.")); }
  });
  async function keep() {
    if (!shot) return;
    use.disabled = true;
    try { await photos.save(k, shot, { src, words: wordsOn }); }
    catch { use.disabled = false; use.textContent = "Couldn't save. Try again"; return; }
    onClosed = null; close();
    onSaved && onSaved();
  }
  start();
}
// A photo from the phone, turned the right way up.
export async function loadPhoto(f) {
  if (window.createImageBitmap) { try { return await createImageBitmap(f, { imageOrientation: "from-image" }); } catch { /* older Safari */ } }
  const u = URL.createObjectURL(f);
  try { return await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; }); }
  finally { setTimeout(() => URL.revokeObjectURL(u), 1000); }
}
