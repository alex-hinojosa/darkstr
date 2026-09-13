#!/usr/bin/env node
/**
 * Fail-closed positioning scan for user-facing extension UI.
 *
 * Meridian / Proof / Product Manager gate:
 * - Ban anti-detect marketing (allow "not anti-detect")
 * - Ban Cloudflare-as-bypass capability claims (allow "Not a Cloudflare bypass")
 * - Ban "Chrome prefs" / "chrome-prefs" product labels (use Browser prefs / darkstr prefs)
 * - Ban "crates" in Homogeneous implications / extension UI copy
 *
 * Prefer extension UI surfaces. Skips LICENSE and technical docs.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** User-facing extension paths (relative to repo root). */
const SCAN_ROOTS = [
  "extension/popup",
  "extension/settings",
  "extension/first-run.html",
  "extension/first-run.js",
  "extension/first-run.css",
  "extension/manifest.json",
  "extension/background.js",
];

const TEXT_EXT = new Set([".html", ".js", ".css", ".json", ".mjs"]);

/** Strip allowlisted negation phrases before applying ban regexes. */
const ALLOWLIST = [
  /\bnot\s+an?\s+anti[- ]?detect(?:\s+browser)?\b/gi,
  /\bnot\s+anti[- ]?detect\b/gi,
  /\bnot\s+a\s+cloudflare\s+bypass\b/gi,
  /\bnot\s+cloudflare\s+bypass\b/gi,
  /\bnot\s+a\s+cloudflare[- ]defeat\s+switch\b/gi,
  /\bnot\s+a\s+cloudflare[- ]defeat\b/gi,
];

/**
 * Banned patterns applied after allowlist stripping.
 * Each entry: { id, re, hint }
 */
const BANS = [
  {
    id: "anti-detect-marketing",
    re: /\banti[- ]?detect\b/i,
    hint: 'Use pollution framing; allow "not anti-detect" only.',
  },
  {
    id: "cloudflare-bypass-claim",
    re: /\bcloudflare\b.{0,40}\b(bypass|defeat|beats?|turnstile)\b|\b(bypass|defeat|beats?)\b.{0,40}\bcloudflare\b|\bturnstile\b.{0,20}\bbypass\b/i,
    hint: 'No Cloudflare-as-capability claim; allow "Not a Cloudflare bypass".',
  },
  {
    id: "chrome-prefs-label",
    re: /\bchrome-prefs\b|\bchrome\s+prefs\b|\bopen\s+chrome[- ]prefs\b/i,
    hint: 'Say "Browser prefs" / "darkstr prefs", not "Chrome prefs" / "chrome-prefs".',
  },
  {
    id: "crates-in-ui",
    re: /\bcrates\b/i,
    hint: "Do not mention Rust crates in user-facing extension UI (Homogeneous implications, etc.).",
  },
];

function isTextFile(name) {
  const i = name.lastIndexOf(".");
  if (i < 0) return false;
  return TEXT_EXT.has(name.slice(i).toLowerCase());
}

function walk(absPath, out = []) {
  let st;
  try {
    st = statSync(absPath);
  } catch {
    return out;
  }
  if (st.isFile()) {
    if (isTextFile(absPath)) out.push(absPath);
    return out;
  }
  if (!st.isDirectory()) return out;
  for (const ent of readdirSync(absPath)) {
    if (ent === "node_modules" || ent === ".git") continue;
    walk(join(absPath, ent), out);
  }
  return out;
}

function collectFiles() {
  const files = [];
  for (const rel of SCAN_ROOTS) {
    walk(join(root, rel), files);
  }
  return [...new Set(files)].sort();
}

/** Drop tags / collapse whitespace so "not</strong> an anti-detect" still allowlists. */
function normalizeForScan(line) {
  return line
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripAllowlist(line) {
  let s = normalizeForScan(line);
  for (const re of ALLOWLIST) {
    s = s.replace(re, " ");
  }
  return s;
}

/**
 * @param {string[]} [files]
 * @returns {{ ok: boolean, violations: Array<{file:string,line:number,id:string,text:string,hint:string}>, scanned: number }}
 */
export function checkPositioning(files = collectFiles()) {
  const violations = [];
  for (const abs of files) {
    const rel = relative(root, abs).replaceAll("\\", "/");
    const text = readFileSync(abs, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const original = lines[i];
      const stripped = stripAllowlist(original);
      for (const ban of BANS) {
        if (ban.re.test(stripped)) {
          violations.push({
            file: rel,
            line: i + 1,
            id: ban.id,
            text: original.trim().slice(0, 200),
            hint: ban.hint,
          });
        }
      }
    }
  }
  return { ok: violations.length === 0, violations, scanned: files.length };
}

export { SCAN_ROOTS, ALLOWLIST, BANS, collectFiles, stripAllowlist };

function main() {
  const result = checkPositioning();
  if (result.ok) {
    console.log(
      `positioning check OK (${result.scanned} file(s) scanned, extension UI)`
    );
    process.exit(0);
  }
  console.error("positioning check FAILED — banned user-facing copy:\n");
  for (const v of result.violations) {
    console.error(`  ${v.file}:${v.line}  [${v.id}]`);
    console.error(`    ${v.text}`);
    console.error(`    → ${v.hint}\n`);
  }
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
