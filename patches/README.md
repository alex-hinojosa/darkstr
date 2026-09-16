# darkstr patches sketch (LibreWolf-based fork)

**Not** a Mozilla or LibreWolf source tree. **Not** official LibreWolf branding.  
These stubs document *how* a real bsys6 / LibreWolf recipe would layer darkstr prefs and hooks. Full patch bodies against a pinned Firefox train live in the private fork (M1+).

| Path | Role |
|------|------|
| [`stubs/darkstr.cfg`](stubs/darkstr.cfg) | Chrome pref defaults (`darkstr.mode`, …) — same as `docs/darkstr.cfg.example` |
| [`stubs/0001-darkstr-prefs-defaults.patch.stub`](stubs/0001-darkstr-prefs-defaults.patch.stub) | Prefs / cfg wiring sketch |
| [`0002-darkstr-mode-xor-rfp.patch`](0002-darkstr-mode-xor-rfp.patch) | **Real** train-pinned chrome JS XOR observer (155.0.1-1 / `DarkstrModeXor.sys.mjs`) |
| [`stubs/0002-darkstr-mode-xor-rfp.patch.stub`](stubs/0002-darkstr-mode-xor-rfp.patch.stub) | Pointer only — superseded by real `0002-…patch` |
| [`0003-darkstr-native-persona-hooks.patch`](0003-darkstr-native-persona-hooks.patch) | **Real** train-pinned chrome JS native persona hooks (155.0.1-1 / `DarkstrNativePersona*.sys.mjs`) |
| [`stubs/0003-darkstr-hook-sites.patch.stub`](stubs/0003-darkstr-hook-sites.patch.stub) | Pointer only — superseded by real `0003-…patch` |
| [`0005-darkstr-cpp-native-hooks.patch`](0005-darkstr-cpp-native-hooks.patch) | **Real** train-pinned C++ nsHttp UA + CH REMOVE (155.0.1-1 / `DarkstrNsHttpHooks`) — Navigator/DocShell still chrome-JS |
| [`0006-darkstr-cpp-navigator-docshell.patch`](0006-darkstr-cpp-navigator-docshell.patch) | **Real** train-pinned C++ Navigator overrides + honest DocShell stub (155.0.1-1) — CH stays in 0005; DocShell stub superseded by 0007 SoT |
| [`stubs/0006-darkstr-cpp-navigator-docshell.patch.stub`](stubs/0006-darkstr-cpp-navigator-docshell.patch.stub) | Pointer only — superseded by real `0006-…patch` |
| [`0007-darkstr-cpp-docshell-nav-sot.patch`](0007-darkstr-cpp-docshell-nav-sot.patch) | **Real** train-pinned C++ DocShell first/subsequent SoT (155.0.1-1) — chrome Map fallback |
| [`stubs/0007-darkstr-cpp-docshell-nav-sot.patch.stub`](stubs/0007-darkstr-cpp-docshell-nav-sot.patch.stub) | Pointer only — superseded by real `0007-…patch` |
| [`stubs/0004-darkstr-chaff-depth.patch.stub`](stubs/0004-darkstr-chaff-depth.patch.stub) | M4: chaff scheduler + canvas/Audio/WebGL/worker depth notes (enums in Rust; still not a real patch) |
| [`scripts/apply-darkstr-patches.sh`](scripts/apply-darkstr-patches.sh) | Example apply order for a real tree |

Design pin: [`../docs/GECKO-HOOKS.md`](../docs/GECKO-HOOKS.md). Bridge: [`../docs/PREF-BRIDGE.md`](../docs/PREF-BRIDGE.md).

## Intended apply flow (real fork)

```bash
# On a machine that already has the LibreWolf/Firefox source + darkstr overlay:
export DARKSTR_GECKO_ROOT=/path/to/librewolf-based-tree
./patches/scripts/apply-darkstr-patches.sh
```

The script:

1. Refuses to run if `DARKSTR_GECKO_ROOT` is unset or missing (safe no-op outside a fork checkout).
2. Copies `stubs/darkstr.cfg` into the product cfg location (path configurable).
3. Applies numbered stubs **when** they are replaced with real unified diffs against the pinned train.

Until M1, stubs end in `.patch.stub` so `patch(1)` is not accidentally run against an empty tree.

## Idempotent re-apply (soft residual after #19; markers after later patches rewrite shared files)

`scripts/apply-darkstr-patches.sh` applies real `patches/000*.patch` via
`patch -p1 --forward --batch` (dry-run, then apply). Re-running after a
successful apply skips already-applied hunks — no interactive prompts and no
leftover `.rej` for those hunks. Genuine conflicts still exit non-zero. M1 cfg
copy + `librewolf.cfg` marker append remain separately idempotent.

## Rules

- Homogeneous: stock LibreWolf RFP expectations — **no** RFP metric customization in patches.
- Pollution: auto-set `privacy.resistFingerprinting` and `privacy.fingerprintingProtection` to `false`.
- Pref names: `darkstr.mode`, `darkstr.nativeCompatible` only (Proof pin).
- GPL-3.0 for darkstr glue; respect MPL for upstream Gecko files.
- No Cloudflare / TLS / anti-detect marketing in patch commit messages.

## Branding

Product name is **darkstr**. Do not ship these patches as “LibreWolf official.” Change about: / icons / name in the private fork branding pass (M1), not by claiming upstream identity.


## M1 skim apply (2026-09-14)

On the Builder Mini SSD clean tree (`DARKSTR_GECKO_ROOT`, see `docs/M1-STATUS.md`):

```bash
source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env   # or export DARKSTR_GECKO_ROOT=...
./patches/scripts/apply-darkstr-patches.sh --dry-run --require-root
./patches/scripts/apply-darkstr-patches.sh --require-root
grep -n 'darkstr.mode\|BEGIN darkstr-m1-prefs' "$DARKSTR_GECKO_ROOT/lw/librewolf.cfg"
```

The script copies `stubs/darkstr.cfg` → `lw/darkstr.cfg` and appends an idempotent `defaultPref` block into `lw/librewolf.cfg` so chrome prefs load. It does **not** run `make bootstrap` / `make build`. `.patch.stub` files remain sketches until replaced with train-pinned unified diffs.

## M2 control-plane + train-pinned observer (2026-09-14)

Rust XOR applicator remains the public SoT (`duppel_bridge` / `duppel_persona`). Live chrome observer is the real unified diff [`0002-darkstr-mode-xor-rfp.patch`](0002-darkstr-mode-xor-rfp.patch) against Firefox/LibreWolf **155.0.1-1** (`BrowserGlue` + `moz.build` + new `DarkstrModeXor.sys.mjs`). **No** invented C++ paths. Rebuild: `./mach build browser/components`. See `docs/M2-STATUS.md` / `docs/M2-MINI-VERIFY.sh`.


## M3-CPP nsHttp call-ins (2026-09-14)

Real unified diff [`0005-darkstr-cpp-native-hooks.patch`](0005-darkstr-cpp-native-hooks.patch) against post-M3 155.0.1-1:

- New `DarkstrNsHttpHooks.{h,cpp}` in `netwerk/protocol/http/`
- `nsHttpHandler::UserAgent` + `AddStandardRequestHeaders` call-ins
- Chrome `DarkstrNativePersona` mirrors `darkstr.persona.ua` for C++ (no JSON in necko)
- **Not** claimed: Navigator.cpp / nsDocShell.cpp edits, Rust FFI, Cloudflare/TLS/JA3

Rebuild: `./mach build netwerk/protocol/http`. See `docs/M3-CPP-STATUS.md`. Stub `0004` remains chaff (not this patch number).

## M3-CPP-NAV Navigator + DocShell stub (2026-09-15)

Real unified diff [`0006-darkstr-cpp-navigator-docshell.patch`](0006-darkstr-cpp-navigator-docshell.patch) against post-0005 155.0.1-1:

- New `DarkstrNavigatorHooks.{h,cpp}` in `dom/base/` + call-ins in `Navigator.cpp`
- New `DarkstrDocShellHooks.{h,cpp}` honest stub in `docshell/base/` + call-in in `nsDocShell.cpp`
- Chrome mirrors: `darkstr.persona.platform` / `hardwareConcurrency` / `languages` / `docShellPhase`
- **Not** claimed: full C++ DocShell load-counter SoT, deviceMemory C++ (absent on Firefox Navigator), Rust FFI, Cloudflare/TLS/JA3
- CH REMOVE unchanged in `0005`

Rebuild: `./mach build dom/base docshell/base`. See `docs/M3-CPP-NAV-STATUS.md`.


## M3-CPP-DOCSHELL first/subsequent SoT (2026-09-15)

Real unified diff [`0007-darkstr-cpp-docshell-nav-sot.patch`](0007-darkstr-cpp-docshell-nav-sot.patch) against post-0006 155.0.1-1:

- Replaces `DarkstrDocShellHooks` stub with per-BC LoadURI counter + `CurrentPhase` / `ShouldApplyPersona`
- `nsDocShell::LoadURI` notes top-content navigations with `BrowsingContext::Id()`
- Chrome prefers C++ `docShellPhase` mirror when hooks on
- **Not** claimed: Rust FFI, Cloudflare/TLS/JA3, RFP metric patches, full parent/content IPC mirror

| [`0008-darkstr-gecko-ffi-link.patch`](0008-darkstr-gecko-ffi-link.patch) | **Real** train-pinned Approach B FFI link (155.0.1-1): vendored `third_party/darkstr`, `DarkstrFfi.sys.mjs` ctypes, chrome prefers FFI snapshot |
| [`stubs/0008-darkstr-gecko-ffi-link.stub`](stubs/0008-darkstr-gecko-ffi-link.stub) | Demoted breadcrumb — superseded by real `0008-…patch` |


## M-FFI-0008 gecko FFI link (Approach B)

- Real patch: [`0008-darkstr-gecko-ffi-link.patch`](0008-darkstr-gecko-ffi-link.patch)
- Vendored flattened `duppel-persona` + `duppel-ffi` under `third_party/darkstr/`
- Chrome `DarkstrFfi.sys.mjs` loads `libduppel_ffi` via ctypes; `_readSnapshot` prefers FFI when seed set
- Build: `third_party/darkstr/build-and-install-ffi.sh --prefix "$objdir/dist/bin"`
- Rebuild: `./mach build browser/components`
- See [`../docs/M-FFI-0008-STATUS.md`](../docs/M-FFI-0008-STATUS.md). Approach A (gkrust path-dep) deferred.


## M3 soft languages force-notify (0012)

Real unified diff [`0012-darkstr-nav-languages-force-notify.patch`](0012-darkstr-nav-languages-force-notify.patch) against post-0011 155.0.1-1:

- Chrome `_forceLanguagesMirrorNotify` clear+set when `darkstr.persona.languages` CSV unchanged
- Parent `GetSnapshot` calls `refreshPlan()` so pageshow triggers content `0011` WebIDL cache clear
- Soft only — `nativePersonaHooks` default-off; no Accept-Language HTTP rewrite
- Rebuild: `./mach build --allow-subdirectory-build browser/components`
- See [`../docs/M3-LANGUAGES-SOFT-STATUS.md`](../docs/M3-LANGUAGES-SOFT-STATUS.md)


## M3 soft languages BC override (0013)

Real unified diff [`0013-darkstr-nav-languages-bc-override.patch`](0013-darkstr-nav-languages-bc-override.patch) against post-0012 155.0.1-1:

- Parent `GetSnapshot` sets `browsingContext.top.languageOverride` to persona langs CSV (clear+set when unchanged)
- Stock `DidSet` → `ClearLanguageCache` via BC IPC (pref notify alone insufficient in content)
- When hooks on: Accept-Language for that BC may follow persona CSV (HttpBaseChannel)
- Soft only — `nativePersonaHooks` default-off; residual not claimed closed
- Rebuild: `./mach build --allow-subdirectory-build browser/components`
- See [`../docs/M3-LANGUAGES-SOFT-STATUS.md`](../docs/M3-LANGUAGES-SOFT-STATUS.md)
