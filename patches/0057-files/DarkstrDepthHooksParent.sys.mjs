/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr Phase 3 pin 2 — JSWindowActor parent. Returns depth seeds and
 * persists content-install diagnostics in chrome prefs.
 * Brand: darkstr — not official LibreWolf.
 */

export class DarkstrDepthHooksParent extends JSWindowActorParent {
  receiveMessage(message) {
    try {
      const { DarkstrDepthHooks } = ChromeUtils.importESModule(
        "moz-src:///browser/components/DarkstrDepthHooks.sys.mjs"
      );
      if (message.name === "DarkstrDepthHooks:GetSeeds") {
        // 0057: seeds for THIS document (its own WindowGlobalParent), not
        // whatever document the browsing context currently shows.
        return DarkstrDepthHooks.depthSeedsForBrowsingContext(
          this.browsingContext,
          this.manager
        );
      }
      if (message.name === "DarkstrDepthHooks:InstallStatus") {
        DarkstrDepthHooks.recordInstallStatus(
          message.data,
          this.browsingContext
        );
      }
    } catch (error) {
      console.error("darkstr depth parent IPC failed", error);
    }
    return null;
  }
}
