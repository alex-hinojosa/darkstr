/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr worker coherence (chrome, parent process).
 *
 * Train pin: LibreWolf 156.0.1-1 (Gecko 156).
 * Brand: darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.
 *
 * 0049: workers report the SAME persona as the page/site that created them.
 * There is no worker-side persona generator any more: the only source of
 * truth is DarkstrNativePersona (0051 per-document decision).
 *
 *   - Dedicated workers: the creating document's decision
 *     (DarkstrNativePersona.documentDecision of its WindowGlobalParent).
 *   - Shared / Service workers: the owning site's decision (top-level site of
 *     the worker's partition, DarkstrNativePersona.workerSiteDecision).
 *   - Nested workers inherit their parent worker's persona in C++.
 *
 * Mechanism: native. WorkerPrivate::Constructor (C++) fires the observer
 * topic "darkstr-worker-persona-resolve" in the worker's content process
 * once per top-level worker; the DarkstrWorkerPersona JSProcessActor child
 * answers via a sync message to this module. WorkerNavigator then serves
 * userAgent / platform / hardwareConcurrency / languages natively and the
 * stock worker plumbing carries the timezone. No Worker/SharedWorker
 * constructor wrapping, no blob: scripts, no JS navigator overrides, no
 * deviceMemory (Firefox has none).
 *
 * Depth (0043 OffscreenCanvas / WebGL / WebGPU in workers) stays: its prelude
 * is evaluated natively in the worker global before the main script, with
 * the seeds DarkstrDepthHooks hands the owning document.
 *
 * Gates (default-off — idle unless explicitly allowed):
 *   armed = mode=="pollution" && !nativeCompatible && darkstr.nativePersonaHooks
 *   (no seed pref needed: the session persona applies, same as the page).
 * C++ never fires the observer when the content-side gate prefs are off, so
 * default profiles see plain Firefox 156 workers.
 */

const MODE_PREF = "darkstr.mode";
const NATIVE_PREF = "darkstr.nativeCompatible";
const HOOKS_PREF = "darkstr.nativePersonaHooks";
const ARMED_PREF = "darkstr.worker.hooksArmed";
const LAST_PAYLOAD_PREF = "darkstr.worker.lastPayload";
const LAST_ERROR_PREF = "darkstr.worker.lastError";
const LAST_INSTALL_PREF = "darkstr.worker.lastInstall";

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

export const WORKER_PERSONA_ACTOR = "DarkstrWorkerPersona";
export const WORKER_PERSONA_TOPIC = "darkstr-worker-persona-resolve";
export const MSG_RESOLVE = "DarkstrWorkerHooks:Resolve";

function deriveWebGpuSeed(speechOrCanvasSeed, audioSeed) {
  // 0043: match DepthHooks deriveWebGpuSeed (speechSeed ⊕ audio).
  return (speechOrCanvasSeed ^ Math.imul(audioSeed >>> 0, 0xc2b2ae35)) >>> 0;
}

function readWebGpuSeed(obj, speechOrCanvasSeed, audioSeed) {
  if (obj && typeof obj === "object") {
    for (const key of ["webgpuSeed", "webgpu_seed"]) {
      if (typeof obj[key] === "number" && Number.isFinite(obj[key])) {
        return obj[key] >>> 0;
      }
    }
  }
  return deriveWebGpuSeed(speechOrCanvasSeed >>> 0, audioSeed >>> 0);
}

function normalizeGpu(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const vendor = String(raw.vendor || "").trim();
  const renderer = String(raw.renderer || "").trim();
  if (!vendor || !renderer) {
    return null;
  }
  return { vendor, renderer };
}

/** Depth seeds DarkstrDepthHooks gives the owning document (0043 SoT). */
export function workerDepthFromSeeds(seeds) {
  if (!seeds || typeof seeds.canvasSeed !== "number") {
    return null;
  }
  const audioSeed = seeds.audioSeed >>> 0;
  const canvasSeed = seeds.canvasSeed >>> 0;
  return {
    canvasSeed,
    audioSeed,
    webgpuSeed: readWebGpuSeed(seeds, seeds.speechSeed ?? canvasSeed, audioSeed),
    gpu: normalizeGpu(seeds.gpu) || { vendor: "Apple", renderer: "Apple M1" },
  };
}

function lazyNativePersona() {
  return ChromeUtils.importESModule(
    "moz-src:///browser/components/DarkstrNativePersona.sys.mjs"
  ).DarkstrNativePersona;
}

function lazyDepthHooks() {
  return ChromeUtils.importESModule(
    "moz-src:///browser/components/DarkstrDepthHooks.sys.mjs"
  ).DarkstrDepthHooks;
}

export var DarkstrWorkerHooks = {
  /** 0052: in-memory diagnostics (what used to be darkstr.*.last* prefs). */
  getDiagnostics() {
    return diagPrefs.snapshot();
  },

  _inited: false,
  _actorRegistered: false,
  _listening: false,
  _observer: null,
  _armed: false,
  _plan: null,

  init() {
    if (this._inited) {
      return;
    }
    this._inited = true;
    this._observer = this._observe.bind(this);
    for (const p of [MODE_PREF, NATIVE_PREF, HOOKS_PREF]) {
      Services.prefs.addObserver(p, this._observer);
    }
    this._registerActor();
    this._listen();
    this.refreshPlan();
  },

  uninit() {
    if (!this._inited) {
      return;
    }
    for (const p of [MODE_PREF, NATIVE_PREF, HOOKS_PREF]) {
      try {
        Services.prefs.removeObserver(p, this._observer);
      } catch (_e) {}
    }
    if (this._listening) {
      try {
        Services.ppmm.removeMessageListener(MSG_RESOLVE, this);
      } catch (_e) {}
      this._listening = false;
    }
    if (this._actorRegistered) {
      try {
        ChromeUtils.unregisterProcessActor(WORKER_PERSONA_ACTOR);
      } catch (_e) {}
      this._actorRegistered = false;
    }
    this._setArmed(false);
    this._inited = false;
  },

  _observe(_subject, topic, _data) {
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
      ChromeUtils.registerProcessActor(WORKER_PERSONA_ACTOR, {
        parent: {
          esModuleURI:
            "moz-src:///browser/components/DarkstrWorkerHooksParent.sys.mjs",
        },
        child: {
          esModuleURI:
            "moz-src:///browser/components/DarkstrWorkerHooksChild.sys.mjs",
          observers: [WORKER_PERSONA_TOPIC],
        },
        includeParent: false,
        // Workers run in web content processes; the child only relays the
        // C++ resolve request and writes navigator strings back.
        safeForUntrustedWebProcess: true,
      });
      this._actorRegistered = true;
    } catch (e) {
      console.error("darkstr 0049: worker persona process actor register failed:", e);
      this.recordInstallStatus({
        ok: false,
        event: "register",
        status: "register-failed",
        error: String(e?.stack || e?.message || e || "register failed"),
      });
    }
  },

  _listen() {
    if (this._listening) {
      return;
    }
    try {
      Services.ppmm.addMessageListener(MSG_RESOLVE, this);
      this._listening = true;
    } catch (e) {
      console.error("darkstr 0049: worker resolve listener failed:", e);
    }
  },

  /** ppmm sync handler (content process → parent). */
  receiveMessage(message) {
    if (message?.name !== MSG_RESOLVE) {
      return null;
    }
    let senderPid = null;
    try {
      senderPid = message.target?.osPid;
    } catch (_e) {}
    try {
      return this.resolveWorker(message.data || {}, senderPid);
    } catch (e) {
      this.recordInstallStatus({
        ok: false,
        event: "resolve",
        status: "resolve-failed",
        error: String(e?.message || e),
      });
      return { decision: "native", persona: null, depth: null };
    }
  },

  /**
   * @returns {{ pollutionActive, nativeHooks, armed }}
   * Armed whenever page hooks are on — no seed pref required (0049).
   */
  refreshPlan() {
    let mode = "homogeneous";
    try {
      mode = Services.prefs.getStringPref(MODE_PREF, "homogeneous");
    } catch (_e) {
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
    const pollutionActive = mode === "pollution" && !nativeCompatible;
    const armed = !!(pollutionActive && nativeHooks);
    this._plan = { pollutionActive, nativeHooks, armed };
    this._setArmed(armed);
    return this._plan;
  },

  getPlan() {
    return this._plan || this.refreshPlan();
  },

  /**
   * One worker's persona + depth.
   * data: { kind, innerWindowId, principalOrigin, partitionKey, scriptURL }
   */
  resolveWorker(data, senderPid = null) {
    const plan = this.getPlan();
    const kind = String(data?.kind || "dedicated");
    if (!plan.armed) {
      return { decision: "off", kind, persona: null, depth: null };
    }
    const NP = lazyNativePersona();
    let decision = null;
    let bc = null;
    let source = "";
    const innerWindowId = Number(data?.innerWindowId) || 0;
    if (innerWindowId) {
      let wgp = null;
      try {
        wgp = WindowGlobalParent.getByInnerWindowId(innerWindowId);
      } catch (_e) {}
      if (!wgp) {
        return { decision: "native", kind, persona: null, depth: null, reason: "no-window" };
      }
      if (
        typeof senderPid === "number" &&
        senderPid > 0 &&
        typeof wgp.osPid === "number" &&
        wgp.osPid > 0 &&
        senderPid !== wgp.osPid
      ) {
        return { decision: "native", kind, persona: null, depth: null, reason: "pid-mismatch" };
      }
      decision = NP.documentDecision(wgp);
      bc = wgp.browsingContext;
      source = "document";
    } else {
      const uri = NP.topSiteUriForWorker(data?.principalOrigin, data?.partitionKey);
      const r = NP.workerSiteDecision(uri);
      decision = r.decision;
      bc = r.browsingContext;
      source = "site";
    }
    const persona = NP.workerPersonaFields(decision?.snapshot);
    let depth = null;
    if (persona && bc) {
      try {
        depth = workerDepthFromSeeds(lazyDepthHooks().depthSeedsForBrowsingContext(bc));
      } catch (_e) {
        depth = null;
      }
    }
    const out = {
      decision: persona ? "persona" : "native",
      kind,
      source,
      site: decision?.site || "",
      persona,
      depth,
    };
    this._writeLastPayload(out);
    this.recordInstallStatus({
      ok: true,
      event: "resolve",
      status: `${kind}:${source}:${out.decision}`,
    });
    return out;
  },

  _writeLastPayload(out) {
    try {
      diagPrefs.setStringPref(
        LAST_PAYLOAD_PREF,
        JSON.stringify({
          kind: out.kind,
          source: out.source,
          site: out.site,
          decision: out.decision,
          ua: out.persona?.userAgent || "",
          platform: out.persona?.platform || "",
          hw: out.persona?.hardwareConcurrency || 0,
          langs: out.persona?.languages || [],
          tz: out.persona?.timezone || "",
          canvasSeed: out.depth?.canvasSeed ?? null,
          webgpuSeed: out.depth?.webgpuSeed ?? null,
          gpu: out.depth?.gpu ?? null,
        })
      );
    } catch (_e) {}
  },

  /** Persist diagnostics. Never writes privacy.*. */
  recordInstallStatus(detail) {
    const payload = {
      ok: !!detail?.ok,
      event: String(detail?.event || "unknown"),
      status: String(detail?.status || "unknown"),
      error: String(detail?.error || "").slice(0, 1000),
      at: new Date().toISOString(),
    };
    try {
      diagPrefs.setStringPref(LAST_INSTALL_PREF, JSON.stringify(payload));
    } catch (_e) {}
    try {
      diagPrefs.setStringPref(
        LAST_ERROR_PREF,
        payload.ok ? "" : `${payload.event}:${payload.status}:${payload.error}`.slice(0, 1000)
      );
    } catch (_e) {}
  },

  _setArmed(armed) {
    this._armed = !!armed;
    try {
      diagPrefs.setBoolPref(ARMED_PREF, this._armed);
    } catch (_e) {}
    if (!this._armed) {
      try {
        diagPrefs.setStringPref(LAST_PAYLOAD_PREF, "");
      } catch (_e) {}
    }
  },
};
