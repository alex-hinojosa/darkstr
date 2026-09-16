# Soft residual — `navigator.languages` vs FFI snapshot

**Brand:** darkstr — not official LibreWolf.  
**Train:** 155.0.1-1. Soft only — not a product flip.

## Symptom (Proof #29 soft re-skim)

FFI `darkstr.persona.snapshot` matched seed-42 golden (langs include `es`), but live `navigator.languages` sometimes stayed `en-US,en`.

## Fix (`0010`)

- Register `pageshow` on `DarkstrNativePersona` JSWindowActor child.
- Child re-queries `GetSnapshot` and re-applies Navigator spoofs (including languages) so a late FFI fill wins over a sticky `DOMWindowCreated` spoof.

## Not claimed

- Accept-Language HTTP header rewrite
- `nativePersonaHooks` default-on


## 0011 follow-up (WebIDL cache)

Proof re-skim after `0010`: snapshot still golden with `es`, live `navigator.languages` still `[en-US, en]`.

Root cause: Gecko **caches** `navigator.languages` in the WebIDL binding. Updating `darkstr.persona.languages` (or re-spoofing on pageshow) does not clear that cache — only the `intl.accept_languages` observer path did.

**Fix:** also observe `darkstr.persona.languages` in `nsGlobalWindowInner` and call `ClearCachedLanguage(s)Value` (+ `languagechange` event).


## 0012 follow-up (force pref notify on pageshow)

Proof re-skim after `0011`: honesty PASS (observer present) but live `navigator.languages` still `[en-US, en]` through pageshow/late; no `languagechange`.

Root cause (content process):

1. `Navigator::GetLanguages` already calls `DarkstrNavigatorHooks::TryGetLanguages` (`darkstr.persona.languages`) when pollution + hooks.
2. WebIDL `[Cached]` stores the first C++ result on the Navigator instance; Child JS `Navigator.prototype.languages` redefine does not clear it (HW can still pass via JS while languages stick).
3. `0011` only clears the cache when `darkstr.persona.languages` **changes after** the content window registers its observer.
4. Mirror write often lands once (or same CSV re-set) before/without a later prefchange → `0011` never fires (matches no `languagechange`).
5. pageshow (`0010`) re-queries snapshot and re-spoofs JS but did **not** re-notify the languages mirror.

**Fix (`0012`):** `_forceLanguagesMirrorNotify` clear+set when CSV unchanged; Parent `GetSnapshot` calls `refreshPlan()` so pageshow forces the `0011` path. Soft only — hooks default-off. No Accept-Language HTTP rewrite. Residual not claimed closed until Proof re-skim.


## 0013 follow-up (BrowsingContext.languageOverride)

Proof #35 after `0012`: honesty PASS (observer / force-notify present) but live `navigator.languages` still `[en-US, en]` through pageshow/late; **no `languagechange`**.

Root cause (content process):

1. Pref notify (`0011`/`0012`) is insufficient — parent `darkstr.persona.languages` prefchange does **not** reach the measured content window’s observer.
2. Stock path: `BrowsingContext.languageOverride` (chrome-webidl, `SetterThrows`). `DidSet(IDX_LanguageOverride)` in `docshell/base/BrowsingContext.cpp` walks windows and calls `navigator->ClearLanguageCache()` (clears WebIDL `language`/`languages`) via BC field IPC.
3. `HttpBaseChannel` also reads `languageOverride` for Accept-Language when set — when hooks + pollution apply, persona CSV becomes that BC’s Accept-Language (coherent; soft claim expansion vs `0010` “no AL rewrite”).

**Fix (`0013`):** Parent `GetSnapshot` after `refreshPlan()` sets `this.browsingContext.top.languageOverride` to snapshot languages CSV; if unchanged, clear then set to force `DidSet`; when not `applyNativeBase`, set to `""`. Soft only — hooks default-off. **Residual still OPEN** until Proof re-skim (do not claim closed).

## 0014 follow-up (intl.accept_languages + primary-tag languageOverride)

Proof #36 after `0013`: honesty PASS; live `navigator.languages` still `[en-US, en]`; **no `languagechange`**; Accept-Language stayed `en-US,en;q=0.9` (no `es`).

Root cause:

1. `0013` set `top.languageOverride = langs.join(",")` (e.g. `es,en-US,en`) inside try/catch that swallowed errors.
2. Stock WebDriver BiDi sets a **single** locale tag (`en-GB`) via `context.languageOverride = value`. `DidSet` calls `JS::SetRealmLocaleOverride` with the whole string — a CSV likely throws; setter fails; AL never changes (matches Proof).
3. Content **does** observe stock `intl.accept_languages` (`nsGlobalWindowInner`) and clears the WebIDL languages cache + fires `languagechange`.

**Fix (`0014`):**

- On `refreshPlan` when `applyNativeBase`: save current `intl.accept_languages` once to `darkstr.persona.savedAcceptLanguages` (only if unset); force-notify set `intl.accept_languages` to persona langs CSV (clear+set if unchanged) — same pattern as `_forceLanguagesMirrorNotify`.
- When not `applyNativeBase`: restore `intl.accept_languages` from saved if present; clear saved pref.
- Parent: set `languageOverride` to **primary tag only** (`langs[0]`); on catch write a short reason to `darkstr.persona.lastError` (do not swallow).

Soft only — hooks default-off. Uses stock `intl.accept_languages` content observer + primary-tag `languageOverride`; AL will follow persona when hooks on. **langs residual CLOSED via #37** (see below); und hygiene parked in `0015`.


## 0014 Proof skim → langs residual CLOSED (#37)

Proof re-skim after `0014` (PR #37): live langs / AL path via stock `intl.accept_languages` + primary-tag `languageOverride` accepted. **langs residual CLOSED via #37.** Soft only — hooks remain default-off. Not a product flip.

## 0015 soft park (`savedAcceptLanguages` = `und`)

Proof note during/after #37 skim: first-time save in `_applyAcceptLanguagesForPersona` used `getCharPref("intl.accept_languages")`, which can return Gecko **`und`** (undefined locale) when no real user value — restore would then `setCharPref("und")`.

**Fix (`0015`):**

- On save: normalize empty / `und` (case-insensitive) → `""` into `darkstr.persona.savedAcceptLanguages`.
- On restore: if saved is empty/`und` (incl. prior-run migrate), `clearUserPref(intl.accept_languages)` rather than set `und`.
- Soft park only. Hooks default-off. langs residual stays CLOSED (#37); this parks the und hygiene note for Proof XOR skim (hooks on then off — `savedAcceptLanguages` should be `""` or real prior CSV, never `und`).

