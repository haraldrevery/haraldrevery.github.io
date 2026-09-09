const markdownIt = require("markdown-it");
const markdownItAttrs = require("markdown-it-attrs");
const markdownItLinkAttributes = require("markdown-it-link-attributes");
const markdownItTexmath = require("markdown-it-texmath");
const katex = require("katex");
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

// The five content input folders. Every path below goes through these, so
// renaming an input folder is a one-line change here (plus the Tailwind @source
// list in input.css, the live_slugs loop in healthcheck.sh, and a recompile of
// the standalone Eleventy binaries, which bundle this file — see
// eleventy_binary/README.md).
const HTML_PAGES_DIR = "./input_custom_html_pages";  // standalone .html apps + one-offs
const MARKDOWN_DIR = "input_markdown";               // matched as a substring of inputPath
const BUILD_PAGE_DIR = "input_build_page";           // page-builder exports (body fragments)
const CUSTOM_POST_DIR = "input_custom_post";         // hand-written .html block posts
const RELEASE_DIR = "./input_release";               // one .json/.jsonc per release

// A notebook post whose source is a real Eleventy template — markdown in
// input_markdown/, a page-builder fragment in input_build_page/, or a
// hand-written block post in input_custom_post/ (registered as a virtual
// template further down). All three arrive through collectionApi.getAll() with
// their front matter already parsed, so they need none of the synthetic-item
// machinery that HTML_PAGES_DIR does (those files are not templates at all;
// they are copied verbatim by the eleventy.before hook and read off disk with
// gray-matter further down).
//
// Substring match, so the three names must stay mutually non-overlapping.
// "input_custom_post" is NOT a substring of "input_custom_html_pages" — check
// that again before renaming either one.
const isTemplatePost = (item) =>
  (item.inputPath.includes(MARKDOWN_DIR) ||
   item.inputPath.includes(BUILD_PAGE_DIR) ||
   item.inputPath.includes(CUSTOM_POST_DIR)) &&
  item.data.draft !== true;

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
const isoDate = (dateObj) => {
  const s = isoStamp(dateObj);
  return s ? s.slice(0, 10) : "";
};

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
// Fallback date for a notebook HTML page whose front matter has no `date:`.
// Uses the file's mtime, never `new Date()`: a build-time date sorts the post to
// the top of the notebook and emits a fresh value into search-index.json on
// every rebuild (git churn). Not null/epoch either — null makes the `b.date -
// a.date` sort comparator return NaN, and epoch silently prints as 1970-01-01.
const fallbackPostDate = (filePath, file) => {
  console.warn(`[notebook] ${file} has no \`date:\` in its front matter — using its file mtime.`);
  try { return fs.statSync(filePath).mtime; } catch (e) { return new Date(0); }
};

const isoStamp = (d) => {
  if (d == null || d === "") return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
};

module.exports = function(eleventyConfig) {

  // 0. input_custom_post/ — hand-written block posts, as VIRTUAL TEMPLATES.
  //
  // Each file is `.html` on disk: YAML front matter followed by a raw HTML BODY
  // FRAGMENT. The chrome is not in the file — eleventy_settings/post_body.njk
  // (and base.njk under it) supplies <!DOCTYPE>, the whole <head>, nav.njk and
  // footer.njk. Change the nav once and every page here follows on the next
  // build. That is the entire point of this folder, and the reason it exists
  // alongside input_custom_html_pages/ rather than replacing it: those files
  // are complete standalone documents (the browser apps) and must stay that way.
  //
  // WHY VIRTUAL TEMPLATES AND NOT A DIRECTORY DATA FILE
  // A .11tydata.js would be free (no binary recompile), but it can only
  // configure files Eleventy already picks up, and Eleventy will never pick up
  // a .html here: "html" is not in templateFormats, and it CANNOT be added,
  // because dir.input and dir.output are both the repo root — every HTML file
  // in the project would become a template and Eleventy would read its own
  // output back in. input_build_page/ works around that by naming its files
  // .njk. addTemplate() is the way to keep the .html extension: the file is
  // read from disk here and handed to Eleventy under a virtual .njk inputPath
  // that no real file occupies.
  //
  // WHY templateEngineOverride: false IS LOAD-BEARING
  // The body is arbitrary hand-written HTML. It can legitimately contain "{{",
  // "{%" or KaTeX braces such as \frac{{a}}{{b}}. Without this, Nunjucks would
  // parse the body and one stray brace in a caption would take the WHOLE build
  // down. With it, Eleventy resolves the template to the "html" engine with no
  // preprocessor, whose compile() returns the string untouched — while layouts
  // still apply, because TemplateEngine.useLayouts() defaults to true. Raw
  // body, real layout. _template.html is the regression fixture: it contains
  // every such sequence, so publishing it once (draft: false) proves this.
  //
  // Front matter wins over the defaults below, so a page can set its own
  // permalink or pick a different layout. templateEngineOverride is applied
  // AFTER the spread on purpose — it is not a knob.
  //
  // KNOWN LIMITATION (--watch / --serve only): this runs once, when the config
  // is loaded. A post ADDED while `npm start` is running is not registered and
  // will not appear until the watcher is restarted. Editing an existing post
  // rebuilds normally. Same tradeoff the reference site documents for its own
  // slug registry; the standalone binaries have no watch mode, so this affects
  // `npm start` only.
  if (fs.existsSync(CUSTOM_POST_DIR)) {
    const seen = new Map();
    for (const file of fs.readdirSync(CUSTOM_POST_DIR).filter((f) => f.endsWith(".html")).sort()) {
      const inputPath = path.join(CUSTOM_POST_DIR, file);
      const slug = file.slice(0, -".html".length);
      let parsed;
      try {
        parsed = matter(fs.readFileSync(inputPath, "utf8"));
      } catch (e) {
        // A malformed YAML block is the one authoring mistake that is easy to
        // make by hand and impossible to see in the output, because the page
        // would just be missing. Name the file and stop.
        throw new Error(`${inputPath}: could not parse its front matter — ${e.message}`);
      }
      if (parsed.data.draft === true) continue;
      if (seen.has(slug)) {
        throw new Error(`Slug collision inside ${CUSTOM_POST_DIR}/: ${seen.get(slug)} and ${file}`);
      }
      seen.set(slug, file);
      eleventyConfig.addTemplate(`${CUSTOM_POST_DIR}/${slug}.njk`, parsed.content, {
        layout: "post_body.njk",
        permalink: `notebook_pages/${slug}.html`,
        date: parsed.data.date || fallbackPostDate(inputPath, file),
        tags: [],
        ...parsed.data,
        templateEngineOverride: false,
      });
    }
  }



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
        return isTemplatePost(item);
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
        
        const postDate = parsed.data.date
          ? new Date(parsed.data.date)
          : fallbackPostDate(filePath, file);

        // Create a virtual collection item that looks like a real Eleventy item
        const item = {
          url: parsed.data.permalink || `/notebook_pages/${file}`,
          data: {
            title: parsed.data.title || "Untitled",
            date: postDate,
            tags: parsed.data.tags || [],
            image: parsed.data.image || null,
            description: parsed.data.description || null
          },
          date: postDate
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
      return isTemplatePost(item);
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
      return isTemplatePost(item);
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
        
        const postDate = parsed.data.date
          ? new Date(parsed.data.date)
          : fallbackPostDate(filePath, file);

        return {
          url: parsed.data.permalink || `/notebook_pages/${file}`,
          data: {
            title: parsed.data.title || "Untitled",
            date: postDate,
            tags: parsed.data.tags || [],
            image: parsed.data.image || null,
            description: parsed.data.description || null
          },
          date: postDate
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
        // Release JSON carries unpadded calendar dates ("2019-5-14", "2015-01-1").
        // `new Date()` reads those as LOCAL midnight, so any UTC formatting of
        // them (isoDate, rfc822Date) lands on the previous day west of GMT --
        // the sitemap used to publish forest_shine as 2019-05-13 and remixes as
        // 2014-12-31. dateISO is the padded calendar string; dateUTC is that
        // same day pinned to UTC midnight, so it survives both formatters.
        // Use these two, never the raw d.date, anywhere a date is FORMATTED.
        // d.date stays untouched for readableDate, which wants local parsing.
        d.dateISO = d.date ? calendarDate(d.date) : "";
        d.dateUTC = d.dateISO ? new Date(d.dateISO + "T00:00:00Z") : null;
        d.year = d.dateISO ? Number(d.dateISO.slice(0, 4)) : "";
        return d;
      })
      // Sorted on dateUTC for the same reason: a local-parsed "2015-01-1" and a
      // local-parsed "2015-1-1" are the same instant, but only after padding.
      .sort((a, b) => (b.dateUTC || 0) - (a.dateUTC || 0));  // newest first
  });

  // NEW: Filter to truncate text to a specific length
  eleventyConfig.addFilter("truncate", (str, length) => {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.substring(0, length).trim() + '...';
  });

  // Sitemap helpers: format any date as YYYY-MM-DD (W3C sitemap format)
  eleventyConfig.addFilter("isoDate", isoDate);

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

  // Newest date in a list of posts/releases, for the <lastmod> of an index page
  // that lists them (tag pages, the discography, the paginated notebook index).
  // Deliberately NOT buildDate: buildDate moves every day the site is rebuilt,
  // so sitemap.xml would be rewritten with no content change (git churn) and the
  // field would stop meaning anything to a crawler. Returns the site's own
  // epoch-free fallback (now) only for an empty list, which never reaches a URL.
  eleventyConfig.addFilter("newestDate", (items) => {
    const times = (items || [])
      .map((it) => {
        // dateUTC first: a release object also carries a raw `date` string that
        // parses as local midnight, which would shift this by a day (see the
        // releases collection). Posts have no dateUTC and fall straight through.
        const d = (it && it.dateUTC) || (it && it.data && it.data.updated) || (it && it.date) || (it && it.data && it.data.date);
        const t = d == null ? NaN : new Date(d).getTime();
        return Number.isFinite(t) ? t : NaN;
      })
      .filter((t) => Number.isFinite(t));
    return times.length ? new Date(Math.max(...times)) : new Date();
  });

  // Page numbers (2, 3, ...) of the paginated Notebook index, so sitemap.njk can
  // list them. MUST stay in step with the `size:` in eleventy_njk/blog.njk —
  // page 1 is /notebook and is listed separately, so this yields nothing until
  // the notebook outgrows a single page.
  const NOTEBOOK_PAGE_SIZE = 40;
  eleventyConfig.addFilter("notebookIndexPages", (posts) => {
    const total = Math.ceil((posts || []).length / NOTEBOOK_PAGE_SIZE);
    return Array.from({ length: Math.max(0, total - 1) }, (_, i) => i + 2);
  });

  // RFC-822 date, the format RSS 2.0 <pubDate>/<lastBuildDate> require.
  // Built from UTC parts rather than toUTCString() so the output cannot drift
  // with the build machine's locale. Invalid dates yield "" (the element is
  // then omitted) rather than "Invalid Date", which would fail feed validation.
  const RFC822_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const RFC822_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                         "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  eleventyConfig.addFilter("rfc822Date", (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    const p2 = (n) => String(n).padStart(2, "0");
    return `${RFC822_DAYS[dt.getUTCDay()]}, ${p2(dt.getUTCDate())} ` +
           `${RFC822_MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()} ` +
           `${p2(dt.getUTCHours())}:${p2(dt.getUTCMinutes())}:${p2(dt.getUTCSeconds())} GMT`;
  });

  // Merge the Notebook and the discography into one chronological list for
  // eleventy_njk/feed.njk. Done here rather than in the template because
  // Nunjucks cannot concatenate two collections and re-sort them, and because
  // the two shapes are genuinely different: a post is an Eleventy item
  // (post.data.title, post.date), a release is a plain object off the
  // input_release JSON (r.name, r.dateUTC).
  //
  // The normalized item is deliberately minimal -- exactly the fields an <item>
  // needs. `kind` becomes the extra <category> that lets a subscriber tell a
  // release from an essay at a glance; `image` becomes <enclosure> for releases,
  // which is how readers show cover art.
  //
  // guid/link is the CLEAN url for both, matching each page's own
  // <link rel="canonical">. Readers dedupe on guid, so this must never change
  // for an item that already shipped.
  eleventyConfig.addFilter("feedItems", (posts, releases) => {
    const fromPost = (p) => ({
      kind: "notebook",
      title: (p.data && p.data.title) || "Untitled",
      url: String(p.url || "").replace(/\.html$/, ""),
      date: (p.data && p.data.updated) || p.date || (p.data && p.data.date) || null,
      description: (p.data && p.data.description) || "",
      categories: (p.data && p.data.tags) || [],
      // Same share image the post's own og:image uses (base.njk falls back to
      // opengraphimg.jpg the same way), so a reader shows the artwork a reader
      // would see if the link were pasted into a chat.
      image: (p.data && p.data.image) || "/opengraphimg.jpg",
    });
    const fromRelease = (r) => ({
      kind: "release",
      // The type ("Single", "Collection") is part of the title because a feed
      // entry has no other room to say what it is, and "Krakatau" alone in a
      // river of essay headlines does not read as a piece of music.
      title: r.type ? `${r.name} (${r.type})` : r.name,
      url: String(r.url || "").replace(/\.html$/, ""),
      date: r.dateUTC || null,
      description: r.introduction || "",
      // Genres are the release's natural tags; they already index the site
      // search the same way (see search-index.njk).
      categories: r.genres || [],
      image: r.artcoverMin || r.artcover || null,
    });

    return [
      ...(posts || []).map(fromPost),
      ...(releases || []).map(fromRelease),
    ]
      .filter((it) => it.date && Number.isFinite(new Date(it.date).getTime()))
      .sort((a, b) => new Date(b.date) - new Date(a.date));  // newest first
  });

  // Byte size of a file in the built site, for <enclosure length="">. RSS wants
  // the attribute present; 0 is the conventional "unknown" and is what an
  // unreadable path yields rather than dropping the enclosure entirely.
  eleventyConfig.addFilter("fileSize", (sitePath) => {
    try {
      // Site-absolute path -> repo-relative, same convention as fileModDate:
      // Eleventy runs with the project root as cwd.
      return fs.statSync(String(sitePath).replace(/^\//, "")).size;
    } catch (e) {
      return 0;
    }
  });

  // MIME type for an <enclosure>, from the file extension. Cover art is the
  // only thing enclosed today, so the map is deliberately small.
  const MIME_BY_EXT = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                        ".png": "image/png", ".gif": "image/gif",
                        ".webp": "image/webp", ".avif": "image/avif" };
  eleventyConfig.addFilter("mimeType", (sitePath) => {
    return MIME_BY_EXT[path.extname(String(sitePath || "")).toLowerCase()] || "application/octet-stream";
  });

  // Build timestamp (kept for any template that genuinely wants "now")
  eleventyConfig.addGlobalData("buildDate", () => new Date());

  // JSON-LD for a single release page (eleventy_njk/release.njk). Returns a
  // script-safe MusicAlbum string built entirely from the input_release JSON,
  // linked to the canonical artist entity via byArtist @id. Emit with `| safe`.
  eleventyConfig.addFilter("musicAlbumLd", (release) => {
    // Clean URL, matching <link rel="canonical"> and the sitemap <loc>.
    // Cloudflare Pages 308-redirects /foo.html -> /foo, so a schema.org `url`
    // still carrying ".html" names a redirect rather than the canonical page
    // (articleLd already strips it; these two had drifted).
    const url = SITE_ORIGIN + String(release.url || "").replace(/\.html$/, "");
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
    const datePublished = release.date ? calendarDate(release.date) : "";
    if (datePublished) obj.datePublished = datePublished;
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
    const clean = (u) => SITE_ORIGIN + String(u || "").replace(/\.html$/, "");
    const items = (releases || []).map((r, i) => {
      const rUrl = clean(r.url);
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
            { "@type": "ListItem", "position": 2, "name": "Discography", "item": SITE_ORIGIN + "/discography" },
          ],
        },
        {
          "@type": "CollectionPage",
          "@id": SITE_ORIGIN + "/discography",
          "url": SITE_ORIGIN + "/discography",
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

      // Two unrelated mechanisms now write notebook_pages/<slug>.html: this
      // verbatim fs copy, and a real Eleventy template from input_build_page/.
      // Eleventy's own duplicate-output guard (TemplateMap) only compares INPUT
      // TEMPLATES, so it cannot see this copy — the two would silently clobber
      // each other, with the winner decided by whether the hook or the write
      // ran last. Fail loudly instead; a page vanishing on one build and
      // reappearing on the next is far worse to debug than a build error.
      // input_markdown/ is checked too: all THREE input dirs resolve to the same
      // notebook_pages/<slug>.html. A .md vs .njk clash is caught by Eleventy's
      // own TemplateMap guard (both are real templates), but a clash with this
      // verbatim fs copy is invisible to it in either direction.
      const slugsIn = (dir, ext) => {
        if (!fs.existsSync(dir)) return new Set();
        return new Set(
          fs.readdirSync(dir)
            .filter(f => f.endsWith(ext))
            .map(f => f.slice(0, -ext.length))
        );
      };
      const htmlSlugs = files.map(f => f.slice(0, -'.html'.length));
      // CUSTOM_POST_DIR is in this list for the same reason BUILD_PAGE_DIR is:
      // its pages are virtual templates, so Eleventy's TemplateMap guard covers
      // a clash with input_markdown/ or input_build_page/, but it cannot see the
      // verbatim fs copy below and would let the two silently overwrite.
      for (const [dir, ext] of [[BUILD_PAGE_DIR, '.njk'], [MARKDOWN_DIR, '.md'], [CUSTOM_POST_DIR, '.html']]) {
        const other = slugsIn(dir, ext);
        const clashes = htmlSlugs.filter(slug => other.has(slug));
        if (clashes.length) {
          throw new Error(
            `Slug collision: ${clashes.join(', ')} exists in BOTH ` +
            `${HTML_PAGES_DIR} and ${dir}/. Both would write ` +
            `notebook_pages/<slug>.html. Rename or delete one.`
          );
        }
      }
      
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