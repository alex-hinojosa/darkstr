# darkstr patches sketch (LibreWolf-based fork)

**Not** a Mozilla or LibreWolf source tree. **Not** official LibreWolf branding.  
These stubs document *how* a real bsys6 / LibreWolf recipe would layer darkstr prefs and hooks. Full patch bodies against a pinned Firefox train live in the private fork (M1+).

| Path | Role |
|------|------|
| [`stubs/darkstr.cfg`](stubs/darkstr.cfg) | Chrome pref defaults (`darkstr.mode`, …) — same as `docs/darkstr.cfg.example` |
| [`stubs/0001-darkstr-prefs-defaults.patch.stub`](stubs/0001-darkstr-prefs-defaults.patch.stub) | Prefs / cfg wiring sketch |
| [`0002-darkstr-mode-xor-rfp.patch`](0002-darkstr-mode-xor-rfp.patch) | **Real** train-pinned chrome JS XOR observer (155.0.1-1 / `DarkstrModeXor.sys.mjs`) |
| [`stubs/0002-darkstr-mode-xor-rfp.patch.stub`](stubs/0002-darkstr-mode-xor-rfp.patch.stub) | Pointer only — superseded by real `0002-…patch` |
| [`0003-darkstr-native-persona-hooks.patch`](0003-darkstr-native-persona-hooks.patch) | **Real** train-pinned chrome JS native persona hooks (155.0.1-1 / `DarkstrNativePersona*.sys.mjs`) |
| [`stubs/0003-darkstr-hook-sites.patch.stub`](stubs/0003-darkstr-hook-sites.patch.stub) | Pointer only — superseded by real `0003-…patch` |
| [`0005-darkstr-cpp-native-hooks.patch`](0005-darkstr-cpp-native-hooks.patch) | **Real** train-pinned C++ nsHttp UA + CH REMOVE (155.0.1-1 / `DarkstrNsHttpHooks`) — Navigator/DocShell still chrome-JS |
| [`0006-darkstr-cpp-navigator-docshell.patch`](0006-darkstr-cpp-navigator-docshell.patch) | **Real** train-pinned C++ Navigator overrides + honest DocShell stub (155.0.1-1) — CH stays in 0005; DocShell stub superseded by 0007 SoT |
| [`stubs/0006-darkstr-cpp-navigator-docshell.patch.stub`](stubs/0006-darkstr-cpp-navigator-docshell.patch.stub) | Pointer only — superseded by real `0006-…patch` |
| [`0007-darkstr-cpp-docshell-nav-sot.patch`](0007-darkstr-cpp-docshell-nav-sot.patch) | **Real** train-pinned C++ DocShell first/subsequent SoT (155.0.1-1) — chrome Map fallback |
| [`stubs/0007-darkstr-cpp-docshell-nav-sot.patch.stub`](stubs/0007-darkstr-cpp-docshell-nav-sot.patch.stub) | Pointer only — superseded by real `0007-…patch` |
| [`stubs/0004-darkstr-chaff-depth.patch.stub`](stubs/0004-darkstr-chaff-depth.patch.stub) | Historical stub notes. **Scheduler → [`0016`](0016-darkstr-chaff-native-scheduler.patch)**; **canvas/WebGL/Audio → [`0017`](0017-darkstr-depth-canvas-webgl-audio.patch)**; **workers → [`0018`](0018-darkstr-worker-globals-coherence.patch)**; **soft residuals → [`0019`](0019-darkstr-phase3-soft-residuals.patch)**; **DocShell SubsequentNav → [`0020`](0020-darkstr-docshell-strict-next-nav.patch)** / [`0021`](0021-darkstr-docshell-http-scheme-count.patch) http(s) fix / [`0022`](0022-darkstr-docshell-browserid-phase.patch); **WebGL caps + OffscreenCanvas → [`0023`](0023-darkstr-depth-webgl-caps-offscreencanvas.patch)**; **richer chaff beacons → [`0024`](0024-darkstr-chaff-richer-beacon-bodies.patch)**; **FP coherence P0 → [`0025`](0025-darkstr-fp-coherence-p0.patch)** |
| [`0016-darkstr-chaff-native-scheduler.patch`](0016-darkstr-chaff-native-scheduler.patch) | **Real** Phase 3 pin 1 — chrome chaff timer (`DarkstrChaffScheduler.sys.mjs`, default-off) |
| [`0017-darkstr-depth-canvas-webgl-audio.patch`](0017-darkstr-depth-canvas-webgl-audio.patch) | **Real** Phase 3 pin 2 — canvas/WebGL/Audio depth (`DarkstrDepthHooks*.sys.mjs`, default-off) |
| [`0023-darkstr-depth-webgl-caps-offscreencanvas.patch`](0023-darkstr-depth-webgl-caps-offscreencanvas.patch) | **Real** Phase 3 optional — WebGL cap buckets + OffscreenCanvas window parity |
| [`0018-darkstr-worker-globals-coherence.patch`](0018-darkstr-worker-globals-coherence.patch) | **Real** Phase 3 pin 3 — DedicatedWorker/SharedWorker coherence (`DarkstrWorkerHooks*.sys.mjs`, default-off) |
| [`0019-darkstr-phase3-soft-residuals.patch`](0019-darkstr-phase3-soft-residuals.patch) | **Real** Phase 3 soft residuals — lastInstall runtimeOnly + OfflineAudio page-compartment + HW best-effort |
| [`scripts/apply-darkstr-patches.sh`](scripts/apply-darkstr-patches.sh) | Example apply order for a real tree |

Design pin: [`../docs/GECKO-HOOKS.md`](../docs/GECKO-HOOKS.md). Bridge: [`../docs/PREF-BRIDGE.md`](../docs/PREF-BRIDGE.md).

## Intended apply flow (real fork)

```bash
# On a machine that already has the LibreWolf/Firefox source + darkstr overlay:
export DARKSTR_GECKO_ROOT=/path/to/librewolf-based-tree
./patches/scripts/apply-darkstr-patches.sh
```

The script:

1. Refuses to run if `DARKSTR_GECKO_ROOT` is unset or missing (safe no-op outside a fork checkout).
2. Copies `stubs/darkstr.cfg` into the product cfg location (path configurable).
3. Applies numbered stubs **when** they are replaced with real unified diffs against the pinned train.

Until M1, stubs end in `.patch.stub` so `patch(1)` is not accidentally run against an empty tree.

## Idempotent re-apply (soft residual after #19; markers after later patches rewrite shared files)

`scripts/apply-darkstr-patches.sh` applies real `patches/000*.patch` via
`patch -p1 --forward --batch` (dry-run, then apply). Re-running after a
successful apply skips already-applied hunks — no interactive prompts and no
leftover `.rej` for those hunks. Genuine conflicts still exit non-zero. M1 cfg
copy + `librewolf.cfg` marker append remain separately idempotent.

## Rules

- Homogeneous: stock LibreWolf RFP expectations — **no** RFP metric customization in patches.
- Pollution: auto-set `privacy.resistFingerprinting` and `privacy.fingerprintingProtection` to `false`.
- Pref names: `darkstr.mode`, `darkstr.nativeCompatible` only (Proof pin).
- GPL-3.0 for darkstr glue; respect MPL for upstream Gecko files.
- No Cloudflare / TLS / anti-detect marketing in patch commit messages.

## Branding

Product name is **darkstr**. Do not ship these patches as “LibreWolf official.” Change about: / icons / name in the private fork branding pass (M1), not by claiming upstream identity.


## M1 skim apply (2026-09-14)

On the Builder Mini SSD clean tree (`DARKSTR_GECKO_ROOT`, see `docs/M1-STATUS.md`):

```bash
source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env   # or export DARKSTR_GECKO_ROOT=...
./patches/scripts/apply-darkstr-patches.sh --dry-run --require-root
./patches/scripts/apply-darkstr-patches.sh --require-root
grep -n 'darkstr.mode\|BEGIN darkstr-m1-prefs' "$DARKSTR_GECKO_ROOT/lw/librewolf.cfg"
```

The script copies `stubs/darkstr.cfg` → `lw/darkstr.cfg` and appends an idempotent `defaultPref` block into `lw/librewolf.cfg` so chrome prefs load. It does **not** run `make bootstrap` / `make build`. `.patch.stub` files remain sketches until replaced with train-pinned unified diffs.

## M2 control-plane + train-pinned observer (2026-09-14)

Rust XOR applicator remains the public SoT (`duppel_bridge` / `duppel_persona`). Live chrome observer is the real unified diff [`0002-darkstr-mode-xor-rfp.patch`](0002-darkstr-mode-xor-rfp.patch) against Firefox/LibreWolf **155.0.1-1** (`BrowserGlue` + `moz.build` + new `DarkstrModeXor.sys.mjs`). **No** invented C++ paths. Rebuild: `./mach build browser/components`. See `docs/M2-STATUS.md` / `docs/M2-MINI-VERIFY.sh`.


## M3-CPP nsHttp call-ins (2026-09-14)

Real unified diff [`0005-darkstr-cpp-native-hooks.patch`](0005-darkstr-cpp-native-hooks.patch) against post-M3 155.0.1-1:

- New `DarkstrNsHttpHooks.{h,cpp}` in `netwerk/protocol/http/`
- `nsHttpHandler::UserAgent` + `AddStandardRequestHeaders` call-ins
- Chrome `DarkstrNativePersona` mirrors `darkstr.persona.ua` for C++ (no JSON in necko)
- **Not** claimed: Navigator.cpp / nsDocShell.cpp edits, Rust FFI, Cloudflare/TLS/JA3

Rebuild: `./mach build netwerk/protocol/http`. See `docs/M3-CPP-STATUS.md`. Stub `0004` is depth leftovers; scheduler is `0016` (not this patch number).

## M3-CPP-NAV Navigator + DocShell stub (2026-09-15)

Real unified diff [`0006-darkstr-cpp-navigator-docshell.patch`](0006-darkstr-cpp-navigator-docshell.patch) against post-0005 155.0.1-1:

- New `DarkstrNavigatorHooks.{h,cpp}` in `dom/base/` + call-ins in `Navigator.cpp`
- New `DarkstrDocShellHooks.{h,cpp}` honest stub in `docshell/base/` + call-in in `nsDocShell.cpp`
- Chrome mirrors: `darkstr.persona.platform` / `hardwareConcurrency` / `languages` / `docShellPhase`
- **Not** claimed: full C++ DocShell load-counter SoT, deviceMemory C++ (absent on Firefox Navigator), Rust FFI, Cloudflare/TLS/JA3
- CH REMOVE unchanged in `0005`

Rebuild: `./mach build dom/base docshell/base`. See `docs/M3-CPP-NAV-STATUS.md`.


## M3-CPP-DOCSHELL first/subsequent SoT (2026-09-15)

Real unified diff [`0007-darkstr-cpp-docshell-nav-sot.patch`](0007-darkstr-cpp-docshell-nav-sot.patch) against post-0006 155.0.1-1:

- Replaces `DarkstrDocShellHooks` stub with per-BC LoadURI counter + `CurrentPhase` / `ShouldApplyPersona`
- `nsDocShell::LoadURI` notes top-content navigations with `BrowsingContext::Id()`
- Chrome prefers C++ `docShellPhase` mirror when hooks on
- **Not** claimed: Rust FFI, Cloudflare/TLS/JA3, RFP metric patches, full parent/content IPC mirror

| [`0008-darkstr-gecko-ffi-link.patch`](0008-darkstr-gecko-ffi-link.patch) | **Real** train-pinned Approach B FFI link (155.0.1-1): vendored `third_party/darkstr`, `DarkstrFfi.sys.mjs` ctypes, chrome prefers FFI snapshot |
| [`stubs/0008-darkstr-gecko-ffi-link.stub`](stubs/0008-darkstr-gecko-ffi-link.stub) | Demoted breadcrumb — superseded by real `0008-…patch` |


## M-FFI-0008 gecko FFI link (Approach B)

- Real patch: [`0008-darkstr-gecko-ffi-link.patch`](0008-darkstr-gecko-ffi-link.patch)
- Vendored flattened `duppel-persona` + `duppel-ffi` under `third_party/darkstr/`
- Chrome `DarkstrFfi.sys.mjs` loads `libduppel_ffi` via ctypes; `_readSnapshot` prefers FFI when seed set
- Build: `third_party/darkstr/build-and-install-ffi.sh --prefix "$objdir/dist/bin"`
- Rebuild: `./mach build browser/components`
- See [`../docs/M-FFI-0008-STATUS.md`](../docs/M-FFI-0008-STATUS.md). Approach A (gkrust path-dep) deferred.


## M3 soft languages force-notify (0012)

Real unified diff [`0012-darkstr-nav-languages-force-notify.patch`](0012-darkstr-nav-languages-force-notify.patch) against post-0011 155.0.1-1:

- Chrome `_forceLanguagesMirrorNotify` clear+set when `darkstr.persona.languages` CSV unchanged
- Parent `GetSnapshot` calls `refreshPlan()` so pageshow triggers content `0011` WebIDL cache clear
- Soft only — `nativePersonaHooks` default-off; no Accept-Language HTTP rewrite
- Rebuild: `./mach build --allow-subdirectory-build browser/components`
- See [`../docs/M3-LANGUAGES-SOFT-STATUS.md`](../docs/M3-LANGUAGES-SOFT-STATUS.md)


## M3 soft languages BC override (0013)

Real unified diff [`0013-darkstr-nav-languages-bc-override.patch`](0013-darkstr-nav-languages-bc-override.patch) against post-0012 155.0.1-1:

- Parent `GetSnapshot` sets `browsingContext.top.languageOverride` to persona langs CSV (clear+set when unchanged)
- Stock `DidSet` → `ClearLanguageCache` via BC IPC (pref notify alone insufficient in content)
- When hooks on: Accept-Language for that BC may follow persona CSV (HttpBaseChannel)
- Soft only — `nativePersonaHooks` default-off; residual not claimed closed
- Rebuild: `./mach build --allow-subdirectory-build browser/components`
- See [`../docs/M3-LANGUAGES-SOFT-STATUS.md`](../docs/M3-LANGUAGES-SOFT-STATUS.md)


## M3 soft languages intl.accept (0014)

Real unified diff [`0014-darkstr-nav-languages-intl-accept.patch`](0014-darkstr-nav-languages-intl-accept.patch) against post-0013 155.0.1-1:

- Proof #36: `0013` CSV `languageOverride` likely failed `SetRealmLocaleOverride`; AL unchanged.
- `refreshPlan` save-once `intl.accept_languages` → `darkstr.persona.savedAcceptLanguages`; force-notify set persona CSV; restore when idle.
- Parent `languageOverride` = primary tag only (`langs[0]`); failures → `darkstr.persona.lastError`.
- Soft only — hooks default-off. Residual OPEN until Proof re-skim.
- Apply + rebuild: `./mach build --allow-subdirectory-build browser/components` (see `docs/M3-LANGUAGES-0014-MINI-APPLY.sh`).


## Phase 3 chaff native scheduler (0016)

Real unified diff [`0016-darkstr-chaff-native-scheduler.patch`](0016-darkstr-chaff-native-scheduler.patch) against post-0003 155.0.1-1 (also dry-runs clean with DarkstrFfi in moz.build):

- `DarkstrChaffScheduler.sys.mjs` — `nsITimer` + Quiet/Balanced/Loud + ordinary HTTP beacons
- Gates: `pollution_active` + `darkstr.nativePersonaHooks` (default-off)
- Apply + rebuild: `./mach build --allow-subdirectory-build browser/components` then **`make install-dist_bin`** (see `docs/PHASE-3-CHAFF-0016-MINI-APPLY.sh` / `docs/PHASE-3-STATUS.md`)
- Stub `0004` retained for DocShell leftovers; canvas/WebGL/Audio → `0017`; workers → `0018`
- Optional richer beacon bodies → [`0024`](0024-darkstr-chaff-richer-beacon-bodies.patch)

## Phase 3 richer chrome chaff beacon bodies (0024)

Real unified diff [`0024-darkstr-chaff-richer-beacon-bodies.patch`](0024-darkstr-chaff-richer-beacon-bodies.patch) against post-0016 155.0.1-1:

- Extends `DarkstrChaffScheduler.sys.mjs` — Phase 1 `poisoner.js` session interest clusters + GA Universal / GA4 / Meta PageView query payloads
- Gates + Quiet/Balanced/Loud volume/timing unchanged (pollution + `nativePersonaHooks`, default-off)
- Ordinary HTTP chrome `fetch` only — **no** CF/TLS/JA3; WebExt may remain richer (ISOLATED sendBeacon + DOM chaff)
- Diagnostic: `darkstr.chaff.lastBeaconKind` (+ richer `lastFireAt`)
- Apply + rebuild: `./mach build --allow-subdirectory-build browser/components` then **`make install-dist_bin`** (see `docs/PHASE-3-CHAFF-0024-MINI-APPLY.sh` / `docs/PHASE-3-STATUS.md`)

## Phase 3 depth canvas / WebGL / Audio (0017)

Real unified diff [`0017-darkstr-depth-canvas-webgl-audio.patch`](0017-darkstr-depth-canvas-webgl-audio.patch) against post-0016 155.0.1-1 (DarkstrFfi alphabetical moz.build):

- `DarkstrDepthHooks.sys.mjs` + Parent/Child JSWindowActor — canvas noise, WebGL vendor/renderer, audio getChannelData
- Seeds from `darkstr.persona.snapshot` / `darkstr.persona.seed` when `pollution_active`
- Gates: `pollution_active` + `darkstr.nativePersonaHooks` (default-off)
- Apply + rebuild: `./mach build --allow-subdirectory-build browser/components` then **`make install-dist_bin`** + LibreWolf.app moz-src mirror (see `docs/PHASE-3-DEPTH-0017-MINI-APPLY.sh` / `docs/PHASE-3-STATUS.md`)
- Merged PR #44 as `1eef97b`; Proof XOR PASS on tip `9d4fa76`

## Phase 3 worker globals coherence (0018)

Real unified diff [`0018-darkstr-worker-globals-coherence.patch`](0018-darkstr-worker-globals-coherence.patch) against post-0017 155.0.1-1 (DarkstrFfi alphabetical moz.build):

- `DarkstrWorkerHooks.sys.mjs` + Parent/Child JSWindowActor — DedicatedWorker/SharedWorker constructor wrap
- Payload: persona snapshot (navigator) + optional depth seeds (OffscreenCanvas/WebGL in worker); same gates as 0016/0017
- Content: `Cu.waiveXrays` + `Cu.exportFunction`; DOMWindowCreated + pageshow; `darkstr.worker.lastError` / `lastInstall`
- Apply + rebuild: `./mach build --allow-subdirectory-build browser/components` then **`make install-dist_bin`** + LibreWolf.app moz-src mirror (see `docs/PHASE-3-WORKER-0018-MINI-APPLY.sh` / `docs/PHASE-3-STATUS.md`)
- ServiceWorker / Worklets **not** claimed

## M3 soft park savedAcceptLanguages und (0015)

Real unified diff [`0015-darkstr-nav-languages-saved-accept-und.patch`](0015-darkstr-nav-languages-saved-accept-und.patch) against post-0014 155.0.1-1:

- Proof note after #37: `getCharPref("intl.accept_languages")` can return `und` when no real user value; restore would write `und` back.
- Normalize empty/`und` (case-insensitive) → `""` on first save; on restore treat empty/`und` (prior-run migrate) as `clearUserPref`, never `setCharPref("und")`.
- Soft only — hooks default-off. **langs residual CLOSED via #37**; this is soft park for und (not a product flip).
- Apply + rebuild: `./mach build --allow-subdirectory-build browser/components` (see `docs/M3-LANGUAGES-0015-MINI-APPLY.sh`).

## Phase 3 soft residuals (0019)

Real unified diff [`0019-darkstr-phase3-soft-residuals.patch`](0019-darkstr-phase3-soft-residuals.patch) against post-0018 155.0.1-1:

- Worker `lastInstall`: construct fallbacks are `runtimeOnly` (lastError only; do not clobber successful wrap)
- OfflineAudio: **page-compartment** `installAudioInPage` (PR #47 XOR FAIL — chrome Xray set inert)
- Worker `hardwareConcurrency`: instance-then-proto best-effort; honest residual if non-configurable
- Same fixes also baked into refreshed `0017`/`0018` new-file bodies (Mini module refresh coherent)
- Apply + rebuild: `./mach build --allow-subdirectory-build browser/components` then **`make install-dist_bin`** (see `docs/PHASE-3-SOFT-0019-MINI-APPLY.sh` / `docs/PHASE-3-STATUS.md`)



## Phase 3 DocShell SubsequentNav (0020 / 0021 / 0022)

Real unified diff [`0020-darkstr-docshell-strict-next-nav.patch`](0020-darkstr-docshell-strict-next-nav.patch) against post-0007 (+ Phase 3 chrome) 155.0.1-1:

- `DarkstrDocShellHooks::StrictNextNavArmed` alias; n==0 / unset phase → FirstDocument parity
- `CountsTowardStrictFirstDoc` — only http/https burn FirstDocument (about:blank / about:newtab / chrome ignored)
- C++ Navigator + nsHttp UA gated on SubsequentNav when `darkstr.strictFirstDoc` (CH REMOVE stays pollution+hooks)
- Chrome NativePersona / Depth / Worker per-BC delivery; diagnostic `darkstr.docshell.strictNextNavArmed`
- Gates default-off (`pollution_active` + `nativePersonaHooks`); no `privacy.*` from this drop
- Mini already on 0020v1: apply `0021` via Mini helper; after `b68286f`: apply `0022` (BrowserId + read-only phase)
- `0022`: tab-stable BrowserId counter; chrome `navPhaseForChannel` no longer writes subsequent_nav on fallthrough; clear phase prefs on init
- Apply + rebuild: allow-subdir `docshell/base dom/base netwerk/protocol/http` + **`toolkit/library`** XUL relink + chrome + **`make install-dist_bin`** (see `docs/PHASE-3-DOCSHELL-0020-MINI-APPLY.sh`)

## Phase 3 WebGL caps + OffscreenCanvas (0023)

- Extends `DarkstrDepthHooksChild` (post-0017/0019): persona GPU `GL_CAP_BUCKETS` + OffscreenCanvas `convertToBlob` / OC2D `getImageData`
- Honest subset vs Phase 1 `webgl.js` — ext lists / shader precision / fail-closed unknown getParameter **not** claimed
- Gates unchanged (pollution + `nativePersonaHooks`, default-off); pin-2 Xray/pageshow/install-dist_bin lessons retained
- Mini: [`docs/PHASE-3-DEPTH-0023-MINI-APPLY.sh`](../docs/PHASE-3-DEPTH-0023-MINI-APPLY.sh)


## Phase 3 FP coherence P0 (0025)

Real unified diff [`0025-darkstr-fp-coherence-p0.patch`](0025-darkstr-fp-coherence-p0.patch) against post-0024 155.0.1-1:

- WorkerHooks global arm Depth parity (`getPlan().snapshot`); BC SubsequentNav gate unchanged
- Window `hardwareConcurrency` persona 8 (instance-first spoof + C++ mirror harden)
- `navigator.languages` full snapshot list after SubsequentNav (override pulse+clear)
- Apply + rebuild: `browser/components` + `dom/base` + `toolkit/library` then **`make install-dist_bin`** (see `docs/PHASE-3-FP-0025-MINI-APPLY.sh`)
- Non-claims: ServiceWorker, fonts, screen, CF/TLS, Chrome cosplay

## Phase 3 FP coherence soft P1 (0028)

Real unified diff [`0028-darkstr-fp-coherence-p1-tz-webrtc.patch`](0028-darkstr-fp-coherence-p1-tz-webrtc.patch) against post-0027 Firefox/LibreWolf 155.0.1-1:

- Native `BrowsingContext.timezoneOverride` follows the **armed** persona snapshot, so `Intl.DateTimeFormat().resolvedOptions().timeZone`, `Date`, and worker timezone are coherent. First-document holdback and Homogeneous clear to host behavior.
- Pollution+native-hooks disables `media.peerconnection.enabled` after saving whether the user had an explicit value; leaving Pollution restores the exact explicit value or clears back to product default.
- Snapshot-pref parser now carries `timezone` (seed-42: `Europe/Berlin`).
- Chrome JS only; no XUL relink. Mini helper: [`docs/PHASE-3-FP-0028-MINI-APPLY.sh`](../docs/PHASE-3-FP-0028-MINI-APPLY.sh).

## Phase 3 soft residual — WebGL context enable (0029)

Real unified diff [`0029-darkstr-webgl-context-enable.patch`](0029-darkstr-webgl-context-enable.patch) against post-0028 Firefox/LibreWolf 155.0.1-1:

- `DarkstrModeXor._ensureWebGlContextPrefs` — `webgl.disabled=false` + `webgl.force-enabled=true` + forbid-hardware/software=false + try `gfx.blocklist.all=-1` + **`librewolf.webgl.prompt=false`** (+ `prompt.hide=true`) on every mode apply (Homogeneous **and** Pollution)
- Startup cfg SoT: `defaultPref("gfx.blocklist.all", -1)` (ignore feature blocklisting; **never +1** which forces block-all). Pref is AtStartup / mirror:once
- Undoes LibreWolf null-context hardening so `getContext('webgl'|'webgl2')` works; depth spoof still **0017/0023**
- Diagnostics `darkstr.webgl.ensureApplied` / `lastStatus` include `librewolf.webgl.prompt=<value>` + nsIGfxInfo WEBGL_OPENGL+WEBGL2 numeric status + failureId (2=UNKNOWN not blocked)
- Chrome JS only; no XUL relink. Mini helper: [`docs/PHASE-3-WEBGL-0029-MINI-APPLY.sh`](../docs/PHASE-3-WEBGL-0029-MINI-APPLY.sh)
- Non-claims: extension lists / shader precision / fail-closed unknown getParameter; no Chrome cosplay; no software-GL invention

## Phase 4 fail-port (156.0.1-1) — 2026-09-23 CDT

Surgical in-place refresh of **0009 / 0022 / 0027 / 0028 / 0029** so they apply clean on LibreWolf **156.0.1-1** after the OK set from the Phase 4 dry-run matrix (`docs/PHASE-4-STATUS.md`). Not a blanket regenerate of 0002–0029. Apply order for the fail set: **0022 → 0027 → 0028 → 0029 → 0009**.

| [`0030-darkstr-persona-etld-seed-rotate.patch`](0030-darkstr-persona-etld-seed-rotate.patch) | **Real** Phase 4 — sticky per-eTLD+1 persona seed (`rotatePerSite`; Proof lock via snapshot\|rotate=false) |
| [`0031-darkstr-audio-silence-farbling.patch`](0031-darkstr-audio-silence-farbling.patch) | **Real** Phase 4 — Brave-style silence-safe AnalyserNode/getChannelData farbling |
## Phase 4 soft residual — window languages cloneInto (0033)

Real unified diff [`0033-darkstr-nav-languages-cloneinto.patch`](0033-darkstr-nav-languages-cloneinto.patch) against LibreWolf **156.0.1-1** post-0030:

- Root cause: after SubsequentNav, Child `darkstrLangsGetter` (`Cu.exportFunction`) returned a **chrome Array**; page principal (and Marionette) then hit `Permission denied to access property "length"` on `navigator.languages`. Worker langs OK (WorkerHooks injects page-source JSON literal). Prefs `darkstr.persona.languages` / `intl.accept_languages` already held full snapshot CSV (`en-US,en,es`).
- Fix: `Cu.cloneInto(langsCopy.slice(), pageWindow)` (DepthHooks lesson) so page sees a content-compartment array.
- Chrome JS only; no XUL relink. Mini helper: [`docs/PHASE-4-LANGS-0033-MINI-APPLY.sh`](../docs/PHASE-4-LANGS-0033-MINI-APPLY.sh).
- Non-claims: Accept-Language HTTP rewrite beyond existing 0014 path; harness may still prefer attr/in-page bridges under Marionette Xray.
