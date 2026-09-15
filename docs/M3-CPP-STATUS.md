# Phase 2 M3-CPP status — first live C++ nsHttp hooks

**Date:** 2026-09-14  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.

## Goal (narrow)

Land **real** train-pinned C++ call-ins on LibreWolf / Firefox **155.0.1-1** for the M3 surfaces already live in chrome JS (`0003`), without Rust FFI or rewriting Gecko.

## What this drop ships

| Deliverable | Status |
|-------------|--------|
| Real unified diff `patches/0005-darkstr-cpp-native-hooks.patch` | **New** — train-pinned |
| `DarkstrNsHttpHooks.{h,cpp}` | **In patch** |
| `nsHttpHandler::UserAgent` persona override path | **In patch** |
| Client Hints **REMOVE** only in `AddStandardRequestHeaders` | **In patch** |
| Chrome mirror pref `darkstr.persona.ua` (0003 `DarkstrNativePersona`) | **In patch** |
| Navigator.cpp / nsDocShell.cpp edits | **Not in this PR** — see follow-up `0006` / [`M3-CPP-NAV-STATUS.md`](M3-CPP-NAV-STATUS.md) |
| Rust FFI / XPCOM crate link | **Not claimed** |
| Mini `./mach build` EXIT from this authoring executor | See honesty |

## Why 0005 (not 0004)

Stub `patches/stubs/0004-darkstr-chaff-depth.patch.stub` remains M4 chaff sketch. C++ nsHttp hooks take **0005**.

## Train pin

| Item | Value |
|------|-------|
| Product train | LibreWolf **155.0.1-1** |
| Upstream tag context | Mozilla `FIREFOX_155_0_1_RELEASE` |
| Mini gecko root | `$DARKSTR_GECKO_ROOT` = `…/librewolf-source/librewolf-155.0.1-1` |
| Prerequisite | M3 chrome `0003` applied (DarkstrNativePersona present) |
| Touched Gecko paths | `DarkstrNsHttpHooks.*` (new×2), `nsHttpHandler.cpp`, `netwerk/protocol/http/moz.build`, `DarkstrNativePersona.sys.mjs` (UA mirror) |

## Hook shape (smallest compiling C++)

1. Pref gates via `Preferences::` (no new StaticPrefList required):  
   `darkstr.nativePersonaHooks` + `darkstr.mode==pollution` + `!darkstr.nativeCompatible`
2. UA from `darkstr.persona.ua` (chrome mirror) **or** minimal `"userAgent"` extract from `darkstr.persona.snapshot` JSON
3. After default headers: walk known `sec-ch-ua*` atoms and **ClearHeader** only — never SET CH
4. Default `darkstr.nativePersonaHooks=false` unchanged
5. Idle when Homogeneous / Native-Compatible / hooks false / empty UA

Semantics align with `duppel_bridge::NsHttpAction::{OverrideUserAgent,RemoveClientHints}` / `ClientHintsPolicy::Remove`.

## Apply + rebuild (Mini SSD)

```bash
source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env
# darkstr checkout on main / this branch; 0003 already on tree:
./patches/scripts/apply-darkstr-patches.sh --require-root
# or:
patch -d "$DARKSTR_GECKO_ROOT" -p1 < patches/0005-darkstr-cpp-native-hooks.patch

cd "$DARKSTR_GECKO_ROOT"
df -h .   # watch free space; Atlas: never mv under /Volumes/Mesh
./mach build netwerk/protocol/http
# record: echo mach EXIT=$?
bash docs/M3-CPP-MINI-VERIFY.sh
```

**Atlas:** never `mv` under `/Volumes/Mesh` (cp/rsync only).

## Honesty / non-claims

- **Does** ship a real unified diff vs post-M3 155.0.1 nsHttp + chrome mirror hunk; dry-run apply verified on a pristine post-0003 slice of those files.
- **Does not** claim: Navigator.cpp / DocShell C++ overrides, Rust FFI, Proof-PASS binary from this authoring box, Cloudflare/TLS/JA3/bypass.
- Navigator + DocShell-ish first vs subsequent remain chrome-JS (`0003`) — intentional focused PR.
- C++ cannot easily consume full persona JSON; chrome writes `darkstr.persona.ua` when plan applies.

## Proof gates for this PR

- [x] Pref keys stay `darkstr.*`; hooks default false
- [x] Firefox CH = REMOVE only; never SET in C++ glue
- [x] Real patch paths on 155.0.1 train (`nsHttpHandler.cpp`, moz.build)
- [x] No fake Rust FFI claim
- [x] Docs: this file, GECKO-HOOKS §2, PROOF-PIN, patches/README, apply markers
- [x] `npm test` / `cargo test` green (control-plane note)
- [ ] Mini apply + `mach build netwerk/protocol/http` EXIT — operator / Mini local-exec

## Exact skim paths

| Who | Read |
|-----|------|
| Meridian | this file, `docs/GECKO-HOOKS.md` §2, `patches/0005-…patch` |
| Proof | `docs/PROOF-XOR-CHECKLIST.md`, `docs/PROOF-PIN.md`, this file |
| PM | Goal + honesty (no CF/TLS/bypass) |
| Builder Mini | `$DARKSTR_GECKO_ROOT`, `docs/M3-CPP-MINI-VERIFY.sh` |

## Mini compile note

`UNIFIED_SOURCES` must keep `DarkstrNsHttpHooks.cpp` **alphabetically** between `ConnectionHandle.cpp` and `DnsAndConnectSocket.cpp` or `mach` fails with `UnsortedError`.
