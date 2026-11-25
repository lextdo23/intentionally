// Nothing about a photo is kept, only the picture (alex 2026-11-20). A made-up photo is given a pretend location
// and a comment hidden inside the file; every way a photo comes in or goes out must take them out.
// Made-up data and a made-up picture only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), p = await b.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const days = { [day(2)]: { mood: 3 }, [day(1)]: { mood: 3 }, [day(0)]: { mood: 2 } };
  await p.goto(server.url);
  await p.evaluate((days) => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: Object.keys(days).sort()[0], days, seen: { note: "sleep", testInvite: 1 } })), days);
  await p.reload(); await p.waitForTimeout(800);

  const r = await p.evaluate(async ([k0, k1, k2]) => {
    const ph = await import("./js/photos.js");
    const store = await import("./js/store.js");
    // A plain JPEG, then the same with a pretend location (an Exif part) and a comment slipped in after the start.
    const c = document.createElement("canvas"); c.width = ph.W; c.height = ph.H; const g = c.getContext("2d"); g.fillStyle = "#3c8ae0"; g.fillRect(0, 0, c.width, c.height);
    const plain = new Uint8Array(await (await new Promise((res) => c.toBlob(res, "image/jpeg", 0.8))).arrayBuffer());
    const seg = (m, text) => { const t = new TextEncoder().encode(text), len = t.length + 2; return [0xff, m, len >> 8, len & 255, ...t]; };
    const dirtyBytes = new Uint8Array([0xff, 0xd8, ...seg(0xe1, "Exif\0\0GPS -37.8136 144.9631 iPhone 15 Pro Max"), ...seg(0xfe, "secret comment"), ...plain.subarray(2)]);
    const dirty = new Blob([dirtyBytes], { type: "image/jpeg" });
    const text = (u8) => new TextDecoder("latin1").decode(u8);
    const extras = (u8) => { const out = []; let i = 2; while (i + 4 <= u8.length && u8[i] === 0xff) { const m = u8[i + 1]; if (m === 0xda) break; const len = (u8[i + 2] << 8) | u8[i + 3]; if ((m >= 0xe0 && m <= 0xef) || m === 0xfe) out.push(m.toString(16)); i += 2 + len; } return out; };
    const bad = async (blob) => { const u8 = new Uint8Array(await blob.arrayBuffer()); return extras(u8).length > 0 || /GPS|Exif|secret|iPhone/.test(text(u8)); };
    const toData = (blob) => new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(blob); });
    const decodes = async (blob) => { try { const im = new Image(); im.src = URL.createObjectURL(blob); await im.decode(); return im.naturalWidth === ph.W; } catch { return false; } };
    const out = {};

    out.dirtyIsDirty = await bad(dirty);
    const cleaned = await ph.clean(dirty);
    out.cleanRemoves = cleaned && !(await bad(cleaned));
    out.cleanStillAPicture = cleaned && await decodes(cleaned);
    out.notJpeg = (await ph.clean(new Blob([new TextEncoder().encode("not a picture")]))) === null;

    // Taking or choosing a photo: what's saved has only the picture, and no note of when or where it came from.
    await ph.save(k1, c, { src: "lib" });
    const db = await new Promise((res) => { const q = indexedDB.open("daydeck-photos", 1); q.onsuccess = () => res(q.result); });
    const get = (k) => new Promise((res) => { const q = db.transaction("p").objectStore("p").get(k); q.onsuccess = () => res(q.result); });
    const put = (k, v) => new Promise((res) => { const t = db.transaction("p", "readwrite"); t.objectStore("p").put(v, k); t.oncomplete = res; });
    const saved = await get(k1);
    out.savedClean = !(await bad(saved.full)) && !(await bad(saved.thumb));
    out.savedNoNotes = Object.keys(saved).sort().join() === "full,thumb";
    out.dayNoNotes = JSON.stringify(store.get().days[k1].ph) === '{"w":1}';

    // Restoring from a copy that carries a dirty photo.
    const n = await ph.load({ [k0]: { full: await toData(dirty), thumb: await toData(dirty), at: 12345 } });
    store.get().days[k0].ph = { w: 1 }; store.save();   // a real restore brings the day back with its photo note
    const back = await get(k0);
    out.restoreClean = n === 1 && !(await bad(back.full)) && !(await bad(back.thumb)) && !("at" in back);

    // A photo saved before this change, dirty and with the old notes: tidy() cleans it once.
    await put(k2, { full: dirty, thumb: dirty, at: 999 });
    store.get().days[k2].ph = { at: 999, w: 0, src: "cam" }; store.save();
    await ph.tidy();
    const old = await get(k2);
    out.tidyClean = !(await bad(old.full)) && !(await bad(old.thumb)) && !("at" in old);
    out.tidyNotes = JSON.stringify(store.get().days[k2].ph) === '{"w":0}';

    // Everything leaving the app: Save a copy and Save my photos.
    await put(k2, { full: dirty, thumb: dirty });
    const dump = await ph.dump();
    const fromData = (d) => { const bin = atob(d.split(",")[1]); return new Blob([Uint8Array.from(bin, (ch) => ch.charCodeAt(0))]); };
    let dumpBad = false; for (const v of Object.values(dump)) { if (await bad(fromData(v.full)) || await bad(fromData(v.thumb)) || "at" in v) dumpBad = true; }
    out.dumpClean = Object.keys(dump).length === 3 && !dumpBad;
    let filesBad = false; const fs = await ph.files(); for (const f of fs) if (await bad(f)) filesBad = true;
    out.filesClean = fs.length === 3 && !filesBad;
    return out;
  }, [day(0), day(1), day(2)]);

  check(r.dirtyIsDirty, "the made-up photo really does carry a hidden location and comment");
  check(r.cleanRemoves, "cleaning takes out the location, phone details and comment");
  check(r.cleanStillAPicture, "the cleaned photo is still the same picture");
  check(r.notJpeg, "a file that isn't a picture is refused");
  check(r.savedClean, "a new photo is saved with only the picture inside");
  check(r.savedNoNotes, "nothing is saved alongside the picture");
  check(r.dayNoNotes, "the day only notes the card-words switch: no time, no camera or library");
  check(r.restoreClean, "a photo coming back from a saved copy is cleaned");
  check(r.tidyClean, "photos saved before this are cleaned once");
  check(r.tidyNotes, "and their old notes (when, camera or library) are removed");
  check(r.dumpClean, "Save a copy carries only clean pictures");
  check(r.filesClean, "Save my photos gives only clean pictures");
  check(errors.length === 0, "no errors on the page" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
