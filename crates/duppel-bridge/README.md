# duppel-bridge

**Status:** Phase 2 sketch — prefs applicator trait for future XPCOM / Gecko glue. **No** `unsafe`, **no** FFI yet.

Turns `duppel_persona::mode_pref_effects` into an explicit **write plan** that chrome-process glue can apply (set `privacy.resistFingerprinting` / FPP, report idle crates).

| In scope | Out of scope |
|----------|--------------|
| `PrefsApplicator` trait + recording mock | Linking into Gecko / moz.build |
| Hook-site enum matching `docs/GECKO-HOOKS.md` | Real nsHttp / DocShell patches |
| XOR side-effect plan for Pollution / Homogeneous | Cloudflare / TLS / anti-detect |

Consumers (later): thin C++/XPCOM or Rust-in-Gecko observers. Until then, unit tests + docs only.

```bash
cd crates && cargo test -p duppel-bridge
```

GPL-3.0-only. Brand **darkstr** — not official LibreWolf.
