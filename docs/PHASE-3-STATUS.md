# Phase 3 status — pin 2: Canvas / WebGL / Audio depth hooks

**Date:** 2026-09-19 (CDT)  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.

## Goal (this pin)

Ship **Phase 3 pin 2**: train-pinned thin native **Canvas 2D / WebGL / Audio** depth
hooks on LibreWolf/Firefox **155.0.1-1**, reading snapshot seeds when
`pollution_active` (`depth_canvas_seed` / `depth_audio_seed` / `depth_webgl_gpu` /
`duppel_bridge::read_depth_seeds`). Convert stub leftovers in
`patches/stubs/0004-darkstr-chaff-depth.patch.stub` into a **real depth** patch —
workers remain pin 3.

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

## What landed (pin 2)

| Deliverable | Status |
|-------------|--------|
| `patches/0017-darkstr-depth-canvas-webgl-audio.patch` | **New** — `DarkstrDepthHooks*.sys.mjs` + BrowserGlue + moz.build |
| Canvas 2D | Deterministic ±0–3 RGB noise on `toDataURL` / `toBlob` / `getImageData` from `canvasSeed` |
| WebGL | `UNMASKED_VENDOR` / `UNMASKED_RENDERER` from persona GPU; `readPixels` RGBA noise |
| Audio | `AudioBuffer.getChannelData` once-per-channel micro-noise from `audioSeed` |
| Gates default-off | Idle unless `pollution_active` **and** `darkstr.nativePersonaHooks` |
| Seeds | Prefer `darkstr.persona.snapshot` JSON; fallback `darkstr.persona.seed` |
| Diagnostics prefs | `darkstr.depth.hooksArmed` / `darkstr.depth.lastSeeds` (no `privacy.*`) |
| Apply-script markers | `0017` idempotent skip when markers present |
| Stub `0004` | Points at `0016` (scheduler) + `0017` (canvas/WebGL/Audio); workers still later |
| Docs | This file; M4-STATUS Next; GECKO-HOOKS §2.5; Mini apply helper |

## Gate truth (Proof XOR)

| Mode / prefs | Depth hooks |
|--------------|-------------|
| Default Homogeneous + hooks false | **Idle** (`hooksArmed=false`; child gets null seeds) |
| Pollution + hooks false | **Idle** (explicit allow required) |
| Pollution + `nativePersonaHooks=true` + snapshot/seed | **Armed** — content applies canvas/WebGL/Audio |
| Homogeneous / `nativeCompatible=true` | **Idle** |
| This module writes `privacy.*`? | **No** |
| Workers hooked? | **No** (pin 3) |

## Mini apply + build

Operator on Mac Mini SSD (Atlas: never `mv` under `/Volumes/Mesh`):

```bash
source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env
cd ~/src/darkstr-gecko/darkstr   # or pull this PR tip
./patches/scripts/apply-darkstr-patches.sh --require-root
# or: patch -d "$DARKSTR_GECKO_ROOT" -p1 < patches/0017-darkstr-depth-canvas-webgl-audio.patch
cd "$DARKSTR_GECKO_ROOT"
./mach build --allow-subdirectory-build browser/components
# REQUIRED after subdirectory build (pin 1 lesson):
OBJ="$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0"
rm -f "$OBJ/install_dist_bin.track"
( cd "$OBJ" && make install-dist_bin )
# Mirror new modules into LibreWolf.app Resources/moz-src if missing
```

Helper: [`PHASE-3-DEPTH-0017-MINI-APPLY.sh`](PHASE-3-DEPTH-0017-MINI-APPLY.sh).

**This PR executor (Grok Linux box):** no Mini SSH / no Mini filesystem — Mini apply +
`mach build` status = **NOT RUN here**. Compose-tree dry-run apply verified on box.

| Check | Status |
|-------|--------|
| Patch dry-run on post-0016 compose (DarkstrFfi moz.build) | **DONE** (Grok box) |
| Patch dry-run / apply on Mini tree | **NOT RUN** (no Mini access) |
| `./mach build` + `install-dist_bin` on Mini | **NOT RUN** |
| Headed Proof XOR on rebuilt app | **Pin 1 PASS; pin 2 re-gate pending** |
| Pin 2 Fission actor attachment | **Fix added:** `safeForUntrustedWebProcess: true` on DepthHooks + NativePersona actors |

## Explicit non-claims

- Worker globals (Dedicated/Shared) — **pin 3**
- Approach A (`gkrust` path dependency)
- Fresh `./mach package` / DMG
- Hooks / depth / chaff **default-on**
- Cloudflare / TLS / JA3 bypass claims
- Full WebGL capability-bucket spoof / font-probe / ultrasonic (WebExt path remains richer until parity PRs)
- Live C++ Canvas/WebGL/Audio bindings (chrome JSWindowActor only this pin)

## Next

1. Operator: Mini apply `0017` + subdirectory build + **install-dist_bin** + app moz-src; Proof XOR.
2. Phase 3 pin 3: worker globals coherence (same persona seed).
3. Optional: richer WebGL cap buckets / OffscreenCanvas parity with Phase 1 bootstrap.
4. Optional: richer chrome chaff beacon bodies (ordinary HTTP only).

## Proof gates for this PR

- [x] Pref keys stay `darkstr.*`; no `privacy.*` writes from depth module
- [x] Hooks idle unless Pollution + `nativePersonaHooks` (default-off)
- [x] Seeds from snapshot / seed only when `pollution_active` (`read_depth_seeds` parity)
- [x] Canvas + WebGL + Audio only; workers explicitly out of scope
- [x] Patch id `0017`; stub `0004` updated to point at it
- [x] Docs: PHASE-3-STATUS + M4 Next + GECKO-HOOKS §2.5 + apply markers + Mini helper
- [x] Pin 1 recorded XOR PASS / merged `d5fb026` + install-dist_bin lesson
- [ ] Mini apply + subdirectory build + dist install (operator)
- [x] Honest non-claims listed above


## Pin 2 Proof re-gate (Fission actor)

Initial Mini XOR on `5933e21` proved the chrome gate/seeds but found the content
mutation path dead under Fission (`webIsolated`): the actor registration lacked
`safeForUntrustedWebProcess`. Follow-up adds that flag to both
`DarkstrDepthHooks` and the pre-existing `DarkstrNativePersona` actor, plus a
string-seed fallback (`"42"` → int) for operator/diagnostic robustness. Re-run
headed HTTP canvas/WebGL mutation before merge.
