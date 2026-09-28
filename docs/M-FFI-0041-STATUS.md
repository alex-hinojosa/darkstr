# M-FFI-0041 status — Retire Approach B (cdylib/ctypes runtime load)

**Brand:** darkstr — not official LibreWolf.  
**Train:** LibreWolf / Firefox **156.0.1-1**.  
**Patch:** [`../patches/0041-darkstr-ffi-retire-approach-b.patch`](../patches/0041-darkstr-ffi-retire-approach-b.patch)  
**SoT file:** [`../patches/0041-files/DarkstrFfi.sys.mjs`](../patches/0041-files/DarkstrFfi.sys.mjs)  
**PR:** [#72](https://github.com/alex-hinojosa/darkstr/pull/72) **MERGED** as `f961d3941a13a142ef5b8561cbc3134673b9cc23`  
**Tip at Proof:** `b6f100583c27044d6fb26a86021bf700921de791`  
**Branch:** `builder/m-ffi-retire-approach-b-0041`  
**Prerequisite:** Approach A **0040** Proof-green on main (PR [#71](https://github.com/alex-hinojosa/darkstr/pull/71) MERGED `f828a78`).  
**Proof:** **PASS** — evidence `~/AgentDocs/proof/darkstr-pr72-0041-xor-20260928-075315/` + [PR comment](https://github.com/alex-hinojosa/darkstr/pull/72#issuecomment-5870246843).

## Approach

| Option | Choice | Why |
|--------|--------|-----|
| **A** gkrust path-dep → libxul/XUL | **Kept (only runtime path)** | Chrome Prefer A only; soft-fail → JS mulberry |
| **B** release `cdylib` + chrome ctypes | **Retired for runtime load** | Candidate list / ctypes load of `libduppel_ffi` removed from `DarkstrFfi.sys.mjs` |

## What this pin changes

| Item | Change |
|------|--------|
| `browser/components/DarkstrFfi.sys.mjs` | A-only stages; remove `cdylibCandidates` / B stage; `loadSource` = `libxul` \| `null`; honest B-retired STATUS |
| `browser/components/DarkstrNativePersona.sys.mjs` | Comment honesty: FFI = A/libxul; soft-fail → mulberry; B retired |
| `docs/PHASE-4-FFI-MINI-INSTALL.sh` | Gate-off B install for Pollution product path; point to A-only |
| `docs/MINI-PACKAGE-PIN.md` | FFI-in-DMG gap reframed: product path is A (XUL-resident); B dylib not required |
| Crate `duppel-ffi` `crate-type` | **Unchanged** — still may include `cdylib` for unit tests / offline builds |
| Approach A (gkrust / libxul.symbols) | **Not touched** |
| `nativePersonaHooks` default | **Still false** |

## Claimed / not claimed

| Item | Claimed? |
|------|----------|
| Real unified diff `0041-*.patch` + SoT file | **Yes** |
| Chrome A-only load; B path gone | **Yes** |
| Soft-fail → JS mulberry when A missing | **Yes** |
| Mini chrome apply (no XUL relink) | **Yes** (Builder) |
| `nativePersonaHooks` default | **Still false** |
| Approach A removed / hooks default-on | **No** |
| Delete `build-and-install-ffi.sh` / crate cdylib | **No** — gated off for product; keep for tests |
| Headed Prefer A (`loadSource=libxul`) | **Optional / soft** |
| Cloudflare / TLS / JA3 / RFP metrics | **No** |

## Mini apply (chrome-only)

```bash
source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env
cd ~/src/darkstr-gecko/darkstr
./docs/M-FFI-0041-MINI-APPLY.sh
# or: patches/scripts/apply-darkstr-patches.sh --require-root  # after 004* loop wired
```

No `toolkit/library` / XUL relink required. Verify:

```bash
grep -E '0041: Retire B|cdylibCandidates|kind: "cdylib"' \
  "$DARKSTR_GECKO_ROOT/browser/components/DarkstrFfi.sys.mjs"
# Expect: 0041 marker present; cdylibCandidates / kind:"cdylib" ABSENT
nm -gU "$(ls -d "$DARKSTR_GECKO_ROOT"/obj-*/dist/bin/XUL | head -1)" | grep darkstr_ffi_
# Expect: three Approach A globals still present (untouched)
```

## Proof XOR checklist — **PASS** (2026-09-28 ~07:53 CDT)

- [x] `0041` apply idempotent (markers skip on 2nd run)
- [x] Mini: chrome apply EXIT 0 (`browser/components` + install-dist_bin)
- [x] Soft: `DarkstrFfi` has no `cdylibCandidates` / no `kind: "cdylib"` stage
- [x] Soft: marker `0041: Retire B` present; `loadSource` type is libxul-only
- [x] Soft: Approach A symbols still in XUL (`nm` three globals)
- [x] Soft-fail closed: when A missing → null → JS mulberry (no invent Chrome)
- [x] `nativePersonaHooks` still default-off
- [x] STATUS honesty: B retired for runtime; A kept; hooks default-off; no PM copy


## Mini verify (Builder — 2026-09-28 ~07:50 CDT)

| Step | Result |
|------|--------|
| Apply 0041 (SoT + NativePersona honesty) | **Applied** — markers skip on re-run |
| `./mach build --allow-subdirectory-build browser/components` | **EXIT 0** (~7s) |
| `make install-dist_bin` + moz-src symlinks | **OK** |
| `nm -gU …/XUL \| grep darkstr_ffi_` | Three A globals still present (untouched) |
| Chrome B path | **Dead** — no `cdylibCandidates` / no `kind: "cdylib"` |
| `PHASE-4-FFI-MINI-INSTALL.sh` | **Gated** — EXIT 0 with RETIRED message (no dylib install) |
| Historical `libduppel_ffi.dylib` in dist/bin | **Present / inert** (soft residual) |
| `nativePersonaHooks` default | **Still false** |
| Headed Prefer A | **Soft-OK / not executed** |
| Proof XOR / merge | **PASS / MERGED** — tip `b6f10058`; merge `f961d39`; evidence `~/AgentDocs/proof/darkstr-pr72-0041-xor-20260928-075315/` |

## Soft residuals left after B retirement

1. Historical `libduppel_ffi.dylib` may still sit in `dist/bin` / app MacOS from prior PHASE-4 installs — **inert** (chrome no longer loads it).
2. `build-and-install-ffi.sh` + crate `cdylib` remain for unit tests / offline — product docs must not instruct Pollution installs to depend on them.
3. `package-manifest.in` still may omit dylib — **moot** for product A-only path (XUL already carries symbols).
4. Optional headed `loadSource=libxul` skim — soft-OK if not executed.
5. DarkstrNativePersona comment was honesty-only; behavior already preferred FFI then mulberry.

## Honesty

- Approach A **kept** (only runtime path); B runtime load **retired**.
- `nativePersonaHooks` remains **default-off**.
- Soft historical `libduppel_ffi.dylib` may remain on disk — **inert** (chrome A-only does not load).
- Brand: darkstr — not official LibreWolf.
