# Development Setup Guide

This guide will help you get the website running on both **Windows** and **Linux**.

---

## 🚀 Quick Start Checklist

Before diving into details, here's the TL;DR to get running:

- [ ] Install Node.js (v18+)
- [ ] Download Tailwind CSS v4.1.18 standalone CLI
- [ ] Rename it to `tw.exe` (Windows) or `tw` (Linux) and place in project root
- [ ] Make executable on Linux: `chmod +x tw && chmod +x dev.sh`
- [ ] Run `npm install`
- [ ] Create required directories: `eleventy_settings/`, `javascript/`, `fonts/`
- [ ] Start Tailwind watchers: `dev.bat` (Windows) or `./dev.sh` (Linux)
- [ ] In separate terminal: `npm start`
- [ ] Open browser to `http://localhost:8080`

If anything fails, read the detailed sections below.

---

## 📚 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Project Structure](#project-structure)
4. [Required Directories & Assets](#required-directories--assets)
5. [JavaScript Components](#javascript-components)
6. [Running the Development Environment](#running-the-development-environment)
7. [How the Site Works](#how-the-site-works)
8. [Building for Production](#building-for-production)
9. [Common Pitfalls & Troubleshooting](#common-pitfalls--troubleshooting)
10. [Additional Notes](#additional-notes)

---

## Prerequisites

### Required Software
- **Node.js** (v18 or later recommended)
  - Windows: Download from [nodejs.org](https://nodejs.org/)
  - Linux: `sudo apt install nodejs npm` (Ubuntu/Debian) or `sudo dnf install nodejs` (Fedora)
- **Tailwind CSS Standalone CLI v4.1.18**
  - Download from [GitHub Releases](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.1.18)

---

## Initial Setup

### 1. Install Node.js Dependencies

```bash
npm install
```

This will install:
- `@11ty/eleventy` - Static site generator
- `markdown-it` - Markdown parser
- `markdown-it-attrs` - Markdown attributes plugin
- `gray-matter` - Front matter parser

### 2. Download Tailwind CSS Standalone CLI

#### Windows
1. Download `tailwindcss-windows-x64.exe` (v4.1.18) from the [releases page](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.1.18)
2. Rename it to `tw.exe`
3. Place it in the project root directory

#### Linux
1. Download `tailwindcss-linux-x64` (v4.1.18) from the [releases page](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.1.18)
2. Rename it to `tw`
3. Place it in the project root directory
4. Make it executable:
   ```bash
   chmod +x tw
   ```

---

## Project Structure

Your project should have this structure:

```
project-root/
├── eleventy_settings/       # Eleventy layouts (base.njk, etc.)
│   ├── base.njk            # Main layout template
│   ├── post.njk            # Blog post layout
│   ├── nav.njk             # Navigation component
│   └── footer.njk          # Footer component
├── javascript/             # Client-side JavaScript files
│   ├── alpine.min.js       # Alpine.js for reactive components
│   ├── glightbox.min.js    # GLightbox library for image lightboxes
│   ├── glightbox_settings_min.js  # GLightbox configuration
│   ├── navbar_scroll_min.js       # Navbar scroll animations
│   └── audioplayer_min.js         # Custom audio player for music page
├── markdown_text/           # Markdown blog posts (.md files)
├── html_extras/            # Standalone HTML blog posts (optional)
├── notebook_pages/         # Generated output (Eleventy creates this)
├── fonts/                  # Web fonts
│   ├── HaraldReveryTextFont.woff2
│   └── HaraldReveryMonoFont.woff2
├── photos/                 # Images and media assets
│   └── bgtexture.jpg
├── music/                  # Audio files for music player
│   └── mp3/
│       ├── Harald_Revery_-_Phrases.mp3
│       ├── Harald_Revery_-_Forest_Rain.mp3
│       └── ... (other tracks)
├── eleventy.config.js      # Eleventy configuration
├── package.json            # Node dependencies
├── input.css               # Main Tailwind input
├── input_prose.css         # Prose-specific Tailwind input (for blog posts)
├── theme.css               # Custom CSS variables and theme
├── blog.njk                # Notebook index page template
├── blog-tag.njk            # Tag pages template
├── index.html              # Homepage
├── music.html              # Music page
├── about.html              # About page
├── notebook.html           # Generated notebook index
├── download.html           # Download page
├── contact.html            # Contact page
├── legal.html              # Legal/privacy page
├── main.css                # Generated CSS (minified)
├── main_max.css            # Generated CSS (unminified)
├── prose.css               # Generated prose CSS (minified)
├── prose_max.css           # Generated prose CSS (unminified)
├── dev.bat                 # Windows development script
├── dev.sh                  # Linux development script
├── tw.exe                  # Tailwind CLI (Windows)
├── tw                      # Tailwind CLI (Linux)
├── .elevenyignore          # Files to ignore
├── favicon.ico             # Favicon files
├── favicon-96x96.png
├── apple-touch-icon.png
└── opengraphimg.jpg        # Social media preview image
```

**Important Notes:**
- `notebook_pages/` is auto-generated by Eleventy - you don't need to create it manually
- The `fonts/` and `photos/` directories contain your static assets
- Generated CSS files (`main.css`, `prose.css`, etc.) can be gitignored
- `.html` files in the root are either static pages or generated by Eleventy from `.njk` templates

---

## Required Directories & Assets

Before running the site, make sure you have these essential directories:

### Must Have:
- **`eleventy_settings/`** - Contains your Eleventy layout templates
  - `base.njk` - Main layout wrapper
  - `post.njk` - Blog post template
  - `nav.njk` - Navigation component
  - `footer.njk` - Footer component
- **`javascript/`** - Client-side JavaScript files (see JavaScript section below)
- **`fonts/`** - Your web fonts (HaraldReveryTextFont.woff2, HaraldReveryMonoFont.woff2)
- **`theme.css`** - CSS custom properties and variables (referenced in input_prose.css)

### Optional (but recommended):
- **`markdown_text/`** - Put your markdown blog posts here
- **`html_extras/`** - Put standalone HTML posts here
- **`photos/`** - Store images and media assets
- **`music/mp3/`** - Audio files for the music player (if using the music page)

### Auto-Generated:
- **`notebook_pages/`** - Eleventy creates this automatically when it builds

If any of these are missing, the build will fail with errors about missing files or templates.

---

## JavaScript Components

The site uses several JavaScript libraries and custom scripts for interactive features:

### Core Libraries

**Alpine.js** (`alpine.min.js`)
- Lightweight reactive framework (similar to Vue.js)
- Used for the audio player on the music page
- Provides reactive data binding with `x-data`, `x-show`, `@click` directives
- No build step required - works directly in HTML

**GLightbox** (`glightbox.min.js` + `glightbox_settings_min.js`)
- Image lightbox/gallery library
- Opens images in a fullscreen overlay
- Configuration in `glightbox_settings_min.js`:
  - Selector: `.glightbox` class on images
  - Touch navigation enabled
  - Loop and zoom features enabled

### Custom Scripts

**Navbar Scroll Animation** (`navbar_scroll_min.js`)
- Controls navbar visibility on scroll
- Uses CSS `animation-timeline: scroll()` when supported
- Falls back to JavaScript scroll listener for older browsers
- Hides navbar at top, shows when scrolling down

**Audio Player** (`audioplayer_min.js`)
- Custom Alpine.js component for the music page
- Features:
  - Play/pause, previous/next track navigation
  - Progress bar with click-to-seek
  - Volume control (desktop only, iOS doesn't allow volume control)
  - Track playlist with 8 pre-configured songs
  - Error handling and loading states
  - Touch-friendly drag controls

**Track List:**
1. Phrases
2. Forest Rain
3. Looking for Snow
4. Uninhabited Island
5. Clouds and Roads
6. Isolated
7. Mystery Card
8. The North (feat. Light Titum)

To add/modify tracks, edit the `tracks` array in `audioplayer_min.js`.

### Where JavaScript is Loaded

All JavaScript files are loaded in `base.njk` template with `defer` attribute:
```html
<script src="/javascript/glightbox.min.js" defer></script>
<script src="/javascript/glightbox_settings_min.js" defer></script>
<script src="/javascript/alpine.min.js" defer></script>
```

The navbar scroll script is likely loaded separately in individual HTML pages.

---

## Running the Development Environment

### Windows

**Option 1: Run both Eleventy and Tailwind together**
```cmd
dev.bat
```

This starts 4 Tailwind watch processes:
1. Main CSS (minified) → `main.css`
2. Main CSS (unminified) → `main_max.css`
3. Prose CSS (minified) → `prose.css`
4. Prose CSS (unminified) → `prose_max.css`

Then in a **separate terminal**, start Eleventy:
```cmd
npm start
```

**Option 2: Run individually**
```cmd
npm start          # Eleventy dev server
.\tw.exe --help    # Check Tailwind is working
```

### Linux

**Option 1: Run both Eleventy and Tailwind together**

First, make the script executable:
```bash
chmod +x dev.sh
```

Then run it:
```bash
./dev.sh
```

This starts 4 Tailwind watch processes (same as Windows).

Then in a **separate terminal**, start Eleventy:
```bash
npm start
```

**Option 2: Run individually**
```bash
npm start      # Eleventy dev server
./tw --help    # Check Tailwind is working
```

---

## What Each Script Does

### `dev.bat` / `dev.sh`
Runs 4 concurrent Tailwind CSS build processes that watch for changes:
- Generates both minified (production) and unminified (debugging) versions
- Watches all `.html` and `.md` files in root and `notebook_pages/`
- Automatically rebuilds CSS when files change

### `npm start`
- Starts Eleventy development server
- Watches for changes in templates and content
- Serves the site locally (typically at `http://localhost:8080`)
- Auto-reloads browser on changes

---

## Building for Production

### Build Everything
```bash
# Build Eleventy site
npm run build

# Build CSS (run individually or all 4):
./tw -i input.css -o main.css --minify
./tw -i input_prose.css -o prose.css --minify
```

The production-ready files will be in your output directory.

---

## Common Pitfalls & Troubleshooting

### ⚠️ Critical Setup Issues

**❌ PITFALL: Missing `eleventy_settings/` directory**
- **Symptom:** `Error: ENOENT: no such file or directory` when running Eleventy
- **Solution:** Create the `eleventy_settings/` folder and add at least `base.njk`, `nav.njk`, `footer.njk`, and `post.njk`
- **Why it happens:** Eleventy config points to this directory for layouts but it's not tracked in git if empty

**❌ PITFALL: Missing `theme.css` file**
- **Symptom:** Tailwind build fails with "cannot find module" or import errors
- **Solution:** Create `theme.css` with your CSS custom properties (`:root { --color-white: #fff; ... }`)
- **Why it happens:** `input_prose.css` imports this file with `@import "./theme.css";`

**❌ PITFALL: Wrong Tailwind CSS version**
- **Symptom:** CSS not generating, unknown at-rules like `@import "tailwindcss"`
- **Solution:** Must use Tailwind CSS v4.x standalone CLI (v4.1.18 recommended)
- **Why it happens:** Tailwind v4 has different syntax than v3.x

**❌ PITFALL: Paths with spaces or special characters**
- **Symptom:** Tailwind watch breaks, files not found
- **Solution:** Keep all folder/file names alphanumeric (use `_` or `-` instead of spaces)
- **Why it happens:** Command-line path escaping issues on both Windows and Linux

### 🔧 CSS & Build Issues

**CSS not updating after changes**
```bash
# Windows
taskkill /F /IM tw.exe
dev.bat

# Linux  
killall tw
./dev.sh
```
- Clear browser cache (Ctrl+Shift+R / Cmd+Shift+R)
- Check that changed files match the `--content` glob pattern
- Verify no syntax errors in your HTML/templates

**Tailwind classes not working**
- **Issue:** Classes like `bg-blue-500` work but `bg-[#abc123]` don't
- **Cause:** Arbitrary values require the file to be scanned by Tailwind
- **Fix:** Make sure the file is in the `--content` path in `dev.bat`/`dev.sh`

**Prose styles not applying to blog posts**
- Check `prose.css` is loaded in the HTML: `<link rel="stylesheet" href="/prose.css">`
- Verify the content has the `.prose` class: `<div class="prose">...</div>`
- Make sure `input_prose.css` compiled without errors

**Multiple CSS files getting huge**
- This is normal - the unminified versions (`*_max.css`) can be 500KB+
- Production should only use minified versions (`main.css`, `prose.css`)
- Add `*_max.css` to `.gitignore`

### 📝 Eleventy Issues

**Eleventy builds but pages are blank**
- **Cause:** Missing `{{ content | safe }}` in `base.njk`
- **Fix:** Check layout file has the content placeholder

**Blog posts not showing up**
- Check frontmatter has required fields:
  ```yaml
  ---
  title: Your Title
  date: 2024-01-15
  tags: [tag1, tag2]
  ---
  ```
- Verify files are in `markdown_text/` or `html_extras/`
- Check Eleventy terminal output for parsing errors

**Tag pages returning 404**
- **Cause:** `blog-tag.njk` not generating properly
- **Solution:** Check that `collections.allTags` is working in Eleventy config
- Run `npm start` and look for tag page generation in logs

**Images not loading in blog posts**
- Use absolute paths from root: `/photos/image.jpg` not `../photos/image.jpg`
- Verify image files exist in the specified location
- Check browser console for 404 errors

### 🎵 Music Player Issues

**Audio player not appearing**
- **Cause:** Alpine.js not loaded or loaded before the HTML
- **Fix:** Verify `<script src="/javascript/alpine.min.js" defer></script>` is in page
- Check browser console for JavaScript errors

**Songs won't play**
- Check MP3 files exist at paths specified in `audioplayer_min.js`
- Verify paths are correct: `./music/mp3/filename.mp3`
- Check browser console for 404 errors on audio files
- Some browsers block autoplay - user must click play button first

**Volume control not working**
- **Expected on iOS:** Volume control is disabled on iOS (Apple restriction)
- The script detects iOS and hides volume slider automatically

### 🖼️ Image Lightbox Issues

**Images not opening in lightbox**
- Check images have the `glightbox` class: `<img src="..." class="glightbox">`
- Verify GLightbox scripts are loaded: `glightbox.min.js` and `glightbox_settings_min.js`
- Check browser console for JavaScript errors

### 🪟 Platform-Specific Issues

**Windows:**

**"tw.exe is not recognized"**
- Make sure `tw.exe` is in the project root (same folder as `package.json`)
- Check you renamed it from `tailwindcss-windows-x64.exe` to `tw.exe`
- Don't put it in a subfolder

**Multiple command windows stay open**
- This is normal - each Tailwind process runs in its own window
- To stop all: Close each window or Ctrl+C in each terminal
- Alternative: `taskkill /F /IM tw.exe` in command prompt

**Dev.bat shows errors about quotes**
- Make sure you didn't edit `dev.bat` and accidentally break the quote syntax
- The paths in `--content` flag must be in double quotes

**Linux:**

**"Permission denied" when running `./tw` or `./dev.sh`**
```bash
chmod +x tw
chmod +x dev.sh
```

**Script has wrong line endings (edited on Windows)**
```bash
# Install dos2unix if needed
sudo apt install dos2unix   # Ubuntu/Debian
sudo dnf install dos2unix   # Fedora

# Convert line endings
dos2unix dev.sh
```

**Background processes won't die**
```bash
# Kill all Tailwind processes
killall tw

# Or find and kill by PID
ps aux | grep tw
kill <PID>
```

### 🌐 Browser Issues

**Site looks broken in browser**
- Hard refresh to clear cache: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- Check browser console (F12) for CSS/JS loading errors
- Verify CSS files were generated (check file modification times)

**Dark mode not working**
- Dark mode uses `prefers-color-scheme` media query
- Check your OS/browser is set to dark mode
- Some browsers need a restart after changing OS theme

**Fonts not loading**
- Check files exist: `/fonts/HaraldReveryTextFont.woff2` and `HaraldReveryMonoFont.woff2`
- Clear browser cache
- Check browser console for CORS or 404 errors

### 🔄 Development Workflow Issues

**Changes not showing up**
1. Check Tailwind watcher is running (look at terminal output)
2. Check Eleventy dev server is running (`npm start`)
3. Hard refresh browser (Ctrl+Shift+R)
4. Check for errors in both terminals

**"Address already in use" when running `npm start`**
- Another Eleventy server is already running
- Kill the process and restart:
  ```bash
  # Windows
  netstat -ano | findstr :8080
  taskkill /F /PID <PID>
  
  # Linux
  lsof -ti:8080 | xargs kill -9
  ```

**Git showing hundreds of changed files**
- You probably need a `.gitignore` file:
  ```
  node_modules/
  notebook_pages/
  main.css
  main_max.css
  prose.css
  prose_max.css
  _site/
  .DS_Store
  ```

### 🚨 When Everything Breaks

**Nuclear option - Fresh start:**
```bash
# 1. Stop all processes (Ctrl+C in all terminals)

# 2. Clean everything
rm -rf node_modules package-lock.json
rm -f main*.css prose*.css
rm -rf notebook_pages

# 3. Reinstall
npm install

# 4. Restart dev environment
# Windows: dev.bat
# Linux: ./dev.sh

# Then in another terminal:
npm start
```

### 📞 Getting Help

If you're still stuck:

1. **Check the terminal output** - Error messages are usually helpful
2. **Check browser console** (F12) - Look for 404s or JavaScript errors  
3. **Verify file paths** - Most issues are typos in paths or missing files
4. **Check this guide** - Ctrl+F to search for error messages
5. **Isolate the issue** - Does it work with just Eleventy? Just Tailwind?

---

## Stopping the Development Servers

### Windows
- Press `Ctrl+C` in each terminal window
- Or close the terminal windows

### Linux
- Press `Ctrl+C` in the terminal running `dev.sh`
- If background processes persist: `killall tw`

---

## How the Site Works

### Template Hierarchy (Eleventy)

**Layouts:**
- `base.njk` - Master layout that all pages use
  - Includes meta tags, CSS links, JavaScript imports
  - Includes `nav.njk` and `footer.njk` components
  - Wraps page content in `{{ content | safe }}`
- `post.njk` - Extends `base.njk` for blog posts
  - Adds article wrapper, back button, date display
  - Applies `.prose` class for typography styling

**Pages:**
- `.njk` templates compile to `.html` files at specified permalinks
- `blog.njk` → `notebook.html` (notebook index)
- `blog-tag.njk` → `notebook_pages/notebook_tag-{tag}.html` (tag pages)

### Static Pages (root directory)
- `index.html` - Homepage (static)
- `music.html` - Music page with Alpine.js audio player (static)
- `about.html` - About page (static)
- `download.html` - Download page (static)
- `contact.html` - Contact page (static)
- `legal.html` - Legal/privacy page (static)

### Dynamic Pages (Eleventy generates these)
- `blog.njk` → `notebook.html` - Main notebook index listing all posts
- `blog-tag.njk` → `notebook_pages/notebook_tag-{tag}.html` - One page per tag
- Markdown posts in `markdown_text/` → `notebook_pages/*.html`

### Blog Posts Collection

The site combines two sources into one `notebook_posts` collection:

1. **Markdown posts** (`markdown_text/`) 
   - Written in Markdown with YAML frontmatter
   - Compiled to HTML by Eleventy
   - Output to `notebook_pages/`

2. **HTML posts** (`html_extras/`)
   - Already written in HTML with YAML frontmatter
   - Copied directly to `notebook_pages/`
   - Parsed as "virtual" collection items

Both are sorted by date (newest first) and displayed together on the notebook index.

### CSS Generation (Tailwind)

The Tailwind CLI watches for changes and generates 4 CSS files:
- `main.css` / `main_max.css` - Main styles for all pages
- `prose.css` / `prose_max.css` - Typography styles specifically for blog posts

**What gets watched:**
- All `.html` files in root directory
- All `.html` and `.md` files in `notebook_pages/**/*`

**Inputs:**
- `input.css` → Generates `main.css` and `main_max.css`
- `input_prose.css` → Generates `prose.css` and `prose_max.css`
  - Imports Tailwind Typography plugin (`@tailwindcss/typography`)
  - Imports `theme.css` for custom CSS variables

### How They Connect

**CSS Loading:**
1. All pages load `main.css` for base styling
2. Blog posts additionally load `prose.css` for typography
3. The `.prose` class applies styled formatting to markdown content

**Navigation:**
1. Tag links point to auto-generated tag pages: `/notebook_pages/notebook_tag-{tag}.html`
2. Post cards link to individual posts in `/notebook_pages/`
3. Footer includes social media links and site navigation

**JavaScript Features:**
1. **GLightbox** - Click images with `.glightbox` class to open lightbox
2. **Alpine.js** - Powers the audio player on music page
3. **Navbar animation** - Auto-hides/shows navbar based on scroll position

### SEO & Meta Tags

The `base.njk` layout includes:
- Open Graph tags for social media previews
- Canonical URLs
- Schema.org structured data for articles
- Preloaded fonts for performance
- Responsive meta viewport

---

## Additional Notes

- The `.elevenyignore` file tells Eleventy which files to skip during build
- Generated CSS files (`main.css`, `prose.css`, etc.) should be in `.gitignore`
- The `notebook_pages/` output directory is auto-generated and can be gitignored
- Dark mode styling is handled automatically via `prefers-color-scheme` media queries
- All paths use absolute references from root (e.g., `/fonts/`, `/photos/`)
- The site uses custom web fonts loaded from the `/fonts/` directory
- Social media previews use `opengraphimg.jpg` in the root directory

### Adding New Blog Posts

**Markdown posts:**
1. Create a `.md` file in `markdown_text/`
2. Add frontmatter (title, date, tags, image, description)
3. Write your content in markdown
4. Eleventy will automatically generate the HTML in `notebook_pages/`

**HTML posts:**
1. Create an `.html` file in `html_extras/`
2. Add frontmatter at the top using `---` delimiters
3. Write your HTML content below
4. Eleventy copies it to `notebook_pages/` and adds it to the collection

### Customizing the Music Player

To modify the track list in the audio player:

1. Open `/javascript/audioplayer_min.js`
2. Find the `tracks` array in the `audioPlayer()` function
3. Add/remove/modify track objects:
   ```javascript
   {
     title: "Your Song Title",
     artist: "Artist Name", 
     url: "./music/mp3/your_file.mp3",
     color1: "#hexcolor",      // Gradient start color
     color2: "#hexcolor",      // Gradient end color
     btnColor: "bg-gradient-to-br from-color to-color"  // Tailwind classes
   }
   ```
4. Place your MP3 files in `/music/mp3/`
5. Reload the music page to see changes

---

## Recommended .gitignore

Create a `.gitignore` file in your project root with these entries:

```gitignore
# Dependencies
node_modules/
package-lock.json

# Generated output
notebook_pages/
_site/

# Generated CSS (minified versions are committed, dev versions ignored)
main_max.css
prose_max.css

# Optional: If you want to generate CSS on each deploy instead
# main.css
# prose.css

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
```

**Note:** You may want to commit the minified CSS files (`main.css`, `prose.css`) so your production deployment doesn't need to run Tailwind. Or you can gitignore them and run Tailwind as part of your build process.

---

## Production Deployment

When deploying to production:

1. **Build Eleventy:**
   ```bash
   npm run build
   ```

2. **Build CSS (if not committed):**
   ```bash
   # Windows
   .\tw.exe -i input.css -o main.css --minify
   .\tw.exe -i input_prose.css -o prose.css --minify
   
   # Linux
   ./tw -i input.css -o main.css --minify
   ./tw -i input_prose.css -o prose.css --minify
   ```

3. **Upload these files/folders to your web server:**
   - All `.html` files in root
   - `notebook_pages/` directory
   - `main.css` and `prose.css`
   - `fonts/` directory
   - `photos/` directory
   - `music/` directory
   - `javascript/` directory
   - All favicon files
   - `opengraphimg.jpg`

4. **Don't upload:**
   - `node_modules/`
   - `.njk` files (they're compiled to .html)
   - `eleventy_settings/` (templates, not needed in production)
   - `markdown_text/` or `html_extras/` (compiled to notebook_pages)
   - Development scripts (`dev.bat`, `dev.sh`, `tw.exe`, `tw`)
   - Source CSS files (`input.css`, `input_prose.css`, `theme.css`)



---

## Quick Reference

| Task | Windows | Linux |
|------|---------|-------|
| Install dependencies | `npm install` | `npm install` |
| Start dev server | `npm start` | `npm start` |
| Build for production | `npm run build` | `npm run build` |
| Run Tailwind watchers | `dev.bat` | `./dev.sh` |
| Stop all processes | `Ctrl+C` | `Ctrl+C` or `killall tw` |

---

## Need Help?

If you encounter issues not covered here:
1. Check that all prerequisites are installed correctly
2. Verify the project structure matches the layout above
3. Make sure you're using the correct Tailwind CSS version (v4.1.18)
4. Check the terminal output for specific error messages
