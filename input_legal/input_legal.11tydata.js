// Directory data for input_legal/ — the Legal page.
//
// legal.md holds the prose and renders to /legal.html through
// eleventy_settings/legal.njk. Section 10 (Open Source Software Notices) is NOT
// written by hand: this file reads the raw license texts in licenses/ and hands
// the layout a ready alphabetical list, each with its copyright line and its
// complete verbatim text.
//
// DROP A LICENSE FILE IN AND YOU ARE DONE. A "<slug>.json" sidecar is OPTIONAL
// and only overrides what the file cannot say for itself (a prettier name, a
// description, or a copyright the file genuinely lacks). See licenses/README.md.
//
// WHY THIS LIVES HERE AND NOT IN eleventy.config.js
// The standalone build binaries (eleventy-linux-x64 / eleventy-win-x64.exe)
// BUNDLE eleventy.config.js, so touching that file forces a ~95 MB Bun recompile
// (eleventy_binary/README.md). Directory data files are read from disk on every
// run instead — same trick as input_markdown/input_markdown.11tydata.js — so all
// of this stays editable without recompiling anything.
//
// CAVEAT: Eleventy caches directory data files, so ADDING a license while
// `npm start` is running needs a dev-server restart. Editing legal.md or a
// sidecar's values during a normal build is fine.

const fs = require("fs");
const path = require("path");

const LICENSES_DIR = path.join(__dirname, "licenses");

// Where the raw license texts are published, and what the page links to.
// Kept in sync with LICENSES_DIR on every build by syncLicenceDir() below.
const LICENCE_OUT_DIR = path.join(__dirname, "..", "licence");
const LICENCE_URL_BASE = "/licence";

// How far into a file to look for the copyright notice. Real notices sit in the
// first few lines; anything deeper is license body text, not attribution.
const COPYRIGHT_SEARCH_LINES = 30;

// Pull the copyright notice out of a raw license text.
//
// The line must start at COLUMN 0. That anchor is what makes this safe: the
// Apache 2.0 body is indented six spaces and contains lines like
// "      copyright notice that is included in or attached to the work"
// (dompurify lines 48, 80, 111) which must never be mistaken for the notice.
//
// Some notices span several lines — jsPDF is "Copyright" followed by two "(c) …"
// lines, highlight.js is a copyright line followed by "All rights reserved." —
// so keep absorbing continuation lines after the first hit.
//
// Returns null when the file carries no notice at all. That is not a parse
// failure to paper over: input_legal/licenses/mathjs-develop is the bare Apache
// template whose copyright appendix was never filled in, so the holder's name
// exists nowhere in it. The caller turns null into a build error.
const extractCopyright = (text) => {
  const lines = text.split(/\r?\n/).slice(0, COPYRIGHT_SEARCH_LINES);
  const start = lines.findIndex((l) => /^copyright\b/i.test(l));
  if (start === -1) return null;

  const out = [lines[start].trim()];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) break;
    if (/^(\(c\)|©)/i.test(line) || /^all rights reserved\.?$/i.test(line)) {
      out.push(line);
      continue;
    }
    break;
  }
  return out.join("\n");
};

// Best-effort license family, used only as a label on the card. Order matters:
// the dual-licensed check has to come before the plain Apache one, and the MIT
// body-text marker catches the files that carry no header line at all
// (markdown-it, markdown-it-footnote, jsPDF_4_2_1).
//
// Deliberately NOT fatal when it finds nothing — the full license text is on the
// page either way, so a missing badge is cosmetic.
const detectLicense = (text) => {
  const head = text.slice(0, 4000);
  const hasApache = /Apache License/i.test(head);
  const hasMpl = /Mozilla Public License/i.test(head);

  if (hasApache && hasMpl) return "Apache-2.0 / MPL-2.0";
  if (/BSD 3-Clause/i.test(head)) return "BSD 3-Clause";
  if (hasApache) return "Apache-2.0";
  if (/MIT License/i.test(head) || /Permission is hereby granted, free of charge/i.test(text)) {
    return "MIT";
  }
  return null;
};

// One entry per raw license text (extensionless file), plus any sidecar that
// describes a library with no local text at all (licenseUrl entries).
const loadLibraries = () => {
  if (!fs.existsSync(LICENSES_DIR)) return [];

  const entries = fs.readdirSync(LICENSES_DIR);
  const textFiles = entries.filter(
    (f) => !f.includes(".") && fs.statSync(path.join(LICENSES_DIR, f)).isFile()
  );
  const sidecarSlugs = entries
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length));

  const readSidecar = (slug) => {
    const file = path.join(LICENSES_DIR, `${slug}.json`);
    if (!fs.existsSync(file)) return {};
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      throw new Error(`input_legal/licenses/${slug}.json: invalid JSON — ${e.message}`);
    }
  };

  // Libraries whose license text we host ourselves.
  const local = textFiles.map((slug) => {
    const text = fs.readFileSync(path.join(LICENSES_DIR, slug), "utf8");
    const meta = readSidecar(slug);
    const copyright = meta.copyright || extractCopyright(text);

    if (!copyright) {
      throw new Error(
        `input_legal/licenses/${slug}: no copyright notice found in the file, and ` +
        `no "copyright" in ${slug}.json. Add one — publishing the library without ` +
        `its notice would breach the license. (Apache-2.0 texts often ship with an ` +
        `unfilled copyright appendix; mathjs-develop is the example in this repo.)`
      );
    }

    const license = meta.license || detectLicense(text);
    if (!license) {
      console.warn(
        `[legal] licenses/${slug}: could not detect the license family; the card ` +
        `will show no badge. Set "license" in ${slug}.json to label it.`
      );
    }

    return {
      slug,
      name: meta.name || slug,
      description: meta.description || null,
      copyright,
      license: license || null,
      text,
      href: `${LICENCE_URL_BASE}/${slug}`,
      isExternal: false,
    };
  });

  // Libraries with no local text — sidecar + licenseUrl only.
  const external = sidecarSlugs
    .filter((slug) => !textFiles.includes(slug))
    .map((slug) => {
      const meta = readSidecar(slug);
      if (!meta.licenseUrl) {
        throw new Error(
          `input_legal/licenses/${slug}.json: no license text at licenses/${slug} and ` +
          `no "licenseUrl" — one of the two is required, or the page would claim a ` +
          `notice it cannot show.`
        );
      }
      if (!meta.copyright) {
        throw new Error(
          `input_legal/licenses/${slug}.json: link-only entries must state a ` +
          `"copyright", since there is no local text to read it from.`
        );
      }
      return {
        slug,
        name: meta.name || slug,
        description: meta.description || null,
        copyright: meta.copyright,
        license: meta.license || null,
        text: null,
        href: meta.licenseUrl,
        isExternal: true,
      };
    });

  return [...local, ...external].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" })
  );
};

// Publish licenses/<slug> to licence/<slug> so /licence/ can never point at a
// stale or missing file. Byte-identical files are left alone, which keeps their
// mtime stable (sitemap.njk reads mtimes for <lastmod>).
// Mirrors the input_custom_html_pages -> notebook_pages copy in eleventy.config.js.
const syncLicenceDir = (libraries) => {
  if (!fs.existsSync(LICENCE_OUT_DIR)) fs.mkdirSync(LICENCE_OUT_DIR, { recursive: true });

  for (const lib of libraries) {
    if (lib.isExternal) continue;
    const src = path.join(LICENSES_DIR, lib.slug);
    const dest = path.join(LICENCE_OUT_DIR, lib.slug);
    const text = fs.readFileSync(src);
    if (fs.existsSync(dest) && fs.readFileSync(dest).equals(text)) continue;
    fs.writeFileSync(dest, text);
    console.log(`Published licence/${lib.slug}`);
  }
};

const buildLicenses = () => {
  const libraries = loadLibraries();
  syncLicenceDir(libraries);
  return libraries;
};

module.exports = () => ({
  layout: "legal.njk",
  permalink: "legal.html",
  eleventyExcludeFromCollections: true,   // the Legal page is not a Notebook post
  licenses: buildLicenses(),
});
