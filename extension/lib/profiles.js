/**
 * darkstr — Profile generation (ported from Duppel profiles.js).
 *
 * MUST stay in sync with src/content/anti-fingerprint/core.js UA_GROUPS
 * and generateProfile. Same seed → same PRNG → same profile.
 *
 * Firefox/LibreWolf host: personas are filtered to engine=firefox + host OS.
 * Firefox personas never SET Client Hints (REMOVE / absent) — A1 coherence.
 * Chromium persona families remain in the table for Duppel parity but are
 * filtered out on a Firefox host.
 */
"use strict";

const _hostEngine =
  typeof navigator !== "undefined" && /Firefox\//.test(navigator.userAgent)
    ? "firefox"
    : "chromium";

let _hostOS = "windows";
if (typeof navigator !== "undefined") {
  if (navigator.userAgentData && navigator.userAgentData.platform) {
    const p = navigator.userAgentData.platform.toLowerCase();
    if (p === "windows") _hostOS = "windows";
    else if (p === "macos") _hostOS = "macos";
    else if (p === "linux" || p === "chromeos") _hostOS = "linux";
  } else if (navigator.platform) {
    if (/Win/.test(navigator.platform)) _hostOS = "windows";
    else if (/Mac/.test(navigator.platform)) _hostOS = "macos";
    else if (/Linux|CrOS/.test(navigator.platform)) _hostOS = "linux";
  } else if (typeof navigator.userAgent === "string") {
    if (/Windows/.test(navigator.userAgent)) _hostOS = "windows";
    else if (/Macintosh|Mac OS X/.test(navigator.userAgent)) _hostOS = "macos";
    else if (/Linux|CrOS/.test(navigator.userAgent)) _hostOS = "linux";
  }
}

const UA_GROUPS = [
  {
    engine: "chromium",
    os: "windows",
    uas: [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    ],
    platform: "Win32",
    gpus: [
      { vendor: "Google Inc. (Intel)", renderer: "ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.5)" },
      { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB, OpenGL 4.5)" },
      { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060, OpenGL 4.5)" },
      { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070, OpenGL 4.5)" },
      { vendor: "Google Inc. (AMD)", renderer: "ANGLE (AMD, AMD Radeon RX 580, OpenGL 4.5)" },
      { vendor: "Google Inc. (AMD)", renderer: "ANGLE (AMD, AMD Radeon RX 6700 XT, OpenGL 4.5)" },
      { vendor: "Google Inc. (Intel)", renderer: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, OpenGL 4.5)" },
      { vendor: "Google Inc. (Intel)", renderer: "ANGLE (Intel, Intel(R) HD Graphics 620, OpenGL 4.5)" },
    ],
  },
  {
    engine: "chromium",
    os: "macos",
    uas: [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    ],
    platform: "MacIntel",
    gpus: [
      { vendor: "Google Inc. (Apple)", renderer: "ANGLE (Apple, Apple M1, OpenGL 4.1)" },
      { vendor: "Google Inc. (Apple)", renderer: "ANGLE (Apple, Apple M2, OpenGL 4.1)" },
      { vendor: "Google Inc. (Intel)", renderer: "ANGLE (Intel, Intel(R) Iris(R) Plus Graphics, OpenGL 4.1)" },
    ],
  },
  {
    engine: "firefox",
    os: "windows",
    uas: [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:139.0) Gecko/20100101 Firefox/139.0",
    ],
    platform: "Win32",
    gpus: [
      { vendor: "Intel", renderer: "Intel(R) UHD Graphics 630" },
      { vendor: "NVIDIA Corporation", renderer: "NVIDIA GeForce GTX 1060 6GB/PCIe/SSE2" },
      { vendor: "NVIDIA Corporation", renderer: "NVIDIA GeForce RTX 3060/PCIe/SSE2" },
      { vendor: "ATI Technologies Inc.", renderer: "AMD Radeon RX 580" },
      { vendor: "Intel", renderer: "Intel(R) Iris(R) Xe Graphics" },
    ],
  },
  {
    engine: "firefox",
    os: "macos",
    uas: [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0",
    ],
    platform: "MacIntel",
    gpus: [
      { vendor: "Apple", renderer: "Apple M1" },
      { vendor: "Apple", renderer: "Apple M2" },
      { vendor: "Intel Inc.", renderer: "Intel(R) Iris(R) Plus Graphics" },
    ],
  },
  {
    // Firefox / LibreWolf on Linux — required for darkstr host OS filter
    engine: "firefox",
    os: "linux",
    uas: [
      "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
      "Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0",
      "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
    ],
    platform: "Linux x86_64",
    gpus: [
      { vendor: "Intel", renderer: "Mesa Intel(R) UHD Graphics 630 (CFL GT2)" },
      { vendor: "NVIDIA Corporation", renderer: "NVIDIA GeForce GTX 1060 6GB/PCIe/SSE2" },
      { vendor: "NVIDIA Corporation", renderer: "NVIDIA GeForce RTX 3060/PCIe/SSE2" },
      { vendor: "AMD", renderer: "AMD Radeon RX 580 (radeonsi, polaris10, LLVM 15.0.7, DRM 3.54, 6.8.0)" },
      { vendor: "Intel", renderer: "Mesa Intel(R) Iris(R) Xe Graphics (TGL GT2)" },
    ],
  },
  {
    engine: "chromium",
    os: "windows",
    uas: [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0",
    ],
    platform: "Win32",
    gpus: [
      { vendor: "Google Inc. (Intel)", renderer: "ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.5)" },
      { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060, OpenGL 4.5)" },
      { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070, OpenGL 4.5)" },
      { vendor: "Google Inc. (Intel)", renderer: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, OpenGL 4.5)" },
    ],
  },
  {
    engine: "chromium",
    os: "linux",
    uas: [
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    ],
    platform: "Linux x86_64",
    gpus: [
      { vendor: "Google Inc. (Intel)", renderer: "ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.5)" },
      { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB, OpenGL 4.5)" },
      { vendor: "Google Inc. (AMD)", renderer: "ANGLE (AMD, AMD Radeon RX 580, OpenGL 4.5)" },
    ],
  },
];

const SCREENS = [
  { width: 1920, height: 1080, avail: 1040 },
  { width: 2560, height: 1440, avail: 1400 },
  { width: 1366, height: 768, avail: 728 },
  { width: 1536, height: 864, avail: 824 },
  { width: 1440, height: 900, avail: 860 },
  { width: 1680, height: 1050, avail: 1010 },
  { width: 3840, height: 2160, avail: 2120 },
  { width: 1280, height: 720, avail: 680 },
  { width: 1600, height: 900, avail: 860 },
];
const CORES = [2, 4, 6, 8, 10, 12, 16];
const MEMORY = [4, 8];
const COLOR_DEPTHS = [24];
const LANGUAGES = [
  ["en-US", "en"],
  ["en-US", "en", "es"],
  ["en-GB", "en"],
  ["en-US"],
  ["en-US", "en", "fr"],
  ["en-US", "en", "de"],
];
const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Europe/London",
  "Europe/Berlin",
  "America/Toronto",
];

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSessionSeed() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0];
}

function pickFrom(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

const UA_GROUPS_FILTERED = UA_GROUPS.filter(
  (g) => g.engine === _hostEngine && g.os === _hostOS
);

function generateProfile(seed) {
  if (UA_GROUPS_FILTERED.length === 0) return null;
  const rng = mulberry32(seed);
  const group = pickFrom(UA_GROUPS_FILTERED, rng);
  const ua = pickFrom(group.uas, rng);
  const gpu = pickFrom(group.gpus, rng);
  return {
    userAgent: ua,
    platform: group.platform,
    hardwareConcurrency: pickFrom(CORES, rng),
    deviceMemory: pickFrom(MEMORY, rng),
    screen: pickFrom(SCREENS, rng),
    colorDepth: pickFrom(COLOR_DEPTHS, rng),
    gpu: gpu,
    languages: pickFrom(LANGUAGES, rng),
    timezone: pickFrom(TIMEZONES, rng),
    canvasSeed: (rng() * 0xffffffff) >>> 0,
    audioSeed: (rng() * 0xffffffff) >>> 0,
  };
}

// === Client Hints (A1 — HTTP↔JS coherence) ===
// Firefox personas: REMOVE (no userAgentData / no UA-CH on wire).
const CLIENT_HINT_HEADER_NAMES = [
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-ch-ua-platform-version",
  "sec-ch-ua-arch",
  "sec-ch-ua-bitness",
  "sec-ch-ua-model",
  "sec-ch-ua-full-version-list",
  "sec-ch-ua-wow64",
];

function formatUaChBrandList(brands, full) {
  return brands
    .map((b) => {
      const ver = full ? `${b.version}.0.0.0` : b.version;
      return `"${b.brand}";v="${ver}"`;
    })
    .join(", ");
}

function deriveClientHints(profile) {
  if (!profile || !profile.userAgent) return null;
  const chromeMatch = profile.userAgent.match(/Chrome\/(\d+)/);
  const edgeMatch = profile.userAgent.match(/Edg\/(\d+)/);
  if (!chromeMatch) return null;

  const chromeVer = chromeMatch[1];
  const isEdge = !!edgeMatch;
  const brands = isEdge
    ? [
        { brand: "Microsoft Edge", version: edgeMatch[1] },
        { brand: "Chromium", version: chromeVer },
        { brand: "Not.A/Brand", version: "8" },
      ]
    : [
        { brand: "Google Chrome", version: chromeVer },
        { brand: "Chromium", version: chromeVer },
        { brand: "Not.A/Brand", version: "8" },
      ];

  const isMac = profile.platform === "MacIntel";
  const isLinux =
    typeof profile.platform === "string" && profile.platform.startsWith("Linux");
  const uaPlatform = isMac ? "macOS" : isLinux ? "Linux" : "Windows";
  const isAppleSilicon = !!(
    profile.gpu &&
    profile.gpu.renderer &&
    profile.gpu.renderer.includes("Apple M")
  );
  const arch = isAppleSilicon ? "arm" : "x86";
  const platformVersion = isMac ? "15.5.0" : isLinux ? "6.8.0" : "15.0.0";

  return {
    brands,
    mobile: false,
    platform: uaPlatform,
    platformVersion,
    architecture: arch,
    bitness: "64",
    model: "",
    uaFullVersion: `${chromeVer}.0.0.0`,
    fullVersionList: brands.map((b) => ({
      brand: b.brand,
      version: `${b.version}.0.0.0`,
    })),
    wow64: false,
  };
}

function buildClientHintDNRHeaders(profile) {
  const ch = deriveClientHints(profile);
  if (!ch) {
    return CLIENT_HINT_HEADER_NAMES.map((header) => ({
      header,
      operation: "remove",
    }));
  }
  return [
    {
      header: "sec-ch-ua",
      operation: "set",
      value: formatUaChBrandList(ch.brands, false),
    },
    {
      header: "sec-ch-ua-mobile",
      operation: "set",
      value: ch.mobile ? "?1" : "?0",
    },
    {
      header: "sec-ch-ua-platform",
      operation: "set",
      value: `"${ch.platform}"`,
    },
    {
      header: "sec-ch-ua-platform-version",
      operation: "set",
      value: `"${ch.platformVersion}"`,
    },
    {
      header: "sec-ch-ua-arch",
      operation: "set",
      value: `"${ch.architecture}"`,
    },
    {
      header: "sec-ch-ua-bitness",
      operation: "set",
      value: `"${ch.bitness}"`,
    },
    {
      header: "sec-ch-ua-model",
      operation: "set",
      value: `"${ch.model}"`,
    },
    {
      header: "sec-ch-ua-full-version-list",
      operation: "set",
      value: formatUaChBrandList(ch.brands, true),
    },
    {
      header: "sec-ch-ua-wow64",
      operation: "set",
      value: ch.wow64 ? "?1" : "?0",
    },
  ];
}

function buildPersonaRequestHeaders(profile) {
  if (!profile || !profile.userAgent) return [];
  return [
    { header: "User-Agent", operation: "set", value: profile.userAgent },
    ...buildClientHintDNRHeaders(profile),
  ];
}

if (typeof globalThis !== "undefined") {
  globalThis.generateSessionSeed = generateSessionSeed;
  globalThis.generateProfile = generateProfile;
  globalThis.deriveClientHints = deriveClientHints;
  globalThis.buildClientHintDNRHeaders = buildClientHintDNRHeaders;
  globalThis.buildPersonaRequestHeaders = buildPersonaRequestHeaders;
  globalThis.DARKSTR_HOST = { engine: _hostEngine, os: _hostOS };
}
