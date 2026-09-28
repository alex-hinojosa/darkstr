import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("duppel-ffi crate and header exist", () => {
  assert.ok(existsSync(join(root, "crates/duppel-ffi/src/lib.rs")));
  assert.ok(existsSync(join(root, "crates/duppel-ffi/darkstr_ffi.h")));
  const lib = readFileSync(join(root, "crates/duppel-ffi/src/lib.rs"), "utf8");
  assert.match(lib, /darkstr_ffi_persona_snapshot_json/);
});

test("0008 gecko FFI link patch is a real unified diff (Approach B)", () => {
  const patchPath = join(root, "patches/0008-darkstr-gecko-ffi-link.patch");
  assert.ok(existsSync(patchPath));
  const patch = readFileSync(patchPath, "utf8");
  assert.match(patch, /^diff /m);
  assert.match(patch, /DarkstrFfi\.sys\.mjs/);
  assert.match(patch, /_readSnapshotFromFfi/);
  assert.match(patch, /third_party\/darkstr/);
  assert.match(patch, /darkstr_ffi_persona_snapshot_json/);
  assert.match(patch, /Approach B/);
  assert.ok(patch.length > 8000, "0008 patch should be substantial");
  assert.ok(!patch.trimStart().startsWith("# Stub only"));
});

test("apply script has 0008 content markers and rebuild footer", () => {
  const sh = readFileSync(
    join(root, "patches/scripts/apply-darkstr-patches.sh"),
    "utf8"
  );
  assert.match(sh, /0008-darkstr-gecko-ffi-link\.patch/);
  assert.match(sh, /_readSnapshotFromFfi/);
  assert.match(sh, /DarkstrFfi\.sys\.mjs/);
  assert.match(sh, /build-and-install-ffi\.sh/);
  assert.match(sh, /mach build browser\/components/);
});

test("M-FFI-0008-STATUS honesty table present", () => {
  const status = readFileSync(join(root, "docs/M-FFI-0008-STATUS.md"), "utf8");
  assert.match(status, /Approach B/);
  assert.match(status, /nativePersonaHooks/);
  assert.match(status, /Not claimed|blocked|No/i);
  assert.ok(existsSync(join(root, "docs/M-FFI-STATUS.md")));
});

test("0008 stub demoted to breadcrumb", () => {
  const stub = readFileSync(
    join(root, "patches/stubs/0008-darkstr-gecko-ffi-link.stub"),
    "utf8"
  );
  assert.match(stub, /DEMOTED|superseded|real train-pinned/i);
});

test("control-plane crates still forbid unsafe", () => {
  for (const name of ["duppel-persona", "duppel-bridge", "duppel-chaff", "duppel-coherence"]) {
    const lib = readFileSync(join(root, `crates/${name}/src/lib.rs`), "utf8");
    assert.match(lib, /forbid\(unsafe_code\)/, name);
  }
});

test("0041 retires Approach B runtime load (A-only)", () => {
  const patchPath = join(root, "patches/0041-darkstr-ffi-retire-approach-b.patch");
  assert.ok(existsSync(patchPath));
  const patch = readFileSync(patchPath, "utf8");
  assert.match(patch, /^diff /m);
  assert.match(patch, /0041: Retire B/);
  assert.match(patch, /Approach A \(only runtime path\)/);
  assert.match(patch, /cdylibCandidates/);
  assert.ok(existsSync(join(root, "patches/0041-files/DarkstrFfi.sys.mjs")));
  const sot = readFileSync(join(root, "patches/0041-files/DarkstrFfi.sys.mjs"), "utf8");
  assert.match(sot, /0041: Retire B/);
  assert.match(sot, /only runtime path/);
  assert.doesNotMatch(sot, /cdylibCandidates/);
  assert.doesNotMatch(sot, /kind: "cdylib"/);
  assert.match(sot, /soft-fail → JS mulberry|JS seed/);
  const status = readFileSync(join(root, "docs/M-FFI-0041-STATUS.md"), "utf8");
  assert.match(status, /Retire Approach B/);
  assert.match(status, /nativePersonaHooks/);
  assert.match(status, /Still false|default-off/i);
  const sh = readFileSync(join(root, "patches/scripts/apply-darkstr-patches.sh"), "utf8");
  assert.match(sh, /0041-darkstr-ffi-retire-approach-b\.patch/);
  assert.match(sh, /004\*\.patch/);
  const install = readFileSync(join(root, "docs/PHASE-4-FFI-MINI-INSTALL.sh"), "utf8");
  assert.match(install, /RETIRED for product|DARKSTR_FFI_ALLOW_B_INSTALL/);
  // Crate may still declare cdylib for unit tests
  const cargo = readFileSync(join(root, "crates/duppel-ffi/Cargo.toml"), "utf8");
  assert.match(cargo, /cdylib/);
});

