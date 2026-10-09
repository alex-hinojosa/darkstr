/**
 * Proof's 0055r2 r2adapt graders ported to qa/xor55r2: persona presence by (platform, cores, languages, TZ)
 * from a shared module (UA == real UA since 0055r2). Runs the offline self-test and checks the wiring.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const QA = join(dirname(fileURLToPath(import.meta.url)), "..", "qa", "xor55r2");
const read = (f) => readFileSync(join(QA, f), "utf8");

function python() {
  for (const bin of ["python3", "python"]) {
    const r = spawnSync(bin, ["-c", "import sys; print(sys.version_info >= (3, 9))"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim() === "True") return bin;
  }
  return null;
}

test("xor55r2 offline self-test", (t) => {
  const py = python();
  if (!py) return t.skip("python3 >= 3.9 not available");
  const r = spawnSync(py, [join(QA, "selftest_xor55r2.py")], { encoding: "utf8", env: { ...process.env, XOR_NATIVE_TUPLE: "" } });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stderr, /OK/);
});

test("graders share persona_presence and carry no inline Mini tuple", () => {
  for (const f of ["grade49x.py", "grade51x.py", "grade51pop.py"]) {
    const s = read(f);
    assert.match(s, /from persona_presence import APPLIED/, f);
    assert.doesNotMatch(s, /NATIVE_T = \('MacIntel'/, f);
    assert.match(s, /Ported from Proof's r2adapt/, f);
  }
  const pp = read("persona_presence.py");
  assert.match(pp, /XOR_NATIVE_TUPLE/);
  assert.doesNotMatch(pp, /def set_native_from_baseline/);
});

test("provenance lists the four r2adapt sources", () => {
  const p = read("PROVENANCE.sha256");
  for (const f of ["grade49x.py", "grade51x.py", "grade51pop.py", "mk.py"]) assert.match(p, new RegExp(`^[0-9a-f]{64}  ${f}$`, "m"));
});
