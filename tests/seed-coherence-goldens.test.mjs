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

test("chrome 0003 seed UA lists are subsets of Rust goldens families", () => {
  // Drift pin: chrome must not invent Firefox UAs outside Rust control-plane families.
  const patch = readFileSync(
    join(root, "patches/0003-darkstr-native-persona-hooks.patch"),
    "utf8"
  );
  const rustUas = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:139.0) Gecko/20100101 Firefox/139.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
  ];
  const uas = [];
  for (const line of patch.split("\n")) {
    if (!line.startsWith("+")) continue;
    const m = line.match(/"(Mozilla\/5\.0 [^"]*Firefox\/\d+\.0)"/);
    if (m) uas.push(m[1]);
  }
  assert.ok(uas.length >= 3, "expected chrome UA strings in 0003");
  for (const ua of uas) {
    assert.ok(rustUas.includes(ua), `chrome UA not in Rust family: ${ua}`);
  }
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
