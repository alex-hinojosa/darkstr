# Cookie sandbox / firewall (backlog)

**Brand:** darkstr — not official LibreWolf.  
**Status:** unvalidated future idea. Not Phase 2. Soft product note only.

## Idea

Treat cookies like traffic behind a **firewall**:

1. **Sandbox jar** — accepted cookies land in an isolated store (not the user’s primary identity jar), partitioned by site / party where possible.
2. **Filter** — a policy engine on the path in (`Set-Cookie`) and out (`Cookie` request header, `document.cookie`, Cookie Store) that **allow / deny / rewrite** (including synthetic values).

Same mental model as a network firewall: default-deny or default-isolate, with explicit allow rules for first-party sessions you actually want.

## Firewall filter (strawman)

| Direction | Hook | Actions |
|-----------|------|---------|
| Inbound | `Set-Cookie` / Cookie Store write | accept → sandbox jar; drop; rewrite name/value/flags; tag party (1P / 3P) |
| Outbound | `Cookie` request header | attach real; attach synthetic; strip; allowlist host/path only |
| Script | `document.cookie` / CookieStore | read/write through the same policy so HTTP and JS stay consistent |

Example rules (not shipped):

- `3P → deny outbound` (tracker cookies never leave the sandbox).
- `1P allowlist (banks, accounts) → real jar`.
- `unknown 1P → sandbox only; script sees synthetic round-trip`.
- `Rewrite-Value → random/stable-per-session token` when the site only checks “did storage stick?”

## What “works” means

| Layer | Behavior |
|-------|----------|
| Network `Set-Cookie` | Accepted into **sandbox jar** (or dropped) per filter — not silently mixed into the primary profile jar. |
| Network `Cookie` | Filter decides real / synthetic / empty before the request leaves. |
| `document.cookie` / Cookie Store | Same filter — no split-brain between script and network. |

## Why it might help

- Separates **“we accept cookies” UX** from **identity persistence**.
- Firewall language is easier for Settings/PM than “fake jar.”
- Builds on stock Gecko partitioning (CHIPS, tracking protection) instead of replacing it blindly.

## Hard parts (why it might not)

1. **First-party login** — allowlist must be right or auth breaks.
2. **Consistency** — HTTP, `document.cookie`, CookieStore, service workers must share one policy.
3. **Detectability** — synthetic values that ignore `Set-Cookie` semantics are an FP signal.
4. **CHIPS / Storage Access API** — stock Firefox already partitions; a second filter that disagrees is worse than none.
5. **Honesty copy** — Settings must say isolate/filter, not “we don’t use cookies” if we accept into a sandbox.

## Modes (not shipped)

- **Isolate only** — sandbox + deny outbound for 3P; no synthetic bytes.
- **Firewall + synthetic** — filter rewrites/feeds random data where policy says so.
- **Hybrid allowlist** — real jar for named first parties; everyone else sandboxed/filtered.

## Out of scope for now

- Implementation, prefs, or default-on behavior.
- Claiming this closes any current Phase 2 soft residual.

## Next when prioritized

1. PM: mode names + honesty strings (“cookie firewall” / isolate vs allowlist).
2. Spike on train-pinned Gecko: filter on `Set-Cookie` + outbound `Cookie` + `document.cookie`.
3. Proof: allowlisted login works; tracker outbound stays empty/synthetic; no HTTP/JS split-brain.
