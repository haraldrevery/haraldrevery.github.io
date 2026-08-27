// Standalone build runner for the Harald Revery site.
//
// Compiled by Bun into eleventy-linux-x64 / eleventy-win-x64.exe (see compile.sh).
// The executable bundles Eleventy AND eleventy.config.js with everything it
// requires (markdown-it + plugins, KaTeX, gray-matter), so no node_modules or
// Node.js is needed at run time. Templates, layouts (eleventy_settings/) and
// content are still read from disk normally — editing posts never needs a
// recompile. Recompile only when eleventy.config.js changes or Eleventy is
// upgraded (see README.md in this folder).
//
// Run it from the site root. Does the same as `npm run build` / `npx @11ty/eleventy`.

import Eleventy from "@11ty/eleventy";
import configFn from "../eleventy.config.js";

const args = process.argv.slice(2);
if (args.includes("--serve") || args.includes("--watch")) {
  console.error("This binary only builds the site (same as `npm run build`).");
  console.error("For the live dev server use: npm start");
  process.exit(1);
}

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

try {
  await elev.write();
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
