/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr 0056 (Fable N6 follow-up): persisted per-site persona seeds.
 *
 * - File: <profile>/darkstr/persona-seeds.json (dir 0700, file 0600). Written
 *   only by the parent process, atomically (tmp file, chmod, rename).
 * - Format v2 (0056r3): { v: 2, l: <OSKeyStore label>, k: <K encrypted by
 *   OSKeyStore>, e: [{ c, h, s }] }
 *     c  HMAC-SHA256(K, "ctx:" + userContextId), hex ("0" = no container).
 *        Private browsing is never written.
 *     h  HMAC-SHA256(K, userContextId + "|" + eTLD+1), hex: per context, so
 *        the file alone does not link one site's entries across containers.
 *     s  u32 persona seed.
 *   No timestamps (a time-range clear resets every non-private seed, so no
 *   activity times are kept). Site names and container numbers are never
 *   written. The context of an entry is recovered by recomputing c for the
 *   known userContextIds (0 .. ContextualIdentityService's last id).
 *   v1 files (plaintext c, h = HMAC(K, eTLD+1), first-seen t) are migrated
 *   lazily during the first v2 session (a v1 entry is adopted when its site is
 *   used) and wiped from disk at the first v2 write.
 *   K is a random 32-byte HMAC key, kept on disk only encrypted with an
 *   OSKeyStore secret (macOS Keychain) under a random per-store label.
 *   OSKeyStore unavailable -> session-only (nothing written, file untouched).
 * - Session map: every (context, site) seed handed out this session, incl.
 *   private browsing (memory only, dropped when the last private context
 *   exits).
 * - Keep rule (clear-on-quit gap): when cookies and site data are cleared on
 *   shutdown (privacy.sanitize.sanitizeOnShutdown +
 *   privacy.clearOnShutdown_v2.cookiesAndStorage, LibreWolf default) only
 *   sites with a persist-data-on-shutdown ALLOW exception are written. A
 *   cookie ACCESS_SESSION permission always wins (never written). Without
 *   clear-on-shutdown every non-private site is written.
 * - Clearing: DarkstrPersonaSeedCleaner (ClearDataService,
 *   CLEAR_FINGERPRINTING_PROTECTION_STATE): site (incl. subdomain hosts, the
 *   seed is per eTLD+1), principal, origin-attributes pattern (container
 *   deletion), any time range (0056r3: every non-private seed in every
 *   context -- over-forgets on purpose, no activity times stored), all (file
 *   + OSKeyStore secret deleted -> next store gets a new key and label).
 *   Clear-Site-Data from a subdomain resets the whole eTLD+1, in the
 *   response's own context only (personas are per eTLD+1 and per context).
 *   In-memory copies in NativePersona / DepthHooks are flushed through the
 *   listeners with a (ctx, site) predicate; a failing listener is logged and
 *   counted in debugState() (flushErrors / lastFlushError), never ignored.
 * - Off mode never calls in here (NativePersona only activates the store
 *   while per-site rotation runs without darkstr.persona.seed). Cleaners may
 *   remove from an existing file in any mode, they never create one.
 */

import { setTimeout, clearTimeout } from "resource://gre/modules/Timer.sys.mjs";

const STORE_DIR = "darkstr";
const STORE_FILE = "persona-seeds.json";
const FORMAT_VERSION = 2;
/** 0056 r1/r2 format (plaintext context, per-site hash, first-seen day). */
const LEGACY_VERSION = 1;
/** Upper bound for userContextIds probed when resolving a context hash. */
const MAX_CTX_PROBE = 4096;
const LABEL_PREFIX = "darkstr-persona-seeds-";
const SAVE_DELAY_MS = 500;
/** Test/ops switch: false = behave as if OSKeyStore were unavailable. */
const KEYSTORE_PREF = "darkstr.persona.seedStore.osKeyStore";
const SANITIZE_ON_SHUTDOWN_PREF = "privacy.sanitize.sanitizeOnShutdown";
const CLEAR_COOKIES_ON_SHUTDOWN_PREF =
  "privacy.clearOnShutdown_v2.cookiesAndStorage";

function isParent() {
  try {
    return (
      Services.appinfo.processType === Ci.nsIXULRuntime.PROCESS_TYPE_DEFAULT
    );
  } catch (_e) {
    return false;
  }
}

function randomBytes(n) {
  return Cc["@mozilla.org/security/random-generator;1"]
    .getService(Ci.nsIRandomGenerator)
    .generateRandomBytes(n);
}

function randomU32() {
  const b = randomBytes(4);
  const v = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  return v || 1;
}

function toHex(bytes) {
  let s = "";
  for (const x of bytes) {
    s += (x & 0xff).toString(16).padStart(2, "0");
  }
  return s;
}

function sha256(bytes) {
  const h = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
  h.init(Ci.nsICryptoHash.SHA256);
  h.update(bytes, bytes.length);
  const raw = h.finish(false);
  const out = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i) & 0xff;
  }
  return out;
}

/** HMAC-SHA256 (RFC 2104), synchronous. key: byte array (32). */
export function hmacSha256Hex(key, message) {
  const B = 64;
  let k = Array.from(key);
  if (k.length > B) {
    k = sha256(k);
  }
  while (k.length < B) {
    k.push(0);
  }
  const msg = Array.from(new TextEncoder().encode(String(message)));
  const inner = sha256(k.map(x => x ^ 0x36).concat(msg));
  return toHex(sha256(k.map(x => x ^ 0x5c).concat(inner)));
}

/** "p" for private browsing, else the userContextId as a string. */
export function contextKeyFromOA(oa) {
  try {
    if (oa && Number(oa.privateBrowsingId) > 0) {
      return "p";
    }
    return String(Number(oa?.userContextId) >>> 0 || 0);
  } catch (_e) {
    return "0";
  }
}

/**
 * 0056r3: the single non-private context a pattern pins (userContextId set,
 * not private), else null.
 */
export function contextOnlyFromPattern(pattern) {
  let p = pattern;
  if (typeof p === "string") {
    try {
      p = p ? JSON.parse(p) : {};
    } catch (_e) {
      p = {};
    }
  }
  p = p || {};
  if (p.userContextId === undefined || p.userContextId === null) {
    return null;
  }
  if (Number(p.privateBrowsingId) > 0) {
    return null;
  }
  return String(Number(p.userContextId) >>> 0);
}

/** Contexts an origin-attributes pattern selects: null = all. */
export function contextFilterFromPattern(pattern) {
  let p = pattern;
  if (typeof p === "string") {
    try {
      p = p ? JSON.parse(p) : {};
    } catch (_e) {
      p = {};
    }
  }
  p = p || {};
  const hasUcid = p.userContextId !== undefined && p.userContextId !== null;
  const hasPb =
    p.privateBrowsingId !== undefined && p.privateBrowsingId !== null;
  return ctx => {
    if (hasPb) {
      const pb = Number(p.privateBrowsingId) > 0;
      if (pb !== (ctx === "p")) {
        return false;
      }
    }
    if (hasUcid && ctx !== "p") {
      return ctx === String(Number(p.userContextId) >>> 0);
    }
    if (hasUcid && ctx === "p") {
      // Private contexts have userContextId 0.
      return Number(p.userContextId) === 0;
    }
    return true;
  };
}

function siteFromHost(host) {
  const h = String(host || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!h) {
    return null;
  }
  try {
    return Services.eTLD.getBaseDomainFromHost(h);
  } catch (_e) {
    return h;
  }
}

export var DarkstrPersonaSeedStore = {
  /** idle | loading | ready | session-only */
  _state: "idle",
  /** True once NativePersona armed the store (clear-only loads stay passive). */
  _activated: false,
  _loadPromise: null,
  /** Session map: "ctx|site" -> { seed, ctx, site } (memory only). */
  _session: new Map(),
  /** Disk entries: "c|h" -> { c, h, s } (c, h: HMACs, see the header). */
  _disk: new Map(),
  /** v1 entries still to adopt this session: "ctx|HMAC(K, site)" -> seed. */
  _legacy: new Map(),
  /** Context hash -> userContextId string (cache, per key). */
  _ctxByHash: new Map(),
  _lastFlushError: "",
  _key: null,
  _label: "",
  _keyCipher: "",
  /** True when the disk entries are unreadable and must not be rewritten. */
  _readOnlyError: false,
  _saveTimer: null,
  _savePromise: null,
  _dirty: false,
  _listeners: new Set(),
  _shutdownBlocker: null,
  _observing: false,
  /** Ops counters for diagnostics / tests (memory only). */
  _stats: {
    reads: 0,
    writes: 0,
    keyGens: 0,
    keyDeletes: 0,
    flushErrors: 0,
    migratedV1: 0,
  },

  get path() {
    return PathUtils.join(PathUtils.profileDir, STORE_DIR, STORE_FILE);
  },

  get dirPath() {
    return PathUtils.join(PathUtils.profileDir, STORE_DIR);
  },

  /** f(predicate|null): predicate(ctx, site) -> bool, null = everything. */
  addFlushListener(fn) {
    this._listeners.add(fn);
  },

  removeFlushListener(fn) {
    this._listeners.delete(fn);
  },

  /**
   * pred(ctx, site) -> bool, or null for everything. Listeners must drop every
   * in-memory copy the predicate selects. 0056r3: a failure is never silent:
   * it is logged and counted (debugState().stats.flushErrors / lastFlushError).
   */
  _notifyFlush(pred) {
    for (const fn of this._listeners) {
      try {
        fn(pred);
      } catch (e) {
        this._stats.flushErrors++;
        try {
          this._lastFlushError = String(e?.stack || e?.message || e).slice(0, 500);
        } catch (_e) {
          this._lastFlushError = "unknown error";
        }
        console.error("darkstr 0056: seed flush listener failed", e);
      }
    }
  },

  _keyStoreAllowed() {
    try {
      return Services.prefs.getBoolPref(KEYSTORE_PREF, true);
    } catch (_e) {
      return true;
    }
  },

  _osKeyStore() {
    return Cc["@mozilla.org/security/oskeystore;1"].getService(
      Ci.nsIOSKeyStore
    );
  },

  /**
   * Start using the store (NativePersona: rotation armed, no fixed seed).
   * Loads the file once per session. Idempotent.
   */
  activate() {
    if (!isParent()) {
      return null;
    }
    this._observe();
    if (!this._activated) {
      this._activated = true;
      if (this._state === "ready") {
        // Loaded earlier by a clear: reconcile now that seeds are handed out.
        this._reconcilePending();
      }
    }
    if (this._state === "idle") {
      this._state = "loading";
      this._loadPromise = this._load().catch(e => {
        console.error("darkstr 0056: persona seed store load failed", e);
        this._state = "session-only";
      });
    }
    return this._loadPromise;
  },

  whenReady() {
    return this._loadPromise || Promise.resolve();
  },

  /**
   * 0056r2: true while the file and key are being loaded (startup). NativePersona
   * holds top-level document loads until this is false (or a short timeout),
   * so a kept site never gets a temporary seed on its first load.
   */
  get loading() {
    return this._state === "loading";
  },

  _observe() {
    if (this._observing) {
      return;
    }
    this._observing = true;
    try {
      Services.obs.addObserver(this, "last-pb-context-exited");
    } catch (_e) {}
    try {
      const { AsyncShutdown } = ChromeUtils.importESModule(
        "resource://gre/modules/AsyncShutdown.sys.mjs"
      );
      this._shutdownBlocker = () => this.flush();
      AsyncShutdown.profileBeforeChange.addBlocker(
        "darkstr 0056: persona seed store",
        this._shutdownBlocker
      );
    } catch (_e) {}
  },

  observe(_subject, topic) {
    if (topic === "last-pb-context-exited") {
      this._dropSession(ctx => ctx === "p");
    }
  },

  async _readFile() {
    if (!(await IOUtils.exists(this.path))) {
      return null;
    }
    this._stats.reads++;
    return IOUtils.readJSON(this.path);
  },

  async _load() {
    let data = null;
    try {
      data = await this._readFile();
    } catch (e) {
      // Corrupt / unreadable: never overwrite blindly (a later save re-keys
      // only when the key is provably gone).
      console.error("darkstr 0056: persona-seeds.json unreadable", e);
      data = { v: -1 };
    }
    const legacy = !!(data && data.v === LEGACY_VERSION && data.l && data.k);
    if (data && (data.v === FORMAT_VERSION || legacy) && data.l && data.k) {
      if (!this._keyStoreAllowed()) {
        this._state = "session-only";
        return;
      }
      let available = false;
      try {
        available = await this._osKeyStore().asyncSecretAvailable(data.l);
      } catch (_e) {
        this._state = "session-only";
        return;
      }
      if (available) {
        try {
          const key = await this._osKeyStore().asyncDecryptBytes(
            data.l,
            data.k
          );
          this._key = Array.from(key);
          this._label = data.l;
          this._keyCipher = data.k;
          for (const e of Array.isArray(data.e) ? data.e : []) {
            if (
              !e ||
              typeof e.c !== "string" ||
              e.c === "p" ||
              !/^[0-9a-f]{64}$/.test(String(e.h)) ||
              !Number.isFinite(Number(e.s))
            ) {
              continue;
            }
            const seed = Number(e.s) >>> 0 || 1;
            if (legacy) {
              // v1: plaintext context, h = HMAC(K, site). Adopted on use.
              this._legacy.set(`${e.c}|${String(e.h)}`, seed);
            } else if (/^[0-9a-f]{64}$/.test(e.c)) {
              this._disk.set(`${e.c}|${e.h}`, { c: e.c, h: String(e.h), s: seed });
            }
          }
          if (legacy) {
            // Rewrite as v2 at the next save (v1 entries leave the disk then;
            // the ones used this session are re-added in v2 form).
            this._dirty = true;
          }
        } catch (e) {
          console.error("darkstr 0056: persona seed key decrypt failed", e);
          this._state = "session-only";
          return;
        }
      }
      // Secret gone (e.g. Keychain item removed): entries are unlinkable;
      // the next save writes a fresh store with a new key.
    } else if (
      data &&
      data.v !== undefined &&
      data.v !== FORMAT_VERSION &&
      data.v !== LEGACY_VERSION
    ) {
      this._readOnlyError = true;
    }
    this._state = "ready";
    if (!this._activated) {
      // Loaded for a clear (any mode): passive, no reconcile / keep-rule save.
      return;
    }
    this._reconcilePending();
    // Keep rule may have changed since the last session (exception removed,
    // crash before shutdown clearing): rewrite if anything is dropped.
    if (this._disk.size && this._applyKeepRuleToDisk()) {
      this._scheduleSave();
    }
    if (this._dirty) {
      this._scheduleSave();
    }
  },

  /**
   * Seeds handed out while loading: a stored seed for the same key wins
   * (persona survives the restart); others are persisted if eligible.
   */
  _reconcilePending() {
    const changed = [];
    for (const [k, rec] of this._session) {
      if (rec.ctx === "p" || !this._key) {
        continue;
      }
      const stored = this._storedSeed(rec.ctx, rec.site);
      if (stored && stored !== rec.seed) {
        rec.seed = stored;
        changed.push(k);
      }
    }
    if (changed.length) {
      const set = new Set(changed);
      this._notifyFlush((ctx, site) => set.has(`${ctx}|${site}`));
    }
    if ([...this._session.values()].some(r => r.ctx !== "p")) {
      this._scheduleSave();
    }
  },

  /** v1 site hash (legacy lookups only). */
  _hash(site) {
    return this._key ? hmacSha256Hex(this._key, site) : "";
  },

  /** v2 context hash: HMAC(K, "ctx:" + userContextId). */
  _ctxHash(ctx) {
    if (!this._key) {
      return "";
    }
    const c = String(ctx);
    const h = hmacSha256Hex(this._key, "ctx:" + c);
    this._ctxByHash.set(h, c);
    return h;
  },

  /** v2 site hash: HMAC(K, userContextId + "|" + eTLD+1). */
  _siteHash(ctx, site) {
    return this._key ? hmacSha256Hex(this._key, `${ctx}|${site}`) : "";
  },

  _diskKey(ctx, site) {
    return `${this._ctxHash(ctx)}|${this._siteHash(ctx, site)}`;
  },

  /** userContextIds that may own disk entries ("0", containers, session). */
  _candidateContexts() {
    const out = new Set(["0"]);
    for (const r of this._session.values()) {
      if (r.ctx !== "p") {
        out.add(r.ctx);
      }
    }
    let last = 0;
    try {
      const { ContextualIdentityService: CIS } = ChromeUtils.importESModule(
        "resource://gre/modules/ContextualIdentityService.sys.mjs"
      );
      try {
        CIS.ensureDataReady?.();
      } catch (_e) {}
      last = Number(CIS._lastUserContextId) >>> 0;
      for (const i of CIS.getPublicIdentities?.() || []) {
        last = Math.max(last, Number(i.userContextId) >>> 0);
      }
    } catch (_e) {}
    last = Math.min(Math.max(last, 32), MAX_CTX_PROBE);
    for (let i = 1; i <= last; i++) {
      out.add(String(i));
    }
    return out;
  },

  /** Context of a disk entry (null when no known userContextId matches). */
  _resolveCtx(cHash) {
    if (this._ctxByHash.has(cHash)) {
      return this._ctxByHash.get(cHash);
    }
    for (const c of this._candidateContexts()) {
      if (this._ctxHash(c) === cHash) {
        return c;
      }
    }
    return null;
  },

  /**
   * Stored seed for (ctx, site): v2 entry, else a v1 entry adopted now (moved
   * into the v2 map). 0 when none.
   */
  _storedSeed(ctx, site) {
    if (!this._key || ctx === "p") {
      return 0;
    }
    const d = this._disk.get(this._diskKey(ctx, site));
    if (d) {
      return d.s;
    }
    if (this._legacy.size) {
      const lk = `${ctx}|${this._hash(site)}`;
      const seed = this._legacy.get(lk);
      if (seed) {
        this._legacy.delete(lk);
        this._stats.migratedV1++;
        const c = this._ctxHash(ctx);
        const h = this._siteHash(ctx, site);
        this._disk.set(`${c}|${h}`, { c, h, s: seed });
        this._dirty = true;
        return seed;
      }
    }
    return 0;
  },

  /** Permission sets for the keep rule (base domains). */
  _keepSets() {
    const keep = new Set();
    const session = new Set();
    try {
      for (const p of Services.perms.getAllByTypes([
        "persist-data-on-shutdown",
      ])) {
        if (p.capability === Ci.nsIPermissionManager.ALLOW_ACTION) {
          const s = siteFromHost(p.principal?.host);
          if (s) {
            keep.add(s);
          }
        }
      }
    } catch (_e) {}
    try {
      for (const p of Services.perms.getAllByTypes(["cookie"])) {
        if (p.capability === Ci.nsICookiePermission.ACCESS_SESSION) {
          const s = siteFromHost(p.principal?.host);
          if (s) {
            session.add(s);
          }
        }
      }
    } catch (_e) {}
    return { keep, session };
  },

  _clearsOnShutdown() {
    try {
      return (
        Services.prefs.getBoolPref(SANITIZE_ON_SHUTDOWN_PREF, false) &&
        Services.prefs.getBoolPref(CLEAR_COOKIES_ON_SHUTDOWN_PREF, false)
      );
    } catch (_e) {
      return true;
    }
  },

  /** Whether a seed for `site` may be written (never for private). */
  keepsSite(ctx, site, sets = this._keepSets()) {
    if (ctx === "p" || !site) {
      return false;
    }
    if (sets.session.has(site)) {
      return false;
    }
    return !this._clearsOnShutdown() || sets.keep.has(site);
  },

  /** Drop disk entries the keep rule no longer allows. Returns true if any. */
  _applyKeepRuleToDisk(sets = this._keepSets()) {
    if (!this._key) {
      return false;
    }
    const clears = this._clearsOnShutdown();
    const perCtx = new Map();
    const hashesFor = ctx => {
      let v = perCtx.get(ctx);
      if (!v) {
        v = {
          keep: new Set([...sets.keep].map(s => this._siteHash(ctx, s))),
          session: new Set([...sets.session].map(s => this._siteHash(ctx, s))),
        };
        perCtx.set(ctx, v);
      }
      return v;
    };
    let dropped = false;
    for (const [k, e] of this._disk) {
      const ctx = this._resolveCtx(e.c);
      if (ctx === null) {
        // Unknown context: cannot prove it is kept.
        if (clears) {
          this._disk.delete(k);
          dropped = true;
        }
        continue;
      }
      const hs = hashesFor(ctx);
      if (hs.session.has(e.h) || (clears && !hs.keep.has(e.h))) {
        this._disk.delete(k);
        dropped = true;
      }
    }
    return dropped;
  },

  /**
   * Seed for (context, eTLD+1). Sync. A stored seed when the store is ready
   * and has one; else a fresh random seed (persisted later if the keep rule
   * allows). Private / session-only / loading: memory only.
   */
  seedFor(ctx, site) {
    const c = String(ctx || "0");
    const s = String(site || "");
    const key = `${c}|${s}`;
    const have = this._session.get(key);
    if (have) {
      return have.seed;
    }
    let rec = null;
    if (c !== "p" && this._state === "ready" && this._key) {
      const stored = this._storedSeed(c, s);
      if (stored) {
        rec = { seed: stored, ctx: c, site: s };
      }
    }
    if (!rec) {
      rec = { seed: randomU32(), ctx: c, site: s };
    }
    this._session.set(key, rec);
    if (c !== "p" && this._state === "ready") {
      this._scheduleSave();
    }
    return rec.seed;
  },

  _scheduleSave() {
    if (this._state !== "ready" || this._readOnlyError) {
      return;
    }
    this._dirty = true;
    if (this._saveTimer) {
      return;
    }
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.flush().catch(e =>
        console.error("darkstr 0056: persona seed store save failed", e)
      );
    }, SAVE_DELAY_MS);
  },

  async flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    while (this._savePromise) {
      await this._savePromise;
    }
    if (!this._dirty || this._state !== "ready") {
      return;
    }
    this._dirty = false;
    this._savePromise = this._save().finally(() => {
      this._savePromise = null;
    });
    await this._savePromise;
  },

  /** Entries that should be on disk now. */
  _collectForDisk(sets) {
    // Session entries first (their plaintext site is known in memory).
    for (const rec of this._session.values()) {
      if (!this.keepsSite(rec.ctx, rec.site, sets)) {
        continue;
      }
      const c = this._ctxHash(rec.ctx);
      const h = this._siteHash(rec.ctx, rec.site);
      const k = `${c}|${h}`;
      if (!this._disk.has(k)) {
        this._disk.set(k, { c, h, s: rec.seed >>> 0 });
      }
    }
    this._applyKeepRuleToDisk(sets);
    return [...this._disk.values()];
  },

  async _ensureKey() {
    if (this._key) {
      return true;
    }
    if (!this._keyStoreAllowed()) {
      return false;
    }
    const label = LABEL_PREFIX + toHex(randomBytes(8));
    const key = randomBytes(32);
    const ks = this._osKeyStore();
    await ks.asyncGenerateSecret(label);
    this._stats.keyGens++;
    const cipher = await ks.asyncEncryptBytes(label, key);
    this._key = Array.from(key);
    this._label = label;
    this._keyCipher = cipher;
    return true;
  },

  async _save() {
    const sets = this._keepSets();
    const wanted = [...this._session.values()].some(r =>
      this.keepsSite(r.ctx, r.site, sets)
    );
    const exists = await IOUtils.exists(this.path);
    if (!this._key) {
      if (!wanted) {
        // Nothing eligible and no store yet: create nothing.
        return;
      }
      try {
        if (!(await this._ensureKey())) {
          this._state = "session-only";
          return;
        }
      } catch (e) {
        console.error("darkstr 0056: OSKeyStore unavailable, seeds are session-only", e);
        this._state = "session-only";
        return;
      }
    }
    const entries = this._collectForDisk(sets);
    if (!exists && !entries.length) {
      return;
    }
    // v1 entries never go back to disk (adopted ones are in _disk already).
    await this._writeAtomic({
      v: FORMAT_VERSION,
      l: this._label,
      k: this._keyCipher,
      e: entries,
    });
  },

  async _writeAtomic(obj) {
    if (!isParent()) {
      throw new Error("darkstr 0056: persona seed store is parent-only");
    }
    await IOUtils.makeDirectory(this.dirPath, {
      ignoreExisting: true,
      createAncestors: false,
      permissions: 0o700,
    });
    try {
      await IOUtils.setPermissions(this.dirPath, 0o700);
    } catch (_e) {}
    const tmp = this.path + ".tmp";
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    await IOUtils.write(tmp, bytes, { mode: "overwrite", flush: true });
    await IOUtils.setPermissions(tmp, 0o600);
    await IOUtils.move(tmp, this.path, { noOverwrite: false });
    this._stats.writes++;
  },

  // ---------------------------------------------------------------------
  // Clearing (DarkstrPersonaSeedCleaner). Never creates a store.
  // ---------------------------------------------------------------------

  /** Load the key from an existing file without activating (off mode). */
  async _ensureLoadedForClear() {
    if (this._state === "loading") {
      await this._loadPromise;
    }
    if (this._state === "ready" || this._state === "session-only") {
      return;
    }
    if (!(await IOUtils.exists(this.path))) {
      return;
    }
    // A clear in any mode must reach the disk entries.
    this._state = "loading";
    this._loadPromise = this._load().catch(() => {
      this._state = "session-only";
    });
    await this._loadPromise;
  },

  /** pred(ctx, site): the same predicate the flush listeners get. */
  _dropSession(pred) {
    let any = false;
    for (const [k, rec] of this._session) {
      if (pred(rec.ctx, rec.site)) {
        this._session.delete(k);
        any = true;
      }
    }
    this._notifyFlush(pred);
    return any;
  },

  async _rewriteAfterClear(diskChanged) {
    if (!diskChanged) {
      return;
    }
    if (this._state !== "ready" || !this._key || this._readOnlyError) {
      return;
    }
    if (!(await IOUtils.exists(this.path))) {
      return;
    }
    this._dirty = true;
    await this.flush();
  },

  /**
   * Context of a disk entry for a clear: `only` (a pinned userContextId) or
   * the resolved context; null = not selected / unknown.
   */
  _entryCtx(e, only) {
    if (only !== null && only !== undefined) {
      return e.c === this._ctxHash(only) ? String(only) : null;
    }
    return this._resolveCtx(e.c);
  },

  /**
   * site: host or eTLD+1 (cleared as its eTLD+1). ctxFilter(ctx) selects
   * contexts; `only` = the one userContextId it pins (null = any).
   */
  async clearSite(site, ctxFilter, only = null) {
    const s = siteFromHost(site);
    if (!s) {
      return;
    }
    const accept = ctxFilter || (() => true);
    this._dropSession((ctx, st) => st === s && accept(ctx));
    await this._ensureLoadedForClear();
    if (this._key) {
      let changed = false;
      for (const [k, e] of this._disk) {
        const ctx = this._entryCtx(e, only);
        if (ctx !== null && accept(ctx) && e.h === this._siteHash(ctx, s)) {
          this._disk.delete(k);
          changed = true;
        }
      }
      const oldH = this._legacy.size ? this._hash(s) : "";
      for (const k of [...this._legacy.keys()]) {
        const i = k.indexOf("|");
        if (k.slice(i + 1) === oldH && accept(k.slice(0, i))) {
          this._legacy.delete(k);
        }
      }
      await this._rewriteAfterClear(changed);
    }
  },

  async clearContexts(ctxFilter, only = null) {
    this._dropSession(ctx => ctxFilter(ctx));
    await this._ensureLoadedForClear();
    let changed = false;
    for (const [k, e] of this._disk) {
      const ctx = this._entryCtx(e, only);
      // Unpinned patterns select contexts independently of the id (all
      // non-private), so an unresolved entry is judged as a non-private one.
      const hit =
        only !== null && only !== undefined
          ? ctx !== null
          : ctxFilter(ctx === null ? "0" : ctx);
      if (hit) {
        this._disk.delete(k);
        changed = true;
      }
    }
    for (const k of [...this._legacy.keys()]) {
      if (ctxFilter(k.slice(0, k.indexOf("|")))) {
        this._legacy.delete(k);
      }
    }
    await this._rewriteAfterClear(changed);
  },

  /**
   * 0056r3: any time range (Clear Recent History) resets every non-private
   * seed in every context (no activity times are stored, so a range cannot be
   * matched; over-forgetting is the safe direction). The key is kept (only
   * clear-all rotates it). In-memory copies are flushed like a site clear.
   */
  async clearRange(_fromUs, _toUs) {
    this._dropSession(ctx => ctx !== "p");
    await this._ensureLoadedForClear();
    const changed = this._disk.size > 0 || this._legacy.size > 0;
    this._disk.clear();
    this._legacy.clear();
    await this._rewriteAfterClear(changed);
  },

  /** Everything, with key rotation: file and OSKeyStore secret deleted. */
  async clearAll() {
    if (this._state === "loading") {
      await this._loadPromise;
    }
    while (this._savePromise) {
      await this._savePromise;
    }
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._dirty = false;
    this._session.clear();
    this._disk.clear();
    this._legacy.clear();
    this._ctxByHash.clear();
    this._notifyFlush(null);
    let label = this._label;
    if (!label) {
      try {
        const data = await this._readFile();
        label = data?.l || "";
      } catch (_e) {}
    }
    try {
      await IOUtils.remove(this.path, { ignoreAbsent: true });
      await IOUtils.remove(this.path + ".tmp", { ignoreAbsent: true });
    } catch (e) {
      console.error("darkstr 0056: persona-seeds.json remove failed", e);
    }
    if (label && this._keyStoreAllowed()) {
      try {
        await this._osKeyStore().asyncDeleteSecret(label);
        this._stats.keyDeletes++;
      } catch (_e) {}
    }
    this._key = null;
    this._label = "";
    this._keyCipher = "";
    this._readOnlyError = false;
    this._ctxByHash.clear();
    if (this._state === "session-only" || this._state === "ready") {
      // Next eligible seed creates a new store (new key and label).
      this._state = this._keyStoreAllowed() ? "ready" : "session-only";
    }
  },

  /** Diagnostics for tests (no site names). */
  debugState() {
    return {
      state: this._state,
      session: this._session.size,
      sessionPrivate: [...this._session.values()].filter(r => r.ctx === "p")
        .length,
      disk: this._disk.size,
      legacy: this._legacy.size,
      hasKey: !!this._key,
      label: this._label,
      lastFlushError: this._lastFlushError,
      stats: { ...this._stats },
    };
  },

  /** Tests only: forget all in-memory state (does not touch disk). */
  _resetForTests() {
    this._state = "idle";
    this._activated = false;
    this._loadPromise = null;
    this._session.clear();
    this._disk.clear();
    this._legacy.clear();
    this._ctxByHash.clear();
    this._key = null;
    this._label = "";
    this._keyCipher = "";
    this._readOnlyError = false;
    this._dirty = false;
    this._lastFlushError = "";
    for (const k of Object.keys(this._stats)) {
      this._stats[k] = 0;
    }
  },
};

/**
 * ClearDataService cleaner (CLEAR_FINGERPRINTING_PROTECTION_STATE).
 */
export var DarkstrPersonaSeedCleaner = {
  async deleteAll() {
    await DarkstrPersonaSeedStore.clearAll();
  },

  async deleteByPrincipal(aPrincipal) {
    const host = aPrincipal?.host;
    if (!host) {
      return;
    }
    const ctx = contextKeyFromOA(aPrincipal.originAttributes);
    await DarkstrPersonaSeedStore.clearSite(
      host,
      c => c === ctx,
      ctx === "p" ? null : ctx
    );
  },

  async deleteBySite(aSchemelessSite, aOriginAttributesPattern) {
    await DarkstrPersonaSeedStore.clearSite(
      aSchemelessSite,
      contextFilterFromPattern(aOriginAttributesPattern),
      contextOnlyFromPattern(aOriginAttributesPattern)
    );
  },

  async deleteByHost(aHost, aOriginAttributesPattern) {
    await DarkstrPersonaSeedStore.clearSite(
      aHost,
      contextFilterFromPattern(aOriginAttributesPattern),
      contextOnlyFromPattern(aOriginAttributesPattern)
    );
  },

  async deleteByRange(aFrom, aTo) {
    await DarkstrPersonaSeedStore.clearRange(aFrom, aTo);
  },

  async deleteByOriginAttributes(aOriginAttributesString) {
    await DarkstrPersonaSeedStore.clearContexts(
      contextFilterFromPattern(aOriginAttributesString),
      contextOnlyFromPattern(aOriginAttributesString)
    );
  },
};
