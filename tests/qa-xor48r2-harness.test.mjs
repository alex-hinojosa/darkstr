/**
 * Proof's 0048r2 cookie-firewall XOR harness (qa/xor48r2): follow-ups after the r2 PASS.
 *  - the hook detector accepts the post-0051 prototype shape (chrome census), not only 0048's own accessor;
 *  - a real-LAN-IP F1 stress option (XOR_LAN=auto, XOR_F1_LAN_ONLY=1) with lsof judged on the remote peer.
 * The browser runs are manual (macOS + a darkstr build); this test runs the offline Python self-test and checks
 * the harness wiring statically.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const QA = join(dirname(fileURLToPath(import.meta.url)), "..", "qa", "xor48r2");
const read = (f) => readFileSync(join(QA, f), "utf8");

function python() {
  for (const bin of ["python3", "python"]) {
    const r = spawnSync(bin, ["-c", "import sys; print(sys.version_info >= (3, 9))"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim() === "True") return bin;
  }
  return null;
}

test("xor48r2 helper self-test (hook states, census, lsof peer classes)", (t) => {
  const py = python();
  if (!py) {
    t.skip("python3 >= 3.9 not available");
    return;
  }
  const r = spawnSync(py, [join(QA, "selftest_xor48r2.py")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /OK/);
});

test("graders use the shape-agnostic hook detector, not the own-accessor string", () => {
  const g = read("grade48r2.py");
  assert.match(g, /from grade48r2_hooks import/);
  assert.doesNotMatch(g, /== 'get cookie'/, "no remaining own-accessor-only comparisons");
  for (const k of ["5_N1", "6_frames", "N1_extended", "frames_extended"]) assert.ok(g.includes(`'${k}'`), k);
  assert.match(g, /no document sandboxed by the firewall \(chrome census/);
  // Proof #83 F2: census-run aware hook states; default check needs a census (no `else True`).
  assert.match(g, /CR = has_census\(C\)/);
  assert.doesNotMatch(g, /if has_census\(C\) else True/);
  assert.match(g, /no_firewall_sandbox\(C\)/);
  const calls = (g.match(/hook_state\(/g) || []).length;
  assert.ok(calls >= 7);
  assert.equal((g.match(/, CR\)/g) || []).length, calls, "every hook_state call passes census_run=CR");
  assert.match(read("grade48r2_hooks.py"), /if not isinstance\(census, list\): return 'unknown'$/m);
  // #83 follow-up (d): a run with no census anywhere is 'unknown', never 'none'
  assert.doesNotMatch(read("grade48r2_hooks.py"), /return 'unknown' if census_run else 'none'/);
  assert.match(read("grade48r2_hooks.py"), /^UNHOOKED = \('native',\)/m);
  // Proof #83 F1: armed F1 PASS gated on census + hooked states.
  const f1g = read("grade48f1.py");
  assert.match(f1g, /hooks_ok = \(census_all and set\(states\) <= set\(HOOKED\)\) if armed else set\(states\) <= set\(UNHOOKED\)/);
  assert.match(f1g, /r\['PASS'\] = \(hooks_ok and /);
  assert.match(read("grade48f1.py"), /from grade48r2_hooks import HOOKED, UNHOOKED, hook_state, top_doc/);
});

test("harness attaches a chrome census from the firewall's live actors to page steps", () => {
  const h = read("xor48r2.py");
  assert.match(h, /DarkstrCookieFirewall\.sys\.mjs/);
  assert.match(h, /_liveActors/);
  assert.match(h, /r\['__census'\] = s\.census\(\)/);
  assert.match(h, /XOR_CENSUS/);
});

test("real-LAN-IP F1 option: auto LAN, LAN-only docs, preflight, remote-peer lsof, foreign clients refused", () => {
  const h = read("xor48r2.py");
  assert.match(h, /if LAN == 'auto': LAN = _auto_lan\(\)/);
  assert.match(h, /_s\.bind\(\(LAN, 0\)\)/, "LAN must be this host's own address");
  assert.match(h, /XOR_F1_LAN_ONLY/);
  assert.match(h, /origins = \[D\]/);
  assert.match(h, /f1LanPreflight/);
  assert.match(h, /_net\.lsof_peer_class/);
  assert.doesNotMatch(h, /LAN \+ ':' if LAN else '127\.0\.0\.1'/, "old substring lsof filter removed");
  assert.match(h, /def _foreign\(self\)/);
  const f1 = read("grade48f1.py");
  assert.match(f1, /iterationsOnRealLanOrigin/);
  assert.match(f1, /not lanReal or r\['lan'\]\['iterationsOnRealLanOrigin'\] > 0/);
});

test("sandbox profile stays loopback-only", () => {
  const sb = read("noext.sb");
  assert.match(sb, /\(deny network-outbound\)/);
  assert.match(sb, /\(allow network-outbound \(remote ip "localhost:\*"\)\)/);
  assert.doesNotMatch(sb, /remote ip "\*:/);
});
