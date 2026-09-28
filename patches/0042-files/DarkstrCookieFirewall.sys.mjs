/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr Phase 5 pin 0035 — Cookie firewall MVP (chrome JS).
 *
 * Train pin: Firefox / LibreWolf 156.0.1-1 (FIREFOX_156_0_1_RELEASE).
 * Brand: darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.
 *
 * Product (see docs/COOKIE-SANDBOX-FAKE-JAR.md):
 *   One policy for HTTP Set-Cookie / Cookie request header AND document.cookie
 *   AND Cookie Store API — no HTTP/JS split-brain. Shared in-memory sandbox jar
 *   lives here (parent); child actors IPC for script surfaces; HTTP observers
 *   mutate channel headers on the same jar.
 *
 * Gates (default-off — idle unless explicitly armed):
 *   pollution_active = mode=="pollution" && !nativeCompatible
 *   armed = pollution_active && darkstr.nativePersonaHooks
 *           && darkstr.cookieFirewall.enabled
 * Homogeneous / Native-Compatible / hooks false / enabled false → passthrough
 * (real jar unchanged; no document.cookie / CookieStore / header mutation).
 *
 * Modes:
 *   synthetic (default when enabled) — sandbox values rewritten to seed-tied
 *     synthetic tokens (0030 eTLD+1 seed when rotatePerSite; global seed under
 *     golden lock snapshot / rotatePerSite=false).
 *   isolate — sandbox stores accepted values as-is; no synthetic rewrite;
 *     still kept out of the primary profile jar via Set-Cookie strip.
 *
 * Allowlist: darkstr.cookieFirewall.allowlist CSV of eTLD+1 → real jar
 * passthrough (preserve first-party login / product allowlist expectation).
 *
 * Residual: CookieService may race Set-Cookie before header strip on some
 * paths; full dual-jar C++ CookieService hook is a follow-up. Not anti-detect.
 *
 * Soft residual (0042): outbound Cookie on content fetch was empty under 0035
 * because http-on-modify-request subject was used without QI to nsIHttpChannel
 * and setRequestHeader failures were swallowed. Pin: QI + surface set errors.
 */

const MODE_PREF = "darkstr.mode";
const NATIVE_PREF = "darkstr.nativeCompatible";
const HOOKS_PREF = "darkstr.nativePersonaHooks";
const ENABLED_PREF = "darkstr.cookieFirewall.enabled";
const CF_MODE_PREF = "darkstr.cookieFirewall.mode";
const ALLOWLIST_PREF = "darkstr.cookieFirewall.allowlist";
const ARMED_PREF = "darkstr.cookieFirewall.armed";
const LAST_ETLD_PREF = "darkstr.cookieFirewall.lastEtld";
const LAST_SEED_PREF = "darkstr.cookieFirewall.lastSeed";
const LAST_DECISION_PREF = "darkstr.cookieFirewall.lastDecision";
const LAST_INSTALL_PREF = "darkstr.cookieFirewall.lastInstall";
const LAST_ERROR_PREF = "darkstr.cookieFirewall.lastError";
const LAST_HTTP_TOPIC_PREF = "darkstr.cookieFirewall.lastHttpTopic";
const LAST_HTTP_ETLD_PREF = "darkstr.cookieFirewall.lastHttpEtld";
const LAST_COOKIE_OUT_PREF = "darkstr.cookieFirewall.lastCookieOut";
const LAST_COOKIE_SET_PREF = "darkstr.cookieFirewall.lastCookieSet";
const LAST_COOKIE_ERR_PREF = "darkstr.cookieFirewall.lastCookieErr";

const SNAPSHOT_PREF = "darkstr.persona.snapshot";
const SEED_PREF = "darkstr.persona.seed";
const ROTATE_PER_SITE_PREF = "darkstr.persona.rotatePerSite";

const PREFS_TO_OBSERVE = [
  MODE_PREF,
  NATIVE_PREF,
  HOOKS_PREF,
  ENABLED_PREF,
  CF_MODE_PREF,
  ALLOWLIST_PREF,
  SNAPSHOT_PREF,
  SEED_PREF,
  ROTATE_PER_SITE_PREF,
];

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function mixU32(a, b) {
  let h = (a >>> 0) ^ 0x9e3779b9;
  const s = String(b || "");
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  h = (h ^ (h >>> 16)) >>> 0;
  return h || 1;
}

function syntheticToken(seed, name) {
  const h1 = mixU32(seed >>> 0, String(name || ""));
  const h2 = mixU32(h1, "darkstr-cf-0035");
  const hex = (n) => ("00000000" + (n >>> 0).toString(16)).slice(-8);
  return hex(h1) + hex(h2);
}

function parseSetCookieLine(line) {
  const raw = String(line || "").trim();
  if (!raw) {
    return null;
  }
  const semi = raw.indexOf(";");
  const nv = semi >= 0 ? raw.slice(0, semi) : raw;
  const eq = nv.indexOf("=");
  if (eq <= 0) {
    return null;
  }
  const name = nv.slice(0, eq).trim();
  const value = nv.slice(eq + 1).trim();
  if (!name) {
    return null;
  }
  return { name, value };
}

function parseDocumentCookieWrite(raw) {
  // document.cookie setter takes one "name=value; attr..." assignment.
  return parseSetCookieLine(raw);
}

function serializeCookiePairMap(map) {
  if (!map || !map.size) {
    return "";
  }
  const parts = [];
  for (const [name, value] of map.entries()) {
    parts.push(`${name}=${value}`);
  }
  return parts.join("; ");
}

export var DarkstrCookieFirewall = {
  _inited: false,
  _actorRegistered: false,
  _observer: null,
  _httpObserver: null,
  _armed: false,
  /** @type {Map<string, Map<string, string>>} eTLD+1 → name → value */
  _jar: null,

  init() {
    if (this._inited) {
      return;
    }
    this._inited = true;
    this._jar = new Map();
    this._observer = this._observePref.bind(this);
    for (const p of PREFS_TO_OBSERVE) {
      try {
        Services.prefs.addObserver(p, this._observer);
      } catch (_e) {}
    }
    this._registerActor();
    this._ensureHttpObserver();
    this.refreshPlan();
  },

  uninit() {
    if (!this._inited) {
      return;
    }
    this._inited = false;
    for (const p of PREFS_TO_OBSERVE) {
      try {
        Services.prefs.removeObserver(p, this._observer);
      } catch (_e) {}
    }
    this._observer = null;
    this._teardownHttpObserver();
    if (this._actorRegistered) {
      try {
        ChromeUtils.unregisterWindowActor("DarkstrCookieFirewall");
      } catch (_e) {}
      this._actorRegistered = false;
    }
    if (this._jar) {
      this._jar.clear();
    }
    this._setArmed(false);
  },

  _observePref(_subject, topic, data) {
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
      ChromeUtils.registerWindowActor("DarkstrCookieFirewall", {
        parent: {
          esModuleURI:
            "moz-src:///browser/components/DarkstrCookieFirewallParent.sys.mjs",
        },
        child: {
          esModuleURI:
            "moz-src:///browser/components/DarkstrCookieFirewallChild.sys.mjs",
          events: {
            DOMWindowCreated: {},
            pageshow: {},
          },
        },
        allFrames: true,
        messageManagerGroups: ["browsers"],
        matches: ["*://*/*"],
        safeForUntrustedWebProcess: true,
      });
      this._actorRegistered = true;
    } catch (e) {
      console.error(
        "darkstr 0035: CookieFirewall JSWindowActor register failed:",
        e
      );
      this.recordInstallStatus({
        ok: false,
        event: "register",
        status: "register-failed",
        error: String(e?.stack || e?.message || e || "register failed"),
      });
    }
  },

  _ensureHttpObserver() {
    if (this._httpObserver) {
      return;
    }
    this._httpObserver = {
      observe: (subject, topic, _data) => {
        try {
          this._onHttp(subject, topic);
        } catch (e) {
          console.error("darkstr 0035: cookie HTTP observer failed", e);
        }
      },
    };
    for (const t of [
      "http-on-modify-request",
      "http-on-examine-response",
      "http-on-examine-cached-response",
    ]) {
      try {
        Services.obs.addObserver(this._httpObserver, t);
      } catch (_e) {}
    }
  },

  _teardownHttpObserver() {
    if (!this._httpObserver) {
      return;
    }
    for (const t of [
      "http-on-modify-request",
      "http-on-examine-response",
      "http-on-examine-cached-response",
    ]) {
      try {
        Services.obs.removeObserver(this._httpObserver, t);
      } catch (_e) {}
    }
    this._httpObserver = null;
  },

  /**
   * @returns {{
   *   pollutionActive: boolean,
   *   nativeHooks: boolean,
   *   enabled: boolean,
   *   armed: boolean,
   *   mode: string,
   * }}
   */
  getPlan() {
    let mode = "homogeneous";
    try {
      mode = Services.prefs.getStringPref(MODE_PREF, "homogeneous");
    } catch (_e) {}
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
    let enabled = false;
    try {
      enabled = Services.prefs.getBoolPref(ENABLED_PREF, false);
    } catch (_e) {}
    let cfMode = "synthetic";
    try {
      cfMode = Services.prefs.getStringPref(CF_MODE_PREF, "synthetic");
    } catch (_e) {}
    if (cfMode !== "isolate" && cfMode !== "synthetic") {
      cfMode = "synthetic";
    }
    const pollutionActive = mode === "pollution" && !nativeCompatible;
    const armed = !!(pollutionActive && nativeHooks && enabled);
    return {
      pollutionActive,
      nativeHooks,
      enabled,
      armed,
      mode: cfMode,
    };
  },

  refreshPlan() {
    const plan = this.getPlan();
    this._setArmed(plan.armed);
    return plan;
  },

  _setArmed(armed) {
    this._armed = !!armed;
    try {
      Services.prefs.setBoolPref(ARMED_PREF, this._armed);
    } catch (_e) {}
    if (!this._armed && this._jar) {
      // Idle: drop sandbox so a later arm starts clean. Real jar untouched.
      this._jar.clear();
    }
  },

  _allowlistSet() {
    const out = new Set();
    try {
      const raw = Services.prefs.getStringPref(ALLOWLIST_PREF, "");
      for (const part of String(raw).split(/[,\s]+/)) {
        const t = part.trim().toLowerCase();
        if (t) {
          out.add(t);
        }
      }
    } catch (_e) {}
    return out;
  },

  _etldPlus1FromUri(uri) {
    try {
      const { DarkstrNativePersona } = ChromeUtils.importESModule(
        "moz-src:///browser/components/DarkstrNativePersona.sys.mjs"
      );
      return DarkstrNativePersona._etldPlus1FromUri(uri);
    } catch (_e) {
      try {
        if (!uri) {
          return null;
        }
        return Services.eTLD.getBaseDomain(uri);
      } catch (_e2) {
        try {
          return String(uri.host || "").toLowerCase() || null;
        } catch (_e3) {
          return null;
        }
      }
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

  /**
   * Effective seed for synthetic values — mirrors 0030:
   * golden lock (snapshot non-empty OR rotatePerSite=false) → global seed;
   * else sticky per-eTLD+1 via NativePersona._seedForEtld.
   */
  _effectiveSeedForEtld(etld) {
    try {
      const { DarkstrNativePersona } = ChromeUtils.importESModule(
        "moz-src:///browser/components/DarkstrNativePersona.sys.mjs"
      );
      if (DarkstrNativePersona._rotationLocked()) {
        return DarkstrNativePersona._baseSeedU32() >>> 0;
      }
      const plan = DarkstrNativePersona.getPlan?.() || null;
      if (
        plan?.pollutionActive &&
        plan?.nativeHooks &&
        DarkstrNativePersona._rotationWanted()
      ) {
        return DarkstrNativePersona._seedForEtld(etld) >>> 0;
      }
      return DarkstrNativePersona._baseSeedU32() >>> 0;
    } catch (_e) {
      try {
        return Services.prefs.getIntPref(SEED_PREF, 0) >>> 0 || 1;
      } catch (_e2) {
        return 1;
      }
    }
  },

  /**
   * Shared decision for URI / eTLD.
   * @returns {"passthrough"|"sandbox"}
   */
  decisionForEtld(etld, plan) {
    const p = plan || this.getPlan();
    if (!p.armed) {
      return "passthrough";
    }
    if (!etld) {
      return "passthrough";
    }
    if (this._allowlistSet().has(String(etld).toLowerCase())) {
      return "passthrough";
    }
    return "sandbox";
  },

  _writeDiag(etld, seed, decision) {
    try {
      if (etld) {
        Services.prefs.setStringPref(LAST_ETLD_PREF, String(etld));
      }
      if (typeof seed === "number") {
        Services.prefs.setIntPref(LAST_SEED_PREF, seed >>> 0);
      }
      if (decision) {
        Services.prefs.setStringPref(LAST_DECISION_PREF, String(decision));
      }
    } catch (_e) {}
  },

  /**
   * Policy snapshot for a browsing context (child install + Proof diag).
   */
  policyForBrowsingContext(bc) {
    const plan = this.getPlan();
    const etld = this._etldPlus1FromBrowsingContext(bc);
    const decision = this.decisionForEtld(etld, plan);
    const seed =
      decision === "sandbox" ? this._effectiveSeedForEtld(etld) : 0;
    this._writeDiag(etld, seed, decision);
    return {
      armed: !!plan.armed,
      mode: plan.mode,
      etld: etld || "",
      seed: seed >>> 0,
      decision,
    };
  },

  _bucket(etld) {
    if (!this._jar) {
      this._jar = new Map();
    }
    const key = String(etld || "").toLowerCase();
    if (!key) {
      return null;
    }
    if (!this._jar.has(key)) {
      this._jar.set(key, new Map());
    }
    return this._jar.get(key);
  },

  _maybeRewriteValue(plan, seed, name, value) {
    if (plan.mode === "synthetic") {
      return syntheticToken(seed, name);
    }
    return String(value ?? "");
  },

  ingestPair(etld, name, value, plan) {
    const p = plan || this.getPlan();
    if (!p.armed || this.decisionForEtld(etld, p) !== "sandbox") {
      return;
    }
    const bucket = this._bucket(etld);
    if (!bucket || !name) {
      return;
    }
    const seed = this._effectiveSeedForEtld(etld);
    const stored = this._maybeRewriteValue(p, seed, name, value);
    bucket.set(String(name), stored);
    this._writeDiag(etld, seed, "sandbox");
  },

  deletePair(etld, name) {
    const bucket = this._bucket(etld);
    if (!bucket || !name) {
      return;
    }
    bucket.delete(String(name));
  },

  getCookieStringForEtld(etld) {
    const bucket = this._bucket(etld);
    return serializeCookiePairMap(bucket);
  },

  listCookiesForEtld(etld, nameFilter) {
    const bucket = this._bucket(etld);
    if (!bucket) {
      return [];
    }
    const out = [];
    for (const [name, value] of bucket.entries()) {
      if (nameFilter && name !== nameFilter) {
        continue;
      }
      out.push({ name, value });
    }
    return out;
  },

  /** Child: read document.cookie view. */
  getDocumentCookie(bc) {
    const policy = this.policyForBrowsingContext(bc);
    if (policy.decision !== "sandbox") {
      return { policy, cookie: null };
    }
    return {
      policy,
      cookie: this.getCookieStringForEtld(policy.etld),
    };
  },

  /** Child: document.cookie write. */
  setDocumentCookie(bc, raw) {
    const policy = this.policyForBrowsingContext(bc);
    if (policy.decision !== "sandbox") {
      return { policy, ok: false };
    }
    const parsed = parseDocumentCookieWrite(raw);
    if (!parsed) {
      return { policy, ok: false };
    }
    // Max-Age=0 / expires in the past → delete (simple heuristic).
    const lower = String(raw || "").toLowerCase();
    if (
      /max-age\s*=\s*0\b/.test(lower) ||
      /expires\s*=\s*thu,\s*01\s*jan\s*1970/i.test(String(raw || ""))
    ) {
      this.deletePair(policy.etld, parsed.name);
      return { policy, ok: true, deleted: true };
    }
    this.ingestPair(policy.etld, parsed.name, parsed.value, this.getPlan());
    return { policy, ok: true };
  },

  storeGet(bc, name) {
    const policy = this.policyForBrowsingContext(bc);
    if (policy.decision !== "sandbox") {
      return { policy, items: null };
    }
    const items = this.listCookiesForEtld(policy.etld, name || undefined);
    return { policy, items };
  },

  storeSet(bc, name, value) {
    const policy = this.policyForBrowsingContext(bc);
    if (policy.decision !== "sandbox") {
      return { policy, ok: false };
    }
    if (!name) {
      return { policy, ok: false };
    }
    this.ingestPair(policy.etld, name, value, this.getPlan());
    return { policy, ok: true };
  },

  storeDelete(bc, name) {
    const policy = this.policyForBrowsingContext(bc);
    if (policy.decision !== "sandbox") {
      return { policy, ok: false };
    }
    this.deletePair(policy.etld, name);
    return { policy, ok: true };
  },

  recordInstallStatus(detail, _bc) {
    try {
      Services.prefs.setStringPref(
        LAST_INSTALL_PREF,
        JSON.stringify({
          ok: !!detail?.ok,
          event: String(detail?.event || ""),
          status: String(detail?.status || ""),
          ts: Date.now(),
        })
      );
      if (detail?.error) {
        Services.prefs.setStringPref(
          LAST_ERROR_PREF,
          String(detail.error).slice(0, 1000)
        );
      } else {
        Services.prefs.setStringPref(LAST_ERROR_PREF, "");
      }
    } catch (_e) {}
  },

  _channelUri(channel) {
    try {
      return channel.URI || channel.originalURI || null;
    } catch (_e) {
      return null;
    }
  },

  _onHttp(subject, topic) {
    const plan = this.getPlan();
    if (!plan.armed) {
      return;
    }
    let channel = subject;
    try {
      channel = subject.QueryInterface(Ci.nsIHttpChannel);
    } catch (_e) {
      try {
        Services.prefs.setStringPref(
          LAST_COOKIE_ERR_PREF,
          "qi-fail:" + String(_e).slice(0, 200)
        );
      } catch (_e2) {}
      return;
    }
    const uri = this._channelUri(channel);
    const etld = this._etldPlus1FromUri(uri);
    try {
      Services.prefs.setStringPref(LAST_HTTP_TOPIC_PREF, String(topic || ""));
      Services.prefs.setStringPref(LAST_HTTP_ETLD_PREF, String(etld || ""));
    } catch (_e) {}
    const decision = this.decisionForEtld(etld, plan);
    if (decision !== "sandbox") {
      this._writeDiag(etld, 0, decision);
      return;
    }
    const seed = this._effectiveSeedForEtld(etld);
    this._writeDiag(etld, seed, decision);

    if (topic === "http-on-modify-request") {
      const cookie = this.getCookieStringForEtld(etld);
      try {
        Services.prefs.setStringPref(
          LAST_COOKIE_OUT_PREF,
          String(cookie || "").slice(0, 500)
        );
      } catch (_e) {}
      try {
        // Replace outbound Cookie with sandbox view (empty if none).
        channel.setRequestHeader("Cookie", cookie || "", false);
        let verify = "";
        try {
          verify = channel.getRequestHeader("Cookie");
        } catch (_e) {
          verify = "<missing>";
        }
        try {
          Services.prefs.setStringPref(
            LAST_COOKIE_SET_PREF,
            String(verify || "").slice(0, 500)
          );
          Services.prefs.setStringPref(LAST_COOKIE_ERR_PREF, "");
        } catch (_e2) {}
      } catch (e) {
        try {
          Services.prefs.setStringPref(
            LAST_COOKIE_ERR_PREF,
            "set-fail:" + String(e).slice(0, 400)
          );
          Services.prefs.setStringPref(LAST_COOKIE_SET_PREF, "");
        } catch (_e2) {}
      }
      return;
    }

    if (
      topic === "http-on-examine-response" ||
      topic === "http-on-examine-cached-response"
    ) {
      let raw = "";
      try {
        raw = channel.getResponseHeader("Set-Cookie");
      } catch (_e) {
        raw = "";
      }
      if (!raw) {
        return;
      }
      // Multiple Set-Cookie may arrive newline-joined via getResponseHeader.
      const lines = String(raw).split(/\r?\n/);
      for (const line of lines) {
        const parsed = parseSetCookieLine(line);
        if (!parsed) {
          continue;
        }
        const lower = line.toLowerCase();
        if (
          /max-age\s*=\s*0\b/.test(lower) ||
          /expires\s*=\s*thu,\s*01\s*jan\s*1970/i.test(line)
        ) {
          this.deletePair(etld, parsed.name);
          continue;
        }
        this.ingestPair(etld, parsed.name, parsed.value, plan);
      }
      // Strip so primary jar does not accept these (best-effort vs CookieService race).
      try {
        channel.setResponseHeader("Set-Cookie", "", false);
      } catch (_e) {}
    }
  },
};
