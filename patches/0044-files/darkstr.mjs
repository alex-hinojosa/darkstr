/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";

// Same chrome prefs as extension Settings. One mode at a time.
// Hooks default off and only apply in Pollution.
// Leaving Pollution clears hooks (pref false), not just the disabled gate.
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
    disabled: ({ darkstrMode }) => darkstrMode.value !== "pollution",
  });
}
