# Cookie sandbox / fake jar (backlog)

**Brand:** darkstr — not official LibreWolf.  
**Status:** unvalidated future idea. Not Phase 2. Soft product note only.

## Idea

Accept cookies (so sites that require “cookie consent / storage worked” don’t hard-fail), but **isolate** them from the user’s real cookie jar and optionally **feed scripts synthetic / random cookie data** instead of real values.

## What “works” means

| Layer | Behavior |
|-------|----------|
| Network `Set-Cookie` | Accepted into a **sandboxed / partitioned jar**, not the primary profile jar (or never re-attached to third parties). |
| Network `Cookie` request header | Real jar for first-party sessions you intend to keep; synthetic or empty for trackers / cross-site. |
| `document.cookie` / Cookie Store API | Consistent with the policy above — scripts must not see real third-party IDs if the jar is faked. |

## Why it might help

- Sites often only check “did `document.cookie` round-trip?” — synthetic bytes can satisfy that without leaking identity.
- Separates **UX “accept cookies”** from **identity persistence**.
- Overlaps stock Gecko work (partitioned cookies / CHIPS, tracking protection) — darkstr would be the stricter “fake jar” productization.

## Hard parts (why it might not)

1. **First-party login** — banking, Google, etc. need a real jar or auth breaks.
2. **Consistency** — HTTP cookies, `document.cookie`, CookieStore, and service workers must agree.
3. **Detectability** — random/synthetic values that don’t match `Set-Cookie` semantics are an FP signal.
4. **CHIPS / Storage Access API** — stock Firefox already partitions; duplicating poorly creates worse fingerprints.
5. **Legal/UX copy** — “we accept cookies” while serving fakes needs honest Settings language (PM).

## Strawman modes (not shipped)

- **Isolate only** — accept into partitioned storage; never fake bytes.
- **Fake to scripts** — `document.cookie` returns synthetic; network may still be empty/partitioned.
- **Hybrid** — real jar allowlist (first-party sessions); everyone else sandboxed or synthetic.

## Out of scope for now

- Implementation, prefs, or default-on behavior.
- Claiming this closes any current Phase 2 soft residual.

## Next when prioritized

1. PM honesty copy + mode names.
2. Spike: partitioned jar vs synthetic `document.cookie` on one train-pinned Gecko build.
3. Proof: first-party login still works on allowlisted hosts; tracker jar stays empty/synthetic.
