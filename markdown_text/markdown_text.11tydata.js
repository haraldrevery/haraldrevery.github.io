// Directory data for markdown_text/ notebook posts.
//
// A post with `draft: true` is IGNORED by Eleventy: no page is rendered to
// notebook_pages/, and it is left out of every collection (so it never appears
// in the Notebook index, tag pages, or sitemap). This applies to both
// `npm start` (serve) and `npm run build`.
//
// The source .md file stays in the repo (git tracks it) so you can keep working
// on it — set `draft: false` (or delete the line) to publish it.
module.exports = {
  eleventyComputed: {
    permalink: (data) =>
      data.draft ? false : `notebook_pages/${data.page.fileSlug}.html`,
    layout: (data) => (data.draft ? false : "post.njk"),
    eleventyExcludeFromCollections: (data) => data.draft === true,
  },
};
