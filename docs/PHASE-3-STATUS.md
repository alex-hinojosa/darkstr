# Phase 3 status — packaging gate closed (0016–0024 merged) + soft residuals

**Date:** 2026-09-21 (CDT)  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.
**Status:** **Packaging gate CLOSED.** Phase 3 main covers `0016`–`0024`; PR #50 / patch `0024` merged as `4c22b29`.


## FP coherence follow-up (0026) — open PR #52 tip

- `patches/0026-darkstr-fp-hw-waivexrays.patch` — NativePersonaChild `Cu.waiveXrays` + `Cu.exportFunction` for navigator HW (Proof: 0025 C++/instance-first still left window HW=12).
- Mini helper: `PHASE-3-FP-0026-MINI-APPLY.sh` (chrome only).
- Expect Proof: Pollution+hooks after SubsequentNav → `hardwareConcurrency===8`.
## Goal (this pin)

Ship **Phase 3 pin 3**: train-pinned thin native **DedicatedWorker / SharedWorker**
globals coherence on LibreWolf/Firefox **155.0.1-1**, so worker `navigator` (+
OffscreenCanvas/WebGL depth when seeds available) stays persona-coherent when
`pollution_active` + `darkstr.nativePersonaHooks` (default-off). Convert stub
leftovers in `patches/stubs/0004-darkstr-chaff-depth.patch.stub` workers → **0018**.

## Pin 1 (merged) — XOR PASS

| Item | Status |
|------|--------|
| `patches/0016-darkstr-chaff-native-scheduler.patch` | **Merged** PR #43 as `d5fb026` |
| Mini apply + `mach build browser/components` | **DONE** (2026-09-19) |
| `make install-dist_bin` + LibreWolf.app `moz-src` | **DONE** (subdirectory build alone left BrowserGlue wired but MOZ_SRC missing) |
| Proof XOR (module present + gate idle default) | **PASS** after dist install fix |

**Install lesson (carry forward):** after subdirectory `mach build`, run
`rm install_dist_bin.track; make install-dist_bin` and mirror/symlink new
`*.sys.mjs` into `LibreWolf.app/Contents/Resources/moz-src/browser/components/`.
On re-apply, **refresh** new-file modules from the patch before markers skip
(stale modules + updated BrowserGlue/moz.build = silent miss).

## Pin 2 (merged) — XOR PASS

| Item | Status |
|------|--------|
| `patches/0017-darkstr-depth-canvas-webgl-audio.patch` | **Merged** PR #44 as `1eef97b` (tip `9d4fa76`) |
| Fission `safeForUntrustedWebProcess` | **DONE** (DepthHooks + NativePersona) |
| Content stick | **DONE** — `Cu.waiveXrays` + `Cu.exportFunction`; pageshow reinstall; `lastError`/`lastInstall` |
| `getPrefType` for `persona.seed` | **DONE** (2-arg `getIntPref` hid string `"42"`) |
| Proof XOR on tip `9d4fa76` | **PASS** (waived-Xray + pageshow + getPrefType seed) |
| Soft residual | Audio OfflineAudio → **0019 v2** page-compartment install (chrome Xray set FAIL on `f18c0b6`) |

## What landed (pin 3)

| Deliverable | Status |
|-------------|--------|
| `patches/0018-darkstr-worker-globals-coherence.patch` | **New** — `DarkstrWorkerHooks*.sys.mjs` + BrowserGlue + moz.build |
| DedicatedWorker / SharedWorker | Window constructor wrap → blob `importScripts` / dynamic `import` injects persona + depth into worker global (Phase 1 `misc.js` parity) |
| Nested workers | Depth-limited wrap (level 1 full + wrapper; level 2 leaf overrides) |
| Cross-origin workers | Pass-through (CSP-safe; same as Phase 1) |
| Gates default-off | Idle unless `pollution_active` **and** `darkstr.nativePersonaHooks` |
| Payload | Prefer `DarkstrNativePersona` snapshot + `DarkstrDepthHooks` seeds; fallback snapshot/seed prefs |
| Diagnostics prefs | `darkstr.worker.hooksArmed` / `lastPayload` / `lastInstall` / `lastError` (no `privacy.*`) |
| Apply-script markers | `0018` idempotent skip when markers present |
| Stub `0004` | Points at `0016` + `0017` + `0018` + `0019` + **`0020` DocShell SubsequentNav** |
| Docs | This file; M4-STATUS Next; GECKO-HOOKS §2.5; Mini apply helper |

## Gate truth (Proof XOR)

| Mode / prefs | Worker hooks |
|--------------|--------------|
| Default Homogeneous + hooks false | **Idle** (`hooksArmed=false`; child gets null payload) |
| Pollution + hooks false | **Idle** (explicit allow required) |
| Pollution + `nativePersonaHooks=true` + persona snapshot/seed | **Armed** — Worker/SharedWorker constructors wrap; worker globals get persona (+ depth when seeds present) |
| Homogeneous / `nativeCompatible=true` | **Idle** |
| This module writes `privacy.*`? | **No** |
| ServiceWorker / Worklets? | **No** (explicit non-claim) |
| Canvas already in window? | **0017** — this pin does not re-ship canvas |

## Mini apply + build

Operator on Mac Mini SSD (Atlas: never `mv` under `/Volumes/Mesh`):

```bash
source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env
cd ~/src/darkstr-gecko/darkstr   # or pull this PR tip
./patches/scripts/apply-darkstr-patches.sh --require-root
# or: patch -d "$DARKSTR_GECKO_ROOT" -p1 < patches/0018-darkstr-worker-globals-coherence.patch
cd "$DARKSTR_GECKO_ROOT"
./mach build --allow-subdirectory-build browser/components
# REQUIRED after subdirectory build (pin 1 lesson):
OBJ="$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0"
rm -f "$OBJ/install_dist_bin.track"
( cd "$OBJ" && make install-dist_bin )
# Mirror new modules into LibreWolf.app Resources/moz-src if missing
```

Helper: [`PHASE-3-WORKER-0018-MINI-APPLY.sh`](PHASE-3-WORKER-0018-MINI-APPLY.sh)
(includes **module refresh** before apply — pin 2 lesson for stale new-file hunks).

**This PR executor (Grok Linux box):** no Mini SSH / no Mini filesystem — Mini apply +
`mach build` status = **NOT RUN here**. Compose-tree dry-run apply verified on box.

| Check | Status |
|-------|--------|
| Patch dry-run on post-0017 compose (DarkstrFfi moz.build) | **DONE** (Grok box) |
| Patch dry-run / apply on Mini tree | **DONE** (2026-09-20; force BrowserGlue/moz.build) |
| `./mach build` + `install-dist_bin` on Mini | **DONE** |
| Headed Proof XOR on rebuilt app | **Pin 1–3 PASS** (pin 3 tip `37820f6`, merged `e715a4d`) |

## Explicit non-claims

- Approach A (`gkrust` path dependency)
- Hooks / depth / chaff / worker **default-on**
- Cloudflare / TLS / JA3 bypass claims
- ServiceWorker / AudioWorklet / PaintWorklet injection
- Live C++ worker bindings (chrome JSWindowActor constructor wrap only)
- Canvas/WebGL/Audio window depth — already **0017** (this pin = workers)
- Full WebGL **extension-list / shader-precision / fail-closed** spoof / font-probe / ultrasonic (WebExt path remains richer; **0023** ships honest cap-bucket + OffscreenCanvas subset only)
- ISOLATED-world `sendBeacon` (real Referer/cookies) / DOM ad-container chaff / interaction-coupled bridge fire (**0024** ships ordinary chrome HTTP GA/GA4/Meta query parity only; WebExt poisoner may remain richer)

## Soft residuals follow-up (0019) — this PR

| Item | Fix |
|------|-----|
| Worker `lastInstall` ends `ok:false` / `runtime-Worker` after successful wrap | Construct fallbacks report `runtimeOnly` → **lastError only**; `lastInstall` stays install-time (`installed` / `already-installed`) |
| OfflineAudio `getChannelData` deltaSum 0 (PR #47 XOR FAIL on `f18c0b6`) | **v2:** page-compartment `installAudioInPage` (getChannelData + startRendering). Chrome Xray `Float32Array.set` was inert live while canvas PASS |
| Worker `hardwareConcurrency` host 12 vs persona 8 | Best-effort: defineProperty on **navigator instance first**, then proto. If both refuse (non-configurable C++ binding), **honest residual remains** |

Patch: `patches/0019-darkstr-phase3-soft-residuals.patch` (also baked into refreshed `0017`/`0018` new-file bodies so Mini module refresh stays coherent).

Mini helper: [`PHASE-3-SOFT-0019-MINI-APPLY.sh`](PHASE-3-SOFT-0019-MINI-APPLY.sh)
(install-dist_bin + app moz-src; mirrors Depth* + Worker*).

**Executor (Grok Linux box):** Mini apply + `mach build` = **NOT RUN**. Compose dry-run apply verified.

### XOR expectations (Proof)

| Case | Expect |
|------|--------|
| Pollution + hooks + persona; Worker constructors wrap; persona UA in worker | `darkstr.worker.lastInstall` **ok:true** / status `installed` (or `already-installed`); runtime construct fallbacks may set `lastError=runtime:…` without flipping lastInstall |
| Pollution + hooks + depth seed; OfflineAudio fill then read / startRendering | **nonzero deltaSum** vs clean/Homogeneous; startRendering sums must diverge from idle (page-compartment audio) |
| Worker `hardwareConcurrency` | Persona value when defineProperty sticks; else host value + residual noted (not a hard fail) |
| Default / Homogeneous / hooks off | Idle unchanged |
| `privacy.*` from these modules | **None** |

## DocShell SubsequentNav arm (0020) — this PR

| Deliverable | Status |
|-------------|--------|
| `patches/0020-darkstr-docshell-strict-next-nav.patch` | **New** — extends M3 `0006`/`0007` |
| `patches/0021-darkstr-docshell-http-scheme-count.patch` | **Upgrade** — Proof XOR fix (http(s)-only FirstDocument count) |
| `DarkstrDocShellHooks::StrictNextNavArmed` | Alias of `ShouldApplyPersona` (`duppel_persona::strict_next_nav_armed`) |
| `CountsTowardStrictFirstDoc` | **http/https only** — about:blank / about:newtab / chrome: ignored |
| Phase parity | n==0 / unset mirror → `FirstDocument` (chrome Map parity) |
| C++ Navigator + nsHttp UA | Gated on SubsequentNav when `strictFirstDoc` (phase mirror) |
| CH REMOVE | Unchanged — pollution+hooks only (0003 asymmetry) |
| Chrome NativePersona | `strictNextNavArmed` + snapshot prefers C++ phase mirror; `_noteTopLevelDocument` http(s)-only |
| Depth / Worker per-BC | Null on first_document when strictFirstDoc |
| Diagnostic | `darkstr.docshell.strictNextNavArmed` (no `privacy.*`) |
| Gates default-off | Idle unless `pollution_active` **and** `nativePersonaHooks` |
| Mini helper | [`PHASE-3-DOCSHELL-0020-MINI-APPLY.sh`](PHASE-3-DOCSHELL-0020-MINI-APPLY.sh) (allow-subdir + toolkit/library relink) |

### Proof XOR on tip `5550daa` — FAIL → http-scheme fix

Hard FAIL: Pollution+hooks+strictFirstDoc never showed first-nav holdback. Pref mirror already `subsequent_nav` / `strictNextNavArmed=true` on about:blank; first https UA already Firefox/140. Root cause: C++ `nsDocShell::LoadURI` counted about:blank / chrome new-tab as FirstDocument so first https was already SubsequentNav. Fix: `CountsTowardStrictFirstDoc` + chrome scheme filter (http/https only).

### XOR expectations (Proof) — 0020

| Case | Expect |
|------|--------|
| Pollution + hooks + `strictFirstDoc=true`; **first http(s)** content nav | Persona/Navigator/UA **idle**; `docShellPhase=first_document`; `strictNextNavArmed=false`; stock UA |
| about:blank / about:newtab / chrome (no http(s) yet) | Must **not** advance counter; phase stays unset or `first_document`; armed=false |
| Same; **subsequent http(s)** content nav | Persona surfaces **armed**; phase `subsequent_nav`; `strictNextNavArmed=true` |
| Pollution + hooks + `strictFirstDoc=false` | Armed from first http(s) (no first-doc holdback) |
| Default / Homogeneous / hooks off | Idle unchanged |
| `privacy.*` from 0020 | **None** |

**Executor (Grok Linux box):** Mini apply + `mach build` = **NOT RUN** (no Mini SSH). Compose dry-run full + upgrade verified.

### Proof XOR on tip `b68286f` — FAIL → BrowserId + read-only phase (0022)

Hard FAIL again: natural Pollution+hooks+strictFirstDoc still had `subsequent_nav`/`armed=true` on about:blank; first https UA 140. Diagnostic clear-prefs showed http(s) filter OK for **first** https, but **second** https stayed `first_document`/UA 155.

Root causes:
1. Chrome `navPhaseForChannel` **fallthrough wrote `subsequent_nav`** on background HTTP / no-BC (and prefs.js could persist). Fix: phase resolve is **READ-ONLY**; only count paths write; clear phase prefs on `init`.
2. Counter keyed by **BrowsingContext::Id()** which resets on Fission/cross-group nav → every https looked like first. Fix: key by **BrowserId** (tab-stable) in C++ + chrome Map.

Patch: `patches/0022-darkstr-docshell-browserid-phase.patch`.

### XOR expectations (Proof) — 0022

| Step | Expect |
|------|--------|
| about:blank (natural, no pref clear) | phase unset or `first_document`; `strictNextNavArmed` unset/false; stock UA |
| First https | `first_document`; armed=false; UA 155 (stock) |
| Second https | `subsequent_nav`; armed=true; persona UA (e.g. 140) |
| Homogeneous / hooks off | Idle |


## WebGL cap buckets + OffscreenCanvas window parity (0023) — this PR

| Deliverable | Status |
|-------------|--------|
| `patches/0023-darkstr-depth-webgl-caps-offscreencanvas.patch` | **Merged** PR #49 — extends `DarkstrDepthHooksChild` (post-0017/0019) |
| WebGL `getParameter` cap buckets | Persona GPU family (`apple` / `intel_low` / `intel_mid` / `nvidia_mid` / `nvidia_high`) from Phase 1 `webgl.js` — MAX_* + viewport/line/point/anisotropy |
| UNMASKED vendor/renderer + `readPixels` noise | Unchanged from **0017** |
| OffscreenCanvas window parity | `convertToBlob` (noisy clone) + `OffscreenCanvasRenderingContext2D.getImageData` when present; soft-optional |
| Pin-2 lessons retained | `safeForUntrustedWebProcess`, `Cu.waiveXrays` / `Cu.exportFunction`, pageshow, `getPrefType` seed, `lastInstall`/`lastError`, install-dist_bin, DocShell SubsequentNav gate for depth delivery |
| Gates default-off | Idle unless `pollution_active` **and** `nativePersonaHooks` |
| Mini helper | [`PHASE-3-DEPTH-0023-MINI-APPLY.sh`](PHASE-3-DEPTH-0023-MINI-APPLY.sh) |

### Honest spoof matrix (0023)

| Surface | Spoofed here? |
|---------|---------------|
| `getParameter(UNMASKED_VENDOR/RENDERER)` | **Yes** (0017) |
| Persona-family MAX_* / viewport / line / point / anisotropy | **Yes** (0023) |
| `readPixels` RGBA/UNSIGNED_BYTE noise | **Yes** (0017) |
| OffscreenCanvas `convertToBlob` / OC2D `getImageData` | **Yes** when constructors exist (0023) |
| `getSupportedExtensions` / `getExtension` advertise lists | **No** — WebExt richer |
| `getShaderPrecisionFormat` tiers | **No** — WebExt richer |
| Fail-closed `null` for unknown `getParameter` | **No** — unknown params **passthrough** native |
| Font-probe / ultrasonic / ServiceWorker | **No** |

### XOR expectations (Proof) — 0023

| Case | Expect |
|------|--------|
| Default / Homogeneous / hooks off | Idle — stock WebGL caps + no OffscreenCanvas noise; `depth.lastInstall` idle/uninstalled |
| Pollution + hooks + depth seed; HTMLCanvas toDataURL/getImageData | Nonzero delta vs idle (0017 unchanged) |
| Pollution + hooks + depth seed; WebGL `getParameter` MAX_TEXTURE_SIZE (etc.) | Matches persona GPU family bucket (not host when host differs) |
| Pollution + hooks + depth seed; UNMASKED vendor/renderer | Persona `gpu.vendor` / `gpu.renderer` |
| Pollution + hooks + depth seed; OffscreenCanvas 2D `convertToBlob` / `getImageData` | Noise diverges from idle (when OffscreenCanvas available) |
| Pollution + hooks + `strictFirstDoc`; first https | Depth idle / null payload (0020–0022 SubsequentNav holdback) |
| Same; subsequent https | Depth installed; caps + OffscreenCanvas armed |
| `privacy.*` from 0023 | **None** |

**Executor (Grok Linux box):** Mini apply + `mach build` = **NOT RUN** (no Mini SSH). Compose-tree dry-run apply verified on box.

## Richer chrome chaff beacon bodies (0024) — merged on main

| Deliverable | Status |
|-------------|--------|
| `patches/0024-darkstr-chaff-richer-beacon-bodies.patch` | **Merged** PR #50 as `4c22b29` — extends `DarkstrChaffScheduler` (post-0016) |
| Session interest clusters | Phase 1 `poisoner.js` tech/home/fashion/fitness/family/finance (2–3 locked per chrome session) |
| GA Universal / GA4 / Meta PageView | Query payloads parity (`tid`/`cid`/`dp`/`dh`/`dr`/`sr`/`vp`; GA4 `dl`+`sid`; Meta `id`+`ev`+`dl`+`rl`+`sw`/`sh`+`v`) |
| Endpoints | Same ordinary HTTP: `google-analytics.com/collect`, `/g/collect`, `facebook.com/tr/` |
| Quiet / Balanced / Loud | Unchanged interval / batch / stagger |
| Gates default-off | Idle unless `pollution_active` **and** `nativePersonaHooks` |
| Diagnostic | `darkstr.chaff.lastBeaconKind` (+ richer `lastFireAt` with kind) |
| Mini helper | [`PHASE-3-CHAFF-0024-MINI-APPLY.sh`](PHASE-3-CHAFF-0024-MINI-APPLY.sh) |

### Honest matrix (0024)

| Surface | Here? |
|---------|-------|
| Session-coherent interest clusters + screen/cid/tids/metaId | **Yes** |
| GA Universal / GA4 / Meta PageView query on ordinary chrome fetch | **Yes** |
| Quiet/Balanced/Loud volume+timing (0016) | **Yes** (unchanged) |
| ISOLATED-world `sendBeacon` with real Referer + cookie jar | **No** — WebExt richer |
| DOM ad-container attribute chaff | **No** — WebExt richer |
| Interaction-coupled bridge fire | **No** — WebExt richer |
| Cloudflare / TLS / JA3 fingerprint games | **No** |
| `privacy.*` writes | **None** |

### XOR expectations (Proof) — 0024

| Case | Expect |
|------|--------|
| Default / Homogeneous / hooks off | Idle — `schedulerArmed=false`; no beacon fire |
| Pollution + hooks false | Idle (explicit allow required) |
| Pollution + `nativePersonaHooks=true`; Quiet/Balanced/Loud | Armed; `lastPlan` shows level+interval+batch; after fire `lastFireAt` includes `ga`/`ga4`/`meta` endpoint + kind; `lastBeaconKind` set |
| Fired beacon URL | Query carries persona-coherent fields (not thin `UA-DARKSTR-0` / `example.invalid`) |
| Homogeneous / `nativeCompatible=true` | Idle / cancel |
| `privacy.*` from 0024 | **None** |

**Executor/package record (Mini):** `./mach package` **SUCCEEDED** at approximately **12:06 CDT** on 2026-09-21 after rebuilding the dangling `nmhproxy` Rust symlink. See the Packaging gate below.

## Packaging gate — DONE

- DMG: `~/src/darkstr-gecko/librewolf-source/librewolf-155.0.1-1/obj-aarch64-apple-darwin25.6.0/dist/librewolf-155.0.1-1.en-US.mac.dmg` (94 Mi)
- Artifact symlink: `~/src/darkstr-gecko/artifacts/librewolf-155.0.1-1.en-US.mac.dmg`
- SHA256: `778a370cd6dcd58880c38446d182db91b1203fa5c16fc36ecec0a2fcded63a1b`
- Mini free space after package: approximately 12 GiB

## Next

**Pins 1–3 + soft residuals 0019 + DocShell 0020–0022 + WebGL/Offscreen 0023 + richer chaff 0024 are merged on main (`4c22b29`); Phase 3 main covers `0016`–`0024`.** Packaging is **DONE**. Remaining items are documentation-only soft residuals:

1. Worker `hardwareConcurrency` may remain the host value when the C++ binding is non-configurable.
2. Headed-only live WebGL on Marionette remains a soft residual.

## Proof gates for this PR

- [x] Pref keys stay `darkstr.*`; no `privacy.*` writes from worker module
- [x] Hooks idle unless Pollution + `nativePersonaHooks` (default-off)
- [x] Payload from persona snapshot / seed; depth optional from same seeds as 0017
- [x] DedicatedWorker + SharedWorker only; ServiceWorker/Worklets explicitly out of scope
- [x] Patch id `0018`; stub `0004` updated to point at it
- [x] Docs: PHASE-3-STATUS + M4 Next + GECKO-HOOKS §2.5 + apply markers + Mini helper
- [x] Pin 1 recorded XOR PASS / merged `d5fb026` + install-dist_bin lesson
- [x] Pin 2 recorded XOR PASS / merged `1eef97b` (tip `9d4fa76`) + Xray/pageshow/seed-type lessons
- [x] Mini apply + subdirectory build + dist install (operator 2026-09-20)
- [x] Proof XOR PASS tip `37820f6` — Worker UA matches persona; constructors wrap
- [x] Soft residuals 0019 v1: lastInstall runtimeOnly + HW best-effort (Proof PASS)
- [x] Soft residuals 0019 v2: OfflineAudio page-compartment install (after XOR FAIL on `f18c0b6`)
- [x] Mini apply 0019 v2 + subdirectory build + dist install (operator)
- [x] Proof XOR re-skim OfflineAudio deltaSum / startRendering vs Homogeneous
- [x] Honest non-claims listed above


## Pin 3 Mini apply note (2026-09-20)

Refreshing `DarkstrWorkerHooks*.sys.mjs` before `apply-darkstr-patches` can make
patch report 0018 "already applied" while BrowserGlue / moz.build still lack
WorkerHooks. Helper now force-applies those hunks and fails closed if missing.


## Proof gates for 0020 (this PR)

- [x] Pref keys stay `darkstr.*`; diagnostic `darkstr.docshell.strictNextNavArmed` only
- [x] Hooks idle unless Pollution + `nativePersonaHooks` (default-off)
- [x] `strictFirstDoc` first-nav vs subsequent-nav semantics preserved / wired into C++ UA+Navigator
- [x] Only http(s) count toward FirstDocument (`CountsTowardStrictFirstDoc`)
- [x] CH REMOVE not regresssed (still pollution+hooks; not strict-next gated)
- [x] Patch id `0020` + http-scheme upgrade; stub `0004` points at it
- [x] Docs: PHASE-3-STATUS + M4 Next + GECKO-HOOKS §2.4 + apply markers + Mini helper
- [x] 0022: BrowserId tab-stable counter; chrome phase READ-ONLY; clear phase on init
- [ ] Mini apply 0022 + allow-subdir C++/toolkit/library + chrome + install-dist_bin
- [ ] Proof XOR natural: blank unarmed → first https idle → second https armed (no pref surgery)


## Proof gates for 0023 (merged PR #49)

- [x] Pref keys stay `darkstr.*`; no `privacy.*` writes from depth module
- [x] Hooks idle unless Pollution + `nativePersonaHooks` (default-off)
- [x] Cap buckets align with Phase 1 `webgl.js` GPU family; honest non-claims documented
- [x] OffscreenCanvas `convertToBlob` / OC2D `getImageData` parity when present
- [x] Pin-2 lessons retained (waiveXrays / pageshow / getPrefType / lastInstall / install-dist_bin / SubsequentNav gate)
- [x] Patch id `0023`; stub `0004` + apply markers + Mini helper + GECKO-HOOKS §2.5
- [x] Compose dry-run apply on Grok box
- [x] Mini apply 0023 + subdirectory build + install-dist_bin (operator)
- [x] Proof XOR: idle default; Pollution caps match persona family; OffscreenCanvas noise; SubsequentNav holdback

## Proof gates for 0024 (merged PR #50)

- [x] Pref keys stay `darkstr.*`; diagnostic `darkstr.chaff.lastBeaconKind` only (no `privacy.*`)
- [x] Hooks idle unless Pollution + `nativePersonaHooks` (default-off)
- [x] Quiet/Balanced/Loud volume+timing unchanged from 0016 / Phase 1 poisoner
- [x] Beacon query/bodies align with Phase 1 `poisoner.js` GA/GA4/Meta endpoints
- [x] Honest non-claims: no CF/TLS/JA3; WebExt may remain richer (ISOLATED sendBeacon + DOM chaff)
- [x] Patch id `0024`; stub `0004` + apply markers + Mini helper + GECKO-HOOKS §2.2
- [x] Compose dry-run apply on Grok box
- [x] Mini apply 0024 + subdirectory build + install-dist_bin (operator)
- [x] Proof XOR: idle default; Pollution fires richer kinded beacons; Homogeneous idle


## P0 FP coherence (0025) — this PR

**Date:** 2026-09-21 (CDT)  
**Goal:** Fix Proof hard fails so Pollution+hooks seed-42 is a **coherent Firefox persona** (not Chrome cosplay).

| Deliverable | Status |
|-------------|--------|
| `patches/0025-darkstr-fp-coherence-p0.patch` | **New** — Worker arm + window HW + langs |
| Mini helper | [`PHASE-3-FP-0025-MINI-APPLY.sh`](PHASE-3-FP-0025-MINI-APPLY.sh) |
| Apply markers | `0025` in `patches/scripts/apply-darkstr-patches.sh` |
| Stub `0004` | Points at `0025` |

### Root causes (verified in-tree)

1. **Window HW=12 (host) under Pollution+hooks, RFP off** — JS proto spoof often cannot redefine non-configurable C++ `hardwareConcurrency`; C++ `TryGetHardwareConcurrency` returned false when Int mirror missing/wrong type. Homogeneous/RFP letterboxes to 8 and hid the gap.
2. **WorkerHooks idle while Depth installed** — `_readWorkerPayload` used `snapshotForBrowsingContext(null)` for **global** arm after 0020. With `strictFirstDoc`, BC-null always yields null → `hooksArmed=false` permanently; Depth arms from snapshot prefs without that gate. Per-BC SubsequentNav gate in `workerPayloadForBrowsingContext` was fine.
3. **langs `["en-US"]` only** — sticky primary-tag `languageOverride` + WebIDL `[Cached]` after first-doc collapsed the live list; snapshot still had `en-US,en,es`.

### Fixes

| Surface | Change |
|---------|--------|
| Worker | Global arm from `getPlan().snapshot` / prefs (Depth parity); observe `docShellPhase`; BC gate unchanged |
| HW | Instance-first Child spoof; clear+setIntPref coerce; C++ string parse + UA-present default 8 |
| langs | Pulse primary `languageOverride` then clear to `""`; re-force langs mirror + `intl.accept_languages` on GetSnapshot |

### Explicit non-claims (unchanged)

ServiceWorker / Worklets, fonts, screen/DPR, CF/TLS/JA3, Chrome cosplay, Intl timezone (P1 — document or native later).

### Mini apply + build

```bash
source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env
cd ~/src/darkstr-gecko/darkstr   # pull this PR tip
./docs/PHASE-3-FP-0025-MINI-APPLY.sh
# or: patch + mach build browser/components + dom/base + toolkit/library + install-dist_bin
```

**Executor (Grok Linux box):** no Mini SSH / no Mini filesystem — Mini apply + `mach build` = **NOT RUN here**. Compose-tree dry-run apply verified on box.

### XOR expectations (Proof)

| Case | Expect |
|------|--------|
| Pollution + hooks + seed-42 after SubsequentNav | `navigator.hardwareConcurrency === 8` |
| Same | `darkstr.worker.hooksArmed=true`; `lastInstall` ok/installed (or already-installed) |
| Same | `navigator.languages` includes `es` (full snapshot list) |
| Homogeneous / hooks off | Worker+Depth idle; HW letterbox via RFP OK; no persona langs |
| `privacy.*` from these modules | **None** |

## Soft P1 Firefox-persona coherence (0028)

**Date:** 2026-09-21 (CDT)
**Goal:** Close seed-42 timezone incoherence and the optional WebRTC IP leak without Chrome cosplay or hidden permanent pref changes.

| Surface | 0028 behavior |
|---------|---------------|
| Intl / Date timezone | `BrowsingContext.timezoneOverride` = armed snapshot timezone (`Europe/Berlin` for seed-42); Gecko updates current realm plus dedicated/shared workers |
| Strict first document | Host timezone remains until SubsequentNav snapshot arms |
| Homogeneous / hooks off | Timezone override cleared to host/RFP behavior |
| WebRTC | `media.peerconnection.enabled=false` only while native Pollution applies |
| WebRTC restore | Exact pre-Pollution user-pref state restored (explicit bool vs cleared/default) |
| Build | Chrome `browser/components` only; no XUL relink |

Patch: `patches/0028-darkstr-fp-coherence-p1-tz-webrtc.patch`
Mini helper: [`PHASE-3-FP-0028-MINI-APPLY.sh`](PHASE-3-FP-0028-MINI-APPLY.sh)

### Proof XOR expectations for 0028

- First HTTPS holdback: live timezone stays host (`America/Chicago` on Mini); WebRTC is disabled globally under Pollution.
- Pollution + hooks after SubsequentNav: window and dedicated-worker timezone = `Europe/Berlin`; `media.peerconnection.enabled=false`; RTCPeerConnection absent/disabled and no srflx candidate.
- Homogeneous / hooks off: `timezoneOverride=""`; prior `media.peerconnection.enabled` state restored exactly; existing P0 HW/langs/worker gates remain PASS.
- Headed WebGL stays a separate soft validation item; 0028 makes no new WebGL claim.
