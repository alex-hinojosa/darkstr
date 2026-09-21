# Phase 3 status — pins 1–3 + soft residuals (0019)

**Date:** 2026-09-21 (CDT)  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.

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
- Fresh `./mach package` / DMG
- Hooks / depth / chaff / worker **default-on**
- Cloudflare / TLS / JA3 bypass claims
- ServiceWorker / AudioWorklet / PaintWorklet injection
- Live C++ worker bindings (chrome JSWindowActor constructor wrap only)
- Canvas/WebGL/Audio window depth — already **0017** (this pin = workers)
- Full WebGL capability-bucket spoof / font-probe / ultrasonic (WebExt path remains richer)

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

## Next

**Pins 1–3 + soft residuals 0019 + DocShell SubsequentNav 0020 on train (PR open).** Remaining optional:

1. Optional: richer WebGL cap buckets / OffscreenCanvas window parity with Phase 1 bootstrap.
2. Optional: richer chrome chaff beacon bodies (ordinary HTTP only).
3. Soft: fresh `./mach package` when disk allows.
4. Soft: worker `hardwareConcurrency` if Mini still shows host after instance spoof (C++ non-configurable — document only).
5. Soft: Mini apply 0019 v2 + Proof OfflineAudio re-skim if not yet operator-done.

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
- [ ] Mini apply 0019 v2 + subdirectory build + dist install (operator)
- [ ] Proof XOR re-skim OfflineAudio deltaSum / startRendering vs Homogeneous
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
- [ ] Mini apply upgrade + allow-subdir C++/toolkit/library + chrome + install-dist_bin
- [ ] Proof XOR: first http(s) idle (`first_document` / armed=false / stock UA); subsequent armed
