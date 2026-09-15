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
