#!/usr/bin/env python3
"""
Notebook Page Builder — a desktop "block" editor for Harald Revery's notebook.

Assemble a page from content blocks (text, image galleries, video, audio),
picking media straight from the repo (auto /photos paths + _min thumbnails),
save the project to re-edit later, and export a complete html_extras/ page.

Pure Python standard library (tkinter). Run:  python3 notebook_builder.py
"""
import os
import re
import io
import json
import copy
import datetime
import tempfile
import webbrowser
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

import blocks as B

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_REPO = os.path.dirname(HERE)          # page_builder/ lives inside the repo
SITE_URL = "https://haraldrevery.com"
MEDIA_DIRS = ["photos", "artcover", "graphics", "svg", "audio", "music", "video", "gif"]

BLOCK_LABELS = [
    ("heading", "Heading"), ("paragraph", "Paragraph"), ("list", "List"),
    ("blockquote", "Quote"), ("hr", "Divider"),
    ("gallery", "Photo gallery"), ("image", "Single image"),
    ("video", "Video"), ("two_column", "Two-column (media+text)"),
    ("audio", "Audio"), ("raw", "Raw HTML"),
]


# --------------------------------------------------------------- pure helpers
def slugify(text):
    s = (text or "untitled").lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"\s+", "-", s).strip("-")
    s = re.sub(r"-+", "-", s)
    return s or "untitled"


def human_date(date_str):
    try:
        d = datetime.date.fromisoformat(date_str)
        return d.strftime("%B %-d, %Y")
    except Exception:
        return date_str or ""


def web_path_from_abs(abspath, repo_root):
    """Absolute filesystem path -> root-absolute web path (/photos/...)."""
    abspath = os.path.abspath(abspath)
    repo_root = os.path.abspath(repo_root)
    if not abspath.startswith(repo_root + os.sep):
        return None  # outside the repo
    rel = os.path.relpath(abspath, repo_root)
    return "/" + rel.replace(os.sep, "/")


def derive_full_thumb(web, repo_root):
    """Given a picked web path, return (full, thumb) using the _min convention."""
    base, ext = os.path.splitext(web)
    if base.endswith("_min"):
        thumb = web
        full = base[:-4] + ext
    else:
        full = web
        cand = base + "_min" + ext
        exists = os.path.exists(os.path.join(repo_root, cand.lstrip("/")))
        thumb = cand if exists else web
    return full, thumb


def frontmatter_yaml(meta):
    lines = ["---"]
    lines.append(f"title: {meta.get('title','')}")
    lines.append(f"date: {meta.get('date','')}")
    tags = [t.strip() for t in re.split(r"[,\s]+", meta.get("tags", "")) if t.strip()]
    lines.append(f"tags: [{', '.join(tags)}]")
    if meta.get("image"):
        lines.append(f"image: {meta['image']}")
    if meta.get("description"):
        lines.append(f"description: {meta['description']}")
    if meta.get("draft"):
        lines.append("draft: true")
    lines.append("---")
    return "\n".join(lines)


def jsonld(meta, canonical):
    obj = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": meta.get("title", ""),
        "description": meta.get("description", ""),
        "datePublished": meta.get("date", ""),
        "author": {"@type": "Person", "name": "Harald Revery", "url": f"{SITE_URL}/about"},
        "publisher": {"@type": "Person", "name": "Harald Revery"},
        "mainEntityOfPage": canonical,
    }
    if meta.get("image"):
        obj["image"] = SITE_URL + meta["image"]
    return '<script type="application/ld+json">\n' + json.dumps(obj, indent=2, ensure_ascii=False) + "\n</script>"


def assemble_document(shell, meta, blocklist):
    """Full HTML document (no frontmatter) from shell + meta + blocks."""
    slug = slugify(meta.get("title", ""))
    canonical = f"{SITE_URL}/notebook_pages/{slug}"
    title = meta.get("title", "").strip()
    repl = {
        "{{TITLE}}": f"Harald Revery - {title}" if title else "Harald Revery",
        "{{DESCRIPTION}}": meta.get("description", ""),
        "{{KEYWORDS}}": meta.get("tags", ""),
        "{{OG_TITLE}}": title,
        "{{OG_DESC}}": meta.get("description", ""),
        "{{OG_IMAGE}}": (SITE_URL + meta["image"]) if meta.get("image") else f"{SITE_URL}/opengraphimg.jpg",
        "{{OG_URL}}": canonical,
        "{{CANONICAL}}": canonical,
        "{{DATE_ISO}}": meta.get("date", ""),
        "{{DATE_HUMAN}}": human_date(meta.get("date", "")),
        "{{JSONLD}}": jsonld(meta, canonical),
        "{{CONTENT}}": B.render_content(blocklist),
    }
    doc = shell
    for k, v in repl.items():
        doc = doc.replace(k, v)
    return doc


def export_text(shell, meta, blocklist):
    """Full html_extras page = frontmatter + document."""
    return frontmatter_yaml(meta) + "\n" + assemble_document(shell, meta, blocklist)


def preview_html(shell, meta, blocklist, repo_root):
    """Document with root-absolute paths rewritten to file:// so a browser can
    load CSS/images/fonts/JS straight from disk."""
    doc = assemble_document(shell, meta, blocklist)
    repo_abs = os.path.abspath(repo_root)
    return re.sub(r'(href|src)="/', rf'\1="file://{repo_abs}/', doc)


# ------------------------------------------------------------------- the app
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Notebook Page Builder")
        self.geometry("1080x720")
        self.repo_root = DEFAULT_REPO
        self.shell = self._load_shell()
        self.project_path = None
        self.meta = {"title": "", "date": datetime.date.today().isoformat(),
                     "tags": "", "description": "", "image": "", "draft": False}
        self.blocks = []
        self._editor_widgets = []
        self._build_ui()
        self._refresh_list()

    def _load_shell(self):
        p = os.path.join(HERE, "shell.html")
        try:
            with io.open(p, encoding="utf-8") as f:
                return f.read()
        except OSError:
            messagebox.showerror("Missing shell.html",
                                 f"Could not read {p}. The page shell template is required.")
            return "{{CONTENT}}"

    # ---- UI scaffold
    def _build_ui(self):
        top = ttk.LabelFrame(self, text="Page details (frontmatter)")
        top.pack(fill="x", padx=8, pady=6)
        self._meta_entry(top, "Title", "title")
        self._meta_entry(top, "Date (YYYY-MM-DD)", "date")
        self._meta_entry(top, "Tags (comma/space)", "tags")
        self._meta_entry(top, "Description", "description")
        imgrow = ttk.Frame(top); imgrow.pack(fill="x", pady=2)
        ttk.Label(imgrow, text="Card image", width=18, anchor="w").pack(side="left")
        self.image_var = tk.StringVar(value=self.meta["image"])
        ttk.Entry(imgrow, textvariable=self.image_var).pack(side="left", fill="x", expand=True)
        self.image_var.trace_add("write", lambda *a: self.meta.__setitem__("image", self.image_var.get()))
        ttk.Button(imgrow, text="Pick…", command=self._pick_card_image).pack(side="left", padx=4)
        self.draft_var = tk.BooleanVar(value=bool(self.meta.get("draft", False)))
        ttk.Checkbutton(top, text="Draft (Eleventy skips it — no page is built; the source file stays)",
                        variable=self.draft_var,
                        command=lambda: self.meta.__setitem__("draft", self.draft_var.get())).pack(anchor="w", pady=2)

        mid = ttk.Frame(self); mid.pack(fill="both", expand=True, padx=8)
        left = ttk.LabelFrame(mid, text="Blocks"); left.pack(side="left", fill="both", padx=(0, 6))
        self.listbox = tk.Listbox(left, width=34, activestyle="dotbox", exportselection=False)
        self.listbox.pack(fill="both", expand=True, padx=4, pady=4)
        self.listbox.bind("<<ListboxSelect>>", lambda e: self._render_editor())
        lb = ttk.Frame(left); lb.pack(fill="x", pady=4)
        self.add_btn = ttk.Menubutton(lb, text="+ Add")
        m = tk.Menu(self.add_btn, tearoff=False)
        for key, label in BLOCK_LABELS:
            m.add_command(label=label, command=lambda k=key: self._add_block(k))
        self.add_btn["menu"] = m
        self.add_btn.pack(side="left")
        ttk.Button(lb, text="↑", width=3, command=lambda: self._move(-1)).pack(side="left")
        ttk.Button(lb, text="↓", width=3, command=lambda: self._move(1)).pack(side="left")
        ttk.Button(lb, text="Dup", width=4, command=self._duplicate).pack(side="left")
        ttk.Button(lb, text="Del", width=4, command=self._delete).pack(side="left")

        self.editor = ttk.LabelFrame(mid, text="Block editor")
        self.editor.pack(side="left", fill="both", expand=True)

        bot = ttk.Frame(self); bot.pack(fill="x", padx=8, pady=8)
        ttk.Button(bot, text="New", command=self._new).pack(side="left")
        ttk.Button(bot, text="Open project…", command=self._open).pack(side="left", padx=4)
        ttk.Button(bot, text="Save project…", command=self._save).pack(side="left")
        ttk.Button(bot, text="Preview in browser", command=self._preview).pack(side="right")
        ttk.Button(bot, text="Export HTML…", command=self._export).pack(side="right", padx=4)
        self.status = ttk.Label(bot, text=f"repo: {self.repo_root}", foreground="#666")
        self.status.pack(side="left", padx=12)

    def _meta_entry(self, parent, label, key):
        row = ttk.Frame(parent); row.pack(fill="x", pady=2)
        ttk.Label(row, text=label, width=18, anchor="w").pack(side="left")
        var = tk.StringVar(value=self.meta.get(key, ""))
        ttk.Entry(row, textvariable=var).pack(side="left", fill="x", expand=True)
        var.trace_add("write", lambda *a: self.meta.__setitem__(key, var.get()))

    # ---- block list ops
    def _sel(self):
        s = self.listbox.curselection()
        return s[0] if s else None

    def _summary(self, b):
        t = b.get("type")
        if t == "heading":
            return f"H{b.get('level',2)}: {b.get('text','')[:28]}"
        if t == "paragraph":
            return f"¶ {b.get('text','')[:30]}"
        if t == "gallery":
            return f"Gallery ({len(b.get('items',[]))} imgs, {b.get('columns')}col)"
        if t == "image":
            return f"Image: {os.path.basename(b.get('full',''))}"
        if t == "video":
            return f"Video: {os.path.basename(b.get('src',''))}"
        if t == "two_column":
            return f"2-col: {b.get('heading','')[:20]}"
        if t == "audio":
            return f"Audio: {os.path.basename(b.get('src',''))}"
        if t == "list":
            return f"List ({len(b.get('items',[]))})"
        if t == "blockquote":
            return f"Quote: {b.get('quote','')[:24]}"
        if t == "hr":
            return "── divider ──"
        if t == "raw":
            return "Raw HTML"
        return t

    def _refresh_list(self, keep=None):
        self.listbox.delete(0, "end")
        for b in self.blocks:
            self.listbox.insert("end", self._summary(b))
        if keep is not None and 0 <= keep < len(self.blocks):
            self.listbox.selection_clear(0, "end")
            self.listbox.selection_set(keep)
            self.listbox.activate(keep)
        self._render_editor()

    def _add_block(self, key):
        self.blocks.append(B.new_block(key))
        self._refresh_list(keep=len(self.blocks) - 1)

    def _move(self, delta):
        i = self._sel()
        if i is None:
            return
        j = i + delta
        if 0 <= j < len(self.blocks):
            self.blocks[i], self.blocks[j] = self.blocks[j], self.blocks[i]
            self._refresh_list(keep=j)

    def _duplicate(self):
        i = self._sel()
        if i is None:
            return
        self.blocks.insert(i + 1, copy.deepcopy(self.blocks[i]))
        self._refresh_list(keep=i + 1)

    def _delete(self):
        i = self._sel()
        if i is None:
            return
        del self.blocks[i]
        self._refresh_list(keep=min(i, len(self.blocks) - 1))

    # ---- editor
    def _clear_editor(self):
        for w in self.editor.winfo_children():
            w.destroy()

    def _render_editor(self):
        self._clear_editor()
        i = self._sel()
        if i is None:
            ttk.Label(self.editor, text="Select or add a block to edit it.").pack(padx=10, pady=10)
            return
        b = self.blocks[i]
        ttk.Label(self.editor, text=self._summary(b), font=("", 10, "bold")).pack(anchor="w", padx=8, pady=(8, 4))
        body = ttk.Frame(self.editor); body.pack(fill="both", expand=True, padx=8, pady=4)
        getattr(self, f"_ed_{b['type']}", self._ed_generic)(body, b)

    def _entry_field(self, parent, label, b, key, refresh=False):
        row = ttk.Frame(parent); row.pack(fill="x", pady=2)
        ttk.Label(row, text=label, width=14, anchor="w").pack(side="left")
        var = tk.StringVar(value=str(b.get(key, "")))
        ttk.Entry(row, textvariable=var).pack(side="left", fill="x", expand=True)

        def on_write(*a):
            b[key] = var.get()
            if refresh:
                self._touch_summary()
        var.trace_add("write", on_write)
        return var

    def _text_field(self, parent, label, b, key, height=5):
        ttk.Label(parent, text=label, anchor="w").pack(fill="x", pady=(4, 0))
        t = tk.Text(parent, height=height, wrap="word")
        t.insert("1.0", b.get(key, ""))
        t.pack(fill="x")

        def save(e=None):
            b[key] = t.get("1.0", "end-1c")
            self._touch_summary()
        t.bind("<FocusOut>", save)
        t.bind("<KeyRelease>", save)
        return t

    def _touch_summary(self):
        i = self._sel()
        if i is not None and i < self.listbox.size():
            self.listbox.delete(i)
            self.listbox.insert(i, self._summary(self.blocks[i]))
            self.listbox.selection_set(i)

    # per-type editors
    def _ed_generic(self, p, b):
        ttk.Label(p, text="(no fields)").pack()

    def _ed_heading(self, p, b):
        row = ttk.Frame(p); row.pack(fill="x", pady=2)
        ttk.Label(row, text="Level", width=14, anchor="w").pack(side="left")
        lvl = tk.IntVar(value=b.get("level", 2))
        ttk.Combobox(row, textvariable=lvl, values=[1, 2, 3], width=4, state="readonly").pack(side="left")
        lvl.trace_add("write", lambda *a: (b.__setitem__("level", lvl.get()), self._touch_summary()))
        self._entry_field(p, "Text", b, "text", refresh=True)

    def _ed_paragraph(self, p, b):
        self._text_field(p, "Text (inline HTML like <strong>, <a href> allowed)", b, "text")

    def _ed_hr(self, p, b):
        ttk.Label(p, text="A horizontal divider. No options.").pack(anchor="w")

    def _ed_list(self, p, b):
        chk = tk.BooleanVar(value=b.get("ordered", False))
        ttk.Checkbutton(p, text="Numbered (ordered) list", variable=chk,
                        command=lambda: b.__setitem__("ordered", chk.get())).pack(anchor="w")
        ttk.Label(p, text="One item per line:").pack(anchor="w", pady=(6, 0))
        t = tk.Text(p, height=8, wrap="word")
        t.insert("1.0", "\n".join(b.get("items", [])))
        t.pack(fill="both", expand=True)

        def save(e=None):
            b["items"] = [ln for ln in t.get("1.0", "end-1c").split("\n")]
            self._touch_summary()
        t.bind("<FocusOut>", save); t.bind("<KeyRelease>", save)

    def _ed_blockquote(self, p, b):
        self._text_field(p, "Quote", b, "quote", height=4)
        self._entry_field(p, "Attribution", b, "cite")

    def _ed_audio(self, p, b):
        self._media_row(p, "Audio file", b, "src", ("Audio", "*.mp3 *.wav *.ogg"))
        self._entry_field(p, "Label", b, "title")

    def _ed_video(self, p, b):
        self._media_row(p, "Video file", b, "src", ("Video", "*.mp4 *.webm"))
        self._media_row(p, "Poster image", b, "poster", ("Images", "*.jpg *.jpeg *.png *.webp"))
        self._entry_field(p, "Caption", b, "caption")

    def _ed_image(self, p, b):
        self._image_picker_row(p, b)
        self._entry_field(p, "Alt text", b, "alt")
        self._entry_field(p, "Caption", b, "caption")
        chk = tk.BooleanVar(value=b.get("lightbox", True))
        ttk.Checkbutton(p, text="Click opens full-size (GLightbox)", variable=chk,
                        command=lambda: b.__setitem__("lightbox", chk.get())).pack(anchor="w", pady=2)

    def _ed_raw(self, p, b):
        self._text_field(p, "Raw HTML (inserted verbatim)", b, "html", height=12)

    def _ed_two_column(self, p, b):
        row = ttk.Frame(p); row.pack(fill="x", pady=2)
        ttk.Label(row, text="Media side", width=14, anchor="w").pack(side="left")
        side = tk.StringVar(value=b.get("media_side", "left"))
        ttk.Combobox(row, textvariable=side, values=["left", "right"], width=8, state="readonly").pack(side="left")
        side.trace_add("write", lambda *a: b.__setitem__("media_side", side.get()))
        row2 = ttk.Frame(p); row2.pack(fill="x", pady=2)
        ttk.Label(row2, text="Media type", width=14, anchor="w").pack(side="left")
        mt = tk.StringVar(value=b.get("media_type", "image"))
        ttk.Combobox(row2, textvariable=mt, values=["image", "video"], width=8, state="readonly").pack(side="left")
        mt.trace_add("write", lambda *a: b.__setitem__("media_type", mt.get()))
        self._image_picker_row(p, b, label="Media file")
        self._media_row(p, "Poster (video)", b, "poster", ("Images", "*.jpg *.jpeg *.png *.webp"))
        self._entry_field(p, "Alt text", b, "alt")
        self._entry_field(p, "Heading", b, "heading", refresh=True)
        self._text_field(p, "Text", b, "text", height=5)

    def _ed_gallery(self, p, b):
        top = ttk.Frame(p); top.pack(fill="x")
        ttk.Label(top, text="Columns", width=8).pack(side="left")
        cols = tk.IntVar(value=b.get("columns", 3))
        ttk.Combobox(top, textvariable=cols, values=[2, 3, 4, 5, 6], width=4, state="readonly").pack(side="left")
        cols.trace_add("write", lambda *a: b.__setitem__("columns", cols.get()))
        ttk.Label(top, text="Aspect", width=8).pack(side="left", padx=(10, 0))
        asp = tk.StringVar(value=b.get("aspect", "5/7"))
        ttk.Combobox(top, textvariable=asp, values=B.ASPECTS, width=8, state="readonly").pack(side="left")
        asp.trace_add("write", lambda *a: b.__setitem__("aspect", asp.get()))
        grp = self._entry_field(p, "Gallery group", b, "group")

        ttk.Label(p, text="Images:").pack(anchor="w", pady=(6, 0))
        lb = tk.Listbox(p, height=6, exportselection=False)
        lb.pack(fill="both", expand=True)
        for it in b.get("items", []):
            lb.insert("end", os.path.basename(it.get("full", "")))

        # per-item caption editor
        cap = ttk.Frame(p); cap.pack(fill="x", pady=4)
        alt_v = tk.StringVar(); title_v = tk.StringVar(); desc_v = tk.StringVar()
        for lab, var in (("Alt", alt_v), ("Title", title_v), ("Desc", desc_v)):
            r = ttk.Frame(cap); r.pack(fill="x")
            ttk.Label(r, text=lab, width=6).pack(side="left")
            ttk.Entry(r, textvariable=var).pack(side="left", fill="x", expand=True)

        def load_item(e=None):
            s = lb.curselection()
            if not s:
                return
            it = b["items"][s[0]]
            alt_v.set(it.get("alt", "")); title_v.set(it.get("title", "")); desc_v.set(it.get("description", ""))

        def save_item(*a):
            s = lb.curselection()
            if not s:
                return
            it = b["items"][s[0]]
            it["alt"], it["title"], it["description"] = alt_v.get(), title_v.get(), desc_v.get()
        for v in (alt_v, title_v, desc_v):
            v.trace_add("write", save_item)
        lb.bind("<<ListboxSelect>>", load_item)

        btns = ttk.Frame(p); btns.pack(fill="x")

        def add_imgs():
            picks = self._pick_media(("Images", "*.jpg *.jpeg *.png *.webp *.gif"), multiple=True, start="photos")
            for full, thumb in picks:
                b["items"].append({"full": full, "thumb": thumb, "alt": "", "title": "", "description": ""})
                lb.insert("end", os.path.basename(full))
            self._touch_summary()

        def rem_img():
            s = lb.curselection()
            if not s:
                return
            del b["items"][s[0]]
            lb.delete(s[0])
            self._touch_summary()
        ttk.Button(btns, text="Add images from repo…", command=add_imgs).pack(side="left")
        ttk.Button(btns, text="Remove selected", command=rem_img).pack(side="left", padx=4)

    # ---- media picking
    def _pick_media(self, filetype, multiple=False, start="photos"):
        initial = os.path.join(self.repo_root, start)
        if not os.path.isdir(initial):
            initial = self.repo_root
        types = [filetype, ("All files", "*.*")]
        if multiple:
            paths = filedialog.askopenfilenames(initialdir=initial, filetypes=types, title="Pick media")
        else:
            p = filedialog.askopenfilename(initialdir=initial, filetypes=types, title="Pick media")
            paths = [p] if p else []
        out = []
        for p in paths:
            web = web_path_from_abs(p, self.repo_root)
            if web is None:
                messagebox.showwarning("Outside repo",
                                       f"{p}\nis not inside the site repo ({self.repo_root}); skipped.")
                continue
            out.append(derive_full_thumb(web, self.repo_root))
        return out

    def _media_row(self, parent, label, b, key, filetype, start="music"):
        row = ttk.Frame(parent); row.pack(fill="x", pady=2)
        ttk.Label(row, text=label, width=14, anchor="w").pack(side="left")
        var = tk.StringVar(value=b.get(key, ""))
        ttk.Entry(row, textvariable=var).pack(side="left", fill="x", expand=True)
        var.trace_add("write", lambda *a: b.__setitem__(key, var.get()))

        def pick():
            res = self._pick_media(filetype, multiple=False, start=start)
            if res:
                full, thumb = res[0]
                var.set(full)  # for audio/video/poster we want the direct path
        ttk.Button(row, text="…", width=3, command=pick).pack(side="left", padx=2)

    def _image_picker_row(self, parent, b, label="Image file"):
        row = ttk.Frame(parent); row.pack(fill="x", pady=2)
        ttk.Label(row, text=label, width=14, anchor="w").pack(side="left")
        var = tk.StringVar(value=b.get("full", ""))
        ttk.Entry(row, textvariable=var).pack(side="left", fill="x", expand=True)
        var.trace_add("write", lambda *a: b.__setitem__("full", var.get()))

        def pick():
            res = self._pick_media(("Images", "*.jpg *.jpeg *.png *.webp *.gif *.svg"), multiple=False, start="photos")
            if res:
                full, thumb = res[0]
                b["full"], b["thumb"] = full, thumb
                var.set(full)
                self._touch_summary()
        ttk.Button(row, text="…", width=3, command=pick).pack(side="left", padx=2)

    def _pick_card_image(self):
        res = self._pick_media(("Images", "*.jpg *.jpeg *.png *.webp"), multiple=False, start="photos")
        if res:
            full, thumb = res[0]
            self.image_var.set(thumb)  # card image conventionally uses the _min thumbnail

    # ---- project + export
    def _new(self):
        if not messagebox.askyesno("New project", "Discard the current project?"):
            return
        self.meta = {"title": "", "date": datetime.date.today().isoformat(),
                     "tags": "", "description": "", "image": "", "draft": False}
        self.blocks = []
        self.project_path = None
        self._reload_meta_widgets()
        self._refresh_list()

    def _reload_meta_widgets(self):
        # simplest: rebuild the whole UI meta section by recreating the window state
        for w in self.winfo_children():
            w.destroy()
        self.image_var = None
        self._build_ui()

    def _save(self):
        path = filedialog.asksaveasfilename(
            initialdir=os.path.join(HERE, "projects"), defaultextension=".revproj",
            filetypes=[("Notebook project", "*.revproj"), ("JSON", "*.json")],
            initialfile=(slugify(self.meta.get("title", "")) + ".revproj"))
        if not path:
            return
        data = {"meta": self.meta, "blocks": self.blocks}
        with io.open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        self.project_path = path
        self.status.config(text=f"saved: {os.path.basename(path)}")

    def _open(self):
        path = filedialog.askopenfilename(
            initialdir=os.path.join(HERE, "projects"),
            filetypes=[("Notebook project", "*.revproj *.json"), ("All files", "*.*")])
        if not path:
            return
        with io.open(path, encoding="utf-8") as f:
            data = json.load(f)
        self.meta = data.get("meta", {})
        self.meta.setdefault("draft", False)
        self.blocks = data.get("blocks", [])
        self.project_path = path
        self._reload_meta_widgets()
        self._refresh_list()
        self.status.config(text=f"opened: {os.path.basename(path)}")

    def _export(self):
        if not self.meta.get("title"):
            messagebox.showwarning("No title", "Set a page title first (used for the filename + slug).")
            return
        default = slugify(self.meta["title"]) + ".html"
        path = filedialog.asksaveasfilename(
            initialdir=os.path.join(self.repo_root, "html_extras"),
            defaultextension=".html", initialfile=default,
            filetypes=[("HTML", "*.html")])
        if not path:
            return
        with io.open(path, "w", encoding="utf-8") as f:
            f.write(export_text(self.shell, self.meta, self.blocks))
        self.status.config(text=f"exported: {os.path.basename(path)}")
        messagebox.showinfo("Exported",
                            f"Wrote {path}\n\nIf it's not already in html_extras/, move it there, "
                            "then run npm start to build it into the site.")

    def _preview(self):
        html = preview_html(self.shell, self.meta, self.blocks, self.repo_root)
        tmp = tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8")
        tmp.write(html)
        tmp.close()
        webbrowser.open("file://" + tmp.name)
        self.status.config(text="preview opened in browser")


if __name__ == "__main__":
    App().mainloop()
