import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadClassic(rel) {
  const ctx = createContext({ globalThis: {} });
  ctx.globalThis = ctx;
  runInContext(readFileSync(join(root, rel), "utf8"), ctx, { filename: rel });
  return ctx;
}

const prefs = loadClassic("extension/lib/prefs.js");
const modes = loadClassic("extension/lib/modes.js");

test("pref keys are the Proof-pin names", () => {
  assert.equal(prefs.DARKSTR_PREF.MODE, "darkstr.mode");
  assert.equal(prefs.DARKSTR_PREF.NATIVE_COMPATIBLE, "darkstr.nativeCompatible");
});

test("mode enum is XOR — only homogeneous or pollution", () => {
  assert.equal(prefs.isDarkstrMode("homogeneous"), true);
  assert.equal(prefs.isDarkstrMode("pollution"), true);
  assert.equal(prefs.isDarkstrMode("both"), false);
  assert.equal(prefs.isDarkstrMode("homogeneous+pollution"), false);
  assert.equal(prefs.isDarkstrMode("rfp"), false);
});

test("illegal mode coerces to homogeneous, nativeCompatible stays independent", () => {
  const n = prefs.normalizeDarkstrPrefs({
    "darkstr.mode": "both",
    "darkstr.nativeCompatible": true,
  });
  assert.equal(n["darkstr.mode"], "homogeneous");
  assert.equal(n["darkstr.nativeCompatible"], true);
});

test("assertModeXor rejects stacking spellings", () => {
  assert.equal(modes.assertModeXor("pollution"), "pollution");
  assert.throws(() => modes.assertModeXor("both"), /XOR/);
  assert.throws(() => modes.assertModeXor(["homogeneous", "pollution"]), /XOR/);
});

test("pollution + RFP is refused", () => {
  const act = modes.resolveActivation({
    mode: "pollution",
    nativeCompatible: false,
    rfpLikely: true,
  });
  assert.equal(act.rfpConflict, true);
  assert.equal(act.pollutionActive, false);
  assert.equal(act.allowPersonaInject, false);
  assert.equal(act.allowDnrTrackingRules, false);
  assert.equal(act.reason, "rfp_xor_pollution");
});

test("pollution without RFP arms surfaces", () => {
  const act = modes.resolveActivation({
    mode: "pollution",
    nativeCompatible: false,
    rfpLikely: false,
  });
  assert.equal(act.pollutionActive, true);
  assert.equal(act.allowPersonaInject, true);
  assert.equal(act.allowDnrTrackingRules, true);
});

test("nativeCompatible is independent and gates surfaces without changing mode", () => {
  const act = modes.resolveActivation({
    mode: "pollution",
    nativeCompatible: true,
    rfpLikely: false,
  });
  assert.equal(act.mode, "pollution");
  assert.equal(act.nativeCompatible, true);
  assert.equal(act.pollutionActive, false);
  assert.equal(act.reason, "native_compatible");
});

test("homogeneous never injects persona even if RFP probe is negative", () => {
  const act = modes.resolveActivation({
    mode: "homogeneous",
    nativeCompatible: false,
    rfpLikely: false,
  });
  assert.equal(act.homogeneousActive, true);
  assert.equal(act.allowPersonaInject, false);
  assert.equal(act.allowDnrTrackingRules, false);
});
