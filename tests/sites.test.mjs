import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadClassic(...rels) {
  const ctx = createContext({ globalThis: {} });
  ctx.globalThis = ctx;
  for (const rel of rels) {
    runInContext(readFileSync(join(root, rel), "utf8"), ctx, { filename: rel });
  }
  return ctx;
}

const sites = loadClassic("extension/lib/sites.js");
const prefs = loadClassic("extension/lib/sites.js", "extension/lib/prefs.js");

test("getETLD1 handles common hosts and multi-part suffixes", () => {
  assert.equal(sites.getETLD1("www.example.com"), "example.com");
  assert.equal(sites.getETLD1("a.b.example.com"), "example.com");
  assert.equal(sites.getETLD1("foo.co.uk"), "foo.co.uk");
  assert.equal(sites.getETLD1("bar.foo.co.uk"), "foo.co.uk");
  assert.equal(sites.getETLD1("myapp.github.io"), "myapp.github.io");
  assert.equal(sites.getETLD1("localhost"), "localhost");
});

test("isNativeCompatSite matches eTLD+1 map", () => {
  const map = { "example.com": true, "foo.co.uk": true };
  assert.equal(sites.isNativeCompatSite(map, "https://www.example.com/path"), true);
  assert.equal(sites.isNativeCompatSite(map, "https://other.com/"), false);
  assert.equal(sites.isNativeCompatSite(map, "https://a.foo.co.uk/"), true);
});

test("normalizeDarkstrPrefs keeps sites map and defaults strictFirstDoc true", () => {
  const n = prefs.normalizeDarkstrPrefs({
    "darkstr.mode": "pollution",
    "darkstr.nativeCompatSites": { "bank.example": true, skip: false },
  });
  assert.equal(n["darkstr.mode"], "pollution");
  assert.equal(n["darkstr.nativeCompatSites"]["bank.example"], true);
  assert.equal(Object.keys(n["darkstr.nativeCompatSites"]).length, 1);
  assert.equal(n["darkstr.strictFirstDoc"], true);

  const off = prefs.normalizeDarkstrPrefs({
    "darkstr.mode": "pollution",
    "darkstr.strictFirstDoc": false,
  });
  assert.equal(off["darkstr.strictFirstDoc"], false);
});

test("pref keys include nativeCompatSites and strictFirstDoc", () => {
  assert.equal(prefs.DARKSTR_PREF.NATIVE_COMPAT_SITES, "darkstr.nativeCompatSites");
  assert.equal(prefs.DARKSTR_PREF.STRICT_FIRST_DOC, "darkstr.strictFirstDoc");
});
