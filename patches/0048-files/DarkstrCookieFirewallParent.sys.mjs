/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr Phase 5 — Cookie firewall JSWindowActor parent. Pins 0035 / 0048.
 * Brand: darkstr — not official LibreWolf.
 *
 * Script-path writes IPC here so HTTP observers and document.cookie /
 * CookieStore share one sandbox jar. Policy always comes from this actor's
 * WindowGlobalParent (document principal + top-level principal), never from
 * data supplied by the content process. Install arrives as a sync ppmm
 * message handled in DarkstrCookieFirewall, which registers this actor as a
 * delta target; it is forgotten when its document goes away.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  DarkstrCookieFirewall:
    "moz-src:///browser/components/DarkstrCookieFirewall.sys.mjs",
});

export class DarkstrCookieFirewallParent extends JSWindowActorParent {
  receiveMessage(message) {
    try {
      const FW = lazy.DarkstrCookieFirewall;
      const wgp = this.manager;
      switch (message.name) {
        case "DarkstrCookieFirewall:SetDocumentCookie":
          return FW.setDocumentCookie(wgp, message.data?.raw ?? "");
        case "DarkstrCookieFirewall:GetDocumentCookie":
          return FW.getDocumentCookie(wgp);
        case "DarkstrCookieFirewall:GetPolicy":
          return FW.policyForBrowsingContext(this.browsingContext);
        case "DarkstrCookieFirewall:InstallStatus":
          FW.recordInstallStatus(message.data, this.browsingContext);
          return null;
        default:
          return null;
      }
    } catch (error) {
      console.error("darkstr 0048 cookie parent IPC failed", error);
    }
    return null;
  }

  didDestroy() {
    try {
      lazy.DarkstrCookieFirewall.forgetActor(this);
    } catch (_e) {}
  }
}
