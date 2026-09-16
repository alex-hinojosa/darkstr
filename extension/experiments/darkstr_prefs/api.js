/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr Phase 2 — WebExtension Experiment parent (fork / temporary-load).
 *
 * Writes Proof-pin darkstr.* via Services.prefs. Chrome is authoritative.
 * Does NOT write privacy.* (DarkstrModeXor / 0002 owns RFP/FPP XOR).
 * Stock LibreWolf companion without experiments: API absent → storage-only.
 *
 * Brand: darkstr — not official LibreWolf. Pollution tool, not Cloudflare bypass.
 * Hooks (darkstr.nativePersonaHooks) stay default-off; this API never flips them on.
 */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.sys.mjs",
});

const MODE_PREF = "darkstr.mode";
const NATIVE_PREF = "darkstr.nativeCompatible";
const SITES_PREF = "darkstr.nativeCompatSites";
const STRICT_PREF = "darkstr.strictFirstDoc";
const HOOKS_PREF = "darkstr.nativePersonaHooks";

const BRIDGE_PREF_NAMES = [
  MODE_PREF,
  NATIVE_PREF,
  SITES_PREF,
  STRICT_PREF,
  HOOKS_PREF,
];

function normalizeMode(raw) {
  return raw === "pollution" ? "pollution" : "homogeneous";
}

function readSitesObject() {
  let raw = "{}";
  try {
    raw = Services.prefs.getStringPref(SITES_PREF, "{}");
  } catch (_e) {
    raw = "{}";
  }
  try {
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === true && typeof k === "string" && k) {
        out[k] = true;
      }
    }
    return out;
  } catch (_e) {
    return {};
  }
}

function readAllPrefs() {
  let mode = "homogeneous";
  try {
    mode = normalizeMode(Services.prefs.getStringPref(MODE_PREF, "homogeneous"));
  } catch (_e) {
    mode = "homogeneous";
  }

  let nativeCompatible = false;
  try {
    nativeCompatible = Services.prefs.getBoolPref(NATIVE_PREF, false);
  } catch (_e) {
    nativeCompatible = false;
  }

  let strictFirstDoc = true;
  try {
    strictFirstDoc = Services.prefs.getBoolPref(STRICT_PREF, true);
  } catch (_e) {
    strictFirstDoc = true;
  }

  // Default-off: only true when explicitly set.
  let nativePersonaHooks = false;
  try {
    nativePersonaHooks = Services.prefs.getBoolPref(HOOKS_PREF, false);
  } catch (_e) {
    nativePersonaHooks = false;
  }

  return {
    [MODE_PREF]: mode,
    [NATIVE_PREF]: nativeCompatible,
    [SITES_PREF]: readSitesObject(),
    [STRICT_PREF]: strictFirstDoc,
    [HOOKS_PREF]: nativePersonaHooks,
  };
}

function writePartial(partial) {
  if (!partial || typeof partial !== "object") {
    return readAllPrefs();
  }

  if (Object.prototype.hasOwnProperty.call(partial, MODE_PREF)) {
    Services.prefs.setStringPref(MODE_PREF, normalizeMode(partial[MODE_PREF]));
  }
  if (Object.prototype.hasOwnProperty.call(partial, NATIVE_PREF)) {
    Services.prefs.setBoolPref(NATIVE_PREF, partial[NATIVE_PREF] === true);
  }
  if (Object.prototype.hasOwnProperty.call(partial, STRICT_PREF)) {
    Services.prefs.setBoolPref(STRICT_PREF, partial[STRICT_PREF] !== false);
  }
  if (Object.prototype.hasOwnProperty.call(partial, HOOKS_PREF)) {
    // Explicit false sticks; never coerce missing → true.
    Services.prefs.setBoolPref(HOOKS_PREF, partial[HOOKS_PREF] === true);
  }
  if (Object.prototype.hasOwnProperty.call(partial, SITES_PREF)) {
    const sites = partial[SITES_PREF];
    const cleaned = {};
    if (sites && typeof sites === "object" && !Array.isArray(sites)) {
      for (const [k, v] of Object.entries(sites)) {
        if (v === true && typeof k === "string" && k) {
          cleaned[k] = true;
        }
      }
    }
    Services.prefs.setStringPref(SITES_PREF, JSON.stringify(cleaned));
  }

  return readAllPrefs();
}

this.darkstrPrefs = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const { EventManager } = ExtensionCommon;

    return {
      darkstrPrefs: {
        async isAvailable() {
          return true;
        },

        async getAll() {
          return readAllPrefs();
        },

        async setPrefs(partial) {
          return writePartial(partial);
        },

        onChanged: new EventManager({
          context,
          name: "darkstrPrefs.onChanged",
          register: (fire) => {
            const observer = (_subject, topic, data) => {
              if (topic !== "nsPref:changed") {
                return;
              }
              if (!BRIDGE_PREF_NAMES.includes(data)) {
                return;
              }
              try {
                fire.async({ name: data, prefs: readAllPrefs() });
              } catch (_e) {
                // Listener may be gone during shutdown.
              }
            };
            for (const name of BRIDGE_PREF_NAMES) {
              Services.prefs.addObserver(name, observer);
            }
            return () => {
              for (const name of BRIDGE_PREF_NAMES) {
                try {
                  Services.prefs.removeObserver(name, observer);
                } catch (_e) {}
              }
            };
          },
        }).api(),
      },
    };
  }
};
