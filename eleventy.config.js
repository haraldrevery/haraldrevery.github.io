const markdownIt = require("markdown-it");
const markdownItAttrs = require("markdown-it-attrs");
const markdownItLinkAttributes = require("markdown-it-link-attributes");
const markdownItTexmath = require("markdown-it-texmath");
const katex = require("katex");
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

// The three content input folders. Every path below goes through these, so
// renaming an input folder is a one-line change here (plus the Tailwind globs
// in dev.sh/dev.bat and a recompile of the standalone Eleventy binaries, which
// bundle this file — see eleventy_binary/README.md).
const HTML_PAGES_DIR = "./input_custom_html_pages";  // hand-written .html posts
const MARKDOWN_DIR = "input_markdown";               // matched as a substring of inputPath
const RELEASE_DIR = "./input_release";               // one .json/.jsonc per release

// Shared slug helper (used by the "slugify" filter and the "releases" collection).
const slugify = (str) => {
  return String(str)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
};

// Parse JSON that may contain // and /* */ comments and trailing commas
// (so input_release/*.jsonc templates can be self-documenting). String-aware,
// so it never touches "https://…" URLs or text inside quotes.
const parseJsonc = (text) => {
  let out = "", inStr = false, esc = false, line = false, block = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (line) { if (c === "\n") { line = false; out += c; } continue; }
    if (block) { if (c === "*" && n === "/") { block = false; i++; } continue; }
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "/" && n === "/") { line = true; i++; continue; }
    if (c === "/" && n === "*") { block = true; i++; continue; }
    out += c;
  }
  // strip trailing commas ( , } / , ] ) outside strings
  let clean = "", s2 = false, e2 = false;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (s2) { clean += c; if (e2) e2 = false; else if (c === "\\") e2 = true; else if (c === '"') s2 = false; continue; }
    if (c === '"') { s2 = true; clean += c; continue; }
    if (c === ",") {
      let j = i + 1;
      while (j < out.length && /\s/.test(out[j])) j++;
      if (out[j] === "}" || out[j] === "]") continue;   // drop the trailing comma
    }
    clean += c;
  }
  return JSON.parse(clean);
};

// Site origin used to build absolute URLs / @id values in JSON-LD.
const SITE_ORIGIN = "https://haraldrevery.com";

// Format any date as YYYY-MM-DD (shared by the isoDate filter and JSON-LD builders).
const isoDate = (dateObj) => new Date(dateObj).toISOString().slice(0, 10);

// Format a release date string (e.g. "2018-8-17") as a calendar YYYY-MM-DD without
// a timezone round-trip, so datePublished can't shift by a day. Falls back to isoDate.
const calendarDate = (d) => {
  const m = String(d == null ? "" : d).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : isoDate(d);
};

// Convert a "m:ss" or "h:mm:ss" track length into an ISO-8601 duration
// ("3:46" -> "PT3M46S", "1:02:03" -> "PT1H2M3S"). Returns null for blank/invalid
// input (e.g. the " " placeholders some archival tracks carry).
const isoDuration = (len) => {
  const str = String(len == null ? "" : len).trim();
  if (!str) return null;
  const parts = str.split(":").map((p) => Number(p));
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null;
  while (parts.length < 3) parts.unshift(0);
  const [h, m, s] = parts;
  let out = "PT";
  if (h) out += h + "H";
  if (m) out += m + "M";
  if (s || (!h && !m)) out += s + "S";
  return out;
};

// Serialize a JSON-LD object for inlining in a <script> tag. Escapes "<" so a
// value can never break out of the script element (e.g. a stray "</script>").
const jsonLdScript = (obj) => JSON.stringify(obj, null, 2).replace(/</g, "\\u003c");

// Reference to the site's single canonical artist entity (defined in full, with
// sameAs links, in index.html). Release/discography markup links to it by @id
// rather than re-declaring the MusicGroup.
const artistRef = (name) => ({
  "@type": "MusicGroup",
  "@id": SITE_ORIGIN + "/#artist",
  "name": name || "Harald Revery",
});

// Read an image's pixel size straight from its header bytes. Deliberately
// dependency-free: node_modules is committed and the standalone Eleventy
// binaries bundle this file, so pulling in an image library would mean an
// npm install plus a recompile of both binaries (eleventy_binary/README.md).
// Handles PNG, GIF, WebP and JPEG (including progressive/Exif files); returns
// null for anything else (e.g. SVG), which callers treat as "size unknown".
const readImageSize = (buf) => {
  if (buf.length >= 24 && buf.toString("ascii", 1, 4) === "PNG")
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "GIF")
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const f = buf.toString("ascii", 12, 16);
    if (f === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (f === "VP8L") { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
    if (f === "VP8X") return { width: (buf.readUIntLE(24, 3) & 0xffffff) + 1, height: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      // SOF0-SOF15 carry the frame size; DHT/JPG/DAC share the range but do not.
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
};

// Resolve a root-relative site path ("/notebook_thumbnails/x.jpg") to an
// absolute URL plus its intrinsic size, for og:image / JSON-LD ImageObject.
// Memoised because every post asks for the same handful of files. A missing or
// unreadable file yields url-only, so a typo degrades instead of failing a build.
// A URL path is not a file path: markdown-it percent-encodes every non-ASCII
// character in a link, so "/photos/.../snøhetta.jpg" reaches us as
// "sn%C3%B8hetta.jpg" and no fs call would ever find it. Decode before touching
// the disk, never for the emitted href - the encoded form is the correct URL.
// Malformed escapes decode to themselves rather than throwing.
const fsPath = (rel) => {
  let out = rel;
  try { out = decodeURIComponent(rel); } catch (e) { /* keep the raw form */ }
  return path.join(".", out.replace(/^\/+/, ""));
};

const imageMetaCache = new Map();
const imageMeta = (src) => {
  const rel = String(src == null ? "" : src).trim();
  if (!rel) return null;
  if (imageMetaCache.has(rel)) return imageMetaCache.get(rel);
  const meta = { url: /^https?:\/\//.test(rel) ? rel : SITE_ORIGIN + rel };
  if (!/^https?:\/\//.test(rel)) {
    try {
      const fd = fs.openSync(fsPath(rel), "r");
      try {
        // 64 KB is well past the SOF marker of every image on this site.
        const buf = Buffer.alloc(65536);
        const read = fs.readSync(fd, buf, 0, 65536, 0);
        const size = readImageSize(buf.subarray(0, read));
        if (size) { meta.width = size.width; meta.height = size.height; }
      } finally { fs.closeSync(fd); }
    } catch (e) { /* size unknown - url-only is still valid */ }
  }
  imageMetaCache.set(rel, meta);
  return meta;
};

// --- Justified image grids in markdown posts -----------------------------
// A run of two or more adjacent images in a post body renders as a justified
// (Flickr/Behance) grid instead of stacked full-width figures. The layout is the
// algorithm from the page builder's Gallery block
// (page_builder_app_v2/src/puck/components/Gallery.tsx, justifiedStyle): flex
// wrapping plus a flex-grow proportional to each image's aspect ratio, so every
// item in a row resolves to the SAME height and rows come out exactly justified,
// with no JS and no cropping. Move one, move both, or the two galleries diverge.
//
// The only per-image fact in the emitted HTML is --ar, the intrinsic aspect
// ratio; every sizing knob lives in .rvry-grid in input_prose.css. That split
// matters because the article column is resizable at runtime (--reading-scale,
// down to 18% - see javascript/reading_width.js): the grid reflows on intrinsic
// sizing alone, where a media query, which only ever sees the viewport, could not.

// The page builder's "_min" thumbnail convention: <a href> is the full-size
// image, <img src> the _min file when one exists on disk. Memoised because a
// build asks about the same handful of photos on every page that links them.
const thumbCache = new Map();
const thumbFor = (src) => {
  if (thumbCache.has(src)) return thumbCache.get(src);
  let out = src;
  // Root-relative paths only: a remote URL has no local file to stat, and a
  // relative one has no stable base to resolve against.
  const m = /^(\/[^?#]*)(\.[a-z0-9]+)$/i.exec(src);
  if (m) {
    const min = m[1] + "_min" + m[2];
    try {
      if (fs.statSync(fsPath(min)).isFile()) out = min;
    } catch (e) { /* no thumbnail - serve the full-size file */ }
  }
  thumbCache.set(src, out);
  return out;
};

// Mirrors glightboxCaption() in page_builder_app_v2/src/puck/shared.ts.
// GLightbox parses data-glightbox as a ";"-separated list of "key: value" pairs,
// so a ";" or ":" in the text would silently split it into bogus fields.
const glightboxCaption = (title, desc) => {
  const clean = (s) => String(s || "").replace(/;/g, ",").replace(/:/g, " -").trim();
  return `title: ${clean(title)}; description: ${clean(desc)}`;
};

const escAttr = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Rewrites runs of adjacent images into a single grid token. Installed as the
// LAST core rule so markdown-it-attrs, linkify and texmath have all had their
// turn on the token stream before we collapse anything.
const imageGridPlugin = (md) => {
  // An inline token is "images only" when it holds nothing but images and
  // whitespace - a softbreak (one image on the line below another) or the empty
  // text nodes markdown-it leaves between them. Anything else (a stray word, a
  // link) means the author wrote a sentence containing images, not a gallery.
  const imagesOf = (inline) => {
    const imgs = [];
    for (const t of inline.children || []) {
      if (t.type === "image") { imgs.push(t); continue; }
      if (t.type === "softbreak" || t.type === "hardbreak") continue;
      if (t.type === "text" && !t.content.trim()) continue;
      return null;
    }
    return imgs.length ? imgs : null;
  };

  md.core.ruler.push("rvry_image_grid", (state) => {
    const toks = state.tokens;
    // Per-document counter, so the committed notebook_pages/*.html is byte-stable:
    // a module-level counter would keep climbing across the dev server's
    // incremental rebuilds and produce a phantom git diff on every save.
    let gridIndex = 0;
    for (let i = 0; i < toks.length; i++) {
      // Top-level paragraphs only. level > 0 means the paragraph sits inside a
      // list item, blockquote or table cell, where a flex grid has no business.
      if (toks[i].type !== "paragraph_open" || toks[i].level !== 0) continue;
      const imgs = [];
      let j = i;
      // Walk forward over consecutive image-only paragraphs, so images separated
      // by blank lines join the same grid as images on adjacent lines.
      while (
        j + 2 < toks.length &&
        toks[j].type === "paragraph_open" && toks[j].level === 0 &&
        toks[j + 1].type === "inline" && toks[j + 2].type === "paragraph_close"
      ) {
        const found = imagesOf(toks[j + 1]);
        if (!found) break;
        imgs.push(...found);
        j += 3;
      }
      if (imgs.length < 2) continue;   // a lone image stays a lone image
      const grid = new state.Token("rvry_image_grid", "", 0);
      grid.block = true;
      grid.meta = { images: imgs, group: "rvry-grid-" + (++gridIndex) };
      toks.splice(i, j - i, grid);
    }
    return true;
  });

  md.renderer.rules.rvry_image_grid = (tokens, idx) => {
    const { images, group } = tokens[idx].meta;
    const items = images.map((t) => {
      const full = t.attrGet("src") || "";
      const alt = t.content || "";
      const title = t.attrGet("title") || "";
      // The ratio is read from the FULL-size file, never the thumbnail: if a _min
      // were ever cropped rather than scaled, sourcing it there would misjustify
      // the whole row. An unreadable size (SVG, or a remote URL) falls back to
      // 3/2, the same assumption Gallery.tsx makes for an unrevalidated item.
      const fm = imageMeta(full) || {};
      const ar = fm.width && fm.height
        ? Math.round((fm.width / fm.height) * 10000) / 10000
        : 1.5;
      const src = thumbFor(full);
      // width/height describe the file actually in the <img>, which is the _min
      // when there is one - not the full-size file the ratio came from.
      const sm = src === full ? fm : (imageMeta(src) || {});
      const dim = sm.width && sm.height ? ` width="${sm.width}" height="${sm.height}"` : "";
      // Caption: the markdown title ("Optional title") when present, else the alt
      // text. Neither means no caption bar rather than an empty one.
      const cap = title || alt;
      // markdown-it-attrs may have put a class on the image; keep it rather than
      // silently dropping what the author asked for.
      const cls = t.attrGet("class");
      return '<a class="rvry-grid-item glightbox" href="' + escAttr(full) + '"' +
        ' data-gallery="' + escAttr(group) + '"' +
        (cap ? ' data-glightbox="' + escAttr(glightboxCaption(cap, "")) + '"' : "") +
        ' style="--ar:' + ar + '">' +
        '<img src="' + escAttr(src) + '" alt="' + escAttr(alt) + '"' +
        (cls ? ' class="' + escAttr(cls) + '"' : "") + dim +
        ' loading="lazy" decoding="async"></a>';
    });
    return '<div class="rvry-grid">' + items.join("") + '</div>\n';
  };
};

// Normalise anything Eleventy hands us as a date (Date, YAML date, string) to a
// full ISO-8601 timestamp. Returns null rather than throwing on junk, so one bad
// frontmatter date can never take out a whole page's structured data.
const isoStamp = (d) => {
  if (d == null || d === "") return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
};

module.exports = function(eleventyConfig) {


// 1. Markdown Library Settings
  let markdownLibrary = markdownIt({
    html: true,
    breaks: false,
    linkify: true
  })
  .use(markdownItAttrs)
  .use(markdownItLinkAttributes, {
    matcher(href) {
      // Return true for external links (links that start with http:// or https://)
      return href.match(/^https?:\/\//);
    },
    attrs: {
      target: "_blank",
      rel: "noopener noreferrer"
    }
  })
 .use(markdownItTexmath, {
    engine: katex,
    delimiters: ["dollars", "brackets"],      // \(...\) for inline, \[...\] for display blocks
    katexOptions: {
      output: "mathml",
      throwOnError: false
    }
  })
  // Last, so runs of adjacent images are collapsed into a justified grid only
  // after every other plugin has finished with the token stream.
  .use(imageGridPlugin);

  eleventyConfig.setLibrary("md", markdownLibrary);

  // 2. Collection: Get all posts from input_markdown folder AND input_custom_html_pages folder
  eleventyConfig.addCollection("notebook_posts", function(collectionApi) {
    // Get markdown posts from input_markdown directory (filter out drafts)
    const markdownPosts = collectionApi.getAll().filter(item => {
        return item.inputPath.includes(MARKDOWN_DIR) && item.data.draft !== true;
    });
    
    // Get HTML files from input_custom_html_pages directory (as virtual items for the collection)
    let htmlPosts = [];
    const htmlPagesDir = HTML_PAGES_DIR;
    
    if (fs.existsSync(htmlPagesDir)) {
      const files = fs.readdirSync(htmlPagesDir).filter(file => file.endsWith('.html'));
      
      htmlPosts = files.map(file => {
        const filePath = path.join(htmlPagesDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = matter(content);
        
        // Skip files with draft: true
        if (parsed.data.draft === true) {
          return null;
        }
        
        // Create a virtual collection item that looks like a real Eleventy item
        const item = {
          url: parsed.data.permalink || `/notebook_pages/${file}`,
          data: {
            title: parsed.data.title || "Untitled",
            date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
            tags: parsed.data.tags || [],
            image: parsed.data.image || null,
            description: parsed.data.description || null
          },
          date: parsed.data.date ? new Date(parsed.data.date) : new Date()
        };

        return item;
      }).filter(item => item !== null); // Remove null items (drafts)
    }
    
    // Combine both arrays and sort by date (newest first)
    return [...markdownPosts, ...htmlPosts].sort((a, b) => b.date - a.date);
  });

  // NEW: Collection for all unique tags
  eleventyConfig.addCollection("allTags", function(collectionApi) {
    const tagSet = new Set();
    
    // Get all notebook posts (filter out drafts)
    const posts = collectionApi.getAll().filter(item => {
      return item.inputPath.includes(MARKDOWN_DIR) && item.data.draft !== true;
    });
    
    // Also check input_custom_html_pages for tags
    const htmlPagesDir = HTML_PAGES_DIR;
    if (fs.existsSync(htmlPagesDir)) {
      const files = fs.readdirSync(htmlPagesDir).filter(file => file.endsWith('.html'));
      
      files.forEach(file => {
        const filePath = path.join(htmlPagesDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = matter(content);
        
        // Skip files with draft: true
        if (parsed.data.draft === true) {
          return;
        }
        
        if (parsed.data.tags && Array.isArray(parsed.data.tags)) {
          parsed.data.tags.forEach(tag => tagSet.add(tag));
        }
      });
    }
    
    // Collect tags from markdown posts
    posts.forEach(item => {
      if (item.data.tags && Array.isArray(item.data.tags)) {
        item.data.tags.forEach(tag => tagSet.add(tag));
      }
    });
    
    // Return sorted array of tags
    return Array.from(tagSet).sort();
  });

  // NEW: Collection for paginated tag data
  eleventyConfig.addCollection("paginatedTagData", function(collectionApi) {
    const allTags = [];
    const tagSet = new Set();
    const allPosts = collectionApi.getAll().filter(item => {
      return item.inputPath.includes(MARKDOWN_DIR) && item.data.draft !== true;
    });
    
    // Also check input_custom_html_pages
    const htmlPagesDir = HTML_PAGES_DIR;
    let htmlPosts = [];
    
    if (fs.existsSync(htmlPagesDir)) {
      const files = fs.readdirSync(htmlPagesDir).filter(file => file.endsWith('.html'));
      
      htmlPosts = files.map(file => {
        const filePath = path.join(htmlPagesDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = matter(content);
        
        // Skip files with draft: true
        if (parsed.data.draft === true) {
          return null;
        }
        
        return {
          url: parsed.data.permalink || `/notebook_pages/${file}`,
          data: {
            title: parsed.data.title || "Untitled",
            date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
            tags: parsed.data.tags || [],
            image: parsed.data.image || null,
            description: parsed.data.description || null
          },
          date: parsed.data.date ? new Date(parsed.data.date) : new Date()
        };
      }).filter(item => item !== null); // Remove null items (drafts)
    }
    
    const combinedPosts = [...allPosts, ...htmlPosts].sort((a, b) => b.date - a.date);
    
    // Collect all tags
    combinedPosts.forEach(post => {
      if (post.data.tags && Array.isArray(post.data.tags)) {
        post.data.tags.forEach(tag => tagSet.add(tag));
      }
    });
    
    // For each tag, create paginated data
    const postsPerPage = 40;
    Array.from(tagSet).sort().forEach(tag => {
      const taggedPosts = combinedPosts.filter(post => {
        return post.data.tags && post.data.tags.includes(tag);
      });
      
      const totalPages = Math.ceil(taggedPosts.length / postsPerPage);
      
      for (let i = 0; i < totalPages; i++) {
        const startIdx = i * postsPerPage;
        const endIdx = startIdx + postsPerPage;
        allTags.push({
          tag: tag,
          posts: taggedPosts.slice(startIdx, endIdx),
          pageNumber: i,
          totalPages: totalPages,
          isFirstPage: i === 0,
          isLastPage: i === totalPages - 1
        });
      }
    });
    
    return allTags;
  });

  // 3. Filter: Readable Date
  eleventyConfig.addFilter("readableDate", (dateObj) => {
    return new Date(dateObj).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric"
    });
  });

  // 4. Filter: Limit (for future use)
  eleventyConfig.addFilter("limit", (array, limit) => {
    return array.slice(0, limit);
  });

  // NEW: Filter to get posts by tag
  eleventyConfig.addFilter("filterByTag", (posts, tag) => {
    return posts.filter(post => {
      return post.data.tags && post.data.tags.includes(tag);
    });
  });

  // NEW: Filter to slugify tags for URLs
  eleventyConfig.addFilter("slugify", slugify);

  // Collection: music releases generated from JSON files in input_release/.
  // Each JSON becomes one page at release/<slug>.html (via eleventy_njk/release.njk)
  // and one tile on the discography index (discography.html via eleventy_njk/discography.njk).
  // Files prefixed with "_" are skipped (a simple draft mechanism).
  eleventyConfig.addCollection("releases", function() {
    const dir = RELEASE_DIR;
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => (f.endsWith(".json") || f.endsWith(".jsonc")) && !f.startsWith("_"))
      .map(f => {
        const d = parseJsonc(fs.readFileSync(path.join(dir, f), "utf8"));
        d.slug = d.slug || slugify(d.name);
        d.url = `/release/${d.slug}.html`;
        d.year = d.date ? new Date(d.date).getFullYear() : "";
        return d;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));  // newest first
  });

  // NEW: Filter to truncate text to a specific length
  eleventyConfig.addFilter("truncate", (str, length) => {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.substring(0, length).trim() + '...';
  });

  // Sitemap helpers: format any date as YYYY-MM-DD (W3C sitemap format)
  eleventyConfig.addFilter("isoDate", (dateObj) => {
    return new Date(dateObj).toISOString().slice(0, 10);
  });

  // Full ISO-8601 timestamp for article:published_time / article:modified_time.
  // Yields "" (so the meta tag stays empty rather than the build dying) on a
  // date Eleventy could not parse.
  eleventyConfig.addFilter("isoStamp", (dateObj) => isoStamp(dateObj) || "");

  // Strip a trailing ".html" so every emitted URL (canonical, og:url, sitemap
  // <loc>) matches the clean URL Cloudflare Pages actually serves — it 308-
  // redirects /foo.html -> /foo. Leaves "/" and already-clean URLs untouched.
  eleventyConfig.addFilter("cleanUrl", (url) => {
    return typeof url === "string" ? url.replace(/\.html$/, "") : url;
  });

  // Return a file's last-modified time (for honest <lastmod> on static pages).
  // Falls back to "now" if the file can't be stat'd.
  eleventyConfig.addFilter("fileModDate", (filePath) => {
    try {
      return fs.statSync(filePath).mtime;
    } catch (e) {
      return new Date();
    }
  });

  // Build timestamp (used as <lastmod> for generated tag pages)
  eleventyConfig.addGlobalData("buildDate", () => new Date());

  // JSON-LD for a single release page (eleventy_njk/release.njk). Returns a
  // script-safe MusicAlbum string built entirely from the input_release JSON,
  // linked to the canonical artist entity via byArtist @id. Emit with `| safe`.
  eleventyConfig.addFilter("musicAlbumLd", (release) => {
    const url = SITE_ORIGIN + release.url;
    const relTypeMap = { Single: "SingleRelease", EP: "EPRelease" };
    const obj = {
      "@context": "https://schema.org",
      "@type": "MusicAlbum",
      "@id": url + "#album",
      "name": release.name,
      "url": url,
      "albumReleaseType": relTypeMap[release.type] || "AlbumRelease",
      "byArtist": artistRef(release.artist),
    };
    if (release.artcover) obj.image = SITE_ORIGIN + release.artcover;
    if (release.date) obj.datePublished = calendarDate(release.date);
    if (Array.isArray(release.genres) && release.genres.length) obj.genre = release.genres;

    const links = release.streaming ? Object.values(release.streaming).filter(Boolean) : [];
    if (links.length) obj.sameAs = links;

    const tracks = Array.isArray(release.tracklist) ? release.tracklist : [];
    if (tracks.length) {
      obj.numTracks = tracks.length;
      obj.track = tracks.map((t, i) => {
        const rec = {
          "@type": "MusicRecording",
          "name": t.version ? `${t.name} (${t.version})` : t.name,
          "position": t.order != null ? t.order : i + 1,
        };
        const dur = isoDuration(t.length);
        if (dur) rec.duration = dur;
        const isrc = String(t.isrc || "").trim();
        if (isrc) rec.isrcCode = isrc;
        return rec;
      });
    }
    return jsonLdScript(obj);
  });

  // JSON-LD for the discography index (eleventy_njk/discography.njk): a breadcrumb
  // plus a CollectionPage whose ItemList mirrors the visible release grid. Driven
  // by the same collections.releases the grid uses. Emit with `| safe`.
  eleventyConfig.addFilter("discographyLd", (releases) => {
    const items = (releases || []).map((r, i) => {
      const rUrl = SITE_ORIGIN + r.url;
      const item = {
        "@type": "MusicAlbum",
        "@id": rUrl + "#album",
        "name": r.name,
        "url": rUrl,
        "byArtist": artistRef(r.artist),
      };
      if (r.artcover) item.image = SITE_ORIGIN + r.artcover;
      return { "@type": "ListItem", "position": i + 1, "url": rUrl, "item": item };
    });
    const graph = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE_ORIGIN + "/" },
            { "@type": "ListItem", "position": 2, "name": "Discography", "item": SITE_ORIGIN + "/discography.html" },
          ],
        },
        {
          "@type": "CollectionPage",
          "@id": SITE_ORIGIN + "/discography.html",
          "url": SITE_ORIGIN + "/discography.html",
          "name": "Harald Revery — Discography",
          "mainEntity": { "@type": "ItemList", "numberOfItems": items.length, "itemListElement": items },
        },
      ],
    };
    return jsonLdScript(graph);
  });

  // JSON-LD for a notebook post (eleventy_settings/base.njk). Takes the page's
  // own frontmatter as an object and returns a script-safe Article string.
  //
  // This MUST be built here rather than hand-written in the template: Nunjucks
  // autoescaping turns a quote in a description into &quot; inside the JSON
  // (corrupting the value) and leaves a backslash untouched (producing an
  // invalid \escape, which makes Google drop the whole block). Same reason
  // eleventy_njk/search-index.njk pipes every value through `| dump | safe`.
  // Emit with `| safe`.
  eleventyConfig.addFilter("articleLd", (data) => {
    const d = data || {};
    const url = SITE_ORIGIN + String(d.url || "").replace(/\.html$/, "");
    const published = isoStamp(d.date);
    const obj = {
      "@context": "https://schema.org",
      "@type": "Article",
      "@id": url + "#article",
      "mainEntityOfPage": { "@type": "WebPage", "@id": url },
      "url": url,
      "headline": d.title || "Untitled",
      "inLanguage": "en",
      "author": {
        "@type": "Person",
        "name": "Harald Revery",
        "url": SITE_ORIGIN + "/about",
      },
      // The canonical artist entity declared in full in index.html. MusicGroup
      // is an Organization subtype, so it is a valid Article publisher.
      "publisher": { "@id": SITE_ORIGIN + "/#artist" },
    };
    if (d.description) obj.description = d.description;
    if (published) {
      obj.datePublished = published;
      obj.dateModified = isoStamp(d.updated) || published;
    }
    const img = imageMeta(d.image || "/opengraphimg.jpg");
    if (img) {
      obj.image = { "@type": "ImageObject", "url": img.url };
      if (img.width) { obj.image.width = img.width; obj.image.height = img.height; }
    }
    return jsonLdScript(obj);
  });

  // Absolute URL + intrinsic size for a page's share image, so base.njk can emit
  // og:image:width/height (which stop crawlers guessing and let previews reserve
  // space). Returns { url, width?, height? }; width/height are absent when the
  // file is missing or is a format with no readable header (e.g. SVG).
  eleventyConfig.addFilter("imageMeta", (src) => imageMeta(src || "/opengraphimg.jpg"));

  // post.njk already renders the post title as the page's single <h1>, so a body
  // that also opens with "# Foo" emits a second one and dilutes the heading
  // semantics. When (and only when) the rendered body contains an h1, shift every
  // heading down one level so the relative hierarchy is preserved: h1->h2, h2->h3,
  // h3->h4, and so on. A body that already starts at h2 is returned untouched, so
  // this is a no-op for every post that was correct to begin with.
  //
  // <pre> blocks are masked out first: a post that *shows* "<h1>" as sample markup
  // must not have its example silently rewritten. h6 is left alone (no h7 exists).
  eleventyConfig.addFilter("demoteHeadings", (content) => {
    if (!content) return content;
    const blocks = [];
    let masked = String(content).replace(/<pre[\s\S]*?<\/pre>/gi, (m) => {
      blocks.push(m);
      return "@@RVRYPRE" + (blocks.length - 1) + "@@";
    });
    if (!/<h1[\s>]/i.test(masked)) return content;   // nothing to demote
    // Deepest level first, so a heading is never shifted twice in one pass.
    for (let lvl = 5; lvl >= 1; lvl--) {
      masked = masked.replace(new RegExp("<(/?)h" + lvl + "(?=[\\s>])", "gi"), "<$1h" + (lvl + 1));
    }
    return masked.replace(/@@RVRYPRE(\d+)@@/g, (m, i) => blocks[Number(i)]);
  });

  // Article outline (no client JS): inject id="" into <h2>/<h3>/<h4> so anchor links work.
  // Runs at build time on rendered markdown HTML. Respects an existing id (e.g. from
  // markdown-it-attrs) and de-duplicates slugs so every id is unique.
  eleventyConfig.addFilter("addAnchors", (content) => {
    if (!content) return content;
    const seen = {};
    const toSlug = (s) => s
      .replace(/<[^>]+>/g, "")      // strip inline tags
      .toLowerCase()
      .replace(/&[a-z]+;/g, "")     // drop HTML entities
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    return content.replace(/<h([234])([^>]*)>([\s\S]*?)<\/h\1>/g, (m, level, attrs, inner) => {
      if (/\bid\s*=/.test(attrs)) return m;            // keep author-supplied id
      let base = toSlug(inner) || "section";
      let slug = base, i = 1;
      while (seen[slug]) { i++; slug = `${base}-${i}`; }
      seen[slug] = true;
      return `<h${level}${attrs} id="${slug}">${inner}</h${level}>`;
    });
  });

  // Build a nested <ul> outline (H2 > H3 > H4) from already-anchored content.
  // Reads the real id="" values so it always matches addAnchors. Returns "" when
  // there are fewer than 2 headings (so the toggle can be hidden on short posts).
  eleventyConfig.addFilter("toc", (content) => {
    if (!content) return "";
    const heads = [];
    const re = /<h([234])[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      heads.push({
        level: +m[1],
        id: m[2],
        text: m[3].replace(/<[^>]+>/g, "").trim(),
        children: [],
      });
    }
    if (heads.length < 2) return "";
    // Nest each heading under the nearest preceding shallower one. A heading with
    // no shallower ancestor (an H3 before any H2, say) stays at the top level.
    const roots = [];
    const stack = [];
    for (const h of heads) {
      while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
      (stack.length ? stack[stack.length - 1].children : roots).push(h);
      stack.push(h);
    }
    const CLASSES = ["article-outline-list", "article-outline-sublist", "article-outline-subsublist"];
    const render = (nodes, depth) => {
      let out = '<ul class="' + CLASSES[Math.min(depth, CLASSES.length - 1)] + '">';
      for (const n of nodes) {
        out += '<li><a href="#' + n.id + '">' + n.text + "</a>";
        if (n.children.length) out += render(n.children, depth + 1);
        out += "</li>";
      }
      return out + "</ul>";
    };
    return render(roots, 0);
  });

  // 5. Process and copy input_custom_html_pages files to notebook_pages (strip frontmatter)
  eleventyConfig.on('eleventy.before', async () => {
    const outputDir = './notebook_pages';
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Process HTML files from input_custom_html_pages
    const htmlPagesDir = HTML_PAGES_DIR;
    if (fs.existsSync(htmlPagesDir)) {
      const files = fs.readdirSync(htmlPagesDir).filter(file => file.endsWith('.html'));
      
      files.forEach(file => {
        const inputPath = path.join(htmlPagesDir, file);
        const content = fs.readFileSync(inputPath, 'utf8');
        
        // Parse with gray-matter to separate frontmatter from content
        const parsed = matter(content);
        
        // Only skip files that explicitly have draft: true
        if (parsed.data.draft === true) {
          console.log(`Skipped ${file} (draft: true)`);
        } else {
          const outputPath = path.join(outputDir, file);
          
          // Write only the content (without frontmatter) to output
          fs.writeFileSync(outputPath, parsed.content, 'utf8');
          console.log(`Processed ${file} (frontmatter removed)`);
        }
      });
    }
  });

  return {
    dir: {
      input: ".",                 // Read from Root
      includes: "eleventy_settings", // Look for layouts here
      output: "."                 // Write to Root (Controlled by Permalinks)
    },
    templateFormats: ["njk", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};