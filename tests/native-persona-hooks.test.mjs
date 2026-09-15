/**
 * M3: darkstr.nativePersonaHooks pref + MAIN inject disable semantics.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadPrefsHelpers() {
  const src = readFileSync(join(root, "extension/lib/prefs.js"), "utf8");
  const sand = { globalThis: {} };
  // eslint-disable-next-line no-new-func
  Function("globalThis", src + "\nreturn { DARKSTR_PREF, DARKSTR_DEFAULTS, normalizeDarkstrPrefs };")(
    sand.globalThis
  );
  return sand.globalThis;
}

test("nativePersonaHooks pref name and default false", () => {
  const { DARKSTR_PREF, DARKSTR_DEFAULTS, normalizeDarkstrPrefs } = loadPrefsHelpers();
  assert.equal(DARKSTR_PREF.NATIVE_PERSONA_HOOKS, "darkstr.nativePersonaHooks");
  assert.equal(DARKSTR_DEFAULTS[DARKSTR_PREF.NATIVE_PERSONA_HOOKS], false);
  const n = normalizeDarkstrPrefs({});
  assert.equal(n[DARKSTR_PREF.NATIVE_PERSONA_HOOKS], false);
  const on = normalizeDarkstrPrefs({ "darkstr.nativePersonaHooks": true });
  assert.equal(on[DARKSTR_PREF.NATIVE_PERSONA_HOOKS], true);
});

test("background injectPersona gates on nativePersonaHooks", () => {
  const bg = readFileSync(join(root, "extension/background.js"), "utf8");
  assert.match(bg, /function nativePersonaHooksEnabled/);
  assert.match(bg, /if \(nativePersonaHooksEnabled\(\)\)/);
  assert.match(bg, /Native path owns Navigator\/HTTP/);
});

test("0003 patch is a real unified diff not a stub", () => {
  const patch = readFileSync(
    join(root, "patches/0003-darkstr-native-persona-hooks.patch"),
    "utf8"
  );
  assert.match(patch, /DarkstrNativePersona\.sys\.mjs/);
  assert.match(patch, /http-on-modify-request/);
  assert.match(patch, /sec-ch-ua/);
  assert.match(patch, /nativePersonaHooks/);
  assert.doesNotMatch(patch, /^# STUB/m);
  assert.ok(patch.length > 5000, "patch should be substantial");
});

test("0005 C++ nsHttp patch is a real unified diff (UA + CH REMOVE)", () => {
  const patch = readFileSync(
    join(root, "patches/0005-darkstr-cpp-native-hooks.patch"),
    "utf8"
  );
  assert.match(patch, /DarkstrNsHttpHooks/);
  assert.match(patch, /nsHttpHandler\.cpp/);
  assert.match(patch, /RemoveClientHintHeaders/);
  assert.match(patch, /darkstr\.persona\.ua/);
  assert.match(patch, /sec-ch-ua/);
  // Honesty: non-claims may name Cloudflare/TLS/JA3 only to deny them.
  assert.match(patch, /No Cloudflare\/TLS\/JA3 claims|not Cloudflare/i);
  assert.doesNotMatch(patch, /bypass Cloudflare|spoof JA3|defeat TLS/i);
  assert.doesNotMatch(patch, /^# STUB/m);
  assert.ok(patch.length > 4000, "0005 patch should be substantial");
  // Focused PR: do not claim Navigator.cpp / nsDocShell.cpp in this drop
  assert.doesNotMatch(patch, /Navigator\.cpp/);
  assert.doesNotMatch(patch, /nsDocShell\.cpp/);
});

test("apply script has 0005 content markers", () => {
  const sh = readFileSync(
    join(root, "patches/scripts/apply-darkstr-patches.sh"),
    "utf8"
  );
  assert.match(sh, /0005-darkstr-cpp-native-hooks\.patch/);
  assert.match(sh, /DarkstrNsHttpHooks\.cpp/);
});

test("0006 C++ Navigator/DocShell patch is a real unified diff", () => {
  const patch = readFileSync(
    join(root, "patches/0006-darkstr-cpp-navigator-docshell.patch"),
    "utf8"
  );
  assert.match(patch, /DarkstrNavigatorHooks/);
  assert.match(patch, /Navigator\.cpp/);
  assert.match(patch, /DarkstrDocShellHooks/);
  assert.match(patch, /nsDocShell\.cpp/);
  assert.match(patch, /darkstr\.persona\.platform/);
  assert.match(patch, /chrome counter remains SoT|chrome remains SoT|Honest stub/i);
  // Must not touch nsHttp sources / regress CH (mentions of 0005 in comments OK)
  assert.doesNotMatch(patch, /nsHttpHandler\.cpp/);
  assert.doesNotMatch(patch, /^\+.*DarkstrNsHttpHooks\.(cpp|h)/m);
  assert.doesNotMatch(patch, /diff -ruN a\/netwerk\//);
  assert.match(patch, /No Cloudflare\/TLS\/JA3 claims|not Cloudflare/i);
  assert.doesNotMatch(patch, /bypass Cloudflare|spoof JA3|defeat TLS/i);
  assert.doesNotMatch(patch, /^# STUB/m);
  assert.ok(patch.length > 4000, "0006 patch should be substantial");
});

test("apply script has 0006 content markers", () => {
  const sh = readFileSync(
    join(root, "patches/scripts/apply-darkstr-patches.sh"),
    "utf8"
  );
  assert.match(sh, /0006-darkstr-cpp-navigator-docshell\.patch/);
  assert.match(sh, /DarkstrNavigatorHooks\.cpp/);
  assert.match(sh, /DarkstrDocShellHooks\.cpp/);
});

test("0007 C++ DocShell SoT patch is a real unified diff", () => {
  const patch = readFileSync(
    join(root, "patches/0007-darkstr-cpp-docshell-nav-sot.patch"),
    "utf8"
  );
  assert.match(patch, /DarkstrDocShellHooks/);
  assert.match(patch, /ShouldApplyPersona/);
  assert.match(patch, /CurrentPhase/);
  assert.match(patch, /mBrowsingContext->Id\(\)/);
  assert.match(patch, /M3-CPP-DOCSHELL/);
  assert.match(patch, /Prefer C\+\+ SoT mirror/);
  assert.doesNotMatch(patch, /nsHttpHandler/);
  assert.doesNotMatch(patch, /^# STUB/m);
  assert.ok(patch.length > 3000, "0007 patch should be substantial");
});

test("apply script has 0007 content markers", () => {
  const sh = readFileSync(
    join(root, "patches/scripts/apply-darkstr-patches.sh"),
    "utf8"
  );
  assert.match(sh, /0007-darkstr-cpp-docshell-nav-sot\.patch/);
  assert.match(sh, /ShouldApplyPersona/);
  assert.match(sh, /M3-CPP-DOCSHELL/);
});
