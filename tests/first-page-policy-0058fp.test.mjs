/**
 * 0058 (first-page policy, Fable B4): the persona decision is per site, not
 * per tab. Behavioural coverage lives in persona-surface-0051 (N2/N4/popups)
 * and worker-coherence-0049 (B3/windowless/depth prelude); this file pins the
 * shipped artifacts and the source-level invariants.
 * Naming: patches/0058-files is 0057b (snapshot platform); this pin ships
 * from patches/0058fp-files.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const sha = (p) => createHash("sha256").update(readFileSync(join(root, p))).digest("hex");
const NP = read("patches/0058fp-files/DarkstrNativePersona.sys.mjs");

test("0058fp: SHA256SUMS + BASE pinned to 0057b (patches/0058-files)", () => {
  const [h, n] = read("patches/0058fp-files/SHA256SUMS").trim().split(/\s+/);
  assert.equal(n, "DarkstrNativePersona.sys.mjs");
  assert.equal(sha("patches/0058fp-files/DarkstrNativePersona.sys.mjs"), h);
  const [bh, bp] = read("patches/0058fp-files/BASE_SHA256SUMS").trim().split(/\s+/);
  assert.equal(bp, "browser/components/DarkstrNativePersona.sys.mjs");
  assert.equal(sha("patches/0058-files/DarkstrNativePersona.sys.mjs"), bh);
});

test("0058fp: the per-tab strictFirstDoc hold is gone; armed depends only on Pollution + hooks", () => {
  assert.doesNotMatch(NP, /getBoolPref\(\s*STRICT_PREF/);
  assert.doesNotMatch(NP, /const STRICT_PREF/);
  const fn = NP.slice(NP.indexOf("strictNextNavArmed(_phase) {"), NP.indexOf("_syncStrictNextNavArmedDiag(phase) {"));
  assert.match(fn, /return !!\(plan\.pollutionActive && plan\.nativeHooks\);/);
  assert.doesNotMatch(fn, /subsequent_nav|strictFirstDoc/);
  assert.doesNotMatch(NP, /!plan\.strictFirstDoc/);
  assert.match(NP, /const strictFirstDoc = false;/);
});

test("0058fp: the 0056 store hold still covers first loads; no resolve while the store is loading", () => {
  assert.match(NP, /if \(this\._holdForSeedStore\(channel, plan\)\) \{/);
  const note = NP.slice(NP.indexOf("_noteTopLevelDocument(channel) {"));
  const body = note.slice(0, note.indexOf("\n  },\n"));
  assert.match(body, /storeLoading = !this\._fixedSeedSet\(\) && !!seedStore\(\)\?\.loading;/);
  assert.match(body, /if \(this\._rotationActive\(\) && !storeLoading\) \{/);
});

test("0058fp: Native-Compatible still disarms (pollutionActive excludes nativeCompatible)", () => {
  assert.match(NP, /const pollutionActive = mode === "pollution" && !nativeCompatible;/);
});

test("0058fp: apply script — patch, base check, pinned objdir, no mv", () => {
  const sh = read("scripts/apply-0058fp-first-page-policy-mini.sh");
  assert.match(sh, /0058fp-darkstr-first-page-policy\.patch/);
  assert.match(sh, /BASE_SHA256SUMS/);
  assert.match(sh, /obj-aarch64-apple-darwin25\.6\.0/);
  assert.doesNotMatch(sh.split("\n").filter((l) => !l.startsWith("#")).join("\n"), /\bmv\b/);
});

test("0058fp: a plan change re-runs DepthHooks.refreshPlan (observer order cannot leave depth disarmed)", () => {
  const body = NP.slice(NP.indexOf("  _onPlanChanged() {"), NP.indexOf("  _refreshAllDocuments() {"));
  assert.match(body, /this\._refreshDepthPlan\(\);\n  \},/);
  assert.match(body, /DarkstrDepthHooks\?\._inited\) \{\n\s+DarkstrDepthHooks\.refreshPlan\(\);/);
  // DepthHooks reads this module's plan when arming per-site depth.
  assert.match(read("patches/0057-files/DarkstrDepthHooks.sys.mjs"), /NP\._storeRotationActive\?\.\(NP\.getPlan\(\)\)/);
});
