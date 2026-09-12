import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rules = JSON.parse(
  readFileSync(join(root, "extension/rules/tracking.json"), "utf8")
);

test("static DNR rules never list ping (chaff sendBeacon guardrail)", () => {
  for (const rule of rules) {
    const types = (rule.condition && rule.condition.resourceTypes) || [];
    assert.ok(
      !types.includes("ping"),
      `rule ${rule.id} must not block ping`
    );
  }
});

test("no bare facebook.com block (Meta chaff uses facebook.com/tr/)", () => {
  for (const rule of rules) {
    if (rule.action && rule.action.type !== "block") continue;
    const uf = (rule.condition && rule.condition.urlFilter) || "";
    assert.notEqual(
      uf,
      "||facebook.com",
      "must not block facebook.com host for chaff"
    );
    // Allow facebook.net / connect.facebook.com only.
    if (uf.includes("facebook.com")) {
      assert.ok(
        uf.includes("connect.facebook.com"),
        `unexpected facebook.com filter: ${uf}`
      );
    }
  }
});

test("blocklist includes safe ad/analytics hosts and keeps header rules", () => {
  const ids = new Set(rules.map((r) => r.id));
  assert.ok(ids.has(1) && ids.has(2) && ids.has(3), "header/redirect rules present");
  assert.ok(ids.has(100), "blocklist starts at 100");
  const filters = rules
    .filter((r) => r.action && r.action.type === "block")
    .map((r) => r.condition.urlFilter);
  assert.ok(filters.includes("||doubleclick.net"));
  assert.ok(filters.includes("||google-analytics.com"));
  assert.ok(filters.includes("||clarity.ms"));
  assert.ok(!filters.includes("||facebook.com"));
});
