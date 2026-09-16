# Phase 2 exit status — residual map

**Project:** darkstr — pollution browser; not official LibreWolf.
**Truth point:** `origin/main` at `3e78a18` (2026-09-16).
**Scope:** documentation-only exit hygiene. This file does not change Gecko patches, defaults, or product behavior.

## Bottom line

Phase 2 control-plane work and the train-pinned native hook slices are represented on
`main`, but Phase 2 is **not exit-clean yet**. The fork artifact, headed Proof matrix,
packaging/rebuild evidence, and several native/depth follow-ups remain open. PR #39
(WebExt ↔ chrome prefs bridge) is **open and awaiting Proof**; it is not part of this
`main` tip and is not claimed merged here.

## Closed or landed on `main`

| Area | Truth at this tip | Reference |
|---|---|---|
| Phase 2 scaffold, crate stubs, bridge design, hook map | Landed as docs/control-plane work; no vendor Gecko tree in this repo | #5, #6, #7 |
| WebExt settings/chrome-prefs panel | Landed; it documents fork-only chrome authority and does not write stock-LibreWolf privacy prefs | #8 |
| M1 prefs/cfg surface | `darkstr.mode=homogeneous`, `darkstr.nativeCompatible=false`, and `darkstr.strictFirstDoc=true` are documented/applied as the baseline | #14 |
| XOR control plane | Rust applicator and tests encode Pollution → RFP/FPP off and Homogeneous → stock RFP expectations | #15 |
| Train-pinned XOR observer | Chrome observer patch exists for the 155.0.1-1 fork path, including the FPP/CB settle follow-up; this is not a stock WebExt privilege | #18, #21, #24 |
| Native identity hook slices | Train-pinned nsHttp UA + Client Hints **REMOVE**, Navigator, and DocShell first/subsequent-nav call-ins are present in the public patch set | #19, #22, #23, #25 |
| Seed/coherence and Native-Compatible operator docs | Goldens, control-plane checks, and the banking/SSO smoke checklist landed; these are not a headed fork Proof pass | #26 |
| FFI boundary / Approach B pin | `duppel-ffi` and the ctypes `cdylib` route plus soft-fail follow-up landed as implementation slices | #27, #28, #29 |
| Soft `navigator.languages` residual | **Closed** after the `intl.accept_languages` + primary-tag `languageOverride` fix and Proof skim | #37 (0014) |
| `savedAcceptLanguages=und` hygiene | **Soft-parked/closed**: save and restore normalize `und` to an empty pref or a real prior CSV | #38 (0015) |

The earlier C++ nsHttp/Navigator/DocShell slices above are shipped patch material;
this status does not imply that hooks are enabled in a product build.

## Open residuals and exit gates

| Residual | Status / honest next step |
|---|---|
| **Prefs bridge #39** | **OPEN — awaiting Proof.** Bidirectional WebExt storage ↔ chrome-pref sync is fork-only and not merged into `main`; do not call it complete. |
| **Fork packaging artifact** | **OPEN.** A reproducible branded darkstr fork build/package and its artifact evidence are still required for the Phase 2 exit. Existing patch files and control-plane tests are not a shipped browser binary. |
| **Proof fork XOR matrix** | **OPEN.** Run the headed fork artifact through Homogeneous, Pollution, and Native-Compatible cases, including no UTC letterbox under active Pollution. `cargo test`/fixtures alone do not close this gate. |
| **Approach A (`gkrust` path dependency)** | **DEFERRED.** Approach B (`cdylib` + chrome ctypes) is the current FFI pin. The libxul-resident gkrust path remains future work; no Approach A claim is made. |
| **Live native chaff/depth C++** | **OPEN; Phase 3 depth.** M4 has scheduler/depth enums, plans, seeds, and stubs only. Native timer plus canvas/WebGL/Audio/worker C++ hooks are not claimed. |
| **Native-Compatible privacy-pane site-list UI** | **OPEN; Phase 2→3 / PM scheduling.** The Phase 1 WebExt site list remains the usable path; no chrome privacy-pane UI flip is made here. |
| **Cookie sandbox/firewall** | **BACKLOG ONLY.** #34 is a documentation one-pager, not an implemented sandbox or firewall. |
| **Full fork build/merge-train exit** | **OPEN.** Reproducible fork build, packaging, and documented Homogeneous-vs-LibreWolf deltas remain exit work. |

## Checklist truth vs `main`

- [x] darkstr branding and public positioning remain explicit: pollution browser, not
      official LibreWolf, not a Cloudflare/Turnstile bypass, and no TLS/JA3 claims.
- [x] Stable `darkstr.*` pref names and Homogeneous default are documented.
- [x] Rust XOR/applicator control plane and train-pinned observer patch are present.
- [x] Train-pinned C++ nsHttp/Navigator/DocShell hook slices are present as patches.
- [x] `navigator.languages` residual is closed by #37; `und` restore hygiene is
      soft-parked by #38.
- [x] Cookie sandbox/firewall is correctly recorded as backlog-only documentation.
- [ ] #39 WebExt ↔ chrome prefs bridge merged and Proof-checked.
- [ ] Reproducible branded fork build and packaging artifact recorded.
- [ ] Headed Proof XOR matrix on that fork artifact recorded.
- [ ] Approach A gkrust/libxul link completed (explicitly deferred).
- [ ] Live native chaff timer and canvas/WebGL/Audio/worker C++ depth hooks landed.
- [ ] Chrome privacy-pane Native-Compatible site-list UI shipped.

## Explicit non-claims and operating locks

- `darkstr.nativePersonaHooks` remains **default-off**. No PM flip and no product
  default change is made by this document.
- PR #39 is in flight and awaiting Proof; this branch is based on `origin/main`, not
  the PR branch.
- A patch, a dry-run, a Rust test, or a local control-plane fixture is not evidence of
  a rebuilt fork binary, package, or headed Proof PASS.
- No Gecko source is changed by this PR. No new C++ hook is asserted here.
- Native chaff/depth is Phase 3 work; the M4 Rust scheduler and surface APIs do not
  claim live C++ timers or fingerprint-surface hooks.
- Native-Compatible remains an escape while preserving `darkstr.mode`; it is not a
  bypass or anti-detect feature.
- Keep the Mini working tree on local SSD; preserve the objdir for verification and
  use the headed launcher `~/src/darkstr-gecko/headed-hooks-on-skim.sh` when the
  operator runs a headed skim. Never `mv` under `/Volumes/Mesh`.

## Suggested exit order

1. Proof reviews and, if accepted, merges #39.
2. Produce and record the branded fork packaging artifact.
3. Run the headed Proof XOR/coherence matrix against that artifact.
4. Schedule the privacy-pane site list and Phase 3 native chaff/depth work separately.
