// Works around a Bun bug that made eleventy-win-x64.exe build NOTHING.
//
// Bun's Windows runtime (seen in 1.3.14) returns false from fs.existsSync("./")
// even though fs.statSync("./") succeeds. Eleventy normalises the input dir "."
// to "./" and asks whether that is a directory before turning it into the
// template glob (TemplatePath.convertToRecursiveGlobSync in @11ty/eleventy-utils).
// The false answer turned "./**/*.{njk,md}" into ".//*.{njk,md}": only the repo
// root was searched, it holds no templates, and the build printed "Wrote 0 files"
// and exited 0. No post was built and notebook.html never changed. Only the
// input_custom_html_pages copy ran, because that is a plain fs hook, not a template.
//
// Every existsSync call in Eleventy is a property lookup (fs.existsSync(...)), so
// patching the shared fs object covers all of them, including the ones in
// directory data files read from disk at run time.
//
// MUST be the first import in runner.mjs, so the patch is in place before any
// Eleventy module is evaluated. Windows only: the Linux binaries never needed it,
// and leaving them alone keeps their output byte-identical to the Node build.
import fs from "node:fs";

if (process.platform === "win32") {
  const nativeExistsSync = fs.existsSync;
  fs.existsSync = function existsSync(p) {
    if (nativeExistsSync(p)) return true;
    try {
      fs.statSync(p);
      return true;
    } catch {
      return false;
    }
  };
}
