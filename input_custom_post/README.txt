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

WRITING A POST, START TO FINISH

    cp input_custom_post/_new_post.html input_custom_post/my-post.html

The FILE NAME is the URL: my-post.html publishes to /notebook_pages/my-post.html.
Fill in the front matter, write the body, set draft: false, then build with
./eleventy-linux-x64 and check with ./healthcheck.sh.

THE FOUR WORKING FILES

  _new_post.html    COPY THIS TO START. The skeleton, the front matter with
                    every field explained, and the structural rules.
  _template.html    The block clipboard: the everyday blocks, fenced, ready to
                    paste into the skeleton's container.
  stress_test.html  Every block that exists, rendered on one page, with the
                    reasoning attached. The reference when the clipboard has
                    not got what you need.
  imgblock.mjs      Prints image markup with the numbers already right:

                        node input_custom_post/imgblock.mjs photos/a.jpg
                        node input_custom_post/imgblock.mjs --gallery=hike photos/a.jpg photos/b.jpg

                    One file gives a figure; two or more give a justified
                    gallery. It reads each picture's real pixel size out of the
                    file header, finds the _min thumbnail, and fills in the
                    aspect-ratio, flex-grow, flex-basis and max-width the
                    justified grid needs in three places per picture. Those are
                    the only numbers in a post that are wrong silently - a bad
                    ratio misjustifies the whole row - so do not type them by
                    hand. No npm packages; plain node.

ONE STRUCTURAL RULE. Everything goes inside the single
<div class="post-container"> in the skeleton, and each block carries mb-16.
Never nest a second .post-container inside it: it is a percentage width, so
nesting narrows the column to about 56%. Full-bleed blocks go after that
div's closing tag.

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
  THE STRESS TEST PAGES
--------------------------------------------------------------------------------
stress_test.html        every content block the page builder can emit
stress_test_hero.html   the hero block in all four background modes

The markup in both is transcribed from
page_builder_app_v2/src/puck/components/, so a hand-written block and a
builder-generated one are the same HTML. They are the reference for "what does
this block actually look like", and they are a regression fixture: build them,
open them in both colour schemes, and anything broken shows up on one page.

They also act as a TAILWIND SAFELIST. This folder is in input.css's and
input_prose.css's @source lists, so every class the blocks use is compiled and
stays compiled - even while the pages are drafts, because Tailwind scans the
SOURCE files, not the output. That is not incidental: it is what keeps a
builder-exported block from shipping a class that was never compiled.

--------------------------------------------------------------------------------
  THINGS THE STRESS TEST TURNED UP - READ BEFORE WRITING A PAGE
--------------------------------------------------------------------------------
NO MARKDOWN PIPELINE. Nothing in this folder is parsed as markdown. KaTeX
($x^2$), linkify, markdown-it-attrs and the automatic image grid are all
markdown-only features and none of them runs here - you write final HTML. For
maths, write MathML directly; the site emits MathML from markdown too
(output: "mathml"), so it renders identically. stress_test.html has an example.

A LINKED SVG DOES NOT FOLLOW THE COLOUR SCHEME. <img src="/svg/logo.svg"> is
an image like any other, so a black-on-transparent logo is INVISIBLE in dark
mode. Only an INLINED svg with its colours replaced by currentColor follows the
theme. Both are in stress_test.html, one after the other, and in dark mode the
linked one is simply not there. Check every svg in both schemes.

`outline: true` READS EVERY HEADING. addAnchors rewrites all h2/h3 in the
fragment, so a FAQ question and a Featured card's title land in the "On this
page" panel next to your real section headings. Fine on a page that is mostly
prose; noisy on a page of blocks. It is off by default for that reason.

A COVER HERO OVER A BRIGHT PHOTOGRAPH LOSES ITS TAGLINE. The scrim is strongest
at the top and fades out by 90%, so type sitting low over a bright area (snow,
sky) goes white-on-white. Visible in stress_test_hero.html. Either move the
photo, use the light-scrim variant, or keep the copy short and high.

HTML COMMENTS CANNOT NEST. The first close-comment sequence inside a comment
ends it, and everything after that renders on the page as visible text. This
bites when you paste an example of a commented block INTO an explanatory
comment - _template.html shipped exactly that bug. If you must quote one inside
another, do not type the closing sequence.

THE .prose SCOPE. `.prose .rvry-grid` is scoped, so a hand-written markdown-style
image grid outside a .prose wrapper is completely unstyled.

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
  3. the @source line in input.css AND the one in input_prose.css - BOTH, see
     the note beside them. Miss input.css and classes used only here are
     purged; miss input_prose.css and prose.css (linked SECOND) overrides
     main.css's responsive variants with its own plain ones, so a class like
     md:table-cell silently never applies
  4. the live_slugs loop AND the source-published-nothing loop in healthcheck.sh
  5. this file

Also check the new name is not a substring of another input folder's name, and
that no other input folder's name is a substring of it: isTemplatePost() in
eleventy.config.js matches these directories as substrings of a file path.
