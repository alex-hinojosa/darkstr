# Phase 3 status — pin 3: Worker globals coherence

**Date:** 2026-09-19 (CDT)  
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
| Soft residual | Audio `getChannelData` deltaSum 0 in one OfflineAudioContext pattern — optional later, not blocking |

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
| Stub `0004` | Points at `0016` + `0017` + `0018` (workers); DocShell strict-next-nav still later |
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
| Patch dry-run / apply on Mini tree | **NOT RUN** (no Mini access) |
| `./mach build` + `install-dist_bin` on Mini | **NOT RUN** |
| Headed Proof XOR on rebuilt app | **Pin 1 PASS; pin 2 PASS on `9d4fa76`; pin 3 pending Mini** |

## Explicit non-claims

- Approach A (`gkrust` path dependency)
- Fresh `./mach package` / DMG
- Hooks / depth / chaff / worker **default-on**
- Cloudflare / TLS / JA3 bypass claims
- ServiceWorker / AudioWorklet / PaintWorklet injection
- Live C++ worker bindings (chrome JSWindowActor constructor wrap only)
- Canvas/WebGL/Audio window depth — already **0017** (this pin = workers)
- Full WebGL capability-bucket spoof / font-probe / ultrasonic (WebExt path remains richer)

## Next

1. Operator: Mini apply `0018` + subdirectory build + **install-dist_bin** + app moz-src (+ module refresh if re-apply); Proof XOR.
2. Optional: richer WebGL cap buckets / OffscreenCanvas window parity with Phase 1 bootstrap.
3. Optional: richer chrome chaff beacon bodies (ordinary HTTP only).
4. DocShell strict-next-nav SubsequentNav arm (extends M3) — still open.

## Proof gates for this PR

- [x] Pref keys stay `darkstr.*`; no `privacy.*` writes from worker module
- [x] Hooks idle unless Pollution + `nativePersonaHooks` (default-off)
- [x] Payload from persona snapshot / seed; depth optional from same seeds as 0017
- [x] DedicatedWorker + SharedWorker only; ServiceWorker/Worklets explicitly out of scope
- [x] Patch id `0018`; stub `0004` updated to point at it
- [x] Docs: PHASE-3-STATUS + M4 Next + GECKO-HOOKS §2.5 + apply markers + Mini helper
- [x] Pin 1 recorded XOR PASS / merged `d5fb026` + install-dist_bin lesson
- [x] Pin 2 recorded XOR PASS / merged `1eef97b` (tip `9d4fa76`) + Xray/pageshow/seed-type lessons
- [ ] Mini apply + subdirectory build + dist install (operator)
- [x] Honest non-claims listed above


## Pin 3 Mini apply note (2026-09-20)

Refreshing `DarkstrWorkerHooks*.sys.mjs` before `apply-darkstr-patches` can make
patch report 0018 "already applied" while BrowserGlue / moz.build still lack
WorkerHooks. Helper now force-applies those hunks and fails closed if missing.
