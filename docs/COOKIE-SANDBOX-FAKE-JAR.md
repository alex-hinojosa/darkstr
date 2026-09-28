# Cookie sandbox / firewall

**Brand:** darkstr — not official LibreWolf.  
**Status:** **0035 MVP MERGED** (Phase 5). Soft residual **0042** (outbound `/echo` Cookie QI) in-flight. Prior art: backlog one-pager (PR #34, 2026-09-16).

## Idea

Treat cookies like traffic behind a **firewall**:

1. **Sandbox jar** — accepted cookies land in an isolated store (not the user’s primary identity jar), partitioned by eTLD+1.
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

**Shared policy:** `DarkstrCookieFirewall.sys.mjs` is SoT — HTTP observers and script IPC share one `Map`. No HTTP/JS split-brain.

See [`PHASE-5-STATUS.md`](PHASE-5-STATUS.md) for Proof gates and residuals.

## Why it might help

- Separates **“we accept cookies” UX** from **identity persistence**.
- Firewall language is easier for Settings/PM than “fake jar.”
- Builds on stock Gecko partitioning (CHIPS, tracking protection) instead of replacing it blindly.

## Hard parts (residuals)

1. **First-party login** — allowlist must be right or auth breaks.
2. **CookieService race** — chrome header strip may lose a race; C++ dual-jar follow-up if needed.
2b. **Outbound Cookie empty (0035 soft)** — fixed in **0042**: QI `nsIHttpChannel` before `setRequestHeader`; surface errors (was silent catch).
3. **Detectability** — synthetic values that ignore `Set-Cookie` semantics are an FP signal (honesty: not anti-detect).
4. **CHIPS / Storage Access API** — stock Firefox already partitions; disagreeing filters are worse than none.
5. **Honesty copy** — Settings must say isolate/filter, not “we don’t use cookies.”

## Out of scope for 0035

- Native-Compatible privacy-pane UI (PM)
- Approach A FFI / full dual-jar C++ CookieService
- Claiming Cloudflare / anti-detect bypass
