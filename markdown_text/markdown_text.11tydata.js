// Directory data for markdown_text/ notebook posts.
// (Replaces the old markdown_text.json so drafts can be handled in JS.)
module.exports = {
  eleventyComputed: {
    // A post with `draft: true` produces NO output file and is left out of all
    // collections during a production build (`npm run build`). During
    // `npm start` (serve/watch) drafts stay visible so you can preview them.
    permalink: (data) => {
      if (data.draft && process.env.ELEVENTY_RUN_MODE === "build") {
        return false;
      }
      return `notebook_pages/${data.page.fileSlug}.html`;
    },
    // Skip the full page layout for drafts on build (they have no URL, so the
    // nav/head templates that reference page.url shouldn't run on them).
    layout: (data) => {
      if (data.draft && process.env.ELEVENTY_RUN_MODE === "build") {
        return false;
      }
      return "post.njk";
    },
    eleventyExcludeFromCollections: (data) => {
      if (data.draft && process.env.ELEVENTY_RUN_MODE === "build") {
        return true;
      }
      return data.eleventyExcludeFromCollections || false;
    },
  },
};
