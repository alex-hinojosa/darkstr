/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr Phase 5 — Cookie firewall JSWindowActor child. Pins 0035 / 0048.
 * Brand: darkstr — not official LibreWolf.
 *
 * One actor instance per WindowGlobal. On DOMWindowCreated, and on
 * DOMDocElementInserted for a document that reuses an initial about:blank
 * inner window (same actor, no second DOMWindowCreated) — before any page
 * script — it asks the parent (one sync IPC, keyed by
 * innerWindowId so the parent uses the document's real principal) for the
 * policy and a snapshot of the cookies this document's host may see, then
 * hooks document.cookie and window.cookieStore on THIS document. Hooks are
 * keyed by document, so reloads and same-site navigations in the same tab
 * are hooked again (0048 N1).
 *
 * The cookie cache is process-wide (like CookieServiceChild): every document
 * of the same partition + host in this process reads and writes the same
 * map, and the parent pushes per-cookie deltas for HTTP Set-Cookie and writes
 * from other processes. HttpOnly values never reach this process; HttpOnly
 * cookies arrive as value-less stubs so script cannot shadow them.
 *
 * Idle / passthrough / allowlist / non-http(s) principal → uninstall (real
 * jar behavior), no IPC.
 *
 * 0051 (Rowan N4): hooks live where the native members live — the `cookie`
 * accessor on Document.prototype (found through the document's prototype
 * chain) and get/getAll/set/delete on CookieStore.prototype — never as own
 * properties of document / cookieStore. The replacement keeps the native
 * name, length, attributes and [native code] toString; `this` picks the
 * sandboxed record, any other receiver is forwarded to the original native
 * member. Prototypes are restored once no document of that window is hooked.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  DarkstrCookieCore:
    "moz-src:///browser/components/DarkstrCookieFirewall.sys.mjs",
});

const MSG_INSTALL = "DarkstrCookieFirewall:Install";
const MSG_DELTA = "DarkstrCookieFirewall:Delta";
const MSG_REINSTALL = "DarkstrCookieFirewall:Reinstall";
const MSG_SET = "DarkstrCookieFirewall:SetDocumentCookie";
const MSG_STATUS = "DarkstrCookieFirewall:InstallStatus";

/** document → install record. Keyed by document, never by WindowProxy. */
const installedByDocument = new WeakMap();
// Documents whose policy has already been fetched (any decision), so the
// DOMWindowCreated + DOMDocElementInserted pair costs one sync IPC, not two.
const policyCheckedDocuments = new WeakSet();
/** cacheKey ("oa|top-site#host") → Map(cookieKey → record). Process-wide. */
const processCache = new Map();

function errorText(error) {
  try {
    return String(error?.stack || error?.message || error || "unknown error");
  } catch (_e) {
    return "unknown error";
  }
}

function unwaive(obj) {
  if (obj === null || (typeof obj !== "object" && typeof obj !== "function")) {
    return obj;
  }
  try {
    return Cu.unwaiveXrays(obj);
  } catch (_e) {
    return obj;
  }
}

function waive(obj) {
  try {
    const w = Cu.waiveXrays(obj);
    if (w) {
      return w;
    }
  } catch (_e) {}
  if (obj?.wrappedJSObject) {
    return obj.wrappedJSObject;
  }
  throw new Error("unable to waive xrays");
}

function isHttpContentPrincipal(principal) {
  try {
    if (!principal?.isContentPrincipal) {
      return false;
    }
    return principal.schemeIs("http") || principal.schemeIs("https");
  } catch (_e) {
    return false;
  }
}

function baseOfHost(host) {
  const Core = lazy.DarkstrCookieCore;
  const h = Core.normalizeHost(host);
  if (!h || Core.isIpHost(h)) {
    return h;
  }
  try {
    return Services.eTLD.getBaseDomainFromHost(h).toLowerCase();
  } catch (_e) {
    return h;
  }
}

function isPublicSuffix(domain) {
  const Core = lazy.DarkstrCookieCore;
  const d = Core.normalizeHost(domain);
  if (!d || Core.isIpHost(d)) {
    return false;
  }
  if (!d.includes(".")) {
    return d !== "localhost";
  }
  try {
    return Services.eTLD.getPublicSuffixFromHost(d) === d;
  } catch (_e) {
    return false;
  }
}

function cacheFor(cacheKey) {
  let map = processCache.get(cacheKey);
  if (!map) {
    map = new Map();
    processCache.set(cacheKey, map);
  }
  return map;
}

/** Replace the process cache entry with an authoritative parent snapshot. */
function loadSnapshot(cacheKey, records) {
  const Core = lazy.DarkstrCookieCore;
  const map = new Map();
  for (const rec of records || []) {
    map.set(Core.cookieKey(rec), { ...rec });
  }
  processCache.set(cacheKey, map);
  return map;
}

/** Apply a parent delta (HTTP Set-Cookie, other documents, other processes). */
export function applyDelta(data) {
  const Core = lazy.DarkstrCookieCore;
  const map = processCache.get(data?.cacheKey);
  if (!map) {
    return false;
  }
  for (const key of data.deletes || []) {
    map.delete(key);
  }
  for (const rec of data.upserts || []) {
    map.set(Core.cookieKey(rec), { ...rec });
  }
  return true;
}

function envFor(ctx) {
  return {
    laxByDefault: !!ctx.laxByDefault,
    noneRequiresSecure: ctx.noneRequiresSecure !== false,
    isPublicSuffix,
  };
}

function docView(ctx) {
  return {
    host: ctx.docHost,
    path: ctx.docPath,
    secure: !!ctx.secure,
    crossSite: !!ctx.crossSite,
  };
}

/** Synchronous document.cookie read from the process cache. */
export function readCookieString(ctx) {
  const Core = lazy.DarkstrCookieCore;
  const map = processCache.get(ctx.cacheKey);
  return Core.serializeCookies(Core.matchForScript(map, docView(ctx), envFor(ctx)));
}

/**
 * Synchronous document.cookie write: same validation as the parent, applied
 * to the shared process cache at once, then forwarded to the parent (which
 * re-validates with the document's real principal and broadcasts the delta).
 */
export function writeCookieString(ctx, raw, send) {
  const Core = lazy.DarkstrCookieCore;
  const text = String(raw ?? "");
  const now = Date.now();
  const built = Core.buildRecord(
    Core.parseSetCookie(text),
    {
      host: ctx.docHost,
      path: ctx.docPath,
      secure: !!ctx.secure,
      fromHttp: false,
      crossSite: !!ctx.crossSite,
      topLevelNav: false,
      now,
    },
    envFor(ctx)
  );
  if (!built.ok) {
    return false;
  }
  if (ctx.mode === "synthetic" && !built.deletion) {
    built.record.value = Core.syntheticValue(
      ctx.seed >>> 0,
      ctx.topBase,
      baseOfHost(built.record.host),
      built.record.name
    );
  }
  const map = cacheFor(ctx.cacheKey);
  let maxCreation = 0;
  for (const r of map.values()) {
    maxCreation = Math.max(maxCreation, r.creation || 0);
  }
  const res = Core.applyRecord(map, built, {
    fromHttp: false,
    secureOrigin: !!ctx.secure,
    now,
    seq: maxCreation + 1,
  });
  if (!res.changed) {
    return false;
  }
  try {
    send(text);
  } catch (_e) {}
  return true;
}

/** Build the raw cookie string a CookieStore.set()/delete() call implies. */
export function cookieStoreRaw(nameOrOpts, value, isDelete) {
  let opts;
  if (typeof nameOrOpts === "string") {
    opts = { name: nameOrOpts, value };
  } else {
    opts = { ...(nameOrOpts || {}) };
  }
  const name = String(opts.name ?? "");
  const val = isDelete ? "" : String(opts.value ?? "");
  const parts = [`${name}=${val}`];
  parts.push(`Path=${opts.path ? String(opts.path) : "/"}`);
  if (opts.domain) {
    parts.push(`Domain=${String(opts.domain)}`);
  }
  if (isDelete) {
    parts.push("Max-Age=0");
  } else if (opts.expires !== undefined && opts.expires !== null) {
    parts.push(`Expires=${new Date(Number(opts.expires)).toUTCString()}`);
  }
  const ss = String(opts.sameSite || "strict").toLowerCase();
  parts.push(`SameSite=${ss === "lax" || ss === "none" ? ss : "strict"}`);
  parts.push("Secure");
  return { name, raw: parts.join("; ") };
}

/** unwaived prototype → { originals: Map(name → descriptor), users: Set } */
const protoHooks = new WeakMap();
/** unwaived cookieStore → install record (prototype-level dispatch). */
const recordByStore = new WeakMap();

/** Native-like `length` on an exported function (exportFunction gives 0). */
function setLength(fn, length) {
  try {
    Object.defineProperty(waive(fn), "length", {
      value: length,
      writable: false,
      enumerable: false,
      configurable: true,
    });
  } catch (_e) {}
  return fn;
}

/** Object on `obj`'s prototype chain that owns `name` (never `obj` itself). */
function protoOwning(obj, name) {
  let proto = Object.getPrototypeOf(obj);
  while (proto) {
    if (Object.getOwnPropertyDescriptor(proto, name)) {
      return proto;
    }
    proto = Object.getPrototypeOf(proto);
  }
  return null;
}

/**
 * Replace `names` on `proto` (once per prototype) with descriptors from
 * makeDescriptor(name, originalDescriptor); register `user`.
 */
function hookProto(proto, names, user, makeDescriptor) {
  const key = unwaive(proto);
  let state = protoHooks.get(key);
  if (!state) {
    state = { proto, originals: new Map(), users: new Set() };
    for (const name of names) {
      const desc = Object.getOwnPropertyDescriptor(proto, name);
      if (!desc || !desc.configurable) {
        continue;
      }
      Object.defineProperty(proto, name, makeDescriptor(name, desc));
      state.originals.set(name, desc);
    }
    protoHooks.set(key, state);
  }
  state.users.add(unwaive(user));
  return state;
}

function unhookProto(proto, user) {
  const key = unwaive(proto);
  const state = protoHooks.get(key);
  if (!state) {
    return;
  }
  state.users.delete(unwaive(user));
  if (state.users.size) {
    return;
  }
  for (const [name, desc] of state.originals) {
    try {
      Object.defineProperty(state.proto, name, desc);
    } catch (_e) {}
  }
  protoHooks.delete(key);
}

export function uninstallCookieHooks(document) {
  const record = installedByDocument.get(unwaive(document));
  if (!record) {
    return "idle";
  }
  installedByDocument.delete(unwaive(document));
  try {
    if (record.docProto) {
      unhookProto(record.docProto, record.docKey);
    }
  } catch (_e) {}
  try {
    if (record.cookieStore) {
      recordByStore.delete(unwaive(record.cookieStore));
      if (record.storeProto) {
        unhookProto(record.storeProto, record.cookieStore);
      }
    }
  } catch (_e) {}
  return "uninstalled";
}

/** Native-shaped `cookie` accessor dispatching on `this`. */
function cookieAccessor(_name, original) {
  const holder = {
    get cookie() {
      const record = installedByDocument.get(unwaive(this));
      if (!record) {
        return Reflect.apply(original.get, this, []);
      }
      try {
        return readCookieString(record.ctx);
      } catch (error) {
        record.onRuntimeError("document.cookie.get", error);
        return "";
      }
    },
    set cookie(raw) {
      const record = installedByDocument.get(unwaive(this));
      if (!record) {
        Reflect.apply(original.set, this, [raw]);
        return;
      }
      try {
        writeCookieString(record.ctx, raw, record.send);
      } catch (error) {
        record.onRuntimeError("document.cookie.set", error);
      }
    },
  };
  return Object.getOwnPropertyDescriptor(holder, "cookie");
}

const STORE_METHODS = ["get", "getAll", "set", "delete"];
const STORE_LENGTHS = { get: 0, getAll: 0, set: 1, delete: 1 };

function storeImpl(record, pageWindow) {
  const items = (name) => {
    const Core = lazy.DarkstrCookieCore;
    const map = processCache.get(record.ctx.cacheKey);
    const recs = Core.matchForScript(map, docView(record.ctx), envFor(record.ctx));
    return recs
      .filter((r) => !name || r.name === name)
      .map((r) => ({ name: r.name, value: r.value }));
  };
  const nameOf = (nameOrOpts) =>
    typeof nameOrOpts === "string" ? nameOrOpts : nameOrOpts?.name;
  return {
    get(nameOrOpts) {
      return new pageWindow.Promise((resolve) => {
        const list = items(nameOf(nameOrOpts));
        resolve(list.length ? Cu.cloneInto(list[0], pageWindow) : null);
      });
    },
    getAll(nameOrOpts) {
      return new pageWindow.Promise((resolve) => {
        resolve(Cu.cloneInto(items(nameOf(nameOrOpts)), pageWindow));
      });
    },
    set(nameOrOpts, value) {
      return new pageWindow.Promise((resolve) => {
        const { name, raw } = cookieStoreRaw(nameOrOpts, value, false);
        if (name || raw) {
          writeCookieString(record.ctx, raw, record.send);
        }
        resolve(undefined);
      });
    },
    delete(nameOrOpts) {
      return new pageWindow.Promise((resolve) => {
        const { raw } = cookieStoreRaw(nameOrOpts, "", true);
        writeCookieString(record.ctx, raw, record.send);
        resolve(undefined);
      });
    },
  };
}

/** Native-shaped CookieStore.prototype method dispatching on `this`. */
function storeMethod(name, original, pageWindow) {
  const holder = {
    get(...args) {
      return dispatch(this, args);
    },
    getAll(...args) {
      return dispatch(this, args);
    },
    set(...args) {
      return dispatch(this, args);
    },
    delete(...args) {
      return dispatch(this, args);
    },
  };
  function dispatch(self, args) {
    const record = recordByStore.get(unwaive(self));
    if (!record) {
      return Reflect.apply(original.value, self, args);
    }
    return record.storeImpl[name](...args);
  }
  return setLength(
    Cu.exportFunction(holder[name], pageWindow),
    STORE_LENGTHS[name]
  );
}

function sameCtx(a, b) {
  return (
    a &&
    b &&
    a.cacheKey === b.cacheKey &&
    a.mode === b.mode &&
    a.seed === b.seed &&
    a.crossSite === b.crossSite &&
    a.docPath === b.docPath
  );
}

/**
 * Install hooks on one document. `ctx` is the parent policy for this
 * document; `send(raw)` forwards a write to the parent.
 */
export function installCookieHooks(document, window, ctx, send, onRuntimeError) {
  const prior = installedByDocument.get(unwaive(document));
  if (prior && sameCtx(prior.ctx, ctx)) {
    return "already-installed";
  }
  if (prior) {
    uninstallCookieHooks(document);
  }

  const pageWindow = waive(window);
  const doc = waive(document);
  const record = {
    ctx,
    send,
    onRuntimeError,
    docKey: document,
    docProto: null,
    cookieStore: null,
    storeProto: null,
    storeImpl: null,
  };

  const docProto = protoOwning(doc, "cookie");
  if (!docProto) {
    const error = new Error("Document.prototype cookie accessor not found");
    onRuntimeError("document.cookie.define", error);
    throw error;
  }
  installedByDocument.set(unwaive(document), record);
  try {
    hookProto(docProto, ["cookie"], document, (name, original) => {
      const acc = cookieAccessor(name, original);
      return {
        configurable: original.configurable,
        enumerable: original.enumerable,
        get: Cu.exportFunction(acc.get, pageWindow),
        set: setLength(Cu.exportFunction(acc.set, pageWindow), 1),
      };
    });
    record.docProto = docProto;
  } catch (error) {
    installedByDocument.delete(unwaive(document));
    onRuntimeError("document.cookie.define", error);
    throw error;
  }

  try {
    const store = pageWindow.cookieStore;
    if (store && typeof store.get === "function") {
      const storeProto = protoOwning(store, "get");
      if (storeProto) {
        record.cookieStore = store;
        record.storeImpl = storeImpl(record, pageWindow);
        recordByStore.set(unwaive(store), record);
        hookProto(storeProto, STORE_METHODS, store, (name, original) => ({
          configurable: original.configurable,
          enumerable: original.enumerable,
          writable: original.writable,
          value: storeMethod(name, original, pageWindow),
        }));
        record.storeProto = storeProto;
      }
    }
  } catch (error) {
    onRuntimeError("cookieStore", error);
  }

  return prior ? "reinstalled" : "installed";
}

/** Test hook: current install record of a document. */
export function installRecordFor(document) {
  return installedByDocument.get(unwaive(document)) || null;
}

/** Test hook: process cache. */
export function _processCacheForTest() {
  return processCache;
}

export class DarkstrCookieFirewallChild extends JSWindowActorChild {
  _report(ok, eventType, status, error = "") {
    const detail = {
      ok: !!ok,
      event: String(eventType || "unknown"),
      status: String(status || "unknown"),
      error: error ? errorText(error).slice(0, 1000) : "",
    };
    try {
      this.sendAsyncMessage(MSG_STATUS, detail);
    } catch (reportError) {
      console.error("darkstr 0048 diagnostic IPC failed", reportError, detail);
    }
  }

  _policySync() {
    try {
      const results = Services.cpmm.sendSyncMessage(MSG_INSTALL, {
        innerWindowId: this.manager.innerWindowId,
      });
      return results?.[0] || null;
    } catch (error) {
      console.error("darkstr 0048 cookie install IPC failed", error);
      return null;
    }
  }

  _install(eventType) {
    let document;
    let window;
    try {
      document = this.document;
      window = this.contentWindow;
    } catch (_e) {}
    if (!document || !window) {
      return;
    }
    if (!isHttpContentPrincipal(document.nodePrincipal)) {
      if (installedByDocument.has(unwaive(document))) {
        uninstallCookieHooks(document);
      }
      return;
    }
    const policy = this._policySync();
    if (!policy || policy.decision === "retry") {
      this._report(false, eventType, "policy-unavailable");
      return;
    }
    policyCheckedDocuments.add(document);
    if (policy.decision !== "sandbox") {
      const status = uninstallCookieHooks(document);
      this._report(true, eventType, status);
      return;
    }
    try {
      loadSnapshot(policy.cacheKey, policy.records);
      const ctx = { ...policy };
      delete ctx.records;
      const status = installCookieHooks(
        document,
        window,
        ctx,
        (raw) => this.sendAsyncMessage(MSG_SET, { raw }),
        (surface, error) => {
          console.error(`darkstr 0048 runtime failure (${surface})`, error);
          this._report(false, eventType, `runtime-${surface}`, error);
        }
      );
      this._report(true, eventType, status);
    } catch (error) {
      console.error("darkstr 0048 install failed", error);
      this._report(false, eventType, "install-failed", error);
    }
  }

  handleEvent(event) {
    if (event.type === "DOMWindowCreated") {
      this._install(event.type);
    } else if (event.type === "DOMDocElementInserted") {
      // DOMWindowCreated fires once per inner window. When the initial
      // about:blank of a frame/tab navigates same-origin, Gecko reuses that
      // inner window for the new document (nsGlobalWindowOuter::SetNewDocument)
      // and no second DOMWindowCreated fires. DOMDocElementInserted fires for
      // every parsed document before any of its scripts run.
      let document = null;
      try {
        document = this.document;
      } catch (_e) {}
      if (!document || policyCheckedDocuments.has(document)) {
        return;
      }
      this._install(event.type);
    } else if (event.type === "pageshow" && event.persisted) {
      // bfcache restore: refresh the snapshot the document missed.
      this._install(event.type);
    }
  }

  receiveMessage(message) {
    switch (message.name) {
      case MSG_DELTA:
        applyDelta(message.data);
        break;
      case MSG_REINSTALL:
        this._install("reinstall");
        break;
      default:
        break;
    }
    return null;
  }
}
