/**
 * 0058c: pasted Windows / Linux snapshots report a WebGL GPU coherent with their OS (DarkstrDepthHooks
 * personaGpu): ANGLE / Direct3D11 on Windows, Mesa / native GL on Linux, reported through Gecko's sanitizer
 * like stock Firefox on that OS. A snapshot's own GPU strings only when OS-coherent, else a bucketed default
 * of that OS + a warning. macOS personas are unchanged. Tests run against patches/0058c-files.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
globalThis.JSProcessActorChild ??= class {};
globalThis.JSWindowActorChild ??= class {};
globalThis.Services ??= { obs: { addObserver() {} } };
const DH = read("patches/0058c-files/DarkstrDepthHooks.sys.mjs");
const DH57 = read("patches/0057-files/DarkstrDepthHooks.sys.mjs");
const NP = read("patches/0058fp-files/DarkstrNativePersona.sys.mjs");
const WHC = await import(pathToFileURL(join(root, "patches/0058c-files/DarkstrWorkerHooksChild.sys.mjs")).href);
const { geckoSanitizeRenderer, personaGlString } = WHC;

// The real helper region of the pin file (GPU table .. normalizeGpu), evaluated with a console stub.
const region = DH.slice(DH.indexOf("const GPU_BY_OS = {"), DH.indexOf("function readU32Field(")).replace(/^export /gm, "");
const warnings = [];
const H = new Function("console", `${region}; return { GPU_BY_OS, snapshotOsForGpu, gpuCoherentWithOs, personaGpu, normalizeGpu };`)(
  { warn: (m) => warnings.push(m) });
// _generateDepthFromSeed (method body) of a source, host OS stubbed to macOS.
function generator(src) {
  const r = src.slice(src.indexOf("const GPU_BY_OS = {"), src.indexOf("function detectHostOs()")).replace(/^export /gm, "");
  const i = src.indexOf("  _generateDepthFromSeed(seed");
  const sig = src.slice(i, src.indexOf("{", i) + 1);
  const body = src.slice(i + sig.length, src.indexOf("\n  },\n", i));
  const params = sig.slice(sig.indexOf("(") + 1, sig.lastIndexOf(")"));
  return new Function(`${r}; const detectHostOs = () => "macos"; return function (${params}) {${body}\n};`)();
}
const gen = generator(DH), gen57 = generator(DH57);

const UA = {
  win: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0",
  linux: "Mozilla/5.0 (X11; Linux x86_64; rv:156.0) Gecko/20100101 Firefox/156.0",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0",
};
const APPLE = { vendor: "Apple", renderer: "Apple M2" };
const MACINTEL = { vendor: "Intel Inc.", renderer: "Intel(R) Iris(R) Plus Graphics" };

test("0058c gpu: pin carries DarkstrDepthHooks against the shipped 0059 copy (keeps 0059's change); apply script checks it", () => {
  const base = read("patches/0058c-files/BASE_SHA256SUMS");
  assert.match(base, /  browser\/components\/DarkstrDepthHooks\.sys\.mjs$/m);
  // r2: 0059 shipped first, so 0058c's copy must keep 0059's actor change (no `matches`).
  assert.doesNotMatch(DH, /matches: \["\*:\/\/\*\/\*", "file:\/\/\*"\]/);
  assert.match(DH, /\/\/ 0059 \(Fable B7\): no `matches`/);
  const sh = read("scripts/apply-0058c-webgpu-gate-os-mini.sh");
  assert.match(sh, /"DarkstrDepthHooks\.sys\.mjs:browser\/components\/DarkstrDepthHooks\.sys\.mjs"/);
  assert.match(sh, /export function personaGpu\(snap, gpu, seed, \{ useOwn = true \} = \{\}\)/);
});

test("0058c gpu: snapshotOsForGpu == NativePersona snapshotOs (UA OS token first, then platform)", () => {
  const np = NP.slice(NP.indexOf("function uaOsToken(ua)"), NP.indexOf("/** nsHttpHandler builds the UA OS token")).replace(/^export /gm, "");
  const snapshotOs = new Function(`${np}; return snapshotOs;`)();
  const cases = [
    { userAgent: UA.win, platform: "Win32" }, { userAgent: UA.linux }, { userAgent: UA.mac, platform: "MacIntel" },
    { userAgent: UA.win, platform: "MacIntel" }, { platform: "Linux x86_64" }, { platform: "Win32" }, {}, null,
    { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  ];
  for (const c of cases) assert.equal(H.snapshotOsForGpu(c), snapshotOs(c), JSON.stringify(c));
});

test("0058c gpu: every per-OS table entry is coherent with its OS and only its OS", () => {
  for (const [os, list] of Object.entries(H.GPU_BY_OS)) {
    assert.equal(list.length, 3, `${os} table length (rng index parity)`);
    for (const g of list) {
      assert.equal(H.gpuCoherentWithOs(g, os), true, `${os}: ${g.renderer}`);
      for (const other of ["windows", "linux"]) if (other !== os) assert.equal(H.gpuCoherentWithOs(g, other), false, `${g.renderer} not ${other}`);
    }
  }
  assert.equal(H.gpuCoherentWithOs(APPLE, "windows"), false);
  assert.equal(H.gpuCoherentWithOs(APPLE, "linux"), false);
  assert.equal(H.gpuCoherentWithOs({ vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)" }, "linux"), false);
  assert.equal(H.gpuCoherentWithOs({ vendor: "NVIDIA Corporation", renderer: "NVIDIA GeForce GTX 1660/PCIe/SSE2" }, "windows"), false);
  assert.equal(H.gpuCoherentWithOs({ vendor: "Mesa", renderer: "llvmpipe (LLVM 15.0.7, 256 bits)" }, "linux"), true);
  assert.equal(H.gpuCoherentWithOs({ vendor: "Intel", renderer: "Mesa Intel(R) Xe Graphics (TGL GT2)" }, "mac" + "os"), false);
});

test("0058c gpu: Windows / Linux tables report like stock Firefox on that OS (Gecko sanitizer)", () => {
  const exp = {
    windows: [
      ["Google Inc. (Intel)", "ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar"],
      ["Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar"],
      ["Google Inc. (AMD)", "ANGLE (AMD, Radeon R9 200 Series Direct3D11 vs_5_0 ps_5_0), or similar"],
    ],
    linux: [
      ["Intel", "Intel(R) HD Graphics 400, or similar"],
      ["NVIDIA Corporation", "NVIDIA GeForce GTX 980, or similar"],
      ["AMD", "Radeon R9 200 Series, or similar"],
    ],
  };
  for (const [os, rows] of Object.entries(exp)) {
    H.GPU_BY_OS[os].forEach((g, i) => {
      const [vendor, renderer] = rows[i];
      assert.equal(personaGlString(0x9245, "x", g), vendor, `${os} UNMASKED_VENDOR`);
      assert.equal(personaGlString(0x1f01, "x", g), renderer, `${os} RENDERER`);
      assert.equal(personaGlString(0x9246, "x", g), renderer, `${os} UNMASKED_RENDERER`);
      assert.equal(personaGlString(0x1f00, "Mozilla", g), "Mozilla", "VENDOR stays Mozilla");
      assert.equal(geckoSanitizeRenderer(g.renderer), renderer);
    });
  }
});

test("0058c gpu: personaGpu -- own coherent GPU used, incoherent replaced (warned once), host GPU never leaks", () => {
  warnings.length = 0;
  const winOwn = { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)" };
  assert.deepEqual(H.personaGpu({ userAgent: UA.win, gpu: winOwn }, APPLE, 7), winOwn);
  const linOwn = { vendor: "AMD", renderer: "AMD Radeon RX 6600 (radeonsi, navi23, LLVM 17.0.6, DRM 3.57, 6.8.0)" };
  assert.deepEqual(H.personaGpu({ userAgent: UA.linux, gpu: linOwn }, APPLE, 7), linOwn);
  // incoherent own GPU (Apple on Windows) -> Windows default bucket + warning, once
  for (let k = 0; k < 2; k++) {
    const g = H.personaGpu({ userAgent: UA.win, gpu: APPLE }, APPLE, 4);
    assert.deepEqual(g, H.GPU_BY_OS.windows[4 % 3]);
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /not coherent with its windows OS/);
  // no own GPU: host (Apple / Mac Intel) GPU never passes for Windows / Linux
  for (const host of [APPLE, MACINTEL]) {
    for (const [os, ua] of [["windows", UA.win], ["linux", UA.linux]]) {
      for (let seed = 0; seed < 9; seed++) {
        const g = H.personaGpu({ userAgent: ua }, host, seed);
        assert.equal(H.gpuCoherentWithOs(g, os), true);
        assert.deepEqual(g, H.GPU_BY_OS[os][seed % 3]);
      }
    }
  }
  // platform-only snapshot (no UA OS token)
  assert.equal(H.gpuCoherentWithOs(H.personaGpu({ platform: "Linux x86_64" }, APPLE, 1), "linux"), true);
  // useOwn false (rotate path): own GPU ignored, coherent derived kept
  assert.deepEqual(H.personaGpu({ userAgent: UA.win, gpu: winOwn }, H.GPU_BY_OS.windows[2], 0, { useOwn: false }), H.GPU_BY_OS.windows[2]);
});

test("0058c gpu: macOS personas and unknown OS are unchanged", () => {
  warnings.length = 0;
  for (const g of [APPLE, MACINTEL, ...H.GPU_BY_OS.macos]) {
    assert.deepEqual(H.personaGpu({ userAgent: UA.mac }, g, 5), g);
    assert.deepEqual(H.personaGpu(null, g, 5), g);
    assert.deepEqual(H.personaGpu({}, g, 5), g);
  }
  assert.deepEqual(H.personaGpu({ userAgent: UA.mac, gpu: APPLE }, MACINTEL, 5), APPLE, "golden Mac snapshot GPU kept");
  assert.equal(warnings.length, 0);
});

test("0058c gpu: _generateDepthFromSeed -- macOS byte-identical to 0057; other OS = same seeds, same index, own table", () => {
  for (let s = 1; s < 400; s += 7) {
    const seed = (s * 2654435761) >>> 0;
    const a = gen57(seed), b = gen(seed), w = gen(seed, "windows"), l = gen(seed, "linux");
    assert.deepEqual(b, a, "host default unchanged");
    assert.deepEqual(gen(seed, "macos"), a, "macos override unchanged");
    for (const [x, os] of [[w, "windows"], [l, "linux"]]) {
      const { gpu, ...seeds } = x; const { gpu: ga, ...seedsA } = a;
      assert.deepEqual(seeds, seedsA, `${os}: every seed unchanged`);
      assert.deepEqual(gpu, H.GPU_BY_OS[os][H.GPU_BY_OS.macos.findIndex((g) => g.renderer === ga.renderer)], `${os}: same index`);
    }
  }
});

test("0058c gpu: wired on all three depth paths (rotate, golden snapshot, plan seeds)", () => {
  const f = DH.slice(DH.indexOf("  depthSeedsForBrowsingContext(bc, wgp = null) {"), DH.indexOf("  _readDepthSeeds() {"));
  assert.match(f, /this\._generateDepthFromSeed\(\s*seed,\s*snapshotOsForGpu\(snap\) \|\| undefined\s*\)/);
  assert.match(f, /gpu: personaGpu\(\s*snap,\s*\{ vendor: derived\.gpu\.vendor, renderer: derived\.gpu\.renderer \},\s*derived\.canvasSeed,\s*\{ useOwn: false \}\s*\)/);
  assert.match(f, /gpu: personaGpu\(\s*snap,\s*\{ vendor: snapGpu\.vendor, renderer: snapGpu\.renderer \},\s*snapCanvas\s*\)/);
  assert.match(f, /gpuSnap = snap;/);
  assert.match(f, /gpu: personaGpu\(\s*gpuSnap,\s*\{ vendor: plan\.seeds\.gpu\.vendor, renderer: plan\.seeds\.gpu\.renderer \},\s*plan\.seeds\.canvasSeed\s*\)/);
});

// _readDepthSeeds of a source (the method body), with a Services stub and the host OS stubbed to macOS.
function depthReader(src) {
  const consts = src.slice(src.indexOf('const MODE_PREF = "darkstr.mode";'), src.indexOf("/** 0057: per-site") > 0 ? src.indexOf("/** 0057: per-site") : src.indexOf("const GPU_BY_OS = {"));
  const helpers = src.slice(src.indexOf("const GPU_BY_OS = {"), src.indexOf("export var DarkstrDepthHooks = {")).replace(/^export /gm, "");
  const body = (name) => {
    const i = src.indexOf(`  ${name}(`); const sig = src.slice(i, src.indexOf("{", i) + 1);
    return [sig.slice(sig.indexOf("(") + 1, sig.lastIndexOf(")")), src.slice(i + sig.length, src.indexOf("\n  },\n", i))];
  };
  const [gp, gb] = body("_generateDepthFromSeed"), [, rb] = body("_readDepthSeeds");
  return (prefs, warn = () => {}) => {
    const Services = { prefs: {
      getStringPref: (n, d) => (n in prefs ? prefs[n] : d),
      getIntPref: (n, d) => (n in prefs ? prefs[n] : d),
    } };
    // host = macOS (the Mini): detectHostOs reads nsIHttpProtocolHandler.oscpu
    const Cc = { "@mozilla.org/network/protocol;1?name=http": { getService: () => ({ oscpu: "Intel Mac OS X 10.15" }) } };
    return new Function("Services", "console", "Cc", "Ci", `${consts}; ${helpers};
      const self = { _readPersonaSeedPref: () => (Services.prefs.getIntPref(SEED_PREF, 0) | 0),
                     _generateDepthFromSeed: function (${gp}) {${gb}\n} };
      self._generateDepthFromSeed = self._generateDepthFromSeed.bind(self);
      return (function () {${rb}\n}).call(self);`)(Services, { warn }, Cc, { nsIHttpProtocolHandler: {} });
  };
}
const read58c = depthReader(DH), read57 = depthReader(DH57);
const SNAP = "darkstr.persona.snapshot";

test("0058c gpu: a pasted snapshot without depth seeds now arms depth, GPU from its OS (was: unarmed -> host GPU)", () => {
  const win = JSON.stringify({ userAgent: UA.win, platform: "Win32", hardwareConcurrency: 8 });
  const lin = JSON.stringify({ userAgent: UA.linux, platform: "Linux x86_64" });
  const mac = JSON.stringify({ userAgent: UA.mac, platform: "MacIntel" });
  for (const [raw, os] of [[win, "windows"], [lin, "linux"], [mac, "macos"]]) {
    assert.equal(read57({ [SNAP]: raw }), null, `${os}: 0057 left depth unarmed`);
    const d = read58c({ [SNAP]: raw });
    assert.ok(d && typeof d.canvasSeed === "number", `${os}: armed`);
    assert.equal(H.gpuCoherentWithOs(d.gpu, os), true, `${os}: ${JSON.stringify(d.gpu)}`);
    assert.deepEqual(read58c({ [SNAP]: raw }), d, `${os}: deterministic`);
    assert.deepEqual(read58c({ [SNAP]: `  ${raw}\n` }), d, `${os}: whitespace-insensitive`);
  }
  assert.notDeepEqual(read58c({ [SNAP]: win }).canvasSeed, read58c({ [SNAP]: JSON.stringify({ userAgent: UA.win, platform: "Win32", hardwareConcurrency: 4 }) }).canvasSeed);
  assert.equal(read58c({}), null, "no snapshot, no seed: still unarmed");
  assert.equal(read58c({ [SNAP]: "not json" }), null);
});

test("0058c gpu: own GPU strings of the raw snapshot -- coherent kept, incoherent replaced + warned", () => {
  const own = { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)" };
  assert.deepEqual(read58c({ [SNAP]: JSON.stringify({ userAgent: UA.win, gpu: own }) }).gpu, own);
  const w = []; const d = read58c({ [SNAP]: JSON.stringify({ userAgent: UA.linux, gpu: APPLE }) }, (m) => w.push(m));
  assert.equal(H.gpuCoherentWithOs(d.gpu, "linux"), true);
  assert.equal(w.length, 1); assert.match(w[0], /not coherent with its linux OS/);
  // a full depth snapshot keeps its seeds; only an incoherent GPU is replaced
  const full = { userAgent: UA.win, canvasSeed: 11, audioSeed: 22, gpu: APPLE };
  const f = read58c({ [SNAP]: JSON.stringify(full) }), f57 = read57({ [SNAP]: JSON.stringify(full) });
  assert.equal(f.canvasSeed, 11); assert.equal(f.audioSeed, 22);
  assert.deepEqual({ ...f, gpu: null }, { ...f57, gpu: null });
  assert.equal(H.gpuCoherentWithOs(f.gpu, "windows"), true);
});

test("0058c gpu: Proof seed paths unchanged -- seed alone byte-identical; seed + Mac snapshot identical", () => {
  for (const seed of [42, 7, 123456789, -5]) {
    assert.deepEqual(read58c({ "darkstr.persona.seed": seed }), read57({ "darkstr.persona.seed": seed }), `seed ${seed}`);
    const mac = JSON.stringify({ userAgent: UA.mac, platform: "MacIntel" });
    assert.deepEqual(read58c({ "darkstr.persona.seed": seed, [SNAP]: mac }), read57({ "darkstr.persona.seed": seed, [SNAP]: mac }));
    // seed + Windows snapshot: same seeds, Windows GPU at the same index
    const w = read58c({ "darkstr.persona.seed": seed, [SNAP]: JSON.stringify({ userAgent: UA.win }) });
    const a = read57({ "darkstr.persona.seed": seed });
    assert.deepEqual({ ...w, gpu: null }, { ...a, gpu: null });
    assert.deepEqual(w.gpu, H.GPU_BY_OS.windows[H.GPU_BY_OS.macos.findIndex((g) => g.renderer === a.gpu.renderer)]);
  }
});
