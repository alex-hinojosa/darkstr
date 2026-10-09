/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr M3 — JSWindowActor parent for the navigator persona.
 * Brand: darkstr — not official LibreWolf.
 *
 * 0051 persona surface: the child installs synchronously through the ppmm
 * "DarkstrNativePersona:Install" listener in DarkstrNativePersona.sys.mjs
 * (one decision per document, shared with the HTTP User-Agent /
 * Accept-Language of every request that document makes). This actor only
 *   - answers the legacy async GetSnapshot query from that same decision, and
 *   - clears a BrowsingContext.languageOverride an older build left behind.
 * No global languages / accept-languages writes, no languageOverride pulse
 * (they were global "last site wins" signals across tabs — Rowan N3).
 * Timezone override (0028) is set by installForWindowGlobal for top-level
 * documents.
 */

export class DarkstrNativePersonaParent extends JSWindowActorParent {
  receiveMessage(message) {
    if (message.name !== "DarkstrNativePersona:GetSnapshot") {
      return null;
    }
    try {
      const { DarkstrNativePersona } = ChromeUtils.importESModule(
        "moz-src:///browser/components/DarkstrNativePersona.sys.mjs"
      );
      this._clearLegacyLanguageOverride();
      const result = DarkstrNativePersona.installForWindowGlobal(this.manager);
      return result?.snapshot || null;
    } catch (_e) {
      return null;
    }
  }

  _clearLegacyLanguageOverride() {
    try {
      const top = this.browsingContext?.top;
      if (top && top.languageOverride) {
        top.languageOverride = "";
      }
    } catch (_e) {}
  }
}
