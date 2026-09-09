================================================================================
  input_custom_post/ — hand-written notebook posts, in plain .html
================================================================================

One .html file per post. Each is YAML front matter followed by a raw HTML BODY
FRAGMENT — the blocks that make up the article, and nothing else.

THE CHROME IS NOT IN THESE FILES, and must not be. Eleventy wraps each one in
eleventy_settings/post_body.njk, which adds the date, the <h1> and the back
links, and under that eleventy_settings/base.njk, which supplies <!DOCTYPE>,
the entire <head> (title, description, Open Graph, Twitter, canonical, JSON-LD
— all derived from the front matter below), eleventy_settings/nav.njk and
eleventy_settings/footer.njk.

THAT IS THE WHOLE POINT OF THIS FOLDER. Change the nav or the footer once and
every page here picks it up on the next build, with nothing to keep in sync.

Start by copying blocks out of _template.html.

--------------------------------------------------------------------------------
  WHAT GOES HERE, AND WHAT DOES NOT
--------------------------------------------------------------------------------
HERE          Notebook posts written by hand out of HTML blocks.

NOT HERE      Complete standalone <html> documents — the browser apps
              (rvry_ascii, clock_and_date, 1dgraph, 2dphaseportrait,
              event_card, color_theme). Those genuinely need their own <head>
              and their own scripts. They stay in input_custom_html_pages/ and
              are copied verbatim, exactly as before. Nothing about that folder
              changed, and it is not going away.

NOT HERE      Page-builder exports. Those go to input_build_page/ as .njk
              fragments and use base.njk directly. Same idea, different
              producer.

NOT HERE      Prose-first posts. Markdown in input_markdown/ is less work for
              an article that is mostly words, and it gets the image grid,
              KaTeX and the outline for free.

--------------------------------------------------------------------------------
  ONE SLUG, ONE FOLDER
--------------------------------------------------------------------------------
input_markdown/, input_custom_html_pages/, input_build_page/ and this folder
ALL publish to notebook_pages/<slug>.html. A slug may exist in exactly one of
them. Two would each write the same file, so the build stops with a "Slug
collision" error naming both — that check is in eleventy.config.js and it is
there because the failure it prevents (a page silently overwritten, differently
on each build depending on which step ran last) is miserable to debug.

--------------------------------------------------------------------------------
  FRONT MATTER
--------------------------------------------------------------------------------
title         Page title. Drives <title>, og:title, the <h1> and the Notebook
              card. Required in practice.
date          "YYYY-MM-DD". Sorts the Notebook index. Leave it out and the
              file's mtime is used and a warning is printed — set it.
tags          Flow sequence, e.g. ["photography", "test"]. Drives the tag pages.
image         Card thumbnail and share image. Root-relative, e.g.
              "/photos/2025galdhoepiggen/x_min.jpg".
description   Meta description, og:description and the card excerpt.
draft         true = publishes nothing and leaves every collection. The file
              stays in the repo so you can keep working on it.
header        false = omit the date/title/back-link block, for a page that
              opens on its own hero and carries its own title.
outline       true = add the "On this page" panel, built from the h2/h3 in the
              body. Off by default.
navScroll     true = the header hides at the top and slides in on scroll. Adds
              .navi_mechanic AND loads navbar_scroll_min.js; they must travel
              together, which is why it is one flag.
customJsonLd  true = base.njk does not emit its own Article JSON-LD, because
              the page carries its own. Leave it off unless you wrote one.

--------------------------------------------------------------------------------
  WHY .html HERE WORKS, WHEN IT DOES NOT IN input_build_page/
--------------------------------------------------------------------------------
Worth knowing before changing anything, because it looks like an inconsistency.

"html" is NOT in Eleventy's templateFormats, so a .html file is never picked up
as a template. It cannot be added either: dir.input and dir.output are both the
repo root, so every HTML file in the project would become a template and
Eleventy would start reading its own output back in. input_build_page/ works
around that by naming its files .njk.

This folder takes the other route. eleventy.config.js reads these .html files
from disk itself and registers each one with eleventyConfig.addTemplate() under
a VIRTUAL .njk input path that no real file occupies. Eleventy treats it as a
real template — layouts, collections, the tag pages, the sitemap, the feed and
the search index all work normally — while the file on disk keeps the extension
that makes it pleasant to edit.

NOTHING HERE IS PARSED AS A TEMPLATE. The addTemplate call passes
templateEngineOverride: false, so Eleventy resolves the page to the "html"
engine with no preprocessor, whose compile() returns the string untouched —
while layouts still apply. That is what lets a page contain {{ }}, {% %} or
KaTeX braces like \frac{{a}}{{b}} without breaking the build. The last block of
_template.html is the regression fixture for exactly that; keep it, and if the
addTemplate call is ever touched, publish that file once (draft: false) and
confirm those sequences appear literally.

--------------------------------------------------------------------------------
  TWO THINGS THAT WILL CATCH YOU OUT
--------------------------------------------------------------------------------
1. `npm start` DOES NOT SEE A NEW FILE.
   The registration above runs once, when the config is loaded. A post ADDED
   while the watcher is running is not registered, and simply does not appear —
   no error, no page. Editing an existing post rebuilds normally. Restart the
   watcher after adding a file. (The standalone binaries have no watch mode, so
   this is an `npm start` problem only.)

2. THE STANDALONE BINARIES BUNDLE eleventy.config.js.
   eleventy-linux-x64 and eleventy-win-x64.exe carry their own copy of it. A
   binary compiled before this folder existed does not know about it and will
   silently publish none of these pages. If a post here never appears, that is
   the first thing to check — recompile with eleventy_binary/compile.sh.
   ./healthcheck.sh reports this case explicitly ("source published nothing").

--------------------------------------------------------------------------------
  PUBLISHING
--------------------------------------------------------------------------------
Write the file, then build the site the usual way:

    ./eleventy-linux-x64            (or eleventy-win-x64.exe)

Then check nothing broke:

    ./healthcheck.sh

If you used a CSS class that no other page uses, rebuild the stylesheet too
(./dev.sh or dev.bat) — Tailwind only keeps classes it can find, and the
@source line for this folder is in input.css.

--------------------------------------------------------------------------------
  RENAMING THIS FOLDER
--------------------------------------------------------------------------------
Five places, in this order:

  1. CUSTOM_POST_DIR in eleventy.config.js
  2. recompile BOTH binaries — eleventy_binary/compile.sh (see the note above)
  3. the @source line in input.css, or classes used only here get purged
  4. the live_slugs loop AND the source-published-nothing loop in healthcheck.sh
  5. this file

Also check the new name is not a substring of another input folder's name, and
that no other input folder's name is a substring of it: isTemplatePost() in
eleventy.config.js matches these directories as substrings of a file path.
