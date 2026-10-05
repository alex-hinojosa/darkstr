/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from preferences.js */
/* import-globals-from main.js */

"use strict";

ChromeUtils.importESModule(
  "chrome://browser/content/preferences/config/darkstr.mjs"
);

var gDarkstrPane = {
  _pane: null,

  init() {
    this._pane = document.getElementById("paneDarkstr");
    initSettingGroup("darkstrPersona");
    Services.obs.notifyObservers(window, "darkstr-pane-loaded");
  },
};
