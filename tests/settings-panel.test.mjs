import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const settingsHtml = readFileSync(
  join(root, "extension/settings/settings.html"),
  "utf8"
);
const settingsJs = readFileSync(
  join(root, "extension/settings/settings.js"),
  "utf8"
);
const popupHtml = readFileSync(join(root, "extension/popup/popup.html"), "utf8");
const manifest = JSON.parse(
  readFileSync(join(root, "extension/manifest.json"), "utf8")
);

test("options_ui points at browser prefs settings panel", () => {
  assert.equal(manifest.options_ui.page, "settings/settings.html");
  assert.equal(manifest.options_ui.open_in_tab, true);
});

test("settings panel exposes XOR mode radios and Delay persona one page", () => {
  assert.match(settingsHtml, /name="mode" value="homogeneous"/);
  assert.match(settingsHtml, /name="mode" value="pollution"/);
  assert.match(settingsHtml, /id="strictFirstDoc"/);
  assert.match(settingsHtml, /Delay persona one page/);
  assert.match(settingsHtml, /id="nativeCompatible"/);
  assert.match(settingsHtml, /id="nativeCompatSiteList"/);
});

test("settings panel lists PREF-BRIDGE chrome / about:config names", () => {
  for (const key of [
    "darkstr.mode",
    "darkstr.nativeCompatible",
    "darkstr.nativeCompatSites",
    "darkstr.strictFirstDoc",
  ]) {
    assert.match(settingsHtml, new RegExp(key.replace(".", "\\.")));
  }
  assert.match(settingsHtml, /about:config/);
  assert.match(settingsHtml, /privacy\.resistFingerprinting/);
  assert.match(settingsHtml, /privacy\.fingerprintingProtection/);
  assert.match(settingsHtml, /domain map/);
  assert.doesNotMatch(settingsHtml, /\{\s*\[etld1\]:\s*true\s*\}/);
});

test("XOR implications: Pollution kills RFP/FPP; Homogeneous stock RFP; no metric customization", () => {
  assert.match(settingsJs, /privacy\.resistFingerprinting/);
  assert.match(settingsJs, /privacy\.fingerprintingProtection/);
  assert.match(settingsJs, /must be false/i);
  assert.match(settingsJs, /No RFP metric customization/i);
  assert.match(settingsJs, /stock LibreWolf RFP/i);
  assert.match(settingsJs, /Persona and chaff stay idle/);
  assert.doesNotMatch(settingsJs, /chaff crates/);
});

test("PM-approved positioning copy (pollution, not Cloudflare bypass)", () => {
  assert.match(settingsHtml, /Pollution tool/);
  assert.match(settingsHtml, /not Cloudflare bypass/i);
  assert.match(settingsHtml, /not official LibreWolf/i);
  assert.match(settingsHtml, /not anti-detect/i);
  assert.match(settingsHtml, /Not a Cloudflare-defeat switch/);
  assert.doesNotMatch(settingsHtml, /beats Cloudflare|Turnstile|anti-detect browser/i);
});

test("settings panel points at patches apply script for fork builds", () => {
  assert.match(settingsHtml, /patches\/scripts\/apply-darkstr-patches\.sh/);
  assert.match(settingsHtml, /DARKSTR_GECKO_ROOT/);
  assert.match(settingsHtml, /patches\/README\.md/);
});

test("popup links to browser prefs panel and keeps Quiet/Balanced/Loud", () => {
  assert.match(popupHtml, /openSettingsBtn/);
  assert.match(popupHtml, /Open browser prefs panel/);
  assert.match(popupHtml, /data-level="quiet"/);
  assert.match(popupHtml, /data-level="balanced"/);
  assert.match(popupHtml, /data-level="loud"/);
  assert.match(popupHtml, /Quiet/);
  assert.match(popupHtml, /Balanced/);
  assert.match(popupHtml, /Loud/);
});

test("settings JS uses the same background message types as popup", () => {
  for (const t of [
    "getState",
    "setMode",
    "setNativeCompatible",
    "setStrictFirstDoc",
    "removeNativeCompatSite",
  ]) {
    assert.match(settingsJs, new RegExp(`type:\\s*"${t}"`));
  }
});
