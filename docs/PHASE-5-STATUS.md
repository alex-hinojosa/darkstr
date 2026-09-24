# Phase 5 status — eng backlog after Phase 4 depth closed

**Date:** 2026-09-24 (CDT)  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.  
**Train:** LibreWolf **156.0.1-1** (Mini SoT via `DARKSTR_GECKO_ROOT`)

Phase 4 depth (through **0034** lastSeeds eTLD diag) is **CLOSED** / Proof PASS.  
Phase 5 opens the **cookie firewall** backlog (PR #34 docs → live pin).

## In-flight — 0035 Cookie firewall MVP

| Item | Status |
|------|--------|
| Pin | **0035** |
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

### Out of scope (this pin)

- fonts / speech / WebGPU
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
- **Not merged. Proof not pinged** (parent ACK).

