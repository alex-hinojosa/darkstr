# Cookie sandbox / firewall

**Brand:** darkstr — not official LibreWolf.  
**Status:** **0035 MVP MERGED** (Phase 5). **0042** (outbound `/echo` Cookie QI) MERGED. **0048** correctness (Rowan QA B1/B2/N1, omit, 3P partitioning, mirror staleness) in review — see [0048](#0048-correctness). Prior art: backlog one-pager (PR #34, 2026-09-16).

## Idea

Treat cookies like traffic behind a **firewall**:

1. **Sandbox jar** — accepted cookies land in an isolated store (not the user’s primary identity jar), partitioned by top-level site (0048; was eTLD+1 of the cookie in 0035).
2. **Filter** — one policy on the path in (`Set-Cookie`) and out (`Cookie` request header, `document.cookie`, Cookie Store) that **allow / deny / rewrite** (including synthetic values).

Same mental model as a network firewall: default-off until armed; allowlist for first-party sessions you actually want.

## 0035 MVP (shipped as patch)

| Layer | Behavior when **armed** + non-allowlisted |
|-------|-------------------------------------------|
| Network `Set-Cookie` | Ingest into parent sandbox jar; strip response header (best-effort) |
| Network `Cookie` | Replace with sandbox serialization |
| `document.cookie` / Cookie Store | Same jar via JSWindowActor IPC + child mirror |

**Arm:** `darkstr.mode=pollution` && `!nativeCompatible` && `nativePersonaHooks` && `darkstr.cookieFirewall.enabled` (default **false**).

**Modes:**

- `synthetic` (default) — values rewritten to seed-tied tokens (0030 eTLD+1 seed; golden lock → global seed).
- `isolate` — sandbox stores values as-is; still kept out of primary jar.

**Allowlist:** `darkstr.cookieFirewall.allowlist` CSV of eTLD+1 → real jar passthrough.

**Shared policy:** `DarkstrCookieFirewall.sys.mjs` is SoT — HTTP observers and script IPC share one jar. No HTTP/JS split-brain.

See [`PHASE-5-STATUS.md`](PHASE-5-STATUS.md) for Proof gates and residuals.

## 0048 correctness

Patch [`patches/0048-darkstr-cookie-firewall-correctness.patch`](../patches/0048-darkstr-cookie-firewall-correctness.patch), SoT [`patches/0048-files/`](../patches/0048-files/), Mini helper [`scripts/apply-0048-cookie-firewall-mini.sh`](../scripts/apply-0048-cookie-firewall-mini.sh), tests [`tests/cookie-firewall-0048.test.mjs`](../tests/cookie-firewall-0048.test.mjs).

| Rowan QA | Fix |
|----------|-----|
| **B1** cross-site iframe read the top site's jar | Jar key = (userContextId, privateBrowsingId, **top-level site**); cookies domain/path-matched against the request or document host → effective key (top site, request site). The child gets only the cookies its own host may see. |
| **B2** HttpOnly / attributes dropped | Full records (Domain/host-only, Path, Secure, HttpOnly, SameSite, Expires/Max-Age, `__Secure-`/`__Host-`, 4096-byte limit, 180/host). HttpOnly values never reach a content process; script cannot set or overwrite them. SameSite Strict/Lax withheld cross-site (Lax allowed on top-level safe navigations). |
| `credentials:'omit'` leak | `LOAD_ANONYMOUS` channels get no sandbox Cookie header and do not ingest Set-Cookie (header still stripped). |
| No 3P partitioning | Same third party under two top sites sees two unrelated jars (TCP-style). |
| **N1** hook once per tab | Hooks keyed by document; installed on every document with an http(s) principal (incl. about:blank / srcdoc / blob:) at `DOMWindowCreated`, plus `DOMDocElementInserted` for documents that reuse an initial about:blank inner window. |
| Mirror staleness | Process-wide child cache per (partition, host); parent pushes per-cookie deltas on Set-Cookie and on writes from other processes before the response reaches content. |

Synthetic tokens are computed once at write time from (seed, top site, cookie site, name) and stored, so HTTP and script see the same value and no two partitions share a token, even under the golden lock.

**Why not Gecko CookieService with a darkstr partition:** chrome JS can only `add()`/`getCookiesFromHost()` by OriginAttributes; the header path and `document.cookie` always use the channel/document OA, and added cookies persist to `cookies.sqlite` and session restore. A real (top, request) partition there needs C++ in `netwerk/cookie` + IPC — kept in JS for 0048.

**Residuals (named, not fixed here):** `ServiceWorkerGlobalScope.cookieStore` is not sandboxed; own-property `document.cookie` descriptor / function `toString` shape is a persona-surface item for **0051**; allowlisted top sites use the real jar by design. Behavioural note: the sandbox keeps partitioned 3P cookies without a `Partitioned` attribute, where LibreWolf's real jar (`cookieBehavior.optInPartitioning`) rejects them.

## Why it might help

- Separates **“we accept cookies” UX** from **identity persistence**.
- Firewall language is easier for Settings/PM than “fake jar.”
- Builds on stock Gecko partitioning (CHIPS, tracking protection) instead of replacing it blindly.

## Hard parts (residuals)

1. **First-party login** — allowlist must be right or auth breaks.
2. **CookieService race** — closed for HTTP: `nsHttpChannel::ProcessResponse` runs `http-on-examine-response` before `SetCookieHeaders`, so the strip wins (0048 harness: real profile jar empty for test hosts while armed).
2b. **Outbound Cookie empty (0035 soft)** — fixed in **0042**: QI `nsIHttpChannel` before `setRequestHeader`; surface errors (was silent catch).
3. **Detectability** — synthetic values that ignore `Set-Cookie` semantics are an FP signal (honesty: not anti-detect).
4. **CHIPS / Storage Access API** — stock Firefox already partitions; disagreeing filters are worse than none.
5. **Honesty copy** — Settings must say isolate/filter, not “we don’t use cookies.”

## Out of scope for 0035

- Native-Compatible privacy-pane UI (PM)
- Approach A FFI / full dual-jar C++ CookieService
- Claiming Cloudflare / anti-detect bypass
