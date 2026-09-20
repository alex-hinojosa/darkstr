# Phase 3 status — pin 1: native chaff timer glue

**Date:** 2026-09-19 (CDT)  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.

## Goal (this pin)

Ship the **first Phase 3 pin**: train-pinned thin native **chaff timer** glue on
LibreWolf/Firefox **155.0.1-1**, calling into the existing Rust control plane
(`duppel_chaff::ChaffSchedulerPlan` / Quiet·Balanced·Loud). Convert stub intent in
`patches/stubs/0004-darkstr-chaff-depth.patch.stub` into a **real scheduler-only**
patch — not canvas/WebGL/Audio/workers yet.

## What landed

| Deliverable | Status |
|-------------|--------|
| `patches/0016-darkstr-chaff-native-scheduler.patch` | **New** — `DarkstrChaffScheduler.sys.mjs` + BrowserGlue + moz.build |
| Chrome `nsITimer` arming | Quiet/Balanced/Loud interval + batch + stagger (poisoner / Rust parity) |
| Ordinary HTTP beacons | Phase 1 poisoner endpoints (GA collect / Meta `tr`) — thin query payload |
| Gates default-off | Idle unless `pollution_active` **and** `darkstr.nativePersonaHooks` |
| `darkstr.chaosLevel` default | `"balanced"` in `darkstr.cfg` (timer still idle without hooks) |
| Diagnostics prefs | `darkstr.chaff.schedulerArmed` / `lastPlan` / `lastFireAt` (no `privacy.*`) |
| Apply-script markers | `0016` idempotent skip when markers present |
| Stub `0004` | Kept as historical note; points at `0016` for scheduler; depth leftovers remain stub |
| Docs | This file; M4-STATUS Next; GECKO-HOOKS §2.2; PHASE-2-PLAN / EXIT checkbox |

## Gate truth (Proof XOR)

| Mode / prefs | Timer |
|--------------|-------|
| Default Homogeneous + hooks false | **Idle** (`schedulerArmed=false`) |
| Pollution + hooks false | **Idle** (explicit allow required) |
| Pollution + `nativePersonaHooks=true` + `chaosLevel` | **Arms** with Quiet/Balanced/Loud schedule |
| Homogeneous / `nativeCompatible=true` | **Idle** (cancel) |
| This module writes `privacy.*`? | **No** |

## Mini apply + build

Operator on Mac Mini SSD (Atlas: never `mv` under `/Volumes/Mesh`):

```bash
source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env
cd ~/src/darkstr-gecko/darkstr   # or pull this PR tip
./patches/scripts/apply-darkstr-patches.sh --require-root
# or: patch -d "$DARKSTR_GECKO_ROOT" -p1 < patches/0016-darkstr-chaff-native-scheduler.patch
cd "$DARKSTR_GECKO_ROOT"
./mach build --allow-subdirectory-build browser/components
```

Helper: [`PHASE-3-CHAFF-0016-MINI-APPLY.sh`](PHASE-3-CHAFF-0016-MINI-APPLY.sh).

**Mini (2026-09-19 CDT):** 0016 applied; alphabetical `MOZ_SRC_FILES` fix;
`mach build browser/components` OK; **`make install-dist_bin`** required so
`DarkstrChaffScheduler.sys.mjs` lands under `dist/.../moz-src/browser/components/`
(subdirectory build alone left BrowserGlue wired but module missing — Proof XOR FAIL).
Mirrored into `LibreWolf.app/Contents/Resources/moz-src/...` as well.

| Check | Status |
|-------|--------|
| Patch dry-run / apply on Mini tree | **DONE** (2026-09-19) |
| `./mach build --allow-subdirectory-build browser/components` | **DONE** |
| `make install-dist_bin` + app `moz-src` present | **DONE** (tip `dcc4847` + install) |
| Headed Proof XOR on rebuilt app | **Not claimed** |

## Explicit non-claims

- Canvas / WebGL / Audio / worker native hooks
- Approach A (`gkrust` path dependency)
- Fresh `./mach package` / DMG
- Hooks / chaff timer **default-on**
- Cloudflare / TLS / JA3 bypass claims
- Full persona-coherent poisoner bodies in chrome (thin beacon query only; WebExt poisoner remains authoritative for rich payloads)

## Next

1. Proof XOR on tip with live dist module present; then headed Pollution+hooks skim when ready.
2. Phase 3 pin 2: canvas / WebGL / Audio depth hooks (train-pinned; seeds from snapshot when `pollution_active`).
3. Phase 3 pin 3: worker globals coherence.
4. Optional: richer chrome beacon bodies parity with `poisoner.js` (still ordinary HTTP only).

## Proof gates for this PR

- [x] Pref keys stay `darkstr.*`; no `privacy.*` writes from chaff module
- [x] Timer idle unless Pollution + `nativePersonaHooks` (default-off)
- [x] Quiet/Balanced/Loud parity with Phase 1 / Rust `ChaffSchedule`
- [x] Ordinary HTTP beacons only; no CF/TLS/JA3 claims
- [x] Patch id `0016`; stub `0004` updated to point at it
- [x] Docs: PHASE-3-STATUS + M4 Next + GECKO-HOOKS §2.2 + apply markers
- [x] Mini apply + subdirectory build + dist install (operator 2026-09-19)
- [x] Honest non-claims listed above
