/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr Phase 3 — native chaff timer glue (chrome JS; pin 1 + optional 0024).
 *
 * Train pin: Firefox / LibreWolf 155.0.1-1 (FIREFOX_155_0_1_RELEASE).
 * Brand: darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.
 *
 * Mirrors public control plane (no Rust FFI required in this drop):
 *   duppel_chaff::ChaffSchedulerPlan / ChaosLevel / ChaffSchedule / plan_fire
 *   duppel_bridge::allow_persona_chaff / PrefApplyPlan
 *
 * Gates (default-off — timer idle unless explicitly allowed):
 *   pollution_active = mode=="pollution" && !nativeCompatible
 *   allow = pollution_active && darkstr.nativePersonaHooks
 * Homogeneous / Native-Compatible / hooks false → cancel timer, idle.
 *
 * Quiet / Balanced / Loud from darkstr.chaosLevel (Phase 1 poisoner parity):
 *   Quiet    interval 8–20 min, batch 1,    stagger base 4000 ms
 *   Balanced interval 3–8 min,  batch 1–3,  stagger base 1500 ms
 *   Loud     interval 1–3 min,  batch 5–15, stagger base 500 ms
 *
 * Beacons: ordinary HTTP channels to Phase 1 poisoner endpoints only
 * (google-analytics collect / g/collect / facebook tr). No TLS/JA3 games,
 * no CF claims. Does not write privacy.* prefs.
 *
 * 0024 honest subset (WebExt poisoner.js may remain richer):
 *   SPOOFED HERE — session interest clusters; GA Universal / GA4 / Meta PageView
 *                  query payloads (tid/cid/dp/dh/dr/sr/vp / GA4 dl+sid / Meta
 *                  id+ev+dl+rl+sw/sh+v) on ordinary chrome fetch.
 *   NOT CLAIMED here — ISOLATED-world sendBeacon with real Referer + cookie jar;
 *                  DOM ad-container attribute chaff; interaction-coupled bridge
 *                  fire; Cloudflare / TLS / JA3 fingerprint games.
 *
 * Canvas / WebGL / Audio / worker hooks are NOT in this module (0017–0023).
 */

const MODE_PREF = "darkstr.mode";
const NATIVE_PREF = "darkstr.nativeCompatible";
const HOOKS_PREF = "darkstr.nativePersonaHooks";
const CHAOS_PREF = "darkstr.chaosLevel";
const ARMED_PREF = "darkstr.chaff.schedulerArmed";
const LAST_PLAN_PREF = "darkstr.chaff.lastPlan";
const LAST_FIRE_PREF = "darkstr.chaff.lastFireAt";
const LAST_BEACON_PREF = "darkstr.chaff.lastBeaconKind";

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

const SCHEDULES = {
  quiet: { minMin: 8, maxMin: 20, batchMin: 1, batchMax: 1, staggerBase: 4000 },
  balanced: {
    minMin: 3,
    maxMin: 8,
    batchMin: 1,
    batchMax: 3,
    staggerBase: 1500,
  },
  loud: { minMin: 1, maxMin: 3, batchMin: 5, batchMax: 15, staggerBase: 500 },
};

// Phase 1 poisoner.js endpoints — ordinary HTTP only.
const GA_ENDPOINTS = [
  "https://www.google-analytics.com/collect",
  "https://www.google-analytics.com/g/collect",
];
const META_ENDPOINTS = ["https://www.facebook.com/tr/"];

// Phase 1 poisoner.js interest clusters (session-coherent chaff).
const INTEREST_CLUSTERS = [
  {
    name: "tech",
    sites: [
      {
        host: "www.bestbuy.com",
        paths: [
          "/site/computers/abcat0502000",
          "/site/laptops/pcmcat138500050001",
          "/site/gaming-laptops/pcmcat287600050003",
        ],
      },
      {
        host: "www.amazon.com",
        paths: [
          "/dp/B0CDJ4HKBZ",
          "/s?k=gaming+laptop",
          "/gp/bestsellers/electronics",
        ],
      },
      {
        host: "www.newegg.com",
        paths: [
          "/p/pl?N=100167732",
          "/GPUs-Video-Graphics-Cards/SubCategory/ID-48",
          "/p/pl?d=mechanical+keyboard",
        ],
      },
      {
        host: "www.microcenter.com",
        paths: [
          "/category/4294967292/Laptops",
          "/category/4294966737/Desktop-Computers",
          "/category/4294966739/Computer-Parts",
        ],
      },
    ],
    referrers: [
      "https://www.google.com/search?q=best+laptop+2025",
      "https://www.reddit.com/r/buildapc/",
      "https://news.ycombinator.com/",
      "https://www.youtube.com/results?search_query=tech+reviews",
    ],
  },
  {
    name: "home",
    sites: [
      {
        host: "www.homedepot.com",
        paths: [
          "/b/Appliances/N-5yc1vZbv09",
          "/b/Bath/N-5yc1vZbzb3",
          "/b/Tools/N-5yc1vZc1xy",
        ],
      },
      {
        host: "www.lowes.com",
        paths: [
          "/pl/Tools/4294857975",
          "/pl/Appliances/4294966702",
          "/pl/Flooring/4294822463",
        ],
      },
      {
        host: "www.wayfair.com",
        paths: [
          "/furniture/sb0/sofas-c413892.html",
          "/kitchen-tabletop/sb0/kitchen-islands-c413783.html",
          "/bed-bath/sb0/bedding-c215330.html",
        ],
      },
      {
        host: "www.ikea.com",
        paths: [
          "/us/en/cat/sofas-fu003/",
          "/us/en/cat/desks-fu004/",
          "/us/en/cat/beds-bm003/",
        ],
      },
    ],
    referrers: [
      "https://www.google.com/search?q=bathroom+renovation+ideas",
      "https://www.pinterest.com/ideas/home-decor/",
      "https://www.reddit.com/r/HomeImprovement/",
      "https://www.youtube.com/results?search_query=diy+home",
    ],
  },
  {
    name: "fashion",
    sites: [
      {
        host: "www.nordstrom.com",
        paths: ["/browse/sale/women", "/browse/shoes/women", "/browse/handbags"],
      },
      {
        host: "www.macys.com",
        paths: [
          "/shop/womens-clothing",
          "/shop/shoes",
          "/shop/jewelry-watches",
        ],
      },
      {
        host: "www.sephora.com",
        paths: ["/shop/skincare", "/shop/makeup", "/shop/fragrance"],
      },
      {
        host: "www.zara.com",
        paths: [
          "/us/en/woman-new-in-l1180.html",
          "/us/en/woman-dresses-l1066.html",
          "/us/en/woman-shoes-l1251.html",
        ],
      },
    ],
    referrers: [
      "https://www.google.com/search?q=spring+fashion+trends",
      "https://www.pinterest.com/ideas/fashion/",
      "https://www.instagram.com/explore/tags/ootd/",
      "https://www.youtube.com/results?search_query=styling+tips",
    ],
  },
  {
    name: "fitness",
    sites: [
      {
        host: "www.rei.com",
        paths: ["/c/camping-gear", "/c/hiking-gear", "/c/running-shoes"],
      },
      {
        host: "www.nike.com",
        paths: [
          "/w/new-releases-3n82y",
          "/w/running-shoes-37v7jznik1",
          "/w/mens-training-shoes-58jtoznik1",
        ],
      },
      {
        host: "www.adidas.com",
        paths: ["/us/running-shoes", "/us/training-shoes", "/us/outdoor-shoes"],
      },
      {
        host: "www.backcountry.com",
        paths: ["/outdoor-gear", "/trail-running-shoes", "/hiking-boots"],
      },
    ],
    referrers: [
      "https://www.google.com/search?q=marathon+training+plan",
      "https://www.reddit.com/r/running/",
      "https://www.strava.com/dashboard",
      "https://www.youtube.com/results?search_query=workout",
    ],
  },
  {
    name: "family",
    sites: [
      {
        host: "www.target.com",
        paths: [
          "/c/baby/-/N-5xtly",
          "/c/toys/-/N-5xt5z",
          "/c/grocery/-/N-5xsz7",
        ],
      },
      {
        host: "www.costco.com",
        paths: ["/grocery.html", "/baby-kids.html", "/home-garden.html"],
      },
      {
        host: "www.chewy.com",
        paths: ["/b/dog-food-332", "/b/cat-food-387", "/b/pet-supplies-502"],
      },
      {
        host: "www.petco.com",
        paths: [
          "/shop/en/petcostore/category/dog/dog-food",
          "/shop/en/petcostore/category/cat/cat-food",
          "/shop/en/petcostore/category/dog/dog-treats",
        ],
      },
    ],
    referrers: [
      "https://www.google.com/search?q=best+dog+food+brands",
      "https://www.reddit.com/r/Parenting/",
      "https://www.pinterest.com/ideas/recipes/",
      "https://www.youtube.com/results?search_query=meal+prep",
    ],
  },
  {
    name: "finance",
    sites: [
      {
        host: "www.zillow.com",
        paths: ["/homes/for_sale/", "/homes/recently_sold/", "/mortgage-rates/"],
      },
      {
        host: "www.autotrader.com",
        paths: [
          "/cars-for-sale/all-cars",
          "/car-reviews/",
          "/car-comparisons/",
        ],
      },
      {
        host: "www.nerdwallet.com",
        paths: ["/mortgages/", "/investing/", "/credit-cards/"],
      },
      {
        host: "www.bankrate.com",
        paths: [
          "/investing/",
          "/mortgages/",
          "/banking/savings-accounts/",
        ],
      },
    ],
    referrers: [
      "https://www.google.com/search?q=mortgage+rates+2025",
      "https://www.reddit.com/r/personalfinance/",
      "https://www.bing.com/search?q=best+suv+2025",
      "https://www.youtube.com/results?search_query=investing",
    ],
  },
];

const FAKE_SCREENS = [
  "1920x1080",
  "2560x1440",
  "1366x768",
  "1536x864",
  "1440x900",
  "1680x1050",
  "3840x2160",
  "1280x720",
];

const META_VERSIONS = [
  "2.9.136",
  "2.9.142",
  "2.9.148",
  "2.9.155",
  "2.9.159",
];

function parseChaosLevel(raw) {
  const v = String(raw || "balanced").toLowerCase();
  if (v === "quiet" || v === "stealth") {
    return "quiet";
  }
  if (v === "loud" || v === "chaos") {
    return "loud";
  }
  return "balanced";
}

function unit01() {
  return Math.random();
}

function pickIntervalMinutes(level) {
  const s = SCHEDULES[level] || SCHEDULES.balanced;
  return s.minMin + unit01() * (s.maxMin - s.minMin);
}

function pickBatchCount(level) {
  const s = SCHEDULES[level] || SCHEDULES.balanced;
  if (s.batchMin === s.batchMax) {
    return s.batchMin;
  }
  return (
    s.batchMin + Math.floor(unit01() * (s.batchMax - s.batchMin + 1))
  );
}

function staggerDelayMs(level, index) {
  const s = SCHEDULES[level] || SCHEDULES.balanced;
  // Mirror ChaffSchedule::stagger.delay_for_index: base * (index+1) + jitter.
  return s.staggerBase * (index + 1) + Math.floor(unit01() * s.staggerBase);
}

function pickFrom(arr) {
  return arr[Math.floor(unit01() * arr.length)];
}

function randomHex(len) {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(unit01() * 16)];
  }
  return result;
}

/**
 * Session persona — Phase 1 poisoner.selectPersona parity.
 * Locked for the chrome-process lifetime (until uninit/re-init).
 */
function createSessionPersona() {
  const count = 2 + Math.floor(unit01() * 2); // 2 or 3
  const shuffled = INTEREST_CLUSTERS.slice().sort(() => unit01() - 0.5);
  const activeClusters = shuffled.slice(0, count);
  const screen = pickFrom(FAKE_SCREENS);
  const a = Math.floor(unit01() * 2147483647);
  const b =
    Math.floor(Date.now() / 1000) - Math.floor(unit01() * 86400 * 30);
  return {
    activeClusters,
    screen,
    clientId: `${a}.${b}`,
    ga4Cid: `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${randomHex(4)}-${randomHex(12)}`,
    tids: {
      ga: `UA-${Math.floor(unit01() * 99999999)}-1`,
      ga4: `G-${randomHex(10).toUpperCase()}`,
    },
    metaId: String(Math.floor(unit01() * 9999999999999)),
  };
}

function pickSitePage(persona) {
  const cluster = pickFrom(persona.activeClusters);
  const site = pickFrom(cluster.sites);
  const page = pickFrom(site.paths);
  const referrer = pickFrom(cluster.referrers);
  return { host: site.host, page, referrer, clusterName: cluster.name };
}

function buildGAPayload(persona) {
  const { host, page, referrer } = pickSitePage(persona);
  const [sw, sh] = persona.screen.split("x");
  return new URLSearchParams({
    v: "1",
    tid: persona.tids.ga,
    cid: persona.clientId,
    t: "pageview",
    dp: page,
    dh: host,
    dr: referrer,
    dt: page.split("/").pop().replace(/-/g, " "),
    ul: "en-us",
    sr: persona.screen,
    vp: `${sw}x${parseInt(sh, 10) - Math.floor(unit01() * 60 + 80)}`,
    je: "0",
    fl: "",
    z: String(Math.floor(unit01() * 2147483647)),
  }).toString();
}

function buildGA4Payload(persona) {
  const { host, page } = pickSitePage(persona);
  const sid = randomHex(32);
  return new URLSearchParams({
    v: "2",
    tid: persona.tids.ga4,
    cid: persona.ga4Cid,
    sid,
    en: "page_view",
    dl: `https://${host}${page}`,
    dt: page.split("/").pop().replace(/-/g, " "),
    sr: persona.screen,
    ul: "en-us",
    _p: String(Math.floor(unit01() * 2147483647)),
  }).toString();
}

function buildMetaPayload(persona) {
  const { host, page, referrer } = pickSitePage(persona);
  const [sw, sh] = persona.screen.split("x");
  const ver = pickFrom(META_VERSIONS);
  return new URLSearchParams({
    id: persona.metaId,
    ev: "PageView",
    dl: `https://${host}${page}`,
    rl: referrer,
    ts: String(Date.now()),
    sw,
    sh,
    v: ver,
    r: "stable",
    ec: "0",
    o: String(Math.floor(unit01() * 60)),
    it: String(Date.now() - Math.floor(unit01() * 5000)),
  }).toString();
}

/**
 * Phase 1 poisoner.buildBeaconConfig parity — returns { kind, url, body }.
 * Payload rides in the query string; body stays null (same as WebExt fireFakeBeacon).
 */
function buildBeaconConfig(persona) {
  const roll = unit01();
  let kind;
  let endpoint;
  let payload;
  if (roll < 0.4) {
    kind = "ga";
    endpoint = GA_ENDPOINTS[0];
    payload = buildGAPayload(persona);
  } else if (roll < 0.7) {
    kind = "ga4";
    endpoint = GA_ENDPOINTS[1];
    payload = buildGA4Payload(persona);
  } else {
    kind = "meta";
    endpoint = META_ENDPOINTS[0];
    payload = buildMetaPayload(persona);
  }
  const url = endpoint.includes("?")
    ? `${endpoint}&${payload}`
    : `${endpoint}?${payload}`;
  return { kind, url, body: null, endpoint };
}

export var DarkstrChaffScheduler = {
  /** 0052: in-memory diagnostics (what used to be darkstr.*.last* prefs). */
  getDiagnostics() {
    return diagPrefs.snapshot();
  },

  _inited: false,
  _timer: null,
  _batchTimers: [],
  _observer: null,
  _applying: false,
  _persona: null,

  init() {
    if (this._inited) {
      return;
    }
    this._inited = true;
    this._persona = createSessionPersona();
    this._observer = this._observe.bind(this);
    Services.prefs.addObserver(MODE_PREF, this._observer);
    Services.prefs.addObserver(NATIVE_PREF, this._observer);
    Services.prefs.addObserver(HOOKS_PREF, this._observer);
    Services.prefs.addObserver(CHAOS_PREF, this._observer);
    this.refreshPlan();
  },

  uninit() {
    if (!this._inited) {
      return;
    }
    try {
      Services.prefs.removeObserver(MODE_PREF, this._observer);
      Services.prefs.removeObserver(NATIVE_PREF, this._observer);
      Services.prefs.removeObserver(HOOKS_PREF, this._observer);
      Services.prefs.removeObserver(CHAOS_PREF, this._observer);
    } catch (_e) {
      // Observers may already be gone during shutdown.
    }
    this._cancelAll();
    this._persona = null;
    this._inited = false;
  },

  _observe(_subject, topic, data) {
    if (topic !== "nsPref:changed") {
      return;
    }
    if (
      data === MODE_PREF ||
      data === NATIVE_PREF ||
      data === HOOKS_PREF ||
      data === CHAOS_PREF
    ) {
      this.refreshPlan();
    }
  },

  /**
   * Resolve ChaffSchedulerPlan-equivalent gate + schedule.
   * @returns {{
   *   armed: boolean,
   *   pollutionActive: boolean,
   *   allowChaff: boolean,
   *   level: string,
   *   intervalMinutes: number|null,
   *   beaconCount: number|null,
   * }}
   */
  resolvePlan() {
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
    } catch (_e) {
      nativeCompatible = false;
    }

    let nativeHooks = false;
    try {
      nativeHooks = Services.prefs.getBoolPref(HOOKS_PREF, false);
    } catch (_e) {
      nativeHooks = false;
    }

    let chaosRaw = "balanced";
    try {
      chaosRaw = Services.prefs.getStringPref(CHAOS_PREF, "balanced");
    } catch (_e) {
      chaosRaw = "balanced";
    }
    const level = parseChaosLevel(chaosRaw);

    // pollution_active / allow_persona_chaff (Rust) + default-off hooks gate.
    const pollutionActive = mode === "pollution" && !nativeCompatible;
    const allowChaff = pollutionActive;
    const armed = pollutionActive && allowChaff && nativeHooks;

    if (!armed) {
      return {
        armed: false,
        pollutionActive,
        allowChaff,
        level,
        intervalMinutes: null,
        beaconCount: null,
      };
    }

    return {
      armed: true,
      pollutionActive,
      allowChaff,
      level,
      intervalMinutes: pickIntervalMinutes(level),
      beaconCount: pickBatchCount(level),
    };
  },

  /**
   * Arm or cancel nsITimer from current prefs. Safe to call repeatedly.
   * @returns {object} plan from resolvePlan()
   */
  refreshPlan() {
    if (this._applying) {
      return this.resolvePlan();
    }
    this._applying = true;
    try {
      const plan = this.resolvePlan();
      this._persistDiagnostics(plan);
      // Gate/level prefs changed (or first arm): drop any pending batch from
      // the previous plan, then arm a fresh interval if still armed.
      this._cancelAll();
      if (!plan.armed) {
        return plan;
      }
      this._armIntervalTimer(plan);
      return plan;
    } finally {
      this._applying = false;
    }
  },

  _persistDiagnostics(plan) {
    try {
      diagPrefs.setBoolPref(ARMED_PREF, !!plan.armed);
    } catch (_e) {}
    try {
      const summary = plan.armed
        ? `${plan.level};interval=${plan.intervalMinutes?.toFixed?.(2) ?? "?"};batch=${plan.beaconCount}`
        : `${plan.level};idle`;
      diagPrefs.setStringPref(LAST_PLAN_PREF, summary);
    } catch (_e) {}
  },

  /**
   * Full stop: interval timer AND every pending batch timer. Used when chaff
   * is disabled / the gate prefs change (refreshPlan) and on uninit.
   */
  _cancelAll() {
    this._cancelIntervalTimer();
    this._cancelBatchTimers();
  },

  // 0050 (B6): the rearm path must only replace the interval timer. Pending
  // batch timers belong to the batch that was just scheduled and must survive.
  _cancelIntervalTimer() {
    if (this._timer) {
      try {
        this._timer.cancel();
      } catch (_e) {}
      this._timer = null;
    }
  },

  _cancelBatchTimers() {
    const pending = this._batchTimers;
    this._batchTimers = [];
    for (const t of pending) {
      try {
        t.cancel();
      } catch (_e) {}
    }
  },

  _armIntervalTimer(plan) {
    // Replace only the interval timer; pending batch timers are left alone.
    this._cancelIntervalTimer();
    const delayMs = Math.max(
      1000,
      Math.floor((plan.intervalMinutes || 3) * 60 * 1000)
    );
    const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    // TYPE_ONE_SHOT — re-arm after each fire so chaosLevel/gates re-resolve.
    timer.initWithCallback(
      () => {
        this._onIntervalFire();
      },
      delayMs,
      Ci.nsITimer.TYPE_ONE_SHOT
    );
    this._timer = timer;
  },

  _onIntervalFire() {
    const plan = this.resolvePlan();
    this._persistDiagnostics(plan);
    if (!plan.armed) {
      this._cancelAll();
      return;
    }
    this._scheduleBatch(plan);
    // Re-arm next interval with a fresh draw.
    const next = this.resolvePlan();
    if (next.armed) {
      this._armIntervalTimer(next);
    }
  },

  _scheduleBatch(plan) {
    const count = plan.beaconCount || 1;
    const level = plan.level;
    for (let i = 0; i < count; i++) {
      const delay = staggerDelayMs(level, i);
      const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      timer.initWithCallback(
        () => {
          // Fired one-shot timers leave the pending list (no unbounded growth).
          const idx = this._batchTimers.indexOf(timer);
          if (idx === -1) {
            // Already cancelled (disable / mode change / uninit) — never fire.
            return;
          }
          this._batchTimers.splice(idx, 1);
          this._fireOneBeacon(i, count, level);
        },
        delay,
        Ci.nsITimer.TYPE_ONE_SHOT
      );
      this._batchTimers.push(timer);
    }
  },

  /**
   * Ordinary HTTP fire with Phase 1 poisoner-parity query/body config (0024).
   * Richer GA / GA4 / Meta PageView payloads; still no CF/TLS/JA3; WebExt may
   * remain richer for ISOLATED sendBeacon + DOM chaff.
   */
  _fireOneBeacon(index, total, level) {
    try {
      if (!this._persona) {
        this._persona = createSessionPersona();
      }
      const cfg = buildBeaconConfig(this._persona);

      // Ordinary channel — chrome fetch; no TLS fingerprint games.
      // Method GET with payload in query (poisoner fireFakeBeacon uses POST +
      // null body with the same query-on-URL shape; chrome GET is equivalent
      // ordinary HTTP and avoids claiming sendBeacon cookie/Referer parity).
      fetch(cfg.url, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        redirect: "manual",
      }).catch(() => {
        // Beacon best-effort; network errors are expected (tracker endpoints).
      });

      try {
        diagPrefs.setStringPref(
          LAST_FIRE_PREF,
          `${new Date().toISOString()};${level};${index + 1}/${total};${cfg.endpoint};${cfg.kind}`
        );
      } catch (_e) {}
      try {
        diagPrefs.setStringPref(
          LAST_BEACON_PREF,
          `${cfg.kind};clusters=${(this._persona.activeClusters || [])
            .map(c => c.name)
            .join("+")}`
        );
      } catch (_e) {}
    } catch (_e) {
      // Soft-fail — scheduler stays armed.
    }
  },
};
