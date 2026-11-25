// Friends service (push/friends.js): mutual friends by exact @username or invite link, requests that can be turned
// off, remove and block (both quiet), the 18+ tick, profiles, and everything going when an account is deleted.
// Runs the real service in Node, with made-up people.
const { checker, loadWorker, fakeSql } = require("./helpers.cjs");

(async () => {
  const { check, done } = checker();
  const mod = await loadWorker(), worker = mod.default;
  const made = {};
  const ns = (Cls, env) => ({ idFromName: (n) => n, get: (n) => made[Cls.name + n] ||= (() => { const sql = fakeSql(); return new Cls({ storage: { sql, deleteAll: async () => { sql.exec("DELETE FROM b"); } } }, env); })() });
  const env = { RESEND_API_KEY: "re_made_up_for_testing", TESTER_KEY: "made-up-tester-key-123" }; env.ACCOUNTS = ns(mod.Accounts, env); env.VAULTS = ns(mod.Vault, env); env.TESTERS = ns(mod.Testers, env);
  const mail = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com/")) { mail.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }
    return realFetch(url, init);
  };
  let ipN = 1;
  const call = async (method, path, body, token, ip) => {
    const headers = { Origin: "https://daydeck.day", "CF-Connecting-IP": ip || "203.0.113." + ipN };
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = "Bearer " + token;
    const res = await worker.fetch(new Request("https://service.example" + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, ...(await res.json()) };
  };
  // A made-up person signs up (email code, username; Face ID skipped).
  const person = async (username) => {
    ipN++;
    const email = username.toLowerCase() + "@example.com";
    await call("POST", "/a/code", { email });
    const code = /(\d{6})/.exec([...mail].reverse().find((m) => m.to[0] === email).subject)[1];
    const v = await call("POST", "/a/verify", { email, code });
    const f = await call("POST", "/a/finish", { ticket: v.ticket, username });
    const tok = f.session;
    return { tok, get: (p) => call("GET", p, null, tok), post: (p, b) => call("POST", p, b, tok) };
  };
  const mia = await person("mia.k"), josh = await person("josh_r"), sam = await person("sam"), stranger = await person("lurker");

  // ---- Signed in and 18 or over ----
  check((await call("GET", "/a/f")).status === 401, "nothing about friends without signing in");
  let r = await mia.post("/a/f/ask", { username: "josh_r" });
  check(r.status === 403 && r.error === "adult", "adding a friend needs the 18+ tick first");
  r = await mia.get("/a/f");
  check(r.ok && r.me.adult === false && r.me.username === "mia.k" && r.friends.length === 0, "the Friends screen loads before the tick, and says it isn't ticked yet");
  for (const p of [mia, josh, sam, stranger]) await p.post("/a/f/profile", { adult: true });
  r = await mia.post("/a/f/profile", { adult: false });
  check((await mia.get("/a/f")).me.adult === true, "once ticked, the 18+ tick stays ticked");

  // ---- Profile ----
  r = await mia.post("/a/f/profile", { name: "  Mia ​Khan\n ", season: "Finding my feet at the new job".padEnd(90, "!"), pic: "frog" });
  r = await mia.get("/a/f");
  check(r.me.name === "Mia Khan" && r.me.season.length === 60 && r.me.pic === "frog", "name tidied (no invisible characters or line breaks), This season kept to 60 characters, picture saved");
  check((await mia.post("/a/f/profile", { pic: "<img src=x>" })).ok && (await mia.get("/a/f")).me.pic === "smile", "a picture that isn't one of the little ones falls back to the smile");
  await mia.post("/a/f/profile", { pic: "frog" });
  check((await josh.post("/a/f/profile", { name: "Daydeck Support" })).error === "name_words" && (await josh.post("/a/f/profile", { name: "Dàydéck" })).error === "name_words", "a display name can't pose as Daydeck (even with accents)");
  check((await josh.post("/a/f/profile", { name: "José Ríos 🌿" })).ok, "real names in any language, and emoji, are welcome");
  check(!JSON.stringify(await mia.get("/a/f")).includes("@example.com"), "no email anywhere in what Friends sees");

  // ---- Finding someone: exact @username only ----
  r = await mia.get("/a/f/find?u=" + encodeURIComponent("@Josh_R"));
  check(r.found && r.person.username === "josh_r" && r.person.name === "José Ríos 🌿" && r.person.state === "none", "found by exact @username (capitals and @ don't matter)");
  check((await mia.get("/a/f/find?u=josh")).found === false && (await mia.get("/a/f/find?u=%25")).found === false, "part of a name finds nobody, so nobody can trawl the list");
  check(!("email" in r.person) && !("season" in r.person), "someone who isn't a friend yet sees only name, @username and picture");

  // ---- Asking and saying yes ----
  r = await mia.post("/a/f/ask", { username: "josh_r" });
  check(r.ok && r.state === "asked", "Mia asks Josh");
  r = await josh.get("/a/f");
  check(r.asksYou.length === 1 && r.asksYou[0].username === "mia.k" && r.friends.length === 0, "Josh sees Mia's request waiting");
  check((await mia.get("/a/f")).asked[0].username === "josh_r", "Mia sees it as asked");
  check((await mia.post("/a/f/ask", { username: "mia.k" })).error === "yourself", "you can't add yourself");
  r = await josh.post("/a/f/answer", { username: "mia.k", yes: true });
  check(r.state === "friends", "Josh says yes");
  r = await mia.get("/a/f");
  check(r.friends.length === 1 && r.friends[0].username === "josh_r" && r.asked.length === 0 && r.me.friends === 1, "they're friends both ways, and the request is gone");
  r = await mia.get("/a/f/person?u=josh_r");
  check(r.person.state === "friends" && r.person.friends === 1 && r.person.since > 0, "a friend's profile shows This season, friends count and since when");

  // Both ask each other: that's a yes.
  await sam.post("/a/f/ask", { username: "mia.k" });
  r = await mia.post("/a/f/ask", { username: "sam" });
  check(r.state === "friends", "if they already asked you, adding them back makes you friends");

  // Saying no is quiet.
  await stranger.post("/a/f/ask", { username: "mia.k" });
  r = await mia.post("/a/f/answer", { username: "lurker", yes: false });
  check(r.state === "none" && (await stranger.get("/a/f")).asked.length === 0, "saying no clears the request (and they're never told no)");
  check((await mia.post("/a/f/answer", { username: "lurker", yes: true })).status === 404, "you can't say yes to a request that isn't there");

  // ---- Requests turned off ----
  await josh.post("/a/f/profile", { closed: true });
  r = await sam.get("/a/f/find?u=josh_r");
  check(r.person.closed === true, "someone with requests off shows as not taking requests");
  check((await sam.post("/a/f/ask", { username: "josh_r" })).error === "closed", "and can't be asked");
  await josh.post("/a/f/profile", { closed: false });
  await sam.post("/a/f/ask", { username: "josh_r" });
  await sam.post("/a/f/cancel", { username: "josh_r" });
  check((await josh.get("/a/f")).asksYou.length === 0, "a request can be taken back");

  // ---- Friends in common (alex 2026-11-25) ----
  // Mia is friends with Josh and with Sam; Josh and Sam aren't friends.
  r = await josh.get("/a/f/find?u=sam");
  check(r.person.commonN === 1 && r.person.common.length === 1 && r.person.common[0].username === "mia.k", "a search result says which of your friends they know");
  check(!JSON.stringify(r.person.common).includes("@example.com") && !("season" in r.person.common[0]), "friends in common carry only name, @username and picture");
  r = await josh.get("/a/f/person?u=sam");
  check(r.person.state === "none" && r.person.commonN === 1, "so does the profile of someone you're not friends with yet");
  await sam.post("/a/f/ask", { username: "josh_r" });
  r = await josh.get("/a/f");
  check(r.asksYou[0].username === "sam" && r.asksYou[0].commonN === 1 && r.asksYou[0].common[0].username === "mia.k", "and a request waiting for you");
  r = await josh.get("/a/f/common?u=sam");
  check(r.ok && r.people.length === 1 && r.people[0].username === "mia.k" && "season" in r.people[0], "the full page lists everyone you both know");
  check((await stranger.get("/a/f/find?u=sam")).person.commonN === 0, "someone with no friends in common sees none (and nobody new is ever shown)");
  check((await mia.get("/a/f/person?u=josh_r")).person.commonN === 0, "you never count yourself or them");
  await mia.post("/a/f/profile", { hide: true });
  check((await josh.get("/a/f/find?u=sam")).person.commonN === 0 && (await josh.get("/a/f/common?u=sam")).people.length === 0, "someone with Show my friends off is never shown as a friend in common");
  await mia.post("/a/f/profile", { hide: false });
  await sam.post("/a/f/profile", { hide: true });
  check((await josh.get("/a/f/person?u=sam")).person.commonN === 0, "and their own profile shows no friends in common");
  await sam.post("/a/f/profile", { hide: false });
  check((await josh.get("/a/f/common?u=nobody_here")).status === 404, "the full page for someone who isn't there finds nothing");
  await sam.post("/a/f/cancel", { username: "josh_r" });

  // ---- Hide friends count ----
  await josh.post("/a/f/profile", { hide: true });
  check((await mia.get("/a/f/person?u=josh_r")).person.friends === null, "a hidden friends count isn't shown");

  // ---- Invite links ----
  r = await mia.post("/a/f/invite", {});
  check(r.ok && /^[A-Za-z0-9_-]{30,}$/.test(r.t), "Mia makes an invite link");
  const t1 = r.t;
  const newbie = await person("newbie");
  r = await newbie.post("/a/f/join", { t: t1 });
  check(r.ok && r.state === "asks_you" && r.person.username === "mia.k", "opening it (even before the 18+ tick) leaves Mia's request waiting");
  check((await newbie.post("/a/f/answer", { username: "mia.k", yes: true })).error === "adult", "saying yes still needs the 18+ tick");
  await newbie.post("/a/f/profile", { adult: true });
  check((await newbie.post("/a/f/answer", { username: "mia.k", yes: true })).state === "friends", "then they're friends");
  r = await mia.post("/a/f/invite", {});
  check((await stranger.post("/a/f/join", { t: t1 })).error === "old_invite", "making a new link retires the old one");
  check((await stranger.post("/a/f/join", { t: "made-up" })).error === "old_invite", "a made-up link does nothing");
  const raw = JSON.stringify(made.Accountsbook.sql.exec("SELECT * FROM invites").toArray());
  check(!raw.includes(r.t), "invite links are only kept scrambled");

  // ---- Remove (quiet) ----
  await mia.post("/a/f/remove", { username: "newbie" });
  check((await newbie.get("/a/f")).friends.length === 0 && (await mia.get("/a/f")).friends.every((f) => f.username !== "newbie"), "removing a friend ends it both ways, without any message");
  r = await newbie.get("/a/f/person?u=mia.k");
  check(r.person.state === "none" && !("season" in r.person), "once removed, their This season line isn't shown any more");

  // ---- Block (quiet, both ways) ----
  await stranger.post("/a/f/ask", { username: "mia.k" });
  await mia.post("/a/f/block", { username: "lurker" });
  check((await mia.get("/a/f")).asksYou.length === 0, "blocking clears their request");
  check((await stranger.get("/a/f/find?u=mia.k")).found === false, "someone blocked simply can't find you (they aren't told)");
  check((await stranger.post("/a/f/ask", { username: "mia.k" })).status === 404, "and can't ask again");
  check((await mia.get("/a/f/find?u=lurker")).found === false, "and you don't see them either");
  const inv = await mia.post("/a/f/invite", {});
  check((await stranger.post("/a/f/join", { t: inv.t })).error === "old_invite", "a blocked person can't use your invite link");
  check((await mia.get("/a/f")).blocked[0].username === "lurker", "Mia can see who she blocked");
  await mia.post("/a/f/block", { username: "lurker", undo: true });
  check((await stranger.get("/a/f/find?u=mia.k")).found === true, "and can unblock");

  // ---- Moments: sharing, the feed, "I see you", hiding, removing ----
  const today = "2026-11-21";
  r = await mia.post("/a/f/share", { day: today, item: "12", kind: "card", text: "Text an old friend", pillar: "Friends", col: "#d9b3a6", status: "Done", cap: "  Felt <b>nice</b>\u200b  ", mood: "good", feel: ["hopeful", "grateful"] });
  check(r.ok && r.moment.text === "Text an old friend" && r.moment.cap === "Felt <b>nice</b>" && r.moment.mood === "good" && r.moment.feel.join() === "hopeful,grateful", "Mia shares her card with a caption and how the day felt (words kept as plain text)");
  const m1 = r.moment.id;
  check((await mia.post("/a/f/share", { day: today, item: "12", kind: "card", text: "x", mood: 4 })).moment.mood === null, "a mood is only ever a word, never a number");
  r = await mia.post("/a/f/share", { day: today, item: "12", kind: "card", text: "Text an old friend", pillar: "Friends", col: "#ff0000", status: "Done", cap: "Felt nice" });
  check(r.again && r.moment.id === m1 && r.moment.col === null && r.moment.mood === null, "sharing the same card again updates it (no mood this time), and only Daydeck's tints are kept");
  check((await mia.post("/a/f/share", { day: "yesterday", item: "12", kind: "card", text: "x" })).error === "bad_moment" && (await mia.post("/a/f/share", { day: today, item: "12", kind: "spam", text: "x" })).error === "bad_moment", "anything that isn't a real day and card is refused");
  r = await sam.get("/a/f/feed");
  check(r.ok && r.moments.length === 1 && r.moments[0].by.username === "mia.k" && r.moments[0].cap === "Felt nice", "Sam, her friend, sees it in his feed");
  check((await stranger.get("/a/f/feed")).moments.length === 0 && (await stranger.get("/a/f/moments?u=mia.k")).moments.length === 0, "someone who isn't her friend sees nothing");
  check((await mia.get("/a/f/feed")).moments[0].mine === true, "Mia sees her own moment in her feed");
  r = await sam.post("/a/f/see", { id: m1 });
  check(r.ok && r.moment.seen === true, "Sam says I see you");
  await josh.post("/a/f/see", { id: m1 });
  r = await mia.get("/a/f/feed");
  check(r.moments[0].seers.map((x) => x.username).sort().join() === "josh_r,sam", "Mia sees who said it, as names (no number anywhere)");
  check(!("count" in r.moments[0]) && !JSON.stringify(r).match(/"(likes|count|total)"/), "and there's no count");
  r = await sam.get("/a/f/feed");
  check(r.moments[0].seers.map((x) => x.username).join() === "sam", "Sam (not Josh's friend) sees only himself, not Josh");
  await sam.post("/a/f/see", { id: m1, undo: true });
  check((await mia.get("/a/f/feed")).moments[0].seers.length === 1, "I see you can be taken back");
  check((await stranger.post("/a/f/see", { id: m1 })).status === 404, "someone who isn't a friend can't react");
  r = await sam.get("/a/f/moments?u=mia.k");
  check(r.moments.length === 1, "her moments show on her profile for friends");
  // Hide their moments
  await sam.post("/a/f/hide", { username: "mia.k" });
  check((await sam.get("/a/f/feed")).moments.length === 0 && (await sam.get("/a/f/person?u=mia.k")).person.hidden === true, "hiding Mia's moments takes them out of Sam's feed (still friends)");
  check((await sam.get("/a/f/moments?u=mia.k")).moments.length === 1, "her profile still shows them if he goes looking");
  await sam.post("/a/f/hide", { username: "mia.k", undo: true });
  check((await sam.get("/a/f/feed")).moments.length === 1, "and they can come back");
  // Remove friend: no more moments, and their reactions go
  await josh.post("/a/f/remove", { username: "mia.k" });
  check((await josh.get("/a/f/feed")).moments.length === 0 && (await mia.get("/a/f/feed")).moments[0].seers.length === 0, "once removed, Josh can't see her moments and his I see you is gone");
  await josh.post("/a/f/ask", { username: "mia.k" }); await mia.post("/a/f/answer", { username: "josh_r", yes: true });
  // Photos: photos first. Only a clean JPEG is taken; only friends can fetch it.
  const jpeg = (extra) => "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, ...(extra || []), 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xda, 0, 2, ...new Array(120).fill(7), 0xff, 0xd9]).toString("base64");
  const exif = [0xff, 0xe1, 0, 12, 69, 120, 105, 102, 0, 0, 1, 2, 3, 4];
  check((await mia.post("/a/f/share", { day: today, item: "photo", kind: "photo", photo: jpeg(exif) })).error === "bad_moment", "a photo still carrying details (location, time, camera) is refused");
  check((await mia.post("/a/f/share", { day: today, item: "photo", kind: "photo", photo: "data:image/png;base64,iVBORw0KGgo=" })).error === "bad_moment", "only JPEG pictures are taken");
  check((await mia.post("/a/f/share", { day: today, item: "photo", kind: "photo", photo: jpeg().padEnd(460000, "A") })).error === "bad_moment", "and only small ones (shrunk on the phone first)");
  r = await mia.post("/a/f/share", { day: today, item: "photo", kind: "photo", pillar: "Friends", col: "#d9b3a6", cap: "Coffee with Sam" });
  check(r.error === "bad_moment", "a photo moment needs its photo");
  r = await mia.post("/a/f/share", { day: today, item: "photo", kind: "photo", photo: jpeg(), pillar: "Friends", col: "#d9b3a6", cap: "Coffee with Sam" });
  check(r.ok && r.moment.ph === true && !("photo" in r.moment), "a clean photo is shared (the feed carries a note, not the picture)");
  const pm = r.moment.id;
  check(r.moment.text === "", "a photo shared on its own carries no card");
  // The card behind the photo (alex 2026-11-25): the day's card goes with the photo unless they leave it off.
  r = await mia.post("/a/f/share", { day: today, item: "photo", kind: "photo", photo: jpeg(), text: "Take a slow walk somewhere new.", pillar: "Health", col: "#a9c4b5", status: "Done" });
  let seen = (await sam.get("/a/f/feed")).moments.find((x) => x.id === pm);
  check(r.ok && r.again && seen && seen.text === "Take a slow walk somewhere new." && seen.status === "Done" && seen.ph === true, "a friend sees the card behind the photo");
  r = await mia.post("/a/f/share", { day: today, item: "photo", kind: "photo", photo: jpeg(), pillar: "Health", col: "#a9c4b5" });
  seen = (await sam.get("/a/f/feed")).moments.find((x) => x.id === pm);
  check(r.ok && seen && seen.text === "", "sharing it again with the card left off takes the card away");
  check((await sam.get("/a/f/photo?id=" + pm)).data === jpeg(), "a friend can fetch the photo");
  check((await stranger.get("/a/f/photo?id=" + pm)).status === 404, "someone who isn't a friend can't");
  await mia.post("/a/f/unshare", { id: pm });
  check((await sam.get("/a/f/photo?id=" + pm)).status === 404 && made.Accountsbook.sql.exec("SELECT COUNT(*) AS n FROM mphotos").toArray()[0].n === 0, "removing the moment removes the photo from the service");
  // A week's card from the weekly recap (alex 2026-11-23): shared to your profile as a clean picture, like a photo.
  check((await mia.post("/a/f/share", { day: today, item: "week", kind: "week" })).error === "bad_moment", "a week's card needs its picture");
  check((await mia.post("/a/f/share", { day: today, item: "week", kind: "week", photo: jpeg(exif) })).error === "bad_moment", "a week's card still carrying details is refused");
  check((await mia.post("/a/f/share", { day: today, item: "12", kind: "week", photo: jpeg() })).error === "bad_moment", "and it can only be a week, not pretend to be a card");
  r = await mia.post("/a/f/share", { day: today, item: "week", kind: "week", photo: jpeg() });
  check(r.ok && r.moment.kind === "week" && r.moment.ph === true, "a clean week's card is shared");
  const wm = r.moment.id;
  check((await sam.get("/a/f/photo?id=" + wm)).data === jpeg() && (await stranger.get("/a/f/photo?id=" + wm)).status === 404, "friends can see it, others can't");
  r = await mia.post("/a/f/share", { day: today, item: "week", kind: "week", photo: jpeg() });
  check(r.ok && r.again && r.moment.id === wm, "sharing the same week again updates it");
  await mia.post("/a/f/unshare", { id: wm });

  // Profile photos (alex 2026-11-22): friends see your photo picture; others see the smile.
  check((await mia.post("/a/f/profile", { pic: "photo" })).error === "bad_photo", "a photo picture needs its photo");
  check((await mia.post("/a/f/profile", { pic: "photo", photo: jpeg(exif) })).error === "bad_photo", "a profile photo still carrying details is refused");
  check((await mia.post("/a/f/profile", { pic: "photo", photo: jpeg().padEnd(61000, "A") })).error === "bad_photo", "and only a small one (240 by 240 on the phone)");
  check((await mia.post("/a/f/profile", { pic: "photo", photo: jpeg() })).ok, "a clean profile photo is kept");
  const miaCard = (await sam.get("/a/f")).friends.find((x) => x.username === "mia.k");
  check(miaCard.pic === "photo" && miaCard.pv > 0 && !("data" in miaCard), "a friend's list says Mia has a photo (not the picture itself)");
  check((await sam.get("/a/f/face?u=mia.k")).data === jpeg() && (await mia.get("/a/f/face?u=mia.k")).data === jpeg(), "a friend can fetch it, and so can Mia");
  const nina = await person("nina.w"); await nina.post("/a/f/profile", { adult: true });
  check((await nina.get("/a/f/face?u=mia.k")).status === 404 && (await stranger.get("/a/f/face?u=mia.k")).status === 404, "someone who isn't a friend can't");
  await nina.post("/a/f/profile", { pic: "photo", photo: jpeg([0xff, 0xdb, 0, 3, 9]) });
  check((await mia.get("/a/f/face?u=nina.w")).status === 404, "nor can Mia see Nina's, while they aren't friends");
  await nina.post("/a/f/ask", { username: "mia.k" });
  check((await mia.get("/a/f/face?u=nina.w")).ok && (await nina.get("/a/f/face?u=mia.k")).status === 404, "asking to be friends shows your photo to the person you asked, not theirs to you");
  await nina.post("/a/f/cancel", { username: "mia.k" });
  check((await mia.get("/a/f/face?u=nina.w")).status === 404, "taking the request back hides it again");
  await mia.post("/a/f/profile", { pic: "frog" });
  check((await sam.get("/a/f")).friends.find((x) => x.username === "mia.k").pic === "frog" && (await sam.get("/a/f/face?u=mia.k")).status === 404
    && made.Accountsbook.sql.exec("SELECT COUNT(*) AS n FROM faces WHERE data = ?", jpeg()).toArray()[0].n === 0, "picking a little one removes the photo from the service");
  // A share limit
  for (let i = 0; i < 9; i++) await mia.post("/a/f/share", { day: today, item: "o" + (i + 1), kind: "own", text: "Made " + i });
  check((await mia.post("/a/f/share", { day: today, item: "o99", kind: "own", text: "one too many" })).error === "too_many_shares", "at most 10 shares a day");
  r = await mia.post("/a/f/unshare", { id: m1 });
  check(r.ok && !(await sam.get("/a/f/feed")).moments.some((x) => x.id === m1), "Mia can remove a moment, and it's gone for friends");

  // ---- Reports (step 5) ----
  const before = mail.length;
  r = await sam.post("/a/f/share", { day: today, item: "photo", kind: "photo", photo: jpeg(), cap: "Something mean" });
  const bad = r.moment.id;
  check((await mia.post("/a/f/report", { moment: bad, why: "nonsense" })).error === "bad_report", "a report needs one of the reasons");
  check((await stranger.post("/a/f/report", { moment: bad, why: "hurtful" })).status === 404, "only friends can report a moment (others can't see it)");
  check((await sam.post("/a/f/report", { moment: bad, why: "hurtful" })).status === 404, "you can't report yourself");
  r = await mia.post("/a/f/report", { moment: bad, why: "hurtful", note: "  This was aimed at me\u200b " });
  check(r.ok && !("notify" in r), "Mia reports Sam's moment (the answer says nothing more)");
  const email = mail.slice(before).find((m) => m.subject === "A report is waiting on Daydeck");
  check(email && email.to[0] === "hello@daydeck.day" && !/mean|mia|sam|hurtful/i.test(email.text), "alex gets an email that a report is waiting, with nothing about what or who");
  const fourth = await person("fourth.p"); await fourth.post("/a/f/profile", { adult: true }); await fourth.post("/a/f/ask", { username: "sam" }); await sam.post("/a/f/answer", { username: "fourth.p", yes: true });
  await fourth.post("/a/f/report", { moment: bad, why: "sexual" });
  check(mail.slice(before).filter((m) => m.subject === "A report is waiting on Daydeck").length === 1, "at most one email an hour, however many reports");
  check((await mia.get("/a/f/feed")).moments.some((m) => m.id === bad), "two reports: the moment still shows while alex looks");
  const third = await person("third.p"); await third.post("/a/f/profile", { adult: true }); await third.post("/a/f/ask", { username: "sam" }); await sam.post("/a/f/answer", { username: "third.p", yes: true });
  await third.post("/a/f/report", { moment: bad, why: "hurtful" });
  check(!(await mia.get("/a/f/feed")).moments.some((m) => m.id === bad) && (await sam.get("/a/f/feed")).moments.some((m) => m.id === bad), "three different people: it's held back from friends' feeds (Sam still sees his own)");
  await mia.post("/a/f/report", { username: "sam", why: "spam" });
  // alex's review page
  const T = (method, path, body, key = "made-up-tester-key-123") => call(method, path, body, key, "198.51.100.77");
  check((await T("GET", "/t/reports", null, "wrong-key-wrong-key")).status === 403, "the Reports page needs the tester page password");
  let rl = await T("GET", "/t/reports");
  const rep = rl.open.find((x) => x.moment === bad && x.by === "mia.k");
  check(rl.open.length === 4 && rep.why === "hurtful" && rep.note === "This was aimed at me" && rep.who === "sam" && rep.snap.cap === "Something mean" && rep.photo === jpeg() && rep.held, "alex sees each report: why, their words, who, and a copy of the moment and its photo");
  check(rl.open.some((x) => !x.moment && x.why === "spam" && x.who === "sam") && rep.about === 4, "a report about a person shows too, with how many reports there are about them");
  await sam.post("/a/f/unshare", { id: bad });
  rl = await T("GET", "/t/reports");
  check(rl.open.find((x) => x.id === rep.id).snap.cap === "Something mean" && !rl.open.find((x) => x.id === rep.id).still, "the copy stays for alex even after Sam removes the moment");
  r = await sam.post("/a/f/share", { day: today, item: "o5", kind: "own", text: "Second try" });
  const m2 = r.moment.id;
  await mia.post("/a/f/report", { moment: m2, why: "else" });
  rl = await T("GET", "/t/reports");
  await T("POST", "/t/report", { id: rl.open.find((x) => x.moment === m2).id, act: "remove" });
  check(!(await mia.get("/a/f/feed")).moments.some((m) => m.id === m2), "Remove the moment: it's gone for everyone");
  await T("POST", "/t/report", { id: rl.open.find((x) => x.moment === bad && x.by === "mia.k").id, act: "keep" });
  rl = await T("GET", "/t/reports");
  check(!rl.open.some((x) => x.moment === bad) && rl.done.some((x) => x.moment === bad && x.state === "kept" && !x.photo), "Keep it answers every report on that moment together, and the photo copy is let go");
  await T("POST", "/t/report", { id: rl.open.find((x) => !x.moment).id, act: "pause" });
  check((await sam.post("/a/f/share", { day: today, item: "o6", kind: "own", text: "x" })).error === "paused", "Pause their sharing: they can't share");
  check((await mia.get("/a/f/feed")).moments.every((m) => m.by.username !== "sam") && (await mia.get("/a/f/moments?u=sam")).moments.length === 0, "and their moments are hidden from friends");
  await T("POST", "/t/report", { id: rl.open.find((x) => !x.moment).id, act: "unpause" });
  check((await sam.post("/a/f/share", { day: today, item: "o6", kind: "own", text: "Back" })).ok, "and alex can let them share again");

  // ---- Lookups are limited ----
  let last;
  for (let i = 0; i < 61; i++) last = await sam.get("/a/f/find?u=nobody" + i);
  check(last.status === 429, "looking up too many names in an hour is slowed down");

  // ---- Deleting an account takes it all ----
  await josh.post("/a/f/profile", { hide: false });
  check((await mia.get("/a/f/person?u=josh_r")).person.friends >= 1, "Josh has friends before deleting");
  await josh.post("/a/f/invite", {});
  const jm = await josh.post("/a/f/share", { day: "2026-11-21", item: "rest", kind: "rest", text: "", status: "Rested" });
  await josh.post("/a/f/share", { day: "2026-11-21", item: "photo", kind: "photo", photo: jpeg() });
  await mia.post("/a/f/see", { id: jm.moment.id });
  await josh.post("/a/f/see", { id: (await mia.get("/a/f/feed")).moments.find((x) => x.mine).id });
  await mia.post("/a/f/report", { username: "josh_r", why: "spam" });
  await josh.post("/a/delete", {});
  const sql = made.Accountsbook.sql;
  const orphans = ["SELECT COUNT(*) AS n FROM moments WHERE owner NOT IN (SELECT id FROM users)", "SELECT COUNT(*) AS n FROM sees WHERE who NOT IN (SELECT id FROM users)", "SELECT COUNT(*) AS n FROM mphotos WHERE moment NOT IN (SELECT id FROM moments)", "SELECT COUNT(*) AS n FROM reports WHERE reporter NOT IN (SELECT id FROM users) OR who NOT IN (SELECT id FROM users)", "SELECT COUNT(*) AS n FROM prof WHERE user NOT IN (SELECT id FROM users)", "SELECT COUNT(*) AS n FROM faces WHERE user NOT IN (SELECT id FROM users)", "SELECT COUNT(*) AS n FROM pals WHERE a NOT IN (SELECT id FROM users) OR b NOT IN (SELECT id FROM users)",
    "SELECT COUNT(*) AS n FROM asks WHERE f NOT IN (SELECT id FROM users) OR t NOT IN (SELECT id FROM users)", "SELECT COUNT(*) AS n FROM invites WHERE user NOT IN (SELECT id FROM users)"];
  const left = orphans.map((q) => sql.exec(q).toArray()[0].n);
  r = await mia.get("/a/f");
  check(r.friends.every((f) => f.username !== "josh_r") && (await mia.get("/a/f/find?u=josh_r")).found === false, "deleting an account removes them from every friend's list");
  check(sql.exec("SELECT COUNT(*) AS n FROM prof WHERE name = ?", "José Ríos 🌿").toArray()[0].n === 0 && left.every((n) => n === 0), "and their profile, friendships, requests, invites, moments and I see yous are gone from the service");

  globalThis.fetch = realFetch;
  done();
})();
