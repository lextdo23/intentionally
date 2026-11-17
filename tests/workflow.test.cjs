// Checks the GitHub deploy workflows only use tools pinned to exact versions.
// Run: node tests/workflow.test.cjs
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", ".github", "workflows");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
for (const f of fs.readdirSync(dir).filter(n => /\.ya?ml$/.test(n))) {
  const text = fs.readFileSync(path.join(dir, f), "utf8");
  for (const m of text.matchAll(/uses:\s*([^\s#]+)/g)) {
    const ref = m[1];
    if (ref.startsWith("./")) continue; // the repo's own action
    ok(/@[0-9a-f]{40}$/.test(ref), `${f}: ${ref} is pinned to a full fingerprint`);
  }
  for (const m of text.matchAll(/wrangler@([^\s"']+)/g))
    ok(/^\d+\.\d+\.\d+$/.test(m[1]), `${f}: npx wrangler@${m[1]} is an exact version`);
  for (const m of text.matchAll(/wranglerVersion:\s*"?([^\s"]+)/g))
    ok(/^\d+\.\d+\.\d+$/.test(m[1]), `${f}: wranglerVersion ${m[1]} is an exact version`);
  ok(!/@(main|master|latest)\b/.test(text), `${f}: nothing points at main/master/latest`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
