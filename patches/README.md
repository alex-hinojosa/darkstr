# darkstr patches sketch (LibreWolf-based fork)

**Not** a Mozilla or LibreWolf source tree. **Not** official LibreWolf branding.  
These stubs document *how* a real bsys6 / LibreWolf recipe would layer darkstr prefs and hooks. Full patch bodies against a pinned Firefox train live in the private fork (M1+).

| Path | Role |
|------|------|
| [`stubs/darkstr.cfg`](stubs/darkstr.cfg) | Chrome pref defaults (`darkstr.mode`, …) — same as `docs/darkstr.cfg.example` |
| [`stubs/0001-darkstr-prefs-defaults.patch.stub`](stubs/0001-darkstr-prefs-defaults.patch.stub) | Prefs / cfg wiring sketch |
| [`stubs/0002-darkstr-mode-xor-rfp.patch.stub`](stubs/0002-darkstr-mode-xor-rfp.patch.stub) | Pollution kills RFP/FPP; Homogeneous restores stock RFP — **M2 notes upgraded**; still not a real C++ patch |
| [`stubs/0003-darkstr-hook-sites.patch.stub`](stubs/0003-darkstr-hook-sites.patch.stub) | M3: nsHttp UA+CH REMOVE / Navigator / DocShell / MAIN inject gate notes (enums in Rust; still not a real patch) |
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

## M2 control-plane (2026-09-14)

Rust XOR applicator is the public source of truth (`duppel_bridge` / `duppel_persona`). Stub `0002` notes document the observer→applicator contract. **No** untested C++ bodies in this repo. See `docs/M2-STATUS.md`.
