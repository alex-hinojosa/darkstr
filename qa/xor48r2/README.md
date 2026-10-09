# qa/xor48r2 — Proof's 0048r2 cookie-firewall XOR harness (+ r2 follow-ups)

Imported from Proof's PASS run of PR #79 (`~/AgentDocs/proof/darkstr-0048r2-xor-20261008-204607/harness/`), with two follow-ups Proof asked for.

| file | |
|---|---|
| `xor48r2.py` | harness (Marionette, disposable profile, local fixture on localhost / 127.0.0.1 / [::1] / LAN) |
| `grade48r2.py` | main grader: 9 checks + indep; `python3 grade48r2.py <rawdir>` |
| `grade48f1.py` | F1 stress grader: `python3 grade48f1.py <rawdir>` (reads `f1_*.json`) |
| `grade48r2_hooks.py` | shared cookie-hook detector (no side effects) |
| `xor48r2_net.py` | lsof peer classification (no side effects) |
| `selftest_xor48r2.py` | offline self-test, run by `npm test` (`tests/qa-xor48r2-harness.test.mjs`) |
| `noext.sb` | Seatbelt profile: outbound only to localhost + unix sockets, mDNSResponder denied |

## Follow-up 1: hook detector accepts the post-0051 prototype shape
- 0048 alone hooks `document.cookie` with an **own** accessor on each document (`hk()` → `'get cookie'`).
- From 0051 (N4) the hook replaces the **`Document.prototype`** accessor with a native-shaped one. Measured on 0048r2-d61d5b3f vs 0050r2-19f6454d (default / A_iso / A_syn / S_syn42): name, length, `[native code]` toString, own property names, `[[Prototype]]`, and the TypeError text and realm for foreign receivers are **identical to stock**. Page script cannot tell hooked from native (by design).
- So every page step now carries a chrome **census** (`__census`): each frame of the tab with `sandboxed` = its actor is in `DarkstrCookieFirewall._liveActors`. `grade48r2_hooks.hook_state()` maps (own accessor, census) → `own` | `proto` | `native` | `none` (legacy raw without census → old semantics). Checks 5 (N1), 6 (frames), N1_extended and frames_extended accept `own` or `proto` as hooked. In the default config the grader also asserts that no document was sandboxed. `XOR_CENSUS=0` turns the census off.
- Census caveat: it is taken when the step finishes. In SOFRAME, `soHook`/`soAsk` are judged on the same-origin frame's final document (`/frame?t=so-nav2`).

## Follow-up 2: real-LAN-IP F1 stress
- `XOR_LAN=auto` uses the IPv4 of the default-route interface. It must be bindable, i.e. this Mac's own address.
- `XOR_F1=<docs> XOR_F1_LAN_ONLY=1` puts every F1 document on `http://<LAN>:<port>`. Without `XOR_F1_LAN_ONLY` the LAN origin is rotated with 127.0.0.1 / [::1] / localhost as before. A preflight navigation must reach the fixture over the LAN origin, otherwise the run errors.
- **Seatbelt:** the profile's `localhost` rule also matches the host's **own interface addresses**. Checked with curl: own 10.0.0.x reachable, gateway 10.0.0.1 and 1.1.1.1 blocked. So the real-LAN-IP stress runs **inside** the loopback-only sandbox, and other LAN hosts and the internet stay unreachable.
- **lsof:** classification is now on the **remote** endpoint (`xor48r2_net.lsof_peer_class`). The old substring filter also matched the LAN IP on the *local* side, so it would have hidden a LAN-sourced external connection. Peers to the own LAN IP are counted as `samplesWithLanSelf`.
- **Fixture:** it binds `::` (all interfaces) and now answers only this host (loopback / own LAN IP). Other clients get 403 and are logged as `rejectedClient`.
- `grade48f1.py` reports per-origin iteration counts and `lan.iterationsOnRealLanOrigin`. A real-LAN run only PASSes if that is > 0.

## Proof r3 fixes (PR #83 review)
- **F2: a missing census FAILs.** `hook_state(own, census, pick, census_run)`: once the run recorded a census (`has_census`), a step whose `__census` is missing or `{err}` is `'unknown'`, never hooked or unhooked, so checks 5/6/N1_extended/frames_extended FAIL on it. Legacy raw without any census keeps the old semantics. The default config check no longer has `else True`: it requires a census, and none of its documents may be sandboxed (`no_firewall_sandbox`).
- **F1: armed F1 PASS needs the hook gate.** `grade48f1.grade_f1()`: in armed configs every iteration's hook state must be in {own, proto} **and** carry a census (`hookGate`). An all-`native` census or a dropped census FAILs. Unarmed configs still require {native, none}.
- Negative self-tests: `ProofF2MissingCensus`, `ProofF1HookGate` in `selftest_xor48r2.py`, plus static asserts in `tests/qa-xor48r2-harness.test.mjs`.

## Run (macOS; build mounted read-only and copied out of the DMG; never /Applications)
```sh
export XOR_BIN=/path/to/darkstr.app/Contents/MacOS/librewolf XOR_SB=$PWD/qa/xor48r2/noext.sb
python3 qa/xor48r2/xor48r2.py A_iso /tmp/xor48/main          # configs: default A_iso A_syn A_iso42 A_syn42 S_iso S_syn S_iso42 S_syn42 A_iso_allow
python3 qa/xor48r2/grade48r2.py /tmp/xor48/main
XOR_LAN=auto XOR_F1=40 XOR_F1_LAN_ONLY=1 XOR_TAG=f1_A_iso python3 qa/xor48r2/xor48r2.py A_iso /tmp/xor48/f1lan
python3 qa/xor48r2/grade48f1.py /tmp/xor48/f1lan
```
