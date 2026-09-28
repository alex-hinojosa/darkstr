/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr M-FFI — privileged chrome loader for duppel-ffi C ABI.
 *
 * Train: LibreWolf / Firefox 156.0.1-1. Brand: darkstr — not official LibreWolf.
 *
 * Approach A (only runtime path): declare darkstr_ffi_* from in-process
 *   libxul / XUL (gkrust path-dep; symbols exported via toolkit/library/libxul.symbols).
 *
 * Approach B (cdylib / ctypes side-load of libduppel_ffi) is **retired** for
 * runtime load (0041). Keep crate `cdylib` for unit tests / offline builds only;
 * product path must not require a side-loaded dylib.
 *
 * Honesty: fails soft when A symbols unavailable; callers keep JS seed
 * (mulberry) fallback. nativePersonaHooks stays default-off.
 * No Cloudflare/TLS/JA3/RFP metrics.
 *
 * 0009b: timed retry (no permanent lockout); darkstr.ffi.lastError debug pref.
 * 0040: Prefer A (libxul-resident) over B (cdylib).
 * 0041: Retire B runtime load — A-only; soft-fail → JS mulberry.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ctypes: "resource://gre/modules/ctypes.sys.mjs",
});

const LAST_ERROR_PREF = "darkstr.ffi.lastError";
const LOAD_SOURCE_PREF = "darkstr.ffi.loadSource";

let gLib = null;
let gAbiVersion = null;
let gSnapshot = null;
let gFree = null;
let gLoadError = null;
let gNextRetryMs = 0;
/** @type {"libxul"|null} */
let gLoadSource = null;

function joinPath(dir, name) {
  if (!dir) {
    return name;
  }
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

function setLoadError(msg) {
  gLoadError = msg;
  try {
    Services.prefs.setStringPref(LAST_ERROR_PREF, String(msg || "").slice(0, 500));
  } catch (_e) {}
}

function setLoadSource(src) {
  gLoadSource = src;
  try {
    Services.prefs.setStringPref(LOAD_SOURCE_PREF, String(src || ""));
  } catch (_e) {}
}

/** Approach A: libxul / XUL already in-process (Darwin file name is "XUL"). */
function inProcessCandidates() {
  const names = ["XUL", "libxul.dylib", "libxul.so", "libxul.dll"];
  const paths = [];
  const pushDir = dirPath => {
    if (!dirPath) {
      return;
    }
    for (const name of names) {
      paths.push(joinPath(dirPath, name));
    }
  };
  for (const key of ["CurProcD", "GreD", "XCurProcD"]) {
    try {
      pushDir(Services.dirsvc.get(key, Ci.nsIFile).path);
    } catch (_e) {}
  }
  try {
    pushDir(Services.dirsvc.get("XREExeF", Ci.nsIFile).parent.path);
  } catch (_e) {}
  // dyld already-loaded image names
  for (const name of names) {
    paths.push(name);
  }
  return paths;
}

function tryOpenPath(path) {
  const lib = lazy.ctypes.open(path);
  const abiVersion = lib.declare(
    "darkstr_ffi_abi_version",
    lazy.ctypes.default_abi,
    lazy.ctypes.uint32_t
  );
  const snapshot = lib.declare(
    "darkstr_ffi_persona_snapshot_json",
    lazy.ctypes.default_abi,
    lazy.ctypes.char.ptr,
    lazy.ctypes.uint32_t,
    lazy.ctypes.char.ptr
  );
  const freeFn = lib.declare(
    "darkstr_ffi_string_free",
    lazy.ctypes.default_abi,
    lazy.ctypes.void_t,
    lazy.ctypes.char.ptr
  );
  const ver = abiVersion();
  if (ver !== 1) {
    try {
      lib.close();
    } catch (_e) {}
    throw new Error(`unexpected ABI version ${ver}`);
  }
  return { lib, abiVersion, snapshot, freeFn };
}

function ensureLoaded() {
  if (gLib) {
    return true;
  }
  const now = Date.now();
  if (now < gNextRetryMs) {
    return false;
  }

  // 0041: A-only — Approach B cdylib candidate list / ctypes load retired.
  const stages = [{ kind: "libxul", paths: inProcessCandidates() }];
  const tried = [];
  for (const stage of stages) {
    for (const path of stage.paths) {
      tried.push(`${stage.kind}:${path}`);
      try {
        const opened = tryOpenPath(path);
        gLib = opened.lib;
        gAbiVersion = opened.abiVersion;
        gSnapshot = opened.snapshot;
        gFree = opened.freeFn;
        setLoadSource(stage.kind);
        setLoadError("");
        gNextRetryMs = 0;
        return true;
      } catch (e) {
        setLoadError(`${stage.kind}:${path}: ${e}`);
        gLib = null;
        gAbiVersion = gSnapshot = gFree = null;
        gLoadSource = null;
      }
    }
  }
  if (!gLoadError) {
    setLoadError(`no candidates (tried=${tried.join("|") || "none"})`);
  }
  console.warn("DarkstrFfi: load failed (A-only; B retired) —", gLoadError);
  gNextRetryMs = Date.now() + 1500;
  return false;
}

function parseSnapshotJson(json) {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed.userAgent !== "string") {
    return null;
  }
  return {
    userAgent: parsed.userAgent,
    platform: parsed.platform || "MacIntel",
    hardwareConcurrency: parsed.hardwareConcurrency || 8,
    deviceMemory: parsed.deviceMemory || 8,
    languages: Array.isArray(parsed.languages)
      ? parsed.languages
      : ["en-US", "en"],
    timezone: parsed.timezone || undefined,
  };
}

/**
 * @param {number} seed unsigned seed
 * @param {string} os "macos"|"linux"|"windows"
 * @returns {object|null}
 */
export function personaSnapshotFromSeed(seed, os = "macos") {
  if (!ensureLoaded()) {
    return null;
  }
  const osC = lazy.ctypes.char.array()(String(os || "macos"));
  const ptr = gSnapshot(seed >>> 0, osC);
  if (ptr.isNull()) {
    return null;
  }
  try {
    const json = ptr.readString();
    return parseSnapshotJson(json);
  } catch (_e) {
    return null;
  } finally {
    try {
      gFree(ptr);
    } catch (_e) {}
  }
}

export function abiVersion() {
  if (!ensureLoaded()) {
    return 0;
  }
  try {
    return gAbiVersion();
  } catch (_e) {
    return 0;
  }
}

export function lastLoadError() {
  return gLoadError;
}

/** @returns {"libxul"|null} */
export function loadSource() {
  return gLoadSource;
}

export var DarkstrFfi = {
  personaSnapshotFromSeed,
  abiVersion,
  lastLoadError,
  loadSource,
};
