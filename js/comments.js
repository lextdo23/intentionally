// Comments (alex 2026-11-26, CLAUDE.md "Social"): friends can say a few words under a moment. Words only, up to 280.
// Who sees a comment works like "I see you": the person who shared sees every comment; everyone else sees only their
// own friends' comments, so nobody reads words from someone they don't know (the service decides, push/friends.js).
// In the feed, a post shows "View comments" in grey, then just the latest comment you may see
// (never a count). Tapping either, or the speech bubble beside the sun, opens this page: every comment oldest
// first, and a box at the bottom to add one. Tap a comment for what you can do with it: delete your own, remove any
// on your own moment, report someone else's.
// Replies and the sun (alex 2026-11-26): "Reply" under every comment; replies sit under the comment they answer, one
// level deep, folded behind "View replies" (never a count). The sun on the right is "I see you" for a comment, the
// same as on a moment: marigold once said, never a number. On your own comment there's no sun, just "Sam said I see
// you" (only your friends). Who sees a reply works like comments, and the service decides.
//
// Tester mode hears only that a comment was opened, written, replied to, deleted, reported or given the sun, never the words.
import { h } from "./util.js";
import { openSheet } from "./ui.js";
import { log } from "./tester.js";
import * as account from "./account.js";
import * as friends from "./friends.js";
import { ago, sunIcon } from "./moments.js";

export const bubbleIcon = () => friends.svg(27, [["path", { d: "M4.5 12a7.5 7 0 1 1 3.2 5.7L4 19l1.1-3.4A6.8 6.8 0 0 1 4.5 12z" }]]);
const lock = () => friends.svg(13, [["rect", { x: "5", y: "11", width: "14", height: "9", rx: "2" }], ["path", { d: "M8 11V8a4 4 0 0 1 8 0v3" }]]);
const first = (p) => (p.name ? p.name.split(" ")[0] : "@" + p.username);
const plain = (p) => (p.name ? p.name.split(" ")[0] : p.username);   // "sherrie", without the @ (alex 2026-11-26)
const names = (list) => { const n = list.map(friends.shown); return n.length <= 2 ? n.join(" and ") : `${n[0]}, ${n[1]} and ${n.length - 2 === 1 ? "1 other" : n.length - 2 + " others"}`; };

// Under a post's caption (alex 2026-11-27): "View comments" in grey, then the latest comment you may see. The grey
// line is what tells the caption and the comments apart, so the spacing all stays even. Nothing when there are none.
export function preview(m, open) {
  if (!m.last) return null;
  const c = m.last;
  return h("div.cm-preview", null,
    h("button.cm-all", { type: "button", onclick: () => open("feed") }, "View comments"),
    h("button.cm-last", { type: "button", onclick: () => open("feed"), "aria-label": `${friends.shown(c.by)} commented: ${c.text}. Open comments` }, h("b", null, friends.shown(c.by)), " ", c.text));
}

// The sheet with every comment and the box to write one (alex 2026-11-26: it slides up over the feed, like the
// sheets everywhere else on iPhone, in Daydeck's own look). Just the comments: the caption stays on the post. It's kept short, about 60% of the screen with only a light
// shade, so a bit of the moment's picture always shows above it. Pull it down, or tap above it, to close. m is the moment
// (needs id, mine and by). changed(moment) is told the moment's new latest comment whenever the list changes, so the
// post under it can redraw.
export function openComments(m, { from = "feed", changed, focus = false } = {}) {
  let list = null, problem = false, sending = false, closeSheet = () => {}, listEl = null, field = null, btn = null, panelEl = null;
  let replyTo = null, replyBar = null, seeing = false, anim = null;
  const open = new Set();   // the threads showing their replies
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
  // One comment (or reply): tap the words for what you can do with it, "Reply" under it, the sun on the right.
  const row = (c, small) => {
    const main = h("button.cm-main", { type: "button", "aria-label": `${friends.shown(c.by)}, ${ago(c.at)}: ${c.text}. More` },
      h("span.cm-who", null, h("b", null, friends.shown(c.by)), h("span.cm-when", null, ago(c.at))), h("span.cm-text", null, c.text));
    main.addEventListener("click", () => actions(c));
    const seers = c.mine && c.seers && c.seers.length ? h("span.cm-seers", null, h("span.cm-sun-s", { "aria-hidden": "true" }, sunIcon(true)), `${names(c.seers)} said I see you`) : null;
    const foot = h("div.cm-foot", null, h("button.cm-reply", { type: "button", onclick: () => startReply(c), "aria-label": `Reply to ${friends.shown(c.by)}` }, "Reply"), seers);
    let see = null;
    if (!c.mine) {
      see = h("button.mo-see.cm-see", { type: "button", "aria-pressed": String(!!c.seen), "aria-label": c.seen ? "You said I see you. Tap to take it back" : "I see you" }, sunIcon(c.seen));
      if (anim && anim.id === c.id) { see.classList.add(anim.on ? "see-on" : "see-off"); anim = null; }
      see.addEventListener("click", () => sun(c));
    }
    return h("div.cm-row" + (small ? ".cm-sub" : ""), { role: "listitem", "data-id": c.id },
      friends.pic(c.by, small ? 24 : 32), h("div.cm-body", null, main, foot), see);
  };
  // The sun: changes straight away (with the same eclipse as on a moment), and back if the service says no.
  const sun = async (c) => {
    if (seeing) return;
    const was = !!c.seen;
    c.seen = !was; anim = { id: c.id, on: c.seen }; draw();
    seeing = true;
    const r = await account.call("/a/f/csee", { id: c.id, undo: was });
    seeing = false;
    if (!r.ok) { c.seen = was; draw(); return friends.note(friends.say(r)); }
    log("csee", was ? 0 : 1);
    const now = r.comments.find((x) => x.id === c.id);
    take(r);
    if (!now || !!now.seen !== c.seen) draw();   // only if it differs, so the animation plays through
  };
  // Replying (alex 2026-11-26, the way Instagram does it): one small line above the box, "Replying to sherrie" with ×,
  // and the box says "Add a reply". The comment itself isn't marked.
  const startReply = (c) => {
    replyTo = c;
    open.add(c.parent || c.id);
    replyBar.replaceChildren(h("span", null, "Replying to ", h("b", null, plain(c.by))),
      h("button.cm-stop", { type: "button", "aria-label": "Stop replying", onclick: stopReply }, friends.svg(14, [["path", { d: "M6 6l12 12M18 6L6 18" }]], { "stroke-width": "2.4" })));
    replyBar.hidden = false;
    field.placeholder = "Add a reply";
    field.focus();
  };
  const stopReply = () => {
    replyTo = null; replyBar.hidden = true;
    field.placeholder = m.mine ? "Add a comment" : `Add a comment for ${first(m.by || {})}`;
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
    const to = replyTo;
    const r = await account.call("/a/f/comment", to ? { id: m.id, text, parent: to.id } : { id: m.id, text });
    sending = false; btn.removeAttribute("aria-busy");
    if (!r.ok) return friends.note(friends.say(r));
    log("comment", { own: m.mine ? 1 : 0, from, reply: to ? 1 : 0 });
    field.value = ""; fit(); take(r);
    if (to) { open.add(to.parent || to.id); stopReply(); }
    draw();
    requestAnimationFrame(() => {
      const el = r.comment && listEl.querySelector(`[data-id="${r.comment}"]`);
      if (to && el) el.scrollIntoView({ block: "nearest" }); else listEl.scrollTop = listEl.scrollHeight;
    });
  };

  // Only the list redraws; the box stays put, so what's typed and the keyboard are never lost.
  const draw = () => {
    const parts = [];
    if (problem === "gone") parts.push(h("p.cm-empty", null, "This moment isn't shared any more."));
    else if (problem) parts.push(h("div.cm-empty", null, h("p", null, "Can't reach Daydeck right now."), friends.small("Try again", () => { problem = false; draw(); load(); })));
    else if (!list) parts.push(h("div.cm-empty", null, h("span.fr-ring", { role: "status", "aria-label": "Loading" })));
    else if (!list.length) parts.push(h("p.cm-empty", null, "No comments yet."));
    else {
      // Each comment, then its replies (or "View replies" while they're folded away).
      const kids = {};
      for (const c of list) if (c.parent) (kids[c.parent] ||= []).push(c);
      const rows = [];
      for (const c of list.filter((x) => !x.parent)) {
        rows.push(row(c));
        const k = kids[c.id];
        if (!k) continue;
        const showing = open.has(c.id);
        if (showing) rows.push(...k.map((x) => row(x, true)));
        rows.push(h("button.cm-more", { type: "button", "aria-expanded": String(showing), onclick: () => { if (showing) open.delete(c.id); else open.add(c.id); draw(); } },
          h("span.cm-line", { "aria-hidden": "true" }), showing ? "Hide replies" : "View replies"));
      }
      parts.push(h("div.cm-list", { role: "list", "aria-label": "Comments" }, rows));
    }
    listEl.replaceChildren(...parts);
    if (problem === "gone") panelEl.querySelector(".cm-compose").hidden = true;
    if (replyTo && list && !list.some((x) => x.id === replyTo.id)) stopReply();   // the comment went while replying
  };

  // The iPhone keyboard covers the bottom of the screen. While it's up the sheet shrinks to fit what's in it and sits
  // just above the keyboard, never past the top of the screen (2026-11-26). On a Home Screen app iPhone doesn't make
  // the page shorter: it shrinks the visible part and may slide it up, so both are measured.
  const vv = window.visualViewport;
  let topGap = 75;
  const lift = () => {
    if (!panelEl || !vv) return;
    const up = innerHeight - vv.height > 120 || (field && document.activeElement === field && innerHeight - vv.height > 40);
    panelEl.classList.toggle("kb", up);
    panelEl.style.bottom = up ? Math.max(0, innerHeight - vv.height - vv.offsetTop) + "px" : "";
    panelEl.style.maxHeight = up ? Math.max(200, vv.height - topGap) + "px" : "";
  };

  openSheet((panel, close) => {
    closeSheet = close; panelEl = panel;
    panel.classList.add("cm-sheet");
    field = h("textarea.fr-field.cm-field", { rows: "1", maxlength: "280", enterkeyhint: "send", placeholder: m.mine ? "Add a comment" : `Add a comment for ${first(m.by || {})}`, "aria-label": "Add a comment" });
    // Send: a round arrow inside the box, faint until there's something to send, then marigold (alex 2026-11-26).
    btn = h("button.cm-post", { type: "button", "aria-label": "Post comment", "aria-disabled": "true" },
      friends.svg(18, [["path", { d: "M12 19V5M6 11l6-6 6 6" }]], { "stroke-width": "2.4" }));
    field.addEventListener("input", fit);
    field.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
    btn.addEventListener("click", send);
    listEl = h("div.cm-scroll", { "data-scroll": "" });
    replyBar = h("div.cm-to", { hidden: true });
    panel.append(h("h2.cm-title", null, "Comments"), listEl,
      h("div.cm-compose", null, replyBar, h("div.cm-box", null, field, btn), h("p.fr-foot.mo-only", null, lock(), " Only your friends will see it.")));
    draw();
  }, { label: "Comments", onClose: () => { if (vv) { vv.removeEventListener("resize", lift); vv.removeEventListener("scroll", lift); } } });
  if (vv) {
    vv.addEventListener("resize", lift); vv.addEventListener("scroll", lift);
    const probe = h("div", { style: { position: "fixed", top: "0", height: "var(--top)", visibility: "hidden" } });
    document.body.append(probe); topGap = probe.getBoundingClientRect().height || topGap; probe.remove();
    field.addEventListener("focus", () => setTimeout(lift, 50));
    field.addEventListener("blur", () => setTimeout(lift, 50));
  }
  if (focus) setTimeout(() => field.focus(), 420);
  load();
  return { close: (why) => closeSheet(why) };
}
