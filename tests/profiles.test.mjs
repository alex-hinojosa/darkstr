import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadProfiles({ ua, platform }) {
  const ctx = createContext({
    globalThis: {},
    navigator: { userAgent: ua, platform },
    crypto: {
      getRandomValues(arr) {
        arr[0] = 0x12345678;
        return arr;
      },
    },
  });
  ctx.globalThis = ctx;
  ctx.navigator = ctx.navigator;
  runInContext(
    readFileSync(join(root, "extension/lib/profiles.js"), "utf8"),
    ctx,
    { filename: "profiles.js" }
  );
  return ctx;
}

test("Linux Firefox host produces a Firefox Linux persona", () => {
  const ctx = loadProfiles({
    ua: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
    platform: "Linux x86_64",
  });
  assert.equal(ctx.DARKSTR_HOST.engine, "firefox");
  assert.equal(ctx.DARKSTR_HOST.os, "linux");
  const profile = ctx.generateProfile(42);
  assert.ok(profile);
  assert.match(profile.userAgent, /Firefox\//);
  assert.match(profile.userAgent, /Linux/);
  assert.equal(profile.platform, "Linux x86_64");
  assert.equal(ctx.deriveClientHints(profile), null);
  const headers = ctx.buildPersonaRequestHeaders(profile);
  assert.ok(headers.some((h) => h.header === "User-Agent" && h.operation === "set"));
  assert.ok(
    headers.some(
      (h) => h.header === "sec-ch-ua" && h.operation === "remove"
    )
  );
});

test("same seed is deterministic on a fixed host", () => {
  const ctx = loadProfiles({
    ua: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
    platform: "Linux x86_64",
  });
  const a = ctx.generateProfile(99);
  const b = ctx.generateProfile(99);
  assert.deepEqual(a, b);
});

test("Windows Firefox host does not pick Linux UA", () => {
  const ctx = loadProfiles({
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    platform: "Win32",
  });
  const profile = ctx.generateProfile(7);
  assert.ok(profile);
  assert.match(profile.userAgent, /Windows NT/);
  assert.doesNotMatch(profile.userAgent, /Linux/);
});
