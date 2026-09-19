// Standalone build runner for the Harald Revery site.
//
// Compiled by Bun into eleventy-{linux,win}-{x64,arm64} (see compile.sh).
// The executable bundles Eleventy AND eleventy.config.js with everything it
// requires (markdown-it + plugins, KaTeX, gray-matter), so no node_modules or
// Node.js is needed at run time. Templates, layouts (eleventy_settings/) and
// content are still read from disk normally — editing posts never needs a
// recompile. Recompile only when eleventy.config.js changes or Eleventy is
// upgraded (see README.md in this folder).
//
// Run it from the site root. Does the same as `npm run build` / `npx @11ty/eleventy`,
// plus three checks Eleventy does not make: it refuses to run outside the site
// root, it fails when the build wrote nothing, and it warns when the bundled
// config no longer matches eleventy.config.js on disk.

import "./bun-windows-fs-fix.mjs";   // MUST stay the first import — see that file
import fs from "node:fs";
import crypto from "node:crypto";
import Eleventy from "@11ty/eleventy";
import configFn from "../eleventy.config.js";

const args = process.argv.slice(2);

// Double-clicked in Explorer, Windows gives the binary a console of its own and
// closes it the moment the process exits, so neither "Wrote N files" nor an
// error could ever be read. That case is detectable: this process is the ONLY
// one attached to its console. Started from cmd, PowerShell or a VS Code
// terminal, the shell shares the console and nothing waits. Any doubt (no
// console, FFI unavailable) means do not wait.
const startedByDoubleClick = await (async () => {
  if (process.platform !== "win32") return false;
  try {
    const { dlopen, FFIType, ptr } = await import("bun:ffi");
    const kernel32 = dlopen("kernel32.dll", {
      GetConsoleProcessList: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.u32 },
    });
    const ids = new Uint32Array(4);
    const count = kernel32.symbols.GetConsoleProcessList(ptr(ids), ids.length);
    kernel32.close();
    return count === 1;
  } catch {
    return false;
  }
})();

const finish = async (code) => {
  if (startedByDoubleClick) {
    process.stdout.write(`\n${code ? "BUILD FAILED. " : ""}Press Enter to close this window.`);
    // "end"/"error" too: a closed or redirected stdin must never hang the exit.
    await new Promise((resolve) => {
      process.stdin.once("data", resolve).once("end", resolve).once("error", resolve);
      process.stdin.resume();
    });
  }
  process.exit(code);
};

if (args.includes("--serve") || args.includes("--watch")) {
  console.error("This binary only builds the site (same as `npm run build`).");
  console.error("For the live dev server use: npm start");
  await finish(1);
}

// The binary builds whatever folder it is started in, and anywhere but the site
// root that silently produces nothing useful. eleventy.config.js marks the root.
if (!fs.existsSync("eleventy.config.js")) {
  console.error(`ERROR: there is no eleventy.config.js in ${process.cwd()}`);
  console.error("Run this from the site root, the folder that contains eleventy.config.js.");
  await finish(1);
}

// build.mjs stamps the SHA-256 of eleventy.config.js into the binary as
// BUNDLED_CONFIG_SHA256. A BOM, line endings and trailing whitespace at the end
// of the file are ignored on both sides, so a Windows checkout that converted
// the file to CRLF, or an editor adding a final newline, is not a change.
const configHash = (text) =>
  crypto.createHash("sha256")
    .update(text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trimEnd())
    .digest("hex");
const bundledConfigHash = typeof BUNDLED_CONFIG_SHA256 === "string" ? BUNDLED_CONFIG_SHA256 : null;
const staleConfig = bundledConfigHash !== null &&
  configHash(fs.readFileSync("eleventy.config.js", "utf8")) !== bundledConfigHash;

let exitCode = 0;
try {
  // Eleventy's programmatic API runs the config function but IGNORES its return
  // object (dir, templateFormats, engines) — see the TODO in Eleventy.js. So we
  // capture the return value and re-apply each setting through supported APIs.
  let fileConfig = {};

  const elev = new Eleventy(".", ".", {
    // Never look for eleventy.config.js on disk — the bundled copy is the config.
    configPath: false,
    quietMode: args.includes("--quiet"),
    config: (eleventyConfig) => {
      fileConfig = configFn(eleventyConfig) || {};
      if (fileConfig.templateFormats) {
        eleventyConfig.setTemplateFormats(fileConfig.templateFormats);
      }
      const dir = fileConfig.dir || {};
      if (dir.input) eleventyConfig.setInputDirectory(dir.input);
      if (dir.includes) eleventyConfig.setIncludesDirectory(dir.includes);
      if (dir.layouts) eleventyConfig.setLayoutsDirectory(dir.layouts);
      if (dir.data) eleventyConfig.setDataDirectory(dir.data);
      if (dir.output) eleventyConfig.setOutputDirectory(dir.output);
    },
  });

  // Root-level return values have no setter API; they can only be injected as
  // root-config overrides via initializeConfig(). Getters are required here:
  // they are read (Object.assign in appendToRootConfig) only AFTER the config
  // callback above has populated fileConfig.
  await elev.initializeConfig({
    get markdownTemplateEngine() {
      return fileConfig.markdownTemplateEngine ?? "liquid";
    },
    get htmlTemplateEngine() {
      return fileConfig.htmlTemplateEngine ?? "liquid";
    },
  });

  const [, templates] = await elev.write();

  // Eleventy treats "found no templates" as a successful build. It is how the
  // Windows binary once failed (bun-windows-fs-fix.mjs): notebook.html and
  // every post silently stayed as they were, with exit code 0.
  if (!(templates || []).some((t) => t && t.outputPath)) {
    console.error("\nERROR: the build wrote 0 files, so notebook.html, the posts and every");
    console.error("other page are unchanged. Your content is not the cause: Eleventy found");
    console.error('no templates at all. See "Wrote 0 files" in eleventy_binary/README.md.');
    exitCode = 1;
  }
} catch (e) {
  console.error(e.message || e);
  exitCode = 1;
}

if (staleConfig) {
  console.error("\nWARNING: eleventy.config.js has changed since this binary was compiled.");
  console.error("This build used the OLD copy bundled inside the binary, so the output may");
  console.error("differ from `npm run build`. Recompile: bash eleventy_binary/compile.sh");
}

await finish(exitCode);
