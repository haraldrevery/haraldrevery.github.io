# Updating the website with Git (instead of the GitHub web uploader)

This guide replaces the "drag files into the GitHub web page" workflow with a few
terminal commands. Once it's set up, updating the live site is three commands.

> **Your setup:** Linux, static Eleventy site, deployed to GitHub Pages behind
> Cloudflare, custom domain `haraldrevery.com`. Windows equivalents are noted where
> they differ.

---

## 0. Mental model (read once)

- Your project folder is now a **git repository** (already initialised for you).
- GitHub holds a copy called the **remote** (named `origin`).
- **Updating the site = build locally → commit → push.** GitHub Pages redeploys
  automatically within ~1 minute of a push.
- The two Tailwind binaries (`tailwindcss-linux-x64`, `tw.exe`) are **not** in git —
  they're 107 MB / 124 MB, over GitHub's 100 MB per-file limit. Keep them in your zip
  backups. Everyone who clones just needs them locally to rebuild CSS.

---

## 1. One-time setup

### 1a. Git identity + first commit — ✅ already done
The repo is initialised on the `main` branch, your name/email are set, and an
initial commit exists. You can confirm any time with:
```bash
git log --oneline -1
git status
```

### 1b. Get a GitHub access token (replaces your password)
GitHub no longer accepts your account password on the command line. You need a
**Personal Access Token (PAT)** once:

1. Go to <https://github.com/settings/tokens?type=beta> (Fine-grained tokens).
2. **Generate new token.** Give it a name like `laptop-push`, set an expiry
   (e.g. 1 year).
3. Under **Repository access**, choose *Only select repositories* → pick your
   website repo.
4. Under **Permissions → Repository permissions**, set **Contents: Read and write**.
5. **Generate token** and **copy it** (you only see it once). It looks like
   `github_pat_xxxx…`.

Tell git to remember it so you only paste it once:
```bash
git config --global credential.helper store
```
> This saves the token in a plain-text file (`~/.git-credentials`). Fine for a
> personal laptop. On a shared machine use `cache` instead of `store`.

### 1c. Connect this folder to your GitHub repo
Replace `YOUR-USERNAME` and `YOUR-REPO` with your real repo (the one already serving
the site). If your repo is named `yourname.github.io`, use that as `YOUR-REPO`.
```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git branch -M main
```

### 1d. First push — merge with what's already on GitHub ⚠️
Your GitHub repo already contains the site you uploaded by hand, so a plain push
will be **rejected** (two unrelated histories). Do this instead — it pulls in
anything that exists only on GitHub (**important: your custom-domain `CNAME` file
lives there**) and keeps your local files:

```bash
git fetch origin
git pull origin main --allow-unrelated-histories
```
- If git opens a text editor for a merge message, just save & close it
  (in `nano`: `Ctrl+O`, `Enter`, `Ctrl+X`).
- If it reports **conflicts**, your local copy is the correct one — resolve each by
  keeping your version:
  ```bash
  git checkout --ours .
  git add -A
  git commit -m "Merge existing GitHub history"
  ```

Then the first push (it will ask for your username and the **token as the password**):
```bash
git push -u origin main
```

Check the custom domain survived:
```bash
ls CNAME        # should exist and contain: haraldrevery.com
```
If `CNAME` is missing after the merge, create it so Pages keeps the domain:
```bash
echo "haraldrevery.com" > CNAME
git add CNAME && git commit -m "Restore CNAME for custom domain" && git push
```

**Setup is now complete.** From here on, updating the site is section 2.

---

## 2. The everyday update workflow

Whenever you change content or files:

### Step 1 — Rebuild the site
Always rebuild so the generated pages and `sitemap.xml` are fresh and drafts are
excluded:
```bash
npx @11ty/eleventy
```

**Only if you changed styling** (edited `input.css`/`input_prose.css` or added new
Tailwind classes in HTML), also rebuild the CSS first. Run the watch suite and stop
it once it prints the compiled output:
```bash
./dev.sh            # Linux    (Windows: dev.bat)
# wait a second for it to compile main.css / prose.css, then press Ctrl+C
```
> For content-only edits (new blog post, text changes) you can skip the CSS step.

### Step 2 — Review, commit, push
```bash
git status                       # see what changed
git add -A                       # stage everything
git commit -m "Add new notebook post about X"   # describe the change
git push                         # publish → GitHub Pages redeploys in ~1 min
```

That's it. Refresh `https://haraldrevery.com` after a minute (Cloudflare may cache —
hard-refresh with `Ctrl+Shift+R` if you don't see the change).

### Copy-paste version (content-only update)
```bash
npx @11ty/eleventy && git add -A && git commit -m "Update site" && git push
```

---

## 3. Publishing a draft

A post with `draft: true` in its front matter is invisible on the live site (no page,
not in the sitemap) but visible when you run `npm start` for local preview. To publish
it, change the front matter to `draft: false` (or remove the line), then run the normal
update workflow in section 2.

---

## 4. Troubleshooting

| Problem | Fix |
|---|---|
| `Authentication failed` on push | Your token is wrong/expired. Make a new PAT (1b) and push again; when prompted, paste the token as the **password**. |
| `remote contains work that you do not have locally` (rejected, non-fast-forward) | Someone/you edited on GitHub directly. Run `git pull` first, then `git push`. |
| `File … is 107.00 MB; this exceeds GitHub's file size limit of 100 MB` | You accidentally staged a Tailwind binary. It should be ignored by `.gitignore`; run `git rm --cached tailwindcss-linux-x64 tw.exe` then commit. |
| Pushed but site didn't change | Wait ~1 min for Pages to rebuild, then hard-refresh (`Ctrl+Shift+R`). Check the repo's **Actions**/**Pages** tab on GitHub for build status. |
| Custom domain stopped working | The `CNAME` file (containing `haraldrevery.com`) was removed. Recreate it (see 1d) and push. |
| `nothing to commit` | You forgot to run the build, or truly nothing changed. Run `npx @11ty/eleventy` first. |

---

## 5. Handy commands

```bash
git status              # what's changed / staged
git diff                # exact line-by-line changes (press q to exit)
git log --oneline       # history of your commits
git remote -v           # confirm which GitHub repo you're pushing to
git restore <file>      # undo unstaged changes to a file
```

---

## Notes
- **Rebuild before every deploy.** GitHub Pages serves your files as-is (no build on
  their side), so `main.css`, the notebook pages, and `sitemap.xml` must be freshly
  built locally and committed.
- **Don't deploy files left over from `npm start`.** The dev server writes draft pages
  to disk for preview — always finish with a plain `npx @11ty/eleventy` build before
  committing.
- **Binaries stay out of git.** Keep `tailwindcss-linux-x64` / `tw.exe` in your zip
  backups; they're too big for GitHub.
