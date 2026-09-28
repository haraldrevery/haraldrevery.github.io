// Directory data for input_markdown/ notebook posts.
//
// A post with `draft: true` is IGNORED by Eleventy: no page is rendered to
// notebook_pages/, and it is left out of every collection (so it never appears
// in the Notebook index, tag pages, or sitemap). This applies to both
// `npm start` (serve) and `npm run build`.
//
// The source .md file stays in the repo (git tracks it) so you can keep working
// on it — set `draft: false` (or delete the line) to publish it.

const path = require("path");

// `draft:` is true or false, nothing else — the same rule as isDraft() in
// eleventy.config.js for the other two post folders. `draft: yes` is a STRING in
// YAML, and a truthy check here used to render no page while the post still
// got a Notebook card pointing at it.
const isDraft = (data) => {
  const d = data.draft;
  if (d === undefined || d === null || d === false) return false;
  if (d === true) return true;
  throw new Error(
    `${data.page.inputPath}: \`draft:\` must be true or false, not ${JSON.stringify(d)}. ` +
    `Write \`draft: true\` to keep the post unpublished, or delete the line to publish it.`
  );
};

module.exports = {
  // Markdown only - no Nunjucks pass first. eleventy.config.js sets
  // markdownTemplateEngine "njk" for every .md file (input_legal/legal.md needs
  // it), which made a post's text a Nunjucks template: "## Heading {#my-id}"
  // (markdown-it-attrs, which the config enables) opened a Nunjucks comment and
  // failed the WHOLE build, and "$\frac{{a}}{b}$" or `{{ user.name }}` in inline
  // code were silently emptied (verified 2026-09-28). No post used Nunjucks on
  // purpose; every published page rendered byte-identical after this line.
  templateEngineOverride: "md",
  eleventyComputed: {
    // The file name is the slug, exactly. `page.fileSlug` AND `page.filePathStem`
    // both drop a leading date ("2026-09-01-trip.md" -> "trip", verified), and
    // the slug-collision check in eleventy.config.js and healthcheck.sh both
    // assume file name == page name, so read the real name off inputPath.
    permalink: (data) =>
      isDraft(data) ? false : `notebook_pages/${path.basename(data.page.inputPath, ".md")}.html`,
    layout: (data) => (isDraft(data) ? false : "post.njk"),
    eleventyExcludeFromCollections: (data) => isDraft(data),
  },
};
