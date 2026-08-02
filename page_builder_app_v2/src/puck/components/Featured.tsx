/*
 * Featured dispatch — a photo with the site's frosted .preview-card panel
 * overlapping its inner edge, holding a mono eyebrow tag, a display title and
 * an excerpt.
 *
 * Unlike every other component here this one has no v1 counterpart: it is a new
 * design, adapted from a mockup into the site's own vocabulary. Nothing about
 * the layout lives in this file — it is all `.featured-card*` in input.css
 * (search "Featured dispatch"), compiled into main.css. Zero JavaScript, except
 * that the photo is a GLightbox trigger like every other image on the site.
 *
 * The card class rides on BlockShell's `extra`, so the <section> the shell
 * already emits IS the grid — no wrapper element of our own. That is also why
 * this block is NOT in EMBEDDABLE: inside a Columns slot BlockShell emits no
 * wrapper at all (nesting.tsx), the `extra` class would be dropped on the
 * floor, the grid would never exist and the panel would render as a plain
 * frosted box under the photo. Same reasoning as Downloads.
 */
import type { PuckContext } from "@measured/puck";
import { BlockShell } from "../nesting";
import { EmptyHint } from "../EmptyHint";
import { glightboxCaption } from "../shared";
import type { Spacing } from "../spacing";
import type { PickedImage } from "../fields/mediaField";

export interface FeaturedProps {
  /// {full, thumb} as ONE prop — a custom field's onChange can only write its
  /// own prop, so the path and its _min twin have to travel together. Same
  /// shape as the Image block and the hero. See fields/mediaField.tsx.
  image: PickedImage;
  alt: string;
  tag: string;
  title: string;
  excerpt: string;
  lightbox: boolean;
  photoSide: "left" | "right";
  spacing: Spacing;
  puck?: PuckContext;
}

export function Featured({
  image,
  alt,
  tag,
  title,
  excerpt,
  lightbox,
  photoSide,
  spacing,
  puck,
}: FeaturedProps) {
  const img = image ?? { full: "", thumb: "" };
  const src = img.thumb || img.full;
  const eyebrow = (tag ?? "").trim();
  const heading = (title ?? "").trim();
  const body = (excerpt ?? "").trim();

  if (!src && !eyebrow && !heading && !body) {
    // Nothing to show and nothing to say: publish nothing rather than an empty
    // frosted box. PuckComponent must return an element, hence the fragment.
    return puck?.isEditing ? (
      <EmptyHint label="Empty featured dispatch — pick a photo and write the title in the sidebar" />
    ) : (
      <></>
    );
  }

  const picture = <img src={src} alt={alt ?? ""} loading="lazy" />;

  /*
   * `null` rather than a wrapper when there is no photo: the panel then becomes
   * the FIRST ELEMENT CHILD, which is exactly what
   * `.featured-card__panel:first-child` keys off to drop its mobile pull-up.
   * Without that the panel would hang upward over the previous block.
   *
   * data-gallery="single" matches the Image block, so a page's standalone
   * photos share one lightbox gallery and the arrows slide between them.
   */
  const media = !src ? null : lightbox && img.full ? (
    <a
      className="glightbox featured-card__media"
      href={img.full}
      data-gallery="single"
      data-glightbox={glightboxCaption(heading, "")}
    >
      {picture}
    </a>
  ) : (
    <div className="featured-card__media">{picture}</div>
  );

  return (
    <BlockShell
      spacing={spacing}
      extra={photoSide === "right" ? "featured-card featured-card-flip" : "featured-card"}
    >
      {media}
      {/* .preview-card is the site's existing frosted panel (input.css); the
          co-class adds only what the overlap needs. */}
      <div className="preview-card featured-card__panel">
        {eyebrow && <p className="featured-card__eyebrow">{eyebrow}</p>}
        {heading && <h2 className="featured-card__title">{heading}</h2>}
        {body && <p className="featured-card__excerpt">{body}</p>}
      </div>
    </BlockShell>
  );
}
