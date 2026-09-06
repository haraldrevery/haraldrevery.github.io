// Data for eleventy_njk/download.njk — builds every table on download.html by
// scanning music/ and download/ on disk, so the page can never drift from the
// files that are actually there. (It had: a missing mp3 row, a dead wallpaper
// link, no flac rows at all, and hand-typed sizes that were off by ~0.2 MB.)
//
// WHY THIS LIVES HERE AND NOT IN eleventy.config.js
// -------------------------------------------------
// eleventy_binary/build.mjs BUNDLES eleventy.config.js into the standalone
// eleventy-linux-x64 / eleventy-win-x64.exe binaries, so config changes force a
// ~95 MB Bun recompile. Template data files are read from disk on every run
// instead (same as input_markdown/input_markdown.11tydata.js), so you can edit
// the lists below and just re-run the binary. Never move this into the config.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");

// Hash cache. Hashing all 347 MB takes ~950 ms, which would nearly triple the
// build (0.5s -> 1.5s) and get paid again on every `npm start` rebuild. Entries
// are keyed by path and invalidated on size or mtime change. Committed to git so
// a fresh clone only re-hashes once (git does not preserve mtimes).
// Listed in .eleventyignore so writing it can never retrigger the watcher.
const CACHE_FILE = path.join(__dirname, "download_hashes.json");

// Top-level folders to scan, in page order.
const ROOTS = ["music", "download"];

// Subfolder order within each root. Anything not listed is appended
// alphabetically, so a new folder shows up without editing this.
const ORDER = {
  music: ["flac", "mp3"],
  download: ["wallpaper_packs"],
};

// <h2> overrides. Unlisted folders fall back to the folder name with
// underscores as spaces and the first letter capitalised, which already gives
// "Wallpaper packs" for wallpaper_packs.
const TITLES = {
  mp3: "Mp3 files",
  flac: "Flac files",
};

// Subfolders that exist on disk but must NOT be published. Scratch work lives in
// download/test/, and publishing it would put it on the live site. Delete an
// entry here the moment a folder is meant to go public.
const SKIP_FOLDERS = new Set(["test"]);

// Anything starting with these is skipped too, so you can park a folder or file
// without editing this file: download/_wip/ or music/mp3/_rough_mix.mp3
const SKIP_PREFIXES = ["_", "."];

// Sidecar/notes files that sit next to downloads but are not downloads
// (music/flac/txt.txt is a "high quality flac files goes here" placeholder).
const SKIP_EXTS = new Set([".txt", ".md", ".json"]);

const skipName = (name) =>
  SKIP_PREFIXES.some((p) => name.startsWith(p));

// Decimal MB/KB, matching what the hand-written page was aiming for.
const formatSize = (bytes) => {
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + " KB";
  return bytes + " B";
};

const titleFor = (folder) =>
  TITLES[folder] ||
  folder.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const sortFolders = (root, folders) => {
  const order = ORDER[root] || [];
  return folders.slice().sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
};

module.exports = () => {
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch (e) {
    cache = {}; // missing or corrupt cache just means a full re-hash
  }

  const nextCache = {};
  let hashed = 0;

  const hashesFor = (relPath, stat) => {
    const hit = cache[relPath];
    if (hit && hit.size === stat.size && hit.mtimeMs === stat.mtimeMs) {
      nextCache[relPath] = hit;
      return hit;
    }
    const buf = fs.readFileSync(path.join(ROOT, relPath));
    const entry = {
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      sha512: crypto.createHash("sha512").update(buf).digest("hex"),
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
    };
    nextCache[relPath] = entry;
    hashed++;
    return entry;
  };

  const sections = {};

  for (const root of ROOTS) {
    const rootDir = path.join(ROOT, root);
    let entries = [];
    try {
      entries = fs.readdirSync(rootDir, { withFileTypes: true });
    } catch (e) {
      sections[root] = [];
      continue;
    }

    const folders = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((n) => !skipName(n) && !SKIP_FOLDERS.has(n));

    sections[root] = sortFolders(root, folders)
      .map((folder) => {
        const dir = path.join(rootDir, folder);
        const files = fs
          .readdirSync(dir, { withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => e.name)
          .filter(
            (n) => !skipName(n) && !SKIP_EXTS.has(path.extname(n).toLowerCase())
          )
          .sort((a, b) => a.localeCompare(b))
          .map((name) => {
            const rel = `${root}/${folder}/${name}`;
            const stat = fs.statSync(path.join(ROOT, rel));
            const h = hashesFor(rel, stat);
            return {
              name,
              url: "/" + rel.split("/").map(encodeURIComponent).join("/"),
              size: formatSize(stat.size),
              sha512: h.sha512,
              sha256: h.sha256,
            };
          });
        return { slug: folder, title: titleFor(folder), files };
      })
      // A folder with nothing publishable in it renders no section at all.
      .filter((s) => s.files.length > 0);
  }

  // Only write when something actually changed, so a no-op build never touches
  // the file (belt and braces against a watch loop).
  const serialised = JSON.stringify(nextCache, null, 2) + "\n";
  if (hashed > 0 || serialised !== JSON.stringify(cache, null, 2) + "\n") {
    fs.writeFileSync(CACHE_FILE, serialised);
  }

  return { musicSections: sections.music, downloadSections: sections.download };
};
