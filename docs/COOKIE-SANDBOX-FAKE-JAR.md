# Cookie sandbox / firewall

**Brand:** darkstr — not official LibreWolf.  
**Status:** **0035 MVP MERGED** (Phase 5). **0042** (outbound `/echo` Cookie QI) MERGED. **0048** correctness (Rowan QA B1/B2/N1, omit, 3P partitioning, mirror staleness) in review; **0048r2** respin after Proof FAILED `f3f1e748` (F1 ordering, F2 A-B-A / foreign-ancestor partitioning, F3 native C++ gate, check 4 = reject unpartitioned 3P) — see [0048](#0048-correctness) and [0048r2](#0048r2-respin). Prior art: backlog one-pager (PR #34, 2026-09-16).

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

**Residuals (named, not fixed here):** own-property `document.cookie` descriptor / function `toString` shape is a persona-surface item for **0051**; allowlisted top sites use the real jar by design. (The 0048 note that the sandbox kept unpartitioned 3P cookies is superseded by 0048r2 check 4.)

## 0048r2 respin

Proof FAILED `f3f1e748` (PR #79) on three new findings; evidence `~/AgentDocs/proof/darkstr-0048-xor-20261008-174506/`. Additional patches: [`patches/0048r2-cookie-firewall-respin.patch`](../patches/0048r2-cookie-firewall-respin.patch) (JS, old 0048 → r2) and [`patches/0048r2-cookie-firewall-native-gate.patch`](../patches/0048r2-cookie-firewall-native-gate.patch) (C++). The apply helper detects baseline / 0048 v1 / r2 and the C++ gate state.

| Finding | Fix |
|---------|-----|
| **F1** Set-Cookie from a `fetch()` response sometimes missing from `document.cookie` at resolve (~1.5 s late) | `http-on-examine-response` collects the deltas; the parent sends them with `sendQuery` to every live actor in the partition **plus the requesting document's actor**, and **suspends the channel** until all acks arrive (2 s safety timeout, counted in `_ackStats`). The child applies the delta to the process cache before it acks, so the cache is updated before the response body reaches the page. |
| **F2** A-B-A: cross-site frame's credentialed no-cors fetch carried the top site's cookies (incl. HttpOnly); nested same-site frame saw top cookies | Gecko TCP model: partition key = (OA, scheme, top site, **foreign-ancestor bit**). Context kind is `1p` / `3p` / `3pf` (any cross-site frame in the ancestor chain ⇒ third party, A-in-B-in-A ⇒ `3pf`). Buckets: `u` (unpartitioned, 1p only), `p` (CHIPS partition), `pf` (foreign-ancestor partition). 1p reads `u`+`p`; 3p reads `p`; 3pf reads `pf`. A subresource request from a third-party context gets that context's partition and never top-site `u` cookies. SameSite is enforced against the initiator, its context, every ancestor and the top (cross-site if any differs). |
| **Check 4** sandbox accepted unpartitioned 3P cookies | Match stock LibreWolf (`network.cookie.cookieBehavior.optInPartitioning=true`): a third-party Set-Cookie (HTTP or script) without `Partitioned` is rejected; `Partitioned` requires `Secure`. With optInPartitioning off, 3P cookies go to the partition, as in stock. |
| **F3** page script reached the real cookie store via the native `Document.prototype.cookie` accessor (any realm) or `CookieStore.prototype.set` | C++ gate, opt-in: static pref `darkstr.cookieFirewall.contentGate` (default **false**; set only on the default branch by the parent while armed). When on, `CookieCommons::CheckGlobalAndRetrieveCookiePrincipals` (used by `Document::GetCookie`/`SetCookie` incl. `document.open` documents, and `CookieStore` get/set/delete in every realm) asks the content-process observer `darkstr-cookie-gate` per inner window. Only an explicit `passthrough` decision (allowlisted top site) reaches CookieServiceChild; every other answer, or no answer, fails closed (native getter returns `""`, setter and CookieStore are no-ops). Worker `cookieStore` fails closed whenever the gate is on. `CookieStoreNotifier` change events are suppressed for gated windows. The firewall's own hooks never call the native accessor. |

**Residuals (r2):** worker/ServiceWorker `cookieStore` fails closed even on allowlisted sites while armed (no sandbox view there); chrome/extension Xray reads of `document.cookie` on a gated window return `""` while armed; the F1 ack has a 2 s timeout (counted, not hit in the harness), so a hung content process delays the response by at most 2 s.


## Why it might help

- Separates **“we accept cookies” UX** from **identity persistence**.
- Firewall language is easier for Settings/PM than “fake jar.”
- Builds on stock Gecko partitioning (CHIPS, tracking protection) instead of replacing it blindly.

## Hard parts (residuals)

1. **First-party login** — allowlist must be right or auth breaks.
2. **CookieService race** — closed for HTTP (and for page script by the 0048r2 C++ gate): `nsHttpChannel::ProcessResponse` runs `http-on-examine-response` before `SetCookieHeaders`, so the strip wins (0048 harness: real profile jar empty for test hosts while armed).
2b. **Outbound Cookie empty (0035 soft)** — fixed in **0042**: QI `nsIHttpChannel` before `setRequestHeader`; surface errors (was silent catch).
3. **Detectability** — synthetic values that ignore `Set-Cookie` semantics are an FP signal (honesty: not anti-detect).
4. **CHIPS / Storage Access API** — stock Firefox already partitions; disagreeing filters are worse than none.
5. **Honesty copy** — Settings must say isolate/filter, not “we don’t use cookies.”

## Out of scope for 0035

- Native-Compatible privacy-pane UI (PM)
- Approach A FFI / full dual-jar C++ CookieService
- Claiming Cloudflare / anti-detect bypass
