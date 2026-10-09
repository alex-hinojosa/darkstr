/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr M3 — first native persona wins (chrome JS; train-pinned 155.0.1-1).
 *
 * Train pin: Firefox / LibreWolf 155.0.1-1 (FIREFOX_155_0_1_RELEASE).
 * Brand: darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.
 *
 * Mirrors public control plane; 0008 prefers duppel-ffi snapshot when seed set:
 *   duppel_persona::NativePersonaPlan / DocShellNavPhase / ClientHintsPolicy::Remove
 *   duppel_bridge::read_cached_persona / NsHttpAction / NavigatorField
 *
 * Surfaces:
 *   1) HTTP User-Agent override from cached persona snapshot when pollution_active
 *   2) Client Hints REMOVE only (never SET) on Firefox host
 *   3) Minimum Navigator fields (platform / HW / languages / UA) via JSWindowActor
 *   4) Feature flag darkstr.nativePersonaHooks (WebExt MAIN inject should stay off)
 *   5) DocShell-ish first vs subsequent nav via tab top-level load counting
 *
 * Idle when Homogeneous / nativeCompatible / hooks false / empty snapshot.
 *
 * Soft residual (0030): Pollution+hooks sticky persona seed per eTLD+1.
 *   - Same registrable domain → same seed for the browser session (tabs share).
 *   - Different eTLD+1 → different seeds; never remap mid-site / mid-nav.
 *   - Pref darkstr.persona.rotatePerSite (default true). Locked (no remap) when
 *     darkstr.persona.snapshot is non-empty OR rotatePerSite=false (Proof golden
 *     seed=42 / pasted snapshot path unchanged).
 *   - Homogeneous / hooks off: idle — no rotation side-effects.
 *   - Snapshot still FFI (0008) if present else JS mulberry seed path; mirrors
 *     (UA/HW/langs/TZ) stay coherent per effective seed.
 *
 * 0051 persona surface (Rowan QA N2/N3/N5):
 *   - One decision per document: { armed, top-level site, snapshot }. Phase is
 *     per tab (BrowserId top-level http(s) document count, redirects not
 *     counted) — never the global darkstr.persona.docShellPhase pref, so a
 *     new tab cannot flip other tabs. Subresources and frames use the
 *     decision of their top-level document (WindowContext.topWindowContext).
 *   - HTTP: User-Agent AND Accept-Language are set per request from that
 *     decision (persona of the TOP-LEVEL site, same snapshot as the page's
 *     navigator). Accept-Language uses Gecko's own q-value format.
 *     intl.accept_languages / darkstr.persona.languages are no longer written
 *     (no global last-site-wins, no cross-tab languagechange); a value saved
 *     by an older build is restored once.
 *   - Navigator: the child installs synchronously before page script from
 *     the same decision (ppmm "DarkstrNativePersona:Install").
 *   - Lock (N5): only explicit prefs lock — a pasted darkstr.persona.snapshot
 *     (persistent) or darkstr.persona.rotatePerSite=false (single global
 *     persona from the seed while false). The seed path no longer writes
 *     darkstr.persona.snapshot, so turning rotation back on resumes rotation.
 *   - Residual (0049): requests with no browsing context (Shared/Service
 *     worker) keep Gecko's native headers; global UA/platform/HW mirrors are
 *     still written for the C++ WorkerNavigator path only.
 */

const MODE_PREF = "darkstr.mode";
const NATIVE_PREF = "darkstr.nativeCompatible";
const HOOKS_PREF = "darkstr.nativePersonaHooks";
/** Content-safe bool mirror of mode===pollution (Fission sanitizes darkstr.mode string). */
const POLLUTION_ACTIVE_PREF = "darkstr.pollutionActive";
const STRICT_PREF = "darkstr.strictFirstDoc";
/**
 * 0056r2: longest hold (ms) for a top-level document load while the persisted
 * seed store is still loading at startup. Default 2000, clamped to 0..10000.
 */
const SEED_WAIT_PREF = "darkstr.persona.seedStore.startupWaitMs";
const SEED_WAIT_DEFAULT_MS = 2000;
const SNAPSHOT_PREF = "darkstr.persona.snapshot";
const SEED_PREF = "darkstr.persona.seed";
/**
 * 0030: sticky per-eTLD+1 seed rotation under Pollution+hooks.
 * Default true. Locked (use global seed/snapshot as today) when snapshot pref
 * is non-empty OR this pref is false — Proof golden / paste path.
 */
const ROTATE_PER_SITE_PREF = "darkstr.persona.rotatePerSite";
/** Diagnostics for Proof XOR — last resolved eTLD+1 + effective u32 seed. */
const LAST_ETLD_PREF = "darkstr.persona.lastEtld";
const EFFECTIVE_SEED_PREF = "darkstr.persona.effectiveSeed";
/** Mirror for C++ nsHttp hooks (0005) — plain UA string, no JSON. */
const UA_MIRROR_PREF = "darkstr.persona.ua";
/** Mirrors for C++ Navigator / DocShell stub (0006). */
const PLATFORM_MIRROR_PREF = "darkstr.persona.platform";
const HW_MIRROR_PREF = "darkstr.persona.hardwareConcurrency";
const LANGS_MIRROR_PREF = "darkstr.persona.languages";
const DOCSHELL_PHASE_MIRROR_PREF = "darkstr.persona.docShellPhase";
const STRICT_NEXT_NAV_ARMED_PREF = "darkstr.docshell.strictNextNavArmed";
/** Stock content observer path (nsGlobalWindowInner) — save/restore around hooks. */
const ACCEPT_LANGS_PREF = "intl.accept_languages";
const SAVED_ACCEPT_LANGS_PREF = "darkstr.persona.savedAcceptLanguages";
/** 0028: Pollution-only WebRTC pref kill with exact user-pref restore. */
const PEERCONNECTION_PREF = "media.peerconnection.enabled";
const SAVED_PEERCONNECTION_PREF =
  "darkstr.persona.savedPeerConnectionEnabled";
const SAVED_PEERCONNECTION_HAD_USER_PREF =
  "darkstr.persona.savedPeerConnectionHadUserValue";
/** Soft failure reason for Proof (e.g. languageOverride SetRealmLocaleOverride). */
const PERSONA_LAST_ERROR_PREF = "darkstr.persona.lastError";
/** 0051 diag: last top-level document decision {site, armed, ua, al}. */
const LAST_DECISION_PREF = "darkstr.persona.lastDecision";

/**
 * 0052 (Fable B1 / O7): diagnostics stay in memory. They reach prefs.js only
 * while darkstr.debug.diagPrefs is true (default false; QA / Proof harnesses
 * set it in user.js). Chrome callers read the same values through
 * getDiagnostics(). Stale values are swept at startup by DarkstrModeXor.
 */
const DIAG_PREFS_PREF = "darkstr.debug.diagPrefs";
const gDiag = new Map();
const diagPrefs = {
  _write(setter, name, value) {
    gDiag.set(name, value);
    let on = false;
    try {
      on = Services.prefs.getBoolPref(DIAG_PREFS_PREF, false);
    } catch (_e) {
      on = false;
    }
    if (on === true) {
      Services.prefs[setter](name, value);
    }
  },
  setBoolPref(name, value) {
    this._write("setBoolPref", name, value);
  },
  setIntPref(name, value) {
    this._write("setIntPref", name, value);
  },
  setStringPref(name, value) {
    this._write("setStringPref", name, value);
  },
  snapshot() {
    return Object.fromEntries(gDiag);
  },
};
const ACTOR_NAME = "DarkstrNativePersona";
/** 0056: persisted per-site seeds (parent-only store; loaded on first use). */
const SEED_STORE_URI = "moz-src:///browser/components/DarkstrPersonaSeedStore.sys.mjs";
function seedStore() {
  return ChromeUtils.importESModule(SEED_STORE_URI).DarkstrPersonaSeedStore;
}
/** 0056: persona context of origin attributes: "p" private, else userContextId. */
export function personaContextKey(oa) {
  try {
    if (oa && Number(oa.privateBrowsingId) > 0) {
      return "p";
    }
    return String(Number(oa?.userContextId) >>> 0 || 0);
  } catch (_e) {
    return "0";
  }
}
const MSG_INSTALL = "DarkstrNativePersona:Install";
const MSG_REFRESH = "DarkstrNativePersona:Refresh";
const NATIVE_DECISION = Object.freeze({ armed: false, site: null, snapshot: null });

/**
 * Port of netwerk/base/rust-helper rust_prepare_accept_languages (156):
 * "en-US, en ,es" → "en-US,en;q=0.9,es;q=0.8"; tags canonicalised the same way.
 */
export function prepareAcceptLanguages(input) {
  const list = Array.isArray(input) ? input : String(input || "").split(",");
  const out = [];
  for (const raw of list) {
    let token = String(raw).replace(/^[ \t]+/, "");
    const cut = token.search(/[; \t]/);
    if (cut >= 0) {
      token = token.slice(0, cut);
    }
    if (!token) {
      continue;
    }
    const subs = token.toLowerCase().split("-");
    for (let i = 1; i < subs.length; i++) {
      if (subs[i].length === 1) {
        break;
      }
      if (subs[i].length === 2) {
        subs[i] = subs[i].toUpperCase();
      } else if (subs[i].length === 4) {
        subs[i] = subs[i][0].toUpperCase() + subs[i].slice(1);
      }
    }
    const n = out.length;
    const q = Math.max(10 - Math.min(10, n), 1);
    out.push(subs.join("-") + (n > 0 && q < 10 ? `;q=0.${q}` : ""));
  }
  return out.join(",");
}

const CLIENT_HINT_HEADERS = [
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

// 0055 (Fable N6 / O9): seed fallback used when the in-libxul Rust persona
// (DarkstrFfi → duppel_persona::generate_persona) is unavailable. It is an
// exact port of generate_persona: same tables, same mulberry32 draw order, so
// a seed gives the same persona with or without the native library
// (fixtures/persona-goldens-0055.json). UAs claim the engine's own Firefox
// version (Services.appinfo.version), never a hard-coded one.
const FIREFOX_UA_GROUPS = [
  {
    os: "windows",
    platform: "Win32",
    appVersion: "5.0 (Windows)",
    uaOs: ["Windows NT 10.0; Win64; x64"],
  },
  {
    os: "macos",
    platform: "MacIntel",
    appVersion: "5.0 (Macintosh)",
    uaOs: ["Macintosh; Intel Mac OS X 10.15"],
  },
  {
    os: "linux",
    platform: "Linux x86_64",
    appVersion: "5.0 (X11)",
    uaOs: ["X11; Linux x86_64", "X11; Ubuntu; Linux x86_64"],
  },
];
const CORES = [2, 4, 6, 8, 10, 12, 16];
const MEMORY = [4, 8];
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

/** "<major>.0" of the running engine (Services.appinfo.version), or null. */
export function engineFirefoxRv() {
  try {
    const m = /^(\d+)\./.exec(String(Services.appinfo.version || ""));
    return m ? `${m[1]}.0` : null;
  } catch (_e) {
    return null;
  }
}

/** Firefox desktop UA for an OS token at version rv (Gecko's own format). */
export function firefoxUserAgent(uaOs, rv) {
  return `Mozilla/5.0 (${uaOs}; rv:${rv}) Gecko/20100101 Firefox/${rv}`;
}

/**
 * A Firefox desktop UA with its rv:/Firefox/ version replaced by the engine's
 * (other UAs, or an unknown engine version, are returned unchanged).
 */
export function withEngineFirefoxVersion(ua) {
  const rv = engineFirefoxRv();
  const m = /^Mozilla\/5\.0 \(([^()]+); rv:\d+\.\d+\) Gecko\/20100101 Firefox\/\d+\.\d+$/.exec(
    String(ua)
  );
  return rv && m ? firefoxUserAgent(m[1], rv) : String(ua);
}

/** True when a UA claims exactly the engine's Firefox version. */
function claimsEngineVersion(ua, rv) {
  return (
    !!rv &&
    typeof ua === "string" &&
    ua.endsWith(`; rv:${rv}) Gecko/20100101 Firefox/${rv}`)
  );
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFrom(arr, rng) {
  return arr[Math.min(Math.floor(rng() * arr.length), arr.length - 1)];
}

function detectHostOs() {
  try {
    const oscpu = Cc["@mozilla.org/network/protocol;1?name=http"].getService(
      Ci.nsIHttpProtocolHandler
    ).oscpu;
    if (/Mac OS X|macOS/i.test(oscpu)) {
      return "macos";
    }
    if (/Linux/i.test(oscpu)) {
      return "linux";
    }
  } catch (_e) {}
  return "windows";
}

/**
 * 0055 (O9): seed → persona without the native library; must equal
 * duppel_persona::generate_persona(seed, Firefox, os) (shared goldens).
 */
export function generatePersonaFallback(seed, os) {
  const rv = engineFirefoxRv();
  if (!rv) {
    return null;
  }
  const rng = mulberry32(seed >>> 0);
  const groups = FIREFOX_UA_GROUPS.filter(g => g.os === os);
  const group = pickFrom(groups.length ? groups : [FIREFOX_UA_GROUPS[0]], rng);
  const uaOs = pickFrom(group.uaOs, rng);
  // Rust draws gpu then screen here (depth surface; not in the navigator
  // snapshot) — consume the same two values.
  rng();
  rng();
  const languages = pickFrom(LANGUAGES, rng).slice();
  const hardwareConcurrency = pickFrom(CORES, rng);
  const deviceMemory = pickFrom(MEMORY, rng);
  rng(); // colorDepth (Rust COLOR_DEPTHS)
  const timezone = pickFrom(TIMEZONES, rng);
  return {
    userAgent: firefoxUserAgent(uaOs, rv),
    platform: group.platform,
    appVersion: group.appVersion,
    hardwareConcurrency,
    deviceMemory,
    languages,
    timezone,
  };
}

export var DarkstrNativePersona = {
  /** 0052: in-memory diagnostics (what used to be darkstr.*.last* prefs). */
  getDiagnostics() {
    return diagPrefs.snapshot();
  },

  _inited: false,
  _actorRegistered: false,
  _httpObserver: null,
  _prefObserver: null,
  /** @type {WeakMap<object, {topLoads: number}>} */
  _browserNav: null,
  _progressListener: null,
  /** @type {Map<string, number>|null} eTLD+1 → sticky u32 seed (session). */
  _etldSeedMap: null,
  /** @type {Map<string, object>|null} eTLD+1 → snapshot cache (session). */
  _etldSnapshotCache: null,
  /** Session base seed when rotate active and SEED_PREF unset. */
  _sessionBaseSeed: 0,

  init() {
    if (this._inited) {
      return;
    }
    this._inited = true;
    this._bcTopLoads = new Map();
    this._etldSeedMap = new Map();
    this._etldSnapshotCache = new Map();
    this._sessionBaseSeed = 0;
    this._docDecisions = new WeakMap();
    this._lockedSnapCache = null;
    this._planSignature = "";
    this._resetNavPhaseMirror("init");
    this._syncListener = {
      receiveMessage: message => {
        try {
          return this._onSyncInstall(message);
        } catch (e) {
          console.error("darkstr 0051: persona install IPC failed", e);
          return { decision: "native", snapshot: null };
        }
      },
    };
    try {
      Services.ppmm.addMessageListener(MSG_INSTALL, this._syncListener);
    } catch (_e) {}

    this._prefObserver = this._observePref.bind(this);
    for (const p of [
      MODE_PREF,
      NATIVE_PREF,
      HOOKS_PREF,
      STRICT_PREF,
      SNAPSHOT_PREF,
      SEED_PREF,
      ROTATE_PER_SITE_PREF,
    ]) {
      Services.prefs.addObserver(p, this._prefObserver);
    }

    this._httpObserver = this._onModifyRequest.bind(this);
    Services.obs.addObserver(this._httpObserver, "http-on-modify-request");

    // 0051: the actor is registered on first arm (refreshPlan), not here —
    // idle profiles get no persona actor at all.
    this._installProgressListener();
    this.refreshPlan();
  },

  uninit() {
    if (!this._inited) {
      return;
    }
    try {
      Services.obs.removeObserver(this._httpObserver, "http-on-modify-request");
    } catch (_e) {}
    try {
      Services.ppmm.removeMessageListener(MSG_INSTALL, this._syncListener);
    } catch (_e) {}
    this._syncListener = null;
    for (const p of [
      MODE_PREF,
      NATIVE_PREF,
      HOOKS_PREF,
      STRICT_PREF,
      SNAPSHOT_PREF,
      SEED_PREF,
      ROTATE_PER_SITE_PREF,
    ]) {
      try {
        Services.prefs.removeObserver(p, this._prefObserver);
      } catch (_e) {}
    }
    if (this._etldSeedMap) {
      this._etldSeedMap.clear();
    }
    if (this._etldSnapshotCache) {
      this._etldSnapshotCache.clear();
    }
    this._sessionBaseSeed = 0;
    if (this._seedFlushListener) {
      try {
        seedStore().removeFlushListener(this._seedFlushListener);
      } catch (_e) {}
      this._seedFlushListener = null;
    }
    this._removeProgressListener();
    if (this._actorRegistered) {
      try {
        ChromeUtils.unregisterWindowActor("DarkstrNativePersona");
      } catch (_e) {}
      this._actorRegistered = false;
    }
    this._inited = false;
  },

  _observePref(_subject, topic, _data) {
    if (topic !== "nsPref:changed") {
      return;
    }
    this.refreshPlan();
  },

  _registerActor() {
    if (this._actorRegistered) {
      return;
    }
    try {
      ChromeUtils.registerWindowActor(ACTOR_NAME, {
        parent: {
          esModuleURI:
            "moz-src:///browser/components/DarkstrNativePersonaParent.sys.mjs",
        },
        child: {
          esModuleURI:
            "moz-src:///browser/components/DarkstrNativePersonaChild.sys.mjs",
          events: {
            DOMWindowCreated: {},
            // Same-origin navigation of an initial about:blank reuses the
            // inner window (no second DOMWindowCreated).
            DOMDocElementInserted: {},
            pageshow: {},
          },
        },
        allFrames: true,
        messageManagerGroups: ["browsers"],
        // 0051: no `matches` — about:blank / srcdoc / blob: documents that
        // inherit an http(s) principal need the same navigator as their
        // parent. The child filters on principal before any IPC.
        // Required for Fission webIsolated / web content processes.
        safeForUntrustedWebProcess: true,
      });
      this._actorRegistered = true;
    } catch (e) {
      console.warn("darkstr M3: JSWindowActor register failed:", e);
    }
  },

  _installProgressListener() {
    // DocShell-ish first vs subsequent: count top-level document channels per BC id.
    this._bcTopLoads = new Map();
  },

  _removeProgressListener() {
    if (this._bcTopLoads) {
      this._bcTopLoads.clear();
    }
    if (this._openedTabs) {
      this._openedTabs.clear();
    }
  },

  /**
   * Clear persisted phase/armed prefs + chrome Map. Call on init so a prior
   * Pollution session cannot leave subsequent_nav in prefs.js (Proof XOR).
   * Does not write privacy.*.
   */
  _resetNavPhaseMirror(_reason) {
    try {
      if (Services.prefs.prefHasUserValue(DOCSHELL_PHASE_MIRROR_PREF)) {
        Services.prefs.clearUserPref(DOCSHELL_PHASE_MIRROR_PREF);
      }
    } catch (_e) {}
    try {
      if (Services.prefs.prefHasUserValue(STRICT_NEXT_NAV_ARMED_PREF)) {
        Services.prefs.clearUserPref(STRICT_NEXT_NAV_ARMED_PREF);
      }
    } catch (_e) {}
    if (this._bcTopLoads) {
      this._bcTopLoads.clear();
    }
  },

  /** Write phase + armed after a real http(s) top-level count (only writer besides C++). */
  _syncPhaseMirrorFromCount(n) {
    const phase = n <= 1 ? "first_document" : "subsequent_nav";
    try {
      diagPrefs.setStringPref(DOCSHELL_PHASE_MIRROR_PREF, phase);
    } catch (_e) {}
    this._syncStrictNextNavArmedDiag(phase);
  },

  _noteTopLevelDocument(channel) {
    try {
      // Only http(s) content docs count — about:blank / about:newtab / chrome
      // must not burn FirstDocument (Proof XOR / 0020 http-scheme filter).
      const uri = channel.URI || channel.originalURI;
      const scheme = String(uri?.scheme || "").toLowerCase();
      if (scheme !== "http" && scheme !== "https") {
        return null;
      }
      const li = channel.loadInfo;
      if (!li) {
        return null;
      }
      const topLevel =
        typeof li.isTopLevelLoad === "boolean"
          ? li.isTopLevelLoad
          : !li.browsingContext?.parent;
      if (!topLevel) {
        return null;
      }
      // Document loads only.
      if (li.externalContentPolicyType !== Ci.nsIContentPolicy.TYPE_DOCUMENT) {
        return null;
      }
      // 0051: a redirect (incl. internal, e.g. https upgrade) is the same
      // navigation — count the first channel only.
      try {
        const chain =
          li.redirectChainIncludingInternalRedirects || li.redirectChain || [];
        if (chain.length > 0) {
          return null;
        }
      } catch (_eChain) {}
      const bc = li.browsingContext?.top;
      if (!bc) {
        return null;
      }
      // BrowserId is tab-stable across Fission / cross-group nav (BC id is not).
      const key = bc.browserId || bc.id;
      if (!key) {
        return null;
      }
      const n = (this._bcTopLoads.get(key) || 0) + 1;
      this._bcTopLoads.set(key, n);
      this._syncPhaseMirrorFromCount(n);
      // 0030: sticky site persona — update C++ mirrors for this eTLD+1 once
      // counted (SubsequentNav / chrome actor still gate apply separately).
      try {
        if (this._rotationActive()) {
          const siteSnap = this.resolveSnapshotForUri(
            uri,
            this._ctxOfLoadInfo(li)
          );
          if (siteSnap) {
            this._applyPersonaMirrors(siteSnap);
          }
        }
      } catch (_eRot) {}
      return n;
    } catch (_e) {
      return null;
    }
  },

  /**
   * 0030: Proof / operator lock — no per-site remap.
   * Locked when snapshot pref non-empty OR rotatePerSite=false.
   */
  _rotationLocked() {
    try {
      const raw = Services.prefs.getStringPref(SNAPSHOT_PREF, "");
      if (raw && String(raw).trim()) {
        return true;
      }
    } catch (_e) {}
    try {
      if (!Services.prefs.getBoolPref(ROTATE_PER_SITE_PREF, true)) {
        return true;
      }
    } catch (_e) {
      // Missing pref → default rotate on → not locked by this branch.
    }
    return false;
  },

  /**
   * Rotation runs only under Pollution+hooks when not locked.
   * Homogeneous / hooks off → idle (caller still gates applyNative).
   */
  _rotationWanted() {
    try {
      return Services.prefs.getBoolPref(ROTATE_PER_SITE_PREF, true);
    } catch (_e) {
      return true;
    }
  },

  _rotationActive(plan) {
    const p = plan || this._plan;
    if (!p?.pollutionActive || !p?.nativeHooks) {
      return false;
    }
    if (this._rotationLocked()) {
      return false;
    }
    return this._rotationWanted();
  },

  /**
   * Registrable domain (eTLD+1) from a URI. Falls back to host on IP / failure.
   * @returns {string|null}
   */
  _etldPlus1FromUri(uri) {
    try {
      if (!uri) {
        return null;
      }
      const scheme = String(uri.scheme || "").toLowerCase();
      if (scheme !== "http" && scheme !== "https") {
        return null;
      }
      let host = "";
      try {
        host = uri.asciiHost || uri.host || "";
      } catch (_e) {
        host = "";
      }
      if (!host) {
        return null;
      }
      try {
        return Services.eTLD.getBaseDomain(uri);
      } catch (_e) {
        try {
          return Services.eTLD.getBaseDomainFromHost(host);
        } catch (_e2) {
          return String(host).toLowerCase();
        }
      }
    } catch (_e) {
      return null;
    }
  },

  _etldPlus1FromBrowsingContext(bc) {
    try {
      const top = bc?.top || bc;
      const cur = top?.currentURI || top?.currentWindowGlobal?.documentURI;
      return this._etldPlus1FromUri(cur);
    } catch (_e) {
      return null;
    }
  },

  /** Base u32 seed: SEED_PREF if set, else stable session random. */
  _baseSeedU32() {
    let seed = 0;
    try {
      seed = Services.prefs.getIntPref(SEED_PREF, 0) >>> 0;
    } catch (_e) {
      seed = 0;
    }
    if (seed) {
      return seed >>> 0;
    }
    if (!this._sessionBaseSeed) {
      // Non-zero session root — sticky for this chrome lifetime only.
      let r = 0;
      try {
        r = (Date.now() ^ (Math.floor(Math.random() * 0xffffffff) >>> 0)) >>> 0;
      } catch (_e) {
        r = (Date.now() >>> 0) || 1;
      }
      this._sessionBaseSeed = r || 1;
    }
    return this._sessionBaseSeed >>> 0;
  },

  /**
   * Deterministic mix of base seed + eTLD+1 → sticky u32 (never 0).
   * Map caches first assignment; pure hash keeps same-site tabs coherent.
   */
  _mixSeed(baseSeed, etld) {
    let h = (baseSeed >>> 0) ^ 0x9e3779b9;
    const s = String(etld || "");
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    }
    h = (h ^ (h >>> 16)) >>> 0;
    return h || 1;
  },

  /** 0056: darkstr.persona.seed set (Proof test seed) -> store bypassed. */
  _fixedSeedSet() {
    try {
      return (Services.prefs.getIntPref(SEED_PREF, 0) >>> 0) !== 0;
    } catch (_e) {
      return false;
    }
  },

  /**
   * 0056: start the persisted seed store (rotation armed, no fixed seed).
   * Never called in off mode.
   */
  _activateSeedStore() {
    try {
      const store = seedStore();
      if (!this._seedFlushListener) {
        this._seedFlushListener = pred => this._flushSeedCopies(pred);
        store.addFlushListener(this._seedFlushListener);
      }
      store.activate();
      return store;
    } catch (e) {
      console.error("darkstr 0056: seed store unavailable", e);
      return null;
    }
  },

  /**
   * 0056: drop in-memory copies derived from cleared seeds (NP caches and
   * DepthHooks diagnostics). pred(ctx, site) or null = everything. Live
   * documents keep their decision until they navigate (0051 rule).
   */
  _flushSeedCopies(pred) {
    const match = key => {
      if (!pred) {
        return true;
      }
      const i = key.indexOf("|");
      return i < 0 ? pred("0", key) : pred(key.slice(0, i), key.slice(i + 1));
    };
    for (const m of [this._etldSeedMap, this._etldSnapshotCache, this._workerSiteDecisions]) {
      if (!m) {
        continue;
      }
      for (const k of [...m.keys()]) {
        if (match(k)) {
          m.delete(k);
        }
      }
    }
    try {
      ChromeUtils.importESModule(
        "moz-src:///browser/components/DarkstrDepthHooks.sys.mjs"
      ).DarkstrDepthHooks.flushSeedCopies?.();
    } catch (_e) {}
  },

  _ctxOfBC(bc) {
    try {
      return personaContextKey((bc?.top || bc)?.originAttributes);
    } catch (_e) {
      return "0";
    }
  },

  _ctxOfWgp(wgp) {
    try {
      const oa = wgp?.documentPrincipal?.originAttributes;
      if (oa) {
        return personaContextKey(oa);
      }
    } catch (_e) {}
    return this._ctxOfBC(wgp?.browsingContext);
  },

  _ctxOfLoadInfo(li) {
    try {
      return personaContextKey(li?.originAttributes);
    } catch (_e) {
      return "0";
    }
  },

  /**
   * Sticky seed for (persona context, eTLD+1). 0056: from the persisted
   * store (separate per container; private = memory only) unless
   * darkstr.persona.seed is set — then the deterministic mix (the default
   * context keeps the pre-0056 value, so seed goldens are unchanged).
   */
  _seedForEtld(etld, ctx) {
    if (!etld) {
      return this._baseSeedU32();
    }
    const c = String(ctx || "0");
    if (!this._fixedSeedSet()) {
      const store = this._activateSeedStore();
      if (store) {
        try {
          return store.seedFor(c, etld) >>> 0;
        } catch (e) {
          console.error("darkstr 0056: seed store lookup failed", e);
        }
      }
    }
    if (!this._etldSeedMap) {
      this._etldSeedMap = new Map();
    }
    const key = c === "0" ? etld : `${c}|${etld}`;
    if (this._etldSeedMap.has(key)) {
      return this._etldSeedMap.get(key) >>> 0;
    }
    const seed = this._mixSeed(
      this._baseSeedU32(),
      c === "0" ? etld : `${etld}\u0000${c}`
    );
    this._etldSeedMap.set(key, seed);
    return seed;
  },

  /**
   * 0057 (Fable B2): the persisted per-site seed from the 0056 store for
   * (persona context, eTLD+1); 0 when a fixed test seed is set or the store
   * is unavailable. Depth farbling (DarkstrDepthHooks) arms only on this.
   */
  _storeSeedForEtld(etld, ctx) {
    if (!etld || this._fixedSeedSet()) {
      return 0;
    }
    const store = this._activateSeedStore();
    if (!store) {
      return 0;
    }
    try {
      return store.seedFor(String(ctx || "0"), etld) >>> 0;
    } catch (_e) {
      return 0;
    }
  },

  /**
   * 0057: per-site rotation runs on the 0056 store (Pollution + hooks,
   * rotatePerSite, no snapshot lock, no fixed test seed).
   */
  _storeRotationActive(plan) {
    try {
      return this._rotationActive(plan || this.getPlan()) && !this._fixedSeedSet();
    } catch (_e) {
      return false;
    }
  },

  _writeEffectiveDiag(etld, seed) {
    try {
      if (etld) {
        diagPrefs.setStringPref(LAST_ETLD_PREF, String(etld));
      }
      diagPrefs.setIntPref(EFFECTIVE_SEED_PREF, seed >>> 0);
    } catch (_e) {}
  },

  /**
   * Build snapshot from seed. Never writes SNAPSHOT_PREF (0051 N5) — a pasted
   * snapshot stays the only persistent lock signal.
   */
  _snapshotFromSeed(seed, _persist) {
    const s = seed >>> 0;
    if (!s) {
      return null;
    }
    const ffiSnap = this._readSnapshotFromFfi(s);
    if (ffiSnap) {
      return ffiSnap;
    }
    return this._generateFromSeed(s);
  },

  /**
   * Resolve persona snapshot for a top-level site URI / BC.
   * Locked path → global plan.snapshot; rotate → sticky per eTLD+1.
   */
  resolveSnapshotForUri(uri, ctx) {
    const c = String(ctx || "0");
    const plan = this.getPlan();
    if (!plan?.pollutionActive || !plan?.nativeHooks) {
      return null;
    }
    if (!this._rotationActive(plan)) {
      return plan.snapshot || null;
    }
    const etld = this._etldPlus1FromUri(uri);
    if (!etld) {
      return null;
    }
    if (!this._etldSnapshotCache) {
      this._etldSnapshotCache = new Map();
    }
    const cacheKey = `${c}|${etld}`;
    if (this._etldSnapshotCache.has(cacheKey)) {
      const cached = this._etldSnapshotCache.get(cacheKey);
      this._writeEffectiveDiag(etld, this._seedForEtld(etld, c));
      return cached;
    }
    const seed = this._seedForEtld(etld, c);
    const snap = this._snapshotFromSeed(seed, false);
    if (snap) {
      this._etldSnapshotCache.set(cacheKey, snap);
      this._writeEffectiveDiag(etld, seed);
    }
    return snap;
  },

  resolveSnapshotForBrowsingContext(bc) {
    try {
      const top = bc?.top || bc;
      const uri = top?.currentURI || top?.currentWindowGlobal?.documentURI;
      return this.resolveSnapshotForUri(uri, this._ctxOfBC(top));
    } catch (_e) {
      return null;
    }
  },

  /** Apply UA/platform/HW/langs mirrors from a concrete snapshot (C++ + accept). */
  _applyPersonaMirrors(snapshot) {
    try {
      if (!snapshot?.userAgent) {
        return;
      }
      diagPrefs.setStringPref(UA_MIRROR_PREF, snapshot.userAgent);
      diagPrefs.setStringPref(
        PLATFORM_MIRROR_PREF,
        snapshot.platform || "MacIntel"
      );
      try {
        if (Services.prefs.prefHasUserValue(HW_MIRROR_PREF)) {
          Services.prefs.clearUserPref(HW_MIRROR_PREF);
        }
      } catch (_eHw) {}
      diagPrefs.setIntPref(
        HW_MIRROR_PREF,
        Number(snapshot.hardwareConcurrency) || 8
      );
      // 0051: no darkstr.persona.languages / intl.accept_languages writes —
      // languages are per document (navigator) and per request (header).
    } catch (_e) {}
  },

  /**
   * Resolve NativePersonaPlan-equivalent gates.
   * @returns {{
   *   pollutionActive: boolean,
   *   nativeHooks: boolean,
   *   strictFirstDoc: boolean,
   *   applyNative: boolean,
   *   snapshot: object|null,
   *   mainInjectDisable: boolean
   * }}
   */
  refreshPlan() {
    let mode = "homogeneous";
    try {
      mode = Services.prefs.getStringPref(MODE_PREF, "homogeneous");
    } catch (_e) {
      mode = "homogeneous";
    }
    if (mode !== "pollution" && mode !== "homogeneous") {
      mode = "homogeneous";
    }

    let nativeCompatible = false;
    try {
      nativeCompatible = Services.prefs.getBoolPref(NATIVE_PREF, false);
    } catch (_e) {}

    let nativeHooks = false;
    try {
      nativeHooks = Services.prefs.getBoolPref(HOOKS_PREF, false);
    } catch (_e) {}

    let strictFirstDoc = true;
    try {
      strictFirstDoc = Services.prefs.getBoolPref(STRICT_PREF, true);
    } catch (_e) {}

    const pollutionActive = mode === "pollution" && !nativeCompatible;
    const mainInjectDisable = nativeHooks && pollutionActive;
    // 0030: when rotatePerSite and not locked, applyNative without a global
    // snapshot — per-site snapshots resolve on demand from sticky eTLD seeds.
    const rotateWanted =
      pollutionActive &&
      nativeHooks &&
      !this._rotationLocked() &&
      this._rotationWanted();
    // 0056: persisted seeds only while rotation runs without a fixed seed.
    if (rotateWanted && !this._fixedSeedSet()) {
      this._activateSeedStore();
    }
    // Drop sticky maps when rotation is off/locked so Proof golden cannot see
    // a stale per-site seed from a prior Pollution rotate session.
    if (!rotateWanted) {
      if (this._etldSeedMap?.size) {
        this._etldSeedMap.clear();
      }
      if (this._etldSnapshotCache?.size) {
        this._etldSnapshotCache.clear();
      }
    }
    let snapshot = null;
    if (pollutionActive && !rotateWanted) {
      snapshot = this._readSnapshot();
    } else if (pollutionActive && rotateWanted) {
      // Keep any pre-existing session cache; do not force a global snapshot.
      snapshot = null;
    }
    const applyNativeBase =
      pollutionActive &&
      nativeHooks &&
      (rotateWanted || !!snapshot);

    this._plan = {
      pollutionActive,
      nativeHooks,
      strictFirstDoc,
      // applyNative requires hooks + (snapshot | rotate); nav phase per-request
      applyNativeBase,
      snapshot,
      rotatePerSite: !!rotateWanted,
      mainInjectDisable,
    };

    // Content-process C++ gates cannot read dynamic string darkstr.mode (Fission
    // sanitization). Mirror pollution as a bool for DarkstrNavigatorHooks.
    // 0053 (Fable B5): Homogeneous writes nothing — the mirror is only set
    // while Pollution is active and cleared (back to "no user value", read as
    // false) otherwise.
    try {
      if (pollutionActive) {
        Services.prefs.setBoolPref(POLLUTION_ACTIVE_PREF, true);
      } else if (Services.prefs.prefHasUserValue(POLLUTION_ACTIVE_PREF)) {
        Services.prefs.clearUserPref(POLLUTION_ACTIVE_PREF);
      }
    } catch (_ePol) {}

    // 0028: optional WebRTC IP pref-kill only while native Pollution applies.
    // Save whether the user had an explicit value so Homogeneous restores
    // exactly (set prior bool vs clear back to product default).
    if (this._plan.applyNativeBase) {
      this._applyWebRtcKillForPollution();
    } else {
      this._restoreWebRtcIfSaved();
    }

    // Mirror UA for C++ DarkstrNsHttpHooks (patches/0005). Clear when idle.
    // 0030 rotate: per-site mirrors land from top-level nav / GetSnapshot — do
    // not clear here while applyNativeBase (would race multi-tab sites).
    try {
      if (this._plan.applyNativeBase && snapshot?.userAgent) {
        diagPrefs.setStringPref(UA_MIRROR_PREF, snapshot.userAgent);
      } else if (
        !this._plan.applyNativeBase &&
        Services.prefs.prefHasUserValue(UA_MIRROR_PREF)
      ) {
        Services.prefs.clearUserPref(UA_MIRROR_PREF);
      }
    } catch (_e) {}

    // 0051: languages are per document / per request now. Undo any global
    // accept-languages / languages mirror an older build left behind.
    this._restoreAcceptLanguagesIfSaved();
    try {
      if (Services.prefs.prefHasUserValue(LANGS_MIRROR_PREF)) {
        Services.prefs.clearUserPref(LANGS_MIRROR_PREF);
      }
    } catch (_eLangs) {}

    // Mirrors for the C++ WorkerNavigator path (0006/0027; worker scope 0049).
    try {
      if (this._plan.applyNativeBase && snapshot?.userAgent) {
        this._applyPersonaMirrors(snapshot);
      } else if (!this._plan.applyNativeBase) {
        for (const p of [
          PLATFORM_MIRROR_PREF,
          HW_MIRROR_PREF,
          LANGS_MIRROR_PREF,
          DOCSHELL_PHASE_MIRROR_PREF,
          LAST_ETLD_PREF,
          EFFECTIVE_SEED_PREF,
        ]) {
          if (Services.prefs.prefHasUserValue(p)) {
            Services.prefs.clearUserPref(p);
          }
        }
        if (this._etldSeedMap) {
          this._etldSeedMap.clear();
        }
        if (this._etldSnapshotCache) {
          this._etldSnapshotCache.clear();
        }
      }
    } catch (_e) {}

    this._onPlanChanged();
    return this._plan;
  },

  /**
   * 0051: when the effective plan changes, forget per-document decisions,
   * register the actor on first arm and ask every live document to
   * re-install (or restore native) navigator fields.
   */
  _onPlanChanged() {
    const p = this._plan || {};
    let seed = 0;
    try {
      seed = Services.prefs.getIntPref(SEED_PREF, 0) >>> 0;
    } catch (_e) {}
    const signature = JSON.stringify([
      !!p.pollutionActive,
      !!p.nativeHooks,
      !!p.strictFirstDoc,
      !!p.applyNativeBase,
      !!p.rotatePerSite,
      p.snapshot?.userAgent || "",
      p.snapshot?.platform || "",
      p.snapshot?.hardwareConcurrency || 0,
      (p.snapshot?.languages || []).join(","),
      seed,
    ]);
    if (signature === this._planSignature) {
      return;
    }
    this._planSignature = signature;
    this._docDecisions = new WeakMap();
    this._workerSiteDecisions = new Map();
    if (p.applyNativeBase) {
      this._registerActor();
    }
    if (this._actorRegistered) {
      this._refreshAllDocuments();
    }
  },

  _refreshAllDocuments() {
    const seen = new Set();
    const send = wg => {
      if (!wg || seen.has(wg) || wg.isInProcess) {
        return;
      }
      seen.add(wg);
      try {
        wg.getActor(ACTOR_NAME).sendAsyncMessage(MSG_REFRESH, {});
      } catch (_e) {}
    };
    try {
      for (const win of Services.wm.getEnumerator("navigator:browser")) {
        for (const browser of win.gBrowser?.browsers || []) {
          const top = browser.browsingContext;
          if (!top) {
            continue;
          }
          for (const bc of top.getAllBrowsingContextsInSubtree()) {
            send(bc.currentWindowGlobal);
          }
        }
      }
    } catch (_e) {}
  },


  /** 0028: save current media.peerconnection.enabled state, then kill WebRTC. */
  _applyWebRtcKillForPollution() {
    try {
      if (!Services.prefs.prefHasUserValue(SAVED_PEERCONNECTION_HAD_USER_PREF)) {
        const hadUserValue = Services.prefs.prefHasUserValue(
          PEERCONNECTION_PREF
        );
        const enabled = Services.prefs.getBoolPref(PEERCONNECTION_PREF, true);
        Services.prefs.setBoolPref(
          SAVED_PEERCONNECTION_HAD_USER_PREF,
          hadUserValue
        );
        Services.prefs.setBoolPref(SAVED_PEERCONNECTION_PREF, enabled);
      }
      Services.prefs.setBoolPref(PEERCONNECTION_PREF, false);
    } catch (_e) {}
  },

  /** 0028: restore exact pre-Pollution WebRTC user-pref state. */
  _restoreWebRtcIfSaved() {
    try {
      if (!Services.prefs.prefHasUserValue(SAVED_PEERCONNECTION_HAD_USER_PREF)) {
        return;
      }
      const hadUserValue = Services.prefs.getBoolPref(
        SAVED_PEERCONNECTION_HAD_USER_PREF,
        false
      );
      const enabled = Services.prefs.getBoolPref(
        SAVED_PEERCONNECTION_PREF,
        true
      );
      if (hadUserValue) {
        Services.prefs.setBoolPref(PEERCONNECTION_PREF, enabled);
      } else if (Services.prefs.prefHasUserValue(PEERCONNECTION_PREF)) {
        Services.prefs.clearUserPref(PEERCONNECTION_PREF);
      }
      for (const p of [
        SAVED_PEERCONNECTION_PREF,
        SAVED_PEERCONNECTION_HAD_USER_PREF,
      ]) {
        if (Services.prefs.prefHasUserValue(p)) {
          Services.prefs.clearUserPref(p);
        }
      }
    } catch (_e) {}
  },

  /**
   * Soft park 0015: empty / "und" (any case) → "" so restore never writes und.
   */
  _normalizeSavedAcceptLanguages(value) {
    const s = value == null ? "" : String(value).trim();
    if (!s || s.toLowerCase() === "und") {
      return "";
    }
    return s;
  },

  /**
   * Restore intl.accept_languages saved by a pre-0051 build and clear saved.
   * Soft park 0015: empty/"und" (incl. prior-run migrate) → clearUserPref, never set und.
   */
  _restoreAcceptLanguagesIfSaved() {
    try {
      if (!Services.prefs.prefHasUserValue(SAVED_ACCEPT_LANGS_PREF)) {
        return;
      }
      const raw = Services.prefs.getStringPref(SAVED_ACCEPT_LANGS_PREF, "");
      const saved = this._normalizeSavedAcceptLanguages(raw);
      Services.prefs.clearUserPref(SAVED_ACCEPT_LANGS_PREF);
      if (saved) {
        Services.prefs.setCharPref(ACCEPT_LANGS_PREF, saved);
      } else if (Services.prefs.prefHasUserValue(ACCEPT_LANGS_PREF)) {
        // Empty or migrated und — clear rather than setCharPref("und").
        Services.prefs.clearUserPref(ACCEPT_LANGS_PREF);
      }
    } catch (_e) {}
  },

  getPlan() {
    return this._plan || this.refreshPlan();
  },

  _readSnapshot() {
    try {
      const raw = Services.prefs.getStringPref(SNAPSHOT_PREF, "");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.userAgent === "string") {
          return {
            // 0055 (N6): an operator lock keeps its OS token / fields, but
            // a Firefox UA claims the engine's own version.
            userAgent: withEngineFirefoxVersion(parsed.userAgent),
            platform: parsed.platform || "MacIntel",
            hardwareConcurrency: parsed.hardwareConcurrency || 8,
            deviceMemory: parsed.deviceMemory || 8,
            languages: Array.isArray(parsed.languages)
              ? parsed.languages
              : ["en-US", "en"],
            ...(parsed.timezone ? { timezone: String(parsed.timezone) } : {}),
          };
        }
      }
    } catch (_e) {}

    // Seed path when snapshot pref empty: prefer Rust FFI SoT (A/libxul), else JS mulberry.
    let seed = 0;
    try {
      seed = Services.prefs.getIntPref(SEED_PREF, 0);
    } catch (_e) {
      seed = 0;
    }
    if (!seed) {
      this._lockedSnapCache = null;
      return null;
    }
    // 0051 (N5): computed from the seed, never written back to
    // darkstr.persona.snapshot — a seed must not become a permanent lock.
    if (this._lockedSnapCache?.seed === seed >>> 0) {
      return this._lockedSnapCache.snapshot;
    }
    const snapshot =
      this._readSnapshotFromFfi(seed >>> 0) ||
      this._generateFromSeed(seed >>> 0);
    this._lockedSnapCache = { seed: seed >>> 0, snapshot };
    return snapshot;
  },

  /**
   * Approach A: ctypes → in-process libxul/XUL darkstr_ffi_* ABI (0040/0041).
   * Soft-fail when A unavailable → JS mulberry seed fallback.
   * Approach B cdylib runtime load retired (0041).
   */
  _readSnapshotFromFfi(seed) {
    try {
      const { DarkstrFfi } = ChromeUtils.importESModule(
        "moz-src:///browser/components/DarkstrFfi.sys.mjs"
      );
      const snap = DarkstrFfi.personaSnapshotFromSeed(seed, detectHostOs());
      if (snap && typeof snap.userAgent === "string") {
        // 0055 (N6): the native table is built from config/milestone.txt; a
        // library from another train would claim another version — use the
        // engine-derived fallback instead of a mismatched UA.
        const rv = engineFirefoxRv();
        if (!claimsEngineVersion(snap.userAgent, rv)) {
          console.warn(
            "DarkstrNativePersona: FFI persona version != engine",
            rv,
            snap.userAgent
          );
          return null;
        }
        // 0051 (N5): never persisted to darkstr.persona.snapshot (that pref
        // is an explicit operator lock only; see _rotationLocked).
        return snap;
      }
      try {
        const err = DarkstrFfi.lastLoadError?.() || "ffi returned null";
        console.warn("DarkstrNativePersona: FFI snapshot miss —", err);
      } catch (_e) {}
    } catch (e) {
      console.warn("DarkstrNativePersona: FFI import/call failed —", e);
    }
    return null;
  },

  /**
   * 0055 (O9): exact port of duppel_persona::generate_persona for the host OS
   * (same draw order: group, ua, gpu, screen, languages, cores, memory,
   * colorDepth, timezone). Null when the engine version is unknown.
   */
  _generateFromSeed(seed) {
    return generatePersonaFallback(seed, detectHostOs());
  },

  /** Tab key for phase counting: BrowserId is tab-stable across Fission swaps. */
  _tabKey(bc) {
    const top = bc?.top || bc;
    return top ? top.browserId || top.id || 0 : 0;
  },

  /**
   * 0051 (N2): per-tab phase. FirstDocument while this tab has had at most one
   * counted top-level http(s) document; never reads a global pref.
   */
  tabPhase(bc) {
    const key = this._tabKey(bc);
    const n = key && this._bcTopLoads ? this._bcTopLoads.get(key) || 0 : 0;
    return n > 1 ? "subsequent_nav" : "first_document";
  },

  /** Kept for callers/diag: per-tab phase of the channel's tab. READ-ONLY. */
  navPhaseForChannel(channel) {
    try {
      return this.tabPhase(channel.loadInfo?.browsingContext);
    } catch (_e) {
      return "first_document";
    }
  },

  /**
   * duppel_persona::strict_next_nav_armed — persona surfaces arm on SubsequentNav
   * when strictFirstDoc (default). Phase 3 / 0020 chrome mirror of C++ SoT.
   */
  strictNextNavArmed(phase) {
    const plan = this.getPlan();
    if (!plan.pollutionActive || !plan.nativeHooks) {
      return false;
    }
    if (!plan.strictFirstDoc) {
      return true;
    }
    return phase === "subsequent_nav";
  },

  /** Sync diagnostic pref (darkstr.* only — never privacy.*). */
  _syncStrictNextNavArmedDiag(phase) {
    try {
      const armed = this.strictNextNavArmed(phase);
      diagPrefs.setBoolPref(STRICT_NEXT_NAV_ARMED_PREF, armed);
    } catch (_e) {}
  },

  _tabArmed(bc) {
    return this.strictNextNavArmed(this.tabPhase(bc));
  },

  /** Decision for a top-level site URI + phase. */
  _decisionFor(uri, armed, ctx) {
    const plan = this.getPlan();
    const site = this._etldPlus1FromUri(uri);
    const c = String(ctx || "0");
    if (!plan.applyNativeBase || !armed) {
      return { armed: false, site, ctx: c, snapshot: null };
    }
    let snap = plan.snapshot;
    if (this._rotationActive(plan)) {
      snap = site ? this.resolveSnapshotForUri(uri, c) : null;
    }
    return snap?.userAgent
      ? { armed: true, site, ctx: c, snapshot: snap }
      : { armed: false, site, ctx: c, snapshot: null };
  },

  _documentUri(wgp) {
    try {
      const p = wgp.documentPrincipal;
      if (p?.isContentPrincipal && p.URI) {
        return p.URI;
      }
    } catch (_e) {}
    try {
      return wgp.documentURI;
    } catch (_e) {
      return null;
    }
  },

  /**
   * 0051: one decision per document (WindowGlobalParent), stable for its
   * lifetime (bfcache included). Frames inherit their top-level document's
   * decision so the whole tab shows one persona.
   */
  documentDecision(wgp) {
    const plan = this.getPlan();
    if (!plan.applyNativeBase || !wgp) {
      return NATIVE_DECISION;
    }
    if (!this._docDecisions) {
      this._docDecisions = new WeakMap();
    }
    const cached = this._docDecisions.get(wgp);
    if (cached) {
      return cached;
    }
    let decision = NATIVE_DECISION;
    const bc = wgp.browsingContext;
    if (bc && bc.parent) {
      let topWc = null;
      try {
        topWc = wgp.topWindowContext;
      } catch (_e) {}
      if (!topWc || topWc === wgp) {
        topWc = bc.top?.currentWindowGlobal || null;
      }
      decision =
        topWc && topWc !== wgp
          ? this.documentDecision(topWc)
          : this._decisionFor(
              bc.top?.currentURI,
              this._tabArmed(bc),
              this._ctxOfBC(bc)
            );
    } else if (bc) {
      const uri = this._documentUri(wgp);
      const scheme = String(uri?.scheme || "").toLowerCase();
      let openerWc = null;
      if (scheme !== "http" && scheme !== "https" && scheme !== "file") {
        // window.open() about:blank / blob: inherits the opener's principal;
        // it must not show a different navigator than the opener.
        try {
          openerWc = bc.opener?.top?.currentWindowGlobal || null;
        } catch (_e) {}
      }
      if (openerWc && openerWc !== wgp) {
        decision = this.documentDecision(openerWc);
      } else {
        const ctx = this._ctxOfWgp(wgp);
        decision =
          this._openedContextDecision(bc, uri, ctx) ||
          this._decisionFor(uri, this._tabArmed(bc), ctx);
      }
    }
    this._docDecisions.set(wgp, decision);
    return decision;
  },

  /**
   * 0051r2 (Proof F1, popups): a top-level browsing context opened from a
   * page, while its tab is still on its first counted document.
   *  - Opener relationship (window.open, target=_blank without noopener,
   *    incl. about:blank and its later same-origin navigations): the opener
   *    document's decision, recorded once when the popup is first seen. A
   *    same-site document reuses it verbatim (same persona as the opener it
   *    can script); a cross-site document keeps the opener's armed bit with
   *    its own site's persona (no cross-site persona linking).
   *  - No opener but opened from a page (crossGroupOpener: noopener /
   *    rel=noopener / implicit noopener): the site's live armed decision,
   *    the 0049 shared-worker rule.
   *  - Anything else (URL bar, bookmarks, GUI new tab, external): null, so
   *    strictFirstDoc is unchanged.
   */
  _openedContextDecision(bc, uri, ctx) {
    const c = String(ctx || "0");
    const plan = this.getPlan();
    if (!plan.applyNativeBase || !bc) {
      return null;
    }
    const top = bc.top || bc;
    if (this.tabPhase(top) !== "first_document") {
      return null;
    }
    const key = this._tabKey(top);
    if (!this._openedTabs) {
      this._openedTabs = new Map();
    }
    let rec = key ? this._openedTabs.get(key) : null;
    if (!rec) {
      let opener = null;
      let crossGroupOpener = null;
      try {
        opener = top.opener;
      } catch (_e) {}
      try {
        crossGroupOpener = top.crossGroupOpener;
      } catch (_e) {}
      if (opener) {
        let openerWc = null;
        try {
          openerWc = opener.top?.currentWindowGlobal || null;
        } catch (_e) {}
        if (!openerWc || openerWc.browsingContext?.top === top) {
          return null;
        }
        rec = { kind: "opener", decision: this.documentDecision(openerWc) };
      } else if (crossGroupOpener) {
        rec = { kind: "noopener" };
      } else {
        return null;
      }
      if (key) {
        this._openedTabs.set(key, rec);
      }
    }
    const site = uri ? this._etldPlus1FromUri(uri) : null;
    if (rec.kind === "opener") {
      const d = rec.decision || NATIVE_DECISION;
      if (!site || (site === d.site && (d.ctx || "0") === c)) {
        return d;
      }
      return this._decisionFor(uri, !!d.armed, c);
    }
    return this._liveSiteDecision(uri, key, c);
  },

  /** Top-level documents of every open tab (chrome windows). */
  _liveTopDocuments() {
    const out = [];
    try {
      for (const win of Services.wm.getEnumerator("navigator:browser")) {
        for (const browser of win.gBrowser?.browsers || []) {
          const wgp = browser.browsingContext?.currentWindowGlobal;
          if (wgp) {
            out.push(wgp);
          }
        }
      }
    } catch (_e) {}
    return out;
  },

  /**
   * Site's live armed decision (0049 shared-worker rule): armed when a live
   * top-level document of that site (other tab) is armed — same snapshot;
   * native when the live ones are native; no live document: armed unless
   * strictFirstDoc.
   */
  _liveSiteDecision(uri, excludeKey, ctx) {
    const plan = this.getPlan();
    const site = uri ? this._etldPlus1FromUri(uri) : null;
    const c = String(ctx || "0");
    if (!plan.applyNativeBase || !site) {
      return { armed: false, site, ctx: c, snapshot: null };
    }
    if (!this._liveDeciding) {
      this._liveDeciding = new Set();
    }
    if (this._liveDeciding.has(excludeKey)) {
      return { armed: false, site, ctx: c, snapshot: null };
    }
    this._liveDeciding.add(excludeKey);
    try {
      let liveNative = false;
      for (const wgp of this._liveTopDocuments()) {
        const k = this._tabKey(wgp.browsingContext);
        if (k === excludeKey || this._liveDeciding.has(k)) {
          continue;
        }
        const d = this.documentDecision(wgp);
        if (d.site !== site || (d.ctx || "0") !== c) {
          continue;
        }
        if (d.snapshot) {
          return d;
        }
        liveNative = true;
      }
      if (liveNative) {
        return { armed: false, site, ctx: c, snapshot: null };
      }
      return this._decisionFor(uri, !plan.strictFirstDoc, c);
    } finally {
      this._liveDeciding.delete(excludeKey);
    }
  },

  _isTopLevelDocumentChannel(li) {
    return li?.externalContentPolicyType === Ci.nsIContentPolicy.TYPE_DOCUMENT;
  },

  /**
   * 0051 (N2/N3): decision for one request — the top-level document load
   * itself (tab phase after counting, its own site) or the requesting
   * document's top-level decision. No browsing context (Shared/Service
   * worker) → 0049: the owning site's worker decision (top-level site of the
   * request's partition), the same one the worker's navigator got.
   */
  decisionForChannel(channel) {
    const plan = this.getPlan();
    if (!plan.applyNativeBase) {
      return null;
    }
    const li = channel.loadInfo;
    if (!li) {
      return null;
    }
    let bc = null;
    try {
      bc = li.browsingContext;
    } catch (_e) {}
    if (this._isTopLevelDocumentChannel(li)) {
      if (!bc) {
        return null;
      }
      const docUri = channel.URI || channel.originalURI;
      const ctx = this._ctxOfLoadInfo(li);
      return (
        this._openedContextDecision(bc, docUri, ctx) ||
        this._decisionFor(docUri, this._tabArmed(bc), ctx)
      );
    }
    let wgp = null;
    try {
      if (li.innerWindowID) {
        wgp = WindowGlobalParent.getByInnerWindowId(li.innerWindowID);
      }
    } catch (_e) {}
    if (wgp) {
      return this.documentDecision(wgp);
    }
    // 0049r2: a request made by a dedicated worker (importScripts, module
    // imports, fetch, XHR — also from nested workers) carries the browsing
    // context of the window that created the worker. Use that document's
    // decision: the same one ResolveWorkerPersona gave the worker's
    // navigator (and its script load, via innerWindowID), so navigator,
    // timezone, script load and all subresources come from ONE source —
    // also in popups and in native first documents of an otherwise armed
    // site. Shared/Service workers carry 0 and keep the site rule.
    const workerOwner = this._workerOwnerDecisionForChannel(li);
    if (workerOwner) {
      return workerOwner;
    }
    const top = bc?.top;
    if (!top) {
      return this._windowlessDecisionForChannel(li);
    }
    if (top.currentWindowGlobal) {
      return this.documentDecision(top.currentWindowGlobal);
    }
    return this._decisionFor(
      top.currentURI,
      this._tabArmed(top),
      this._ctxOfBC(top)
    );
  },

  shouldApplyForChannel(channel) {
    return !!this.decisionForChannel(channel)?.snapshot;
  },

  // -------------------------------------------------------------------------
  // 0049: workers. Dedicated workers use their creating document's decision
  // (documentDecision). Shared/Service workers have no window: they use the
  // owning site's decision (top-level site of their partition).
  // -------------------------------------------------------------------------

  /** Navigator fields a worker reports (page surface + 0028 timezone). */
  workerPersonaFields(snap) {
    const child = this._childSnapshot(snap);
    if (!child) {
      return null;
    }
    const timezone = snap?.timezone ? String(snap.timezone).trim() : "";
    return { ...child, timezone };
  },

  /**
   * Top-level site URI that owns a windowless worker / request: the
   * partitionKey "(scheme,host[,port][,f])" when present, else the
   * principal's own origin (first-party).
   */
  topSiteUriForWorker(principalOrigin, partitionKey) {
    const pk = String(partitionKey || "").trim();
    if (pk.startsWith("(") && pk.endsWith(")")) {
      const fields = pk.slice(1, -1).split(",");
      const scheme = fields[0];
      const host = fields[1];
      let port = "";
      if (fields[2] && /^\d+$/.test(fields[2])) {
        port = ":" + fields[2];
      }
      if (scheme && host && /^(https?|file)$/i.test(scheme)) {
        try {
          return Services.io.newURI(`${scheme}://${host}${port}/`);
        } catch (_e) {}
      }
    }
    const origin = String(principalOrigin || "").trim();
    if (!/^(https?|file):/i.test(origin)) {
      return null;
    }
    try {
      return Services.io.newURI(origin.endsWith("/") ? origin : origin + "/");
    } catch (_e) {
      return null;
    }
  },

  /**
   * Decision for a windowless worker (or its requests) owned by the
   * top-level site of `uri`. Armed when a live top-level document of that
   * site is armed (same snapshot — one persona per site); once armed it
   * stays armed for this plan so the worker's navigator and its later
   * requests agree. No live document (service worker wake-up): armed unless
   * strictFirstDoc. Returns { decision, browsingContext }.
   */
  workerSiteDecision(uri, ctx) {
    const plan = this.getPlan();
    const site = uri ? this._etldPlus1FromUri(uri) : null;
    const c = String(ctx || "0");
    if (!plan.applyNativeBase || !uri || !site) {
      return { decision: NATIVE_DECISION, browsingContext: null };
    }
    if (!this._workerSiteDecisions) {
      this._workerSiteDecisions = new Map();
    }
    // 0056: one persona per (context, site): containers / private differ.
    const wkey = `${c}|${site}`;
    let liveNative = false;
    for (const wgp of this._liveTopDocuments()) {
      const d = this.documentDecision(wgp);
      if (d.site !== site || (d.ctx || "0") !== c) {
        continue;
      }
      if (d.snapshot) {
        this._workerSiteDecisions.set(wkey, d);
        return { decision: d, browsingContext: wgp.browsingContext };
      }
      liveNative = true;
    }
    const sticky = this._workerSiteDecisions.get(wkey);
    if (sticky) {
      return { decision: sticky, browsingContext: null };
    }
    if (liveNative) {
      return {
        decision: { armed: false, site, ctx: c, snapshot: null },
        browsingContext: null,
      };
    }
    const d = this._decisionFor(uri, !plan.strictFirstDoc, c);
    if (d.snapshot) {
      this._workerSiteDecisions.set(wkey, d);
    }
    return { decision: d, browsingContext: null };
  },

  /**
   * 0049r2: decision for a dedicated-worker request via
   * loadInfo.associatedBrowsingContext (set by Gecko for every request a
   * dedicated worker makes; 0 for Shared/Service workers). Null when absent.
   */
  _workerOwnerDecisionForChannel(li) {
    let id = 0;
    try {
      id = li.associatedBrowsingContextID || 0;
    } catch (_e) {}
    if (!id) {
      return null;
    }
    let abc = null;
    try {
      abc = li.associatedBrowsingContext;
    } catch (_e) {}
    if (!abc) {
      return null;
    }
    let wgp = null;
    try {
      wgp = abc.currentWindowGlobal;
    } catch (_e) {}
    if (wgp) {
      return this.documentDecision(wgp);
    }
    const top = abc.top || abc;
    return this._decisionFor(
      top.currentURI,
      this._tabArmed(top),
      this._ctxOfBC(top)
    );
  },

  _windowlessDecisionForChannel(li) {
    let principal = null;
    try {
      principal = li.triggeringPrincipal || li.loadingPrincipal;
    } catch (_e) {}
    if (!principal?.isContentPrincipal) {
      return null;
    }
    let partitionKey = "";
    try {
      partitionKey = li.originAttributes?.partitionKey || "";
    } catch (_e) {}
    if (!partitionKey) {
      try {
        partitionKey = li.cookieJarSettings?.partitionKey || "";
      } catch (_e) {}
    }
    const uri = this.topSiteUriForWorker(principal.originNoSuffix, partitionKey);
    if (!uri) {
      return null;
    }
    return this.workerSiteDecision(uri, this._ctxOfLoadInfo(li)).decision;
  },

  /**
   * Snapshot for a document's browsing context (Worker/Depth hooks gate on
   * this). Null when idle / first document of the tab. READ-ONLY.
   */
  snapshotForBrowsingContext(bc) {
    const plan = this.getPlan();
    if (!plan.applyNativeBase || !bc) {
      return null;
    }
    try {
      const wgp = bc.currentWindowGlobal;
      if (wgp) {
        return this.documentDecision(wgp).snapshot;
      }
      const top = bc.top || bc;
      return this._decisionFor(
        top.currentURI,
        this._tabArmed(top),
        this._ctxOfBC(top)
      ).snapshot;
    } catch (_e) {
      return null;
    }
  },

  /** Fields the content child may see (Firefox navigator surface only). */
  _childSnapshot(snap) {
    if (!snap?.userAgent) {
      return null;
    }
    return {
      userAgent: String(snap.userAgent),
      platform: String(snap.platform || "MacIntel"),
      hardwareConcurrency: Number(snap.hardwareConcurrency) || 8,
      languages: Array.isArray(snap.languages)
        ? snap.languages.map(String)
        : ["en-US", "en"],
    };
  },

  /** ppmm sync handler: navigator decision for one document. */
  _onSyncInstall(message) {
    const id = message?.data?.innerWindowId;
    let wgp = null;
    try {
      wgp = id ? WindowGlobalParent.getByInnerWindowId(id) : null;
    } catch (_e) {}
    if (!wgp) {
      return { decision: "retry" };
    }
    try {
      const senderPid = message.target?.osPid;
      if (
        typeof senderPid === "number" &&
        typeof wgp.osPid === "number" &&
        senderPid > 0 &&
        wgp.osPid > 0 &&
        senderPid !== wgp.osPid
      ) {
        return { decision: "native", snapshot: null, error: "pid-mismatch" };
      }
    } catch (_e) {}
    return this.installForWindowGlobal(wgp);
  },

  installForWindowGlobal(wgp) {
    const decision = this.documentDecision(wgp);
    try {
      if (!wgp.browsingContext?.parent) {
        this._syncTimezoneOverride(wgp.browsingContext, decision.snapshot);
      }
    } catch (_e) {}
    const snapshot = this._childSnapshot(decision.snapshot);
    return snapshot
      ? { decision: "persona", snapshot }
      : { decision: "native", snapshot: null };
  },

  /**
   * 0028: native realm/worker timezone follows the top-level document's
   * decision (empty = host timezone for a native first document).
   */
  _syncTimezoneOverride(bc, snapshot) {
    try {
      const top = bc?.top || bc;
      if (!top) {
        return;
      }
      const tz = snapshot?.timezone ? String(snapshot.timezone).trim() : "";
      if (top.timezoneOverride !== tz) {
        top.timezoneOverride = tz;
      }
    } catch (e) {
      try {
        diagPrefs.setStringPref(
          PERSONA_LAST_ERROR_PREF,
          ("timezoneOverride: " + String(e?.message || e)).slice(0, 200)
        );
      } catch (_e2) {}
    }
  },

  /**
   * Gecko's default Accept-Language header values for this profile (what
   * nsHttpHandler put on the channel before any page header).
   */
  _isNativeAcceptLanguage(value) {
    const candidates = new Set();
    try {
      candidates.add(prepareAcceptLanguages(Services.locale.acceptLanguages));
    } catch (_e) {}
    try {
      candidates.add(
        prepareAcceptLanguages(Services.prefs.getCharPref(ACCEPT_LANGS_PREF, ""))
      );
    } catch (_e) {}
    candidates.add(prepareAcceptLanguages("en-US, en"));
    candidates.delete("");
    return candidates.has(value);
  },

  _writeDecisionDiag(channel, decision, ua, al) {
    try {
      diagPrefs.setStringPref(
        LAST_DECISION_PREF,
        JSON.stringify({
          site: decision?.site || "",
          armed: !!decision?.snapshot,
          phase: this.navPhaseForChannel(channel),
          ua: ua || "",
          al: al || "",
        })
      );
    } catch (_e) {}
  },

  _onModifyRequest(subject, topic) {
    if (topic !== "http-on-modify-request") {
      return;
    }
    let channel;
    try {
      channel = subject.QueryInterface(Ci.nsIHttpChannel);
    } catch (_e) {
      return;
    }

    // Count top-level document navigations before phase checks.
    this._noteTopLevelDocument(channel);

    const plan = this.getPlan();

    // Client Hints: REMOVE only when present; never SET on Firefox host.
    if (plan.nativeHooks && plan.pollutionActive) {
      const toClear = [];
      try {
        channel.visitRequestHeaders((header, _value) => {
          if (CLIENT_HINT_HEADERS.includes(String(header).toLowerCase())) {
            toClear.push(header);
          }
        });
      } catch (_e) {}
      for (const h of toClear) {
        try {
          // Empty replacement clears the header on this channel.
          channel.setRequestHeader(h, "", false);
        } catch (_e) {}
      }
    }

    if (!plan.applyNativeBase) {
      return;
    }
    // 0056r2: no persona decision for a top-level document while the seed
    // store is still loading: hold the channel (not yet connected; headers can
    // still be set) and decide once the stored seeds are known.
    if (this._holdForSeedStore(channel, plan)) {
      return;
    }
    this._applyChannelPersona(channel);
  },

  _seedWaitMs() {
    let ms = SEED_WAIT_DEFAULT_MS;
    try {
      ms = Services.prefs.getIntPref(SEED_WAIT_PREF, SEED_WAIT_DEFAULT_MS);
    } catch (_e) {}
    return Math.max(0, Math.min(10000, ms | 0));
  },

  /**
   * 0056r2: true when the channel was suspended until the persisted seed store
   * is ready (or the timeout passed); it is then decided and resumed. Only
   * top-level documents, only while per-site rotation uses the store (no fixed
   * seed, never in off mode) and only for contexts the store persists (never
   * private browsing).
   */
  _holdForSeedStore(channel, plan) {
    let li = null;
    try {
      li = channel.loadInfo;
    } catch (_e) {}
    if (!li || !this._isTopLevelDocumentChannel(li)) {
      return false;
    }
    if (!this._rotationActive(plan) || this._fixedSeedSet()) {
      return false;
    }
    if (this._ctxOfLoadInfo(li) === "p") {
      return false;
    }
    let store = null;
    try {
      store = seedStore();
    } catch (_e) {
      return false;
    }
    if (!store?.loading) {
      return false;
    }
    const waitMs = this._seedWaitMs();
    if (!waitMs) {
      return false;
    }
    try {
      channel.suspend();
    } catch (_e) {
      return false;
    }
    const stats = (this._seedHoldStats ||= { held: 0, ready: 0, timeout: 0 });
    stats.held++;
    const { setTimeout, clearTimeout } = ChromeUtils.importESModule(
      "resource://gre/modules/Timer.sys.mjs"
    );
    let done = false;
    let timer = null;
    const finish = why => {
      if (done) {
        return;
      }
      done = true;
      if (timer) {
        clearTimeout(timer);
      }
      stats[why === "timeout" ? "timeout" : "ready"]++;
      try {
        this._applyChannelPersona(channel);
      } catch (e) {
        console.error("darkstr 0056: held channel decision failed", e);
      } finally {
        try {
          channel.resume();
        } catch (_e) {}
      }
    };
    timer = setTimeout(() => finish("timeout"), waitMs);
    store.whenReady().then(
      () => finish("ready"),
      () => finish("ready")
    );
    return true;
  },

  /** Persona headers (UA, Accept-Language) for one request (0051 N2/N3). */
  _applyChannelPersona(channel) {
    const plan = this.getPlan();
    if (!plan.applyNativeBase) {
      return;
    }
    const decision = this.decisionForChannel(channel);
    const snap = decision?.snapshot;
    const topDoc = this._isTopLevelDocumentChannel(channel.loadInfo);
    if (!snap?.userAgent) {
      if (topDoc) {
        this._writeDecisionDiag(channel, decision, "", "");
      }
      return;
    }
    const ua = String(snap.userAgent);
    try {
      channel.setRequestHeader("User-Agent", ua, false);
    } catch (_e) {}
    // Accept-Language from the same snapshot as navigator.languages. Leave a
    // value the page set itself (anything but Gecko's default) alone.
    const al = prepareAcceptLanguages(
      Array.isArray(snap.languages) ? snap.languages : ["en-US", "en"]
    );
    try {
      let current = "";
      try {
        current = channel.getRequestHeader("Accept-Language");
      } catch (_e) {
        current = "";
      }
      if (al && (!current || this._isNativeAcceptLanguage(current))) {
        channel.setRequestHeader("Accept-Language", al, false);
      }
    } catch (_e) {}
    if (topDoc) {
      this._writeDecisionDiag(channel, decision, ua, al);
    }
  },
};
