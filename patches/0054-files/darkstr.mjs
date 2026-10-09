/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";

// Same chrome prefs as extension Settings. One mode at a time.
// 0054 (Fable B6): Pollution requires native persona hooks. Choosing
// Pollution turns hooks on first (then writes the mode), leaving Pollution
// clears them, and the hooks checkbox only shows the state: "Pollution on,
// hooks off" cannot be set here. DarkstrModeXor refuses it from any other
// writer. Native-Compatible stays the escape (native identity in Pollution).
// addSetting throws unless the pref is registered first.
Preferences.addAll([
  { id: "darkstr.mode", type: "string" },
  { id: "darkstr.nativeCompatible", type: "bool" },
  { id: "darkstr.nativePersonaHooks", type: "bool" },
]);

if (!Preferences.getSetting("darkstrMode")) {
  Preferences.addSetting({
    id: "darkstrMode",
    pref: "darkstr.mode",
    set(value) {
      // Hooks before mode: ModeXor never sees Pollution without hooks.
      if (value === "pollution") {
        Services.prefs.setBoolPref("darkstr.nativePersonaHooks", true);
      }
      return value;
    },
    onUserChange(value) {
      if (value !== "pollution") {
        const hooks = Preferences.getSetting("darkstrNativePersonaHooks");
        if (hooks) {
          hooks.value = false;
        }
      }
    },
  });
}

if (!Preferences.getSetting("darkstrNativeCompatible")) {
  Preferences.addSetting({
    id: "darkstrNativeCompatible",
    pref: "darkstr.nativeCompatible",
  });
}

if (!Preferences.getSetting("darkstrNativePersonaHooks")) {
  Preferences.addSetting({
    id: "darkstrNativePersonaHooks",
    pref: "darkstr.nativePersonaHooks",
    deps: ["darkstrMode"],
    // 0054: display only -- on exactly while Pollution is on.
    disabled: () => true,
    set(value, { darkstrMode }) {
      return darkstrMode?.value === "pollution" ? true : value;
    },
  });
}
