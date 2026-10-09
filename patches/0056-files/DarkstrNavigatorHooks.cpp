/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=8 et tw=80 : */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DarkstrNavigatorHooks.h"

#include "js/CompilationAndEvaluation.h"
#include "js/CompileOptions.h"
#include "js/SourceText.h"
#include "jsapi.h"
#include "mozilla/Preferences.h"
#include "mozilla/Services.h"
#include "mozilla/StaticMutex.h"
#include "mozilla/dom/WorkerLoadInfo.h"
#include "mozilla/dom/WorkerPrivate.h"
#include "nsCharSeparatedTokenizer.h"
#include "nsHashPropertyBag.h"
#include "nsIObserverService.h"
#include "nsIPrincipal.h"
#include "nsPIDOMWindow.h"
#include "nsReadableUtils.h"
#include "nsString.h"
#include "nsTHashMap.h"
#include "nsThreadUtils.h"

namespace mozilla::dom {

namespace {

/**
 * SubsequentNav arm. Prefer bool mirror (content-safe under Fission sanitization);
 * string docShellPhase is a dynamic string and is omitted from web content processes.
 */
bool StrictNextNavArmedMirror() {
  // Chrome DarkstrNativePersona._syncStrictNextNavArmedDiag writes this bool.
  if (Preferences::GetBool("darkstr.docshell.strictNextNavArmed", false)) {
    return true;
  }
  if (!Preferences::GetBool("darkstr.strictFirstDoc", true)) {
    return true;
  }
  // Parent / non-sanitized fallback only.
  nsAutoCString phase;
  if (NS_FAILED(Preferences::GetCString("darkstr.persona.docShellPhase", phase)) ||
      phase.IsEmpty()) {
    return false;
  }
  return phase.EqualsLiteral("subsequent_nav");
}

}  // namespace

bool DarkstrNavigatorHooks::PollutionNativeHooksActive() {
  if (!Preferences::GetBool("darkstr.nativePersonaHooks", false)) {
    return false;
  }
  if (Preferences::GetBool("darkstr.nativeCompatible", false)) {
    return false;
  }
  // Bool mirror — darkstr.mode is a dynamic string sanitized from content procs.
  if (Preferences::GetBool("darkstr.pollutionActive", false)) {
    return true;
  }
  nsAutoCString mode;
  Preferences::GetCString("darkstr.mode", mode);
  return mode.EqualsLiteral("pollution");
}

bool DarkstrNavigatorHooks::TryGetUserAgent(nsAString& aOut) {
  aOut.Truncate();
  if (!PollutionNativeHooksActive() || !StrictNextNavArmedMirror()) {
    return false;
  }
  nsAutoCString ua;
  if (NS_FAILED(Preferences::GetCString("darkstr.persona.ua", ua)) ||
      ua.IsEmpty()) {
    return false;
  }
  CopyASCIItoUTF16(ua, aOut);
  return !aOut.IsEmpty();
}

bool DarkstrNavigatorHooks::TryGetPlatform(nsAString& aOut) {
  aOut.Truncate();
  if (!PollutionNativeHooksActive() || !StrictNextNavArmedMirror()) {
    return false;
  }
  nsAutoCString platform;
  if (NS_FAILED(Preferences::GetCString("darkstr.persona.platform", platform)) ||
      platform.IsEmpty()) {
    return false;
  }
  CopyASCIItoUTF16(platform, aOut);
  return !aOut.IsEmpty();
}

bool DarkstrNavigatorHooks::TryGetHardwareConcurrency(uint64_t& aOut) {
  aOut = 0;
  if (!PollutionNativeHooksActive() || !StrictNextNavArmedMirror()) {
    return false;
  }
  // Int mirror (0006). Int prefs are not Fission-sanitized like dynamic strings.
  int32_t hw = Preferences::GetInt("darkstr.persona.hardwareConcurrency", 0);
  if (hw <= 0) {
    nsAutoCString hwStr;
    if (NS_SUCCEEDED(
            Preferences::GetCString("darkstr.persona.hardwareConcurrency",
                                    hwStr)) &&
        !hwStr.IsEmpty()) {
      nsresult rv;
      int32_t parsed = hwStr.ToInteger(&rv);
      if (NS_SUCCEEDED(rv) && parsed > 0) {
        hw = parsed;
      }
    }
  }
  // After gates pass, NEVER fall closed to host core count (Proof P0 / 0027).
  // Persona default 8 when mirror missing — do not require sanitized UA string.
  if (hw <= 0) {
    hw = 8;
  }
  aOut = static_cast<uint64_t>(hw);
  return true;
}

bool DarkstrNavigatorHooks::TryGetLanguages(nsTArray<nsString>& aOut) {
  aOut.Clear();
  if (!PollutionNativeHooksActive() || !StrictNextNavArmedMirror()) {
    return false;
  }
  nsAutoCString langs;
  if (NS_FAILED(Preferences::GetCString("darkstr.persona.languages", langs)) ||
      langs.IsEmpty()) {
    return false;
  }
  for (const nsDependentCSubstring& tok :
       nsCCharSeparatedTokenizer(langs, ',').ToRange()) {
    if (!tok.IsEmpty()) {
      aOut.AppendElement(NS_ConvertUTF8toUTF16(tok));
    }
  }
  return !aOut.IsEmpty();
}

// ---------------------------------------------------------------------------
// darkstr 0049: worker coherence. One persona per top-level worker, taken
// from the creating document's 0051 decision (dedicated) or the owning
// site's decision (shared/service). WorkerNavigator reads it natively; no
// script wrapping, so location / importScripts / constructors stay stock.
// ---------------------------------------------------------------------------

namespace {

constexpr const char kDarkstrWorkerPersonaTopic[] = "darkstr-worker-persona-resolve";

StaticMutex sDarkstrWorkerPersonaMutex MOZ_UNANNOTATED;
// Leaked on purpose (process lifetime); entries are removed in
// ~WorkerPrivate so the table only holds live workers.
nsTHashMap<nsPtrHashKey<const void>, RefPtr<DarkstrWorkerPersona>>*
    sDarkstrWorkerPersonas = nullptr;

void DarkstrParseWorkerLanguages(const nsAString& aCsv, nsTArray<nsString>& aOut) {
  aOut.Clear();
  for (const nsAString& tok :
       nsCharSeparatedTokenizer(aCsv, ',').ToRange()) {
    nsAutoString t(tok);
    t.Trim(" \t");
    if (!t.IsEmpty()) {
      aOut.AppendElement(t);
    }
  }
}

}  // namespace

/* static */
already_AddRefed<DarkstrWorkerPersona>
DarkstrNavigatorHooks::ResolveWorkerPersona(WorkerPrivate* aParent,
                                            bool aIsChromeWorker,
                                            const char* aKind,
                                            const nsAString& aScriptURL,
                                            WorkerLoadInfo& aLoadInfo) {
  if (aIsChromeWorker) {
    return nullptr;
  }
  if (aParent) {
    // Nested worker: same persona as the worker that created it. Languages
    // and timezone were already inherited through GetLoadInfo(aParent).
    return PersonaForWorker(aParent);
  }
  if (!NS_IsMainThread()) {
    return nullptr;
  }
  // Default prefs (hooks off): no observer call at all — plain Firefox.
  if (!PollutionNativeHooksActive()) {
    return nullptr;
  }
  nsIPrincipal* principal = aLoadInfo.mPrincipal;
  if (!principal || !principal->GetIsContentPrincipal()) {
    return nullptr;
  }
  nsCOMPtr<nsIObserverService> obs = services::GetObserverService();
  if (!obs) {
    return nullptr;
  }

  RefPtr<nsHashPropertyBag> bag = new nsHashPropertyBag();
  bag->SetPropertyAsACString(u"kind"_ns, nsDependentCString(aKind));
  bag->SetPropertyAsAString(u"scriptURL"_ns, aScriptURL);
  uint64_t innerWindowId = 0;
  if (aLoadInfo.mWindow) {
    innerWindowId = aLoadInfo.mWindow->WindowID();
  }
  bag->SetPropertyAsUint64(u"innerWindowId"_ns, innerWindowId);
  nsAutoCString originNoSuffix;
  (void)principal->GetOriginNoSuffix(originNoSuffix);
  bag->SetPropertyAsACString(u"principalOrigin"_ns, originNoSuffix);
  nsAutoString partitionKey;
  if (aLoadInfo.mPartitionedPrincipal) {
    partitionKey =
        aLoadInfo.mPartitionedPrincipal->OriginAttributesRef().mPartitionKey;
  }
  if (partitionKey.IsEmpty()) {
    partitionKey = aLoadInfo.mOriginAttributes.mPartitionKey;
  }
  bag->SetPropertyAsAString(u"partitionKey"_ns, partitionKey);
  // 0056: persona context (per container; private browsing memory-only).
  bag->SetPropertyAsUint64(
      u"userContextId"_ns,
      principal->OriginAttributesRef().mUserContextId);
  bag->SetPropertyAsUint64(
      u"privateBrowsingId"_ns,
      principal->OriginAttributesRef().mPrivateBrowsingId);

  obs->NotifyObservers(static_cast<nsIWritablePropertyBag*>(bag),
                       kDarkstrWorkerPersonaTopic, nullptr);

  RefPtr<DarkstrWorkerPersona> persona = new DarkstrWorkerPersona();
  (void)bag->GetPropertyAsAString(u"userAgent"_ns, persona->mUserAgent);
  (void)bag->GetPropertyAsAString(u"platform"_ns, persona->mPlatform);
  uint32_t hw = 0;
  if (NS_SUCCEEDED(
          bag->GetPropertyAsUint32(u"hardwareConcurrency"_ns, &hw))) {
    persona->mHardwareConcurrency = hw;
  }
  nsAutoString langs;
  if (NS_SUCCEEDED(bag->GetPropertyAsAString(u"languages"_ns, langs))) {
    DarkstrParseWorkerLanguages(langs, persona->mLanguages);
  }
  (void)bag->GetPropertyAsAString(u"timezone"_ns, persona->mTimezone);
  (void)bag->GetPropertyAsAString(u"prelude"_ns, persona->mPrelude);
  CopyUTF16toUTF8(aScriptURL, persona->mScriptURL);

  if (!persona->HasNavigator() && persona->mPrelude.IsEmpty()) {
    return nullptr;
  }
  if (persona->HasNavigator()) {
    // Stock worker plumbing carries these (navigator.languages / Intl
    // timezone), nested workers inherit them from the parent loadInfo.
    if (!persona->mLanguages.IsEmpty()) {
      aLoadInfo.mLanguageOverride = persona->mLanguages.Clone();
    }
    if (!persona->mTimezone.IsEmpty()) {
      aLoadInfo.mTimezoneOverride = persona->mTimezone;
    }
  }
  return persona.forget();
}

/* static */
void DarkstrNavigatorHooks::RegisterWorkerPersona(
    const WorkerPrivate* aWorker, DarkstrWorkerPersona* aPersona) {
  if (!aWorker || !aPersona) {
    return;
  }
  StaticMutexAutoLock lock(sDarkstrWorkerPersonaMutex);
  if (!sDarkstrWorkerPersonas) {
    sDarkstrWorkerPersonas = new nsTHashMap<nsPtrHashKey<const void>,
                                     RefPtr<DarkstrWorkerPersona>>();
  }
  sDarkstrWorkerPersonas->InsertOrUpdate(aWorker, RefPtr{aPersona});
}

/* static */
void DarkstrNavigatorHooks::ForgetWorkerPersona(const WorkerPrivate* aWorker) {
  RefPtr<DarkstrWorkerPersona> doomed;
  {
    StaticMutexAutoLock lock(sDarkstrWorkerPersonaMutex);
    if (!sDarkstrWorkerPersonas) {
      return;
    }
    sDarkstrWorkerPersonas->Remove(aWorker, &doomed);
  }
}

/* static */
already_AddRefed<DarkstrWorkerPersona> DarkstrNavigatorHooks::PersonaForWorker(
    const WorkerPrivate* aWorker) {
  if (!aWorker) {
    return nullptr;
  }
  StaticMutexAutoLock lock(sDarkstrWorkerPersonaMutex);
  if (!sDarkstrWorkerPersonas) {
    return nullptr;
  }
  RefPtr<DarkstrWorkerPersona> found = sDarkstrWorkerPersonas->Get(aWorker);
  return found.forget();
}

/* static */
void DarkstrNavigatorHooks::RunWorkerPrelude(JSContext* aCx,
                                             const WorkerPrivate* aWorker,
                                             JS::Handle<JSObject*> aGlobal) {
  RefPtr<DarkstrWorkerPersona> persona = PersonaForWorker(aWorker);
  if (!persona || persona->mPrelude.IsEmpty() || !aGlobal) {
    return;
  }
  JSAutoRealm ar(aCx, aGlobal);
  JS::CompileOptions options(aCx);
  options.setFileAndLine(persona->mScriptURL.get(), 1);
  options.setNoScriptRval(true);
  JS::SourceText<char16_t> srcBuf;
  if (!srcBuf.init(aCx, persona->mPrelude.get(), persona->mPrelude.Length(),
                   JS::SourceOwnership::Borrowed)) {
    JS_ClearPendingException(aCx);
    return;
  }
  JS::Rooted<JS::Value> unused(aCx);
  if (!JS::Evaluate(aCx, options, srcBuf, &unused)) {
    // The prelude is best effort; never surface its errors to the page.
    JS_ClearPendingException(aCx);
  }
}

}  // namespace mozilla::dom
