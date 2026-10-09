# Phase 5 status — eng backlog after Phase 4 depth closed

**Date:** 2026-09-28 (CDT)  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.  
**Train:** LibreWolf **156.0.1-1** (Mini SoT via `DARKSTR_GECKO_ROOT`)

Phase 4 depth (through **0034** lastSeeds eTLD diag) is **CLOSED** / Proof PASS.  
Phase 5 pin **0035 cookie firewall MVP** is **MERGED** / Proof XOR **PASS**.  
Phase 5 pin **0036 fonts coherence** is **MERGED** / Proof XOR **PASS** (PR #67; see evidence below).
Phase 5 pin **0037 speech coherence** is **MERGED** / Proof XOR **PASS** (PR #68; see evidence below).
Phase 5 pin **0038 WebGPU coherence** is **MERGED** / Proof XOR **PASS** (PR [#69](https://github.com/alex-hinojosa/darkstr/pull/69); see evidence below).

Phase 5 pin **0039 FontFaceSet enumeration coherence** is **MERGED** / Proof XOR **PASS** (PR [#70](https://github.com/alex-hinojosa/darkstr/pull/70); see evidence below) — soft-residual polish extending 0036 `check`→enumeration; not a new depth surface.
Phase 5 eng **depth backlog empty**; soft residuals remain (see backlog table). Native privacy-pane UI is PM-owned. Approach A FFI (**0040**) is **Proof-green on main** (PR [#71](https://github.com/alex-hinojosa/darkstr/pull/71) MERGED `f828a78`). Approach B runtime load (**0041**) is **Proof-green / MERGED** (PR [#72](https://github.com/alex-hinojosa/darkstr/pull/72) `f961d39`) — **A-only**; soft historical dylib inert; hooks default-off. See [`M-FFI-0040-STATUS.md`](M-FFI-0040-STATUS.md) / [`M-FFI-0041-STATUS.md`](M-FFI-0041-STATUS.md).
Phase 5 soft residual pin **0042 Cookie `/echo` QI** is **MERGED** / Proof XOR **PASS** (PR [#73](https://github.com/alex-hinojosa/darkstr/pull/73) `cda3c91`) — outbound sandbox Cookie closed; soft residual from 0035 empty `/echo` Cookie **closed**.
Phase 5 soft residual pin **0043** Worker/SharedWorker WebGPU is **MERGED** / Proof XOR **PASS** (PR [#74](https://github.com/alex-hinojosa/darkstr/pull/74) `2672848`) — DedicatedWorker+SharedWorker via 0018 blob + 0038-parity wrap; soft residual from 0038 Worker OOS **closed**. ServiceWorker still OOS; AdapterInfo.device empty stays soft / do not invent.

## Completed — 0036 Fonts coherence / fingerprint farbling

| Item | Status |
|------|--------|
| Pin | **0036** |
| PR | [#67](https://github.com/alex-hinojosa/darkstr/pull/67) **MERGED** as `a49cf98b3f120e5c0d14336f2411c9638d4c0cff` |
| Tip at Proof | `d01038b7d64c3dd95e581263dca2fa47381b8d7c` |
| Branch | `builder/phase5-fonts-0036` |
| Patch | [`patches/0036-darkstr-fonts-coherence.patch`](../patches/0036-darkstr-fonts-coherence.patch) |
| Mini helper | [`scripts/apply-0036-fonts-coherence-mini.sh`](../scripts/apply-0036-fonts-coherence-mini.sh) / [`PHASE-5-FONTS-0036-MINI-APPLY.sh`](PHASE-5-FONTS-0036-MINI-APPLY.sh) |
| Proof | **PASS** |
| Evidence | `~/AgentDocs/proof/darkstr-pr67-0036-xor-20260924-205857/` |

### Design summary

Depth `fontSeed` (from eTLD-effective persona seed via `_generateDepthFromSeed` **after**
`canvasSeed`/`audioSeed` so golden digests stay intact; snapshot may supply
`fontSeed`/`font_seed`; else stable XOR fallback) drives page-compartment farbling
under the same arm gate as other depth hooks:

`pollution && !nativeCompatible && nativePersonaHooks` (plus DocShell SubsequentNav
when `strictFirstDoc`).

Surfaces (Brave-inspired sticky farbling; Firefox/LibreWolf/Gecko persona only):

1. **Canvas / Offscreen `measureText`** — silence-safe multiplicative width fudge
   `[0.999, 1.0)`; width `0` stays `0`; horizontal bounding boxes scaled coherently.
2. **`document.fonts.check`** — Firefox-plausible baseline families passthrough;
   non-baseline keep/drop by deterministic seed hash (no Chrome-only font lists).
3. **DOM probes** — `offsetWidth` / `clientWidth` / `getBoundingClientRect` width
   fudge (same fudge; integer widths rounded). Soft residual: ≤0.1% layout shift risk.

Default-**on** with depth hooks (like audio/WebGL). Homogeneous / hooks-off: idle.
Diag: `darkstr.depth.lastSeeds` JSON gains `fontSeed` (0034 path).

### Prefs / arm gate

| Pref / gate | Role |
|-------------|------|
| `darkstr.mode=pollution` ∧ `!nativeCompatible` ∧ `nativePersonaHooks` | Arm (shared depth) |
| `darkstr.depth.hooksArmed` / `lastSeeds` (incl. `fontSeed`) | Diag |
| Golden lock | non-empty `darkstr.persona.snapshot` **or** `rotatePerSite=false` |

No new default-off arm pref (justified: same risk class as 0031 audio width-style
fudge; DOM residual documented).

### Proof gates — PASS (do not ping from Builder)

1. Hooks-off / Homogeneous → idle (host font metrics)
2. Pollution+hooks: same seed → stable font/measureText digests (double-read)
3. Different eTLD+1 with rotatePerSite → digests diverge
4. Same eTLD two tabs → same digests/seed
5. Golden lock seed-42 coherent; no Chrome-only font names in any surfaced list — **PASS**

### Proof result — PASS

All five font-coherence XOR gates passed on Proof tip `d01038b7d64c3dd95e581263dca2fa47381b8d7c`.

**Soft residuals (not FAIL):**

- DOM width fudge may shift pixel-perfect layouts by **≤0.1%** when hooks are armed.
- ~~`document.fonts.ready` / `FontFaceSet` iteration and full enumeration are not wrapped (only `check`)~~ → **0039** wraps enumeration (`values`/`keys`/`entries`/`forEach`/`@@iterator`/`size`/`load`); `ready` stays host Promise (by design).

### Out of scope (this pin)

- speech / WebGPU
- Native-Compatible privacy-pane UI (PM)
- ~~FontFaceSet full enumeration filtering~~ → **0039** **CLOSED** / Proof PASS (PR #70)
- gfx-level font whitelist (Tor-style) — page-compartment only

### Residual risks

- DOM width fudge may shift pixel-perfect layouts by ≤0.1% when hooks armed.
- ~~`document.fonts` iteration not wrapped~~ → **0039**. `ready` stays host Promise.
- Not anti-detect / not Cloudflare bypass.

## Apply status (Mini) — 0036 — 2026-09-24 ~20:56 CDT

- Tree: LibreWolf **156.0.1-1** (`$DARKSTR_GECKO_ROOT`)
- Markers already present (Builder applied source edits); patch skip OK
- `./mach build --allow-subdirectory-build browser/components` — **OK** (~7s)
- `make install-dist_bin` — Kept existing; moz-src symlinks refreshed
- Symlinks: `dist/LibreWolf.app/.../moz-src/browser/components/DarkstrDepthHooks*.sys.mjs` → source (fontSeed / Soft residual 0036 present)
- PR [#67](https://github.com/alex-hinojosa/darkstr/pull/67) **MERGED** as `a49cf98b3f120e5c0d14336f2411c9638d4c0cff`; Proof XOR **PASS** on tip `d01038b7d64c3dd95e581263dca2fa47381b8d7c`
- Apply log: `~/src/darkstr-gecko/darkstr-apply-0036-20260924-205605.log`

## Completed — 0037 Speech synthesis / SpeechRecognition coherence

| Item | Status |
|------|--------|
| Pin | **0037** |
| PR | [#68](https://github.com/alex-hinojosa/darkstr/pull/68) **MERGED** as `fda34a4890ab9b5a8eeae7b5862e6ffddd5c8464` |
| Tip at Proof | `f1ae094082f7c626a10caa9356d60a309977e971` |
| Branch | `builder/phase5-speech-0037` |
| Patch | [`patches/0037-darkstr-speech-coherence.patch`](../patches/0037-darkstr-speech-coherence.patch) |
| Mini helper | [`scripts/apply-0037-speech-coherence-mini.sh`](../scripts/apply-0037-speech-coherence-mini.sh) / [`PHASE-5-SPEECH-0037-MINI-APPLY.sh`](PHASE-5-SPEECH-0037-MINI-APPLY.sh) |
| Proof | **PASS** |

### Design summary

Depth `speechSeed` (from eTLD-effective persona seed via `_generateDepthFromSeed`
**after** `fontSeed` so golden digests stay intact; snapshot may supply
`speechSeed`/`speech_seed`; else stable XOR fallback from `fontSeed`⊕`canvasSeed`)
drives page-compartment farbling under the same arm gate as other depth hooks:

`pollution && !nativeCompatible && nativePersonaHooks` (plus DocShell SubsequentNav
when `strictFirstDoc`).

Surfaces (Brave-inspired sticky farbling; Firefox/LibreWolf/Gecko persona only):

1. **`speechSynthesis.getVoices()`** — seed-tied filter/reorder of **host native**
   voices only. Empty native list stays empty. Default voice always kept. No
   invented Chrome/Google voice names. Double-read and `voiceschanged` coherent
   via fingerprint-keyed cache of the farbled list.
2. **SpeechRecognition / `webkitSpeechRecognition`** — soft residual only: when the
   pref-gated constructor is already exposed (`media.webspeech.recognition.enable`),
   seed-tie empty `lang` to a Firefox-plausible BCP47 default. Do **not** invent
   the API when absent (would be Chrome cosplay).

Default-**on** with depth hooks (same risk class as fonts/audio list farbling;
justified). Homogeneous / hooks-off: idle. Diag: `darkstr.depth.lastSeeds` JSON
gains `speechSeed` (0034 path).

### Prefs / arm gate

| Pref / gate | Role |
|-------------|------|
| `darkstr.mode=pollution` ∧ `!nativeCompatible` ∧ `nativePersonaHooks` | Arm (shared depth) |
| `darkstr.depth.hooksArmed` / `lastSeeds` (incl. `speechSeed`) | Diag |
| Golden lock | non-empty `darkstr.persona.snapshot` **or** `rotatePerSite=false` |

No new default-off arm pref (justified: read-only voice-list subset/reorder; TTS
still uses real host voices; SpeechRecognition soft and pref-gated upstream).

### Proof gates — PASS

1. Hooks-off / Homogeneous → idle (host voices)
2. Pollution+hooks: same seed → stable getVoices digests (double-read / voiceschanged)
3. Different eTLD+1 with rotatePerSite → digests / speechSeed diverge
4. Same eTLD two tabs → same digests / speechSeed
5. Golden lock seed-42 coherent; no Chrome-only voice names in any surfaced list

### Proof result — PASS

All five speech-coherence XOR gates passed on Proof tip `f1ae094082f7c626a10caa9356d60a309977e971`.

**Evidence:** `~/AgentDocs/proof/darkstr-pr68-0037-xor-20260928-004815/`

**Soft residuals (not FAIL)**:

- SpeechRecognition surface is best-effort when the pref is off / constructor is absent.
- `getVoices()` may be empty before the host asynchronously populates native voices.
- Voice-list subset may hide some non-default host voices under Pollution+hooks
  (TTS still works via kept default / first voice).
- `voiceschanged` fires from host; farbled list updates only when native signature
  changes (by design for coherence).

### Out of scope (this pin)

- WebGPU → **0038** (**MERGED** / Proof XOR **PASS**)
- Native-Compatible privacy-pane UI (PM)
- Fonts (already **0036** MERGED / PASS)
- Inventing Chrome-only voice names or `webkitSpeechRecognition` when absent
- gfx/C++ speech service farbling

### Residual risks

- Host with very few voices → subset may equal full list (entropy soft).
- Not anti-detect / not Cloudflare bypass.

## Apply status (Mini) — 0037 — 2026-09-26 ~13:14 CDT

- Tree: LibreWolf **156.0.1-1** (`$DARKSTR_GECKO_ROOT`)
- Markers already present (Builder applied source edits); patch skip OK
- `./mach build --allow-subdirectory-build browser/components` — **OK** (~8s)
- `make install-dist_bin` — Kept existing; moz-src symlinks refreshed
- Symlinks: `dist/LibreWolf.app/.../moz-src/browser/components/DarkstrDepthHooks*.sys.mjs` → source (`speechSeed` / Soft residual 0037 present)
- PR [#68](https://github.com/alex-hinojosa/darkstr/pull/68) **MERGED** as `fda34a4890ab9b5a8eeae7b5862e6ffddd5c8464`; Proof XOR **PASS** on tip `f1ae094082f7c626a10caa9356d60a309977e971`
- Apply log: `~/src/darkstr-gecko/darkstr-apply-0037-20260926-131431.log`
- Disk free after apply: ~9.3 Gi (Data volume)

## Completed — 0038 WebGPU adapter/device/limits/features coherence

| Item | Status |
|------|--------|
| Pin | **0038** |
| PR | [#69](https://github.com/alex-hinojosa/darkstr/pull/69) **MERGED** as `b974c8077500a5e8d2ad35a22eee6135c291754b` |
| Tip at Proof | `4eaca24c22c8b45cb909f4b777d2c89430d013dd` |
| Branch | `builder/phase5-webgpu-0038` |
| Patch | [`patches/0038-darkstr-webgpu-coherence.patch`](../patches/0038-darkstr-webgpu-coherence.patch) (+ re-XOR `patches/0038-darkstr-webgpu-coherence-rexor.patch`; Apply SoT `patches/0038-files/`) |
| Mini helper | [`scripts/apply-0038-webgpu-coherence-mini.sh`](../scripts/apply-0038-webgpu-coherence-mini.sh) / [`PHASE-5-WEBGPU-0038-MINI-APPLY.sh`](PHASE-5-WEBGPU-0038-MINI-APPLY.sh) |
| Proof | **PASS** (third re-XOR after FAIL tips `bbe308d9…` / `5319de7e…`) |
| Evidence | `~/AgentDocs/proof/darkstr-pr69-0038-xor-20260928-015655/` |
| PR comment | https://github.com/alex-hinojosa/darkstr/pull/69#issuecomment-5865022571 |

### Design summary

Depth `webgpuSeed` (from eTLD-effective persona seed via `_generateDepthFromSeed`
**after** `speechSeed` so golden digests stay intact; snapshot may supply
`webgpuSeed`/`webgpu_seed`; else stable XOR fallback from `speechSeed`⊕`audioSeed`)
drives page-compartment farbling under the same arm gate as other depth hooks:

`pollution && !nativeCompatible && nativePersonaHooks` (plus DocShell SubsequentNav
when `strictFirstDoc`).

**Pref choice (documented):** LibreWolf ships `defaultPref("dom.webgpu.enabled", false)`.
This pin prefers **soft-coherence** — do **not** flip that default. When
`navigator.gpu` is absent, hooks are **idle** (no inventing WebGPU / Chrome adapters).
When WebGPU is enabled (user or Proof), wrap fingerprint surfaces.

Surfaces (Brave-inspired sticky farbling; Firefox/LibreWolf/Gecko persona only):

1. **`navigator.gpu.requestAdapter()`** — wrap resolved `GPUAdapter` in a Proxy.
2. **Adapter / device `features`** — seed-tied / seed-ranked subset of **host** features only;
   always keep `core-features-and-limits` when present; never invent feature names.
3. **Adapter / device `limits`** — soft multiplicative downward fudge `[0.99, 1.0)`
   on fingerprinty `max*` keys only; **never** touch `min*Alignment` (power-of-2).
4. **`adapter.info` / `device.adapterInfo`** — map depth `gpu` persona →
   Firefox-plausible WebGPU AdapterInfo (`apple` / `intel` / `nvidia` / `amd`);
   coherent with WebGL UNMASKED vendor/renderer family; no Chrome adapter cosplay.
   Plain AdapterInfo objects (not Proxy of GPUAdapterInfo) so Marionette/Xray observes fields.
5. **`requestDevice`** — `defineProperty` overlay on device features/limits/adapterInfo
   reusing adapter `sharedFeatCache` (adapter↔device coherent under Xray).

**re-XOR (closed):** under `rotatePerSite`, depth seeds (incl. `webgpuSeed`) derive from
the eTLD-effective seed **first** (not snap-canvas fallthrough to global plan.seeds).

Default-**on** with depth hooks (same risk class as fonts/speech list farbling).
Homogeneous / hooks-off / pref-off: idle. Diag: `darkstr.depth.lastSeeds` JSON
gains `webgpuSeed` (0034 path).

### Prefs / arm gate

| Pref / gate | Role |
|-------------|------|
| `darkstr.mode=pollution` ∧ `!nativeCompatible` ∧ `nativePersonaHooks` | Arm (shared depth) |
| `darkstr.depth.hooksArmed` / `lastSeeds` (incl. `webgpuSeed`) | Diag |
| `dom.webgpu.enabled` | **LibreWolf default false** — unchanged by this pin |
| Golden lock | non-empty `darkstr.persona.snapshot` **or** `rotatePerSite=false` |

No new default-off arm pref (justified: read-only adapter metadata / feature subset
when API already exposed; idle when pref-off).

### Proof gates — PASS

1. Hooks-off / Homogeneous / `dom.webgpu.enabled=false` → idle
2. Pollution+hooks with WebGPU enabled: same seed → stable adapter info/features/limits digests (double-read; adapter↔device coherent)
3. Different eTLD+1 with rotatePerSite → digests / webgpuSeed diverge
4. Same eTLD two tabs → same digests / webgpuSeed
5. Golden lock seed-42 coherent; no Chrome-only adapter brands; AdapterInfo coherent with depth gpu / WebGL persona family

### Proof result — PASS

All five WebGPU-coherence XOR gates passed on Proof tip `4eaca24c22c8b45cb909f4b777d2c89430d013dd`
(third re-XOR; prior FAIL tips `bbe308d9…` / `5319de7e…` fixed: a↔d n match, rotate-first
webgpuSeed diverge, plainAdapterInfo non-empty / familiesCoherent).

**Evidence:** `~/AgentDocs/proof/darkstr-pr69-0038-xor-20260928-015655/`

**Soft residuals (not FAIL):**

- LibreWolf `dom.webgpu.enabled` **default off** — most sessions never exercise wrappers (by design; gate 1 idle).
- `AdapterInfo.device` remains **empty** (host/Gecko surface; not invented).
- ~~Worker / ServiceWorker WebGPU (`WorkerNavigator.gpu`) **out of scope** (window path only)~~ → **0043** wraps DedicatedWorker+SharedWorker; ServiceWorker still OOS.
- Feature subset is **seed-ranked drop** of non-core host features under Pollution+hooks (entropy soft when host list is tiny).
- Limits fudge is soft (≤1%); alignment limits untouched.
- Proxy wrappers: `instanceof GPUAdapter` still holds; some exotic brand-checks may differ.

### Out of scope (this pin)

- Flipping LibreWolf `dom.webgpu.enabled` default
- Native-Compatible privacy-pane UI (PM)
- ~~Worker/ServiceWorker WebGPU surfaces~~ → **0043** **CLOSED** / Proof PASS (PR #74) for Dedicated+Shared; ServiceWorker still OOS
- Inventing Chrome adapters or enabling WebGPU when pref-off
- C++/wgpu-level farbling
- Approach A FFI (deferred)

### Residual risks

- Host with very few features → subset may equal full list (entropy soft).
- Not anti-detect / not Cloudflare bypass.

## Apply status (Mini) — 0038 — 2026-09-28 ~01:56 CDT (Proof PASS apply) / merge ~01:58 CDT

- Tree: LibreWolf **156.0.1-1** (`$DARKSTR_GECKO_ROOT`)
- Re-XOR markers present (`plainAdapterInfo` / `a2dDefineProperty` / rotate path FIRST / `sharedFeatCache`); patch skip OK
- `./mach build --allow-subdirectory-build browser/components` — **OK**; `make install-dist_bin` refreshed moz-src
- Symlinks: `dist/LibreWolf.app/.../moz-src/browser/components/DarkstrDepthHooks*.sys.mjs` → source (`webgpuSeed` / Soft residual 0038 / `installWebGpuInPage` / plainAdapterInfo present)
- PR [#69](https://github.com/alex-hinojosa/darkstr/pull/69) **MERGED** as `b974c8077500a5e8d2ad35a22eee6135c291754b`; Proof XOR **PASS** on tip `4eaca24c22c8b45cb909f4b777d2c89430d013dd`
- Apply log (PASS re-apply): `~/AgentDocs/proof/darkstr-pr69-0038-xor-20260928-015655/darkstr-apply-0038-20260928-015619.log`
- LibreWolf `dom.webgpu.enabled` default remains **false** (unchanged)

## Next eng backlog

**Phase 5 eng depth backlog empty after 0039.** Soft residual **0042** Cookie `/echo` QI **CLOSED** / Proof-green. Soft residual **0043** Worker/SharedWorker WebGPU **CLOSED** / Proof-green. Remaining softs only (no new eng pins from this close):

| Pin | Residual | Status |
|-----|----------|--------|
| **0042** | Cookie 0035 `/echo` Cookie header empty | Soft → **CLOSED** / Proof **PASS** / MERGED `cda3c91` (PR [#73](https://github.com/alex-hinojosa/darkstr/pull/73); QI nsIHttpChannel) |
| **0043** | WebGPU 0038 Worker/SharedWorker OOS | Soft → **CLOSED** / Proof **PASS** / MERGED `2672848` (PR [#74](https://github.com/alex-hinojosa/darkstr/pull/74); DedicatedWorker+SharedWorker via 0018 blob; ServiceWorker still OOS) |
| — | Speech 0037 pref-off / empty voices before async | Soft / do not invent API |
| — | WebGPU AdapterInfo.device empty | Soft / do not invent |
| — | WebGPU ServiceWorker OOS | Soft / register ≠ Worker blob; do not invent |
| — | FFI `libduppel_ffi` not in DMG `package-manifest.in` | Soft / **moot** for product A-only path (XUL carries symbols); historical B dylib inert |
| — | `document.fonts.ready` still host Promise | Soft (by design; not wrapped in 0039) |
| — | Native privacy-pane UI | PM-owned |
| — | Approach A FFI (**0040**) | **MERGED** / Proof **PASS** (PR #71 `f828a78`); A-only after **0041**; hooks default-off |
| — | Approach B load-path retirement (**0041**) | **MERGED** / Proof **PASS** (PR #72 `f961d39`); B runtime load retired; soft historical dylib inert |
| — | Soft historical `libduppel_ffi.dylib` in dist/bin | Soft / inert (chrome A-only does not load) |

## In progress — 0047 darkstr start page + full-bleed Dock icon

| | |
|---|---|
| Pin | **0047** (start page LibreWolf → darkstr branding; Dock icon gray-plate fix) |
| Branch | `builder/0047-startpage` (from `main` 48ff688) → PR to `main` |
| Patch | [`patches/0047-darkstr-startpage-dockicon.patch`](../patches/0047-darkstr-startpage-dockicon.patch) (text diffs + header) + binaries in [`patches/0047-files/`](../patches/0047-files/); apply [`scripts/apply-0047-startpage-dockicon-mini.sh`](../scripts/apply-0047-startpage-dockicon-mini.sh) |
| LibreWolf on start page (before) | about:home (default homepage + new window) and about:newtab, both modes: "LibreWolf" wordmark = `chrome://branding/content/firefox-wordmark.svg` next to the 0046 jet tile (`about-logo.png`). Private window about:privatebrowsing: same wordmark + `about-logo-private.png`. No "LibreWolf" text in page DOM. about:welcome → about:home. Homepage `about:home` (not LibreWolf-branded) kept |
| After | PM jet mark (outline, #9AAEFF, no tile) + lowercase `darkstr` wordmark (#E8E9F0 dark / #1C1E28 light), in the existing newtab row (mark left, wordmark right: stacking would need a web-accessible activity-stream CSS change) |
| Mechanism | branding-package files only: `content/firefox-wordmark.svg`, `content/about-logo{,-private}{,@2x}.png`. No activity-stream CSS/HTML/strings touched; `chrome://branding/content/*` blocked to pages (img + fetch) |
| Dock | `firefox.icns` = PM full-bleed iconset (heavy 16/32) **plus** `Assets.car` (actool, Icon Composer-style `AppIcon.icon`) + `CFBundleIconName=AppIcon` (`browser/app/moz.build`, `Info.plist.in`, `package-manifest.in`). The .icns alone is still plated on macOS 27.0.1; Assets.car removes the plate |
| Inventory | [`patches/0047-files/ICON-INVENTORY.md`](../patches/0047-files/ICON-INVENTORY.md) |
| DMG | `~/AgentDocs/builds/darkstr-0047-85eb9bc3.dmg`; **100,388,409 B**; SHA-256 `85eb9bc3f7c889a68542001103181f3f86f2dcae7898adcbe31f69c3921e6731` (`darkstr-0047-9dc12e4d.dmg` = icns-only intermediate, superseded). App diff vs 0046: 5 branding files in browser omni, `Assets.car`, `Info.plist` (+CFBundleIconName), build IDs. No stale LibreWolf helpers |
| Smoke | fresh profiles, both modes: no LibreWolf on start/new tab/private page; UA/navigator/headers = 0046; brandHits none; Homogeneous 1600×900 (outer−inner 0); Pollution 113, bookmarks `always`; Dock icon no gray plate |
| Untouched | `DarkstrModeXor.sys.mjs`, `librewolf.cfg`, prefs, search engines, fingerprinting code |
| Evidence | `~/AgentDocs/proof/darkstr-0047-20261008/` (`shots/before-*`, `shots/after-*`, `shots/final-*`, `f-0047-{homog,poll}*`, `dock-full-final.png`, `nsicon-*.png`, `tmp/iconexp/`) |

## Completed — 0046 jet icon (E) + app icon pipeline

| Field | Value |
|------|-------|
| Pin | **0046** (app icon swap only: wolf → icon E, upright stealth-jet outline, Shock Diamond) |
| Train | LibreWolf **156.0.1-1** (on top of 0045) |
| Branch | `builder/0046-icon` → PR to `main` |
| Patch | [`patches/0046-darkstr-icon-pipeline.patch`](../patches/0046-darkstr-icon-pipeline.patch) (pointer) |
| Sources | [`patches/0046-files/icon-e/`](../patches/0046-files/icon-e/) (1024 master, 1024 heavy small-size art, PM `darkstr.iconset`; SHA-256 list) |
| Inventory | [`patches/0046-files/ICON-INVENTORY.md`](../patches/0046-files/ICON-INVENTORY.md) |
| Tool | [`scripts/darkstr-icon-from-png.sh`](../scripts/darkstr-icon-from-png.sh) — now `--small <png>` (16/32 icns slots + default PNGs up to `--small-upto`), `--iconset <dir>` (PM iconset verbatim for firefox.icns), `--doc`, `--disk`, `--install` (backs up originals) |
| Installed | `firefox.icns` = PM iconset (16/32 heavy, 128+ regular); `document.icns`/`disk.icns` = master with heavy 16/32; `default16/32` = PM iconset slots, `default22/24/48` heavy, `default64/128/256` + `about-logo*` regular |
| DMG | `<objdir>/dist/darkstr-156.0.1.en-US.mac.dmg`, copy `~/AgentDocs/builds/darkstr-0046-45dfe1d8.dmg`; **99,229,127 B**; SHA-256 `45dfe1d8f53116cd0b8acb5a08719b4db0d8e29c76da6195713c41696260d11a`. No stale `LibreWolf * Helper` |
| vs 0045 DMG | app files differing: `firefox.icns`, `document.icns`, browser `omni.ja` (only `chrome/browser/content/branding/icon{16,32,48,64,128}.png` + `about-logo*.png`), plus BuildID-only changes (`application.ini`, `platform.ini`, `AppConstants`, 77 bytes in the binary); volume icon jet; `.DS_Store` = 0045 |
| Icon check | `iconutil -c iconset` round-trip of the DMG app's `firefox.icns`: 10 slots, pixel-identical to the PM iconset; Dock shows the jet (macOS 26 draws it inside the system squircle frame) |
| Web | `chrome://branding/content/about-logo.png` + `aboutDialog.css` and `chrome://darkstr-ui` (CSS/FontFace/fetch) **blocked** from pages; positive controls load; no brand strings |
| Persona | UA `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0` and all navigator fields identical to 0045 in both modes |
| Geometry | fresh profile, real window, start about:home → site: Homogeneous page **1600×900**, outer−inner **0**; Pollution **113** (1280×1040, inner 927), bookmarks bar `always` — identical to 0045/latch |
| Untouched | `DarkstrModeXor.sys.mjs` (source = pre-0046 backup = DMG omni copy); `librewolf.cfg` (bookmarks `always`) |
| Evidence | `~/AgentDocs/proof/darkstr-0046-20261008/` (`i-dmg-{homog,poll}*`, `icon-e-from-dmg/firefox-icns-{16,32,128,512}.png`, `icon-e-from-dmg/preview-16-32-128.png`, `icon-e-dock-crop.png`, `diff-0045-vs-0046-*.txt`) |
| 0045 DMG | preserved `~/AgentDocs/builds/darkstr-0045-1712df51.dmg` (SHA-256 `1712df51…d334`, 99,596,905 B) |

## Completed — 0045 darkstr branding + default theme + Cockpit UI fonts

| Field | Value |
|------|-------|
| Pin | **0045** (rename LibreWolf → darkstr; chrome/branding only) |
| Train | LibreWolf **156.0.1-1** |
| Branch | `builder/branding-0045` — merged via PR #76 (`515a4dbe`) after Proof PASS |
| Patch | [`patches/0045-darkstr-branding.patch`](../patches/0045-darkstr-branding.patch) (pointer; SoT apply) |
| Apply SoT | [`patches/0045-files/`](../patches/0045-files/) |
| Mini helper | [`scripts/apply-0045-branding-mini.sh`](../scripts/apply-0045-branding-mini.sh) / [`PHASE-5-BRANDING-0045-MINI-APPLY.sh`](PHASE-5-BRANDING-0045-MINI-APPLY.sh) |
| Branding | `--with-branding=browser/branding/darkstr`; `MOZ_APP_DISPLAYNAME`/`MOZ_APP_BASENAME`=darkstr → `darkstr.app`, appinfo.name, brand.ftl/.properties/.dtd; `MOZ_PKG_APPNAME=darkstr` → `darkstr-156.0.1.en-US.mac.dmg` |
| Kept | `MOZ_APP_NAME=librewolf` (internal binary), `MOZ_APP_UA_NAME=Firefox`, bundle id `org.mozilla.librewolf` (global define → full rebuild), `MOZ_APP_PROFILE=librewolf` |
| Web persona | UA/navigator identical to latch `0615574e` (RFP and Pollution); no darkstr/LibreWolf in web-visible strings |
| Theme | builtin static `darkstr-theme@darkstr`, Shock Diamond default (violet alt), flat colors, `content_color_scheme=system`; top separator transparent (stock height) |
| Fonts | IBM Plex Sans Condensed (tabs/menus/panels) + IBM Plex Mono (URL bar) via non-contentaccessible `chrome://darkstr-ui`; kill switch `darkstr.ui.cockpitFonts` |
| Geometry | Windowed, fresh profile, default prefs (`browser.tabs.inTitlebar`=2 → tabs drawn in titlebar, `browser.uidensity`=0, 1280×1040 Pollution / RFP 1600×900 Homogeneous, dpr 1). LibreWolf defaults `browser.toolbars.bookmarks.visibility`=`always` (+28 px). outerH−innerH: Pollution **113** (toolbox 85 + bookmarks 28), Homogeneous **0** (RFP); with bookmarks `never` (what Marionette/WebDriver recommended prefs force): Pollution **85**, Homogeneous **0**. outerW−innerW **0** everywhere. **Latch DMG = 0045 DMG in all four cells**; fonts on = off = stock theme |
| First-run prompt | **Not in native build** (only Phase-1 WebExtension `extension/first-run.html`, not bundled). Not built. |
| Evidence | `~/AgentDocs/proof/darkstr-branding-0045-20261007/` |
| Latch DMG | preserved `~/AgentDocs/builds/darkstr-latch-0615574e.dmg` (SHA-256 `0615574e…0f1c`) |
| DMG | `<objdir>/dist/darkstr-156.0.1.en-US.mac.dmg` (Mini, objdir `obj-aarch64-apple-darwin25.6.0`), 99,596,905 B, SHA-256 `1712df5160323fe04f43e2f908e6aeb77878897f0ab9ef5ec1c0adde183cd334`. Volume `darkstr`: `darkstr.app` + Applications alias (`.DS_Store` from `branding/dsstore`, darkstr.app icon position). No stale `LibreWolf * Helper` executables |
| DMG smoke | App copied from DMG to a temp dir (not /Applications), fresh profile: brand/appinfo darkstr, Shock Diamond active, Cockpit fonts loaded (chrome only), About copy exact + librewolf.net link, 0044 pane present, UA `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0` (= latch), navigator fields = latch, fonts not web-reachable, prefers-color-scheme follows system |
| macOS names | `CFBundleName`=darkstr, no `CFBundleDisplayName` (same as latch), `CFBundleExecutable`=librewolf, bundle `darkstr.app`; LaunchServices/Dock/Force Quit/menu bar = darkstr; child processes `darkstrCP …`, `darkstr GPU Helper`; BSD process name (ps/top/pkill) `librewolf`. App icon artwork still the LibreWolf wolf |
| Signing | Same as latch: app ad-hoc linker-signed (Identifier `librewolf`, no Team ID, not notarized), DMG unsigned; `spctl` rejects both identically |

## Completed — 0044 native about:preferences pane

| Field | Value |
|------|-------|
| Pin | **0044** (native privacy pane; product close) |
| Train | LibreWolf **156.0.1-1** |
| Branch | `builder/prefs-pane-0044` |
| Patch | [`patches/0044-darkstr-prefs-pane.patch`](../patches/0044-darkstr-prefs-pane.patch) (pointer; SoT apply) |
| Apply SoT | [`patches/0044-files/`](../patches/0044-files/) |
| Mini helper | [`scripts/apply-0044-prefs-pane-mini.sh`](../scripts/apply-0044-prefs-pane-mini.sh) |
| Controls | Homogeneous XOR Pollution; Native-Compatible beside; hooks off by default, Pollution-only |
| Latch | Leaving Pollution → `darkstr.nativePersonaHooks=false` (clear checkbox + pref) |
| Evidence (controls) | `~/AgentDocs/proof/darkstr-pane-check-156-20261005-084525/` SOFT-PASS (pre-latch) |
| Evidence (FP matrix) | `~/AgentDocs/proof/darkstr-fp-matrix-156-20261004-114746/` SOFT-PASS (persona coherence; pane not scored) |
| DMG (pre-latch) | `obj-aarch64-apple-darwin25.6.0/dist/librewolf-156.0.1.en-US.mac.dmg` SHA-256 `99a89542bd5eea0af8e8c3a069b95179dd8cf7e7d6e3c0674af3ab134c463a0d` |

Product score: pane shows the three controls and hooks gate. Latch clear on mode flip **PASS**. **MERGED** after Proof PASS.

| Merge | `gh pr merge --merge` PR [#75](https://github.com/alex-hinojosa/darkstr/pull/75) |
| Latch evidence | `~/AgentDocs/proof/darkstr-pane-latch-156-20261005-085035/` PASS |
| Latch DMG SHA-256 | `0615574e7cd7616c521d32971c604f448c0f2a3e4f12c65cf8544bbabbb40f1c` |

## Completed — 0043 Worker/SharedWorker WebGPU coherence

| Item | Status |
|------|--------|
| Pin | **0043** (soft residual after 0038 Worker OOS) |
| PR | [#74](https://github.com/alex-hinojosa/darkstr/pull/74) **MERGED** as `2672848579d72fcf4f002b075374a3944b22273e` |
| Tip at Proof | `cc692641b4703af314d314d264b811a7eb8221ab` |
| Branch | `builder/phase5-webgpu-worker-0043` |
| Patch | [`patches/0043-darkstr-webgpu-worker-coherence.patch`](../patches/0043-darkstr-webgpu-worker-coherence.patch) |
| Apply SoT | [`patches/0043-files/`](../patches/0043-files/) (`DarkstrWorkerHooks.sys.mjs`, `DarkstrWorkerHooksChild.sys.mjs`) |
| Mini helper | [`scripts/apply-0043-webgpu-worker-coherence-mini.sh`](../scripts/apply-0043-webgpu-worker-coherence-mini.sh) / [`PHASE-5-WEBGPU-WORKER-0043-MINI-APPLY.sh`](PHASE-5-WEBGPU-WORKER-0043-MINI-APPLY.sh) |
| Extends | **0018** Worker blob + **0038** window WebGPU parity |
| Mini apply | **OK** 2026-09-28 ~08:44 CDT re-XOR (contentBlob + eTLD depthSeeds + idempotent wrap; moz-src symlink SHA match) |
| Proof | **PASS** |
| Evidence | `~/AgentDocs/proof/darkstr-pr74-0043-xor-20260928-084400/` + [PR comment](https://github.com/alex-hinojosa/darkstr/pull/74#issuecomment-5871171188) |
| Local verify | re-XOR LOCAL_MARKERS_PASS — WorkerHooks `6e773cdb…` / Child `42b1f83a…` (Soft residual (0043 re-XOR) / contentBlob / depthSeedsForBrowsingContext) |

### Design summary

0038 wrapped window `navigator.gpu.requestAdapter` with seed-tied features/limits/AdapterInfo
(plain objects + `defineProperty` overlay; idle when API absent). Worker/ServiceWorker were
**OOS**. Firefox exposes the same `NavigatorGPU` mixin on `WorkerNavigator`
(`WorkerNavigator includes NavigatorGPU`; `Exposed=(Window, Worker)`).

**Chosen path (clean, no Chrome invent):**

1. Plumb Depth `webgpuSeed` (+ gpu vendor/renderer) through `DarkstrWorkerHooks` payload
   (same SoT as window 0038 / sticky eTLD+1).
2. Extend 0018 blob preamble (`buildWebGpuOverrides`) so DedicatedWorker + SharedWorker
   (and nested Worker depth ≤2) run the 0038-parity wrap in the worker compartment when
   `navigator.gpu.requestAdapter` exists.
3. Idle when `navigator.gpu` absent / Homogeneous / hooks-off / `dom.webgpu.enabled=false`
   (LibreWolf default unchanged).
4. **ServiceWorker still OOS** — SW scripts install via `navigator.serviceWorker.register`,
   not `new Worker()`; wrapping register+script rewrite is a different CSP/integrity surface
   and was already honesty-excluded in 0018. Do not invent a SW path in this pin.
5. **AdapterInfo.device** stays `""` (Firefox-plausible; do not invent).

### Proof soft gates — PASS

1. Hooks-off / Homogeneous / `dom.webgpu.enabled=false` → Worker WebGPU idle (no wrap tell) — **PASS**
2. Pollution+hooks + WebGPU on: DedicatedWorker `requestAdapter` digests match window 0038
   for same seed (adapter↔device coherent; plainAdapterInfo non-empty / familiesCoherent) — **PASS**
   (winCd == dedCd == `3438821468`; vendor=`apple` arch=`common-3` desc=`Apple M2`)
3. Different eTLD+1 with rotatePerSite → worker digests / webgpuSeed diverge — **PASS**
4. Same eTLD two tabs → same worker digests / webgpuSeed — **PASS**
5. SharedWorker same-origin blob path also farbled; ServiceWorker **not** claimed; AdapterInfo.device empty; no Chrome brands — **PASS**

### Proof result — PASS

All five 0043 Worker/SharedWorker WebGPU XOR gates passed on Proof tip `cc692641b4703af314d314d264b811a7eb8221ab` (2026-09-28 ~08:46 CDT; re-XOR after prior FAIL tip `88cef4e4…`). Soft residual from 0038 (Worker WebGPU OOS) **closed** for DedicatedWorker + SharedWorker.

**Remaining soft residuals (not FAIL; no new eng pins from this close):**

- Speech 0037: SpeechRecognition pref-off; empty voices before async populate (do not invent API)
- WebGPU AdapterInfo.device empty (do not invent)
- WebGPU ServiceWorker OOS (register ≠ Worker blob; do not invent)
- FFI dylib not in DMG `package-manifest.in` (**moot** A-only after 0041)
- Soft historical `libduppel_ffi.dylib` inert
- DOM font width fudge ≤0.1% (0036 accepted)
- `document.fonts.ready` host Promise (0039 by design)
- Native privacy-pane UI (PM)

### Out of scope (this pin)

- ServiceWorker / Worklets WebGPU
- Flipping LibreWolf `dom.webgpu.enabled` default
- Inventing Chrome adapters or filling AdapterInfo.device
- Speech empty-before-async invent
- C++/gfx WebGPU farbling
- Native privacy-pane UI (PM)
- New eng depth pins

### Residual risks

- Blob preamble size grows (0038 wrap inlined); nested Worker still depth-limited to 2.
- Host with tiny feature lists → subset may equal full list (entropy soft; same as 0038).
- ServiceWorker WebGPU remains an observable soft residual (honesty; not a clean next pin — register ≠ Worker blob).

---

## Apply status (Mini) — 0043 — 2026-09-28 ~08:44 CDT (Proof PASS) / merge ~08:47 CDT

- Tree: LibreWolf **156.0.1-1** (`$DARKSTR_GECKO_ROOT`)
- SoT markers: `Soft residual (0043 re-XOR)` / `contentBlob` / `depthSeedsForBrowsingContext` / `buildWebGpuOverrides` / `webgpuSeed` present
- `./mach build --allow-subdirectory-build browser/components` — **OK** (~7s)
- `make install-dist_bin` — Kept existing; moz-src symlinks refreshed
- Symlinks: `dist/LibreWolf.app/.../moz-src/browser/components/DarkstrWorkerHooks*.sys.mjs` → source (SHA match: WorkerHooks `6e773cdb…` / Child `42b1f83a…`)
- PR [#74](https://github.com/alex-hinojosa/darkstr/pull/74) **MERGED** as `2672848579d72fcf4f002b075374a3944b22273e`; Proof XOR **PASS** on tip `cc692641b4703af314d314d264b811a7eb8221ab`
- Evidence: `~/AgentDocs/proof/darkstr-pr74-0043-xor-20260928-084400/`
- Apply log: `~/AgentDocs/proof/darkstr-pr74-0043-xor-20260928-084400/darkstr-apply-0043-20260928-084400.log`

## In review — 0057 depth farbling seeded per site (Fable B2)

| | |
|---|---|
| Pin | **0057**: canvas / audio / WebGL readPixels / fonts / WebGPU depth farbling, seeded per (container, site) from the 0056 store |
| Branch | `builder/0057-depth-per-site`, stacked on `builder/0056-persona-seed-store` (0056r3 merged in, not rebased) |
| Patch | [`patches/0057-darkstr-depth-per-site.patch`](../patches/0057-darkstr-depth-per-site.patch) + `patches/0057-files/` (DepthHooks, DepthHooksChild, DepthHooksParent, NativePersona, WorkerHooks, WorkerHooksChild, **ModeXor** (0057r2, base 0053r2); `SHA256SUMS`, `BASE_SHA256SUMS`: NativePersona base = 0056r3) |
| Apply | `scripts/apply-0057-depth-per-site-mini.sh` (chrome JS only) |
| Tests | `tests/depth-per-site-0057.test.mjs` |
| DMG | **0057r3:** `~/AgentDocs/builds/darkstr-0057r3-91fd245c.dmg` (+ `.sha256`), sha256 `91fd245cf5c9d498b822d9c6a987190d13ba98301651a01d84cd0d4d5b121422`; omni matches all 7 `patches/0057-files`. **0057r2:** `~/AgentDocs/builds/darkstr-0057r2-f0595dd2.dmg` (+ `.sha256`), sha256 `f0595dd28963056bcf8fda0341792cfec5520332f9432f4e652bdf6f340f114a` (baseline FPP off under Pollution). Before: `~/AgentDocs/builds/darkstr-0057-35247c01.dmg`, sha256 `35247c01797681cec6534fc5e219e77186e5131c60f8c90146247bad668c07a0` (r5 = 0057 on 0056r3); omni matches `patches/0057-files`, 0056 store / CookieFirewall / ClearDataService, 0053r2 ModeXor, 0055 Ffi. Superseded: `darkstr-0057-75174927` (r1), `darkstr-0057-c2f8cece` (r4 on 0056r2) |
| Evidence | **0057r3:** `~/AgentDocs/proof/darkstr-0057r3-20261009-111700/` (`selftest/live-r3`, negative control `live-negctl-0057r2`, `grade-*.txt`, `dmgverify.txt`). **0057r2:** `~/AgentDocs/proof/darkstr-0057r2-20261009-102504/` (`selftest/live-final`, `live-off-granted`, negative controls `live-negctl-0057r5` + `live-negctl-xor-0057r5`, `ROUNDTRIP-ADDENDUM.json`, `dmg-verify.log`); r5: `~/AgentDocs/proof/darkstr-0057-r5-20261009-101325/` (`selftest/live-final`, negative control `live-negctl-0056r3`, 0056 suite on this app `run-0056-on-0057r5.log`, `live-rfp-baseline`, `rfpcheck/`); r1–r4: `~/AgentDocs/proof/darkstr-0057-20261009-092626/` |

### Design

- **Arming.** DepthHooks arm on Pollution + native hooks + per-site rotation, with no global `darkstr.persona.seed`. The fixed seed and a locked snapshot stay the deterministic Proof path. The sharedData hint `darkstr:depthArmed` gates the sync pull, so off mode does no IPC.
- **Seeds.** One seed set per (container, site) per surface (canvas, audio, font, speech, WebGPU), derived from the 0056 store seed. Seeds are resolved for the requesting document's own WindowGlobalParent (`NP.documentDecision(wgp)`), not `bc.currentWindowGlobal`.
- **Early reads.** The child pulls synchronously (`DarkstrDepthHooks:GetSeedsSync`) at `DOMWindowCreated`, and also at `DOMDocElementInserted` for reused initial windows. An inline script's first read is already farbled.
- **No stacking.** There is one install per inner global (key: Xray `HTMLCanvasElement.prototype`), with waiver-safe identity checks and an own-wrapper guard.
- **Canvas.** Noise is keyed by the absolute surface pixel and applied to opaque pixels only. `getImageData` (full and sub-rect), `toDataURL`, `toBlob`, OffscreenCanvas `convertToBlob` and WebGL `readPixels` (with the GL row flip) all agree. The worker prelude mirrors it.
- **Audio.** Ratio farbling within the fudge. `getFloatFrequencyData` is offset by `20*log10(fudge)` dB. Silence stays silent.

### Live self-test (Mini, headless SWGL, sandbox-exec loopback only, own port 8357)

r5 app: `armed` 63/63, `off_mode` and `fixed_seed` PASS.
- **Same as the page:** early inline read, repeat reads, same-origin and same-site cross-origin frames, workers (OffscreenCanvas and fonts).
- **Alternate paths agree:** canvas and GL.
- **Single-layer seed replay:** canvas, GL, audio and fonts.
- **Stable:** across reload, and across restart for a kept site.
- **Differs:** across sites and across user contexts.
- **Off mode:** native, store untouched.

Negative control (0056r3 app): `armed` FAILs on every farbling check. The 0056 driver's 12 scenarios also PASS on the 0057 r5 app (`run-0056-on-0057r5.log`).

### 0057r2: darkstr's farbling is the only canvas noise under Pollution

ModeXor now also turns `privacy.baselineFingerprintingProtection` off under Pollution. It is a POLLUTION_PREF:
- saved on entry together with RFP, FPP, the WebGL prompt and the ETP flag;
- re-asserted when stomped;
- restored exactly on exit.

A saved copy left by an older build is backfilled for baseline only (RFP, FPP and the prompt are never backfilled), and off mode stays hands-off.

Live results (no `canvas` permission anywhere):
- **`armed`:** all checks PASS. Alternate canvas/GL paths disagree on **0 px** in total, against 4470 px on the r5 app (which also loses restart stability to per-session engine noise).
- **`xor_roundtrip`** (runtime `darkstr.mode`, three starts: stock, user baseline off, user RFP off):
  - under Pollution, RFP, FPP and baseline are false, and the saved copy has a baseline record;
  - alternate canvas paths agree (0 px);
  - on leave and after a restart, every owned pref and the ETP flag equal the start state exactly (`ROUNDTRIP-ADDENDUM.json`).
- **`off_mode`:** baseline keeps its stock value with no user value, nothing is saved, and DepthHooks are idle. Without the permission, Firefox's own baseline canvas noise is present (stock, hands-off). With the permission (`live-off-granted`), the canvas is native.

**Pre-existing (0053r2, same on r5):** right after leaving Pollution, `browser.contentblocking.category` stays `custom`. It returns to `strict` at the next start, when `ContentBlockingPrefs.init` re-matches it. Proposed fix (not done): re-run `matchCBCategory()` in ModeXor's idle restore pass, before re-restoring the ETP flag.

### 0057r3: OffscreenCanvas WebGL exports, WebGPU (Proof 0057r2 FAIL)

**1. OffscreenCanvas `convertToBlob` (page and worker prelude).**
- The wrapper now exports a noisy clone drawn from the canvas itself: a temporary 2D OffscreenCanvas, then `drawImage(this)`, native `getImageData`, the same absolute-pixel noise, and `putImageData`. This is the same as `noisyClone` for `HTMLCanvasElement`.
- WebGL and bitmaprenderer OffscreenCanvases now export what `readPixels` / `getImageData` report. r2 exported the real WebGL pixels, about 3020 px apart.
- No 2D context is forced onto a canvas that had none. r2 called `getContext("2d")` on the source.

**2. WebGPU: native objects, persona AdapterInfo.** One body (`WEBGPU_BODY`) is used byte-identically by the page and the worker prelude, and a test enforces this.
- **Features:**
  - `adapter.features` is the real `GPUSupportedFeatures`; `[...adapter.features]` works.
  - The seed-ranked feature drop from 0038 is gone.
  - An Intel persona (the one non-Apple persona on macOS) hides only the Apple-silicon-only formats (`texture-compression-astc`, `-astc-sliced-3d`, `-etc2`). It does this through a Proxy over the real object: `instanceof`, the prototype and `toStringTag` stay native; the setlike members read a real `Set` (Set iterators; `keys === values === @@iterator`).
  - `requestDevice` rejects a hidden feature, and nothing is ever added.
  - Device features are the native granted set. An Apple persona gets the native object untouched.
- **Limits:** the real adapter and device limits are passed through. The seeded ×[0.99, 1) fudge, which produced impossible values like 16334, is gone.
  - Every macOS persona is a Metal GPU behind the same wgpu limit tiers, so the host's limits are a coherent value for any of them.
  - On a non-Mac host the renderer list is OS-filtered too.
- **AdapterInfo:** unchanged; the per-site persona is coherent with WebGL UNMASKED.
- **Readback: WebGPU canvases stay unfarbled.** A canvas that gets a `webgpu` context is recorded by a `getContext` wrapper, installed only when `navigator.gpu` exists. Its `toDataURL` / `toBlob` / `convertToBlob` return native output, so the canvas exports, `copyTextureToBuffer` readback and compute results all agree. Why not farble:
  - consistent farbling of buffer readback is not feasible without corrupting compute results;
  - farbling only canvas-texture copies is still exposed by rendering the same scene into an ordinary texture and reading that back.
- **Caveat, inherent while WebGPU is enabled:** `drawImage(webgpuCanvas)` into a 2D canvas followed by `getImageData` is farbled by the 2D layer, like any image source. Likewise, `copyExternalImageToTexture` can read any image unfarbled. So 2D farbling vs WebGPU raw pixels can be told apart whenever WebGPU is exposed. LibreWolf ships `dom.webgpu.enabled=false`.

**Live (headless, own server on 127.0.0.1:8459, hosts ar3.test / br3.test, sandbox-exec loopback only, fresh profile per app):**
- Proof's ARMED prefs plus `dom.webgpu.enabled`; visits A1, A2, B1, then Native-Compatible NC-A1. Each visit probes:
  - the page's 2D / WebGL / OffscreenCanvas 2D + WebGL;
  - dedicated, shared and service workers (OffscreenCanvas 2D + WebGL);
  - PNG / JPEG / WebP exports and `toBlob` JPEG.
- **r3: 243/243.**
  - Every lossless export equals its own read (0 px): page, dedicated, shared and service workers, 2D and WebGL.
  - JPEG / WebP follow the farbled read (WebP quality 1 is lossless: 0.00 vs 1.52 to the known scene).
  - Worker reads == page reads, and worker UA / hardwareConcurrency == page, including shared and service workers.
  - A1 == A2 and A ≠ B; NC-A1 is fully native.
- **0057r2 negative control: 195/243.** All 48 FAILs are the OffscreenCanvas WebGL export:
  - native pixels, 757/768 px vs readPixels, in the page and all three worker kinds;
  - a 2D context forced onto context-less canvases.
- **Info:** a site's already-running service worker keeps the persona it started with when a later document of that site uses Native-Compatible, since NC is a per-document escape.
- **WebGPU headless:** `navigator.gpu` is present, but `requestAdapter()` returns null, so WebGPU is untestable headless. The probe page and the JS unit tests (fake GPU: features iterable, real limits, Intel hiding, requestDevice) cover it offline. **For Proof's headed run:**
  - `[...adapter.features]` (Apple persona == stock list; Intel persona == stock minus astc/etc2);
  - limits == stock;
  - WebGPU canvas `toDataURL` == `copyTextureToBuffer` readback;
  - compute readback exact.

### 0057r4: WebGL renderer strings as Gecko reports them (Proof #88 r3 item 5a)

**Proof FAIL (live by default, no WebGPU needed).** Under an Intel persona, `RENDERER` (masked) was the native `"Apple M1, or similar"` while `UNMASKED_RENDERER_WEBGL` was the raw persona string `"Intel(R) Iris(R) Plus Graphics"`. Real Firefox never reports an unmasked renderer without its sanitizer: no ", or similar" suffix, no bucket. It was present since the first depth pin (r1 and r2 data show it too).

**How Gecko 156 answers (dom/canvas/ClientWebGLContext.cpp, SanitizeRenderer.cpp), RFP / FPP / baseline FPP off as under Pollution:**
- `VENDOR` = "Mozilla".
- `RENDERER` = `SanitizeRenderer(raw GL_RENDERER)`.
- `UNMASKED_RENDERER_WEBGL` = `SanitizeRenderer(raw)` (`webgl.sanitize-unmasked-renderer`, default true).
- `UNMASKED_VENDOR_WEBGL` = the raw GL vendor (sanitized only under the RFP target).
- Without `WEBGL_debug_renderer_info`, the UNMASKED_* calls return null and raise INVALID_ENUM.

**Fix.**
- `geckoSanitizeRenderer` is a 1:1 port of SanitizeRenderer / ChooseDeviceReplacement. It is byte-identical in DarkstrDepthHooksChild and DarkstrWorkerHooksChild (and the 0058 re-ship), so the page and every worker kind agree.
- The page and worker `getParameter` hooks call the native getter first. A non-string (missing extension) or an RFP constant ("Mozilla...") passes through unchanged; otherwise the hook returns the persona's string as Gecko would:
  - RENDERER is always sanitized;
  - UNMASKED_RENDERER is sanitized while the pref is on;
  - UNMASKED_VENDOR is the persona's raw vendor;
  - VENDOR is never touched.
- WebGL1 and WebGL2 prototypes are both hooked, so OffscreenCanvas WebGL in the page and in dedicated / shared / service workers is covered.
- The page hook no longer stubs `WEBGL_debug_renderer_info`. The live self-test caught the old stub: page `getExtension` returned a plain `{UNMASKED_VENDOR_WEBGL, UNMASKED_RENDERER_WEBGL}` object, which is not a `WebGLDebugRendererInfo` (a tell of its own). It also never enabled the native extension, so with native-first the UNMASKED_* calls returned null + INVALID_ENUM in the page while workers answered. The extension is now advertised only when native has it, and `getExtension` returns the native object.

| Persona GPU (raw) | RENDERER = UNMASKED_RENDERER | UNMASKED_VENDOR |
|---|---|---|
| Apple M1 / Apple M2 | `Apple M1, or similar` | `Apple` |
| Intel(R) Iris(R) Plus Graphics (Gen11, 2020 13" MacBook Pro / Air) | `Intel(R) HD Graphics, or similar` | `Intel Inc.` |
| ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11) | `ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar` | `Google Inc. (Intel)` |
| ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 …) | `ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar` | `Google Inc. (NVIDIA)` |
| ANGLE (AMD, AMD Radeon RX 580 Direct3D11 …) | `ANGLE (AMD, Radeon R9 200 Series Direct3D11 vs_5_0 ps_5_0), or similar` | `Google Inc. (AMD)` |
| Mesa Intel(R) UHD Graphics 630 (CFL GT2) | `Intel(R) HD Graphics 400, or similar` | `Intel` |
| NVIDIA GeForce RTX 3060/PCIe/SSE2 | `NVIDIA GeForce GTX 980, or similar` | `NVIDIA Corporation` |
| AMD Radeon RX 580 (radeonsi, …) | `Radeon R9 200 Series, or similar` | `AMD` |

- The Windows pool used Chrome-style `ANGLE (…, OpenGL 4.5)` strings, which Gecko's sanitizer turns into "Generic Renderer". They are now the ANGLE Direct3D11 raw strings Firefox on Windows sees, with the same cap buckets.
- Tests: `tests/webgl-renderer-0057r4.test.mjs`. It covers the bucket table, every pool entry, pass-through of stock null / "Mozilla", the worker prelude for WebGL1 and WebGL2, the page hook order, and byte-identity across copies.

### 0057r4: private windows get darkstr's canvas noise only (Proof #92 / 0058r2 pbm finding)

**Proof finding.** In a new private window, canvas `toDataURL` / `toBlob` / `convertToBlob` differed from `getImageData` (220 px), and WebGL exports differed from `readPixels` (465 px). Normal windows were at 0 px. It was present since 0057r2.

**Cause.** Gecko 156 picks the protection mode per window: `nsRFPService::GetFingerprintingProtectionType(aIsPrivateMode)`.
- In a private window, `privacy.fingerprintingProtection.pbmode` (StaticPrefList default **true**; strict's `fppPrivate`) turns on FPP mode, and FPP's CanvasRandomization noises the export paths.
- `privacy.resistFingerprinting.pbmode` would do the same with RFP.
- Pollution set only the global RFP / FPP / baseline prefs.
- Self-test (`selftest-pbm`, same profile): private window 54 px on 2D exports and 230 px on GL exports in the page, OffscreenCanvas and dedicated / shared / service workers. With `privacy.fingerprintingProtection.pbmode=false` actually set at runtime: 0 px everywhere.
- Proof's `pbmoff` run recorded the pref as default `true` at runtime (no user value), so that control never took effect.

**Fix (DarkstrModeXor).**
- `privacy.fingerprintingProtection.pbmode` and `privacy.resistFingerprinting.pbmode` join POLLUTION_PREFS (both false). They are saved once on entry and restored exactly on exit, like RFP / FPP / baseline FPP.
- They are also in BACKFILL_PREFS: a profile already in Pollution under an older build records their current (user / stock) state before darkstr takes them over.
- Both prefs are observed, and stomps under Pollution are re-asserted.
- `xorSafe` requires both off.
- The 0057c category re-match covers them through POLLUTION_PREFS: strict's `fppPrivate` = pbmode true is put back on exit.
- Off mode never touches either pref.
- Tests: `tests/off-mode-hands-off-0053.test.mjs` (round trips with user values, stomps, backfill, off mode, xorSafe).

### Residual / for Proof

- **(Fixed in 0057r2, see above.) Engine canvas noise under Pollution = baseline FPP.** ModeXor sets RFP and FPP to false, but `privacy.baselineFingerprintingProtection` stays true (Firefox default). Its canvas randomization adds per-session engine noise on top of darkstr's layer, so `toDataURL`/`toBlob`/`convertToBlob` vs `getImageData` and GL sub-rect/`toDataURL` disagree (`engine_rfp`: 94/2944 URL pixels).
  - With `privacy.baselineFingerprintingProtection=false` and no canvas permission, every check passes (`engine_rfp_nobaseline`: 0/2944).
  - The self-test grants the `canvas` permission to its probe origins to isolate darkstr's layer.
  - **Proposed follow-up (not in this PR):** ModeXor also turns baseline FPP off under Pollution, with the same save/restore as RFP/FPP.
- **Headed real-GPU items (Proof):**
  - WebGL `readPixels` / `toDataURL` agreement and noise on a real GPU;
  - WebGPU (`dom.webgpu.enabled`; `navigator.gpu` is absent headless here);
  - GPU timing.
- **WebGPU is a user opt-in residual. darkstr never enables it.**
  - Gecko's built-in default for `dom.webgpu.enabled` is true on Windows and Apple-silicon macOS. LibreWolf's `librewolf.cfg` overrides it with `defaultPref("dom.webgpu.enabled", false)`, which ships unchanged in the DMG.
  - No darkstr code writes the pref:
    - ModeXor's `POLLUTION_PREFS` are only RFP, FPP, baseline FPP and the LibreWolf WebGL prompt.
    - The persona, depth, worker and seed-store modules write only `darkstr.*` diagnostics.
    - No apply script sets it.
  - It is on only when a user flips it, or when a test harness sets it (Proof's ARMED prefs; this PR's self-test).
  - While a user has it on, the WebGPU readback caveat above applies: WebGPU canvases, buffer readback and `copyExternalImageToTexture` are native and unfarbled, so they are a stable cross-site value.
  - Accepted as user opt-in, the same as any other default-off API a user enables.

## In review — 0056 persisted per-site persona seeds (Fable N6 follow-up)

| | |
|---|---|
| Pin | **0056**: per-site persona seeds survive restarts (they were per session), with Firefox's clearing semantics |
| Branch | `builder/0056-persona-seed-store` from `builder/0055-persona-ff156` @ `7ca58691` (stacked; needs 0052 + 0053 + 0053r2 + 0055 r2) |
| Patch | [`patches/0056-darkstr-persona-seed-store.patch`](../patches/0056-darkstr-persona-seed-store.patch) + `patches/0056-files/` (new `DarkstrPersonaSeedStore`; NativePersona, CookieFirewall, DepthHooks, WorkerHooks(+Child), `DarkstrNavigatorHooks.cpp`, toolkit `ClearDataService`, `browser/components/moz.build`; `SHA256SUMS`, `BASE_SHA256SUMS`) |
| Apply | `scripts/apply-0056-persona-seed-store-mini.sh` (C++ dom/base + chrome JS + toolkit JS; moz.build adds the module) |
| Tests | `tests/persona-seed-store-0056.test.mjs` (store, keep rule, cleaners, atomic write, OSKeyStore failure; mocked Gecko); the 0048–0052 tests load the 0056 copies |
| DMG | **0056r3:** `~/AgentDocs/builds/darkstr-0056r2-0cb9a326.dmg` (+ `.sha256`), sha256 `0cb9a32668e3aec6f604028070690739666c07e6c08503ee2b87ff9e331a39a6` (range-clear flush fix, v2 store). Before: `~/AgentDocs/builds/darkstr-0056-137c3b27.dmg`, sha256 `137c3b27ed3dd0238f8ec46c5a164ea57a900893553ef1d24088c058de20a925`: 0056r2 (startup hold). r1 was `darkstr-0056-72fa1796.dmg`. 0052 + 0053 + 0053r2 + 0055 r2 + 0056; omni files match `patches/0056-files` (and 0053r2 ModeXor, 0055 Ffi) |
| Evidence | `~/AgentDocs/proof/darkstr-0056-r2-20261009-090046/` (self-test `selftest/live-final`, negative control `selftest/live-negctl-0055`, `dmg-verify.log`, `stale-link-check.txt`); r2 (startup hold): `~/AgentDocs/proof/darkstr-0056-r3-20261009-091625/` (`selftest/live-final`, `live-hold`, negative control `live-hold-negctl-0056r2`); **r3:** `~/AgentDocs/proof/darkstr-0056-r4-20261009-100234/` (`selftest/live-final` + `live-final2`, negative control `live-negctl-0056r2`, `dmg-verify.log`) |

### Design

- **Store.** `<profile>/darkstr/persona-seeds.json` (dir 0700, file 0600). Only the
  parent process writes it: tmp file, chmod 0600, then rename (never written in
  place), debounced 500 ms after a new seed, and flushed at `profileBeforeChange`.
  Format v2 (0056r3) `{v: 2, l, k, e: [{c, h, s}]}`:
  - `c`: HMAC-SHA256(K, `"ctx:" + userContextId`) (`"0"` = no container);
  - `h`: HMAC-SHA256(K, `userContextId + "|" + eTLD+1`): per context, so the
    same site in two containers is not linkable from the file alone;
  - `s`: u32 seed.

  No timestamps. The store resolves `c` back to a container by recomputing it for
  known contexts (default, contexts seen this session, and 1..max(last
  `userContextId`, 32), capped at 4096), so container deletion still finds its
  entries. A v1 file (`c` plaintext, `h` = HMAC(K, eTLD+1), `t`) is migrated
  once: v1 seeds are adopted as each (context, site) is next used, and the first
  save writes v2 with the remaining v1 entries wiped.

  K is a random 32-byte key. On disk it exists only encrypted by an OSKeyStore
  (macOS Keychain) secret under a random per-store label (`l`, `k`). **No site
  name is ever written.**
- **Key store unavailable** (or `darkstr.persona.seedStore.osKeyStore=false`):
  session-only, nothing written, an existing file is left untouched. A missing
  secret makes the old entries unlinkable; the next save starts a new store.
- **Contexts.** One persona per (container, site). Private browsing gets its own,
  memory-only persona, dropped at `last-pb-context-exited`. Decisions carry
  `ctx`; the live-site, popup and windowless-worker rules match on (site, ctx).
  Shared and service workers get `userContextId` / `privateBrowsingId` from
  `DarkstrNavigatorHooks.cpp`.
- **Proof test seed.** `darkstr.persona.seed` bypasses the store: the deterministic
  pre-0056 mix (default context unchanged; other contexts mix `ctx` in). The
  store module is not even loaded. A locked snapshot / `rotatePerSite=false`
  works as before.
- **Off mode** never loads the store. It is activated only while per-site
  rotation runs without a fixed seed.
- **Clear-on-quit gap.** When cookies and site data are cleared on shutdown
  (`privacy.sanitize.sanitizeOnShutdown` + `clearOnShutdown_v2.cookiesAndStorage`,
  the LibreWolf default), only sites with a **persist-data-on-shutdown** ALLOW
  exception are written. Same rule as the Sanitizer, at site level. A cookie
  ACCESS_SESSION permission always wins. The rule is re-applied at load, which
  covers exceptions removed since and crashes before shutdown clearing. Without
  clear-on-shutdown every non-private site is kept.
- **DarkstrPersonaSeedCleaner** is registered in `ClearDataService` next to
  `FingerprintingProtectionStateCleaner` (flag
  `CLEAR_FINGERPRINTING_PROTECTION_STATE`, part of Forget-about-this-site, Clear
  recent history "cookies and site data", shutdown sanitize, and container
  removal via CLEAR_ALL):
  - **site / host / principal:** the eTLD+1 (so a subdomain host clears its
    site), scoped by the origin-attributes pattern;
  - **range (0056r3):** any time range resets **all** non-private seeds in all
    contexts (session, file and unmigrated v1). The key is kept;
  - **Clear-Site-Data** (`"cookies"`/`"storage"`) on a subdomain resets the
    whole eTLD+1, in the originating context only (accepted; seeds are per
    eTLD+1 and per context);
  - **origin attributes:** container deletion;
  - **all:** file and OSKeyStore secret deleted, so the next store gets a new
    key and label (key rotation).

  It flushes the in-memory copies (NativePersona seed / snapshot / worker-site
  caches, DepthHooks `lastSeeds`) with the same `(ctx, site)` predicate for every
  clear kind. 0056r3 fix: the range predicate took 3 arguments and the listener's
  throw was swallowed, so a range clear rewrote the file but left NativePersona's
  caches stale (Proof #87, `clear.json` step f). A listener error is now logged to
  the console and counted (`debugState().stats.flushErrors`, `lastFlushError`). Open documents keep their persona until they
  navigate (0051 per-document rule). A clear in off mode can remove entries from
  an existing file but never creates one, and it rewrites only when something
  matched.

### Live self-test (Mini, headless, sandbox-exec loopback only, own probe port 8356)

All scenarios PASS on the 0056 DMG app (`selftest/live-final`; r3 adds `startup_hold`):

- `keep_restart`: LibreWolf clear-on-shutdown on; A (persist-data-on-shutdown exception) keeps seed and page
  persona across a normal quit, B resets; file has only A, 0600 / dir 0700, entries `{c,h,s,t}` (r3: v2 `{c,h,s}`).
- `clear_one`: `deleteDataFromSite(A)` resets only A; `deleteDataFromHost(www.B)` resets only B; holds after restart.
- `contexts`: same site in a normal tab, container 1 and a private window -> three seeds; file has contexts
  `0` and `1` only; normal and container survive restart, private does not.
- `kill9`: after the debounced write, SIGKILL then restart: A kept, B reset, file intact (0600, no tmp left).
- `off_mode`: no `darkstr/` dir, store module never loaded; an existing store is byte- and mtime-identical.
- `fixed_seed`: `darkstr.persona.seed` gives the deterministic pre-0056 mix; store not loaded, nothing written.
- `clear_all_range`: last-hour range clear drops today's entries; clear-all removes the file and the Keychain
  secret; the next store uses a new label.
- `container_delete`: `ContextualIdentityService.remove` drops that container's entries only.
- `startup_hold` (0056r2): with the store load forced to take 1.2 s, a kept site's load is held and gets the
  stored persona (page and decision); a 300 ms cap against a 1.5 s load times out (counted) and the stored persona
  is back on the next load; started with the site URL on the command line, the first load has the stored persona.
- `ui_paths`: Forget About This Site resets only A; principal clear resets only B; Clear Recent History
  (cookies and site data, last hour) drops all of today's entries.

Every scenario greps darkstr files and prefs.js (excluding the harness's own user.js prefs) for the test
hostnames: none. Negative control (0055 DMG app, no store, same driver): keep_restart, clear_one, contexts and
kill9 all FAIL on the behaviour checks (seeds per session, clears are no-ops).

### 0056r3 live self-test (`darkstr-0056-r4-20261009-100234`, DMG `0cb9a326`)

All 10 scenarios plus two new ones PASS:
- 10 scenarios (`live-final`): `file_format_v2` (hashed `c`); `contexts` adds `same_site_unlinkable_across_contexts`; `clear_all_range` adds `range_resets_all` and `range_keeps_key`.
- `range_regression` (Proof #87 2f, `live-final2`): after a Clear Recent History range clear, NP's snapshot cache (`0|a`, `0|b`, `1|a`) is empty and `flushErrors` is 0. The next load of A, B and container-A shows a new persona that matches the new seed, with no restart. The new personas hold after a restart.
- `v1_migrate` (`live-final2`): a v1 file is adopted on use and rewritten as v2 with the same label. The unused v1 entry is wiped once.

Negative control on the 0056r2 app (`137c3b27`): `range_regression` FAILs, reproducing Proof's finding. The seeds change but the snapshot cache is not flushed, the visible persona stays stale, and the state is inconsistent after restart.

### 0056r4: a partitioned clear never resets a kept site's seed

**Bug (present since 0056, so it was in 0056r2, 0057r2 and 0057r3):** a site with a persist-data-on-shutdown exception got a new persona after a restart whenever it had been embedded cross-site.
- At shutdown, Firefox's sanitizer preserves A's first-party data, but it clears A's data **partitioned under every non-kept top-level site B**. That reaches the cleaner as `deleteByPrincipal(http://A^partitionKey=(http,B))`.
- `DarkstrPersonaSeedCleaner.deleteByPrincipal` ignored the partitionKey and cleared A's eTLD+1 seed. The kept entry was gone from disk (1 → 0, same key and label).
- Proof's 0056r2 keep_restart PASSed because no kept site was framed cross-site.

**Fix:** persona seeds are first-party state keyed by the top-level site, so partitioned principals and partition patterns are no-ops:
- `isPartitioned(oa|pattern)` covers a non-empty `partitionKey` or a `partitionKeyPattern` with any field set;
- it applies in `deleteByPrincipal`, `deleteBySite`, `deleteByHost` and `deleteByOriginAttributes`.

A's own first-party principal still clears A.

**Tests:** two regression tests. One fails on the unfixed store ("kept entry still on disk").

**Live** (`~/AgentDocs/proof/darkstr-keep-20261009-112434`): own server on 127.0.0.1:8461, hosts akp.test / bkp.test, sandbox-exec loopback only, one fresh profile per app and variant, Proof's COS_ON prefs and keep permission. Variants:
- `plain`: keep A, visit B, restart;
- `xframe`: B embeds an A iframe that writes localStorage.

Before the fix:
- `plain` PASSes on 0056r2, 0057r2 and 0057r3;
- `xframe` FAILs on all three, and so does a direct `deleteDataFromPrincipal` probe with A's partitioned principal.

### 0056r5: keep permission changes reach disk (Proof #93 latekeepnm)

**Proof finding (present since 0056r2).** If a site is marked keep (`persist-data-on-shutdown` ALLOW) after its seed was handed out, and the user quits with no other persona write, the persona re-rolls on the next launch. The keep rule is evaluated at save time, but `flush()` returned early unless a seed write had set `_dirty`. The same thing happened when keep was re-added after a clear-all, because CLEAR_ALL also drops the permission.

**Fix (DarkstrPersonaSeedStore).**
- While active (Pollution rotation), the store observes `perm-changed`. A change to a permission the keep rule reads (`persist-data-on-shutdown`, `cookie` for ACCESS_SESSION) marks the store dirty and schedules a save: added / changed / deleted, and `cleared` for all permissions. The profile-before-change blocker flushes it at quit.
- Additions write the newly kept seed; removals and session-cookie grants prune it.
- During the startup load, the change only marks the store dirty, and `_load()` schedules the save once ready.
- Unrelated permission types and passive (off-mode) stores never write.
- Tests: `tests/persona-seed-store-0056.test.mjs`, "0056r5" cases. They cover the late keep with no further write, the old-behaviour control, removal and clear-all pruning, re-add after clear-all, the session-cookie grant, unrelated types, the passive store and the wiring.

### Residual

- **Startup (0056r2).** While the store is still loading (file read + Keychain
  decrypt), a non-private top-level document load is held in
  `http-on-modify-request` (channel suspended before it connects) and decided
  once the store is ready, so a kept site gets its stored persona on its very
  first load. The hold is capped by `darkstr.persona.seedStore.startupWaitMs`
  (default 2000 ms, 0..10000; 0 = no hold). Only past that cap (e.g. a Keychain
  prompt left open) does that one load get a temporary seed; the stored seed wins
  for every later load. Private windows, the Proof test seed and off mode are
  never held.
- Range clears (0056r3) are coarse by design: any range resets every
  non-private persona, since seeds are not per-visit.
- Container resolution probes contexts up to 4096. An entry whose container
  cannot be resolved is still cleared by a range clear or clear-all, and is
  dropped at load under clear-on-shutdown when its site can't be matched.
- **Cross-build Keychain prompt (since 0056r1).** macOS ties the Keychain item to
  the code signature of the build that created it. These are ad-hoc-signed
  builds, so a different build opening the same profile triggers a Keychain
  access prompt; seen in r3 testing, when a 0056r2-created store was opened by
  the r3 app. Until the prompt is answered the store stays loading. The startup
  hold gives up after its cap, and that session uses temporary seeds. A stable
  Developer ID signature avoids this. **Proof: use a fresh profile per DMG.**
- The Keychain item is per profile (random label). Deleting the profile folder
  leaves it in the login keychain until a clear-all.

## In review — 0055 personas claim the engine's Firefox version (Fable N6 + O9; O12 r2)

| | |
|---|---|
| Pin | **0055**: Fable **N6** (decided by Alex: personas claim Firefox 156, the engine's own version), **O9** (seed fallback table: timezone, must match Rust), **O12 r2** (worker Intl locale == page Intl locale; see below) |
| Branch | `builder/0055-persona-ff156` from `builder/0053-off-mode-hands-off` @ `09062b32` (stacked; needs 0052 + 0053) |
| Patch | [`patches/0055-darkstr-persona-ff156.patch`](../patches/0055-darkstr-persona-ff156.patch) + `patches/0055-files/` (DarkstrNativePersona, DarkstrFfi, duppel-persona `lib.rs` / `build.rs` / `gecko-milestone.txt`, duppel-ffi `lib.rs` + `SHA256SUMS`) |
| Apply | `scripts/apply-0055-persona-ff156-mini.sh` (Rust gkrust + chrome JS → libxul relinks; restores the 0049 hooks C++ on a tree that has r1) |
| Tests | `tests/persona-ff156-0055.test.mjs`; `cargo test` (`n6_*`, goldens `fixtures/persona-goldens-0055.json`); 0049/0051 tests updated (persona UA == native UA on Mac is now expected) |
| DMG | `~/AgentDocs/builds/darkstr-0055-a89d3e83.dmg` (+ `.sha256`): respin = 0055 r2 + 0053r2. r1 was `darkstr-0055-859635f7.dmg` |
| Evidence | `~/AgentDocs/proof/darkstr-0055-persona-ff156-20261009-022132/` |

### Bug

- **N6.** Rust (`crates/duppel-persona/src/lib.rs:406-453`), the chrome seed fallback
  (`DarkstrNativePersona` 147-171) and the extension (`extension/lib/profiles.js`)
  hard-coded Firefox **139 / 140** UAs on a 156 engine. Every persona claimed a
  version the engine's features, headers and JS behaviour contradict.
- **O9.** The chrome fallback (used when the native library fails to load) had its
  own smaller tables, no timezone, and a different draw order. The same seed gave a
  different persona with and without the library.
- **O12 (as filed).** Persona workers got `navigator.languages` from the persona, but
  their JS locale (`Intl.*().resolvedOptions().locale`) stayed the app locale.

### Fix

- **One source of truth for the version: the engine.**
  - Rust: `build.rs` reads Gecko's `config/milestone.txt` (from `DARKSTR_MILESTONE_TXT`,
    then any ancestor `config/milestone.txt`, then `$DARKSTR_GECKO_ROOT`). Outside a
    Gecko tree (CI) it uses `crates/duppel-persona/gecko-milestone.txt` with a
    `cargo:warning`. It generates `firefox_ua!(os)`, and every UA table entry is
    `firefox_ua!("<OS token>")`. `Persona::app_version()` returns Firefox's
    `navigator.appVersion` ("5.0 (Macintosh)" / "5.0 (Windows)" / "5.0 (X11)"), and the
    FFI JSON carries it (`DarkstrFfi` passes it through).
  - Chrome: the version comes from `Services.appinfo.version` at runtime.
    - An FFI snapshot that claims any other version is not used; the engine-derived
      fallback is used instead.
    - An operator-locked `darkstr.persona.snapshot` keeps its OS token and fields, but
      its Firefox UA is rewritten to the engine version.
  - Tables: Windows `Windows NT 10.0; Win64; x64`; macOS `Macintosh; Intel Mac OS X 10.15`;
    Linux `X11; Linux x86_64` and `X11; Ubuntu; Linux x86_64`. The RNG draw order is
    unchanged, so a seed keeps its hardware / languages / timezone, and only the UA
    string changes (`fixtures/seed-goldens.json`: only `userAgent` moved, 140 → 156).
- **O9.** `generatePersonaFallback(seed, os)` is an exact port of `generate_persona`:
  the same tables (cores, memory, languages, **timezones**), the same mulberry32 draws
  (gpu / screen / colour depth consumed), and the same clamp. Rust writes and checks
  `fixtures/persona-goldens-0055.json`, and the JS test checks the same file.
- **O12 r2 (Proof review of #86).** r1 set `WorkerLoadInfo.mLanguageOverrideLocale =
  languages[0]`. That made an armed worker's Intl say `en-GB` while its page said `en-US`,
  a page/worker split that stock never shows. In stock Firefox, Intl in pages **and** workers
  uses the app locale, independent of Accept-Language and `navigator.languages`, so a
  `navigator.languages` vs Intl difference is normal. r2 drops the C++ change: 0055 ships
  no `DarkstrNavigatorHooks.cpp`, and the apply script puts a tree that has r1 back to the
  0049 copy. Workers keep the persona `navigator.languages` (0049). Intl locale and
  timezone agree between the page and every worker (self-test).

### Notes for Proof

- **On macOS a persona UA is now byte-identical to the native UA** (same OS token, same
  version). Persona differentiation on Mac comes from `hardwareConcurrency`,
  `navigator.languages` and timezone (plus depth seeds), not the UA. "UA != native" is
  no longer an "armed" signal; the 0049/0051 tests use a marked stub native UA for that.
- **Intl locale is the app locale everywhere** (pages and workers), as in stock. It does
  not follow the persona's `navigator.languages`; that is stock behaviour, not a split.
- The extension is **not bundled** (the app ships only uBlock through policies). It was
  updated anyway: UAs come from the real engine version, `appVersion` is per OS, and the
  bootstrap was regenerated with esbuild. Chromium UA groups are unchanged.
- Rust `mode_pref_effects` is untouched (0053).

## In review — 0053r2 ETP-interaction flag restored after Pollution (Proof follow-up to 0053)

| | |
|---|---|
| Pin | **0053r2**: after a Pollution round trip, `privacy.trackingprotection.allow_list.hasUserInteractedWithETPSettings=true` stayed set (Proof) |
| Where | Separate commit in the 0055 respin (PR #86); 0053 itself is merged (#85). The respin DMG carries 0053r2 + 0055 r2 |
| Patch | [`patches/0053r2-darkstr-etp-interaction.patch`](../patches/0053r2-darkstr-etp-interaction.patch) + `patches/0053r2-files/` (DarkstrModeXor + `SHA256SUMS`) |
| Apply | `scripts/apply-0053r2-etp-interaction-mini.sh` (after 0053; chrome JS only; independent of 0055) |
| Tests | `tests/off-mode-hands-off-0053.test.mjs` (loads the newest ModeXor; stock CB-category / allow-list observers simulated) |

**Cause.** Stock Gecko's `UrlClassifierExceptionListService` sets the flag on **any**
`browser.contentblocking.category` change. Under Pollution, FPP=false makes
`ContentBlockingPrefs.matchCBCategory` flip the category (strict → custom on entry),
so the flag is set as a side effect. The flip can't be avoided: the category
follows FPP. The observers only exist after the service's `lazyInit` (first
classified page load), so a run that never loads a page doesn't reproduce it.

**Fix.** On entry, ModeXor saves the flag's pre-Pollution state (user value or none)
in `darkstr.xor.savedPrefs` along with RFP / FPP / `librewolf.webgl.prompt`.
darkstr never *sets* the flag. On leaving, it restores the flag after RFP/FPP are
back (the stock flip-back has already run, because pref observers are synchronous),
and once more on idle in case of a late category re-match. Off mode still writes
nothing. A state saved by 0053 before r2 has no record of the flag; the flag is
then left alone rather than guessed. A real user interaction *during* Pollution is
also undone on exit (indistinguishable from the stock side effect).

**Live (sandboxed, port 8299, after a page load).** 0053 DMG `924c6036`: flag
false → true (Pollution) → true after off → true after restart (bug reproduced).
Respin `a89d3e83`: false → true → **false** → **false** (default, no user value,
not in prefs.js). Evidence `~/AgentDocs/proof/darkstr-0055-persona-ff156-20261009-022132/selftest/live-etp-negctl-0053`, `live-r2-etp`.

**Residual (not changed here, same on 0053).** After leaving Pollution,
`browser.contentblocking.category` stays `custom` for the rest of the session. The
next startup's `matchCBCategory` puts it back to `strict`. Restoring the category
from ModeXor would re-trigger the stock observer (the flag restore would have to
follow it again) and re-apply the category's pref set. Proposed as a small
follow-up if Proof wants in-session parity.

## In review — 0053 off mode leaves prefs alone (Fable QA B5)

| | |
|---|---|
| Pin | **0053**: Fable QA **B5** (Homogeneous / off mode rewrote RFP, FPP and WebGL prefs on every start) |
| Branch | `builder/0053-off-mode-hands-off` from `builder/0052-no-diag-prefs` @ `0ba3eb03` (stacked; needs 0052) |
| Patch | [`patches/0053-darkstr-off-mode-hands-off.patch`](../patches/0053-darkstr-off-mode-hands-off.patch) + `patches/0053-files/` (DarkstrModeXor, DarkstrNativePersona, librewolf.cfg + `SHA256SUMS`) |
| Apply | `scripts/apply-0053-off-mode-hands-off-mini.sh` (chrome JS + librewolf.cfg; no C++ recompile) |
| Tests | `tests/off-mode-hands-off-0053.test.mjs` (Gecko-like pref store: defaults vs user values); the 0048–0052 tests load the newest shipped copy (0053 → 0052 → older) |
| DMG | `~/AgentDocs/builds/darkstr-0053-924c6036.dmg` (+ `.sha256`) |
| Evidence | `~/AgentDocs/proof/darkstr-0053-offmode-20261009-020144/` |

### Bug

DarkstrModeXor ran on every startup and mode change in **both** modes. In
Homogeneous it set `privacy.resistFingerprinting` / `privacy.fingerprintingProtection`
back to "stock", which overwrote a user's own `RFP=false`. In every mode it forced WebGL on:
`webgl.force-enabled=true`, `gfx.blocklist.all=-1`, `webgl.forbid-*=false`,
`librewolf.webgl.prompt=false`, plus `unlockPref`. `librewolf.cfg:959-974`
(`darkstr-0029-webgl`) did the same for every profile. Off mode wrote
`darkstr.pollutionActive=false` too.

### Fix

- **Homogeneous writes nothing.** ModeXor's observer ignores RFP/FPP/CB-category
  changes in off mode (unchanged), and the mode apply no longer sets anything.
  NativePersona writes `darkstr.pollutionActive` only while Pollution is active.
  Off mode clears an old value of it and never writes `false`.
- **Pollution saves, then restores exactly.** On entry ModeXor saves the state of
  `privacy.resistFingerprinting`, `privacy.fingerprintingProtection` and
  `librewolf.webgl.prompt` (user value or "no user value") in
  `darkstr.xor.savedPrefs` (JSON). It then sets them to `false`. The save survives
  restarts in Pollution. On leaving, each pref is restored to its saved user value
  or its user value is cleared, and the saved copy is removed.
- **WebGL only under Pollution, through the LibreWolf prompt gate only.** No
  `webgl.force-enabled`, no `gfx.blocklist.all`, no `forbid-*`, no lock/unlock.
  The GPU blocklist applies. The `darkstr-0029-webgl` block is removed from
  `librewolf.cfg`. Off mode keeps LibreWolf's stock "WebGL is currently disabled"
  prompt behaviour.
- **One-time migration** for profiles a pre-0053 build ran. They are detected by a
  `darkstr.webgl.lastStatus` value without the 0053 `v53;` tag, or by the
  `webgl.forbid-software=false` user value that every 0029–0052 start wrote. The
  migration only clears the old forced WebGL values (and only where they equal the
  forced value). In Pollution with no saved copy, it assumes stock. It then sets
  `darkstr.xor.migrated0053=true` so it never runs again. A fresh profile never
  gets the marker. Limitation: a user's own `webgl.forbid-software=false` on a
  profile with no marker is cleared once.

### Not changed

- The Rust `duppel_persona::mode_pref_effects` still describes Homogeneous as
  "RFP true / FPP true". That is the planning model; the chrome path is what runs.
- Stock LibreWolf still writes its own `privacy.*` user values in a fresh profile.
  These come from the CB "strict" category (`privacy.trackingprotection.*`,
  `query_stripping.*`, `fingerprintingProtection`, `annotate_channels.strict_list`,
  consentmanager), from bounce-tracking migration, GPC, `history.custom` and
  `sanitize.pending`. No darkstr module names any of them except ModeXor's FPP,
  which it writes under Pollution only.
- Under Pollution, Gecko's CB `matchCBCategory` switches
  `browser.contentblocking.category` to `custom`. It returns to `strict` once FPP
  is restored (seen after the next start).

## In review — 0052 no debug state in prefs.js (Fable QA B1)

| | |
|---|---|
| Pin | **0052**: Fable QA **B1** (diagnostics in prefs.js), **O7**, **O13** (stale 0051 NativePersona copy), plus the DepthHooks last-site fallback |
| Branch | `builder/0052-no-diag-prefs` from `main` @ `5faad83` |
| Patch | [`patches/0052-darkstr-no-diag-prefs.patch`](../patches/0052-darkstr-no-diag-prefs.patch) + `patches/0052-files/` (7 modules + `SHA256SUMS`) |
| Apply | `scripts/apply-0052-no-diag-prefs-mini.sh` (chrome JS only; no C++ recompile) |
| Tests | `tests/no-diag-prefs-0052.test.mjs`; the 0048 / 0049 / 0050 / 0051 tests now load the 0052 copies where they exist |
| DMG | `~/AgentDocs/builds/darkstr-0052-9bc120b1.dmg` (+ `.sha256`) |
| Evidence | `~/AgentDocs/proof/darkstr-0052-nodiag-20261009-013950/` |

### Bug

Every chrome module mirrored its last decision into user prefs:
`darkstr.cookieFirewall.lastCookieOut` / `lastCookieSet` (cookie values),
`lastEtld` / `lastPartition` / `persona.lastEtld` / `persona.lastDecision`
(the last site visited), `persona.effectiveSeed` / `cookieFirewall.lastSeed`
(that site's seed), and more. They were all saved in prefs.js, kept across
restarts, and readable by anything that can read the profile. Fable's S6 run
left `lastCookieOut "qa_srv=1; qa_js=S6-b1"` and `lastEtld "lvh.me"` in prefs.js.

### Fix

- Each of DarkstrCookieFirewall, DarkstrNativePersona, DarkstrDepthHooks,
  DarkstrWorkerHooks, DarkstrChaffScheduler, DarkstrModeXor and DarkstrFfi has
  the same small `diagPrefs` facade. A diagnostic write lands in an in-memory
  map and reaches prefs only while **`darkstr.debug.diagPrefs`** is `true`
  (default `false`; nothing sets it). Values can be read with
  `X.getDiagnostics()` from chrome. Write sites routed: CF 17, NP 10, DH 6,
  WH 5, Chaff 4, ModeXor 4, Ffi 2.
- `DarkstrModeXor` exports `DARKSTR_DIAG_PREFS` (38 names) and
  `sweepDiagPrefs()`. It runs once in `init()` (BrowserGlue starts ModeXor
  before any other darkstr module) and again whenever `darkstr.debug.diagPrefs`
  is switched off. It clears the user values that older builds left behind.
- No product code read any of these prefs back, except DepthHooks' fallbacks.
  Those fallbacks are removed:
  - When the rotate path cannot resolve a frame's own site/seed, it no longer
    falls back to `persona.lastEtld` / `persona.effectiveSeed` (another site's
    seed). It returns no depth seeds.
  - When NativePersona is unavailable, it no longer reads the global
    `persona.docShellPhase`. It fails closed (`null`).
- `patches/0051-files/DarkstrNativePersona.sys.mjs` is deleted (O13). It
  predated 0049 and is not what ships. The live NativePersona source is
  0049-files → 0052-files. `apply-0051` no longer maps it, but it keeps its
  BASE_SUMS and grep checks.

### Kept on purpose (functional, not diagnostics)

`darkstr.pollutionActive` (content-process / C++ gate),
`darkstr.persona.saved*` (exact restore when leaving Pollution),
`darkstr.cookieFirewall.contentGate` (default branch only) and the
user-facing config prefs.

### Not changed

- C++: `DarkstrNavigatorHooks::TryGet*` still read `persona.ua|platform|
  hardwareConcurrency|docShellPhase` and `docshell.strictNextNavArmed`, but
  have had no callers since 0051 (Navigator.cpp) / 0049 (workers use
  `PersonaForWorker`). `DarkstrDocShellHooks` writes `strictNextNavArmed`
  from content processes only (no-op). 0052 stays chrome-JS only; removing
  the dead C++ belongs in a later pin.
- The UA still reports Firefox 140 personas (N6 → 0055); seeds stay
  session-only (→ 0056).

### Self-test (sandbox-exec loopback-only, app from the DMG)

Fable's S6 (Pollution + hooks + cookie firewall `isolate`, a.localtest.me /
b.lvh.me) behaves the same as before (same Cookie headers, same armed /
native split). After the run, prefs.js has **0** matches for
`lastCookie|lastEtld|lastDecision|effectiveSeed|lastPartition`. The same
holds when starting from a prefs.js seeded with Fable's 34 stale diagnostic
lines. With `darkstr.debug.diagPrefs=true` the 9 lines come back (positive
control, `lastCookieOut "qa_srv=1; qa_js=S6-b1"` as in Fable's run).

## In review — 0048 cookie firewall correctness

| | |
|---|---|
| Pin | **0048** (Rowan QA B1, B2, N1 + omit, 3P partitioning, mirror staleness) |
| Branch | `builder/0048-cookie-firewall` (from main `58a33c2`) |
| Patch | [`patches/0048-darkstr-cookie-firewall-correctness.patch`](../patches/0048-darkstr-cookie-firewall-correctness.patch) |
| Apply SoT | [`patches/0048-files/`](../patches/0048-files/) (3 modules + `SHA256SUMS`) |
| Mini helper | [`scripts/apply-0048-cookie-firewall-mini.sh`](../scripts/apply-0048-cookie-firewall-mini.sh) |
| Tests | [`tests/cookie-firewall-0048.test.mjs`](../tests/cookie-firewall-0048.test.mjs) |
| Defaults | unchanged — firewall opt-in, hooks default-off |
| Evidence | `~/AgentDocs/proof/darkstr-0048-cookiefw-20261008/` |
| Proof (v1 `f3f1e748`) | **FAILED** — F1 fetch Set-Cookie ordering, F2 A-B-A / no-cors top-cookie leak, F3 native setter/getter + `CookieStore.prototype.set` reach the real jar; check 4 changed to match stock (`~/AgentDocs/proof/darkstr-0048-xor-20261008-174506/`) |
| Respin (0048r2) | JS: ack-ordered deltas + channel suspend (F1), Gecko TCP partition key with foreign-ancestor bit + initiator-context SameSite (F2), reject unpartitioned 3P (check 4). C++: `darkstr.cookieFirewall.contentGate` gate in `CookieCommons` / `CookieStoreNotifier` (F3). See [`COOKIE-SANDBOX-FAKE-JAR.md`](COOKIE-SANDBOX-FAKE-JAR.md#0048r2-respin). Evidence `~/AgentDocs/proof/darkstr-0048r2-cookiefw-20261008/` |
| Merge | only after Proof PASS |

## In review — 0051 persona surface (stacked on 0048)

| | |
|---|---|
| Pin | **0051** (Rowan QA N2, N3, N4, N5) |
| Branch | `builder/0051-persona-surface` — **stacked on `builder/0048-cookie-firewall` @ `a9481cd`** (PR #79); targets `main` |
| Patch | [`patches/0051-darkstr-persona-surface.patch`](../patches/0051-darkstr-persona-surface.patch) |
| Apply SoT | [`patches/0051-files/`](../patches/0051-files/) (4 modules + `Navigator.cpp` + `DarkstrNsHttpHooks.{cpp,h}` + `SHA256SUMS`) |
| Mini helper | [`scripts/apply-0051-persona-surface-mini.sh`](../scripts/apply-0051-persona-surface-mini.sh) (needs 0048 applied; C++ → libxul relink) |
| Tests | [`tests/persona-surface-0051.test.mjs`](../tests/persona-surface-0051.test.mjs) + prototype-level cookie shape in [`tests/cookie-firewall-0048.test.mjs`](../tests/cookie-firewall-0048.test.mjs) |
| Defaults | unchanged — hooks default-off, firewall opt-in, strictFirstDoc on |
| Evidence | `~/AgentDocs/proof/darkstr-0051-persona-20261008/` |
| Proof (`ea7f9d1a`) | **FAILED** F1: a script-opened popup (`window.open('about:blank')`, same-origin URL popup) from an armed page got the native identity (navigator + HTTP). Evidence `~/AgentDocs/proof/darkstr-0051-xor-20261008-191731/` |
| Respin (0051r2) | Top-level contexts opened from a page, while still on their first counted document: with an opener → the opener document's decision (same-site docs verbatim; cross-site docs keep the opener's armed bit with their own site persona); noopener (`crossGroupOpener`) → the site's live armed decision (0049 shared-worker rule). URL bar / bookmarks / GUI new tab keep strictFirstDoc. Evidence `~/AgentDocs/proof/darkstr-0051r2-persona-20261008/` |
| Merge | after #79, and only after Proof PASS |

### What changed

- **N2 — per-tab / per-document phase.** One decision per document
  (WindowGlobalParent): `{armed, top-level site, snapshot}`. The phase is the
  tab's own count of top-level http(s) documents (BrowserId; redirects and
  internal redirects not counted). Frames and every request a document makes
  use its top-level document's decision. The global
  `darkstr.persona.docShellPhase` / `darkstr.docshell.strictNextNavArmed`
  prefs are diagnostics only; `DarkstrNsHttpHooks::UserAgentOverride` now
  returns null and the window `Navigator.cpp` global-pref hooks are removed.
- **N3 — Accept-Language.** Set per request next to User-Agent from the same
  snapshot as that document's `navigator.languages`, in Gecko's own format
  (port of `rust_prepare_accept_languages`). A page-set value is kept.
  `intl.accept_languages` and `darkstr.persona.languages` are no longer
  written; a value saved by an older build is restored once.
- **N4 — Firefox-only, native-shaped surface.** No `deviceMemory`, no
  `userAgentData`. userAgent / platform / hardwareConcurrency / language /
  languages are replaced on `Navigator.prototype` (not own properties) with
  getters whose name / length / toString / attributes / foreign-receiver
  errors match native; `navigator.languages` is one frozen array per document.
  Installed synchronously before page script (sync IPC keyed by
  innerWindowId); native decision restores the original accessors. The 0048
  `document.cookie` hook moved to `Document.prototype` and the Cookie Store
  methods to `CookieStore.prototype` (native names and lengths 0/0/1/1).
- **N5 — explicit lock only.** The seed path never writes
  `darkstr.persona.snapshot`. Locks are a pasted `darkstr.persona.snapshot`
  (persistent) or `darkstr.persona.rotatePerSite=false` (reversible). A
  profile that an older build already self-locked keeps that pasted-looking
  snapshot: clear `darkstr.persona.snapshot` to resume rotation.

### Not in 0051

- Persona version numbers (139/140 vs 156) and seed persistence — **N6**, open for Alex.
- Worker persona path — done in 0049 (section below): worker `deviceMemory`
  spoof, worker HW mirror, Shared/Service-worker requests.
- Chaff — done in 0050 (section above).

## In review — 0050 chaff rearm (stacked on 0049)

| | |
|---|---|
| Pin | 0050 — Rowan **B6**: the chaff scheduler cancelled every batch it scheduled |
| Branch | `builder/0050-chaff-rearm` (on `builder/0049-worker-coherence` / #81) |
| Merge order | #79 → #80 → #81 → this PR, each after Proof PASS |
| Patch | [`../patches/0050-darkstr-chaff-rearm.patch`](../patches/0050-darkstr-chaff-rearm.patch) + `patches/0050-files/` |
| Apply | `scripts/apply-0050-chaff-rearm-mini.sh` (chrome JS only; no C++ recompile) |
| Tests | `tests/chaff-rearm-0050.test.mjs` |

### Bug

`_onIntervalFire` → `_scheduleBatch` (batch nsITimers) → `_armIntervalTimer`
→ `_cancelAll`, which cancelled the interval timer **and** the batch it had
just scheduled. The scheduler reported armed but no beacon ever fired (Rowan's
SIM: 0 fetches vs 1/2/10 in the positive control; live: `_batchTimers` empty
right after the interval fire).

### Fix

- `_cancelAll` is split into `_cancelIntervalTimer` + `_cancelBatchTimers`.
- `_armIntervalTimer` (the re-arm) replaces **only** the interval timer;
  pending batch timers survive and fire on their stagger.
- `_cancelAll` (interval + every pending batch) still runs when chaff is
  disabled (mode / `nativeCompatible` / `nativePersonaHooks`), when the gate or
  `darkstr.chaosLevel` prefs change (`refreshPlan`, same as before 0050), when
  an interval fires while disarmed, and on `uninit` (shutdown).
- A fired one-shot batch timer removes itself from `_batchTimers`, so the
  pending list does not grow across intervals; a callback for a timer no
  longer in the list is a no-op.
- Unchanged: defaults (homogeneous, hooks off → idle), schedules
  (interval/batch/stagger per level), endpoints, payloads, request options.

### Known gaps

- A level/gate pref change while a batch is pending drops that batch (as
  before 0050; the new plan starts a fresh interval).
- Chaff remains opt-in (Pollution + `nativePersonaHooks`); live verification
  used a local logging proxy that refuses every request — no beacon reached
  the real endpoints during testing.

## In review — 0049 worker coherence (stacked on 0051)

| | |
|---|---|
| Pin | **0049** (Rowan QA B3, B4, B5 + no-seed arming, blob: location, relative importScripts, wrapped constructor) |
| Branch | `builder/0049-worker-coherence` — **stacked on `builder/0051-persona-surface` @ `7d5bfac`** (PR #80, itself on #79); targets `main` |
| Patch | [`patches/0049-darkstr-worker-coherence.patch`](../patches/0049-darkstr-worker-coherence.patch) |
| Apply SoT | [`patches/0049-files/`](../patches/0049-files/) (4 modules + `DarkstrNavigatorHooks.{cpp,h}` + `WorkerNavigator.cpp` + `WorkerPrivate.cpp` + `ScriptLoader.cpp` (0049r2) + `SHA256SUMS`) |
| Mini helper | [`scripts/apply-0049-worker-coherence-mini.sh`](../scripts/apply-0049-worker-coherence-mini.sh) (needs 0051 applied; C++ → libxul relink) |
| Tests | [`tests/worker-coherence-0049.test.mjs`](../tests/worker-coherence-0049.test.mjs) |
| Defaults | unchanged — hooks default-off (C++ never calls chrome then), strictFirstDoc on |
| Evidence | `~/AgentDocs/proof/darkstr-0049-workers-20261008/` |
| Merge | after #79 and #80, and only after Proof PASS |
| Proof (#81 @ `5bc541e`, DMG `baae735f`) | **FAILED** — F1: about:blank popup's dedicated worker (`new w.Worker()` from the opener) had a native navigator / script load but its importScripts / fetch / sync XHR went out with the opener site's persona (rv:140, persona Accept-Language). Evidence `~/AgentDocs/proof/darkstr-0049-xor-20261008-193806/` |
| Respin (0049r2) | Merged 0051r2 (popup inherits the opener decision), then: every request a dedicated (or nested) worker makes resolves through `loadInfo.associatedBrowsingContext` → that window's `documentDecision` — the same document `ResolveWorkerPersona` used for the worker's navigator/timezone and its script load (innerWindowID). Previously those requests had no window/BC and fell into the windowless site rule ("any live armed doc of the site"), so a worker of a native document (popup, or a first document next to an armed same-site tab) sent armed headers. Shared/Service workers (no associated BC) keep the site rule. Gecko leaves one dedicated-worker request unlabelled — a nested worker's main script (`ChannelGetterRunnable`) — so `dom/workers/ScriptLoader.cpp` now copies the parent worker's `AssociatedBrowsingContextID` onto it, only while `DarkstrNavigatorHooks::PollutionNativeHooksActive()` (default: stock; C++ → libxul relink). Evidence `~/AgentDocs/proof/darkstr-0049r2-workers-20261008/` |

### Approach — native, no script wrapping

- **One persona per top-level worker, resolved natively.**
  `WorkerPrivate::Constructor` calls
  `DarkstrNavigatorHooks::ResolveWorkerPersona` before the WorkerPrivate is
  built. Only when the content-side gate prefs are on, it notifies
  `darkstr-worker-persona-resolve` with a property bag (kind, script URL,
  creating innerWindowId, principal origin, partitionKey). The
  `DarkstrWorkerPersona` JSProcessActor child answers with a sync message to
  `DarkstrWorkerHooks` (parent):
  - **Dedicated** (has a window): the creating document's 0051
    `documentDecision` — the exact decision its page navigator got (frames →
    top-level document; first document of a tab → native).
  - **Shared / Service** (no window): the owning site's decision
    (`DarkstrNativePersona.workerSiteDecision`, top-level site of the
    partition): armed when a live top-level document of that site is armed,
    sticky per site for the current plan; native when the site only has a
    native first document; no live document → armed unless strictFirstDoc.
  - **Nested** workers share their parent worker's persona.
- **WorkerNavigator** serves userAgent / platform / hardwareConcurrency from
  the per-worker entry (no global `darkstr.persona.*` mirror read any more);
  languages and timezone ride the stock `WorkerLoadInfo`
  (`mLanguageOverride`, `mTimezoneOverride`), so `navigator.languages`,
  `language` and `Intl` timezone match the page. No `deviceMemory`.
- **No wrapping.** The Phase 3 JSWindowActor that replaced
  `window.Worker` / `window.SharedWorker` with blob `importScripts` /
  `import()` wrappers is retired, with its Firefox 135 UA list (incl.
  "Mac OS X 14.0"), its own seed generator and the worker `deviceMemory`
  spoof. Module SharedWorkers (B4), SharedWorker sharing (B5), the real
  `self.location`, relative `importScripts` and the native
  `Worker` / `SharedWorker` constructors all come back unchanged.
- **Depth (0043) kept.** The OffscreenCanvas / WebGL / WebGPU prelude,
  seeded from `DarkstrDepthHooks.depthSeedsForBrowsingContext` of the owning
  document, is evaluated by C++ in the worker global right before the main
  script (`CompileScriptRunnable`). It never touches navigator.
- **Arming:** whenever page hooks are on (pollution && !nativeCompatible &&
  nativePersonaHooks); no seed pref needed.
- **Headers:** dedicated-worker requests already use their document's
  decision (0051). Requests without a browsing context (Shared/Service worker
  scripts and fetches) now use the same owning-site decision as the worker's
  navigator (`_windowlessDecisionForChannel`). Content principals only.

### Known gaps (documented, not fixed)

- A worker's persona is fixed when it starts. A Shared/Service worker started
  while its site only had a native first document keeps a native navigator,
  while its later requests carry the site persona once the site is armed;
  a SharedWorker started by an armed page and later joined by another tab's
  native first document reports the persona to that page. Plan or rotation
  changes apply to new workers only.
- A service worker woken with no live document of its site (push, sync,
  periodic fetch) is native under strictFirstDoc.
- 0049r2: a dedicated worker's requests follow the creating window's
  *current* document; a worker still running while its window navigates
  away (before it is frozen/terminated) would use the new document's
  decision.
- The windowless path trusts the principal / partitionKey the content
  process reports (persona strings only; same trust as 0051's install IPC).
- The 0043 depth prelude is still page-visible JS (toString shows source),
  as before; Depth itself still needs a seed or snapshot to arm.
- Worklets: not claimed (no navigator persona fields).

### Not in 0049

- Persona version numbers (139/140 vs 156) and seed persistence — **N6**, open for Alex.
- Chaff — done in 0050 (section above).

## Completed — 0042 Cookie `/echo` QI soft residual

| Item | Status |
|------|--------|
| Pin | **0042** (soft residual after 0035) |
| PR | [#73](https://github.com/alex-hinojosa/darkstr/pull/73) **MERGED** as `cda3c914b388de1e89c3be48ea29340efcbdae16` |
| Tip at Proof | `beb44f8fc032764834d8f40ccab7f7d27e27ace5` |
| Branch | `builder/phase5-cookie-echo-qi-0042` |
| Patch | [`patches/0042-darkstr-cookie-echo-qi.patch`](../patches/0042-darkstr-cookie-echo-qi.patch) |
| Apply SoT | [`patches/0042-files/DarkstrCookieFirewall.sys.mjs`](../patches/0042-files/DarkstrCookieFirewall.sys.mjs) |
| Mini helper | [`scripts/apply-0042-cookie-echo-qi-mini.sh`](../scripts/apply-0042-cookie-echo-qi-mini.sh) / [`PHASE-5-COOKIE-0042-MINI-APPLY.sh`](PHASE-5-COOKIE-0042-MINI-APPLY.sh) |
| Extends | **0035** Cookie firewall HTTP outbound path |
| Mini apply | **OK** 2026-09-28 ~08:00 CDT (SoT + mach build browser/components; moz-src symlink live) |
| Proof | **PASS** |
| Evidence | `~/AgentDocs/proof/darkstr-pr73-0042-xor-20260928-080445/` + [PR comment](https://github.com/alex-hinojosa/darkstr/pull/73#issuecomment-5870487975) |

### Root cause (plain)

0035 registered parent `http-on-modify-request` and called `channel.setRequestHeader("Cookie", …)` on the observer **subject without** `QueryInterface(Ci.nsIHttpChannel)`. Failures were swallowed by an empty `catch`. Sandbox jar + `document.cookie` were correct; outbound content-fetch Cookie stayed empty (primary jar empty after Set-Cookie strip). NativePersona already QIs the same topic.

### Fix

1. `subject.QueryInterface(Ci.nsIHttpChannel)` before header mutation (match NativePersona).
2. Surface QI / `setRequestHeader` failures on `darkstr.cookieFirewall.lastCookieErr`.
3. Soft diag: `lastHttpTopic` / `lastHttpEtld` / `lastCookieOut` / `lastCookieSet` for Proof XOR.

Default-off / arm gate / synthetic seed path unchanged. Not anti-detect.

### Proof soft gates — PASS

1. Hooks-off / `enabled=false` → real cookies idle (0035 regression) — **PASS**
2. Armed: after `/set` ingest, `fetch('/echo', {credentials:'include'})` Cookie header = sandbox synthetic `net_probe=8ad45765c6b3be31` (not empty; not `NETWORK_REAL`) — **PASS**
3. `lastCookieOut` matches `lastCookieSet`; `lastCookieErr` empty on success — **PASS**
4. Script + jar still coherent with 0035 gates 2–5 — **PASS**

### Proof result — PASS

All four 0042 Cookie `/echo` QI XOR gates passed on Proof tip `beb44f8fc032764834d8f40ccab7f7d27e27ace5` (2026-09-28 ~08:07 CDT). Soft residual from 0035 (empty outbound `/echo` Cookie) **closed**.

**Remaining soft residuals (not FAIL; no new eng pins from this close):**

- ~~**0043** WebGPU Worker/SharedWorker (0038 OOS)~~ → **0043 CLOSED** / Proof PASS / MERGED `2672848` (PR [#74](https://github.com/alex-hinojosa/darkstr/pull/74))
- Speech 0037: SpeechRecognition pref-off; empty voices before async populate
- WebGPU AdapterInfo.device empty (do not invent)
- WebGPU ServiceWorker OOS (register ≠ Worker blob)
- FFI dylib not in DMG `package-manifest.in` (**moot** A-only after 0041)
- Soft historical `libduppel_ffi.dylib` inert
- DOM font width fudge ≤0.1% (0036 accepted)
- `document.fonts.ready` host Promise (0039 by design)
- Native privacy-pane UI (PM)

### Out of scope (this pin)

- Speculative necko C++ / dual-jar CookieService
- Speech / WebGPU soft residuals
- Native privacy-pane UI (PM)
- New eng depth pins

## Apply status (Mini) — 0042 — 2026-09-28 ~08:00 CDT (Proof PASS) / merge ~08:08 CDT

- Tree: LibreWolf **156.0.1-1** (`$DARKSTR_GECKO_ROOT`)
- SoT markers: `QueryInterface(Ci.nsIHttpChannel)` + `lastCookieOut` / `lastCookieSet` / `lastCookieErr` present
- `./mach build --allow-subdirectory-build browser/components` — **OK**
- moz-src symlink SHA match (`ba078a2a…` CookieFirewall parent)
- PR [#73](https://github.com/alex-hinojosa/darkstr/pull/73) **MERGED** as `cda3c914b388de1e89c3be48ea29340efcbdae16`; Proof XOR **PASS** on tip `beb44f8fc032764834d8f40ccab7f7d27e27ace5`
- Evidence: `~/AgentDocs/proof/darkstr-pr73-0042-xor-20260928-080445/`
- Local verify + Proof: `echo.cookie_header = "net_probe=8ad45765c6b3be31"`; `lastCookieOut` == `lastCookieSet`; `lastCookieErr` empty

## Completed — 0040 Approach A FFI (gkrust → libxul)

| Item | Status |
|------|--------|
| Pin | **0040** (M-FFI Approach A) |
| PR | [#71](https://github.com/alex-hinojosa/darkstr/pull/71) **MERGED** as `f828a78d255aa3fad61c062ffd44912cd7e0b5c9` |
| Tip at Proof | `73e7e4fcb5e7d630e4e20b71f3165ea63b3426f9` |
| Branch | `builder/m-ffi-approach-a-libxul` |
| Patch | [`patches/0040-darkstr-ffi-gkrust-libxul.patch`](../patches/0040-darkstr-ffi-gkrust-libxul.patch) |
| Status docs | [`M-FFI-0040-STATUS.md`](M-FFI-0040-STATUS.md) / [`M-FFI-STATUS.md`](M-FFI-STATUS.md) |
| Mini apply | **OK** — `./mach build --allow-subdirectory-build toolkit/library` EXIT 0 (~846s); `nm -gU XUL` → 3× `darkstr_ffi_*` |
| Proof | **PASS** |
| Evidence | `~/AgentDocs/proof/darkstr-pr71-0040-xor-20260928-074243/` + [PR comment](https://github.com/alex-hinojosa/darkstr/pull/71#issuecomment-5870086745) |

**Prefer A then B** was the #71 merge state; superseded by **0041** (**A-only** / B runtime load retired — PR [#72](https://github.com/alex-hinojosa/darkstr/pull/72) MERGED `f961d39`). `nativePersonaHooks` remains **default-off**.

## Completed — 0041 Retire Approach B (cdylib/ctypes runtime load)

| Item | Status |
|------|--------|
| Pin | **0041** (M-FFI Retire B) |
| PR | [#72](https://github.com/alex-hinojosa/darkstr/pull/72) **MERGED** as `f961d3941a13a142ef5b8561cbc3134673b9cc23` |
| Tip at Proof | `b6f100583c27044d6fb26a86021bf700921de791` |
| Branch | `builder/m-ffi-retire-approach-b-0041` |
| Patch | [`patches/0041-darkstr-ffi-retire-approach-b.patch`](../patches/0041-darkstr-ffi-retire-approach-b.patch) |
| Status docs | [`M-FFI-0041-STATUS.md`](M-FFI-0041-STATUS.md) / [`M-FFI-STATUS.md`](M-FFI-STATUS.md) |
| Mini apply | **OK** — chrome-only `browser/components` EXIT 0 (~7s); no XUL relink |
| Proof | **PASS** |
| Evidence | `~/AgentDocs/proof/darkstr-pr72-0041-xor-20260928-075315/` + [PR comment](https://github.com/alex-hinojosa/darkstr/pull/72#issuecomment-5870246843) |

**A-only** on main after merge. B cdylib/ctypes runtime load **retired**. Soft historical `libduppel_ffi.dylib` may remain inert on disk. `nativePersonaHooks` remains **default-off**. Crate `cdylib` kept for unit tests; PHASE-4 install gated.

## Completed — 0039 FontFaceSet enumeration coherence

| Item | Status |
|------|--------|
| Pin | **0039** |
| PR | [#70](https://github.com/alex-hinojosa/darkstr/pull/70) **MERGED** as `5f8e8ceb2cf3f00b10734a56e726dc61a952b130` |
| Tip at Proof | `4810eb6a2deea687e8ee406dcf7606da65e7edfe` |
| Branch | `builder/phase5-fonts-enum-0039` |
| Patch | [`patches/0039-darkstr-fonts-enum-coherence.patch`](../patches/0039-darkstr-fonts-enum-coherence.patch) |
| Apply SoT | [`patches/0039-files/DarkstrDepthHooksChild.sys.mjs`](../patches/0039-files/DarkstrDepthHooksChild.sys.mjs) |
| Mini helper | [`scripts/apply-0039-fonts-enum-coherence-mini.sh`](../scripts/apply-0039-fonts-enum-coherence-mini.sh) / [`PHASE-5-FONTS-0039-MINI-APPLY.sh`](PHASE-5-FONTS-0039-MINI-APPLY.sh) |
| Mini apply | **OK** 2026-09-28 ~07:09 CDT (markers + mach build browser/components + moz-src symlinks) |
| Proof | **PASS** |
| Evidence | `~/AgentDocs/proof/darkstr-pr70-0039-xor-20260928-071747/` + [PR comment](https://github.com/alex-hinojosa/darkstr/pull/70#issuecomment-5869690371) |
| Extends | **0036** `shouldHideFamily` / `fontSeed` (no new seed) |

### Design summary

Same arm gate and `fontSeed` as 0036. Page-compartment wraps on `FontFaceSet.prototype`:

1. **`values` / `keys` / `@@iterator`** — yield only faces whose `family` passes `shouldHideFamily` (baseline passthrough; non-baseline seed-tied keep/drop).
2. **`entries` / `forEach`** — same filter; `forEach` callback sees kept faces only.
3. **`size`** — count of kept faces (coherent with iteration).
4. **`load()`** — filter resolved `FontFace[]` with the same predicate.
5. **`ready`** — **not wrapped** (host load-completion Promise; not a font list). Soft residual closed for enumeration only.

Homogeneous / hooks-off: idle. No Chrome-only font lists. Double-read stable (constant per `fontSeed` + host set).

### Proof gates (for Proof ACK — do not ping from Builder)

1. Hooks-off / Homogeneous → idle (host FontFaceSet enumeration)
2. Pollution+hooks: enumeration digests coherent with `document.fonts.check` hide set; double-read stable
3. Different eTLD+1 with rotatePerSite → digests / fontSeed diverge
4. Same eTLD two tabs → same digests/seed
5. Golden lock seed-42 coherent; no Chrome-only font names; `document.fonts.ready` still a Promise

### Proof result — PASS

All five FontFaceSet-enumeration XOR gates passed on Proof tip `4810eb6a2deea687e8ee406dcf7606da65e7edfe` (2026-09-28 ~07:17 CDT).

**Soft residuals (not FAIL):**

- `document.fonts.ready` remains the host load-completion Promise (**not wrapped** by design).
- DOM width fudge ≤0.1% (0036 accepted).
- Remaining soft list (not this pin): ~~Cookie 0035 `/echo` Cookie empty (**0042**)~~ → **0042 CLOSED**; ~~WebGPU 0038 Worker OOS (**0043**)~~ → **0043 CLOSED** / Proof PASS / MERGED `2672848`; Speech 0037 pref-off / empty voices before async; WebGPU AdapterInfo.device empty / ServiceWorker OOS; FFI dylib not in DMG `package-manifest.in` (**moot** A-only); soft historical `libduppel_ffi.dylib` inert; Approach A **0040** + B retire **0041** Proof-green/MERGED; Native privacy-pane UI (PM).

### Out of scope (this pin)

- ~~Cookie `/echo` header empty → **0042**~~ → **0042 CLOSED** / Proof PASS (PR #73)
- FFI package-manifest / DMG packaging
- `document.fonts.ready` Promise wrapping / inventing faces
- gfx-level font whitelist
- Speech / WebGPU soft residuals


## Apply status (Mini) — 0039 — 2026-09-28 ~07:09 CDT (Proof PASS) / merge ~07:19 CDT

- Tree: LibreWolf **156.0.1-1** (`$DARKSTR_GECKO_ROOT`)
- Markers already present (Builder applied source edits); patch skip OK
- `./mach build --allow-subdirectory-build browser/components` — **OK** (~7s)
- `make install-dist_bin` — Kept existing; moz-src symlinks refreshed
- Symlinks: `dist/LibreWolf.app/.../moz-src/browser/components/DarkstrDepthHooksChild.sys.mjs` → source (`Soft residual (0039)` / `keptFromThis` / `makeFaceIterator` present; SHA match)
- PR [#70](https://github.com/alex-hinojosa/darkstr/pull/70) **MERGED** as `5f8e8ceb2cf3f00b10734a56e726dc61a952b130`; Proof XOR **PASS** on tip `4810eb6a2deea687e8ee406dcf7606da65e7edfe`
- Evidence: `~/AgentDocs/proof/darkstr-pr70-0039-xor-20260928-071747/`
- Apply log: `~/src/darkstr-gecko/darkstr-apply-0039-20260928-070940.log`
- Disk free after apply: ~21 Gi (Data volume)

## Ship note — Mini package DMG (2026-09-29 ~00:37 CDT) — Soft residual **0039–0043**

Honest packaging evidence only — **no new eng depth pins**. Soft residuals **0039–0043** are **in this DMG** (prior 2026-09-28 ship was pre-0039 only).

| Field | Value |
|------|--------|
| Command | `make -C obj-aarch64-apple-darwin25.6.0 package` (mach body; host Darwin **27.0.0** would default a missing `obj-…-darwin27.0.0` — pinned existing 25.6.0 objdir) |
| Exit / artifact | **0** → `obj-aarch64-apple-darwin25.6.0/dist/librewolf-156.0.1.en-US.mac.dmg` (**99440846** bytes ~95 MiB) |
| Absolute path | `/Users/alexander/src/darkstr-gecko/librewolf-source/librewolf-156.0.1-1/obj-aarch64-apple-darwin25.6.0/dist/librewolf-156.0.1.en-US.mac.dmg` |
| SHA-256 | `e3290e38c23848388a1da542700e1a2d4ca6facd18b9a67c72bf5123936236f4` |
| DMG mtime | **2026-09-29 00:37:31 CDT** |
| Sourcestamp | buildid `20260928084500`; mozilla-release `6f2c158dfc7e9693f880fad2510ceb51a158c069` |
| darkstr tip | `0b95bbfdf2ed82f98f773a3d655732d75f4eb834` (PR [#74](https://github.com/alex-hinojosa/darkstr/pull/74) merge `2672848`) |
| Disk | ~54 Gi free — no reclaim; objdir kept |
| Softs in DMG | **0039** FontFaceSet · **0040** Approach A · **0041** retire B · **0042** Cookie `/echo` QI · **0043** Worker WebGPU — all markers PASS in packaged `omni.ja` (SHA match tree) |
| FFI in DMG | **Absent** B dylib — **moot** after **0041** A-only |
| Light smoke | Builder checklist PASS on mounted DMG `omni.ja`; evidence `~/AgentDocs/proof/darkstr-ship-156-dmg-20260929-003745/`. Optional: parent may ping Proof for package-path smoke — Builder does **not** ping Proof. |
| Log | `~/src/darkstr-gecko/mach-package-156-20260929-003658.log` |

Pin detail: [`MINI-PACKAGE-PIN.md`](MINI-PACKAGE-PIN.md). Supersedes 2026-09-28 DMG `d400de8b…` (0038-only ship).

## Ship note — Mini `./mach package` DMG (2026-09-28 ~06:59 CDT) — superseded (pre-0039)

Honest packaging evidence only — **no new eng depth pins**.

| Field | Value |
|------|--------|
| Command | `./mach package` from `$DARKSTR_GECKO_ROOT` (LibreWolf **156.0.1-1**) |
| Exit / artifact | **0** → `obj-aarch64-apple-darwin25.6.0/dist/librewolf-156.0.1.en-US.mac.dmg` (~95 MiB) |
| SHA-256 | `d400de8bf4271312f123b1adfbd8fef2bdabbc3c867f57ea11bf861096dab32b` |
| darkstr tip | `ff89e8287509e21049399504bfdf2b85e54e33a0` |
| Disk | ~19 Gi → reclaim ~2.8 Gi safe caches/old stage → ~21 Gi; after package still ~21 Gi |
| Hooks in DMG | Soft residual **0038** (`webgpuSeed` / plainAdapterInfo) inside `omni.ja` `DarkstrDepthHooksChild.sys.mjs` (SHA match source); XUL `darkstr.mode` / `nativePersonaHooks` present |
| FFI in DMG | **Absent** B dylib — **moot** after **0041** A-only (XUL carries Approach A symbols). Soft: historical `libduppel_ffi.dylib` may sit inert in DEV dist/bin; chrome does not load. |
| Light smoke | DEV app Pollution+hooks-on skim launch OK (~07:00 CDT); no crash. Not full Proof XOR. |

Pin detail: [`MINI-PACKAGE-PIN.md`](MINI-PACKAGE-PIN.md). Builder may offer Proof a package-path XOR when ready; do not invent packaging-manifest eng from this note.

What is **not** eng-owned next (do not invent pins):

- **Native privacy-pane UI** — PM-owned
- **Approach A FFI (0040)** — **Proof-green on main** (PR #71); A-only after **0041**; hooks default-off — see [`M-FFI-0040-STATUS.md`](M-FFI-0040-STATUS.md)
- **Approach B load-path retirement (0041)** — **CLOSED** / Proof **PASS** / MERGED `f961d39` (PR [#72](https://github.com/alex-hinojosa/darkstr/pull/72)) — see [`M-FFI-0041-STATUS.md`](M-FFI-0041-STATUS.md)

No new eng pins from this 0041 close.

## Completed — 0035 Cookie firewall MVP

| Item | Status |
|------|--------|
| Pin | **0035** |
| PR | [#66](https://github.com/alex-hinojosa/darkstr/pull/66) **MERGED** as `79f2e59c6a8bdbd2f3891fc649011698a639c351` |
| Tip at Proof | `d35c5fd8fdec6fba20cf1c08c1f270b8f550ecf3` |
| Proof | **PASS** |
| Evidence | `~/AgentDocs/proof/pr66-0035-cookie-firewall-xor-20260924-134154/` |
| Branch | `builder/phase5-cookie-firewall-0035` |
| Patch | [`patches/0035-darkstr-cookie-firewall.patch`](../patches/0035-darkstr-cookie-firewall.patch) |
| Mini helper | [`scripts/apply-0035-cookie-firewall-mini.sh`](../scripts/apply-0035-cookie-firewall-mini.sh) |
| Design one-pager | [`COOKIE-SANDBOX-FAKE-JAR.md`](COOKIE-SANDBOX-FAKE-JAR.md) (updated) |

### Design summary (how policy is shared)

Single chrome SoT: `DarkstrCookieFirewall.sys.mjs` owns:

1. **Arm gate (default-off):**  
   `pollution && !nativeCompatible && nativePersonaHooks && darkstr.cookieFirewall.enabled`
2. **Decision:** allowlisted eTLD+1 → **passthrough** (real jar); else **sandbox**.
3. **Mode:** `synthetic` (default) seed-tied rewrite via 0030 eTLD seed / golden lock; `isolate` stores values as-is in sandbox only.
4. **One jar:** in-memory, in parent. 0035: `Map<etld, Map<name,value>>`; **0048:** partitioned by (OA, top-level site) with full cookie records (see [`COOKIE-SANDBOX-FAKE-JAR.md`](COOKIE-SANDBOX-FAKE-JAR.md#0048-correctness)).
5. **HTTP path:** `http-on-modify-request` replaces `Cookie`; `http-on-examine-response` (+cached) ingests `Set-Cookie` then strips header (best-effort vs CookieService race).
6. **Script path:** JSWindowActor child installs `document.cookie` + `cookieStore` wrappers; all writes IPC to parent jar; child mirror keeps getter sync while using the **same** seed/synthetic function.

No HTTP/JS split-brain by construction: both paths call the same ingest/decision helpers.

### Prefs

| Pref | Default | Role |
|------|---------|------|
| `darkstr.cookieFirewall.enabled` | **false** | Explicit arm (still requires Pollution+hooks) |
| `darkstr.cookieFirewall.mode` | `synthetic` | `synthetic` \| `isolate` |
| `darkstr.cookieFirewall.allowlist` | `""` | CSV eTLD+1 → real jar |
| `darkstr.cookieFirewall.armed` | diag | Effective arm mirror |
| `darkstr.cookieFirewall.lastEtld` / `lastSeed` / `lastDecision` / `lastInstall` | diag | Proof XOR |

### Proof gates (for Proof ACK — do not ping from Builder)

1. Hooks-off / `enabled=false` → real cookies unchanged (idle)
2. Armed Pollution+hooks: `document.cookie` and Cookie Store honor same policy as network Cookie/Set-Cookie for a test eTLD
3. Two eTLD+1 → isolated / different synthetic (when `rotatePerSite`)
4. Same eTLD two tabs → same policy/seed behavior
5. Golden lock seed-42 path still coherent

### Proof result — PASS

Evidence: `~/AgentDocs/proof/pr66-0035-cookie-firewall-xor-20260924-134154/`

All five cookie-firewall XOR gates passed on Proof tip `d35c5fd8fdec6fba20cf1c08c1f270b8f550ecf3`.

**Soft observation (historical):** the outbound `/echo` Cookie request header was empty (not
`NETWORK_REAL`). The sandbox jar and script surfaces held the synthetic
`net_probe`; this was a soft note only and did not change the 0035 PASS verdict.
**Follow-up:** pin **0042** (QI + surface set errors) — **CLOSED** / Proof **PASS** / MERGED `cda3c91` (PR [#73](https://github.com/alex-hinojosa/darkstr/pull/73)).

### Out of scope (this pin) — 0035

- fonts / speech / WebGPU (fonts → **0036**)
- Native-Compatible privacy-pane UI (PM)
- Approach A FFI
- Full browser UI / dual-jar C++ CookieService

### Residual risks

- **CookieService race:** stock jar may still accept Set-Cookie before chrome strip on some channels; follow-up C++ hook if Proof sees jar bleed.
- ~~Child `document.cookie` getter is sync via local mirror; HTTP→script visibility updates on pageshow/DOMWindowCreated hydrate~~ — Rowan QA showed the mirror went stale and was installed once per tab; **0048** replaces it with a per-document install + parent-pushed deltas.
- Not anti-detect / not Cloudflare bypass.

## Apply status (Mini)

## Apply status (Mini) — 2026-09-24 ~13:38 CDT

- Tree: LibreWolf **156.0.1-1** (`$DARKSTR_GECKO_ROOT`)
- Patch markers present; `lw/librewolf.cfg` 0035 defaults appended (`enabled=false`)
- `./mach build --allow-subdirectory-build browser/components` — **OK** (~17s)
- `make install-dist_bin` — Added/updated 3 CookieFirewall modules
- Symlinks: `dist/LibreWolf.app/.../moz-src/browser/components/DarkstrCookieFirewall*.sys.mjs` → source
- PR #66 **MERGED** as `79f2e59c6a8bdbd2f3891fc649011698a639c351`; Proof XOR **PASS** on tip `d35c5fd8fdec6fba20cf1c08c1f270b8f550ecf3`.


## 0057b: OS-derived navigator fields follow the persona's OS (queue item c)

Naming: this snapshot-platform fix is **0057b**. Pin number 0058 is reserved for the first-page policy (Fable B4).
The files keep the names they shipped under and are not renamed: `patches/0058-files/`, `patches/0058-darkstr-snapshot-platform.patch`,
`scripts/apply-0058-snapshot-platform-mini.sh`, `tests/snapshot-platform-0058.test.mjs` and the DMG `darkstr-0058-63669a43.dmg` are all 0057b.

Proof's 0055r2 note: a pasted Win32 lock (`locked42`, no `appVersion`) reported `navigator.platform` Win32 but
`appVersion` "5.0 (Macintosh)" (taken from the host). Seeded personas are host-OS since 0055, so this only affects pasted locks.

- `platformFieldsFor(snapshot)` (NativePersona) returns the values Gecko itself reports on the snapshot's OS. The OS comes
  from the UA OS token first, then from the platform.
  - platform: Win32 / MacIntel / the Linux oscpu string;
  - appVersion: "5.0 (Windows)" / "5.0 (Macintosh)" / "5.0 (X11)";
  - oscpu: from the UA token.
  - A locked snapshot is completed in `_readSnapshot` (diagnostic `darkstr.persona.lastSnapshotCompleted`; the pref itself is not touched).
  - `_childSnapshot` and `workerPersonaFields` carry appVersion and oscpu.
- NativePersonaChild hooks `appVersion` and `oscpu` the same way as `platform`. Workers get appVersion through the resolve bag →
  `DarkstrWorkerPersona::mAppVersion` → `WorkerNavigator::GetAppVersion`, checked before RFP and the override, like GetPlatform (C++).
- Live on darkstr-0058-63669a43.dmg (= 0057b; loopback only, own port 8358; each profile opened by one build only):
  - `pasted_win32`: **33/33** checks. Page, iframe, dedicated worker, shared worker and HTTP all report Windows (UA, platform Win32,
    appVersion "5.0 (Windows)", oscpu "Windows NT 10.0; Win64; x64"), on load 1 and load 2.
  - `seeded_host` (Mac values) 16/16; `off_mode` hands-off 5/5.
  - Negative control on the 0057r2 app: 12 failures, appVersion "5.0 (Macintosh)" and a Mac oscpu, which reproduces Proof's note.
  - 0057 regression on the 0057b app: armed PASS (alt-path mismatch 0 px, no canvas permission), fixed_seed PASS, off_mode with the permission granted PASS.
- Evidence: `~/AgentDocs/proof/darkstr-0058-20261009-103755/`.
