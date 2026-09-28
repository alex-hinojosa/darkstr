# Mini package / artifact pin

**Project:** darkstr — pollution browser; not official LibreWolf.  
**Date:** 2026-09-28 (CDT)  
**Scope:** honest packaging evidence. Does **not** flip hooks default-on.  
**Train:** LibreWolf **156.0.1-1** (`$DARKSTR_GECKO_ROOT`).

## Fresh `./mach package` — **YES** (2026-09-28)

| Field | Value |
|---|---|
| Fresh `./mach package` this push | **Yes** — Mini seat, 2026-09-28 ~06:59 CDT |
| CWD | `$DARKSTR_GECKO_ROOT` = `~/src/darkstr-gecko/librewolf-source/librewolf-156.0.1-1` |
| Command | `./mach package` |
| Exit | **0** (DMG created; log `~/src/darkstr-gecko/mach-package-156-20260928-065859.log`) |
| Artifact | `obj-aarch64-apple-darwin25.6.0/dist/librewolf-156.0.1.en-US.mac.dmg` |
| Size | 99451265 bytes (~95 MiB) |
| SHA-256 | `d400de8bf4271312f123b1adfbd8fef2bdabbc3c867f57ea11bf861096dab32b` |
| DMG mtime | **2026-09-28 06:59:13 CDT** |
| Sourcestamp (`*.mac.txt`) | buildid `20260928015621`; mozilla-release `6f2c158dfc7e9693f880fad2510ceb51a158c069` |
| darkstr tip (docs / applied Soft residual SoT) | `ff89e8287509e21049399504bfdf2b85e54e33a0` (main; 0038 Proof-green) |
| Brand | darkstr fork work on LibreWolf train — **not** official LibreWolf |

### Disk

| When | Data volume free |
|---|---|
| Before reclaim | **~19 Gi** (`df` on `/System/Volumes/Data`) |
| After safe reclaim | **~21 Gi** (~2.8 Gi reclaimed) |
| Before `./mach package` | **~21 Gi** |
| After `./mach package` | **~21 Gi** |

**Reclaimed (safe only; Gecko 156 source + objdir kept):** Chrome/Google caches, ms-playwright, UnityHub/Unity editor caches, Homebrew/pip/node-gyp caches, Xcode DerivedData, VS Code ShipIt cache, regenerable prior `dist/librewolf` stage + prior Sep-24 DMG / xpt zip / `dist/mac`. **Never** `mv` under `/Volumes/Mesh`. Objdir **not** clobbered.

### Hooks markers in packaged DMG

Verified inside DMG `LibreWolf.app/Contents/Resources/omni.ja`:

| Marker | Result |
|---|---|
| `moz-src/browser/components/DarkstrDepthHooksChild.sys.mjs` | Present (69924 bytes); SHA-256 matches tree source |
| Soft residual **0038** / `webgpuSeed` / `installWebGpuInPage` / `plainAdapterInfo` | Present in packaged module |
| Soft residual **0037** / `speechSeed` | Present |
| XUL `darkstr.mode` / `darkstr.nativePersonaHooks` | Present in staged/DMG `Contents/MacOS/XUL` |
| `librewolf.cfg` darkstr prefs (hooks **default-off**) | Present in stage Resources |

**Honest gap (unchanged vs Sep-24 package behavior):** `libduppel_ffi.dylib` is **not** in the DMG. Approach B installs it into `dist/bin` (+ DEV app MacOS/Resources mirror) but it is **not** listed in `browser/installer/package-manifest.in`. Pollution+hooks FFI snapshot fill for a DMG-installed copy needs a post-copy of the dylib next to `MacOS/librewolf`, or Proof continues to use the objdir DEV app which already has the dylib (mtime **2026-09-24 12:49:55 CDT**). Soft residual JS hooks in omni.ja do **not** require the dylib.

## Existing DEV app pin (Proof / headed skim)

Prefer launcher: `~/src/darkstr-gecko/headed-hooks-on-skim.sh` (temp profile; pollution + hooks for intentional skim — product default remains hooks **off**).

| Field | Value |
|---|---|
| App | `$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0/dist/LibreWolf.app` |
| Binary | `…/Contents/MacOS/librewolf` |
| XUL mtime | **2026-09-23 11:04:45 CDT** (Soft residual depth is JS in omni/moz-src; XUL carries native persona prefs strings) |
| `libduppel_ffi.dylib` | Present next to binary (see gap note above for DMG) |
| Light smoke 2026-09-28 ~07:00 CDT | Launch OK — parent + content processes alive ≥15s; no DiagnosticReports crash; quit OK. **Not** full Proof XOR. |

## How Proof runs headed XOR

1. Confirm pin path exists on Mini SSD (objdir preserved) **or** install from the fresh DMG and, if FFI needed, copy `libduppel_ffi.dylib` beside `MacOS/librewolf`.
2. Prefer launcher: `~/src/darkstr-gecko/headed-hooks-on-skim.sh`.
3. Matrix (Homogeneous / Pollution / NC) per [`PROOF-XOR-CHECKLIST.md`](PROOF-XOR-CHECKLIST.md) / [`MINI-SMOKE-CHECKLIST.md`](MINI-SMOKE-CHECKLIST.md).
4. Soft residual harness `storage.local` live read vs chrome mirror stays **soft**.

## Builder note for Alex

Fresh branded fork **DMG** is recorded. Hooks Soft residual through **0038** verified in the packaged `omni.ja`. Product hooks remain **default-off**. Full Proof XOR on this artifact is **next if** Proof wants a package-path ACK; light Mini smoke already launch-OK on the DEV app. FFI-in-DMG packaging is a known residual (manifest), not a new depth pin.
