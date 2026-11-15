# Introduction

An artist static website containing a blog section ("Notebook" section). The site has a "as little js as possible" philosophy (except for the web apps). Site should be SEO optimized with good practices.

The artist can make a new post/article in three ways:
- Markdown `.md` file in the `input_markdown/`.
- Custom `.html` file in `input_custom_html_pages/`.
- Posts from the page builder are put in the folder in `input_custom_post/`.
- New song releases are updated in `input_release/`.

The `h/` folder is a legacy folder to access some side projects, accessible from the footer as an easter egg.

Some background: Was made using free AI models with the user copy/pasting code back and fourth until it looked right. Resulting in some technical debts in how it's generated, hence the hosted from root structure.


# Philosophy

No JavaScript, only exception is glightbox for popup image sliders, the search bar, and a button to adjust the page width for the markdown generated html posts. Website should not render with errors if the user has JavaScript disabled. Anything else should only utilise CSS and try not to use too experimental CSS in case of users having older hardware. KaTeX should render without need for JavaScript for the users (markdown-it-katex works for 11ty).

For the website development, using `npm`/ `npx` commands is fine. But for website generation, it should not rely on any `npm` commands, it should be able to be generated through a binary file (one for linux and one for windows). Even *with or without* the page builder app, it should be easy to maintain the websites content.

No CDN servers, every single asset should be locally hosted.

User can make a new post/article in three ways:

- Markdown `.md` file in the `input_markdown/`  
- Custom `.html` file in `input_custom_html/`  
- Full `post_*/` folder in `input_custom_post/`


Current status: For making the site free from `npm`, a binary file for Windows and Linux is used, 


## Some website details

- The blog part should have thumbnail cards, not "just a long list" like many other blogs have. Include a tag filter (see the YAML data how 11ty gets the tag data) and a search bar (that has a dropdown suggestion list when typing and navigate with keyboard arrows). To make the website scale well as content continues to be added: limit the blog card rendering to max 40 articles per page, if more than 40 posts the site generator has pagination for the blog part. Note: if javascript is disabled, the search bar should not be visible at all and place the search bar in the navigation bar in a sensible position. Have nice hover animation when hovering over a card.

- For markdown posts: In the lower right corner there should be an outline toggle button. The outline toggle button is strictly required to function using only CSS and chapters/subchapters are clickable so the viewport scrolls to said chapter/subchapter. The Cycle width button can be placed above the outline toggle button and only visible when the mouse cursor is hovering around the lower right corner. If javascript is disabled, the cycle button should not be visible. 

- In the theme.css, include an parameter to scale each fonts global typography base root size, letter-spacing and line-height space so user can tweak the fonts root characteristics ensuring these font settings act as the base for the entire site for each font (note: KaTeX font has its own separate global typography settings, isolated from the other fonts and has its own base root size value). Also define the theme colours (both dark and light mode) as variables to it can be tweaked from theme.css. 

- Light/dark mode is system only, no javascript toggle for theme.

- Mathematical expressions must be rendered to static HTML during the build. The public site must include locally hosted KaTeX CSS and fonts and must not require client-side JavaScript for ordinary rendering.

- The legal.html being generated from legal.md should also render the all licences as individual section blocks of each license after the content from legal.md.

- For any section/block container that has text, use justified text alignment.

## Page builder app

The page builder app is a block based editor that generates html pages or/and save files for the generator. User should have a dashboard over their website where they can change name/settings globally for the website and pick a page project to edit its content as a block editor (Behance / Flickr inspired).

Page builder Blocks:

- Image gallery grid (justified with native ratios or uniform ratio crop grid), should support svg as well. (Imported images are copied over to the /image folder. Alt text, title and description should be extracted from the exif data, and a min version should be generated to the /image\_min for the gallery grid).  
- Text section (markdown + KaTex)  
- Video (Title + description is optional below the video)  
- Audio  
- Heading  
- Raw HTML  
- FAQ section  
- Feature page / One image catch text block.  
- Download (with automatic generated SHA-256 and SHA-512 string)  
- Hero page (always on top and except from the two column criteria since it's its own part)

All blocks should be able to be arranged in a single full width column or a two column block (two "half width" sections, but with a sensible gap between those blocks).

Note: `block_test_page.html` should be a stress page containing all possible combinations of these potential blocks to easy inspect and see that they look visually ok during development. If multiple hero page types, have  `block_test_page_a.html` and  `block_test_page_b.html` to show the different types of hero pages. If the page builder app is not working or not implemented yet. at least make the `block_test_page.html` pages easy to copy, tweak and paste so developers can reuse the html blocks to make html pages manually.

## Some comments


- The `/input_legal` folder contains all the licenses to comply with various licenses to publish this website and the legal.md that is the websites own legal page.

- `*_min.jpg` are used for image thumbnails in galleries etc so the website doesn't load the high resolution images when entering the page, save data for mobile users etc and better page speed scores. I use https://github.com/haraldrevery/image_compression for this,

- The reason for the `input_custom_post/` and `input_custom_html_pages/` separation is that users can choose to make custom html pages manually or in development before the page builder app is done to still being able to make posts and make test pages so everything looks good and renders correctly.

- On markdown generated post has an image, the image thumbnail (on the generated html page) is automatically referred to the mirrored `*_min.jpg` file in `image_min/` folder. On build, it should warn the user that there was missing mirrored `*_min.jpg` and that a generated one was made for said file. 

- If more than one image is placed after each other on a markdown post, render those images as a justified image gallery grid (with said image slider when clicking on an image). Note: make sure the image gallery grid logic still looks visually intact no matter the reader width setting the user has.


## YAML

YAML that are set for all the `input_custom_html/`, `input_markdown/` & `input_custom_post/` folders files (status_check should warn if something is missing/wrong).

YAML format:

```
---
title: Title of the page
date: YYYY-MM-DD
image: /card_thumbnail/thumbnail_xx.jpg <-- used for post thumbnail and Open Graph image
tags: [tag_1, tag_2]
description: Short description or summary of the page.
draft: true/false        <-- If "draft = false", the page is not generated or copied for the generated site.
---
```

For the slug for the generated webpages, use the markdown/html input file name. For any conflicts, warn the user and add a suffix.


# Folder structure (concept)

The website started as a 4 html pages with them being in the root, now it is what it is... I then learned that static website generators existed and now I'm here with this structure that I'm used to work with.  


 ```
 
.
├── artcover/
│   ├── artcover_1.jpg
│   ├── artcover_1_min.jpg
│   ├── artcover_2.jpg
│   ├── artcover_2_min.jpg
│   └── ...         <-- song release artcovers.
├── clock/
│   └── ... <-- clock app stuff.
├── download/
│   ├── test/
│   │   ├── hrldrvryphrases11.png
│   │   └── info.txt 
│   ├── category_1/
│   │   ├── something.zip
│   │   └── ...
│   └── category_2/
│       ├── pack_1.zip
│       ├── pack_2.zip
│       └── ...
├── eleventy_binary/
│   └── ...
├── eleventy_njk/
│   └── ...
├── eleventy_settings/
│   └── ...
├── fonts/
│   ├── HaraldReveryMonoFont.otf
│   └── ...
├── gif/
│   └── ...
├── graphics/
│   └── ...        <-- illustrations and CGI graphics.
├── h/
│   └── ...        <-- wallpaper animation loops.
├── information/
│   └── ...         <-- old documentation (mostly for archive)
├── input_custom_html_pages/
│   └── ...
├── input_custom_post/
│   └── ...
├── input_legal/
│   ├── input_legal/
│   │   ├── legaltext_1.txt
│   │   ├── legaltext_2
│   │   ├── legaltext_3.md
│   │   └── ...            <-- content renders to the legal page of the website (license blocks).
│   └── legal.md           <-- content renders to the legal page of the website.
├── input_markdown/
│   ├── post1.md
│   ├── post2.md
│   └── ...    <-- markdown posts
├── input_release/
│   ├── release_1.json    <-- content input for the release/discography section.
│   ├── release_2.json
│   ├── _template.jsonc   <-- copy and paste file to fill for new releases.
│   └── ...               
├── javascript/
│   └── ...    <-- all JS for on the website (except for the heavy webapps).
├── licence/
│   ├── legaltext_1.txt
│   ├── legaltext_2.txt
│   └── ...           <-- licence dump (for archive).
├── music/
│   ├── mp3/
│   │   └── ... 
│   └── flac/
│       └── ...
├── notebook_pages/
│   └── ...    <-- blog content generated in here.
├── notebook_templates/
│   └── ...    <-- old legacy test pages here, test ground.
├── notebook_thumbnails/
│   └── ...
├── page_builder_app_v2/
│   └── ...
├── photos/
│   ├── project1/
│   │   ├── photo1.jpg        <-- full resolution version viewed when clicked on.
│   │   ├── photo1_min.jpg    <-- "_min.jpg" version for thumbnails to save page loading data.
│   │   ├── photo2.jpg
│   │   ├── photo2_min.jpg
│   │   └── ...
│   ├── project2/
│   │   └── ...    
│   └── ...
├── release/
│   ├── release_1.html    <-- rendered html for the release/discography section.
│   ├── release_2.html
│   └── ...
├── revery_notebook/
│   └── ...        <-- markdown editor app (maintained on https://github.com/haraldrevery/revery_notebook now)
├── rvry_ascii/
│   └── ...        <-- ascii generator app
├── svg/
│   └── ...
├── test_pages
├── video/
│   └── ...
├── video/
│   ├── ...
│   └── thumbnail/
│       └── ...  <-- thumbnails for videos
├── css/
│   ├── theme.css         <-- core aestetics of the site (root font settings, dark/light mode color theme, global variables etc).
│   ├── input_prose.css   <-- text prose stuff.
│   ├── input.css       <-- custom css.
│   ├── main.css        <-- final generated tailwind css (minified).
│   └── main_max.css    <-- generated tailwind css (NOT minified, used for troubleshooting).
├── index.html
├── contact.html
├── legal.html
├── notebook.html
├── h.html
├── 404.html
├── about.html
├── download.html
├── music.html
├── discography.html
├── eleventy-win-x64.exe   <-- generator binary for windows
├── eleventy-linux-x64     <-- generator binary for linux
├── tailwindcss-linux-x64  <-- tailwind binary for linux
├── tw.exe                 <-- tailwind binary for windows (renamed)
├── opengraphimg.jpg
├── sitemap.xml             <-- SEO thing
├── feed.xml                <-- RSS thing
├── favicon.ico             <-- website icon
├── favicon.svg             <-- website icon
├── README.md
├── build.bat               <-- re-generate the site on windows
├── build.sh                <-- re-generate the site on linux
└── ...

```


# Code and logic

Avoid solutions that are risky or have technical debts that prevents easy maintenance, too difficult to re-use for other projects or makes it difficult to do updates to the programs logic. Keep it modular to avoid entangled dependencies and keeping the risk of potential damage / data losses / errors low. If risk mitigation or feature leads to potential over-engineering, consider simpler pipelines to avoid instabilities and if that is not possible, give me a warning before doing anything!  

Have clear logical folder structure. Must be easy to add/tweak content.

Try to avoid building on top of third-party dependencies that could break the pipeline if it gets updated (but store local backup in case source goes down), if using third-party libraries/packages, make sure they are trustworthy (not compromised with malicious code/vulnerabilities), stable and FOSS so it can legally be distributed. 

Very important to be reliable and not have any risk of becoming corrupt during save or risk of being unreadable. 

# Known problems and quirks

- The large zip folders and git: I just wanted an easy way to keep it all intact on git (just download the folder and you are ready to add content) following the "no npm" rule.
- Root folder website: It is what it is.
- Keeping some zip folders for some repos: just wanted everything archived for legal purposes (exact intact archive).


