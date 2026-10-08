/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=8 et tw=80 : */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr M3-CPP-NAV — thin Navigator call-ins (train-pinned LibreWolf/Firefox 155.0.1-1).
 *
 * Brand: darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.
 * No Rust FFI. Client Hints REMOVE remains in DarkstrNsHttpHooks (0005).
 *
 * Minimum field set (chrome DarkstrNativePersonaChild parity, sans deviceMemory /
 * userAgentData which stay chrome-JS on Firefox host):
 *   userAgent, platform, hardwareConcurrency, languages
 *
 * Reads chrome-mirrored prefs written by DarkstrNativePersona (0006).
 * Gate: pollution + darkstr.nativePersonaHooks (default false) + !nativeCompatible
 * + DocShell SubsequentNav arm when darkstr.strictFirstDoc (0020 / phase mirror).
 */

#ifndef mozilla_dom_DarkstrNavigatorHooks_h
#define mozilla_dom_DarkstrNavigatorHooks_h

#include "js/TypeDecls.h"
#include "mozilla/AlreadyAddRefed.h"
#include "nsISupportsImpl.h"
#include "nsString.h"
#include "nsStringFwd.h"
#include "nsTArray.h"

namespace mozilla::dom {

class WorkerPrivate;
struct WorkerLoadInfo;

/**
 * darkstr 0049 — per-worker persona (immutable once resolved).
 *
 * Resolved once on the main thread when a top-level worker (dedicated,
 * shared or service) is constructed, from the creating document's 0051
 * decision (dedicated) or the owning site's decision (shared/service, top
 * level site of the partition). Nested workers share their parent's entry.
 * Empty fields mean "native" (plain Firefox value).
 */
class DarkstrWorkerPersona final {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(DarkstrWorkerPersona)

  nsString mUserAgent;
  nsString mPlatform;
  uint32_t mHardwareConcurrency = 0;
  nsTArray<nsString> mLanguages;
  nsString mTimezone;
  // Depth prelude (OffscreenCanvas/WebGL/WebGPU, 0043) evaluated in the
  // worker global before the main script. Navigator is never touched in JS.
  nsString mPrelude;
  nsCString mScriptURL;

  bool HasNavigator() const { return !mUserAgent.IsEmpty(); }

 private:
  ~DarkstrWorkerPersona() = default;
};

class DarkstrNavigatorHooks final {
 public:
  static bool PollutionNativeHooksActive();

  /** true → aOut filled from darkstr.persona.ua */
  static bool TryGetUserAgent(nsAString& aOut);
  /** true → aOut filled from darkstr.persona.platform */
  static bool TryGetPlatform(nsAString& aOut);
  /** true → aOut from darkstr.persona.hardwareConcurrency (>0) */
  static bool TryGetHardwareConcurrency(uint64_t& aOut);
  /** true → aOut from darkstr.persona.languages (comma-separated) */
  static bool TryGetLanguages(nsTArray<nsString>& aOut);

  // ---- darkstr 0049 worker coherence (native WorkerNavigator) ----

  /**
   * Main thread (top-level worker) or parent worker thread (nested). Asks
   * chrome (observer "darkstr-worker-persona-resolve", answered by the
   * DarkstrWorkerPersona process actor) for the worker's persona. Writes
   * languages / timezone into aLoadInfo so the stock worker plumbing
   * carries them. Returns null when hooks are off or the decision is native.
   */
  static already_AddRefed<DarkstrWorkerPersona> ResolveWorkerPersona(
      WorkerPrivate* aParent, bool aIsChromeWorker, const char* aKind,
      const nsAString& aScriptURL, WorkerLoadInfo& aLoadInfo);
  static void RegisterWorkerPersona(const WorkerPrivate* aWorker,
                                    DarkstrWorkerPersona* aPersona);
  static void ForgetWorkerPersona(const WorkerPrivate* aWorker);
  static already_AddRefed<DarkstrWorkerPersona> PersonaForWorker(
      const WorkerPrivate* aWorker);
  /** Worker thread: evaluate the depth prelude (if any) in aGlobal. */
  static void RunWorkerPrelude(JSContext* aCx, const WorkerPrivate* aWorker,
                               JS::Handle<JSObject*> aGlobal);

 private:
  DarkstrNavigatorHooks() = delete;
  ~DarkstrNavigatorHooks() = delete;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_DarkstrNavigatorHooks_h
