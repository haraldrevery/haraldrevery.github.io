const markdownIt = require("markdown-it");
const markdownItAttrs = require("markdown-it-attrs");
const markdownItLinkAttributes = require("markdown-it-link-attributes");
const markdownItTexmath = require("markdown-it-texmath");
const katex = require("katex");
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

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
// (so release_input/*.jsonc templates can be self-documenting). String-aware,
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
  });
  
  eleventyConfig.setLibrary("md", markdownLibrary);

  // 2. Collection: Get all posts from markdown_text folder AND html_extras folder
  eleventyConfig.addCollection("notebook_posts", function(collectionApi) {
    // Get markdown posts from markdown_text directory (filter out drafts)
    const markdownPosts = collectionApi.getAll().filter(item => {
        return item.inputPath.includes("markdown_text") && item.data.draft !== true;
    });
    
    // Get HTML files from html_extras directory (as virtual items for the collection)
    let htmlPosts = [];
    const htmlExtrasDir = "./html_extras";
    
    if (fs.existsSync(htmlExtrasDir)) {
      const files = fs.readdirSync(htmlExtrasDir).filter(file => file.endsWith('.html'));
      
      htmlPosts = files.map(file => {
        const filePath = path.join(htmlExtrasDir, file);
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
      return item.inputPath.includes("markdown_text") && item.data.draft !== true;
    });
    
    // Also check html_extras for tags
    const htmlExtrasDir = "./html_extras";
    if (fs.existsSync(htmlExtrasDir)) {
      const files = fs.readdirSync(htmlExtrasDir).filter(file => file.endsWith('.html'));
      
      files.forEach(file => {
        const filePath = path.join(htmlExtrasDir, file);
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
      return item.inputPath.includes("markdown_text") && item.data.draft !== true;
    });
    
    // Also check html_extras
    const htmlExtrasDir = "./html_extras";
    let htmlPosts = [];
    
    if (fs.existsSync(htmlExtrasDir)) {
      const files = fs.readdirSync(htmlExtrasDir).filter(file => file.endsWith('.html'));
      
      htmlPosts = files.map(file => {
        const filePath = path.join(htmlExtrasDir, file);
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

  // Collection: music releases generated from JSON files in release_input/.
  // Each JSON becomes one page at release/<slug>.html (via eleventy_njk/release.njk)
  // and one tile on the discography index (discography.html via eleventy_njk/discography.njk).
  // Files prefixed with "_" are skipped (a simple draft mechanism).
  eleventyConfig.addCollection("releases", function() {
    const dir = "./release_input";
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

  // Article outline (no client JS): inject id="" into <h2>/<h3> so anchor links work.
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
    return content.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/g, (m, level, attrs, inner) => {
      if (/\bid\s*=/.test(attrs)) return m;            // keep author-supplied id
      let base = toSlug(inner) || "section";
      let slug = base, i = 1;
      while (seen[slug]) { i++; slug = `${base}-${i}`; }
      seen[slug] = true;
      return `<h${level}${attrs} id="${slug}">${inner}</h${level}>`;
    });
  });

  // Build a nested <ul> outline (H2 with H3 nested) from already-anchored content.
  // Reads the real id="" values so it always matches addAnchors. Returns "" when
  // there are fewer than 2 headings (so the toggle can be hidden on short posts).
  eleventyConfig.addFilter("toc", (content) => {
    if (!content) return "";
    const heads = [];
    const re = /<h([23])[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      heads.push({ level: +m[1], id: m[2], text: m[3].replace(/<[^>]+>/g, "").trim() });
    }
    if (heads.length < 2) return "";
    let html = '<ul class="article-outline-list">';
    let openLi = false, openSub = false;
    for (const h of heads) {
      if (h.level === 2) {
        if (openSub) { html += "</ul>"; openSub = false; }
        if (openLi) { html += "</li>"; openLi = false; }
        html += `<li><a href="#${h.id}">${h.text}</a>`;
        openLi = true;
      } else {
        if (!openLi) { html += `<li><a href="#${h.id}">${h.text}</a></li>`; continue; }
        if (!openSub) { html += '<ul class="article-outline-sublist">'; openSub = true; }
        html += `<li><a href="#${h.id}">${h.text}</a></li>`;
      }
    }
    if (openSub) html += "</ul>";
    if (openLi) html += "</li>";
    return html + "</ul>";
  });

  // 5. Process and copy html_extras files to notebook_pages (strip frontmatter)
  eleventyConfig.on('eleventy.before', async () => {
    const outputDir = './notebook_pages';
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Process HTML files from html_extras
    const htmlExtrasDir = './html_extras';
    if (fs.existsSync(htmlExtrasDir)) {
      const files = fs.readdirSync(htmlExtrasDir).filter(file => file.endsWith('.html'));
      
      files.forEach(file => {
        const inputPath = path.join(htmlExtrasDir, file);
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