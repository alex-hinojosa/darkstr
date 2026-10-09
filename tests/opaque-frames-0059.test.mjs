/**
 * 0059 (Fable B7): opaque-origin frames (sandbox without allow-same-origin, data:, blob: from an opaque
 * origin, srcdoc in a sandbox, nested) and the workers they own take their top-level site's persona:
 * navigator (NativePersonaChild), depth noise (DepthHooks actor without `matches`), workers and the
 * WebGPU gate (C++). Tests run against patches/0059-files.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const sha = (p) => createHash("sha256").update(readFileSync(join(root, p))).digest("hex");
globalThis.JSProcessActorChild ??= class {};
globalThis.JSWindowActorChild ??= class {};
globalThis.Services ??= { obs: { addObserver() {} } };
globalThis.ChromeUtils ??= { defineESModuleGetters() {}, importESModule() { return {}; } };

const NPC = await import(pathToFileURL(join(root, "patches/0059-files/DarkstrNativePersonaChild.sys.mjs")).href);
const DHC = await import(pathToFileURL(join(root, "patches/0059-files/DarkstrDepthHooksChild.sys.mjs")).href);

const web = (scheme) => ({ isNullPrincipal: false, isContentPrincipal: true, schemeIs: (s) => s === scheme });
const opaque = (precursor) => ({ isNullPrincipal: true, isContentPrincipal: false, schemeIs: () => false, precursorPrincipal: precursor });
const SUB = { parent: {} };
const TOP = { parent: null };

test("0059: pin files match SHA256SUMS; bases are the shipped earlier pins; apply script", () => {
  for (const line of read("patches/0059-files/SHA256SUMS").trim().split("\n")) {
    const [h, n] = line.trim().split(/\s+/);
    assert.equal(sha(`patches/0059-files/${n}`), h, n);
  }
  const base = Object.fromEntries(read("patches/0059-files/BASE_SHA256SUMS").trim().split("\n").map((l) => l.trim().split(/\s+/).reverse()));
  const shipped = {
    "browser/components/DarkstrNativePersonaChild.sys.mjs": "patches/0058-files/DarkstrNativePersonaChild.sys.mjs",
    "browser/components/DarkstrDepthHooksChild.sys.mjs": "patches/0058b-files/DarkstrDepthHooksChild.sys.mjs",
    "browser/components/DarkstrDepthHooks.sys.mjs": "patches/0057-files/DarkstrDepthHooks.sys.mjs",
    "dom/base/DarkstrNavigatorHooks.cpp": "patches/0058b-files/DarkstrNavigatorHooks.cpp",
  };
  assert.deepEqual(Object.keys(base).sort(), Object.keys(shipped).sort());
  for (const [tree, pin] of Object.entries(shipped)) assert.equal(base[tree], sha(pin), `${tree} base is ${pin}`);
  const sh = read("scripts/apply-0059-opaque-frames-mini.sh");
  assert.match(sh, /0059-darkstr-opaque-frames\.patch/);
  assert.match(sh, /obj-aarch64-apple-darwin25\.6\.0/);
  assert.doesNotMatch(sh.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n"), /\bmv\b/);
});

for (const [name, mod] of [["NativePersonaChild", NPC], ["DepthHooksChild", DHC]]) {
  test(`0059: ${name} isOpaquePersonaDocument`, () => {
    const f = mod.isOpaquePersonaDocument;
    // any opaque subframe (sandbox, data:, srcdoc-in-sandbox, blob:null, nested): the parent decides
    assert.equal(f(opaque(web("http")), SUB), true);
    assert.equal(f(opaque(web("https")), SUB), true);
    assert.equal(f(opaque(opaque(web("https"))), SUB), true, "nested opaque");
    assert.equal(f(opaque(null), SUB), true, "opaque subframe without precursor still asks the parent");
    // top-level opaque: only with a web precursor (sandboxed popup)
    assert.equal(f(opaque(web("https")), TOP), true);
    assert.equal(f(opaque(web("file")), TOP), true);
    assert.equal(f(opaque(web("moz-extension")), TOP), false);
    assert.equal(f(opaque(null), TOP), false);
    // never content / system principals
    assert.equal(f(web("https"), SUB), false);
    assert.equal(f({ isNullPrincipal: false, isContentPrincipal: false, isSystemPrincipal: true }, SUB), false);
    assert.equal(f(null, SUB), false);
    assert.equal(f({ get isNullPrincipal() { throw new Error("x"); } }, SUB), false);
  });
}

test("0059: NativePersonaChild installs for opaque documents (gate wired)", () => {
  const s = read("patches/0059-files/DarkstrNativePersonaChild.sys.mjs");
  assert.match(s, /!isPersonaPrincipal\(document\.nodePrincipal\) &&\n\s+!isOpaquePersonaDocument\(document\.nodePrincipal, this\.browsingContext\)/);
});

test("0059: depth actor has no `matches`; the child admits exactly the old documents plus opaque ones", () => {
  const reg = read("patches/0059-files/DarkstrDepthHooks.sys.mjs");
  assert.doesNotMatch(reg, /matches:\s*\[/);
  assert.match(reg, /allFrames: true/);
  const e = DHC.depthDocumentEligible;
  const doc = (scheme, principal) => ({ documentURIObject: { scheme }, nodePrincipal: principal });
  for (const s of ["http", "https", "file"]) assert.equal(e(doc(s, web(s)), TOP), true, s);
  assert.equal(e(doc("http", opaque(web("http"))), SUB), true, "sandboxed http frame (unchanged)");
  assert.equal(e(doc("data", opaque(web("https"))), SUB), true, "data: frame");
  assert.equal(e(doc("about", opaque(web("https"))), SUB), true, "srcdoc in a sandbox");
  assert.equal(e(doc("blob", opaque(opaque(web("https")))), SUB), true, "blob: from an opaque origin");
  // what `matches` excluded stays excluded
  assert.equal(e(doc("about", { isNullPrincipal: false, isContentPrincipal: false }), TOP), false, "about: pages");
  assert.equal(e(doc("moz-extension", web("moz-extension")), TOP), false);
  assert.equal(e(doc("chrome", { isNullPrincipal: false }), TOP), false);
  assert.equal(e(null, TOP), false);
  const child = read("patches/0059-files/DarkstrDepthHooksChild.sys.mjs");
  const h = child.slice(child.indexOf("async handleEvent(event) {"));
  assert.ok(h.indexOf("depthDocumentEligible(this.document, this.browsingContext)") < h.indexOf("await this.pullAndInstall(event.type)"),
    "filter runs before any IPC");
});

test("0059: C++ admits window-owned opaque workers and opaque windows in the WebGPU gate", () => {
  const cpp = read("patches/0059-files/DarkstrNavigatorHooks.cpp");
  assert.match(cpp, /!\(principal->GetIsContentPrincipal\(\) \|\|\n\s+\(principal->GetIsNullPrincipal\(\) && aLoadInfo\.mWindow\)\)/);
  assert.match(cpp, /!\(principal->GetIsContentPrincipal\(\) \|\| principal->GetIsNullPrincipal\(\)\)/);
  // windowless opaque workers (no owner) still get nothing
  assert.doesNotMatch(cpp, /GetIsNullPrincipal\(\)\)\s*\{\s*\n\s*return nullptr;/);
});
