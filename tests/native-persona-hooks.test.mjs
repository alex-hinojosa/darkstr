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
