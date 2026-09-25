# Phase 5 status — eng backlog after Phase 4 depth closed

**Date:** 2026-09-24 (CDT)  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.  
**Train:** LibreWolf **156.0.1-1** (Mini SoT via `DARKSTR_GECKO_ROOT`)

Phase 4 depth (through **0034** lastSeeds eTLD diag) is **CLOSED** / Proof PASS.  
Phase 5 pin **0035 cookie firewall MVP** is **MERGED** / Proof XOR **PASS**.  
Phase 5 pin **0036 fonts coherence** is **IN PROGRESS** (PR open; awaiting Proof XOR).

## In progress — 0036 Fonts coherence / fingerprint farbling

| Item | Status |
|------|--------|
| Pin | **0036** |
| PR | [#67](https://github.com/alex-hinojosa/darkstr/pull/67) **OPEN** |
| Branch | `builder/phase5-fonts-0036` |
| Patch | [`patches/0036-darkstr-fonts-coherence.patch`](../patches/0036-darkstr-fonts-coherence.patch) |
| Mini helper | [`scripts/apply-0036-fonts-coherence-mini.sh`](../scripts/apply-0036-fonts-coherence-mini.sh) / [`PHASE-5-FONTS-0036-MINI-APPLY.sh`](PHASE-5-FONTS-0036-MINI-APPLY.sh) |
| Proof | **not claimed** — awaiting ACK |

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

### Proof gates (for Proof ACK — do not ping from Builder)

1. Hooks-off / Homogeneous → idle (host font metrics)
2. Pollution+hooks: same seed → stable font/measureText digests (double-read)
3. Different eTLD+1 with rotatePerSite → digests diverge
4. Same eTLD two tabs → same digests/seed
5. Golden lock seed-42 coherent; no Chrome-only font names in any surfaced list

### Out of scope (this pin)

- speech / WebGPU
- Native-Compatible privacy-pane UI (PM)
- FontFaceSet full enumeration filtering (soft residual — `check` covered)
- gfx-level font whitelist (Tor-style) — page-compartment only

### Residual risks

- DOM width fudge may shift pixel-perfect layouts by ≤0.1% when hooks armed.
- `document.fonts` iteration / `ready` not wrapped (only `check`).
- Not anti-detect / not Cloudflare bypass.

## Apply status (Mini) — 0036 — 2026-09-24 ~20:56 CDT

- Tree: LibreWolf **156.0.1-1** (`$DARKSTR_GECKO_ROOT`)
- Markers already present (Builder applied source edits); patch skip OK
- `./mach build --allow-subdirectory-build browser/components` — **OK** (~7s)
- `make install-dist_bin` — Kept existing; moz-src symlinks refreshed
- Symlinks: `dist/LibreWolf.app/.../moz-src/browser/components/DarkstrDepthHooks*.sys.mjs` → source (fontSeed / Soft residual 0036 present)
- PR [#67](https://github.com/alex-hinojosa/darkstr/pull/67) **OPEN**; tip awaiting Proof XOR (not claimed)
- Apply log: `~/src/darkstr-gecko/darkstr-apply-0036-20260924-205605.log`

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

**Soft observation:** the outbound `/echo` Cookie request header was empty (not
`NETWORK_REAL`). The sandbox jar and script surfaces held the synthetic
`net_probe`; this is a soft note only and does not change the PASS verdict.

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

