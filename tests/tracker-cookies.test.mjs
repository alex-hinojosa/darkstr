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

const lib = loadClassic("extension/lib/tracker-cookies.js");

test("isTrackerCookieDomain matches list and subdomains", () => {
  assert.equal(lib.isTrackerCookieDomain(".doubleclick.net"), true);
  assert.equal(lib.isTrackerCookieDomain("ads.doubleclick.net"), true);
  assert.equal(lib.isTrackerCookieDomain("example.com"), false);
  assert.equal(lib.isTrackerCookieDomain("notdoubleclick.net"), false);
});

test("selectTrackerCookies filters jar by Domain", () => {
  const selected = lib.selectTrackerCookies([
    { name: "IDE", domain: ".doubleclick.net", path: "/", secure: true },
    { name: "session", domain: "bank.example", path: "/", secure: true },
    { name: "_ga", domain: ".google-analytics.com", path: "/", secure: true },
  ]);
  assert.equal(selected.length, 2);
  assert.equal(selected[0].name, "IDE");
  assert.equal(selected[1].name, "_ga");
});

test("cookieRemoveUrl builds https when secure", () => {
  assert.equal(
    lib.cookieRemoveUrl({
      domain: ".ads.doubleclick.net",
      path: "/",
      secure: true,
    }),
    "https://ads.doubleclick.net/"
  );
  assert.equal(
    lib.cookieRemoveUrl({ domain: "hotjar.com", path: "/x", secure: false }),
    "http://hotjar.com/x"
  );
});

test("chaff beacon domains include GA + facebook.com", () => {
  assert.equal(lib.isChaffBeaconDomain("www.google-analytics.com"), true);
  assert.equal(lib.isChaffBeaconDomain("www.facebook.com"), true);
  assert.equal(lib.isChaffBeaconDomain("doubleclick.net"), false);
});
