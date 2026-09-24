# Phase 4 status — LibreWolf / Firefox **156.0.1-1** train

**Date:** 2026-09-23 (CDT)  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.  
**Status:** **Train cutover READY.** Proof XOR **PASS** 2026-09-23 (exit checklist seed-42). Mini SoT app is 156.0.1-1.

**Prior train:** Phase 3 eng gate CLOSED on **155.0.1-1** (main tip through `0029` / PR #54; exit checklist in [`PHASE-3-STATUS.md`](PHASE-3-STATUS.md)).

## Goal

Re-pin the darkstr native Firefox-persona surface (`patches/0002`–`0029` + apply helpers) onto LibreWolf **156.0.1-1** (Mozilla `FIREFOX_156_0_1_RELEASE` context), Proof-XOR the Phase 3 exit checklist on the new train, then close packaging on 156.

## Product train

| Item | Value |
|------|-------|
| LibreWolf | **156.0.1-1** (source tag `156.0.1-1`) |
| Upstream Firefox | **156.0.1** |
| Mini gecko root (target) | `$DARKSTR_GECKO_ROOT` → `…/librewolf-source/librewolf-156.0.1-1` |
| Mini gecko root (prior) | `$DARKSTR_GECKO_ROOT_155` → `…/librewolf-source/librewolf-155.0.1-1` |
| Keep 155 tree | Yes until 156 Proof PASS + Mini dist cutover |

## Kickoff checklist

- [x] LibreWolf source repo checked out at tag `156.0.1-1`
- [x] `make fetch` + `make dir` → `librewolf-156.0.1-1` present (155 tree retained)
- [x] Point `DARKSTR_GECKO_ROOT.env` at 156 for port work (`DARKSTR_GECKO_ROOT_155` keeps 155; do not delete 155)
- [x] Dry-run / sequential apply of `patches/0002`–`0029` on 156; log fails (matrix below)
- [x] Port / refresh broken hunks (DocShell / Navigator / ModeXor / NativePersona / Ffi) — **in-place surgical refresh of 0009/0022/0027/0028/0029** (no blanket 0030+)
- [ ] Mini subdirectory builds + install-dist_bin as needed (**no full `mach build` yet** — disk ~43 Gi)
- [x] Proof: Phase 3 exit checklist on 156 seed-42 — **PASS** (`proof-xor/pr-phase4-156-20260923-111540.md`)
- [ ] Optional: fresh `mach package` DMG when disk allows
- [x] Cutover docs: PHASE-3 remains historical; this file is SoT for 156 (this PR)

## Mini seat notes (2026-09-23 CDT)

- Env file: `~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env` exports `DARKSTR_GECKO_ROOT` → 156 and `DARKSTR_GECKO_ROOT_155` → 155.
- Script `--dry-run` only prints actions; real triage used per-patch `patch -p1 --dry-run --forward --batch`, then **sequential apply-on-clean-OK** so dependents see landed darkstr files.
- Independent dry-run on a virgin 156 tree understates cascade (`No file to patch` for anything that edits `Darkstr*.sys.mjs` before those files exist). Sequential matrix below is SoT.
- 155 tree was **not** modified. Successful 156 applies landed ModeXor / NativePersona / nsHttp / Navigator / DocShell / FFI / languages / chaff / depth / workers / 0020 / 0023–0026 on the 156 tree only.
- No full `mach build` / package this pass.

## Sequential dry-run / apply matrix (156.0.1-1)

Method: for each patch in apply order, `patch -p1 --dry-run --forward --batch`; if dry-run exit 0 → apply for real; else record FAIL (or SKIP when content already present / previously-applied).

| Patch | Result | Hunk / notes |
|-------|--------|--------------|
| 0002-darkstr-mode-xor-rfp | **OK** | applied; ModeXor + BrowserGlue + moz.build (offsets OK) |
| 0003-darkstr-native-persona-hooks | **OK** | applied; after 0002 context |
| 0005-darkstr-cpp-native-hooks | **OK** | applied; nsHttpHandler + DarkstrNsHttpHooks |
| 0006-darkstr-cpp-navigator-docshell | **OK** | applied; Navigator.cpp + nsDocShell.cpp stock hunks clean |
| 0007-darkstr-cpp-docshell-nav-sot | **OK** | applied |
| 0008-darkstr-gecko-ffi-link | **OK** | applied |
| 0009-darkstr-ffi-ctypes-softfail-fix | **FAIL** | Hunk #4 failed on `DarkstrFfi.sys.mjs` (EOF/newline); earlier hunks would land `defineESModuleGetters` / retry — **not applied** |
| 0010-darkstr-nav-languages-pageshow | **OK** | applied |
| 0011-darkstr-nav-languages-cache-invalidate | **OK** | applied; `nsGlobalWindowInner.cpp` |
| 0012-darkstr-nav-languages-force-notify | **OK** | applied |
| 0013-darkstr-nav-languages-bc-override | **OK** | applied |
| 0014-darkstr-nav-languages-intl-accept | **OK** | applied |
| 0015-darkstr-nav-languages-saved-accept-und | **OK** | applied |
| 0016-darkstr-chaff-native-scheduler | **OK** | applied |
| 0017-darkstr-depth-canvas-webgl-audio | **OK** | applied (body already includes `installAudioInPage`) |
| 0018-darkstr-worker-globals-coherence | **OK** | applied |
| 0019-darkstr-phase3-soft-residuals | **SKIP** | previously applied / content already in refreshed 0017–0018; treat as OK-content |
| 0020-darkstr-docshell-strict-next-nav | **OK** | applied; includes http(s)-only count surface |
| 0021-darkstr-docshell-http-scheme-count | **SKIP** | previously applied / folded into 0020 body; treat as OK-content |
| 0022-darkstr-docshell-browserid-phase | **FAIL** | `nsDocShell.cpp` hunk #1 fails — patch hunk is corrupt (`@@ -1,10` + `placeholder` vs real `LoadURI` ~L723 still on `mBrowsingContext->Id()`). Chrome `_resetNavPhaseMirror` **not** landed |
| 0023-darkstr-depth-webgl-caps-offscreencanvas | **OK** | applied |
| 0024-darkstr-chaff-richer-beacon-bodies | **OK** | applied |
| 0025-darkstr-fp-coherence-p0 | **OK** | applied |
| 0026-darkstr-fp-hw-waivexrays | **OK** | applied |
| 0027-darkstr-fp-hw-cpp-content-gates | **FAIL** | malformed patch @ L51 (`PollutionNativeHooksActive`) against post-0020 `DarkstrNavigatorHooks.cpp`; Apple + GNU patch both reject. `darkstr.pollutionActive` / WorkerNavigator `0027` **not** landed |
| 0028-darkstr-fp-coherence-p1-tz-webrtc | **FAIL** | Hunk #2 failed on `DarkstrNativePersona.sys.mjs` (@350); Parent hunks would be OK. P1 timezone / WebRTC kill **not** landed |
| 0029-darkstr-webgl-context-enable | **FAIL** | malformed patch @ L73 (`MODE_PREF`) against landed ModeXor; `_ensureWebGlContextPrefs` **not** landed |

### Counts

| Bucket | Count | IDs |
|--------|------:|-----|
| OK (applied) | **20** | 0002–0008, 0010–0018, 0020, 0023–0026 |
| SKIP (already / folded) | **2** | 0019, 0021 |
| FAIL (needs port) | **5** | **0009, 0022, 0027, 0028, 0029** |
| Total | **27** | (no 0004) |

Effective content coverage if SKIP counts as OK-content: **22 / 27**. Hard port queue: **5**.

## Top 5 blockers (port queue)

1. **0022 DocShell BrowserId** — corrupt `nsDocShell.cpp` hunk (`placeholder` / wrong `@@`); call site still `Id()` not `BrowserId()`. First stock C++ port target on 156.
2. **0027 FP HW C++ content gates** — patch malformed vs post-0020 NavigatorHooks; needs rewrite against current `DarkstrNavigatorHooks.cpp` + `WorkerNavigator.cpp`.
3. **0029 WebGL context enable (ModeXor)** — malformed vs landed ModeXor; re-pin `_ensureWebGlContextPrefs` / LW webgl.prompt unlock.
4. **0028 FP coherence P1 (tz + WebRTC)** — NativePersona hunk drift after 0025/0026; Parent side mostly clean.
5. **0009 FFI ctypes soft-fail** — Hunk #4 EOF on `DarkstrFfi.sys.mjs`; without it, retry/`defineESModuleGetters` path missing on 156.

**Not blockers on 156 (contrary to kickoff guess):** BrowserGlue / moz.build / ModeXor **0002** and NativePersona **0003** applied clean once sequenced. Stock **Navigator.cpp** / **nsHttpHandler.cpp** / early **nsDocShell** hooks from 0005–0007 also clean.

## First port targets (ordered)

1. DocShell `nsDocShell.cpp` LoadURI BrowserId (fix/replace **0022** hunk) + NativePersona `_resetNavPhaseMirror` / read-only phase.
2. Navigator / WorkerNavigator pollution bool gates (**0027** refresh).
3. ModeXor WebGL unlock (**0029** refresh).
4. NativePersona P1 tz + WebRTC (**0028** refresh).
5. DarkstrFfi 0009 soft-fail (**0009** refresh or EOF-only fix + re-apply).

## Fail-port refresh (2026-09-23 CDT) — branch `builder/phase4-156-fail-ports`

Method: rewrite only the five FAIL patch bodies against the post-OK 156 tree (after sequential apply of 0002–0008 / 0010–0018 / 0020 / 0023–0026). Per-patch `patch -p1 --dry-run --forward --batch` then apply. 155 tree (`$DARKSTR_GECKO_ROOT_155`) **not** modified. Firefox-persona behavior matched to Phase 3 (155) intent.

| Patch | Port result | Notes |
|-------|-------------|-------|
| 0022-darkstr-docshell-browserid-phase | **PASS** | Fixed corrupt `nsDocShell.cpp` hunk (`placeholder` / wrong `@@`) → real LoadURI ~L723 `M3-CPP-NAV` context; `Id()` → `BrowserId()`; chrome `_resetNavPhaseMirror` + hooks rename landed |
| 0027-darkstr-fp-hw-cpp-content-gates | **PASS** | Regenerated vs post-0020 `DarkstrNavigatorHooks.cpp` + WorkerNavigator + `darkstr.pollutionActive` mirror |
| 0028-darkstr-fp-coherence-p1-tz-webrtc | **PASS** | Applied clean after 0027 context (tz override + WebRTC kill); train note for 156 |
| 0029-darkstr-webgl-context-enable | **PASS** | Regenerated vs landed ModeXor; `_ensureWebGlContextPrefs` + LW `webgl.prompt` unlock |
| 0009-darkstr-ffi-ctypes-softfail-fix | **PASS** | Regenerated; EOF/newline hunk fixed; `defineESModuleGetters` + retry + FFI snapshot persist |

### Counts after fail-port

| Bucket | Count | IDs |
|--------|------:|-----|
| OK (applied on 156) | **25** | prior 20 + **0009, 0022, 0027, 0028, 0029** |
| SKIP (already / folded) | **2** | 0019, 0021 |
| FAIL | **0** | — |
| Total | **27** | (no 0004) |

Effective content coverage: **27 / 27** OK|SKIP.

## Explicit non-claims (unchanged)


ServiceWorker/Worklets, fonts, screen/DPR, CF/TLS/JA3, Chrome cosplay, full WebGL extension-list / shader-precision (WebExt richer). Homogeneous WebGL may stay Mozilla/Mozilla (RFP).

## Suggested next eng pin

FAIL set is green on 156 dry-run+apply. Next: Mini subdirectory `mach build` + `install-dist_bin` as needed (**still no full `mach build` / package** until disk allows), then Proof Phase 3 exit checklist on 156 seed-42 Pollution+hooks.

## Next

1. ~~Land DocShell BrowserId port (0022) on 156.~~ **done**  
2. ~~Refresh 0027 → 0028 → 0029 → 0009 against landed 156 tree.~~ **done**  
3. ~~Re-run fail-set dry-run; expect 5/5 PASS.~~ **done** (27/27 OK|SKIP effective)  
4. Subdirectory `mach build` + `install-dist_bin` + Proof Phase 3 exit on 156 (parent/Proof — not this PR).


## Proof XOR — PASS (2026-09-23 CDT)

**App:** `…/librewolf-156.0.1-1/obj-aarch64-apple-darwin25.6.0/dist/LibreWolf.app`  
**Evidence:** `~/src/darkstr-gecko/proof-xor/pr-phase4-156-20260923-111540.md` (+ `.json` / `pr-phase4-156-PASS.*`)  
**Main tip at build:** `e0da545` (#58 fail-ports)

### Green
- First HTTPS holdback (`first_document` / stock 156 UA / host HW); SubsequentNav armed
- P0: window+worker HW=8; UA Firefox/140 MacIntel; worker langs∋es; WorkerHooks armed+installed
- P1: TZ Europe/Berlin window+worker; RTCPeerConnection undefined under Pollution; Homogeneous restores host TZ + WebRTC
- WebGL non-null both modes; Pollution UNMASKED Apple / Apple M2 + apple MAX_*; `librewolf.webgl.prompt===false`
- Homogeneous depth/worker idle

### Soft residuals (not FAIL)
- ~~`libduppel_ffi.dylib` missing on this 156 dist~~ — **closed 2026-09-24**: rebuilt via Approach B `third_party/darkstr/build-and-install-ffi.sh` into 156 `dist/bin` (+ app MacOS/Resources mirror). See section below.
- ~~Marionette/CSP could not read window `navigator.languages` on SubsequentNav (empty probe)~~ — **eng fix 0033 / PR (cloneInto)**; see section below. Worker langs were already OK (`en-US,en,es`).

### Cutover
- Mini `DARKSTR_GECKO_ROOT` → **156.0.1-1**; `DARKSTR_GECKO_ROOT_155` keeps 155 for reference
- Optional next: fresh `mach package` DMG when disk allows (>25 Gi free preferred; Mini ~16 Gi free after FFI rebuild — do not reclaim Gecko 156 objdir)

## Soft residual — eTLD seed rotate (0030) — **MERGED** / Proof XOR **PASS**

| Item | Status |
|------|--------|
| PR | [#60](https://github.com/alex-hinojosa/darkstr/pull/60) **MERGED** as `b5e4db7` |
| Tip at Proof | `95089c0` (LibreWolf **156.0.1-1**) |
| Patch | [`patches/0030-darkstr-persona-etld-seed-rotate.patch`](../patches/0030-darkstr-persona-etld-seed-rotate.patch) |
| Mini helper | [`PHASE-4-ETLD-0030-MINI-APPLY.sh`](PHASE-4-ETLD-0030-MINI-APPLY.sh) |
| Evidence | `~/src/darkstr-gecko/proof-xor/pr60-etld-0030-PASS.md` |

Sticky Pollution persona seed **per eTLD+1** (chrome JS). Pref
`darkstr.persona.rotatePerSite` default true; **locked** (no remap) when snapshot
pref is non-empty **or** `rotatePerSite=false` (Proof seed-42 / golden paste).
See [`SEED-COHERENCE.md`](SEED-COHERENCE.md).

### Proof XOR gates (PASS)

1. Different eTLD+1 → different seed (`example.com` vs `example.org`) — **PASS**
2. Same eTLD+1 (two tabs / BCs) → same seed — **PASS**
3. Golden lock (`seed=42` + `rotatePerSite=false` / snapshot) — **PASS**
4. Homogeneous / hooks off → idle — **PASS**

### Soft residual (not FAIL)

- `_etldSeedMap` / diag prefs may include extension-list hosts under Pollution (expected sticky); harness compared seeds via chrome `_etldSeedMap` / `_seedForEtld` as u32.

## Soft residual — 156 `libduppel_ffi` restore — **CLOSED** (local Mini; docs PR)

| Item | Status |
|------|--------|
| Cause | Patch **0008** vendored `third_party/darkstr` on 156; apply-script only `chmod`s `build-and-install-ffi.sh` — **does not** cargo-build the cdylib. 155 had a prior Mini run; 156 cutover skipped it. |
| Fix | Project-standard Approach B rebuild (not copy-from-155): `PATH="$HOME/.cargo/bin:$PATH"` + `build-and-install-ffi.sh --prefix "$objdir/dist/bin"` |
| Dist path | `…/librewolf-156.0.1-1/obj-aarch64-apple-darwin25.6.0/dist/bin/libduppel_ffi.dylib` |
| Also mirrored | `LibreWolf.app/Contents/MacOS/` and `…/Resources/` (parity with 155) |
| Symbols | `darkstr_ffi_abi_version`, `darkstr_ffi_persona_snapshot_json`, `darkstr_ffi_string_free` (`nm -gU`) |
| Mini helper | [`PHASE-4-FFI-MINI-INSTALL.sh`](PHASE-4-FFI-MINI-INSTALL.sh) |
| DMG | **Skipped** (disk ~16 Gi free; keep 156 objdir) |

### Verify (no full package)

```bash
source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env
DYLIB="$DARKSTR_GECKO_ROOT"/obj-*/dist/bin/libduppel_ffi.dylib
ls -la $DYLIB
otool -L $DYLIB | head
nm -gU $DYLIB | grep darkstr_ffi_
```

Brand: darkstr — not official LibreWolf. No Proof ping from this residual close.

## Soft residual — window `navigator.languages` empty on SubsequentNav (0033) — **ENG FIX** (open PR)

| Item | Status |
|------|--------|
| Symptom | Proof XOR PASS soft note: Marionette window `langs_page=[]` on Pollution SubsequentNav; worker langs `en-US,en,es`; first-nav window langs included `es`. |
| Root cause | **Product** (not harness-only): Child `darkstrLangsGetter` via `Cu.exportFunction` returned a **chrome Array**. Page principal then throws `Permission denied to access property "length"` when reading `navigator.languages` (reproduced 2026-09-24 CDT; inline script `data-darkstr-ran=1` + `pageErr`). Prefs already held full CSV (`darkstr.persona.languages` / `intl.accept_languages` = `en-US,en,es`). Worker OK because WorkerHooks injects a page-source JSON literal. |
| Fix | Pin **0033**: `Cu.cloneInto(langsCopy.slice(), pageWindow)` in `DarkstrNativePersonaChild.sys.mjs` (DepthHooks lesson). |
| Patch | [`patches/0033-darkstr-nav-languages-cloneinto.patch`](../patches/0033-darkstr-nav-languages-cloneinto.patch) |
| Mini helper | [`PHASE-4-LANGS-0033-MINI-APPLY.sh`](PHASE-4-LANGS-0033-MINI-APPLY.sh) |
| Rebuild | `browser/components` subdirectory + `install-dist_bin` only — **no** full `mach package` / DMG (disk ~14–16 Gi). |
| Open PRs | Do **not** merge/rewrite #61 (0031) or #62 (0032); 0033 touches only NativePersonaChild + docs/apply markers. |
| Proof | Parent ACK when ready — **do not ping Proof** from this residual. |

### Mini verify (2026-09-24 ~12:58 CDT)

`proof-xor/diag_langs_subsequent.py` after 0033 apply on 156:

- SubsequentNav page `navigator.languages` → `['en-US','en','es']` (direct + attr + expando); `pageErr=null`; getter name `darkstrLangsGetter`
- Worker langs → `['en-US','en','es']`; HW=8; prefs CSV still `en-US,en,es`
- Pre-fix: same probe had `pageErr=Permission denied to access property "length"` and empty attr langs


### Residual risk

- Marionette **direct** sandbox read of `navigator.languages.length` may still Xray-deny after the spoof lands; page-principal / attr / in-page probes are SoT for product correctness.
- Gate `poll_langs_es` already OR'd worker langs; after 0033, window langs should also include `es` under headed Pollution and page-principal probes.
