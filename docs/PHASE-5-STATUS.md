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

## Ship note — Mini `./mach package` DMG (2026-09-28 ~06:59 CDT)

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
4. **One jar:** in-memory `Map<etld, Map<name,value>>` in parent.
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
- Child `document.cookie` getter is sync via local mirror; HTTP→script visibility updates on pageshow/DOMWindowCreated hydrate (same-turn write→read coherent).
- Not anti-detect / not Cloudflare bypass.

## Apply status (Mini)

## Apply status (Mini) — 2026-09-24 ~13:38 CDT

- Tree: LibreWolf **156.0.1-1** (`$DARKSTR_GECKO_ROOT`)
- Patch markers present; `lw/librewolf.cfg` 0035 defaults appended (`enabled=false`)
- `./mach build --allow-subdirectory-build browser/components` — **OK** (~17s)
- `make install-dist_bin` — Added/updated 3 CookieFirewall modules
- Symlinks: `dist/LibreWolf.app/.../moz-src/browser/components/DarkstrCookieFirewall*.sys.mjs` → source
- PR #66 **MERGED** as `79f2e59c6a8bdbd2f3891fc649011698a639c351`; Proof XOR **PASS** on tip `d35c5fd8fdec6fba20cf1c08c1f270b8f550ecf3`.

