/**
 * 0055: personas claim the engine's Firefox version (Fable N6, decided by
 * Alex), seed fallback == Rust (O9), worker Intl locale == page (O12 r2).
 *
 *   - Rust: duppel_persona builds its UA tables from Gecko's
 *     config/milestone.txt (build.rs → firefox_ua!); no 139/140.
 *   - NativePersona: UA from Services.appinfo.version; the no-FFI seed
 *     fallback is an exact port of generate_persona (incl. timezone) and
 *     matches fixtures/persona-goldens-0055.json, which Rust writes/checks.
 *   - A native snapshot that claims another version is not used.
 *   - O12 r2: no C++; worker and page Intl both use the app locale (stock).
 *   - Extension (not bundled in the app; kept in sync): UAs from the real
 *     engine UA, appVersion in Gecko's format.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const F55 = join(root, "patches/0055-files");
const read = (p) => readFileSync(join(root, p), "utf8");

let appVersion = "156.0.1";
let ffiSnapshot = null;
let hostOscpu = "Intel Mac OS X 10.15";
globalThis.Services = {
  get appinfo() {
    return { version: appVersion, name: "LibreWolf" };
  },
  prefs: {
    getStringPref: (_k, d) => d,
    getIntPref: (_k, d) => d,
    getBoolPref: (_k, d) => d,
    getCharPref: (_k, d) => d,
    prefHasUserValue: () => false,
    addObserver() {},
    removeObserver() {},
  },
  obs: { addObserver() {}, removeObserver() {} },
  ppmm: { addMessageListener() {}, removeMessageListener() {} },
};
globalThis.Cc = {
  "@mozilla.org/network/protocol;1?name=http": {
    getService: () => ({ get oscpu() { return hostOscpu; } }),
  },
};
globalThis.Ci = { nsIHttpProtocolHandler: {} };
globalThis.ChromeUtils = {
  importESModule(url) {
    if (url.includes("DarkstrFfi")) {
      return {
        DarkstrFfi: {
          personaSnapshotFromSeed: () => (ffiSnapshot ? { ...ffiSnapshot } : null),
          lastLoadError: () => "test",
        },
      };
    }
    return {};
  },
  defineESModuleGetters() {},
  registerWindowActor() {},
  unregisterWindowActor() {},
};
const quiet = console.warn;
const NP = await import(pathToFileURL(join(F55, "DarkstrNativePersona.sys.mjs")));
const P = NP.DarkstrNativePersona;

const GOLDENS = JSON.parse(read("fixtures/persona-goldens-0055.json"));
const OSCPU = { macos: "Intel Mac OS X 10.15", windows: "Windows NT 10.0; Win64; x64", linux: "Linux x86_64" };
const fill = (snap, rv) => ({ ...snap, userAgent: snap.userAgent.replaceAll("{RV}", rv) });

// ------------------------------------------------------------ O9 / N6 ---
test("O9: seed fallback == Rust generate_persona for every golden vector (incl. timezone)", () => {
  assert.ok(GOLDENS.vectors.length >= 36);
  for (const v of GOLDENS.vectors) {
    const got = NP.generatePersonaFallback(v.seed, v.os);
    assert.deepEqual(got, fill(v.snapshot, "156.0"), `seed ${v.seed} ${v.os}`);
    assert.ok(got.timezone && got.timezone !== "UTC");
  }
});

test("O9: _generateFromSeed (the no-FFI path) uses the host OS and matches Rust", () => {
  for (const os of ["macos", "windows", "linux"]) {
    hostOscpu = OSCPU[os];
    for (const v of GOLDENS.vectors.filter((x) => x.os === os)) {
      assert.deepEqual(P._generateFromSeed(v.seed), fill(v.snapshot, "156.0"));
    }
  }
  hostOscpu = OSCPU.macos;
});

test("N6: the version comes from the engine (Services.appinfo.version)", () => {
  for (const [ver, rv] of [["156.0.1", "156.0"], ["157.0a1", "157.0"], ["160.0", "160.0"]]) {
    appVersion = ver;
    const p = NP.generatePersonaFallback(42, "linux");
    assert.match(p.userAgent, new RegExp(`; rv:${rv.replace(".", "\\.")}\\) Gecko/20100101 Firefox/${rv.replace(".", "\\.")}$`));
  }
  appVersion = "";
  assert.equal(NP.generatePersonaFallback(42, "macos"), null, "unknown engine version → no persona");
  appVersion = "156.0.1";
});

test("N6: a macOS persona UA is the real LibreWolf 156 UA byte for byte", () => {
  const p = NP.generatePersonaFallback(42, "macos");
  assert.equal(p.userAgent, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0");
  assert.equal(p.platform, "MacIntel");
  assert.equal(p.appVersion, "5.0 (Macintosh)");
});

test("N6: FFI snapshot claiming another version is not used; engine-version one is", () => {
  console.warn = () => {};
  try {
    ffiSnapshot = { ...fill(GOLDENS.vectors[0].snapshot, "140.0") };
    assert.equal(P._readSnapshotFromFfi(1), null);
    ffiSnapshot = { ...fill(GOLDENS.vectors[0].snapshot, "156.0") };
    assert.deepEqual(P._readSnapshotFromFfi(1), ffiSnapshot);
  } finally {
    ffiSnapshot = null;
    console.warn = quiet;
  }
});

test("N6: a locked Firefox snapshot claims the engine version; non-Firefox UAs untouched", () => {
  assert.equal(
    NP.withEngineFirefoxVersion("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:139.0) Gecko/20100101 Firefox/139.0"),
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0"
  );
  const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
  assert.equal(NP.withEngineFirefoxVersion(chrome), chrome);
});

test("N6: no 139/140 anywhere in the shipped persona sources", () => {
  const files = [
    "patches/0055-files/DarkstrNativePersona.sys.mjs",
    "crates/duppel-persona/src/lib.rs",
    "crates/duppel-ffi/src/lib.rs",
    "extension/lib/profiles.js",
    "extension/src/content/anti-fingerprint/core.js",
    "extension/anti-fingerprint-bootstrap.js",
  ];
  for (const f of files) {
    assert.doesNotMatch(read(f), /rv:1[34]\d\.0|Firefox\/1[34]\d\.0/, f);
  }
});

test("O9: NativePersona fallback tables == Rust tables (OS tokens, languages, timezones, cores, memory)", () => {
  const rs = read("crates/duppel-persona/src/lib.rs");
  const np = readFileSync(join(F55, "DarkstrNativePersona.sys.mjs"), "utf8");
  const rustOs = [...rs.matchAll(/firefox_ua!\("([^"]+)"\)/g)].map((m) => m[1]);
  const npOs = [...np.matchAll(/uaOs: \[([^\]]+)\]/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  assert.deepEqual(npOs, ["Windows NT 10.0; Win64; x64", "Macintosh; Intel Mac OS X 10.15", "X11; Linux x86_64", "X11; Ubuntu; Linux x86_64"]);
  assert.deepEqual([...rustOs].sort(), [...npOs].sort());
  const block = (src, start, end) => src.slice(src.indexOf(start), src.indexOf(end, src.indexOf(start)));
  const strs = (t) => [...t.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const nums = (t) => [...t.matchAll(/\b(\d+)\b/g)].map((m) => +m[1]);
  assert.deepEqual(strs(block(np, "const TIMEZONES", "];")), strs(block(rs, "static TIMEZONES", "];")));
  assert.deepEqual(strs(block(np, "const LANGUAGES", "];\n")), strs(block(rs, "static LANGUAGES", "];\n")));
  assert.deepEqual(nums(block(np, "const CORES", ";")), nums(block(rs, "static CORES: &[u32] =", ";")));
  assert.deepEqual(nums(block(np, "const MEMORY", ";")), nums(block(rs, "static MEMORY: &[u32] =", ";")));
});

test("N6: Rust reads the engine version from Gecko's config/milestone.txt", () => {
  const b = read("crates/duppel-persona/build.rs");
  assert.match(b, /join\("config"\)\.join\("milestone\.txt"\)/);
  assert.match(b, /firefox_ua/);
  const pinned = read("crates/duppel-persona/gecko-milestone.txt").split("\n").filter((l) => l && !l.startsWith("#")).pop();
  assert.equal(pinned, "156.0.1");
  const gecko = process.env.DARKSTR_GECKO_ROOT && join(process.env.DARKSTR_GECKO_ROOT, "config/milestone.txt");
  if (gecko && existsSync(gecko)) {
    const tree = readFileSync(gecko, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).pop();
    assert.equal(pinned, tree, "fallback copy == engine tree");
  }
  assert.match(read("crates/duppel-ffi/src/lib.rs"), /\\"appVersion\\":/);
});

// ------------------------------------------------------------------ O12 ---
// r2 (Proof review of #86): Intl locale is the app locale in pages AND workers,
// as in stock Firefox (Intl never follows Accept-Language / navigator.languages).
// r1 set WorkerLoadInfo.mLanguageOverrideLocale = persona languages[0], so an
// armed worker said en-GB while its page said en-US: a page/worker split stock
// never shows. 0055 no longer touches DarkstrNavigatorHooks.cpp; workers keep
// the persona navigator.languages (0049) and the app-locale Intl, like the page.
test("O12 r2: worker Intl locale == page Intl locale (app locale); 0055 ships no hooks C++", () => {
  assert.ok(!existsSync(join(F55, "DarkstrNavigatorHooks.cpp")), "0055-files must not carry the r1 C++");
  const cpp0049 = readFileSync(join(root, "patches/0049-files/DarkstrNavigatorHooks.cpp"), "utf8");
  assert.doesNotMatch(cpp0049, /mLanguageOverrideLocale/);
  assert.match(cpp0049, /aLoadInfo\.mLanguageOverride = persona->mLanguages\.Clone\(\);/, "worker navigator.languages still persona (0049)");
  const patch = readFileSync(join(root, "patches/0055-darkstr-persona-ff156.patch"), "utf8");
  assert.doesNotMatch(patch, /DarkstrNavigatorHooks|mLanguageOverrideLocale/);
  const sh = readFileSync(join(root, "scripts/apply-0055-persona-ff156-mini.sh"), "utf8");
  // Upgrades a tree that has 0055 r1 applied back to the 0049 hooks, and refuses a locale override.
  assert.match(sh, /2219e76d91536db7116638a650547e46fce722307ff899ae2871dcf701a3cf96/);
  assert.match(sh, /patches\/0049-files\/DarkstrNavigatorHooks\.cpp/);
  assert.match(sh, /grep -q 'mLanguageOverrideLocale' "\$H"/);
  // The worker payload carries the same languages the page shows.
  const np = readFileSync(join(F55, "DarkstrNativePersona.sys.mjs"), "utf8");
  assert.match(np, /workerPersonaFields\(snap\) \{\s*const child = this\._childSnapshot\(snap\);/);
});

// ------------------------------------------------------------ extension ---
function loadProfiles(ua, platform) {
  const ctx = createContext({ navigator: { userAgent: ua, platform }, crypto: { getRandomValues: (a) => a } });
  ctx.globalThis = ctx;
  runInContext(read("extension/lib/profiles.js"), ctx, { filename: "profiles.js" });
  return ctx;
}
test("extension: personas claim the host engine's version, appVersion in Gecko format", () => {
  for (const [ua, platform, appV] of [
    ["Mozilla/5.0 (X11; Linux x86_64; rv:156.0) Gecko/20100101 Firefox/156.0", "Linux x86_64", "5.0 (X11)"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:157.0) Gecko/20100101 Firefox/157.0", "Win32", "5.0 (Windows)"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0", "MacIntel", "5.0 (Macintosh)"],
  ]) {
    const rv = /rv:(\d+\.0)/.exec(ua)[1];
    const ctx = loadProfiles(ua, platform);
    for (const seed of [1, 7, 42, 99]) {
      const p = ctx.generateProfile(seed);
      assert.ok(p.userAgent.endsWith(`; rv:${rv}) Gecko/20100101 Firefox/${rv}`), p.userAgent);
      assert.equal(p.appVersion, appV);
    }
  }
});

test("N6: DarkstrFfi passes the native appVersion through; 0055 ships it with the patch + apply script", () => {
  const ffi = readFileSync(join(root, "patches/0055-files/DarkstrFfi.sys.mjs"), "utf8");
  const prev = readFileSync(join(root, "patches/0052-files/DarkstrFfi.sys.mjs"), "utf8");
  assert.match(ffi, /appVersion:\s*\n?\s*typeof parsed\.appVersion === "string" \? parsed\.appVersion : undefined,/);
  // Only that one field is added on top of the 0052 copy.
  const added =
    '    // 0055 (N6): Firefox navigator.appVersion ("5.0 (Macintosh)"), from the\n' +
    "    // same native table as userAgent.\n" +
    "    appVersion:\n" +
    '      typeof parsed.appVersion === "string" ? parsed.appVersion : undefined,\n';
  assert.equal(ffi.replace(added, ""), prev);
  const patch = readFileSync(join(root, "patches/0055-darkstr-persona-ff156.patch"), "utf8");
  const sh = readFileSync(join(root, "scripts/apply-0055-persona-ff156-mini.sh"), "utf8");
  assert.match(patch, /^\+\+\+ b\/browser\/components\/DarkstrFfi\.sys\.mjs$/m);
  assert.match(sh, /"DarkstrFfi\.sys\.mjs:browser\/components\/DarkstrFfi\.sys\.mjs"/);
});
