// Data for eleventy_njk/sitemap.njk — an honest <lastmod> for the hand-written
// pages in its staticPages list.
//
// WHY NOT FILE MODIFICATION TIMES
// -------------------------------
// The sitemap used to take each page's mtime (the fileModDate filter). An mtime
// is not a content date: git does not keep mtimes, so a fresh clone or checkout
// stamped every page with that day, and three entries read the BUILT
// notebook.html / download.html / legal.html, which every build rewrites, so
// they moved on every build with nothing changed. Google stops trusting
// <lastmod> for the whole site once it catches it being wrong, and that includes
// the correct dates on posts and releases.
//
// WHAT HAPPENS INSTEAD
// --------------------
// Each staticPages entry lists the `sources` its CONTENT comes from. Those are
// fingerprinted with every run of whitespace squashed to one space (CRLF vs LF,
// re-indenting and blank lines do not count), and sitemap_dates.json remembers
// each page's fingerprint and the date it was first built. Same fingerprint:
// the stored date. New fingerprint: today (UTC), stored. The JSON is committed,
// so every machine and every fresh clone agrees, and a rebuild with no content
// change changes nothing.
//
// A source is a file, a folder (every file under it), or { data: <file> } for a
// data file whose OUTPUT is what the page shows (the download list comes from
// download.11tydata.js scanning the disk; its output, not its code, is what a
// visitor sees change). A source that does not exist stops the build: a typo
// here would otherwise freeze that page's date forever without a word.
//
// Deliberately NOT sources: nav.njk, footer.njk, base.njk. Chrome that every
// page shares is not a change to any page's content, and counting it would move
// every date at once.
//
// WHY THIS LIVES HERE AND NOT IN eleventy.config.js
// Same reason as download.11tydata.js: the config is compiled into the Eleventy
// binaries, template data files are read from disk on every run.
//
// sitemap_dates.json is listed in .eleventyignore, so writing it can never
// retrigger the watcher. Missing or unreadable, it just means every page gets
// today's date once.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const CACHE_FILE = path.join(__dirname, "sitemap_dates.json");

const today = () => new Date().toISOString().slice(0, 10);
const squash = (text) => text.replace(/\s+/g, " ").trim();

// Every file under a folder, as sorted root-relative paths with "/" separators
// (so a Windows build fingerprints exactly like a Linux one).
const filesUnder = (rel) =>
  fs
    .readdirSync(path.join(ROOT, rel), { withFileTypes: true })
    .flatMap((e) => {
      const child = rel + "/" + e.name;
      return e.isDirectory() ? filesUnder(child) : e.isFile() ? [child] : [];
    })
    .sort();

// The text that stands for one source in a page's fingerprint.
const sourceText = (loc, src) => {
  if (src && typeof src === "object" && src.data) {
    const file = path.join(ROOT, src.data);
    // Fresh copy each build, so an edit under `npm start` is picked up.
    try { delete require.cache[require.resolve(file)]; } catch (e) { /* not cached yet */ }
    const mod = require(file);
    return JSON.stringify(typeof mod === "function" ? mod() : mod);
  }
  const rel = String(src).replace(/\\/g, "/").replace(/\/+$/, "");
  let stat;
  try {
    stat = fs.statSync(path.join(ROOT, rel));
  } catch (e) {
    throw new Error(
      `sitemap.njk: staticPages "${loc}" lists the source "${rel}", which does not exist. ` +
      `Fix the path in eleventy_njk/sitemap.njk (it decides that page's <lastmod>).`
    );
  }
  if (!stat.isDirectory()) return squash(fs.readFileSync(path.join(ROOT, rel), "utf8"));
  return filesUnder(rel)
    .map((f) => f + "\n" + squash(fs.readFileSync(path.join(ROOT, f), "utf8")))
    .join("\n");
};

module.exports = () => {
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch (e) {
    cache = {};
  }

  return {
    // sitemap.njk calls this once per staticPages entry. Returns YYYY-MM-DD, or
    // "" for a page with no sources (its date then comes from `newest` alone).
    sitemapLastmod(loc, sources) {
      if (!Array.isArray(sources) || !sources.length) return "";
      const hash = crypto.createHash("sha256");
      for (const src of sources) {
        hash.update(JSON.stringify(src) + "\0" + sourceText(loc, src) + "\0");
      }
      const fingerprint = hash.digest("hex");

      const hit = cache[loc];
      if (hit && hit.fingerprint === fingerprint && /^\d{4}-\d{2}-\d{2}$/.test(hit.lastmod)) {
        return hit.lastmod;
      }
      cache[loc] = { lastmod: today(), fingerprint };
      // Sorted keys, so the file only ever changes where a page did.
      const sorted = Object.fromEntries(Object.keys(cache).sort().map((k) => [k, cache[k]]));
      fs.writeFileSync(CACHE_FILE, JSON.stringify(sorted, null, 2) + "\n");
      return cache[loc].lastmod;
    },
  };
};
