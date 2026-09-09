# Harald Revery official website
 
 <img src="site.png" alt="Website screenshots">

---

## Harald Revery official website, made with Tailwind CSS, Alpine.js and GLightbox.
Alpine.js was used for "navigation bar reveal when scroll" on older browsers and to run a custom made audio player. GLightbox for pop out image sliders when the user clicks an image (the CSS trick was not good enough). 

* Tailwind CSS: [Website](https://tailwindcss.com/), [Github](https://github.com/tailwindlabs/tailwindcss)
* Alpine.js [Website](https://alpinejs.dev/), [Github](https://github.com/alpinejs/alpine)
* GLightbox [Website](https://biati-digital.github.io/glightbox/), [Github](https://github.com/biati-digital/glightbox)

Main LLM models used to generate and troubleshoot code:
* Anthropic: Claude AI (Sonnet 4.5)
* Google: Gemini 
* xAI: Grok
* DeepSeek

## Notebook (blog/article part)
To get the blog ("notebook") have a nice structure and so on, I used Eleventy to generate html pages from markdown text and to create a page with all the "cards" containing sortable tags, thumbnails and date for each post on the site. Node.js was used to run Eleventy. Some pages contain Math.js for mathematical operations and jsPDF for PDF export support. 
* Node.js [Website](https://nodejs.org), [Github](https://github.com/nodejs/node)
* Eleventy [Website](https://www.11ty.dev/), [Github](https://github.com/11ty/eleventy/)
* Math.js [Website](https://mathjs.org/), [Github](https://github.com/josdejong/mathjs)
* jsPDF [Website](https://parall.ax/products/jspdf), [Github](https://github.com/parallax/jsPDF)

### Where notebook posts come from

Three input folders, all publishing to `notebook_pages/<slug>.html`. A slug may
live in exactly one of them; the build stops if two claim the same name.

| Folder | Source file | Use it for |
| --- | --- | --- |
| `input_markdown/` | `.md` | articles that are mostly words |
| `input_custom_post/` | `.html` body fragment | block posts, hand-written or page-builder exports |
| `input_custom_html_pages/` | complete `.html` document | the browser apps and rare one-offs |

The first two are **fragments**: the `<head>`, the nav and the footer are added
by the layouts in `eleventy_settings/` at build time, so changing the nav once
reaches every one of those pages on the next build. Only
`input_custom_html_pages/` carries its own copy of that chrome, which is correct
for a standalone app and is why that folder still exists — but it does mean those
pages have to be edited by hand when the nav changes. Prefer `input_custom_post/`
for anything that is an article rather than an application.

To write one, copy blocks out of `input_custom_post/_template.html` and read
`input_custom_post/README.txt`. Longer background, and the reasoning behind the
formats, is in `information/INPUT_CUSTOM_POSTS.md`.

Note that `eleventy.config.js` is compiled INTO the standalone binaries. If you
change it, recompile with `eleventy_binary/compile.sh` — otherwise the binary
keeps building from its own stale copy, and new pages silently do not appear.
`./healthcheck.sh` reports that case as "live source that published no page".

## Revery Notebook (markdown editor)
For the text editor I used CodeMirror, markdown-it and KaTeX to get the markdown and latex syntax to render and work correctly. I used highlight.js to make code blocks have colors for different programming languages. DOMPurify is used to some safety precautions.

* KaTeX [Website](https://katex.org/), [Github](https://github.com/KaTeX/KaTeX) 
* markdown-it [Website](https://markdown-it.github.io/), [Github](https://github.com/markdown-it/markdown-it) 
* markdown-it-texmath [Github](https://github.com/goessner/markdown-it-texmath)
* highlight.js [Website](https://highlightjs.org/), [Github](https://github.com/highlightjs/highlight.js) 
* CodeMirror [Website](https://codemirror.net/), [Github](https://github.com/codemirror/dev) 
* DOMPurify [Website](https://cure53.de/purify), [Github](https://github.com/cure53/dompurify) 

---

Personal setup for this project:
* Windows 10 with Firefox, Edge Zen with JavaScript blocker
* VS Code with the Live Server extension by Ritwick Dey
* Tailwind CSS v4.1.18  (tailwindcss-windows-x64.exe renamed to tw.exe)

On windows, be in the folder and run:

```
Just double click the "dev.bat" and it will run tailwind live.
```

On Linux, be in the folder and run:

```
chmod +x dev.sh
chmod +x tailwindcss-linux-x64
./dev.sh
```

To build the notebook section, run (if on linux):

```
./eleventy-linux-x64
```

or click the eleventy-win-x64.exe if on windows.

If the pages don't update, delete everything inside the /notebook_pages folder and run the commands again.

## Health check

Before pushing, scan the site for broken image/link paths, references whose casing
doesn't match the file on disk (these work locally but 404 on GitHub Pages), and
oversized images. It only reads and reports - it never changes a file.

On windows, be in the folder and run:

```
Just double click the "healthcheck.bat" and it will print the report.
```

On Linux, be in the folder and run:

```
chmod +x healthcheck.sh
./healthcheck.sh
```

Add `--quiet` to print only the sections that found something, or `--help` for the
size thresholds. Exit code is 1 when there are errors, so it can gate a deploy.

Worth knowing: the casing check is the reason there are two scripts rather than one.
Windows and macOS filesystems ignore case, so a wrong-cased reference resolves fine on
the machine you wrote it on and only breaks once GitHub Pages serves it. Running
`healthcheck.bat` on Windows catches it there, at the point the mistake is made.

For more information, see the /information folder containing .md files. 

If nothing works, install node.js and run

```
npm start
```

Note: I avoid npm since you depend on so many servers for it to work and you never know what the code is, hence why you should compile binaries that works and stick with them. Only use npm when changing logic for this website and compile in the end when everything works.

---

There is also some python code here, but that is only to generate som background svg's, to create the "topology map" to give the website some texture. Note that the svg outputs are a little large in file sizes (for a website) and can be optmized even more using online svg optimizers.

--- 

All rights reserved Harald Revery

 <img src="haraldrevery_website_animation.jpg" alt="Website screenshots">
