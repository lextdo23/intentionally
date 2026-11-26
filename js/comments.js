// Comments (alex 2026-11-26, CLAUDE.md "Social"): friends can say a few words under a moment. Words only, up to 280.
// Who sees a comment works like "I see you": the person who shared sees every comment; everyone else sees only their
// own friends' comments, so nobody reads words from someone they don't know (the service decides, push/friends.js).
// In the feed, a post shows just the latest comment you may see, then "View all comments" when there are more
// (never a count). Tapping either, or the speech bubble beside the sun, opens this page: every comment oldest
// first, and a box at the bottom to add one. Tap a comment for what you can do with it: delete your own, remove any
// on your own moment, report someone else's.
//
// Tester mode hears only that a comment was opened, written, deleted or reported, never the words.
import { h } from "./util.js";
import { openSheet } from "./ui.js";
import { log } from "./tester.js";
import * as account from "./account.js";
import * as friends from "./friends.js";
import { ago } from "./moments.js";

export const bubbleIcon = () => friends.svg(24, [["path", { d: "M4.5 12a7.5 7 0 1 1 3.2 5.7L4 19l1.1-3.4A6.8 6.8 0 0 1 4.5 12z" }]]);
const lock = () => friends.svg(13, [["rect", { x: "5", y: "11", width: "14", height: "9", rx: "2" }], ["path", { d: "M8 11V8a4 4 0 0 1 8 0v3" }]]);
const first = (p) => (p.name ? p.name.split(" ")[0] : "@" + p.username);

// The latest comment under a post, and "View all comments" when there are more. Nothing when there are none.
export function preview(m, open) {
  if (!m.last) return null;
  const c = m.last;
  return h("div.cm-preview", null,
    h("button.cm-last", { type: "button", onclick: () => open("feed"), "aria-label": `${friends.shown(c.by)} commented: ${c.text}. Open comments` }, h("b", null, friends.shown(c.by)), " ", c.text),
    m.more ? h("button.cm-all", { type: "button", onclick: () => open("feed") }, "View all comments") : null);
}

// The sheet with every comment and the box to write one (alex 2026-11-26: it slides up over the feed, like the
// sheets everywhere else on iPhone, in Daydeck's own look). It's kept short, about 60% of the screen with only a light
// shade, so a bit of the moment's picture always shows above it. Pull it down, or tap above it, to close. m is the moment
// (needs id, mine and by). changed(moment) is told the moment's new latest comment whenever the list changes, so the
// post under it can redraw.
export function openComments(m, { from = "feed", changed, focus = false } = {}) {
  let list = null, problem = false, sending = false, closeSheet = () => {}, listEl = null, field = null, btn = null, panelEl = null;
  log("comment_open", from);
  const take = (r) => {
    list = r.comments;
    if (r.moment) { Object.assign(m, { last: r.moment.last, more: r.moment.more }); changed && changed(r.moment); }
  };
  const load = async () => {
    const r = await account.call("/a/f/comments?id=" + encodeURIComponent(m.id));
    if (r.ok) take(r);
    else if (r.error === "not_found") { list = []; problem = "gone"; }
    else problem = true;
    draw();
  };
  const row = (c) => {
    const b = h("button.cm-row", { type: "button", "aria-label": `${friends.shown(c.by)}, ${ago(c.at)} ago: ${c.text}. More` },
      friends.pic(c.by, 32),
      h("span.cm-body", null, h("span.cm-who", null, h("b", null, friends.shown(c.by)), h("span.cm-when", null, ago(c.at))), h("span.cm-text", null, c.text)));
    b.addEventListener("click", () => actions(c));
    return b;
  };
  const actions = (c) => openSheet((panel, close) => {
    panel.append(h("h2", null, c.mine ? "Your comment" : friends.shown(c.by)), h("p.fr-sheet-text.cm-quote", null, c.text));
    if (c.canRemove) panel.append(h("button.btn-soft.fr-sheet-btn.danger", { type: "button", onclick: async () => {
      close("pick");
      const r = await account.call("/a/f/uncomment", { id: c.id });
      if (!r.ok) return friends.note(friends.say(r));
      log("uncomment", r.by === "own" ? "own" : "theirs");
      if (r.comments) take(r); else list = (list || []).filter((x) => x.id !== c.id);
      draw();
      friends.note(c.mine ? "Comment deleted." : "Comment removed. They aren't told.");
    } }, c.mine ? "Delete comment" : "Remove comment"));
    if (!c.mine) panel.append(h("button.btn-soft.fr-sheet-btn", { type: "button", onclick: () => { close("pick"); setTimeout(() => friends.openReport({ comment: c, pg: { close: () => closeSheet("done") } }), 300); } }, "Report"));
    panel.append(h("button.btn-quiet", { type: "button", onclick: () => close("cancel") }, "Cancel"));
  }, { label: "Comment" });

  const fit = () => { field.style.height = "auto"; field.style.height = Math.min(field.scrollHeight, 132) + "px"; btn.setAttribute("aria-disabled", String(!field.value.trim())); };
  const send = async () => {
    const text = field.value.trim();
    if (!text || sending) return;
    sending = true; btn.setAttribute("aria-busy", "true");
    const r = await account.call("/a/f/comment", { id: m.id, text });
    sending = false; btn.removeAttribute("aria-busy");
    if (!r.ok) return friends.note(friends.say(r));
    log("comment", { own: m.mine ? 1 : 0, from });
    field.value = ""; fit(); take(r); draw();
    requestAnimationFrame(() => { listEl.scrollTop = listEl.scrollHeight; });
  };

  // Only the list redraws; the box stays put, so what's typed and the keyboard are never lost.
  const draw = () => {
    const parts = [];
    // What they shared, as the first line: their caption (when there is one).
    if (m.cap && m.by) parts.push(h("div.cm-row.cm-cap", null, friends.pic(m.by, 32),
      h("span.cm-body", null, h("span.cm-who", null, h("b", null, friends.shown(m.by)), m.at ? h("span.cm-when", null, ago(m.at)) : null), h("span.cm-text", null, m.cap))));
    if (problem === "gone") parts.push(h("p.cm-empty", null, "This moment isn't shared any more."));
    else if (problem) parts.push(h("div.cm-empty", null, h("p", null, "Can't reach Daydeck right now."), friends.small("Try again", () => { problem = false; draw(); load(); })));
    else if (!list) parts.push(h("div.cm-empty", null, h("span.fr-ring", { role: "status", "aria-label": "Loading" })));
    else if (!list.length) parts.push(h("p.cm-empty", null, "No comments yet."));
    else parts.push(h("div.cm-list", { role: "list", "aria-label": "Comments" }, list.map(row)));
    listEl.replaceChildren(...parts);
    if (problem === "gone") panelEl.querySelector(".cm-compose").hidden = true;
  };

  // The iPhone keyboard covers the bottom of the screen: lift the sheet above it while it's up.
  const vv = window.visualViewport;
  const lift = () => { if (!panelEl || !vv) return; const kb = Math.max(0, innerHeight - vv.height - vv.offsetTop); panelEl.style.bottom = kb + "px"; panelEl.classList.toggle("kb", kb > 40); };

  openSheet((panel, close) => {
    closeSheet = close; panelEl = panel;
    panel.classList.add("cm-sheet");
    field = h("textarea.fr-field.cm-field", { rows: "1", maxlength: "280", enterkeyhint: "send", placeholder: m.mine ? "Add a comment" : `Add a comment for ${first(m.by || {})}`, "aria-label": "Add a comment" });
    btn = h("button.fr-btn.main.cm-post", { type: "button", "aria-disabled": "true" }, "Post");
    field.addEventListener("input", fit);
    field.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
    btn.addEventListener("click", send);
    listEl = h("div.cm-scroll", { "data-scroll": "" });
    panel.append(h("h2.cm-title", null, "Comments"), listEl,
      h("div.cm-compose", null, h("div.cm-compose-in", null, field, btn), h("p.fr-foot.mo-only", null, lock(), " Only your friends will see it.")));
    draw();
  }, { label: "Comments", onClose: () => { if (vv) { vv.removeEventListener("resize", lift); vv.removeEventListener("scroll", lift); } } });
  if (vv) { vv.addEventListener("resize", lift); vv.addEventListener("scroll", lift); }
  if (focus) setTimeout(() => field.focus(), 420);
  load();
  return { close: (why) => closeSheet(why) };
}
