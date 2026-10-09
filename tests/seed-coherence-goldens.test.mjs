import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("seed-goldens fixture is present and shaped", () => {
  const doc = JSON.parse(
    readFileSync(join(root, "fixtures/seed-goldens.json"), "utf8")
  );
  assert.equal(doc.version, 1);
  assert.ok(Array.isArray(doc.vectors) && doc.vectors.length >= 3);
  for (const v of doc.vectors) {
    assert.equal(typeof v.seed, "number");
    assert.match(v.os, /^(macos|linux|windows)$/);
    assert.match(v.snapshot.userAgent, /Firefox/);
    assert.ok(v.snapshot.platform);
    assert.ok(v.snapshot.hardwareConcurrency > 0);
    assert.ok(Array.isArray(v.snapshot.languages) && v.snapshot.languages.length);
  }
});

test("0055: seed goldens claim the engine version; chrome builds UAs from the Rust OS tokens", () => {
  // Drift pin (was: chrome 0003 UA literals ⊂ Rust 139/140 families). Since
  // 0055 (N6) neither side has UA literals: Rust uses firefox_ua!(os) at the
  // config/milestone.txt version, chrome firefoxUserAgent(os, engine rv).
  const doc = JSON.parse(readFileSync(join(root, "fixtures/seed-goldens.json"), "utf8"));
  for (const v of doc.vectors) {
    assert.match(v.snapshot.userAgent, /; rv:156\.0\) Gecko\/20100101 Firefox\/156\.0$/);
  }
  const rs = readFileSync(join(root, "crates/duppel-persona/src/lib.rs"), "utf8");
  const np = readFileSync(join(root, "patches/0055-files/DarkstrNativePersona.sys.mjs"), "utf8");
  const rustOs = [...rs.matchAll(/firefox_ua!\("([^"]+)"\)/g)].map((m) => m[1]).sort();
  const npOs = [...np.matchAll(/uaOs: \[([^\]]+)\]/g)]
    .flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]))
    .sort();
  assert.deepEqual(npOs, rustOs);
  assert.doesNotMatch(np, /"Mozilla\/5\.0 \([^"]*Firefox\/\d+\.0"/, "no UA literals in chrome");
});

test("SEED-COHERENCE + NC banking docs exist", () => {
  assert.match(
    readFileSync(join(root, "docs/SEED-COHERENCE.md"), "utf8"),
    /not claimed/i
  );
  assert.match(
    readFileSync(join(root, "docs/NC-BANKING-SMOKE.md"), "utf8"),
    /banking\/SSO/
  );
});

test("darkstr.cfg stub refuses static FPP=false default", () => {
  const cfg = readFileSync(join(root, "patches/stubs/darkstr.cfg"), "utf8");
  assert.doesNotMatch(
    cfg,
    /defaultPref\(\s*"privacy\.fingerprintingProtection"\s*,\s*false/
  );
  assert.match(cfg, /do NOT defaultPref FPP=false/);
});
