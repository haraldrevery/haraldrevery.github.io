/*
 * Single-media blocks: Divider, Image, Svg, Video, Audio, Raw.
 * Transcribed from page_builder/src/blocks/render.ts:246-342 and the RENDERERS
 * map at :652-712.
 *
 * Grouped in one file because each is small and they share the same shape —
 * a BlockShell (or ProseShell for Divider) around a handful of elements.
 */
import type { PuckContext } from "@measured/puck";
import { BlockShell, ProseShell } from "../nesting";
import { EmptyHint } from "../EmptyHint";
import { getSvgText, themeSvgText, prepareSvgForInline } from "../../blocks/svgStore";
import { escAttr, glightboxCaption, pctStyle } from "../shared";
import type { Spacing } from "../spacing";
import type { PickedImage } from "../fields/mediaField";

// ------------------------------------------------------------------- divider

export interface DividerProps {
  spacing: Spacing;
}

/// A rule between blocks. Inside a Text block, markdown `---` already produces
/// one; this exists for a rule between NON-prose blocks (say a gallery and a
/// heading), which markdown cannot reach.
export function Divider({ spacing }: DividerProps) {
  return (
    <ProseShell spacing={spacing}>
      <hr />
    </ProseShell>
  );
}

// --------------------------------------------------------------------- image

export interface ImageProps {
  image: PickedImage;
  alt: string;
  caption: string;
  lightbox: boolean;
  widthPct: number;
  spacing: Spacing;
  puck?: PuckContext;
}

export function Image({ image, alt, caption, lightbox, widthPct, spacing, puck }: ImageProps) {
  const img = image ?? { full: "", thumb: "" };
  if (!img.full && !img.thumb) {
    // Emit NOTHING rather than v1's `<img src="">`, which published as a broken
    // image icon. PuckComponent must return an element, so use a fragment.
    return puck?.isEditing ? <EmptyHint label="No image — pick one in the sidebar" /> : <></>;
  }
  const cap = (caption || "").trim();
  const src = img.thumb || img.full;

  const picture = (
    <img src={src} alt={alt} className="w-full rounded-lg" loading="lazy" />
  );

  return (
    <BlockShell spacing={spacing}>
      <figure style={pctStyle(widthPct)}>
        {lightbox && img.full ? (
          <a
            href={img.full}
            className="glightbox block"
            data-gallery="single"
            data-glightbox={glightboxCaption(cap, "")}
          >
            {picture}
          </a>
        ) : (
          picture
        )}
        {cap && <figcaption>{cap}</figcaption>}
      </figure>
    </BlockShell>
  );
}

// ----------------------------------------------------------------------- svg

export interface SvgFields {
  src: string;
  /// Inline the file with colours replaced by currentColor, so it inherits
  /// `text-black dark:text-white` from the page body and follows the theme.
  /// Not themed = a plain linked <img>, like every other medium.
  themed: boolean;
  hoverGrow: boolean;
  link: string;
  alt: string;
  widthPct: number;
}

export interface SvgProps extends SvgFields {
  spacing: Spacing;
  puck?: PuckContext;
}

/// Shared with the hero's svg foreground.
export function SvgFigure(f: SvgFields) {
  // An inlined svg arrives as a STRING. It must become the innerHTML of a
  // wrapper that already exists — wrapping it in a <span> of its own would add
  // an element v1 never emitted, to every page using the block.
  let innerHtml: string | undefined;
  let innerNode: React.ReactNode;

  if (f.themed) {
    const text = f.src ? getSvgText(f.src) : undefined;
    if (text === undefined) {
      innerNode = (
        <div className="font-mono text-sm text-neutral-500">
          {f.src ? `[svg ${f.src} not loaded]` : "[SVG — pick a file]"}
        </div>
      );
    } else {
      let s = prepareSvgForInline(themeSvgText(text));
      if (f.alt) s = s.replace(/<svg/i, `<svg role="img" aria-label="${escAttr(f.alt)}"`);
      innerHtml = s;
    }
  } else {
    innerNode = <img src={f.src} alt={f.alt} className="w-full" loading="lazy" />;
  }

  const raw = innerHtml !== undefined ? { dangerouslySetInnerHTML: { __html: innerHtml } } : {};
  const kids = innerHtml !== undefined ? {} : { children: innerNode };

  // classes verified present in the compiled main.css
  const grow = f.hoverGrow ? "transition-transform duration-300 hover:scale-105" : "";
  const outer = { className: "mx-auto", style: pctStyle(f.widthPct) };

  if (f.link) {
    return (
      <div {...outer}>
        <a href={f.link} className={grow ? `block ${grow}` : "block"} {...raw} {...kids} />
      </div>
    );
  }
  if (grow) {
    return (
      <div {...outer}>
        <div className={grow} {...raw} {...kids} />
      </div>
    );
  }
  return <div {...outer} {...raw} {...kids} />;
}

export function Svg({ spacing, puck, ...f }: SvgProps) {
  if (!f.src && puck?.isEditing) {
    return <EmptyHint label="No SVG — pick a file in the sidebar" />;
  }
  return (
    <BlockShell spacing={spacing}>
      <SvgFigure {...f} />
    </BlockShell>
  );
}

// --------------------------------------------------------------------- video

export interface VideoProps {
  src: string;
  poster: string;
  caption: string;
  spacing: Spacing;
  puck?: PuckContext;
}

export function Video({ src, poster, caption, spacing, puck }: VideoProps) {
  if (!src && puck?.isEditing) {
    return <EmptyHint label="No video — pick a file in the sidebar" />;
  }
  const cap = (caption || "").trim();
  return (
    <BlockShell spacing={spacing}>
      <figure>
        <video controls className="w-full rounded-lg" poster={poster || undefined}>
          <source src={src} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        {cap && <figcaption>{cap}</figcaption>}
      </figure>
    </BlockShell>
  );
}

// --------------------------------------------------------------------- audio

export interface AudioProps {
  src: string;
  title: string;
  /// release-page "preview card": frosted-glass panel with the release-style
  /// caption (the beautiful_places.html "Listen everywhere" look).
  panel: boolean;
  spacing: Spacing;
  puck?: PuckContext;
}

export function Audio({ src, title, panel, spacing, puck }: AudioProps) {
  if (!src && puck?.isEditing) {
    return <EmptyHint label="No audio — pick a file in the sidebar" />;
  }

  const body = panel ? (
    <div className="preview-card">
      {/* letter-spacing inline: the release pages' tracking-eyebrow utility
          only ships if a scanned file uses it, so it may not be compiled. */}
      <p className="font-mono text-xs uppercase opacity-50 mb-3" style={{ letterSpacing: "0.3em" }}>
        {title || "Preview"}
      </p>
      <audio controls preload="none" className="w-full">
        <source src={src} type="audio/mpeg" />
        Your browser does not support the audio element.
      </audio>
    </div>
  ) : (
    <>
      {title && (
        <p className="font-mono text-sm uppercase tracking-widest mb-2 text-neutral-600 dark:text-neutral-400">
          {title}
        </p>
      )}
      <audio controls className="w-full" src={src}></audio>
    </>
  );

  return <BlockShell spacing={spacing}>{body}</BlockShell>;
}

// ----------------------------------------------------------------------- raw

export interface RawProps {
  html: string;
  spacing: Spacing;
  puck?: PuckContext;
}

/// Verbatim HTML. Wrapped so it shares the uniform block gap; the author
/// controls everything inside.
export function Raw({ html, spacing, puck }: RawProps) {
  if (!(html ?? "").trim() && puck?.isEditing) {
    return <EmptyHint label="Empty raw HTML block — write markup in the sidebar" />;
  }
  return <BlockShell spacing={spacing} html={html ?? ""} />;
}
