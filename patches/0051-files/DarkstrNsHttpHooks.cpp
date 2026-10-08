/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=8 et tw=80 : */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DarkstrNsHttpHooks.h"

#include "nsHttp.h"
#include "nsHttpRequestHead.h"
#include "mozilla/Preferences.h"
#include "nsString.h"

namespace mozilla::net {

static constexpr const char* kClientHintHeaders[] = {
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
    "sec-ch-ua-platform-version",
    "sec-ch-ua-arch",
    "sec-ch-ua-bitness",
    "sec-ch-ua-model",
    "sec-ch-ua-full-version-list",
    "sec-ch-ua-wow64",
};

bool DarkstrNsHttpHooks::PollutionNativeHooksActive() {
  if (!Preferences::GetBool("darkstr.nativePersonaHooks", false)) {
    return false;
  }
  if (Preferences::GetBool("darkstr.nativeCompatible", false)) {
    return false;
  }
  nsAutoCString mode;
  Preferences::GetCString("darkstr.mode", mode);
  return mode.EqualsLiteral("pollution");
}

const nsCString* DarkstrNsHttpHooks::UserAgentOverride() {
  // darkstr 0051 (Rowan N2): no global User-Agent override. The persona UA
  // and Accept-Language are set per request in chrome
  // (DarkstrNativePersona._onModifyRequest) from the requesting document's
  // own decision; a process-wide pref cannot tell tabs apart.
  return nullptr;
}

void DarkstrNsHttpHooks::RemoveClientHintHeaders(nsHttpRequestHead* aRequest) {
  if (!aRequest || !PollutionNativeHooksActive()) {
    return;
  }
  for (const char* name : kClientHintHeaders) {
    nsHttpAtom atom = nsHttp::ResolveAtom(nsDependentCString(name));
    if (atom && aRequest->HasHeader(atom)) {
      (void)aRequest->ClearHeader(atom);
    }
  }
}

}  // namespace mozilla::net
