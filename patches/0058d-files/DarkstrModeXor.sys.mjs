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
 *              privacy.fingerprintingProtection=false,
 *              privacy.baselineFingerprintingProtection=false (0057r2: its
 *              canvas randomization would stack engine noise on darkstr's
 *              per-site farbling, so alternate canvas read paths disagreed),
 *              privacy.fingerprintingProtection.pbmode=false and
 *              privacy.resistFingerprinting.pbmode=false (0057r4: FPP is on
 *              in every private window by default and its canvas randomization
 *              noised the export paths there, not the reads),
 *              librewolf.webgl.prompt=false (WebGL without the LibreWolf
 *              doorhanger; GPU blocklist and webgl.force-enabled untouched)
 * Homogeneous → hands-off (0053, Fable B5): writes nothing. Leaving Pollution
 *              restores exactly the values saved when Pollution was entered
 *              (user value or "no user value"), then forgets the saved copy.
 * Forbidden   → Pollution with RFP still true via this prefs path
 * 0054 (Fable B6): Pollution requires native persona hooks. Pollution with
 *              darkstr.nativePersonaHooks=false would turn RFP / FPP off with
 *              no persona to replace them (a bare browser). ModeXor refuses
 *              it, from any writer (hand-edited prefs at startup, about:config,
 *              an extension, a pref change at runtime): darkstr.mode is put
 *              back to Homogeneous, so the saved RFP / FPP are restored and RFP
 *              is never off without a persona. The Settings pane turns hooks on
 *              before it writes Pollution, so it never hits the refusal.
 *              Native-Compatible (Pollution + hooks + nativeCompatible: RFP
 *              off, native identity) stays the documented escape.
 *
 * Observes darkstr.mode / darkstr.nativeCompatible / darkstr.nativePersonaHooks. Also observes
 * privacy.resistFingerprinting / privacy.fingerprintingProtection and
 * browser.contentblocking.category (ContentBlockingPrefs.PREF_CB_CATEGORY on
 * 155.0.1) so that under Pollution we can re-assert both false after CB
 * category settle / stomps post-BrowserGlue init. Homogeneous ignores RFP/FPP
 * and CB-category observer callbacks (do not fight user/stock). Writes only
 * privacy.* (does not echo darkstr.* back — avoids re-entrancy). Persona/chaff
 * remain WebExt / later M3 hooks; nativeCompatible is read for parity only here.
 *
 * 0053: the 0029 WebGL unlock (webgl.force-enabled=true, gfx.blocklist.all=-1,
 * webgl.forbid-*=false on every mode apply + librewolf.cfg defaults) is gone.
 * Only the LibreWolf prompt gate (StaticPrefs::librewolf_webgl_prompt — the
 * "WebGL is currently disabled." path) is lifted, and only under Pollution.
 */

const MODE_PREF = "darkstr.mode";
const NATIVE_PREF = "darkstr.nativeCompatible";
/** 0054: Pollution requires it (refused otherwise). */
const HOOKS_PREF = "darkstr.nativePersonaHooks";
/** 0054: diagnostics (in memory unless darkstr.debug.diagPrefs). */
const LAST_REFUSAL_PREF = "darkstr.xor.lastRefusal";
/** 0058d: how many times this session refused Pollution without hooks. */
const REFUSAL_COUNT_PREF = "darkstr.xor.refusalCount";
const RFP_PREF = "privacy.resistFingerprinting";
const FPP_PREF = "privacy.fingerprintingProtection";
/** 0057r2: Firefox baseline FPP (default on; canvas randomization among its targets). */
const BASELINE_FPP_PREF = "privacy.baselineFingerprintingProtection";
/**
 * 0057r4: the private-window switches. Gecko: FPP mode in a private window when
 * privacy.fingerprintingProtection.pbmode (default true; strict "fppPrivate"),
 * RFP when privacy.resistFingerprinting.pbmode (nsRFPService::IsFPPEnabled /
 * IsRFPPrefEnabled(aIsPrivateMode)). Either stacks engine canvas noise on
 * darkstr farbling in private windows only.
 */
const FPP_PBMODE_PREF = "privacy.fingerprintingProtection.pbmode";
const RFP_PBMODE_PREF = "privacy.resistFingerprinting.pbmode";
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
 * 0053 (Fable B5): the only prefs darkstr owns, and only while Pollution is
 * on. Their pre-Pollution state is saved once in SAVED_PREF on entry (JSON:
 * per pref {user: had a user value, value}) and restored exactly on exit.
 */
const SAVED_PREF = "darkstr.xor.savedPrefs";
const POLLUTION_PREFS = Object.freeze([
  [RFP_PREF, false],
  [FPP_PREF, false],
  [BASELINE_FPP_PREF, false],
  [FPP_PBMODE_PREF, false],
  [RFP_PBMODE_PREF, false],
  [LIBREWOLF_WEBGL_PROMPT_PREF, false],
]);
/**
 * 0053r2 (Proof): stock Gecko sets this to true whenever
 * browser.contentblocking.category changes (UrlClassifierExceptionListService),
 * and FPP=false under Pollution makes ContentBlockingPrefs flip the category
 * (strict → custom on entry, back on exit). darkstr cannot avoid the flip, so
 * the pref's pre-Pollution state is saved with POLLUTION_PREFS and restored on
 * exit. It is never *set* by darkstr on entry.
 */
const ETP_INTERACTED_PREF =
  "privacy.trackingprotection.allow_list.hasUserInteractedWithETPSettings";
const RESTORE_ONLY_PREFS = Object.freeze([ETP_INTERACTED_PREF]);
/**
 * 0057c: browser.contentblocking.category before Pollution. FPP=false flips it
 * to "custom" (stock matchCBCategory), and stock never flips back at runtime:
 * prefsMatch() rejects every category while the pref holds another value, so
 * only LibreWolf's cfg (pref(), applied at startup) put "strict" back. It is
 * recorded with the saved copy and re-matched in the idle restore pass.
 */
const CATEGORY_RECORD_PREFS = Object.freeze([CB_CATEGORY_PREF]);
const REMATCH_CATEGORIES = Object.freeze(["strict", "standard"]);
/**
 * 0057r2: POLLUTION_PREFS that older builds never wrote. A saved copy made by
 * such a build lacks them while their current value is still the user's /
 * stock one, so it is recorded before darkstr takes them over. (RFP / FPP /
 * the WebGL prompt are never backfilled: an old build may have forced them.)
 */
const BACKFILL_PREFS = Object.freeze([
  BASELINE_FPP_PREF,
  FPP_PBMODE_PREF, // 0057r4
  RFP_PBMODE_PREF, // 0057r4
]);
/** Status format written by 0053+ (diagnostics); anything else is pre-0053. */
const WEBGL_STATUS_TAG = "v53;";
/**
 * Set once, only on a profile a pre-0053 build ran (never on a fresh one), so
 * the legacy clean-up below runs a single time and never touches a value the
 * user sets later.
 */
const MIGRATED_PREF = "darkstr.xor.migrated0053";
/**
 * User values that pre-0053 builds (0029 ModeXor) forced on every startup.
 * Cleared once, and only on a profile a pre-0053 build ran: darkstr.webgl.
 * lastStatus without the 0053 tag (pre-0052, or diag on), or the
 * webgl.forbid-software=false user value every 0029–0052 startup wrote
 * (stock default is true).
 */
const LEGACY_WEBGL_VALUES = Object.freeze([
  [WEBGL_FORCE_ENABLED_PREF, true],
  [GFX_BLOCKLIST_ALL_PREF, -1],
  [WEBGL_FORBID_HARDWARE_PREF, false],
  [WEBGL_FORBID_SOFTWARE_PREF, false],
  [LIBREWOLF_WEBGL_PROMPT_PREF, false],
  [LIBREWOLF_WEBGL_PROMPT_HIDE_PREF, true],
]);

function readUserValue(name) {
  const type = Services.prefs.getPrefType(name);
  if (type === Services.prefs.PREF_BOOL) {
    return Services.prefs.getBoolPref(name);
  }
  if (type === Services.prefs.PREF_INT) {
    return Services.prefs.getIntPref(name);
  }
  if (type === Services.prefs.PREF_STRING) {
    return Services.prefs.getStringPref(name);
  }
  return null;
}

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
  "darkstr.xor.lastRefusal", // 0054
  "darkstr.xor.refusalCount", // 0058d
  "darkstr.persona.lastSnapshotRefusal", // 0058d
  "darkstr.persona.snapshotRefusals", // 0058d
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
  // 0058d: carries darkstr.xor.lastRefusal + darkstr.xor.refusalCount once a
  // refusal happened (memory only; prefs.js only with darkstr.debug.diagPrefs).
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
    // 0053: was this profile last run by a pre-0053 build? (Read before the
    // 0052 sweep removes darkstr.webgl.lastStatus.)
    this._legacyProfile = this._detectLegacyProfile();
    // 0052: drop diagnostics an older build (or a diag session) left behind.
    this._lastSweep = sweepDiagPrefs();
    this._observer = this._observe.bind(this);
    Services.prefs.addObserver(DIAG_PREFS_PREF, this._observer);
    Services.prefs.addObserver(MODE_PREF, this._observer);
    Services.prefs.addObserver(NATIVE_PREF, this._observer);
    Services.prefs.addObserver(HOOKS_PREF, this._observer);
    Services.prefs.addObserver(RFP_PREF, this._observer);
    Services.prefs.addObserver(FPP_PREF, this._observer);
    Services.prefs.addObserver(BASELINE_FPP_PREF, this._observer);
    Services.prefs.addObserver(FPP_PBMODE_PREF, this._observer);
    Services.prefs.addObserver(RFP_PBMODE_PREF, this._observer);
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
      Services.prefs.removeObserver(HOOKS_PREF, this._observer);
      Services.prefs.removeObserver(RFP_PREF, this._observer);
      Services.prefs.removeObserver(FPP_PREF, this._observer);
      Services.prefs.removeObserver(BASELINE_FPP_PREF, this._observer);
      Services.prefs.removeObserver(FPP_PBMODE_PREF, this._observer);
      Services.prefs.removeObserver(RFP_PBMODE_PREF, this._observer);
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
    if (data === MODE_PREF || data === NATIVE_PREF || data === HOOKS_PREF) {
      // 0054: hooks switched off under Pollution -> refused (Homogeneous).
      this.applyModeEffects();
      return;
    }
    if (
      data === RFP_PREF ||
      data === FPP_PREF ||
      data === BASELINE_FPP_PREF ||
      data === FPP_PBMODE_PREF ||
      data === RFP_PBMODE_PREF ||
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
   * 0053: Pollution saves + owns POLLUTION_PREFS; Homogeneous writes nothing
   * except the one-time exact restore when Pollution is switched off.
   * @returns {{ mode: string, nativeCompatible: boolean, xorSafe: boolean }}
   */
  applyModeEffects() {
    if (this._applying) {
      return { mode: "homogeneous", nativeCompatible: false, xorSafe: true };
    }
    this._applying = true;
    try {
      let mode = "homogeneous";
      try {
        mode = Services.prefs.getStringPref(MODE_PREF, "homogeneous");
      } catch (_e) {
        mode = "homogeneous";
      }
      if (mode !== "pollution" && mode !== "homogeneous") {
        mode = "homogeneous";
      }

      // 0054 (Fable B6): Pollution without native persona hooks is refused
      // before any RFP / FPP write: the mode pref goes back to Homogeneous.
      if (mode === "pollution" && !this._hooksOn()) {
        this._refusePollution();
        mode = "homogeneous";
      }

      let nativeCompatible = false;
      try {
        nativeCompatible = Services.prefs.getBoolPref(NATIVE_PREF, false);
      } catch (_e) {
        nativeCompatible = false;
      }

      if (this._legacyProfile) {
        this._legacyProfile = false;
        try {
          Services.prefs.setBoolPref(MIGRATED_PREF, true);
        } catch (_e) {}
        this._clearLegacyWebGlValues();
        if (mode === "pollution" && !Services.prefs.prefHasUserValue(SAVED_PREF)) {
          // A pre-0053 build already forced RFP/FPP off without saving them:
          // the user's own values are unknown, so restore = stock on exit.
          this._savePrefs({ assumeStock: true });
        }
      }

      if (mode === "pollution") {
        this._enterPollution();
      } else {
        this._leavePollution();
      }
      this._recordWebGlStatus(mode);

      const rfp = Services.prefs.getBoolPref(RFP_PREF, false);
      const fpp = Services.prefs.getBoolPref(FPP_PREF, false);
      const baseline = Services.prefs.getBoolPref(BASELINE_FPP_PREF, false);
      const fppPrivate = Services.prefs.getBoolPref(FPP_PBMODE_PREF, false);
      const rfpPrivate = Services.prefs.getBoolPref(RFP_PBMODE_PREF, false);
      // Homogeneous has no constraint: RFP/FPP are whatever the user chose.
      const xorSafe =
        mode === "pollution"
          ? !rfp && !fpp && !baseline && !fppPrivate && !rfpPrivate
          : true;

      return { mode, nativeCompatible, xorSafe };
    } finally {
      this._applying = false;
    }
  },

  _hooksOn() {
    try {
      return Services.prefs.getBoolPref(HOOKS_PREF, false) === true;
    } catch (_e) {
      return false;
    }
  },

  /**
   * 0054: darkstr.mode=pollution with hooks off -> Homogeneous. Clears the
   * user value when the default is Homogeneous (stock), else writes it.
   * Runs inside applyModeEffects (_applying), so the mode observer does not
   * re-enter; the other darkstr modules see the corrected mode at once.
   */
  _refusePollution() {
    this._refusals = (this._refusals || 0) + 1;
    try {
      let def = "homogeneous";
      try {
        def = Services.prefs
          .getDefaultBranch("")
          .getStringPref(MODE_PREF, "homogeneous");
      } catch (_e) {
        def = "homogeneous";
      }
      if (def === "homogeneous" && Services.prefs.prefHasUserValue(MODE_PREF)) {
        Services.prefs.clearUserPref(MODE_PREF);
      }
      if (Services.prefs.getStringPref(MODE_PREF, "homogeneous") !== "homogeneous") {
        Services.prefs.setStringPref(MODE_PREF, "homogeneous");
      }
    } catch (_e) {}
    try {
      diagPrefs.setStringPref(LAST_REFUSAL_PREF, "pollution-without-hooks");
      diagPrefs.setIntPref(REFUSAL_COUNT_PREF, this._refusals);
    } catch (_e) {}
    try {
      console.warn(
        "darkstr 0054: Pollution needs native persona hooks " +
          "(darkstr.nativePersonaHooks); darkstr.mode was set back to Homogeneous."
      );
    } catch (_e) {}
  },

  /** 0053: save the pre-Pollution state of POLLUTION_PREFS (once). */
  _savePrefs({ assumeStock = false } = {}) {
    const saved = { v: 1, prefs: {} };
    for (const name of [
      ...POLLUTION_PREFS.map(([n]) => n),
      ...RESTORE_ONLY_PREFS,
      ...CATEGORY_RECORD_PREFS,
    ]) {
      if (Services.prefs.getPrefType(name) === Services.prefs.PREF_INVALID) {
        continue; // e.g. librewolf.webgl.prompt on a non-LibreWolf build
      }
      const user = !assumeStock && Services.prefs.prefHasUserValue(name);
      saved.prefs[name] = { user, value: user ? readUserValue(name) : null };
    }
    Services.prefs.setStringPref(SAVED_PREF, JSON.stringify(saved));
  },

  _enterPollution() {
    if (!Services.prefs.prefHasUserValue(SAVED_PREF)) {
      this._savePrefs();
    } else {
      this._backfillSavedPrefs();
    }
    for (const [name, value] of POLLUTION_PREFS) {
      try {
        if (Services.prefs.getPrefType(name) === Services.prefs.PREF_INVALID) {
          continue;
        }
        if (Services.prefs.getBoolPref(name) !== value) {
          Services.prefs.setBoolPref(name, value);
        }
      } catch (_e) {}
    }
  },

  /**
   * 0057r2: a profile already in Pollution under an older build has a saved
   * copy without records for prefs darkstr owns only since then (baseline
   * FPP). darkstr never wrote those before, so their current state is still
   * the user's / stock: record it now, before taking them over, so leaving
   * Pollution restores them exactly. Existing records are never changed.
   */
  _backfillSavedPrefs() {
    let saved = null;
    try {
      saved = JSON.parse(Services.prefs.getStringPref(SAVED_PREF, ""));
    } catch (_e) {
      return; // unreadable: leave it (restore skips missing records)
    }
    if (!saved || typeof saved !== "object" || !saved.prefs) {
      return;
    }
    let changed = false;
    for (const name of BACKFILL_PREFS) {
      if (saved.prefs[name]) {
        continue;
      }
      if (Services.prefs.getPrefType(name) === Services.prefs.PREF_INVALID) {
        continue;
      }
      const user = Services.prefs.prefHasUserValue(name);
      saved.prefs[name] = { user, value: user ? readUserValue(name) : null };
      changed = true;
    }
    if (changed) {
      Services.prefs.setStringPref(SAVED_PREF, JSON.stringify(saved));
    }
  },

  /** 0053: exact restore of what _savePrefs recorded; no-op without it. */
  _leavePollution() {
    if (!Services.prefs.prefHasUserValue(SAVED_PREF)) {
      return;
    }
    let saved = null;
    try {
      saved = JSON.parse(Services.prefs.getStringPref(SAVED_PREF, ""));
    } catch (_e) {
      saved = null;
    }
    const entries = (saved && saved.prefs) || {};
    const restore = (name) => {
      const rec = entries[name];
      if (!rec) {
        return; // saved by 0053 before r2 (no record): left as it is
      }
      try {
        if (rec.user === true && typeof rec.value === "boolean") {
          if (Services.prefs.getBoolPref(name) !== rec.value) {
            Services.prefs.setBoolPref(name, rec.value);
          }
        } else if (rec.user !== true && Services.prefs.prefHasUserValue(name)) {
          Services.prefs.clearUserPref(name);
        }
      } catch (_e) {}
    };
    for (const [name] of POLLUTION_PREFS) {
      restore(name);
    }
    // 0053r2: after RFP/FPP are back, the stock category flip has already set
    // the ETP-interaction flag (synchronous pref observers); restore it now
    // and once more after any deferred category re-match.
    for (const name of RESTORE_ONLY_PREFS) {
      restore(name);
    }
    // 0057c: idle restore pass — once ContentBlockingPrefs has seen the
    // restored prefs, put the pre-Pollution category back if they fit it
    // again (no restart needed), then undo the flag the category change sets.
    const categoryRec = entries[CB_CATEGORY_PREF] || null;
    try {
      Services.tm.idleDispatchToMainThread(() => {
        this._rematchCBCategory(categoryRec);
        for (const name of RESTORE_ONLY_PREFS) {
          restore(name);
        }
      });
    } catch (_e) {}
    try {
      Services.prefs.clearUserPref(SAVED_PREF);
    } catch (_e) {}
  },

  /** ContentBlockingPrefs (parent); tests inject a stand-in. */
  _contentBlockingPrefs() {
    if (this._cbPrefsForTest) {
      return this._cbPrefsForTest;
    }
    try {
      return ChromeUtils.importESModule(
        "moz-src:///browser/components/protections/ContentBlockingPrefs.sys.mjs"
      ).ContentBlockingPrefs;
    } catch (_e) {
      return null;
    }
  },

  /**
   * Category-defining prefs that do not have that category's value
   * ([name, expected] pairs), or null when the category is unknown.
   */
  _cbMismatches(cbp, category) {
    if (!cbp.CATEGORY_PREFS?.[category] && cbp.setPrefExpectations) {
      cbp.setPrefExpectations();
    }
    const defs = cbp.CATEGORY_PREFS?.[category];
    if (!defs) {
      return null;
    }
    const out = [];
    for (const [pref, value] of Object.entries(defs)) {
      // Same exemptions as stock prefsMatch (user may change these in strict).
      if (
        pref === cbp.PREF_ALLOW_LIST_BASELINE ||
        pref === cbp.PREF_ALLOW_LIST_CONVENIENCE
      ) {
        continue;
      }
      if (value === null || value === undefined) {
        if (Services.prefs.prefHasUserValue(pref)) {
          out.push([pref, null]);
        }
        continue;
      }
      let current;
      try {
        current = readUserValue(pref);
      } catch (_e) {
        out.push([pref, value]);
        continue;
      }
      // Stock semantics: a pref that does not exist is not a mismatch; loose !=.
      // eslint-disable-next-line eqeqeq
      if (current !== null && current != value) {
        out.push([pref, value]);
      }
    }
    return out;
  },

  /**
   * 0057c: after leaving Pollution, re-match browser.contentblocking.category
   * to its pre-Pollution value when (and only when) it is still the "custom"
   * that Pollution's FPP=false caused and every category pref fits the saved
   * category again. switchingCategory keeps ContentBlockingPrefs from
   * rewriting any pref (they already match). A category the user changed
   * meanwhile, a saved "custom", or no record (older saved copy): untouched.
   * @returns {string} what happened (diagnostics / tests)
   */
  _rematchCBCategory(rec) {
    let result = "no-record";
    try {
      if (!rec) {
        return result;
      }
      if (Services.prefs.getStringPref(MODE_PREF, "homogeneous") === "pollution") {
        return (result = "pollution");
      }
      const current = Services.prefs.getStringPref(CB_CATEGORY_PREF, "");
      const target =
        rec.user === true && typeof rec.value === "string"
          ? rec.value
          : Services.prefs.getDefaultBranch?.("")?.getStringPref(CB_CATEGORY_PREF, "") || "";
      if (current === target) {
        return (result = "already");
      }
      if (current !== "custom" || !REMATCH_CATEGORIES.includes(target)) {
        return (result = "left");
      }
      const cbp = this._contentBlockingPrefs();
      const miss = cbp ? this._cbMismatches(cbp, target) : null;
      if (!miss) {
        return (result = "no-fit");
      }
      // A profile whose first start is already in Pollution saved the
      // Pollution prefs before ContentBlockingPrefs applied the category (FPP
      // had no user value yet), so restoring them leaves e.g. FPP=false under
      // "strict". Only when every mismatch is one of ModeXor's own Pollution
      // prefs, give those the category's value — what the cfg + stock
      // setPrefsToCategory do at the next start. Anything else: no-fit.
      const own = new Set(POLLUTION_PREFS.map(([n]) => n));
      if (miss.some(([name, v]) => !own.has(name) || typeof v !== "boolean")) {
        return (result = "no-fit");
      }
      for (const [name, v] of miss) {
        Services.prefs.setBoolPref(name, v);
      }
      if (miss.length) {
        this._lastCategoryFixed = miss.map(([n]) => n);
      }
      if (Services.prefs.getStringPref(CB_CATEGORY_PREF, "") === target) {
        // stock matchCBCategory already re-matched on the pref change
        return (result = "rematched:" + target + (miss.length ? "+own" : ""));
      }
      const was = !!cbp.switchingCategory;
      cbp.switchingCategory = true;
      try {
        if (rec.user === true) {
          Services.prefs.setStringPref(CB_CATEGORY_PREF, target);
        } else {
          Services.prefs.clearUserPref(CB_CATEGORY_PREF);
        }
      } finally {
        cbp.switchingCategory = was;
      }
      return (result = "rematched:" + target + (miss.length ? "+own" : ""));
    } catch (_e) {
      return (result = "error");
    } finally {
      this._lastCategoryRematch = result;
      try {
        diagPrefs.setStringPref("darkstr.xor.lastCategoryRematch", result);
      } catch (_e2) {}
    }
  },

  _detectLegacyProfile() {
    try {
      if (Services.prefs.getBoolPref(MIGRATED_PREF, false)) {
        return false;
      }
      if (Services.prefs.prefHasUserValue(WEBGL_LAST_STATUS_PREF)) {
        const status = Services.prefs.getStringPref(WEBGL_LAST_STATUS_PREF, "");
        if (!status.startsWith(WEBGL_STATUS_TAG)) {
          return true;
        }
      }
      return (
        Services.prefs.prefHasUserValue(WEBGL_FORBID_SOFTWARE_PREF) &&
        Services.prefs.getBoolPref(WEBGL_FORBID_SOFTWARE_PREF) === false
      );
    } catch (_e) {
      return false;
    }
  },

  /** 0053: undo the 0029 WebGL user values a pre-0053 build left (clear only). */
  _clearLegacyWebGlValues() {
    const cleared = [];
    for (const [name, forced] of LEGACY_WEBGL_VALUES) {
      try {
        if (
          Services.prefs.prefHasUserValue(name) &&
          readUserValue(name) === forced
        ) {
          Services.prefs.clearUserPref(name);
          cleared.push(name);
        }
      } catch (_e) {}
    }
    this._legacyCleared = cleared;
    return cleared;
  },

  /** Diagnostics only (in memory unless darkstr.debug.diagPrefs): no pref writes. */
  _recordWebGlStatus(mode) {
    try {
      const g = (name, fallback) => {
        try {
          const v = readUserValue(name);
          return v === null ? fallback : String(v);
        } catch (_e) {
          return "err";
        }
      };
      const prompt = g(LIBREWOLF_WEBGL_PROMPT_PREF, "absent");
      const disabled = g(WEBGL_DISABLED_PREF, "?");
      const bits = [
        "mode=" + mode,
        "disabled=" + disabled,
        "force-enabled=" + g(WEBGL_FORCE_ENABLED_PREF, "?"),
        "blocklist.all=" + g(GFX_BLOCKLIST_ALL_PREF, "?"),
        "librewolf.webgl.prompt=" + prompt,
        this._gfxFeatureStatusSnippet(),
      ];
      const ok = disabled === "false" && prompt !== "true";
      diagPrefs.setBoolPref(WEBGL_ENSURE_APPLIED_PREF, ok);
      diagPrefs.setStringPref(
        WEBGL_LAST_STATUS_PREF,
        (WEBGL_STATUS_TAG + bits.join(",")).slice(0, 400)
      );
    } catch (_e) {}
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
