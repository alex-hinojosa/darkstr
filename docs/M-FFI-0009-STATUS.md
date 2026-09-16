# M-FFI-0009 — Approach B ctypes soft-fail fix

**Brand:** darkstr — not official LibreWolf.  
**Train:** LibreWolf / Firefox **155.0.1-1**.  
**Follow-up to:** [`M-FFI-0008-STATUS.md`](M-FFI-0008-STATUS.md) / PR #28.

## Why

Proof soft residual headed skim (pollution + hooks-on + seed=42 + empty snapshot): UA/platform matched seed-42 MacIntel, but **HW=10 / langs thinner than goldens** and `darkstr.persona.snapshot` stayed `""` — consistent with **chrome mulberry fallback**, not Rust FFI SoT.

Root causes addressed:
1. `DarkstrFfi.sys.mjs` used `PathUtils.join` without ensuring `PathUtils` in the chrome ESM → load soft-failed.
2. Successful FFI reads never **persisted** to `darkstr.persona.snapshot`, so about:config could not show FFI fill even when ctypes worked.

## Claimed

| Item | Status |
|------|--------|
| `patches/0009-darkstr-ffi-ctypes-softfail-fix.patch` | New |
| ctypes load via `ChromeUtils.defineESModuleGetters` + string path join | New |
| Extra dirsvc candidates (`XCurProcD`) | New |
| Persist FFI snapshot JSON to pref on success | New |
| `console.warn` on FFI miss / import fail | New |
| `nativePersonaHooks` default | **Still false** |

## Not claimed

- Headed Proof re-skim PASS (awaiting re-run with this patch)
- Approach A gkrust path-dep
- PM first-run / settings copy

## Proof XOR (soft)

1. Apply 0009 (after 0008); dylib in CurProcD (`MacOS/libduppel_ffi.dylib`).
2. Temp profile: pollution + hooks=true + seed=42 + empty snapshot.
3. After first→subsequent: `darkstr.persona.snapshot` non-empty; HW=8, langs include `es`, timezone `Europe/Berlin` (seed-42 macos golden).
4. Browser console: no sustained `DarkstrFfi: load failed`.
