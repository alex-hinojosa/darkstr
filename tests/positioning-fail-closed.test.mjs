import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkPositioning,
  stripAllowlist,
} from "../scripts/check-positioning.mjs";

test("extension UI passes positioning fail-closed scan", () => {
  const result = checkPositioning();
  assert.equal(
    result.ok,
    true,
    result.violations
      .map((v) => `${v.file}:${v.line} [${v.id}] ${v.text}`)
      .join("\n")
  );
  assert.ok(result.scanned >= 5, "expected to scan popup/settings/first-run/manifest");
});

test("allowlist keeps honest not-bypass / not-anti-detect copy", () => {
  const okLines = [
    "It is not an anti-detect browser.",
    "It is <strong>not</strong> an anti-detect browser.",
    "It is <strong>not</strong> a Cloudflare bypass.",
    "not anti-detect · not Cloudflare bypass",
    "Not a Cloudflare bypass",
    "It is not a Cloudflare bypass.",
    "Not a Cloudflare-defeat switch.",
    "not a Cloudflare-defeat switch",
  ];
  for (const line of okLines) {
    const stripped = stripAllowlist(line);
    assert.doesNotMatch(stripped, /\banti[- ]?detect\b/i, line);
    assert.doesNotMatch(
      stripped,
      /\bcloudflare\b.{0,40}\b(bypass|defeat)\b/i,
      line
    );
  }
});

test("scanner fails banned chrome-prefs, crates, and capability claims", () => {
  const dir = mkdtempSync(join(tmpdir(), "darkstr-pos-"));
  try {
    const samples = [
      {
        name: "bad-chrome.html",
        body: '<button>Open chrome-prefs panel</button>\n',
        id: "chrome-prefs-label",
      },
      {
        name: "bad-chrome2.html",
        body: "<h2>Chrome prefs (Phase 2)</h2>\n",
        id: "chrome-prefs-label",
      },
      {
        name: "bad-crates.js",
        body:
          'html: "<strong>Homogeneous implications</strong> Rust crates idle."\n',
        id: "crates-in-ui",
      },
      {
        name: "bad-anti.html",
        body: "<p>darkstr is an anti-detect browser</p>\n",
        id: "anti-detect-marketing",
      },
      {
        name: "bad-cf.html",
        body: "<p>Beats Cloudflare Turnstile</p>\n",
        id: "cloudflare-bypass-claim",
      },
    ];
    const files = [];
    for (const s of samples) {
      const p = join(dir, s.name);
      writeFileSync(p, s.body);
      files.push(p);
    }
    const result = checkPositioning(files);
    assert.equal(result.ok, false);
    const ids = new Set(result.violations.map((v) => v.id));
    for (const s of samples) {
      assert.ok(ids.has(s.id), `expected ban id ${s.id}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
