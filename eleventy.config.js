const markdownIt = require("markdown-it");
const markdownItAttrs = require("markdown-it-attrs");
const markdownItLinkAttributes = require("markdown-it-link-attributes");
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

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
        
        // DEBUG: Log what we're seeing
        console.log(`[DEBUG] Processing ${file}`);
        console.log(`[DEBUG] Description from frontmatter: "${parsed.data.description}"`);
        
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
        
        console.log(`[DEBUG] Item data.description: "${item.data.description}"`);
        console.log('---');
        
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
  eleventyConfig.addFilter("slugify", (str) => {
    return str
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  });

  // NEW: Filter to truncate text to a specific length
  eleventyConfig.addFilter("truncate", (str, length) => {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.substring(0, length).trim() + '...';
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