import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(
  __dirname,
  "extension/src/content/anti-fingerprint/bootstrap-entry.js"
);
const outFile = path.join(__dirname, "extension/anti-fingerprint-bootstrap.js");

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: "iife",
  minify: false,
  keepNames: true,
  sourcemap: false,
  target: "firefox128",
  legalComments: "inline",
});

let bootstrapCode = result.outputFiles[0].text;
bootstrapCode = bootstrapCode
  .replace(/^\(\(\) => \{\n?/, "")
  .replace(/\n?\}\)\(\);\n?$/, "");

const wrappedBootstrap =
  "// @generated — closure-local bootstrap for executeScript injection. DO NOT EDIT.\n" +
  "// Built from extension/src/content/anti-fingerprint/* via esbuild.config.mjs\n" +
  "function bootstrapAntiFingerprint(seed) {\n" +
  bootstrapCode +
  "\n}\n";

fs.writeFileSync(outFile, wrappedBootstrap);
console.log(`Wrote ${path.relative(__dirname, outFile)} (${wrappedBootstrap.length} bytes)`);
