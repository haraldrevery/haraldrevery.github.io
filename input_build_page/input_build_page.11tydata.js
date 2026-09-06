// Directory data for input_build_page/ — pages exported by the page builder
// (page_builder_app_v2). Each file is YAML front matter followed by a raw HTML
// BODY FRAGMENT: everything between the nav and the footer, and nothing else.
//
// The chrome is NOT in these files. base.njk supplies <!DOCTYPE>, <head> (title,
// description, OG/Twitter, canonical, JSON-LD — all derived from the front
// matter below), eleventy_settings/nav.njk and eleventy_settings/footer.njk. So
// a nav or footer change reaches every builder page on the next build, with
// nothing to keep in sync. That is the whole point of this directory: the old
// exporter filled page_builder_app_v2/shell.html, which carried its own frozen
// copy of the nav and footer and silently drifted.
//
// STANDALONE PAGES DO NOT BELONG HERE. input_custom_html_pages/ still holds
// complete <html> documents for the browser apps (rvry_ascii, clock_and_date,
// the graph tools) and rare one-offs. Those are copied verbatim by the
// eleventy.before hook in eleventy.config.js and never get this layout.
//
// WHY .njk AND NOT .html
// "html" is not in templateFormats (eleventy.config.js), so a .html file here
// would never be picked up as a template — and adding "html" is not an option,
// because the input and output directories are both the repo root, which would
// turn every HTML file in the project into a template.
//
// WHY templateEngineOverride: false IS LOAD-BEARING
// The body is arbitrary exported HTML. It can legitimately contain "{{", "{%"
// or KaTeX braces such as \frac{{a}}{{b}}. Without this line Nunjucks would
// parse the body and a stray brace in a text field would take the WHOLE build
// down. With it, Eleventy resolves the template to the "html" engine with no
// preprocessor, whose compile() returns the string untouched
// (node_modules/@11ty/eleventy/src/Engines/Html.js) — while layouts still apply,
// because TemplateEngine.useLayouts() defaults to true. Raw body, real layout.
//
// _brace_test.njk is the regression fixture for exactly that. Keep it.
//
// WHY THIS LIVES HERE AND NOT IN eleventy.config.js
// Same reason as input_markdown/ and input_legal/: the standalone build binaries
// bundle eleventy.config.js, so touching that file forces a ~95 MB Bun recompile
// (eleventy_binary/README.md). Directory data files are read from disk on every
// run, so everything here stays editable without recompiling anything.
//
// A page with `draft: true` renders nothing and is left out of every collection,
// exactly as in input_markdown/.
module.exports = {
  templateEngineOverride: false,
  eleventyComputed: {
    permalink: (data) =>
      data.draft ? false : `notebook_pages/${data.page.fileSlug}.html`,
    layout: (data) => (data.draft ? false : "base.njk"),
    eleventyExcludeFromCollections: (data) => data.draft === true,
  },
};
