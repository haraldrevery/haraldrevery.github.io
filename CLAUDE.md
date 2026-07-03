# Harald Revery Website

An artist static website containing a blog section ("Notebook" section). Was made using free AI models with the user copy/pasting code back and fourth until it looked right. The site has a "as little js as possible" philosophy (except for the web apps).

# Some issues

Now there are some issues:
- CSS for the whole site "looks right" but the code is a mess to works with, needs clean up, no idea how to do this without breaking anything. 
- SEO optimization
- CSP check up, I don't know how safe the site is, don't want to break anything.
- Eleventy needs to automatically update the sitemap.xml
- Making sure the legal page is legit and up to date.
- Need a gitignore, right now I just do zip backups and updating the website to github pages through github web page.


# Secondary issues

- Outline support on markdown generated articles (preferably without js and can be toggled on/off in the lower right corner of the view port)
- A way to automatically make text have the random delay in animation of text (eleventy doing this for markdown articles). 
- Eleventy has a npm dependacy, after it has been tweaked I want a linux and a windows binary of it so users don't have to use "npm install" every time they open the project on a new PC (good to be prepared in case of npm servers being down etc, being less dependent).

# Future features
- A webapp to generate create photography pages (drag and drop / automatic grids that are then js free, except for the glightbox slider). This can be contained in its own folder. 