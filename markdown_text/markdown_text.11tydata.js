// Directory data for markdown_text/ notebook posts.
//
// Drafts (frontmatter `draft: true`) still build to a page, but they are
// UNLISTED: the notebook_posts / allTags / paginatedTagData collections in
// eleventy.config.js filter out `draft: true`, so drafts never appear in the
// Notebook index, tag pages, or sitemap, and nothing links to them. They remain
// reachable only by their direct URL ("not indexed", per the site's definition).
module.exports = {
  layout: "post.njk",
  permalink: "notebook_pages/{{ page.fileSlug }}.html",
};
