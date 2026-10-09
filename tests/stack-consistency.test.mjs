// Stack consistency: no pin may silently shadow another pin's change.
//
// Every pin ships full copies of the Gecko files it touches (patches/<pin>-files/),
// and an apply script copies them over the tree. When two pins carry the same file
// and the newer copy was not cut on top of the older one, applying the stack in
// order silently drops the older pin's change (0058c's DarkstrDepthHooks copy
// overwrote 0059's `matches` removal; npm passed because each pin's tests read
// only their own copy).
//
// patches/STACK lists the shipped pins, oldest first (the order main applies them).
// For every file carried by more than one pin:
//   A. chain   - a pin with BASE_SHA256SUMS must name, as that file's base, the
//                exact copy of the previous pin in STACK that carries the file.
//   B. replay  - apply the whole stack in order (newest copy wins) and check every
//                line each pin's patch adds is still in the shipped copy, unless a
//                later pin's patch removes it on purpose.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const P = join(root, "patches");
const STACK = readFileSync(join(P, "STACK"), "utf8")
  .split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const sums = (f) => existsSync(f)
  ? Object.fromEntries(readFileSync(f, "utf8").split("\n").filter((l) => l.trim())
      .map((l) => { const [h, ...p] = l.trim().split(/\s+/); return [p.join(" "), h]; }))
  : null;
// Files that are pin-local inputs, not copies of a tree file.
const NOT_TREE_COPY = /\.(snippet|md)$|^(SHA256SUMS|BASE_SHA256SUMS|gecko-milestone\.txt)$/;

function pinFiles(pin) {
  const d = join(P, `${pin}-files`);
  const s = sums(join(d, "SHA256SUMS"));
  const names = s ? Object.keys(s) : readdirSync(d).filter((n) => statSync(join(d, n)).isFile());
  return names.filter((n) => !NOT_TREE_COPY.test(basename(n))).map((n) => basename(n));
}
function patchHunks(pin) {
  // { basename: { add: Set, del: Set } } over every patches/<pin>-*.patch
  const out = {};
  const re = new RegExp(`^${pin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-.*\\.patch$`);
  for (const pf of readdirSync(P).filter((n) => re.test(n))) {
    let cur = null;
    for (const l of readFileSync(join(P, pf), "utf8").split("\n")) {
      if (l.startsWith("+++ ")) {
        const path = l.slice(4).split("\t")[0].trim();
        cur = path === "/dev/null" ? null : basename(path);
        if (cur) out[cur] ??= { add: new Set(), del: new Set() };
        continue;
      }
      if (l.startsWith("--- ") || l.startsWith("diff ") || !cur) continue;
      const t = l.slice(1).trim();
      if (t.length < 12) continue; // braces, blank lines, "return;" ... carry no signal
      if (l[0] === "+") out[cur].add.add(t);
      else if (l[0] === "-") out[cur].del.add(t);
    }
  }
  return out;
}

const carriers = {}; // basename -> [pin...] in STACK order
for (const pin of STACK) {
  assert.ok(existsSync(join(P, `${pin}-files`)), `STACK lists ${pin} but patches/${pin}-files is missing`);
  for (const f of pinFiles(pin)) (carriers[f] ??= []).push(pin);
}
const shared = Object.entries(carriers).filter(([, ps]) => ps.length > 1);

test("STACK covers every pin directory that has a pin (no forgotten pin)", () => {
  const dirs = readdirSync(P).filter((n) => n.endsWith("-files")).map((n) => n.slice(0, -6));
  const pinned = dirs.filter((d) => existsSync(join(P, `${d}-files`, "BASE_SHA256SUMS")));
  for (const d of pinned) assert.ok(STACK.includes(d), `${d} has BASE_SHA256SUMS but is not in patches/STACK`);
  assert.equal(new Set(STACK).size, STACK.length, "STACK lists a pin twice");
});

test("A. chain: each pin's base for a shared file is the previous carrier's copy", () => {
  const bad = [];
  for (const [f, pins] of shared) {
    for (let i = 1; i < pins.length; i++) {
      const base = sums(join(P, `${pins[i]}-files`, "BASE_SHA256SUMS"));
      if (!base) continue;
      const entry = Object.entries(base).find(([p]) => basename(p) === f);
      if (!entry) { bad.push(`${pins[i]}: ${f} has no BASE_SHA256SUMS entry`); continue; }
      const prev = sha(join(P, `${pins[i - 1]}-files`, f));
      if (entry[1] !== prev) {
        const owner = pins.slice(0, i).find((q) => sha(join(P, `${q}-files`, f)) === entry[1]);
        bad.push(`${pins[i]}: ${f} was cut on ${owner ?? entry[1].slice(0, 8)} instead of ${pins[i - 1]} (${prev.slice(0, 8)}) -> ${pins[i - 1]}'s change is shadowed`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("B. replay: every pin's added lines survive the full stack unless a later pin removes them", () => {
  const hunks = Object.fromEntries(STACK.map((p) => [p, patchHunks(p)]));
  const bad = [];
  for (const [f, pins] of shared) {
    const shipped = new Set(readFileSync(join(P, `${pins.at(-1)}-files`, f), "utf8").split("\n").map((l) => l.trim()));
    pins.forEach((pin, i) => {
      const h = hunks[pin][f];
      if (!h) return;
      const own = new Set(readFileSync(join(P, `${pin}-files`, f), "utf8").split("\n").map((l) => l.trim()));
      const later = pins.slice(i + 1);
      const lost = [...h.add].filter((l) => own.has(l) && !shipped.has(l) && !later.some((q) => hunks[q][f]?.del.has(l)));
      if (lost.length) bad.push(`${f}: ${lost.length} line(s) added by ${pin} are gone from ${pins.at(-1)}'s copy and no later pin removes them, e.g. ${JSON.stringify(lost[0])}`);
    });
  }
  assert.deepEqual(bad, []);
});

test("the shipped copy of each shared file is the newest carrier's (what the apply scripts leave)", () => {
  // Sanity for A/B: SHA256SUMS of the newest carrier match its file.
  for (const [f, pins] of shared) {
    const s = sums(join(P, `${pins.at(-1)}-files`, "SHA256SUMS"));
    if (s) {
      const e = Object.entries(s).find(([p]) => basename(p) === f);
      assert.ok(e, `${pins.at(-1)} SHA256SUMS lacks ${f}`);
      assert.equal(e[1], sha(join(P, `${pins.at(-1)}-files`, f)), `${pins.at(-1)}/${f} differs from its SHA256SUMS`);
    }
  }
});
