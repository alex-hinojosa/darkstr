# qa/xor55r2: Proof's 0055r2 graders (r2adapt), ported

Since 0055r2 a persona's `userAgent` **equals** the real engine UA (`Firefox/140.0`, no RFP UA), so "UA != real UA"
cannot detect an applied persona any more. Proof's r2adapt graders instead compare
`(platform, hardwareConcurrency, languages, timezone)` with the host's native tuple. This folder ports them.

| file | from Proof | usage |
|---|---|---|
| `persona_presence.py` | the inline `NATIVE_T` / `APPLIED` in each r2adapt grader | imported |
| `grade49x.py` | `harness/r2adapt/grade49x.py` (0049 window/worker XOR) | `grade49x.py <rundir> <rundir>/default.json` → `GRADE.json/.txt` |
| `grade51x.py` | `harness/r2adapt/grade51x.py` (0051 prototype XOR) | `grade51x.py <rundir> [default.json]` → `GRADE.json/.txt` |
| `grade51pop.py` | `harness/r2adapt/grade51pop.py` (0051 popup/opener) | `grade51pop.py <rundir>` (reads `pop_*.json`) → `GRADEPOP.json/.txt` |

The source is `~/AgentDocs/proof/darkstr-0055r2-xor-20261009-085907/harness/r2adapt/`; see `PROVENANCE.sha256` for the hashes of the
copied files. The **only** change is that `NATIVE_T` / `APPLIED` now live in `persona_presence.py`. The grading logic, check names and output format are the same as Proof's.

## Native tuple
`APPLIED(nav)` is true when the record differs from the native tuple in **any** of the four fields. One differing
field is enough, because some personas differ from the host in only one field. The native tuple is what a
**persona-less document under Pollution** shows on the grading host (RFP/FPP off, so these are real values):

1. `XOR_NATIVE_TUPLE='["MacIntel",12,["en-US","en"],"America/Chicago"]'` (JSON), or
2. by default, the Mac Mini values Proof graded with. Each grader prints the source on stderr and warns when it uses this default.

The native tuple is deliberately **not** taken from the `default` config run: that run has LibreWolf's RFP on
(on the Mini: 8 cores, `Atlantic/Reykjavik`). A persona-less Pollution document differs from those values, so it would wrongly count as applied.

## Verified
Re-grading Proof's raw runs (`grade/reg/{w49r2,w49swr2,p51r2,p51swr2,pop51r2,pop51swr2}`, copied to /tmp) with
these graders reproduces Proof's `GRADE.json` / `GRADEPOP.json` **byte for byte**.

`python3 qa/xor55r2/selftest_xor55r2.py` (offline); `tests/qa-xor55r2-graders.test.mjs` runs it plus static checks.

## 0058r2 (Proof #92): the popup grader no longer reads "UA changed"

Proof's 0058r2 x51pop run used the 0051-era `h51/x51 grade51pop.py`. Its two armed "(UA != real 156)" checks fail by design, because the persona keeps the native UA. Use **this** `grade51pop.py` instead. Every armed or applied check here, in all three graders, is named and decided by the persona tuple: languages, hardwareConcurrency, timezone and platform != the native tuple. `persona_presence.describe()` gives each one's detail: the tuple, the native tuple, and the fields that differ. Only default-config checks still compare the UA (expected: plain 156).

Checked on a copy of Proof's `raw/s0058r2/x51pop` (pop_armed / armedH / default):
- **Before** (Proof's stale grader): 133/2, 133/2, 134/0.
- **After** (this grader): 135/0, 135/0, 134/0.
- **Negative control** (`XOR_NATIVE_TUPLE` set to the armed opener's own tuple): the opener armed check FAILs.
