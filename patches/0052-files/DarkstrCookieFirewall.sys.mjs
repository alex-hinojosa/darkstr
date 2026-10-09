/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr Phase 5 — Cookie firewall (chrome JS). Pins 0035 / 0042 / 0048.
 *
 * Train pin: Firefox / LibreWolf 156.0.1-1 (FIREFOX_156_0_1_RELEASE).
 * Brand: darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.
 *
 * Product (see docs/COOKIE-SANDBOX-FAKE-JAR.md):
 *   One in-memory sandbox jar in the parent process is the single source of
 *   truth for the HTTP Cookie request header, HTTP Set-Cookie, document.cookie
 *   and the window Cookie Store API.
 *
 * 0048 jar model (replaces the 0035 eTLD+1 → name → value map):
 *   - Partitioned like Gecko Total Cookie Protection: jar key =
 *     (userContextId, privateBrowsingId, top-level site). A cookie lives in
 *     the partition of the top-level site it was set under and is
 *     domain/path matched against the request (or document) host, so the
 *     effective key is (top site, request site). The same third party under
 *     two different top sites sees two unrelated jars.
 *   - Full cookie records: Domain / host-only, Path, Secure, HttpOnly,
 *     SameSite, Expires / Max-Age, __Secure- / __Host- prefixes, size limit.
 *     HttpOnly values never reach a content process (document.cookie and
 *     CookieStore cannot see or overwrite them).
 *   - Credentials: channels flagged LOAD_ANONYMOUS (fetch credentials 'omit',
 *     'same-origin' cross-origin, COEP, CORS preflight) get no sandbox Cookie
 *     header and do not ingest Set-Cookie — same rule as nsHttpChannel.
 *   - Script surfaces: the child installs on EVERY new document before page
 *     script (DOMWindowCreated, plus DOMDocElementInserted for documents that
 *     reuse an initial about:blank inner window), hydrates with one sync IPC,
 *     and receives per-cookie deltas so the mirror stays live.
 *   - Synthetic tokens are computed once at write time and stored, so HTTP
 *     and script always see the identical value.
 *
 * Why not Gecko's CookieService with a darkstr OriginAttributes partition:
 *   from chrome JS the service only offers add()/getCookiesFromHost() keyed by
 *   OriginAttributes; the request-header path (CookieService::
 *   GetCookieStringFromHttp) and document.cookie (CookieServiceChild cache)
 *   always use the channel / document OriginAttributes, and cookies added
 *   there are persisted to cookies.sqlite and collected by session restore.
 *   Routing them through a custom partition needs C++ changes in
 *   netwerk/cookie + IPC; 0048 keeps the jar in JS instead.
 *
 * Gates (default-off — idle unless explicitly armed):
 *   pollution_active = mode=="pollution" && !nativeCompatible
 *   armed = pollution_active && darkstr.nativePersonaHooks
 *           && darkstr.cookieFirewall.enabled
 * Homogeneous / Native-Compatible / hooks false / enabled false → passthrough
 * (real jar unchanged; no document.cookie / CookieStore / header mutation;
 * the JSWindowActor is not even registered until the first arm).
 *
 * Modes:
 *   synthetic (default when enabled) — values rewritten to seed-tied
 *     synthetic tokens (0030 eTLD+1 seed of the top-level site when
 *     rotatePerSite; global seed under golden lock). The top-level site and
 *     the cookie's own site are always mixed in, so no two partitions share a
 *     token (no cross-site linkability, even under the golden lock).
 *   isolate — sandbox stores accepted values as-is. While armed, web content
 *     cookies are kept out of the primary profile jar: Set-Cookie is stripped
 *     in http-on-examine-response (which nsHttpChannel::ProcessResponse runs
 *     before SetCookieHeaders), the outbound Cookie header is replaced from the
 *     sandbox, and document.cookie / window.cookieStore are hooked on every
 *     document with an http(s) principal (including about:blank, srcdoc and
 *     blob: documents) before page script runs.
 *     Residual (not covered): ServiceWorkerGlobalScope.cookieStore goes
 *     straight to Gecko's CookieStoreParent; allowlisted top sites use the
 *     real jar by design.
 *
 * Allowlist: darkstr.cookieFirewall.allowlist CSV of top-level eTLD+1 → real
 * jar passthrough for that page and everything it loads.
 *
 * 0048r2 (Proof F1–F3 + check 4):
 *   - Buckets per top-level site follow Gecko Total Cookie Protection + CHIPS
 *     exactly: "u" (unpartitioned, first-party), "p" (partition key
 *     (scheme,top): CHIPS cookies of first parties and every cookie of a
 *     cross-site frame) and "pf" (partition key (scheme,top,f): a document
 *     same-site with top but under a cross-site ancestor, A-B-A). A
 *     first-party context reads u+p, a cross-site context reads p, an A-B-A
 *     context reads pf, so a cross-site frame never gets the top site's
 *     first-party cookies (F2). Like stock (network.cookie.cookieBehavior.
 *     optInPartitioning), a cross-site context may only set cookies that
 *     carry the Partitioned attribute (check 4); Partitioned needs Secure.
 *     SameSite is enforced against the initiator, the requesting document
 *     and every ancestor up to the top.
 *   - Ordering (F1): http-on-examine-response suspends the channel until every
 *     content process that can see the new cookie has acked the delta
 *     (sendQuery), so the response cannot reach the page before its
 *     document.cookie / CookieStore mirror holds the cookie.
 *   - Native gate (F3): while armed, the static pref
 *     darkstr.cookieFirewall.contentGate (default-branch only, never
 *     persisted) makes CookieCommons::CheckGlobalAndRetrieveCookiePrincipals
 *     (document.cookie getter/setter from any realm, document.open'ed
 *     documents, about:blank/srcdoc, window and worker CookieStore) and
 *     CookieStoreNotifier refuse the real cookie store unless the content
 *     child answered "passthrough" (allowlist) for that inner window.
 *
 * Soft residual (0042): outbound Cookie on content fetch was empty under 0035
 * because http-on-modify-request subject was used without QI to nsIHttpChannel
 * and setRequestHeader failures were swallowed. Pin: QI + surface set errors.
 * Not anti-detect.
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
const LAST_PARTITION_PREF = "darkstr.cookieFirewall.lastPartition";
const LAST_INSTALL_PREF = "darkstr.cookieFirewall.lastInstall";
const LAST_ERROR_PREF = "darkstr.cookieFirewall.lastError";
const LAST_HTTP_TOPIC_PREF = "darkstr.cookieFirewall.lastHttpTopic";
const LAST_HTTP_ETLD_PREF = "darkstr.cookieFirewall.lastHttpEtld";
const LAST_COOKIE_OUT_PREF = "darkstr.cookieFirewall.lastCookieOut";
const LAST_COOKIE_SET_PREF = "darkstr.cookieFirewall.lastCookieSet";
const LAST_COOKIE_ERR_PREF = "darkstr.cookieFirewall.lastCookieErr";

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

const SNAPSHOT_PREF = "darkstr.persona.snapshot";
const SEED_PREF = "darkstr.persona.seed";
const ROTATE_PER_SITE_PREF = "darkstr.persona.rotatePerSite";

const LAX_BY_DEFAULT_PREF = "network.cookie.sameSite.laxByDefault";
const OPT_IN_PARTITIONING_PREF = "network.cookie.cookieBehavior.optInPartitioning";
/** 0048r2 F3: C++ gate (StaticPrefList.yaml, default false). Default branch only. */
const CONTENT_GATE_PREF = "darkstr.cookieFirewall.contentGate";
/** 0048r2 F1: longest a response waits for content caches to ack a delta. */
const DELTA_ACK_TIMEOUT_MS = 2000;
const NONE_REQUIRES_SECURE_PREF = "network.cookie.sameSite.noneRequiresSecure";

const ACTOR_NAME = "DarkstrCookieFirewall";
const MSG_INSTALL = "DarkstrCookieFirewall:Install";
const MSG_DELTA = "DarkstrCookieFirewall:Delta";
const MSG_REINSTALL = "DarkstrCookieFirewall:Reinstall";

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

const HTTP_TOPICS = [
  "http-on-modify-request",
  "http-on-examine-response",
  "http-on-examine-cached-response",
  "http-on-examine-merged-response",
];

// ---------------------------------------------------------------------------
// Pure cookie-jar core. No XPCOM at module top level: shared by the parent
// module, the content-process child actor and the node tests.
// ---------------------------------------------------------------------------

const MAX_NAME_VALUE_BYTES = 4096;
const MAX_COOKIES_PER_HOST = 180;
const SECURE_PREFIX = "__secure-";
const HOST_PREFIX = "__host-";

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

/**
 * Synthetic value for a cookie. Always mixes the top-level site and the
 * cookie's own site into the seed, so the same cookie name never yields the
 * same token in two partitions — even under the golden lock, where the
 * persona seed is global.
 */
function syntheticValue(partitionSeed, topBase, cookieBase, name) {
  const top = String(topBase || "").toLowerCase();
  const own = String(cookieBase || "").toLowerCase() || top;
  return syntheticToken(mixU32(mixU32(partitionSeed >>> 0, top), own), name);
}

function normalizeHost(host) {
  let h = String(host || "").trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) {
    h = h.slice(1, -1);
  }
  while (h.endsWith(".")) {
    h = h.slice(0, -1);
  }
  return h;
}

function isIpHost(host) {
  const h = normalizeHost(host);
  return h.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
}

function isLoopbackHost(host) {
  const h = normalizeHost(host);
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "::1" ||
    /^127(\.\d{1,3}){3}$/.test(h)
  );
}

/** Potentially trustworthy origin for Secure cookies (https/wss or loopback). */
function isSecureOrigin(scheme, host) {
  const s = String(scheme || "").toLowerCase();
  return s === "https" || s === "wss" || isLoopbackHost(host);
}

function domainMatch(host, domain) {
  const h = normalizeHost(host);
  const d = normalizeHost(domain);
  if (!h || !d) {
    return false;
  }
  if (h === d) {
    return true;
  }
  if (isIpHost(h)) {
    return false;
  }
  return h.endsWith("." + d);
}

function pathMatch(requestPath, cookiePath) {
  const r = String(requestPath || "/");
  const c = String(cookiePath || "/");
  if (r === c) {
    return true;
  }
  if (!r.startsWith(c)) {
    return false;
  }
  return c.endsWith("/") || r.charAt(c.length) === "/";
}

function defaultPath(uriPath) {
  const p = String(uriPath || "");
  if (!p.startsWith("/")) {
    return "/";
  }
  const q = p.split(/[?#]/)[0];
  const idx = q.lastIndexOf("/");
  if (idx <= 0) {
    return "/";
  }
  return q.slice(0, idx);
}

function parseCookieDate(text) {
  const t = Date.parse(String(text || "").trim());
  return Number.isFinite(t) ? t : null;
}

/**
 * Parse one Set-Cookie line / document.cookie assignment (RFC 6265bis §5.6).
 * @returns {null|{name:string,value:string,attrs:object}}
 */
function parseSetCookie(line) {
  const raw = String(line ?? "");
  if (/[\x00-\x08\x0a-\x1f\x7f]/.test(raw)) {
    return null;
  }
  const parts = raw.split(";");
  const nv = parts.shift();
  let name;
  let value;
  const eq = nv.indexOf("=");
  if (eq < 0) {
    name = "";
    value = nv.trim();
  } else {
    name = nv.slice(0, eq).trim();
    value = nv.slice(eq + 1).trim();
  }
  if (!name && !value) {
    return null;
  }
  const attrs = {
    expires: null,
    maxAge: null,
    domain: null,
    path: null,
    secure: false,
    httpOnly: false,
    sameSite: "unset",
    partitioned: false,
  };
  for (const part of parts) {
    const p = part.trim();
    if (!p) {
      continue;
    }
    const i = p.indexOf("=");
    const key = (i < 0 ? p : p.slice(0, i)).trim().toLowerCase();
    const val = i < 0 ? "" : p.slice(i + 1).trim();
    if (val.length > 1024) {
      continue;
    }
    switch (key) {
      case "expires": {
        const t = parseCookieDate(val);
        if (t !== null) {
          attrs.expires = t;
        }
        break;
      }
      case "max-age":
        if (/^-?\d+$/.test(val)) {
          attrs.maxAge = parseInt(val, 10);
        }
        break;
      case "domain":
        if (val) {
          attrs.domain = normalizeHost(val.replace(/^\./, ""));
        }
        break;
      case "path":
        attrs.path = val.startsWith("/") ? val : null;
        break;
      case "secure":
        attrs.secure = true;
        break;
      case "httponly":
        attrs.httpOnly = true;
        break;
      case "partitioned":
        attrs.partitioned = true;
        break;
      case "samesite": {
        const v = val.toLowerCase();
        attrs.sameSite =
          v === "strict" || v === "lax" || v === "none" ? v : "unset";
        break;
      }
      default:
        break;
    }
  }
  return { name, value, attrs };
}

function cookieKey(rec) {
  return `${rec.name}\u0000${rec.host}\u0000${rec.path}`;
}

function effectiveSameSite(rec, env) {
  if (rec.sameSite === "unset") {
    return env?.laxByDefault ? "lax" : "none";
  }
  return rec.sameSite;
}

function isExpired(rec, now) {
  return rec.expiry !== null && rec.expiry !== undefined && rec.expiry <= now;
}

/**
 * Validate a parsed cookie for a given setting context and build a record.
 * ctx: { host, path, secure, fromHttp, crossSite, topLevelNav, now }
 * env: { isPublicSuffix(domain), laxByDefault, noneRequiresSecure }
 * @returns {{ok:boolean, reason?:string, record?:object, deletion?:boolean}}
 */
function buildRecord(parsed, ctx, env = {}) {
  if (!parsed) {
    return { ok: false, reason: "parse" };
  }
  const now = ctx.now ?? Date.now();
  const host = normalizeHost(ctx.host);
  const { name, value, attrs } = parsed;
  if (!host) {
    return { ok: false, reason: "no-host" };
  }
  if (name.length + value.length > MAX_NAME_VALUE_BYTES) {
    return { ok: false, reason: "size" };
  }
  if (attrs.httpOnly && !ctx.fromHttp) {
    return { ok: false, reason: "httponly-from-script" };
  }
  if (attrs.secure && !ctx.secure) {
    return { ok: false, reason: "secure-from-insecure" };
  }
  if (attrs.partitioned && !attrs.secure) {
    // CHIPS: Partitioned requires Secure (Gecko rejects it otherwise).
    return { ok: false, reason: "partitioned-requires-secure" };
  }
  let cookieHost = host;
  let hostOnly = true;
  if (attrs.domain) {
    const d = attrs.domain;
    let publicSuffix = false;
    try {
      publicSuffix = !!env.isPublicSuffix?.(d);
    } catch (_e) {}
    if (publicSuffix) {
      if (d !== host) {
        return { ok: false, reason: "domain-public-suffix" };
      }
    } else if (!domainMatch(host, d)) {
      return { ok: false, reason: "domain-mismatch" };
    } else if (isIpHost(host) && d !== host) {
      return { ok: false, reason: "domain-ip" };
    } else {
      cookieHost = d;
      hostOnly = false;
    }
  }
  const path = attrs.path || defaultPath(ctx.path);
  const lname = name.toLowerCase();
  if (lname.startsWith(SECURE_PREFIX) && !(attrs.secure && ctx.secure)) {
    return { ok: false, reason: "secure-prefix" };
  }
  if (
    lname.startsWith(HOST_PREFIX) &&
    !(attrs.secure && ctx.secure && !attrs.domain && path === "/")
  ) {
    return { ok: false, reason: "host-prefix" };
  }
  const sameSite = attrs.sameSite;
  if (sameSite === "none" && env.noneRequiresSecure && !attrs.secure) {
    return { ok: false, reason: "samesite-none-insecure" };
  }
  const eff = effectiveSameSite({ sameSite }, env);
  if (ctx.crossSite && eff !== "none") {
    // RFC 6265bis: SameSite cookies are not set from cross-site subresources
    // or from script in a cross-site context; top-level navigations may set.
    if (!ctx.fromHttp || !ctx.topLevelNav) {
      return { ok: false, reason: "samesite-cross-site" };
    }
  }
  let expiry = null;
  if (attrs.maxAge !== null) {
    expiry = attrs.maxAge <= 0 ? 0 : now + attrs.maxAge * 1000;
  } else if (attrs.expires !== null) {
    expiry = attrs.expires;
  }
  const record = {
    name,
    value,
    host: cookieHost,
    hostOnly,
    path,
    secure: !!attrs.secure,
    httpOnly: !!attrs.httpOnly,
    sameSite,
    partitioned: !!attrs.partitioned,
    expiry,
    creation: 0,
  };
  return { ok: true, record, deletion: expiry !== null && expiry <= now };
}

/**
 * Apply a built record to a cookie map (cookieKey → record).
 * opts: { fromHttp, secureOrigin, now, seq }
 * @returns {{changed:boolean, reason?:string, deletedKey?:string, record?:object, evicted?:string[]}}
 */
function applyRecord(map, built, opts = {}) {
  if (!built?.ok) {
    return { changed: false, reason: built?.reason || "invalid" };
  }
  const rec = built.record;
  const key = cookieKey(rec);
  const existing = map.get(key);
  if (existing && existing.httpOnly && !opts.fromHttp) {
    return { changed: false, reason: "httponly-protected" };
  }
  if (!opts.secureOrigin && !rec.secure) {
    // "Leave secure cookies alone": insecure origins cannot shadow them.
    for (const other of map.values()) {
      if (
        other.secure &&
        other.name === rec.name &&
        (domainMatch(rec.host, other.host) || domainMatch(other.host, rec.host)) &&
        pathMatch(rec.path, other.path)
      ) {
        return { changed: false, reason: "secure-protected" };
      }
    }
  }
  if (built.deletion) {
    if (!existing) {
      return { changed: false, reason: "nothing-to-delete" };
    }
    map.delete(key);
    return { changed: true, deletedKey: key };
  }
  rec.creation = existing ? existing.creation : opts.seq ?? Date.now();
  map.set(key, rec);
  const evicted = [];
  const sameHost = [...map.values()].filter((r) => r.host === rec.host);
  if (sameHost.length > MAX_COOKIES_PER_HOST) {
    sameHost.sort((a, b) => a.creation - b.creation);
    for (const victim of sameHost.slice(0, sameHost.length - MAX_COOKIES_PER_HOST)) {
      const k = cookieKey(victim);
      map.delete(k);
      evicted.push(k);
    }
  }
  return { changed: true, record: rec, evicted };
}

function compareForSerialization(a, b) {
  if (b.path.length !== a.path.length) {
    return b.path.length - a.path.length;
  }
  return a.creation - b.creation;
}

function hostMatchesRecord(host, rec) {
  return rec.hostOnly ? normalizeHost(host) === rec.host : domainMatch(host, rec.host);
}

/**
 * Cookies to send on an HTTP request.
 * req: { host, path, secure, crossSite, topLevelNav, safeMethod, now }
 */
function matchForRequest(map, req, env = {}) {
  const now = req.now ?? Date.now();
  const out = [];
  for (const rec of map?.values?.() || []) {
    if (rec.stub || isExpired(rec, now)) {
      continue;
    }
    if (!hostMatchesRecord(req.host, rec) || !pathMatch(req.path, rec.path)) {
      continue;
    }
    if (rec.secure && !req.secure) {
      continue;
    }
    if (req.crossSite) {
      const eff = effectiveSameSite(rec, env);
      if (eff === "strict") {
        continue;
      }
      if (eff === "lax" && !(req.topLevelNav && req.safeMethod)) {
        continue;
      }
    }
    out.push(rec);
  }
  return out.sort(compareForSerialization);
}

/**
 * Cookies visible to document.cookie / CookieStore (never HttpOnly).
 * doc: { host, path, secure, crossSite, now }
 */
function matchForScript(map, doc, env = {}) {
  const now = doc.now ?? Date.now();
  const out = [];
  for (const rec of map?.values?.() || []) {
    if (rec.stub || rec.httpOnly || isExpired(rec, now)) {
      continue;
    }
    if (!hostMatchesRecord(doc.host, rec) || !pathMatch(doc.path, rec.path)) {
      continue;
    }
    if (rec.secure && !doc.secure) {
      continue;
    }
    if (doc.crossSite && effectiveSameSite(rec, env) !== "none") {
      continue;
    }
    out.push(rec);
  }
  return out.sort(compareForSerialization);
}

function serializeCookies(recs) {
  return (recs || [])
    .map((r) => (r.name === "" ? r.value : `${r.name}=${r.value}`))
    .join("; ");
}

/** Copy safe to hand to a content process: HttpOnly values never leave the parent. */
function sanitizeForChild(rec) {
  if (rec.httpOnly) {
    return {
      name: rec.name,
      value: "",
      host: rec.host,
      hostOnly: rec.hostOnly,
      path: rec.path,
      secure: rec.secure,
      httpOnly: true,
      sameSite: rec.sameSite,
      expiry: rec.expiry,
      creation: rec.creation,
      stub: true,
    };
  }
  return { ...rec, stub: false };
}

// ---- 0048r2: Gecko TCP / CHIPS bucket model -------------------------------
//
// jarKey  = "<oa>|<scheme>://<top eTLD+1>"         (the top-level site)
// bucket  = jarKey            unpartitioned first-party jar ("u")
//         | jarKey + "|p"     partition key (scheme,top)
//         | jarKey + "|pf"    partition key (scheme,top,f) — A-B-A
// kind    = "1p"  document same-site with top, no cross-site ancestor
//         | "3p"  document cross-site with top
//         | "3pf" document same-site with top under a cross-site ancestor

const KIND_1P = "1p";
const KIND_3P = "3p";
const KIND_3PF = "3pf";

/**
 * Classify a context from eTLD+1s. `self` is the document (or the request
 * target of a subdocument load); `ancestors` are the bases of every ancestor
 * document up to and including the top.
 */
function classifyContext(selfBase, ancestorBases, topBase) {
  const self = String(selfBase || "");
  const top = String(topBase || "");
  if (self !== top) {
    return KIND_3P;
  }
  for (const a of ancestorBases || []) {
    if (a && a !== top) {
      return KIND_3PF;
    }
  }
  return KIND_1P;
}

/** Buckets a context of `kind` reads, most specific last. */
function readBucketsFor(jarKey, kind) {
  if (kind === KIND_3PF) {
    return [jarKey + "|pf"];
  }
  if (kind === KIND_3P) {
    return [jarKey + "|p"];
  }
  return [jarKey, jarKey + "|p"];
}

/**
 * Bucket a cookie set from a context of `kind` lands in, or null when stock
 * Gecko rejects it (cross-site context, no Partitioned attribute, with
 * network.cookie.cookieBehavior.optInPartitioning — LibreWolf default).
 */
function writeBucketFor(jarKey, kind, partitioned, optInPartitioning = true) {
  if (kind === KIND_1P) {
    return partitioned ? jarKey + "|p" : jarKey;
  }
  const part = kind === KIND_3PF ? jarKey + "|pf" : jarKey + "|p";
  if (partitioned || !optInPartitioning) {
    return part;
  }
  return null;
}

/** Tag mixed into synthetic values so the same cookie differs per bucket. */
function bucketTag(bucketKey) {
  const s = String(bucketKey || "");
  if (s.endsWith("|pf")) {
    return "|pf";
  }
  if (s.endsWith("|p")) {
    return "|p";
  }
  return "";
}

/** Read-only union of several cookie maps (for matchFor*). */
function unionMaps(maps) {
  const list = (maps || []).filter(Boolean);
  return {
    values() {
      const out = [];
      for (const m of list) {
        for (const r of m.values()) {
          out.push(r);
        }
      }
      return out;
    },
  };
}

function parsePartitionKey(pk) {
  const s = String(pk || "");
  if (!s) {
    return null;
  }
  if (!s.startsWith("(")) {
    return { scheme: "", host: normalizeHost(s) };
  }
  if (!s.endsWith(")")) {
    return null;
  }
  const fields = s.slice(1, -1).split(",");
  if (fields.length < 2 || !fields[0] || !fields[1]) {
    return null;
  }
  return {
    scheme: fields[0].toLowerCase(),
    host: normalizeHost(fields[1]),
    foreignAncestor: fields.slice(2).includes("f"),
  };
}

export const DarkstrCookieCore = Object.freeze({
  mixU32,
  syntheticToken,
  syntheticValue,
  normalizeHost,
  isIpHost,
  isLoopbackHost,
  isSecureOrigin,
  domainMatch,
  pathMatch,
  defaultPath,
  parseSetCookie,
  cookieKey,
  effectiveSameSite,
  isExpired,
  buildRecord,
  applyRecord,
  matchForRequest,
  matchForScript,
  serializeCookies,
  sanitizeForChild,
  hostMatchesRecord,
  parsePartitionKey,
  classifyContext,
  readBucketsFor,
  writeBucketFor,
  bucketTag,
  unionMaps,
  KIND_1P,
  KIND_3P,
  KIND_3PF,
  MAX_COOKIES_PER_HOST,
});

// ---------------------------------------------------------------------------
// Parent-process firewall.
// ---------------------------------------------------------------------------

function readBoolPref(name, fallback) {
  try {
    return Services.prefs.getBoolPref(name, fallback);
  } catch (_e) {
    return fallback;
  }
}

export var DarkstrCookieFirewall = {
  /** 0052: in-memory diagnostics (what used to be darkstr.*.last* prefs). */
  getDiagnostics() {
    return diagPrefs.snapshot();
  },

  _inited: false,
  _actorRegistered: false,
  _observer: null,
  _httpObserver: null,
  _pbObserver: null,
  _syncListener: null,
  _armed: false,
  _seq: 0,
  /** @type {Map<string, Map<string, object>>} jarKey → cookieKey → record */
  _jar: null,
  /** Live parent actors (one per WindowGlobal) that installed hooks. */
  _liveActors: null,
  /** F1 diag: responses held for content acks / acks that timed out. */
  _ackStats: { held: 0, timeouts: 0 },

  init() {
    if (this._inited) {
      return;
    }
    this._inited = true;
    this._jar = new Map();
    this._liveActors = new Set();
    this._observer = this._observePref.bind(this);
    for (const p of PREFS_TO_OBSERVE) {
      try {
        Services.prefs.addObserver(p, this._observer);
      } catch (_e) {}
    }
    this._syncListener = {
      receiveMessage: (message) => {
        try {
          return this._onSyncInstall(message);
        } catch (e) {
          console.error("darkstr 0048: cookie install IPC failed", e);
          return { decision: "passthrough", error: String(e) };
        }
      },
    };
    try {
      Services.ppmm.addMessageListener(MSG_INSTALL, this._syncListener);
    } catch (_e) {}
    this._pbObserver = {
      observe: () => this._dropPrivateJars(),
    };
    try {
      Services.obs.addObserver(this._pbObserver, "last-pb-context-exited");
    } catch (_e) {}
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
    try {
      Services.ppmm.removeMessageListener(MSG_INSTALL, this._syncListener);
    } catch (_e) {}
    this._syncListener = null;
    try {
      Services.obs.removeObserver(this._pbObserver, "last-pb-context-exited");
    } catch (_e) {}
    this._pbObserver = null;
    this._teardownHttpObserver();
    if (this._actorRegistered) {
      try {
        ChromeUtils.unregisterWindowActor(ACTOR_NAME);
      } catch (_e) {}
      this._actorRegistered = false;
    }
    if (this._jar) {
      this._jar.clear();
    }
    this._liveActors?.clear();
    this._setArmed(false);
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
            "moz-src:///browser/components/DarkstrCookieFirewallParent.sys.mjs",
        },
        child: {
          esModuleURI:
            "moz-src:///browser/components/DarkstrCookieFirewallChild.sys.mjs",
          events: {
            DOMWindowCreated: {},
            // Same-origin navigation of an initial about:blank reuses the
            // inner window: no second DOMWindowCreated, so hook here too.
            DOMDocElementInserted: {},
            pageshow: {},
          },
        },
        // No `matches`: about:blank / srcdoc / blob: documents inherit an
        // http(s) principal and must be hooked too. The child filters on
        // document principal before any IPC.
        allFrames: true,
        messageManagerGroups: ["browsers"],
        safeForUntrustedWebProcess: true,
      });
      this._actorRegistered = true;
    } catch (e) {
      console.error(
        "darkstr 0048: CookieFirewall JSWindowActor register failed:",
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
          console.error("darkstr 0048: cookie HTTP observer failed", e);
        }
      },
    };
    for (const t of HTTP_TOPICS) {
      try {
        Services.obs.addObserver(this._httpObserver, t);
      } catch (_e) {}
    }
  },

  _teardownHttpObserver() {
    if (!this._httpObserver) {
      return;
    }
    for (const t of HTTP_TOPICS) {
      try {
        Services.obs.removeObserver(this._httpObserver, t);
      } catch (_e) {}
    }
    this._httpObserver = null;
  },

  /**
   * @returns {{pollutionActive:boolean,nativeHooks:boolean,enabled:boolean,armed:boolean,mode:string}}
   */
  getPlan() {
    let mode = "homogeneous";
    try {
      mode = Services.prefs.getStringPref(MODE_PREF, "homogeneous");
    } catch (_e) {}
    if (mode !== "pollution" && mode !== "homogeneous") {
      mode = "homogeneous";
    }
    const nativeCompatible = readBoolPref(NATIVE_PREF, false);
    const nativeHooks = readBoolPref(HOOKS_PREF, false);
    const enabled = readBoolPref(ENABLED_PREF, false);
    let cfMode = "synthetic";
    try {
      cfMode = Services.prefs.getStringPref(CF_MODE_PREF, "synthetic");
    } catch (_e) {}
    if (cfMode !== "isolate" && cfMode !== "synthetic") {
      cfMode = "synthetic";
    }
    const pollutionActive = mode === "pollution" && !nativeCompatible;
    const armed = !!(pollutionActive && nativeHooks && enabled);
    return { pollutionActive, nativeHooks, enabled, armed, mode: cfMode };
  },

  refreshPlan() {
    const plan = this.getPlan();
    const wasArmed = this._armed;
    const prevMode = this._lastMode;
    this._lastMode = plan.mode;
    this._setArmed(plan.armed);
    if (plan.armed) {
      this._registerActor();
    }
    if (prevMode && prevMode !== plan.mode && this._jar) {
      // Mode switch: values were written under the other mode.
      this._jar.clear();
    }
    if (this._actorRegistered && (plan.armed || wasArmed)) {
      this._reinstallAllDocuments();
    }
    return plan;
  },

  _setArmed(armed) {
    this._armed = !!armed;
    try {
      diagPrefs.setBoolPref(ARMED_PREF, this._armed);
    } catch (_e) {}
    this._setContentGate(this._armed);
    if (!this._armed && this._jar) {
      // Idle: drop sandbox so a later arm starts clean. Real jar untouched.
      this._jar.clear();
    }
  },

  /**
   * 0048r2 F3: flip the C++ cookie gate. Default branch only, so it is never
   * written to prefs.js (a disarmed profile starts with the static default
   * false) and every content process receives it through the normal pref
   * broadcast. A stray user value is cleared so defaults stay inert.
   */
  _setContentGate(on) {
    try {
      if (Services.prefs.prefHasUserValue?.(CONTENT_GATE_PREF)) {
        Services.prefs.clearUserPref(CONTENT_GATE_PREF);
      }
    } catch (_e) {}
    try {
      Services.prefs.getDefaultBranch("").setBoolPref(CONTENT_GATE_PREF, !!on);
    } catch (_e) {}
  },

  /** Ask every live document to (re)install or uninstall its hooks. */
  _reinstallAllDocuments() {
    const seen = new Set();
    const send = (wg) => {
      if (!wg || seen.has(wg) || wg.isInProcess) {
        return;
      }
      seen.add(wg);
      try {
        wg.getActor(ACTOR_NAME).sendAsyncMessage(MSG_REINSTALL, {});
      } catch (_e) {}
    };
    for (const actor of this._liveActors || []) {
      try {
        send(actor.manager);
      } catch (_e) {}
    }
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

  _env(oa) {
    const pb = Number(oa?.privateBrowsingId || 0) > 0;
    return {
      laxByDefault: readBoolPref(LAX_BY_DEFAULT_PREF, false),
      noneRequiresSecure: readBoolPref(NONE_REQUIRES_SECURE_PREF, true),
      // Stock: unpartitioned cookies from a cross-site context are rejected.
      optInPartitioning:
        readBoolPref(OPT_IN_PARTITIONING_PREF, false) ||
        (pb && readBoolPref(OPT_IN_PARTITIONING_PREF + "_pbmode", false)),
      isPublicSuffix: (d) => this._isPublicSuffix(d),
    };
  },

  _isPublicSuffix(domain) {
    const d = normalizeHost(domain);
    if (!d || isIpHost(d) || !d.includes(".")) {
      return !d.includes(".") && d !== "localhost" && !isIpHost(d);
    }
    try {
      return Services.eTLD.getPublicSuffixFromHost(d) === d;
    } catch (_e) {
      return false;
    }
  },

  /** eTLD+1 of a host; IP / localhost / unknown suffix fall back to the host. */
  _baseOfHost(host) {
    const h = normalizeHost(host);
    if (!h || isIpHost(h)) {
      return h || null;
    }
    try {
      return Services.eTLD.getBaseDomainFromHost(h).toLowerCase();
    } catch (_e) {
      return h;
    }
  },

  _siteFromUri(uri) {
    try {
      if (!uri) {
        return null;
      }
      const scheme = String(uri.scheme || "").toLowerCase();
      if (scheme !== "http" && scheme !== "https") {
        return null;
      }
      const host = normalizeHost(uri.asciiHost || uri.host);
      if (!host) {
        return null;
      }
      let path = "/";
      try {
        path = String(uri.pathQueryRef || "/").split(/[?#]/)[0] || "/";
      } catch (_e) {}
      return { scheme, host, base: this._baseOfHost(host), path };
    } catch (_e) {
      return null;
    }
  },

  _siteFromPrincipal(principal) {
    try {
      if (!principal || !principal.isContentPrincipal) {
        return null;
      }
      return this._siteFromUri(principal.URI);
    } catch (_e) {
      return null;
    }
  },

  /** Kept for 0035 callers / Proof diag: eTLD+1 of a URI. */
  _etldPlus1FromUri(uri) {
    return this._siteFromUri(uri)?.base || null;
  },

  _oaKey(oa) {
    const u = Number(oa?.userContextId || 0) >>> 0;
    const p = Number(oa?.privateBrowsingId || 0) >>> 0;
    return `${u}.${p}`;
  },

  _jarKey(oaKey, top) {
    return `${oaKey}|${top.scheme}://${top.base}`;
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
   * Shared decision for a top-level site (eTLD+1). Same for HTTP and script.
   * @returns {"passthrough"|"sandbox"}
   */
  decisionForEtld(etld, plan) {
    const p = plan || this.getPlan();
    if (!p.armed || !etld) {
      return "passthrough";
    }
    if (this._allowlistSet().has(String(etld).toLowerCase())) {
      return "passthrough";
    }
    return "sandbox";
  },

  _writeDiag(etld, seed, decision, jarKey) {
    try {
      if (etld) {
        diagPrefs.setStringPref(LAST_ETLD_PREF, String(etld));
      }
      if (typeof seed === "number") {
        diagPrefs.setIntPref(LAST_SEED_PREF, seed >>> 0);
      }
      if (decision) {
        diagPrefs.setStringPref(LAST_DECISION_PREF, String(decision));
      }
      if (jarKey) {
        diagPrefs.setStringPref(LAST_PARTITION_PREF, String(jarKey));
      }
    } catch (_e) {}
  },

  _bucket(jarKey, create) {
    if (!this._jar) {
      this._jar = new Map();
    }
    let b = this._jar.get(jarKey);
    if (!b && create) {
      b = new Map();
      this._jar.set(jarKey, b);
    }
    return b || null;
  },

  _purgeExpired(bucket, now) {
    if (!bucket) {
      return;
    }
    for (const [k, rec] of bucket) {
      if (isExpired(rec, now)) {
        bucket.delete(k);
      }
    }
  },

  _dropPrivateJars() {
    if (!this._jar) {
      return;
    }
    for (const key of [...this._jar.keys()]) {
      const oa = key.split("|")[0];
      if (!oa.endsWith(".0")) {
        this._jar.delete(key);
      }
    }
  },

  /** eTLD+1 of every document from `bc` up to the top (http(s) only). */
  _ancestorBases(bc) {
    const out = [];
    for (let c = bc; c; c = c.parent) {
      let s = null;
      try {
        s = this._siteFromPrincipal(c.currentWindowGlobal?.documentPrincipal);
      } catch (_e) {}
      if (s) {
        out.push(s.base);
      }
    }
    return out;
  },

  /**
   * Document context for a WindowGlobalParent (child install, document.cookie
   * writes). Uses the document's own principal and the top-level document's
   * principal — never URLs supplied by the content process.
   */
  documentContext(wgp, plan) {
    const p = plan || this.getPlan();
    const out = { decision: "passthrough", armed: !!p.armed, mode: p.mode };
    if (!wgp || !p.armed) {
      return out;
    }
    const docPrincipal = wgp.documentPrincipal;
    const doc = this._siteFromPrincipal(docPrincipal);
    if (!doc) {
      return out;
    }
    // http(s) documents use their own URL path; about:blank / srcdoc / blob:
    // keep the path of the principal URI they inherited (Gecko cookie URI).
    try {
      const uri = wgp.documentURI;
      if (uri?.schemeIs?.("http") || uri?.schemeIs?.("https")) {
        doc.path = String(uri.pathQueryRef || "/").split(/[?#]/)[0] || "/";
      }
    } catch (_e) {}
    const bc = wgp.browsingContext;
    let topWG = wgp;
    let crossSite = false;
    if (bc && bc.top && bc.top !== bc) {
      topWG = bc.top.currentWindowGlobal;
    }
    const top = this._siteFromPrincipal(topWG?.documentPrincipal);
    if (!top) {
      return out;
    }
    const ancestors = this._ancestorBases(bc?.parent);
    const kind = classifyContext(doc.base, ancestors, top.base);
    // SameSite for script: any cross-site frame in the chain (Gecko
    // site-for-cookies) makes Lax/Strict cookies invisible.
    crossSite = kind !== KIND_1P;
    const decision = this.decisionForEtld(top.base, p);
    out.decision = decision;
    out.etld = top.base;
    out.topBase = top.base;
    out.docHost = doc.host;
    out.docBase = doc.base;
    out.docPath = doc.path;
    out.secure = isSecureOrigin(doc.scheme, doc.host);
    out.crossSite = crossSite;
    out.kind = kind;
    if (decision !== "sandbox") {
      return out;
    }
    const oaKey = this._oaKey(docPrincipal.originAttributes);
    out.jarKey = this._jarKey(oaKey, top);
    out.readKeys = readBucketsFor(out.jarKey, kind);
    out.cacheKeys = out.readKeys.map((k) => `${k}#${doc.host}`);
    // Legacy single key (diag / Proof scripts): the bucket a plain cookie
    // set by this document lands in, else its partition.
    out.cacheKey = out.cacheKeys[0];
    out.seed = this._effectiveSeedForEtld(top.base) >>> 0;
    const env = this._env(docPrincipal.originAttributes);
    out.laxByDefault = env.laxByDefault;
    out.noneRequiresSecure = env.noneRequiresSecure;
    out.optInPartitioning = env.optInPartitioning;
    this._writeDiag(top.base, out.seed, decision, out.jarKey);
    return out;
  },

  /**
   * Records visible to a content process for one document host, per bucket
   * the document reads: { "<bucketKey>#<host>": [records] }.
   */
  snapshotForContext(ctx) {
    const now = Date.now();
    const out = {};
    for (const key of ctx.readKeys || []) {
      const bucket = this._bucket(key, false);
      this._purgeExpired(bucket, now);
      const recs = [];
      for (const rec of bucket?.values() || []) {
        if (hostMatchesRecord(ctx.docHost, rec)) {
          recs.push(sanitizeForChild(rec));
        }
      }
      out[`${key}#${ctx.docHost}`] = recs;
    }
    return out;
  },

  _onSyncInstall(message) {
    const id = message?.data?.innerWindowId;
    const wgp = id ? WindowGlobalParent.getByInnerWindowId(id) : null;
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
        return { decision: "passthrough", error: "pid-mismatch" };
      }
    } catch (_e) {}
    return this.installForWindowGlobal(wgp);
  },

  /** Child install (sync via ppmm, or async fallback via the actor). */
  installForWindowGlobal(wgp) {
    const ctx = this.documentContext(wgp);
    let actor = null;
    try {
      actor = wgp.getActor(ACTOR_NAME);
    } catch (_e) {}
    if (ctx.decision !== "sandbox") {
      if (actor) {
        this._liveActors.delete(actor);
      }
      return ctx;
    }
    if (actor) {
      actor._darkstrCtx = ctx;
      this._liveActors.add(actor);
    }
    const buckets = this.snapshotForContext(ctx);
    return { ...ctx, buckets, records: Object.values(buckets).flat() };
  },

  forgetActor(actor) {
    this._liveActors?.delete(actor);
  },

  /**
   * Deliver changes to every live document whose bucket + host can see them.
   * One message per actor. With `ack`, uses sendQuery and returns the ack
   * promises (F1: the HTTP response waits on them); otherwise async.
   * changes: [{ bucketKey, rec, deleted }]
   */
  _flushDeltas(changes, opts = {}) {
    const acks = [];
    if (!changes?.length) {
      return acks;
    }
    const targets = new Set(this._liveActors || []);
    for (const a of opts.extraActors || []) {
      targets.add(a);
    }
    for (const actor of targets) {
      const c = actor?._darkstrCtx;
      if (!c?.readKeys) {
        continue;
      }
      const byKey = new Map();
      for (const ch of changes) {
        if (!c.readKeys.includes(ch.bucketKey) || !hostMatchesRecord(c.docHost, ch.rec)) {
          continue;
        }
        const cacheKey = `${ch.bucketKey}#${c.docHost}`;
        let d = byKey.get(cacheKey);
        if (!d) {
          d = { cacheKey, upserts: [], deletes: [] };
          byKey.set(cacheKey, d);
        }
        if (ch.deleted) {
          d.deletes.push(cookieKey(ch.rec));
        } else {
          d.upserts.push(sanitizeForChild(ch.rec));
        }
      }
      if (!byKey.size) {
        continue;
      }
      const data = { batch: [...byKey.values()] };
      try {
        if (opts.ack && typeof actor.sendQuery === "function") {
          acks.push(Promise.resolve(actor.sendQuery(MSG_DELTA, data)).catch(() => null));
        } else {
          actor.sendAsyncMessage(MSG_DELTA, data);
        }
      } catch (_e) {
        this._liveActors?.delete(actor);
      }
    }
    return acks;
  },

  /** Back-compat single change push (async). */
  _pushDelta(bucketKey, rec, deleted) {
    return this._flushDeltas([{ bucketKey, rec, deleted }]);
  },

  /**
   * Apply to a bucket. Changes go to `sink` when given (caller flushes),
   * otherwise they are pushed asynchronously at once.
   */
  _store(bucketKey, built, opts, sink = null) {
    const bucket = this._bucket(bucketKey, true);
    const before = built?.ok ? bucket.get(cookieKey(built.record)) : null;
    const res = applyRecord(bucket, built, { ...opts, seq: ++this._seq });
    if (!res.changed) {
      return res;
    }
    const changes = [];
    if (res.deletedKey) {
      changes.push({ bucketKey, rec: before || built.record, deleted: true });
    } else {
      changes.push({ bucketKey, rec: res.record, deleted: false });
      for (const k of res.evicted || []) {
        const [name, host, path] = k.split("\u0000");
        changes.push({ bucketKey, rec: { name, host, path, hostOnly: false }, deleted: true });
      }
    }
    if (sink) {
      sink.push(...changes);
    } else {
      this._flushDeltas(changes);
    }
    return res;
  },

  /** Synthetic token; `bucketKey` keeps u-bucket tokens unchanged vs 0048. */
  _syntheticFor(ctxSeed, topBase, rec, bucketKey = "") {
    return syntheticValue(
      ctxSeed,
      String(topBase || "") + bucketTag(bucketKey),
      this._baseOfHost(rec.host),
      rec.name
    );
  },

  /** Child: document.cookie / CookieStore write (raw cookie string). */
  setDocumentCookie(wgp, raw) {
    const plan = this.getPlan();
    const ctx = this.documentContext(wgp, plan);
    if (ctx.decision !== "sandbox") {
      return { ok: false, decision: ctx.decision };
    }
    const now = Date.now();
    const built = buildRecord(
      parseSetCookie(String(raw ?? "")),
      {
        host: ctx.docHost,
        path: ctx.docPath,
        secure: ctx.secure,
        fromHttp: false,
        crossSite: ctx.crossSite,
        topLevelNav: false,
        now,
      },
      this._env()
    );
    if (!built.ok) {
      return { ok: false, reason: built.reason };
    }
    const bucketKey = writeBucketFor(
      ctx.jarKey,
      ctx.kind,
      built.record.partitioned,
      ctx.optInPartitioning
    );
    if (!bucketKey) {
      return { ok: false, reason: "third-party-unpartitioned" };
    }
    if (plan.mode === "synthetic" && !built.deletion) {
      built.record.value = this._syntheticFor(ctx.seed, ctx.topBase, built.record, bucketKey);
    }
    const res = this._store(bucketKey, built, {
      fromHttp: false,
      secureOrigin: ctx.secure,
      now,
    });
    return { ok: !!res.changed, reason: res.reason || "" };
  },

  /** Diag / 0035 compat: cookie string the given document would read. */
  getDocumentCookie(wgp) {
    const ctx = this.documentContext(wgp);
    if (ctx.decision !== "sandbox") {
      return { policy: ctx, cookie: null };
    }
    const recs = matchForScript(
      unionMaps(ctx.readKeys.map((k) => this._bucket(k, false))),
      {
        host: ctx.docHost,
        path: ctx.docPath,
        secure: ctx.secure,
        crossSite: ctx.crossSite,
      },
      this._env()
    );
    return { policy: ctx, cookie: serializeCookies(recs) };
  },

  /** 0035 compat for Proof diag scripts: policy of a browsing context. */
  policyForBrowsingContext(bc) {
    const ctx = this.documentContext(bc?.currentWindowGlobal);
    return {
      armed: !!ctx.armed,
      mode: ctx.mode,
      etld: ctx.etld || "",
      seed: (ctx.seed || 0) >>> 0,
      decision: ctx.decision,
      partition: ctx.jarKey || "",
    };
  },

  recordInstallStatus(detail, _bc) {
    try {
      diagPrefs.setStringPref(
        LAST_INSTALL_PREF,
        JSON.stringify({
          ok: !!detail?.ok,
          event: String(detail?.event || ""),
          status: String(detail?.status || ""),
          ts: Date.now(),
        })
      );
      if (detail?.error) {
        diagPrefs.setStringPref(
          LAST_ERROR_PREF,
          String(detail.error).slice(0, 1000)
        );
      } else {
        diagPrefs.setStringPref(LAST_ERROR_PREF, "");
      }
    } catch (_e) {}
  },

  /**
   * HTTP context of a channel (0048r2): request site, top-level site, the
   * Gecko partition the request uses (kind → buckets), SameSite cross-site
   * flag against initiator + context chain, credentials mode.
   *
   *   top-level document  → 1p; cross-site iff the initiator is
   *   subdocument         → kind of the new document (target vs the chain of
   *                          embedders; loadInfo.browsingContext is the parent)
   *   subresource         → context document (loadingPrincipal) + its
   *                          ancestors: 1p context & target same-site with top
   *                          → 1p; 1p context & cross-site target → 3p
   *                          (partition of top); 3p / 3pf context → its own
   *                          partition, whatever the target (no top-level
   *                          cookies from a cross-site context — F2)
   *   no browsing context → cookieJarSettings.partitionKey (+ ",f") and the
   *                          loading principal (service / shared workers)
   */
  _channelContext(channel, plan) {
    let li = null;
    try {
      li = channel.loadInfo;
    } catch (_e) {}
    if (!li) {
      return null;
    }
    const req = this._siteFromUri(channel.URI);
    if (!req) {
      return null;
    }
    let type = 0;
    try {
      type = li.externalContentPolicyType;
    } catch (_e) {}
    const isTopDoc = type === Ci.nsIContentPolicy.TYPE_DOCUMENT;
    const isSubDoc = type === Ci.nsIContentPolicy.TYPE_SUBDOCUMENT;
    let bc = null;
    try {
      bc = li.browsingContext;
    } catch (_e) {}
    if (!isTopDoc && !bc) {
      // Chrome / system loads (updates, safe browsing, chaff) are not web
      // content: leave them to Gecko.
      try {
        if (
          li.loadingPrincipal?.isSystemPrincipal ||
          (!li.loadingPrincipal && li.triggeringPrincipal?.isSystemPrincipal)
        ) {
          return null;
        }
      } catch (_e) {}
    }
    let initiator = null;
    try {
      initiator = this._siteFromPrincipal(li.triggeringPrincipal);
    } catch (_e) {}
    let top = null;
    let kind = KIND_1P;
    // Sites whose cross-siteness with the target makes the request
    // cross-site for SameSite (Gecko site-for-cookies + initiator).
    const chain = [];
    if (initiator) {
      chain.push(initiator.base);
    }
    if (isTopDoc) {
      top = req;
    } else {
      try {
        top = this._siteFromPrincipal(bc?.top?.currentWindowGlobal?.documentPrincipal);
      } catch (_e) {}
      let pk = null;
      try {
        pk = parsePartitionKey(li.cookieJarSettings?.partitionKey);
      } catch (_e) {}
      if (!top && pk?.host) {
        top = {
          scheme: pk.scheme || req.scheme,
          host: pk.host,
          base: this._baseOfHost(pk.host),
        };
      }
      let context = null;
      try {
        context = this._siteFromPrincipal(li.loadingPrincipal);
      } catch (_e) {}
      if (!context && bc) {
        try {
          context = this._siteFromPrincipal(bc.currentWindowGlobal?.documentPrincipal);
        } catch (_e) {}
      }
      if (!context && !bc) {
        context = initiator;
      }
      if (!top) {
        top = context || req;
      }
      if (isSubDoc) {
        // New document `req` embedded by bc's document (and its ancestors).
        const ancestors = bc ? this._ancestorBases(bc) : context ? [context.base] : [];
        if (!ancestors.length || ancestors[ancestors.length - 1] !== top.base) {
          ancestors.push(top.base);
        }
        kind = classifyContext(req.base, ancestors, top.base);
        chain.push(...ancestors);
      } else {
        let ctxKind;
        if (bc) {
          const ancestors = this._ancestorBases(bc.parent);
          if (!ancestors.length || ancestors[ancestors.length - 1] !== top.base) {
            ancestors.push(top.base);
          }
          ctxKind = classifyContext((context || top).base, ancestors, top.base);
          chain.push(...ancestors);
        } else if (pk?.foreignAncestor) {
          ctxKind = KIND_3PF;
          chain.push(top.base);
        } else {
          ctxKind = (context || top).base === top.base ? KIND_1P : KIND_3P;
          chain.push(top.base);
        }
        if (context) {
          chain.push(context.base);
        }
        if (ctxKind === KIND_1P) {
          kind = req.base === top.base ? KIND_1P : KIND_3P;
        } else {
          kind = ctxKind;
        }
      }
    }
    const crossSite = chain.some((b) => b && b !== req.base);
    const decision = this.decisionForEtld(top.base, plan);
    let oa = null;
    try {
      oa = li.originAttributes;
    } catch (_e) {}
    let method = "GET";
    try {
      method = String(channel.requestMethod || "GET").toUpperCase();
    } catch (_e) {}
    let anonymous = false;
    try {
      anonymous = !!(channel.loadFlags & Ci.nsIRequest.LOAD_ANONYMOUS);
    } catch (_e) {}
    const jarKey = this._jarKey(this._oaKey(oa), top);
    return {
      decision,
      req,
      top,
      kind,
      crossSite,
      topLevelNav: isTopDoc,
      safeMethod: method === "GET" || method === "HEAD",
      secure: isSecureOrigin(req.scheme, req.host),
      anonymous,
      oa,
      bc,
      isDocumentLoad: isTopDoc || isSubDoc,
      jarKey,
      readKeys: readBucketsFor(jarKey, kind),
    };
  },

  /**
   * Live actor of the document that issued a subresource request, with a
   * context, so the F1 ack also covers a document whose install raced
   * actor registration.
   */
  _requesterActor(ctx) {
    if (!ctx?.bc || ctx.isDocumentLoad) {
      return null;
    }
    try {
      const wgp = ctx.bc.currentWindowGlobal;
      if (!wgp) {
        return null;
      }
      const actor = wgp.getActor(ACTOR_NAME);
      if (!actor) {
        return null;
      }
      if (!actor._darkstrCtx) {
        const dctx = this.documentContext(wgp);
        if (dctx.decision !== "sandbox") {
          return null;
        }
        actor._darkstrCtx = dctx;
        this._liveActors?.add(actor);
      }
      return actor;
    } catch (_e) {
      return null;
    }
  },

  /**
   * F1: hold the response (examine-* observers run before the channel
   * delivers OnStartRequest to the content process) until every content
   * cache that can see the change acked it, or DELTA_ACK_TIMEOUT_MS.
   */
  _holdUntilAcked(channel, acks) {
    if (!acks?.length) {
      return false;
    }
    let suspended = false;
    try {
      channel.suspend();
      suspended = true;
    } catch (_e) {
      return false;
    }
    let done = false;
    let timer = null;
    this._ackStats.held++;
    const resume = (timedOut) => {
      if (done) {
        return;
      }
      done = true;
      if (timedOut === true) {
        this._ackStats.timeouts++;
      }
      try {
        timer?.cancel?.();
      } catch (_e) {}
      if (suspended) {
        try {
          channel.resume();
        } catch (_e) {}
      }
    };
    try {
      if (typeof Cc !== "undefined" && Ci.nsITimer) {
        timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
        timer.initWithCallback(() => resume(true), DELTA_ACK_TIMEOUT_MS, Ci.nsITimer.TYPE_ONE_SHOT);
      } else {
        timer = { t: setTimeout(() => resume(true), DELTA_ACK_TIMEOUT_MS) };
        timer.cancel = () => clearTimeout(timer.t);
      }
    } catch (_e) {}
    Promise.allSettled(acks).then(() => resume(false), () => resume(false));
    return true;
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
        diagPrefs.setStringPref(
          LAST_COOKIE_ERR_PREF,
          "qi-fail:" + String(_e).slice(0, 200)
        );
      } catch (_e2) {}
      return;
    }
    const ctx = this._channelContext(channel, plan);
    if (!ctx) {
      return;
    }
    try {
      diagPrefs.setStringPref(LAST_HTTP_TOPIC_PREF, String(topic || ""));
      diagPrefs.setStringPref(LAST_HTTP_ETLD_PREF, String(ctx.req.base || ""));
    } catch (_e) {}
    if (ctx.decision !== "sandbox") {
      this._writeDiag(ctx.top.base, 0, ctx.decision, null);
      return;
    }
    const env = this._env(ctx.oa);

    if (topic === "http-on-modify-request") {
      if (ctx.anonymous) {
        // credentials 'omit' / anonymous: Gecko adds no Cookie; neither do we.
        try {
          diagPrefs.setStringPref(LAST_COOKIE_OUT_PREF, "<anonymous>");
        } catch (_e) {}
        return;
      }
      const now = Date.now();
      const buckets = ctx.readKeys.map((k) => {
        const b = this._bucket(k, false);
        this._purgeExpired(b, now);
        return b;
      });
      const cookie = serializeCookies(
        matchForRequest(
          unionMaps(buckets),
          {
            host: ctx.req.host,
            path: ctx.req.path,
            secure: ctx.secure,
            crossSite: ctx.crossSite,
            topLevelNav: ctx.topLevelNav,
            safeMethod: ctx.safeMethod,
            now,
          },
          env
        )
      );
      this._writeDiag(ctx.top.base, undefined, "sandbox", ctx.readKeys.join(","));
      try {
        diagPrefs.setStringPref(LAST_COOKIE_OUT_PREF, cookie.slice(0, 500));
      } catch (_e) {}
      try {
        // Replace outbound Cookie with the sandbox view (empty if none) so
        // the primary jar never leaks into an armed request.
        channel.setRequestHeader("Cookie", cookie, false);
        let verify = "";
        try {
          verify = channel.getRequestHeader("Cookie");
        } catch (_e) {
          verify = "";
        }
        try {
          diagPrefs.setStringPref(
            LAST_COOKIE_SET_PREF,
            String(verify || "").slice(0, 500)
          );
          diagPrefs.setStringPref(LAST_COOKIE_ERR_PREF, "");
        } catch (_e2) {}
      } catch (e) {
        try {
          diagPrefs.setStringPref(
            LAST_COOKIE_ERR_PREF,
            "set-fail:" + String(e).slice(0, 400)
          );
          diagPrefs.setStringPref(LAST_COOKIE_SET_PREF, "");
        } catch (_e2) {}
      }
      return;
    }

    if (!HTTP_TOPICS.includes(topic)) {
      return;
    }
    let raw = "";
    try {
      raw = channel.getResponseHeader("Set-Cookie");
    } catch (_e) {
      raw = "";
    }
    if (!raw) {
      return;
    }
    // Always strip so the primary jar never accepts these (examine-response
    // runs before nsHttpChannel::SetCookieHeaders).
    try {
      channel.setResponseHeader("Set-Cookie", "", false);
    } catch (_e) {}
    if (ctx.anonymous) {
      // Fetch spec: credentials 'omit' responses must not set cookies.
      return;
    }
    const now = Date.now();
    const seed = plan.mode === "synthetic" ? this._effectiveSeedForEtld(ctx.top.base) : 0;
    const sink = [];
    for (const line of String(raw).split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      const built = buildRecord(
        parseSetCookie(line),
        {
          host: ctx.req.host,
          path: ctx.req.path,
          secure: ctx.secure,
          fromHttp: true,
          crossSite: ctx.crossSite,
          topLevelNav: ctx.topLevelNav,
          now,
        },
        env
      );
      if (!built.ok) {
        continue;
      }
      const bucketKey = writeBucketFor(
        ctx.jarKey,
        ctx.kind,
        built.record.partitioned,
        env.optInPartitioning
      );
      if (!bucketKey) {
        // Stock (optInPartitioning): third-party cookie without Partitioned.
        continue;
      }
      if (plan.mode === "synthetic" && !built.deletion) {
        built.record.value = this._syntheticFor(seed, ctx.top.base, built.record, bucketKey);
      }
      this._store(bucketKey, built, { fromHttp: true, secureOrigin: ctx.secure, now }, sink);
    }
    if (sink.length) {
      const requester = this._requesterActor(ctx);
      const acks = this._flushDeltas(sink, {
        ack: true,
        extraActors: requester ? [requester] : [],
      });
      this._holdUntilAcked(channel, acks);
    }
    this._writeDiag(ctx.top.base, seed, "sandbox", ctx.jarKey);
  },
};
