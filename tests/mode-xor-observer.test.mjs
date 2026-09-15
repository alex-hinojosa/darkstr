/**
 * M2 ModeXor patch hygiene — FPP soft residual settle (CB category + dual idle).
 * Brand: darkstr — not official LibreWolf. No CF/TLS claims.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("0002 ModeXor observes CB category + dual idle under Pollution", () => {
  const patch = readFileSync(
    join(root, "patches/0002-darkstr-mode-xor-rfp.patch"),
    "utf8"
  );
  assert.match(patch, /DarkstrModeXor\.sys\.mjs/);
  assert.match(patch, /privacy\.fingerprintingProtection/);
  assert.match(patch, /privacy\.resistFingerprinting/);
  // Identifiable ContentBlockingPrefs.PREF_CB_CATEGORY on 155.0.1
  assert.match(patch, /browser\.contentblocking\.category/);
  assert.match(patch, /CB_CATEGORY_PREF/);
  // Dual idle settle (not a single idle only)
  const idleHits = patch.match(/idleDispatchToMainThread/g) || [];
  assert.ok(
    idleHits.length >= 2,
    `expected >=2 idleDispatchToMainThread, got ${idleHits.length}`
  );
  assert.match(patch, /mode === "pollution"/);
  assert.doesNotMatch(patch, /^# STUB/m);
  assert.match(patch, /not official LibreWolf|not Cloudflare/i);
});

test("PROOF-PIN M3-CPP honesty names landed 0005+0006+0007 (C++ DocShell SoT)", () => {
  const pin = readFileSync(join(root, "docs/PROOF-PIN.md"), "utf8");
  assert.match(pin, /0005-darkstr-cpp-native-hooks\.patch/);
  assert.match(pin, /0006-darkstr-cpp-navigator-docshell\.patch/);
  assert.match(pin, /0007-darkstr-cpp-docshell-nav-sot\.patch/);
  // DocShell counter SoT is C++ when hooks on; chrome Map is fallback
  assert.match(pin, /DocShell counter SoT is C\+\+|C\+\+ SoT.*DocShell|DocShell first vs subsequent \*\*C\+\+ SoT\*\*/s);
  assert.doesNotMatch(
    pin,
    /Navigator\/DocShell remain chrome-JS \(`0003`\)/
  );
});
