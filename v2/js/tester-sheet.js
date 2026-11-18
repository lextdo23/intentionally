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
          h("p.sub", null, "While Daydeck is being tested, you can share how you use it with the person making it. It shows what's working and what isn't.")),
        h("div.col", { style: { gap: "8px" } }, h("span.tlabel", null, "What's shared"), list(tester.SHARED)),
        h("div.col", { style: { gap: "8px" } }, h("span.tlabel", null, "Never shared"), list(tester.NEVER)),
        h("p.sub", null, "It's kept under a random tester code on Cloudflare's servers, which may be outside Australia. The person making Daydeck looks at it from time to time, sometimes with help from Claude, an AI assistant made by Anthropic."),
        h("p.sub", null, "Nobody watches it as it comes in. If you need to talk to someone, call Lifeline on 13 11 14, or 000 in an emergency."),
        h("p.sub", null, "It's kept for as long as Daydeck is being tested. You can stop any time from Settings. What you've shared is deleted straight away, and backup copies are gone within 30 days."),
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
        h("p.sub", null, `Thank you. Your tester code is ${tester.code()}. Nothing you type is shared, unless you show a card you made to everyone.`)),
      h("div.col", { style: { gap: "8px" } }, h("span.tlabel", null, "What's shared"), list(tester.SHARED)),
      msg,
      h("div.col", { style: { gap: "4px" } }, h("button.btn-main", { onclick: () => close("done") }, "Done"), stop));
  }, { label: "Help test Daydeck", onClose: () => onDone && onDone() });
}

// After a change to what's shared (CONSENT went up): ask once before sending anything more. Until they answer,
// nothing is sent (tester.on() is false), and nothing already shared changes.
export function askAgain(onDone) {
  openSheet((panel, close) => {
    const list = (items) => h("ul.tlist", null, items.map((x) => h("li", null, x)));
    const msg = h("p.sub", { "aria-live": "polite" });
    const stop = h("button.btn-quiet", { onclick: async () => {
      stop.disabled = true; msg.textContent = "Deleting…";
      if (await tester.leave()) { msg.textContent = "Stopped. What you shared has been deleted."; stop.remove(); keep.textContent = "Done"; keep.onclick = () => close("done"); }
      else { msg.textContent = "Couldn't reach the service. Check you're online and try again."; stop.disabled = false; }
    } }, "Stop and delete what I've shared");
    const keep = h("button.btn-main", { onclick: () => { tester.agreeAgain(); close("done"); } }, "Keep sharing");
    panel.append(
      h("div.col", { style: { gap: "4px" } }, h("h2", null, "One change to what's shared"),
        h("p.sub", null, "You can now show a card you made to everyone, in the card library. Its words go to Daydeck only if you turn on Show it to everyone. What's shared while testing hasn't changed.")),
      h("div.col", { style: { gap: "8px" } }, h("span.tlabel", null, "Never shared"), list(tester.NEVER)),
      msg, h("div.col", { style: { gap: "4px" } }, keep, stop));
  }, { label: "One change to what's shared", onClose: () => onDone && onDone() });
}

// A quiet row in Settings, under Your data.
export function testerRow(onclick = () => openTester()) {
  return h("button.set-row", { onclick }, tester.on() ? `Helping test Daydeck · ${tester.code()}` : "Help test Daydeck");
}
