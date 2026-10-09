/**
 * 0058: OS-derived navigator fields follow the persona's OS (Proof 0055r2 note: a pasted Win32 lock
 * reported appVersion "5.0 (Macintosh)"). Unit tests for platformFieldsFor + patch integrity + the
 * worker / C++ wiring (static; live checks are in the 0058 evidence). End-to-end page tests are in
 * persona-surface-0051.test.mjs ("0058: …").
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const F = join(root, "patches", "0058-files");
const read = (p) => readFileSync(join(root, p), "utf8");
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

globalThis.Services ??= {
  appinfo: { version: "156.0.1" },
  prefs: { getStringPref: (_k, d) => d, getIntPref: (_k, d) => d, getBoolPref: (_k, d) => d, prefHasUserValue: () => false, addObserver() {}, removeObserver() {} },
  obs: { addObserver() {}, removeObserver() {} },
  ppmm: { addMessageListener() {}, removeMessageListener() {} },
};
globalThis.Cc ??= { "@mozilla.org/network/protocol;1?name=http": { getService: () => ({ oscpu: "Intel Mac OS X 10.15" }) } };
globalThis.Ci ??= { nsIHttpProtocolHandler: {} };
globalThis.ChromeUtils ??= { importESModule: () => ({}), defineESModuleGetters() {}, registerWindowActor() {}, unregisterWindowActor() {} };
const NP = await import(pathToFileURL(join(F, "DarkstrNativePersona.sys.mjs")));

const UA = (os) => `Mozilla/5.0 (${os}; rv:156.0) Gecko/20100101 Firefox/156.0`;

test("platformFieldsFor: Gecko's per-OS values, UA OS token first", () => {
  const W = { platform: "Win32", appVersion: "5.0 (Windows)", oscpu: "Windows NT 10.0; Win64; x64" };
  for (const platform of ["Win32", undefined, "MacIntel", "Linux x86_64"]) {
    const { os, ...f } = NP.platformFieldsFor({ userAgent: UA("Windows NT 10.0; Win64; x64"), platform });
    assert.equal(os, "windows");
    assert.deepEqual(f, W, String(platform));
  }
  assert.deepEqual(NP.platformFieldsFor({ userAgent: UA("Macintosh; Intel Mac OS X 10.15") }),
    { os: "macos", platform: "MacIntel", appVersion: "5.0 (Macintosh)", oscpu: "Intel Mac OS X 10.15" });
  assert.deepEqual(NP.platformFieldsFor({ userAgent: UA("X11; Ubuntu; Linux x86_64"), platform: "Linux aarch64" }),
    { os: "linux", platform: "Linux x86_64", appVersion: "5.0 (X11)", oscpu: "Linux x86_64" });
  assert.deepEqual(NP.platformFieldsFor({ userAgent: UA("X11; Linux aarch64") }),
    { os: "linux", platform: "Linux aarch64", appVersion: "5.0 (X11)", oscpu: "Linux aarch64" });
});

test("platformFieldsFor: non-Firefox UA falls back to platform; unknown → null (native fields)", () => {
  assert.deepEqual(NP.platformFieldsFor({ userAgent: "custom", platform: "Win32" }),
    { os: "windows", platform: "Win32", appVersion: "5.0 (Windows)", oscpu: "Windows NT 10.0; Win64; x64" });
  assert.equal(NP.platformFieldsFor({ userAgent: "custom" }), null);
  assert.equal(NP.platformFieldsFor(null), null);
});

test("every seeded persona is already platform-correct (goldens unchanged)", () => {
  for (const os of ["macos", "windows", "linux"]) {
    for (let seed = 1; seed <= 200; seed++) {
      const p = NP.generatePersonaFallback(seed, os);
      const f = NP.platformFieldsFor(p);
      assert.equal(f.os, os);
      assert.equal(f.platform, p.platform, `${os} ${seed}`);
      assert.equal(f.appVersion, p.appVersion, `${os} ${seed}`);
    }
  }
});

test("patch integrity: sums, 6 files, baseline = pinned predecessors", () => {
  for (const l of read("patches/0058-files/SHA256SUMS").trim().split("\n")) {
    const [h, f] = l.split(/\s+/);
    assert.equal(sha(join(F, f)), h, f);
  }
  const base = { "DarkstrNativePersona.sys.mjs": "0057-files", "DarkstrNativePersonaChild.sys.mjs": "0051-files",
    "DarkstrWorkerHooksChild.sys.mjs": "0057-files", "DarkstrNavigatorHooks.h": "0049-files",
    "DarkstrNavigatorHooks.cpp": "0056-files", "WorkerNavigator.cpp": "0049-files" };
  const lines = read("patches/0058-files/BASE_SHA256SUMS").trim().split("\n");
  assert.equal(lines.length, 6);
  for (const l of lines) {
    const [h, p] = l.split(/\s+/);
    const f = p.split("/").pop();
    assert.equal(sha(join(root, "patches", base[f], f)), h, p);
  }
  const patch = read("patches/0058-darkstr-snapshot-platform.patch");
  assert.equal((patch.match(/^\+\+\+ b\//gm) || []).length, 6);
  const apply = read("scripts/apply-0058-snapshot-platform-mini.sh");
  assert.match(apply, /never a bare mach build/);
  assert.match(apply, /obj-aarch64-apple-darwin25\.6\.0/);
});

test("workers: appVersion flows bag → DarkstrWorkerPersona → WorkerNavigator (before RFP / override)", () => {
  assert.match(read("patches/0058-files/DarkstrWorkerHooksChild.sys.mjs"), /setPropertyAsAString\("appVersion"/);
  assert.match(read("patches/0058-files/DarkstrNavigatorHooks.h"), /nsString mAppVersion;/);
  assert.match(read("patches/0058-files/DarkstrNavigatorHooks.cpp"), /GetPropertyAsAString\(u"appVersion"_ns, persona->mAppVersion\)/);
  const wn = read("patches/0058-files/WorkerNavigator.cpp");
  const body = wn.slice(wn.indexOf("void WorkerNavigator::GetAppVersion"), wn.indexOf("void WorkerNavigator::GetPlatform"));
  assert.ok(body.indexOf("persona->mAppVersion") > 0);
  assert.ok(body.indexOf("persona->mAppVersion") < body.indexOf("ShouldResistFingerprinting"));
  assert.match(body, /aCallerType != CallerType::System\) \{\n\s*\/\/ darkstr 0058/);
});
