/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=8 et tw=80 : */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr M3-CPP — thin nsHttp call-ins (train-pinned LibreWolf/Firefox 155.0.1-1).
 *
 * Brand: darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.
 * No Rust FFI / XPCOM crate link in this drop.
 *
 * Surfaces (this file):
 *   1) User-Agent override from chrome-mirrored `darkstr.persona.ua` (or snapshot JSON)
 *      when pollution + darkstr.nativePersonaHooks + SubsequentNav arm (0020).
 *   2) Client Hints REMOVE only (never SET) on the request head (pollution+hooks;
 *      not gated on strict-next-nav — chrome 0003 parity).
 *
 * DocShell phase SoT: 0007; SubsequentNav arm wiring: 0020.
 */

#ifndef mozilla_net_DarkstrNsHttpHooks_h
#define mozilla_net_DarkstrNsHttpHooks_h

#include "nsStringFwd.h"

class nsHttpRequestHead;

namespace mozilla::net {

class DarkstrNsHttpHooks final {
 public:
  /** pollution && nativePersonaHooks && !nativeCompatible */
  static bool PollutionNativeHooksActive();

  /**
   * 0051: always null. The persona User-Agent is per request (chrome,
   * DarkstrNativePersona._onModifyRequest), never a process-wide pref.
   */
  static const nsCString* UserAgentOverride();

  /** REMOVE Client Hint request headers if present; never SET. */
  static void RemoveClientHintHeaders(nsHttpRequestHead* aRequest);

 private:
  DarkstrNsHttpHooks() = delete;
  ~DarkstrNsHttpHooks() = delete;
};

}  // namespace mozilla::net

#endif  // mozilla_net_DarkstrNsHttpHooks_h
