# Phase 4 status — LibreWolf / Firefox **156.0.1-1** train

**Date:** 2026-09-23 (CDT)  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.  
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
- [ ] Port / refresh broken hunks (DocShell / Navigator / ModeXor / NativePersona / Ffi) as `0030+` or train-refresh notes
- [ ] Mini subdirectory builds + install-dist_bin as needed (**no full `mach build` yet** — disk ~43 Gi)
- [ ] Proof: Phase 3 exit checklist on 156 seed-42 Pollution+hooks
- [ ] Optional: fresh `mach package` DMG when disk allows
- [ ] Cutover docs: PHASE-3 remains historical; this file is SoT for 156

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

## Explicit non-claims (unchanged)

ServiceWorker/Worklets, fonts, screen/DPR, CF/TLS/JA3, Chrome cosplay, full WebGL extension-list / shader-precision (WebExt richer). Homogeneous WebGL may stay Mozilla/Mozilla (RFP).

## Suggested next eng pin

**Per-fail port (not a blanket 0030 train-refresh of 0002–0029).** Twenty patches applied clean on 156; only five need surgical refresh. Prefer `0030`–`0034` (or in-place hunk fixes + regenerate) aimed at the FAIL queue above, then Mini subdir rebuilds — still **no** full `mach build` until the FAIL set is green on dry-run.

## Next

1. Land DocShell BrowserId port (0022) on 156.  
2. Refresh 0027 → 0029 → 0028 → 0009 against landed 156 tree.  
3. Re-run sequential dry-run; expect 27/27 OK|SKIP.  
4. Only then: subdirectory `mach build` + `install-dist_bin` + Proof Phase 3 exit on 156.
