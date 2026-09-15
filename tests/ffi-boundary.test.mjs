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
  assert.match(lib, /Does \*\*not\*\* claim live Gecko/);
});

test("M-FFI-STATUS honesty: no live moz.build claim", () => {
  const status = readFileSync(join(root, "docs/M-FFI-STATUS.md"), "utf8");
  assert.match(status, /Not claimed/);
  assert.match(status, /duppel-ffi/);
  assert.ok(existsSync(join(root, "patches/stubs/0008-darkstr-gecko-ffi-link.stub")));
});

test("control-plane crates still forbid unsafe", () => {
  for (const name of ["duppel-persona", "duppel-bridge", "duppel-chaff", "duppel-coherence"]) {
    const lib = readFileSync(join(root, `crates/${name}/src/lib.rs`), "utf8");
    assert.match(lib, /forbid\(unsafe_code\)/, name);
  }
});
