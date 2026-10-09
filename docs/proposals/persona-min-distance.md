# Proposal: minimum distance between a persona and the real host

Status: **proposal only**. No code or build. Written for the 0057 queue item (b), 2026-10-09.

## Problem
Since 0055 a persona's UA is the engine's real UA, and seeded personas are drawn for the **host OS**
(`generatePersonaFallback(seed, detectHostOs())` and `duppel_persona::generate_persona`). The platform therefore always equals
the host's. A persona is only visible through the fields that can still differ:

| field | table | size |
|---|---|---|
| `hardwareConcurrency` | `CORES` = 2, 4, 6, 8, 10, 12, 16 | 7 |
| `languages` (+ `Accept-Language`, `Intl` in all contexts) | `LANGUAGES` | 6 |
| timezone (`Intl`, `Date`, workers) | `TIMEZONES` | 8 |

The draws are independent and uniform, so for the Mac Mini (12 cores, `en-US,en`, America/Chicago) the 336 combinations are distributed like this:

| fields different from the host | share of seeds |
|---|---|
| 0: the persona *is* the host | 1/336 = **0.30 %** |
| 1 | 18/336 = **5.36 %** |
| 2 | 31.85 % |
| 3 | 62.50 % |

So about 1 seed in 18 gives a persona that differs from the real machine in one field or not at all. The 9:26 steering
saw these personas in practice. The cost is both privacy and QA:
- **Privacy:** a site sees the host's real cores, languages and TZ in 2 of the 3 fields. A distance-0 persona is
  indistinguishable from no persona at all.
- **QA:** the r2adapt graders (`qa/xor55r2/persona_presence.py`) need at least one differing field to see that a persona was applied.
  A distance-0 persona fails "applied" even though it was installed. A distance-1 persona depends on one field being read correctly.

## Proposal
Define `distance(persona, host)` as the number of the presence fields that differ:
`hardwareConcurrency`, `languages` (ordered list, compared like `navigator.languages`) and timezone. Platform is
included too, so the definition still works if non-host-OS personas ever return. That makes 0–4 fields; today at most 3 can differ.

**Rule: a seeded persona must have `distance >= 2`.** When a draw falls short, redraw deterministically:

```
persona(seed) = first d in [draw(seed), draw(H(seed, 1)), draw(H(seed, 2)), ...] with distance(d, host) >= 2
H(seed, i) = low 32 bits of SHA-256("darkstr-persona-redraw" || seed || i)   (cap: 8 attempts; then accept the best)
```

- `draw` is today's `generate_persona` / `generatePersonaFallback`, **unchanged**, so
  `fixtures/persona-goldens-0055.json` and the 1200-pair Rust==JS check stay valid. The redraw is a wrapper
  that lives in one place (NativePersona, chrome only). The Rust crate gets the same wrapper behind an explicit host argument, plus
  its own goldens with a fixed host tuple.
- The result is still deterministic per seed + host, so per-site seeds (0056 store, 0057 rotate) stay stable across restarts.
- With the cap at 8 attempts and a 5.66 % chance of `distance < 2`, fallthrough is about 1e-10. It is logged in diagnostics.

### Host tuple
Read in the parent, never from content, and never from the RFP view:
- cores: `Services.sysinfo.getProperty("cpucount")` (logical), the value an unpersonalized navigator reports.
- languages: what an unpersonalized document shows: `intl.accept_languages` resolved (the saved value that 0051/0053
  restore, not a Pollution-time value).
- TZ: the OS zone (`Intl.DateTimeFormat().resolvedOptions().timeZone` in the parent, with no persona override active).

It is computed once per session and cached. If a field cannot be read, that field does not count toward the distance (fail open toward fewer redraws).

### Operator-locked snapshots
A pasted `darkstr.persona.snapshot` is an explicit operator choice, so it is **never** redrawn. If its distance is below 2,
show a warning in the prefs pane and in diagnostics.

## Trade-off: leak by exclusion
Any rule that depends on the host makes the persona distribution depend on the host. An observer who collects **many**
personas from one user (cross-site collusion, or one site across many rotations) could look for under-represented
values. The size of that bias decides between the options:

| option | rule | P(TZ = host) among personas (uniform 12.5 %) | P(cores = host) (14.3 %) | P(langs = host) (16.7 %) |
|---|---|---|---|---|
| A: exclude host values | every field != host | **0 %**, so the host is revealed by absence | 0 % | 0 % |
| **B: distance >= 2 (proposed)** | at least 2 fields differ | 9.5 % | 11.0 % | 13.3 % |
| C: distance >= 1 | at least 1 field differs | 12.2 % | 14.0 % | 16.4 % |
| D: status quo | none | 12.5 % | 14.3 % | 16.7 % |

B leaves every host value possible, at about 3/4 of its uniform rate. Detecting that bias needs dozens of linked personas from
one user, and with that many linked personas the user is already re-identified by other means. A pays for its
guarantee with a clear leak, so it is rejected. C fixes only the distance-0 case.

**Recommendation: B**, plus a single diagnostic number (`distance`) in the persona diagnostics. The harness can then assert
`distance >= 2` instead of inferring it.

## Acceptance (for the implementing PR)
1. Unit: for a fixed host tuple, 10 000 seeds → every persona has distance >= 2; the redraw is deterministic; seeds whose
   first draw already has distance >= 2 return exactly today's persona (goldens unchanged).
2. Unit: Rust wrapper == JS wrapper for 400 seeds × 3 host tuples.
3. Live (Mini): armed + seed42 + per-site rotate. Every personalized document has `applied_fields` of length >= 2
   (`qa/xor55r2/persona_presence.py`). The first document stays native (strictFirstDoc, unchanged).
4. A locked snapshot with distance 0 is installed as pasted, and the pane warning is shown.
5. Off mode and Homogeneous: no host reads, no persona (unchanged).

## Open questions
- Should `languages` distance count only the primary tag (`en-US` vs `en-GB`)? It is the most visible signal (Accept-Language).
  The proposal compares the full ordered list, as the graders do.
- The prefs pane already shows the seed. Should it also show the distance?
