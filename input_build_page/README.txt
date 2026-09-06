================================================================================
  input_build_page/ — pages exported by the page builder
================================================================================

One file per page, written by page_builder_app_v2 (Export). Each is YAML front
matter followed by a raw HTML BODY FRAGMENT: hero, content, date block and back
link — everything that sits between the nav and the footer, and nothing else.

THE CHROME IS NOT IN THESE FILES. Eleventy wraps each one in
eleventy_settings/base.njk, which supplies <!DOCTYPE>, <head> (title,
description, Open Graph, canonical — all from the front matter below),
eleventy_settings/nav.njk and eleventy_settings/footer.njk.

That is the point of this folder. Change the nav or the footer once and every
page here picks it up on the next build. The old exporter filled its own
shell.html, which carried a frozen copy of the nav and footer and silently
drifted out of date.

--------------------------------------------------------------------------------
  WHAT GOES HERE, AND WHAT DOES NOT
--------------------------------------------------------------------------------
HERE          Notebook posts built with the page builder.
NOT HERE      Complete standalone <html> documents — the browser apps
              (rvry_ascii, clock_and_date, the graph tools) and rare one-offs.
              Those stay in input_custom_html_pages/ and are copied verbatim.

A slug may exist in ONE of the two folders, never both: they would each write
notebook_pages/<slug>.html. The build fails with a "Slug collision" error rather
than letting one silently overwrite the other.

--------------------------------------------------------------------------------
  WHY THE FILES ARE .njk AND NOT .html
--------------------------------------------------------------------------------
"html" is not in Eleventy's templateFormats, so a .html file here would never be
picked up as a template. It cannot be added either: the input and output
directories are both the repo root, so every HTML file in the project would
become a template.

Despite the extension, NOTHING HERE IS PARSED AS A TEMPLATE.
input_build_page.11tydata.js sets templateEngineOverride: false, so the body is
emitted byte for byte. That is what lets a page contain {{ }}, {% %} or KaTeX
braces like \frac{{a}}{{b}} without breaking the build. _brace_test.njk is the
regression fixture — keep it, and if you ever touch the data file, publish it
once (draft: false) and confirm those sequences appear literally.

--------------------------------------------------------------------------------
  FRONT MATTER
--------------------------------------------------------------------------------
title         Page title. Drives <title>, og:title and the Notebook card.
date          "YYYY-MM-DD". Sorts the Notebook index; an empty date silently
              becomes the build date, so the page check warns about it.
tags          Flow sequence, e.g. ["photography", "test"]. Drives the tag pages.
image         Card thumbnail and share image.
description   Meta description, og:description and the card excerpt.
draft         true = renders nothing and leaves every collection. The file stays
              in the repo so you can keep working on it.
navScroll     true = the header hides at the top of the page and slides in on
              scroll. Adds .navi_mechanic AND loads navbar_scroll_min.js — they
              must travel together, so let the builder set this.
customJsonLd  true = base.njk does not emit its own Article JSON-LD, because the
              page carries its own resolved type (BlogPosting / ImageGallery /
              FAQPage). The builder always sets this.

--------------------------------------------------------------------------------
  PUBLISHING
--------------------------------------------------------------------------------
Export from the page builder, then build the site the usual way:

    ./eleventy-linux-x64            (or eleventy-win-x64.exe)

Then check nothing broke:

    ./healthcheck.sh

Renaming this folder means changing BUILD_PAGE_DIR in eleventy.config.js (and
recompiling the standalone binaries — eleventy_binary/README.md), the @source
line in input.css, the live_slugs loop in healthcheck.sh, and BUILD_PAGE_DIR in
page_builder_app_v2/src-tauri/src/commands.rs.
