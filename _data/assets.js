// Cache-busting URLs for the site's own static files: {{ assets.v("/main.css") }}
// prints "/main.css?v=<first 10 hex of the file's SHA-256>".
//
// WHY
// Cloudflare serves CSS/JS with a 186-day max-age (measured 2026-09), so an
// unversioned /main.css stays in visitors' browsers - and in Cloudflare's own
// edge cache - for months after it changes, while the HTML (10-minute cache)
// moves on without it. The version is part of the URL, and Cloudflare's cache key
// includes the query string, so a new file is a new URL: nothing to purge.
//
// ORDER MATTERS: build the CSS first, then Eleventy (build.sh does both, in that
// order). A page built against an older main.css carries that file's version;
// healthcheck.sh reports it as "stale ?v=".
//
// Pages Eleventy does NOT render carry the version by hand (h/1dgraph.html,
// h/2dphaseportrait.html) - the healthcheck names them when theirs is out of
// date. input_custom_html_pages/ has it rewritten on the way to notebook_pages/
// (the eleventy.before hook in eleventy.config.js calls this same file).
//
// WHY A _data FILE: it is read from disk on every run, so changing it never
// needs the standalone Eleventy binaries recompiled (they bundle
// eleventy.config.js only). A missing file stops the build rather than
// printing a URL that 404s.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");

// Exported separately so eleventy.config.js can version the pages it copies
// verbatim with exactly the same rule.
const version = (url) => {
  const rel = String(url).replace(/^\/+/, "");
  let buf;
  try {
    buf = fs.readFileSync(path.join(ROOT, rel));
  } catch (e) {
    throw new Error(`assets.v("${url}"): ${rel} does not exist. Build the CSS first (build.sh), or fix the path.`);
  }
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 10);
};

module.exports = () => {
  const memo = new Map();   // one hash per file per build
  return {
    v(url) {
      if (!memo.has(url)) memo.set(url, `${url}?v=${version(url)}`);
      return memo.get(url);
    },
  };
};
module.exports.version = version;
