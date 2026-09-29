# Mini package / artifact pin

**Project:** darkstr — pollution browser; not official LibreWolf.  
**Date:** 2026-09-29 (CDT)  
**Scope:** honest packaging evidence. Does **not** flip hooks default-on.  
**Train:** LibreWolf **156.0.1-1** (`$DARKSTR_GECKO_ROOT`).

## Fresh package — **YES** (2026-09-29) — Soft residual **0039–0043** included

| Field | Value |
|---|---|
| Fresh package this push | **Yes** — Mini seat, 2026-09-29 ~00:37 CDT |
| CWD / objdir | `$DARKSTR_GECKO_ROOT` = `~/src/darkstr-gecko/librewolf-source/librewolf-156.0.1-1`; objdir `obj-aarch64-apple-darwin25.6.0` |
| Command | `/usr/bin/make -C obj-aarch64-apple-darwin25.6.0 -j12 -s -w package` (same body as `./mach package`; mach alone resolved default `obj-…-darwin27.0.0` after host Darwin **27.0.0** bump and lacked `config.status` there — pinned existing 25.6.0 objdir) |
| Exit | **0** (DMG created; log `~/src/darkstr-gecko/mach-package-156-20260929-003658.log`) |
| Artifact | `obj-aarch64-apple-darwin25.6.0/dist/librewolf-156.0.1.en-US.mac.dmg` |
| Absolute path | `/Users/alexander/src/darkstr-gecko/librewolf-source/librewolf-156.0.1-1/obj-aarch64-apple-darwin25.6.0/dist/librewolf-156.0.1.en-US.mac.dmg` |
| Size | 99440846 bytes (~95 MiB) |
| SHA-256 | `e3290e38c23848388a1da542700e1a2d4ca6facd18b9a67c72bf5123936236f4` |
| DMG mtime | **2026-09-29 00:37:31 CDT** |
| Sourcestamp (`*.mac.txt`) | buildid `20260928084500`; mozilla-release `6f2c158dfc7e9693f880fad2510ceb51a158c069` |
| darkstr tip (docs / Soft residual SoT) | `0b95bbfdf2ed82f98f773a3d655732d75f4eb834` (main; PR [#74](https://github.com/alex-hinojosa/darkstr/pull/74) merge `2672848` / docs close 0043) |
| Soft residuals in this DMG | **0039** FontFaceSet · **0040** Approach A · **0041** retire B · **0042** Cookie `/echo` QI · **0043** Worker/SharedWorker WebGPU |
| Brand | darkstr fork work on LibreWolf train — **not** official LibreWolf |

### Prior ship (superseded)

| Field | Value |
|---|---|
| DMG mtime | 2026-09-28 06:59:13 CDT |
| Size / SHA-256 | 99451265 / `d400de8bf4271312f123b1adfbd8fef2bdabbc3c867f57ea11bf861096dab32b` |
| Softs included | through **0038** only — **did not** include 0039–0043 |

### Disk

| When | Data volume free |
|---|---|
| Before / after package | **~54 Gi** (`df` on `/System/Volumes/Data`) — no reclaim needed; Gecko 156 source + objdir kept |

**Never** `mv` under `/Volumes/Mesh`. Objdir **not** clobbered.

### Hooks markers in packaged DMG

Verified inside DMG `LibreWolf.app/Contents/Resources/omni.ja` (`moz-src/browser/components/…`); SHA-256 matches tree source:

| Marker | Result |
|---|---|
| `DarkstrDepthHooksChild.sys.mjs` | Present (**76173** bytes); Soft residual **0039** FontFaceSet enumeration + retained **0038**/`webgpuSeed`/`plainAdapterInfo`/`installWebGpuInPage` + **0037**/`speechSeed` |
| `DarkstrFfi.sys.mjs` | Present; **0040** Approach A / **0041** Approach B retired (A-only) |
| `DarkstrCookieFirewall.sys.mjs` | Present; Soft residual **0042** Cookie `/echo` QI |
| `DarkstrWorkerHooks.sys.mjs` / `DarkstrWorkerHooksChild.sys.mjs` | Present; Soft residual **0043** / **0043 re-XOR** (`contentBlob` / `depthSeedsForBrowsingContext` / `buildWebGpuOverrides`) |
| XUL `darkstr.mode` / `darkstr.nativePersonaHooks` | Present in staged/DMG `Contents/MacOS/XUL` |
| `librewolf.cfg` darkstr prefs (hooks **default-off**) | `darkstr.mode=homogeneous`; `darkstr.nativePersonaHooks=false` |
| `libduppel_ffi.dylib` | **Absent** — **moot** post-0041 A-only |

Evidence folder (Builder light checklist; optional Proof package-path smoke):  
`~/AgentDocs/proof/darkstr-ship-156-dmg-20260929-003745/`

**FFI packaging (post-0041):** Product Pollution FFI is **Approach A only** (`darkstr_ffi_*` in libxul/XUL via gkrust). Side-loaded `libduppel_ffi.dylib` is **not** required. See [`M-FFI-0041-STATUS.md`](M-FFI-0041-STATUS.md).

## Existing DEV app pin (Proof / headed skim)

Prefer launcher: `~/src/darkstr-gecko/headed-hooks-on-skim.sh` (temp profile; pollution + hooks for intentional skim — product default remains hooks **off**).

| Field | Value |
|---|---|
| App | `$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0/dist/LibreWolf.app` |
| Binary | `…/Contents/MacOS/librewolf` |
| Soft residual JS | moz-src symlinks → tree (0039–0043 applied); packaged omni in fresh DMG is the ship SoT |
| `libduppel_ffi.dylib` | May be present historically in DEV; **inert post-0041** |

## How Proof runs headed XOR / package-path smoke

1. Confirm pin path exists on Mini SSD (objdir preserved) **or** install from the fresh DMG. FFI snapshot uses Approach A (XUL-resident); no B dylib post-copy required (0041).
2. Prefer launcher: `~/src/darkstr-gecko/headed-hooks-on-skim.sh`.
3. Matrix (Homogeneous / Pollution / NC) per [`PROOF-XOR-CHECKLIST.md`](PROOF-XOR-CHECKLIST.md) / [`MINI-SMOKE-CHECKLIST.md`](MINI-SMOKE-CHECKLIST.md).
4. Soft residual harness `storage.local` live read vs chrome mirror stays **soft**.
5. Optional package-path smoke (prior style `darkstr-ship-156-*`): parent may ping Proof with DMG path+SHA — Builder does **not** ping Proof.

## Builder note for Alex

Fresh branded fork **DMG** records Soft residual **0039–0043** in packaged `omni.ja` (SHA match tree). Product hooks remain **default-off**. Prior 2026-09-28 DMG (`d400de8b…`) is superseded for ship (pre-0039 softs only). Full Proof package-path XOR is **next if** Proof wants an ACK on this artifact.
