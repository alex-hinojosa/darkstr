/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr M2 — live chrome pref observer for XOR mode→RFP side-effects.
 *
 * Train pin: Firefox / LibreWolf 156.0.1-1 (FIREFOX_156_0_1_RELEASE).
 * Brand: darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.
 *
 * Semantics mirror the public control plane:
 *   duppel_persona::mode_pref_effects
 *   duppel_bridge::PrefsApplicator::apply_mode_effects / PrefApplyPlan::is_xor_safe
 *
 * Pollution  → privacy.resistFingerprinting=false,
 *              privacy.fingerprintingProtection=false
 * Homogeneous → stock RFP true / FPP stock-on restore; no RFP metric customization
 * Forbidden   → Pollution with RFP still true via this prefs path
 *
 * Observes darkstr.mode / darkstr.nativeCompatible. Also observes
 * privacy.resistFingerprinting / privacy.fingerprintingProtection and
 * browser.contentblocking.category (ContentBlockingPrefs.PREF_CB_CATEGORY on
 * 155.0.1) so that under Pollution we can re-assert both false after CB
 * category settle / stomps post-BrowserGlue init. Homogeneous ignores RFP/FPP
 * and CB-category observer callbacks (do not fight user/stock). Writes only
 * privacy.* (does not echo darkstr.* back — avoids re-entrancy). Persona/chaff
 * remain WebExt / later M3 hooks; nativeCompatible is read for parity only here.
 *
 * Soft residual (0029): LibreWolf nulls getContext('webgl') even when Canvas 2D works. Unlock webgl.disabled + force-enabled + gfx.blocklist.all=-1 AND librewolf.webgl.prompt=false (LW IsWebGLAllowed doorhanger gate — Err string "WebGL is currently disabled." is from that path, not webgl.disabled alone). Product-level on every mode apply so Proof can live-check UNMASKED + apple caps from 0017/0023 under Pollution+hooks and Homogeneous. Firefox persona only — does not invent Chrome GPU strings; depth spoof still 0017/0023. Prefer unlocking path over inventing software GL (Mini GPU can work).
 */

const MODE_PREF = "darkstr.mode";
const NATIVE_PREF = "darkstr.nativeCompatible";
const RFP_PREF = "privacy.resistFingerprinting";
const FPP_PREF = "privacy.fingerprintingProtection";
/** ContentBlockingPrefs.PREF_CB_CATEGORY on Firefox/LibreWolf 155.0.1-1 */
const CB_CATEGORY_PREF = "browser.contentblocking.category";
/** 0029: LibreWolf null-context gates — webgl.disabled + librewolf.webgl.prompt. */
const WEBGL_DISABLED_PREF = "webgl.disabled";
const WEBGL_FORCE_ENABLED_PREF = "webgl.force-enabled";
const WEBGL_FORBID_HARDWARE_PREF = "webgl.forbid-hardware";
const WEBGL_FORBID_SOFTWARE_PREF = "webgl.forbid-software";
const GFX_BLOCKLIST_ALL_PREF = "gfx.blocklist.all";
/** StaticPref name is dotted; C++ StaticPrefs::librewolf_webgl_prompt(). */
const LIBREWOLF_WEBGL_PROMPT_PREF = "librewolf.webgl.prompt";
const LIBREWOLF_WEBGL_PROMPT_HIDE_PREF = "librewolf.webgl.prompt.hide";
const WEBGL_ENSURE_APPLIED_PREF = "darkstr.webgl.ensureApplied";
const WEBGL_LAST_STATUS_PREF = "darkstr.webgl.lastStatus";

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

/**
 * 0052 (Fable B1): every darkstr diagnostic / mirror pref. None of them is
 * read back by product code; with darkstr.debug.diagPrefs false they live in
 * memory only (module getDiagnostics()). Values left in prefs.js by older
 * builds are cleared at startup (init) and whenever diagPrefs is switched off.
 * Functional state is NOT listed here: darkstr.pollutionActive (content gate),
 * darkstr.persona.saved* (exact restore), darkstr.cookieFirewall.contentGate
 * (default branch only), and the user-facing config prefs.
 */
export const DARKSTR_DIAG_PREFS = Object.freeze([
  "darkstr.cookieFirewall.armed",
  "darkstr.cookieFirewall.lastEtld",
  "darkstr.cookieFirewall.lastSeed",
  "darkstr.cookieFirewall.lastDecision",
  "darkstr.cookieFirewall.lastPartition",
  "darkstr.cookieFirewall.lastInstall",
  "darkstr.cookieFirewall.lastError",
  "darkstr.cookieFirewall.lastHttpTopic",
  "darkstr.cookieFirewall.lastHttpEtld",
  "darkstr.cookieFirewall.lastCookieOut",
  "darkstr.cookieFirewall.lastCookieSet",
  "darkstr.cookieFirewall.lastCookieErr",
  "darkstr.persona.lastEtld",
  "darkstr.persona.effectiveSeed",
  "darkstr.persona.ua",
  "darkstr.persona.platform",
  "darkstr.persona.hardwareConcurrency",
  "darkstr.persona.languages",
  "darkstr.persona.docShellPhase",
  "darkstr.persona.lastError",
  "darkstr.persona.lastDecision",
  "darkstr.docshell.strictNextNavArmed",
  "darkstr.depth.hooksArmed",
  "darkstr.depth.lastSeeds",
  "darkstr.depth.lastError",
  "darkstr.depth.lastInstall",
  "darkstr.worker.hooksArmed",
  "darkstr.worker.lastPayload",
  "darkstr.worker.lastError",
  "darkstr.worker.lastInstall",
  "darkstr.chaff.schedulerArmed",
  "darkstr.chaff.lastPlan",
  "darkstr.chaff.lastFireAt",
  "darkstr.chaff.lastBeaconKind",
  "darkstr.webgl.ensureApplied",
  "darkstr.webgl.lastStatus",
  "darkstr.ffi.lastError",
  "darkstr.ffi.loadSource",
]);

/**
 * Clear user values of every DARKSTR_DIAG_PREFS entry unless diagPrefs is on.
 * @returns {string[]} the prefs that were cleared.
 */
export function sweepDiagPrefs() {
  let on = false;
  try {
    on = Services.prefs.getBoolPref(DIAG_PREFS_PREF, false);
  } catch (_e) {
    on = false;
  }
  if (on === true) {
    return [];
  }
  const cleared = [];
  for (const name of DARKSTR_DIAG_PREFS) {
    try {
      if (Services.prefs.prefHasUserValue(name)) {
        Services.prefs.clearUserPref(name);
        cleared.push(name);
      }
    } catch (_e) {}
  }
  return cleared;
}

export var DarkstrModeXor = {
  /** 0052: in-memory diagnostics (what used to be darkstr.*.last* prefs). */
  getDiagnostics() {
    return diagPrefs.snapshot();
  },

  _inited: false,
  _applying: false,

  init() {
    if (this._inited) {
      return;
    }
    this._inited = true;
    // 0052: drop diagnostics an older build (or a diag session) left behind.
    this._lastSweep = sweepDiagPrefs();
    this._observer = this._observe.bind(this);
    Services.prefs.addObserver(DIAG_PREFS_PREF, this._observer);
    Services.prefs.addObserver(MODE_PREF, this._observer);
    Services.prefs.addObserver(NATIVE_PREF, this._observer);
    Services.prefs.addObserver(RFP_PREF, this._observer);
    Services.prefs.addObserver(FPP_PREF, this._observer);
    Services.prefs.addObserver(CB_CATEGORY_PREF, this._observer);
    this.applyModeEffects();
    // CB category / ContentBlockingPrefs may settle after BrowserGlue init and
    // re-enable FPP (e.g. strict features include "fpp"). Deferred + second
    // idle re-apply re-asserts Pollution XOR (!rfp && !fpp).
    this._scheduleDeferredReapply();
  },

  uninit() {
    if (!this._inited) {
      return;
    }
    try {
      Services.prefs.removeObserver(DIAG_PREFS_PREF, this._observer);
      Services.prefs.removeObserver(MODE_PREF, this._observer);
      Services.prefs.removeObserver(NATIVE_PREF, this._observer);
      Services.prefs.removeObserver(RFP_PREF, this._observer);
      Services.prefs.removeObserver(FPP_PREF, this._observer);
      Services.prefs.removeObserver(CB_CATEGORY_PREF, this._observer);
    } catch (_e) {
      // Observers may already be gone during shutdown.
    }
    this._inited = false;
  },

  _scheduleDeferredReapply() {
    const self = this;
    const reapply = () => {
      try {
        self.applyModeEffects();
      } catch (_e) {
        // Best-effort; init path must not throw.
      }
    };
    try {
      Services.tm.dispatchToMainThread(reapply);
    } catch (_e) {}
    try {
      // Dual idle: first catches early CB settle; second catches late category
      // re-apply after the first idle window (Proof soft residual under Pollution).
      Services.tm.idleDispatchToMainThread(() => {
        reapply();
        try {
          Services.tm.idleDispatchToMainThread(reapply);
        } catch (_e2) {}
      });
    } catch (_e) {}
  },

  _observe(_subject, topic, data) {
    if (topic !== "nsPref:changed") {
      return;
    }
    if (data === DIAG_PREFS_PREF) {
      // 0052: switching diagnostics off removes them from prefs.js at once.
      this._lastSweep = sweepDiagPrefs();
      return;
    }
    if (this._applying) {
      return;
    }
    if (data === MODE_PREF || data === NATIVE_PREF) {
      this.applyModeEffects();
      return;
    }
    if (
      data === RFP_PREF ||
      data === FPP_PREF ||
      data === CB_CATEGORY_PREF
    ) {
      // Only re-assert under Pollution (counter CB stomps / category flips).
      // Homogeneous: ignore so we do not fight a user or stock toggling RFP/FPP.
      let mode = "homogeneous";
      try {
        mode = Services.prefs.getStringPref(MODE_PREF, "homogeneous");
      } catch (_e) {
        mode = "homogeneous";
      }
      if (mode === "pollution") {
        this.applyModeEffects();
      }
    }
  },

  /**
   * Apply XOR side-effects for the current darkstr.mode value.
   * @returns {{ mode: string, nativeCompatible: boolean, xorSafe: boolean }}
   */
  applyModeEffects() {
    if (this._applying) {
      return { mode: "homogeneous", nativeCompatible: false, xorSafe: true };
    }
    this._applying = true;
    try {
      // 0029: enable live WebGL for both Homogeneous and Pollution (Firefox-coherent).
      this._ensureWebGlContextPrefs();

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

      if (mode === "pollution") {
        Services.prefs.setBoolPref(RFP_PREF, false);
        Services.prefs.setBoolPref(FPP_PREF, false);
      } else {
        // Homogeneous: restore LibreWolf stock RFP expectations.
        // Do not customize RFP metrics / letterboxing tables.
        Services.prefs.setBoolPref(RFP_PREF, true);
        Services.prefs.setBoolPref(FPP_PREF, true);
      }

      const rfp = Services.prefs.getBoolPref(RFP_PREF, false);
      const fpp = Services.prefs.getBoolPref(FPP_PREF, false);
      const xorSafe =
        mode === "pollution" ? !rfp && !fpp : rfp === true;

      return { mode, nativeCompatible, xorSafe };
    } finally {
      this._applying = false;
    }
  },

  _ensureWebGlContextPrefs() {
    try {
      Services.prefs.setBoolPref(WEBGL_DISABLED_PREF, false);
      Services.prefs.setBoolPref(WEBGL_FORCE_ENABLED_PREF, true);
      try {
        if (Services.prefs.getPrefType(WEBGL_FORBID_HARDWARE_PREF) != Services.prefs.PREF_INVALID) {
          Services.prefs.setBoolPref(WEBGL_FORBID_HARDWARE_PREF, false);
        }
      } catch (_eFh) {}
      try {
        if (Services.prefs.getPrefType(WEBGL_FORBID_SOFTWARE_PREF) != Services.prefs.PREF_INVALID) {
          Services.prefs.setBoolPref(WEBGL_FORBID_SOFTWARE_PREF, false);
        }
      } catch (_eFs) {}
      // Completeness only — startup cfg (defaultPref gfx.blocklist.all=-1) is SoT.
      try {
        Services.prefs.setIntPref(GFX_BLOCKLIST_ALL_PREF, -1);
      } catch (_eBl) {}
      // LW permission prompt gate (StaticPrefs::librewolf_webgl_prompt).
      try {
        if (Services.prefs.getPrefType(LIBREWOLF_WEBGL_PROMPT_PREF) != Services.prefs.PREF_INVALID) {
          try {
            Services.prefs.unlockPref(LIBREWOLF_WEBGL_PROMPT_PREF);
          } catch (_eUnlock) {}
          Services.prefs.setBoolPref(LIBREWOLF_WEBGL_PROMPT_PREF, false);
        }
      } catch (_ePrompt) {}
      try {
        if (Services.prefs.getPrefType(LIBREWOLF_WEBGL_PROMPT_HIDE_PREF) != Services.prefs.PREF_INVALID) {
          try {
            Services.prefs.unlockPref(LIBREWOLF_WEBGL_PROMPT_HIDE_PREF);
          } catch (_eUnlockH) {}
          Services.prefs.setBoolPref(LIBREWOLF_WEBGL_PROMPT_HIDE_PREF, true);
        }
      } catch (_eHide) {}

      const disabled = Services.prefs.getBoolPref(WEBGL_DISABLED_PREF, true);
      const forced = Services.prefs.getBoolPref(WEBGL_FORCE_ENABLED_PREF, false);
      let blocklistAll = "?";
      try {
        blocklistAll = String(Services.prefs.getIntPref(GFX_BLOCKLIST_ALL_PREF, 0));
      } catch (_eBl2) {}
      let lwPrompt = "?";
      try {
        if (Services.prefs.getPrefType(LIBREWOLF_WEBGL_PROMPT_PREF) != Services.prefs.PREF_INVALID) {
          lwPrompt = String(Services.prefs.getBoolPref(LIBREWOLF_WEBGL_PROMPT_PREF, true));
        } else {
          lwPrompt = "absent";
        }
      } catch (_ePrompt2) {
        lwPrompt = "err";
      }

      const bits = [
        "disabled=" + String(disabled),
        "force-enabled=" + String(forced),
        "blocklist.all=" + blocklistAll,
        "librewolf.webgl.prompt=" + lwPrompt,
        "ok=" + String(!disabled && lwPrompt !== "true"),
      ];
      bits.push(this._gfxFeatureStatusSnippet());

      const status = bits.join(",").slice(0, 400);
      const ensureOk = !disabled && lwPrompt !== "true";
      diagPrefs.setBoolPref(WEBGL_ENSURE_APPLIED_PREF, ensureOk);
      diagPrefs.setStringPref(WEBGL_LAST_STATUS_PREF, status);
    } catch (e) {
      try {
        diagPrefs.setBoolPref(WEBGL_ENSURE_APPLIED_PREF, false);
        const reason =
          "webgl-ensure: " +
          (e && e.message ? String(e.message) : String(e)).slice(0, 160);
        diagPrefs.setStringPref(WEBGL_LAST_STATUS_PREF, reason);
      } catch (_e2) {}
    }
  },

  /**
   * Enrich lastStatus with nsIGfxInfo WEBGL_OPENGL + WEBGL2 numeric status +
   * failureId. Map: 1=OK 2=UNKNOWN 3=BLOCKED_DRIVER 4=BLOCKED_DEVICE …
   * Status 2 is UNKNOWN (not blocked). Best-effort; never throws.
   */
  _gfxFeatureStatusSnippet() {
    try {
      const gfxInfo = Cc["@mozilla.org/gfx/info;1"].getService(Ci.nsIGfxInfo);
      const mapName = status => {
        switch (status) {
          case 1:
            return "OK";
          case 2:
            return "UNKNOWN";
          case 3:
            return "BLOCKED_DRIVER";
          case 4:
            return "BLOCKED_DEVICE";
          case 5:
            return "BLOCKED_DISALLOW";
          case 6:
            return "BLOCKED_OS";
          case 7:
            return "BLOCKED_MISC";
          default:
            return "STATUS_" + String(status);
        }
      };
      const one = featureConst => {
        try {
          const failureId = {};
          const status = gfxInfo.getFeatureStatus(featureConst, failureId);
          const fid =
            failureId && failureId.value != null && String(failureId.value).length
              ? String(failureId.value)
              : "";
          return (
            String(status) +
            "=" +
            mapName(status) +
            (fid ? ("/" + fid) : "")
          );
        } catch (eOne) {
          return "err:" + (eOne && eOne.message ? String(eOne.message) : String(eOne)).slice(0, 40);
        }
      };
      const opengl = one(Ci.nsIGfxInfo.FEATURE_WEBGL_OPENGL);
      let webgl2 = "?";
      try {
        webgl2 = one(Ci.nsIGfxInfo.FEATURE_WEBGL2);
      } catch (_eW2) {
        // FEATURE_WEBGL2 may be absent on older idl; ignore.
      }
      return "gfx:WEBGL_OPENGL=" + opengl + ";WEBGL2=" + webgl2;
    } catch (e) {
      return "gfx:err=" + (e && e.message ? String(e.message) : String(e)).slice(0, 60);
    }
  },
};
