// The tester sheet: what's shared and what never is, join, or stop and delete.
import { h } from "./util.js";
import { openSheet } from "./ui.js";
import * as tester from "./tester.js";

export function openTester(onDone) {
  openSheet((panel, close) => {
    const list = (items) => h("ul.tlist", null, items.map((x) => h("li", null, x)));
    if (!tester.on()) {
      panel.append(
        h("div.col", { style: { gap: "4px" } }, h("h2", null, "Help shape Daydeck"),
          h("p.sub", null, "While Daydeck is being tested, you can share how you use it with the person making it. It shows what to keep, fix and cut.")),
        h("div.col", { style: { gap: "8px" } }, h("span.tlabel", null, "What's shared"), list(tester.SHARED)),
        h("div.col", { style: { gap: "8px" } }, h("span.tlabel", null, "Never shared"), list(tester.NEVER)),
        h("p.sub", null, "It's kept under a random tester code on Cloudflare's servers, which may be outside Australia. Only the person making Daydeck can see it, and it's deleted when testing ends. You can stop any time from Settings, and what's been shared is deleted."),
        h("div.col", { style: { gap: "4px" } },
          h("button.btn-main", { onclick: () => { tester.join(); close("done"); setTimeout(() => openTester(onDone), 450); } }, "Share while testing"),
          h("button.btn-quiet", { onclick: () => close("no") }, "Not now")));
      return;
    }
    const msg = h("p.sub", { "aria-live": "polite" });
    let armed = false;
    const stop = h("button.btn-quiet", { onclick: async () => {
      if (!armed) { armed = true; stop.textContent = "Tap again to stop and delete"; return; }
      stop.disabled = true; msg.textContent = "Deleting…";
      if (await tester.leave()) { msg.textContent = "Stopped. What you shared has been deleted."; stop.remove(); }
      else { msg.textContent = "Couldn't reach the service. Check you're online and try again."; stop.disabled = false; armed = false; stop.textContent = "Stop and delete what I've shared"; }
    } }, "Stop and delete what I've shared");
    panel.append(
      h("div.col", { style: { gap: "4px" } }, h("h2", null, "You're helping test Daydeck"),
        h("p.sub", null, `Thank you. Your tester code is ${tester.code()}. Nothing you type is ever shared.`)),
      h("div.col", { style: { gap: "8px" } }, h("span.tlabel", null, "What's shared"), list(tester.SHARED)),
      msg,
      h("div.col", { style: { gap: "4px" } }, h("button.btn-main", { onclick: () => close("done") }, "Done"), stop));
  }, { label: "Help test Daydeck", onClose: () => onDone && onDone() });
}

// A quiet row in Settings, under Your data.
export function testerRow(onclick = () => openTester()) {
  return h("button.set-row", { onclick }, tester.on() ? `Helping test Daydeck · ${tester.code()}` : "Help test Daydeck");
}
