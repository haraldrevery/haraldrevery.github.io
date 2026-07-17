"""
HTML renderers for the Notebook Page Builder.

Pure Python stdlib. A "block" is a plain dict: {"type": <name>, ...fields}.
`render_content(blocks)` returns the HTML string that goes into the {{CONTENT}}
slot of shell.html. Consecutive prose blocks (heading/paragraph/list/blockquote/
hr) are grouped into a single <article class="prose ..."> wrapper so the site's
typography/spacing is correct; media blocks are emitted as their own <section>.

The emitted markup mirrors the real site exactly:
  - galleries -> GLightbox <a class="portfolio-item glightbox ..."> items
  - images    -> optional GLightbox <figure>
  - video     -> <video controls poster=...><source ...></video>
  - absolute /paths, _min thumbnails, data-gallery grouping.
"""
import html

PROSE_TYPES = {"heading", "paragraph", "list", "blockquote", "hr"}

# Aspect-ratio presets offered in the UI -> Tailwind class fragment
ASPECTS = ["5/7", "4/5", "square", "video", "16/10", "3/2", "21/9", "1/1"]


def _aspect_class(aspect):
    if aspect == "square":
        return "aspect-square"
    if aspect == "video":
        return "aspect-video"
    return f"aspect-[{aspect}]"


def esc_attr(s):
    """Escape a value destined for an HTML attribute."""
    return html.escape(str(s or ""), quote=True)


def esc_text(s):
    """Escape a value destined for text content (headings, cite)."""
    return html.escape(str(s or ""), quote=False)


def _glightbox_caption(title, desc):
    # GLightbox parses "key: value; key: value" -> ';' and ':' are structural,
    # so strip them out of user text to avoid breaking the caption.
    title = (title or "").replace(";", ",").replace(":", " -").strip()
    desc = (desc or "").replace(";", ",").replace(":", " -").strip()
    return esc_attr(f"title: {title}; description: {desc}")


# ---------------------------------------------------------------- prose blocks
def _prose_block(b):
    t = b["type"]
    if t == "heading":
        lvl = max(1, min(3, int(b.get("level", 2))))
        return f"<h{lvl}>{esc_text(b.get('text', ''))}</h{lvl}>"
    if t == "paragraph":
        # user may include inline HTML (<strong>, <a>, <em>) -> emit as-is
        return f"<p>{b.get('text', '')}</p>"
    if t == "list":
        tag = "ol" if b.get("ordered") else "ul"
        items = "".join(f"<li>{it}</li>" for it in b.get("items", []) if str(it).strip())
        return f"<{tag}>{items}</{tag}>"
    if t == "blockquote":
        cite = (b.get("cite", "") or "").strip()
        footer = f"<footer>&mdash; <cite>{esc_text(cite)}</cite></footer>" if cite else ""
        return f"<blockquote><p>{b.get('quote', '')}</p>{footer}</blockquote>"
    if t == "hr":
        return "<hr>"
    return ""


# --------------------------------------------------------------- media blocks
def _gallery(b):
    cols = int(b.get("columns", 3))
    acl = _aspect_class(b.get("aspect", "5/7"))
    group = esc_attr(b.get("group", "gallery"))
    items = []
    for it in b.get("items", []):
        full = esc_attr(it.get("full", ""))
        thumb = esc_attr(it.get("thumb", "") or it.get("full", ""))
        alt = esc_attr(it.get("alt", ""))
        cap = _glightbox_caption(it.get("title", ""), it.get("description", ""))
        items.append(
            f'      <a href="{full}"\n'
            f'         class="portfolio-item glightbox block {acl}"\n'
            f'         data-gallery="{group}"\n'
            f'         data-glightbox="{cap}"\n'
            f'         style="--delay: 0.1s">\n'
            f'        <div class="overlay"></div>\n'
            f'        <img src="{thumb}" alt="{alt}" class="w-full h-full object-cover" loading="lazy">\n'
            f'      </a>'
        )
    grid = f"grid grid-cols-2 md:grid-cols-{cols} gap-6"
    return (
        '<section class="mb-20">\n'
        f'  <div class="{grid}">\n'
        + "\n".join(items) +
        '\n  </div>\n</section>'
    )


def _image(b):
    full = esc_attr(b.get("full", ""))
    thumb = esc_attr(b.get("thumb", "") or b.get("full", ""))
    alt = esc_attr(b.get("alt", ""))
    caption = (b.get("caption", "") or "").strip()
    figcap = f"\n    <figcaption>{caption}</figcaption>" if caption else ""
    if b.get("lightbox", True) and full:
        cap = _glightbox_caption(caption, "")
        img = (
            f'    <a href="{full}" class="glightbox block" data-gallery="single" data-glightbox="{cap}">\n'
            f'      <img src="{thumb}" alt="{alt}" class="w-full rounded-lg" loading="lazy">\n'
            f'    </a>'
        )
    else:
        img = f'    <img src="{thumb or full}" alt="{alt}" class="w-full rounded-lg" loading="lazy">'
    return f'<section class="mb-16">\n  <figure>\n{img}{figcap}\n  </figure>\n</section>'


def _video(b):
    src = esc_attr(b.get("src", ""))
    poster = esc_attr(b.get("poster", ""))
    poster_attr = f' poster="{poster}"' if poster else ""
    caption = (b.get("caption", "") or "").strip()
    figcap = f"\n    <figcaption>{caption}</figcaption>" if caption else ""
    return (
        '<section class="mb-16">\n  <figure>\n'
        f'    <video controls class="w-full rounded-lg"{poster_attr}>\n'
        f'      <source src="{src}" type="video/mp4">\n'
        f'      Your browser does not support the video tag.\n'
        f'    </video>{figcap}\n  </figure>\n</section>'
    )


def _media_html(b):
    """Inner media markup for a two-column block (no wrapping <section>)."""
    if b.get("media_type", "image") == "video":
        poster = esc_attr(b.get("poster", ""))
        poster_attr = f' poster="{poster}"' if poster else ""
        return (
            f'<video controls class="w-full rounded-lg"{poster_attr}>'
            f'<source src="{esc_attr(b.get("src", ""))}" type="video/mp4"></video>'
        )
    return (
        f'<img src="{esc_attr(b.get("thumb", "") or b.get("full", ""))}" '
        f'alt="{esc_attr(b.get("alt", ""))}" class="w-full rounded-lg" loading="lazy">'
    )


def _two_column(b):
    heading = esc_text(b.get("heading", ""))
    text = b.get("text", "")
    prose = (
        '<div class="prose dark:prose-invert max-w-none {order}">'
        f'<h2>{heading}</h2><p>{text}</p></div>'
    )
    media = '<div class="{order}">' + _media_html(b) + '</div>'
    if b.get("media_side", "left") == "left":
        inner = media.format(order="order-2 md:order-1") + prose.format(order="order-1 md:order-2")
    else:
        inner = prose.format(order="order-1") + media.format(order="order-2")
    return (
        '<section class="py-12 extra_fade_effect">\n'
        f'  <div class="grid md:grid-cols-2 gap-16 items-center">{inner}</div>\n</section>'
    )


def _audio(b):
    src = esc_attr(b.get("src", ""))
    title = esc_text(b.get("title", ""))
    label = (
        f'\n  <p class="font-mono text-sm uppercase tracking-widest mb-2 text-neutral-600 dark:text-neutral-400">{title}</p>'
        if title else ""
    )
    return f'<section class="mb-12">{label}\n  <audio controls class="w-full" src="{src}"></audio>\n</section>'


def _raw(b):
    return b.get("html", "")


RENDERERS = {
    "gallery": _gallery,
    "image": _image,
    "video": _video,
    "two_column": _two_column,
    "audio": _audio,
    "raw": _raw,
}


def render_content(blocks):
    """Render the ordered block list into the HTML for the {{CONTENT}} slot."""
    out = []
    prose_buf = []

    def flush():
        if prose_buf:
            inner = "\n  ".join(prose_buf)
            out.append(f'<article class="prose dark:prose-invert max-w-none">\n  {inner}\n</article>')
            prose_buf.clear()

    for b in blocks:
        if b.get("type") in PROSE_TYPES:
            prose_buf.append(_prose_block(b))
        else:
            flush()
            fn = RENDERERS.get(b.get("type"))
            if fn:
                out.append(fn(b))
    flush()
    return "\n\n".join(out)


# ------------------------------------------------- fresh block defaults (UI)
def new_block(btype):
    defaults = {
        "heading": {"type": "heading", "level": 2, "text": ""},
        "paragraph": {"type": "paragraph", "text": ""},
        "list": {"type": "list", "ordered": False, "items": [""]},
        "blockquote": {"type": "blockquote", "quote": "", "cite": ""},
        "hr": {"type": "hr"},
        "gallery": {"type": "gallery", "columns": 3, "aspect": "5/7", "group": "gallery1", "items": []},
        "image": {"type": "image", "full": "", "thumb": "", "alt": "", "caption": "", "lightbox": True},
        "video": {"type": "video", "src": "", "poster": "", "caption": ""},
        "two_column": {"type": "two_column", "media_side": "left", "media_type": "image",
                        "full": "", "thumb": "", "alt": "", "src": "", "poster": "",
                        "heading": "", "text": ""},
        "audio": {"type": "audio", "src": "", "title": ""},
        "raw": {"type": "raw", "html": ""},
    }
    import copy
    return copy.deepcopy(defaults[btype])
