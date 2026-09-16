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
