/*
 * The block registry — ONE entry per block type, replacing v1's three parallel
 * Records (defs.ts BLOCK_META, render.ts RENDERERS, ui/blockForms.ts FORMS).
 * Label, defaults, form fields and renderer now live in one object, and
 * TypeScript's Config<{components: Props}> generic gives the same "add a type
 * and it won't compile until every piece exists" property the Record triad had.
 *
 * Rule inherited from v1 (render.ts:13): only emit Tailwind classes that exist
 * in the compiled main.css — there is no CSS build on export. tests/render.test.tsx
 * greps the real CSS to enforce this.
 */
import type { Config } from "@measured/puck";
import { spacingField } from "./spacing";
import { Heading, type HeadingProps } from "./components/Heading";
import { Text, type TextProps } from "./components/Text";
import { Gallery, type GalleryProps, ASPECTS, GALLERY_COLUMNS } from "./components/Gallery";
import { Columns, type ColumnsProps } from "./components/Columns";
import {
  Divider, Image, Svg, Video, Audio, Raw,
  type DividerProps, type ImageProps, type SvgProps,
  type VideoProps, type AudioProps, type RawProps,
} from "./components/Media";
import {
  Icons, Faq, Downloads,
  type IconsProps, type FaqProps, type DownloadsProps,
} from "./components/Lists";
import { IconItemsEditor, DownloadItemsEditor } from "./fields/ListEditors";
import { GalleryItemsEditor } from "./fields/GalleryItemsEditor";
import { pathField, imageField, EMPTY_IMAGE } from "./fields/mediaField";
import { PageRoot, DEFAULT_META, DEFAULT_HERO, type RootProps } from "./PageRoot";

export interface Components {
  Text: TextProps;
  Heading: HeadingProps;
  Gallery: GalleryProps;
  Image: ImageProps;
  Svg: SvgProps;
  Video: VideoProps;
  Audio: AudioProps;
  Icons: IconsProps;
  Faq: FaqProps;
  Downloads: DownloadsProps;
  Divider: DividerProps;
  Raw: RawProps;
  Columns: ColumnsProps;
}

/// Types allowed inside a Columns slot — the direct replacement for v1's
/// BLOCK_META[t].embeddable flag (defs.ts:33). Columns is deliberately absent:
/// nesting columns in columns has no markup in the site's vocabulary.
export const EMBEDDABLE: string[] = [
  "Text", "Heading", "Gallery", "Image", "Svg", "Video", "Audio", "Icons", "Faq", "Raw",
];
// Deliberately NOT embeddable: Columns (nesting columns in columns has no
// markup in the site's vocabulary), Divider (a rule inside a narrow column
// reads as an accident), and Downloads (the hash table needs full width).

const animateField = {
  type: "radio" as const,
  label: "Word animation",
  options: [
    { label: "Off", value: false },
    { label: "On", value: true },
  ],
};

const onOff = (label: string) => ({
  type: "radio" as const,
  label,
  options: [
    { label: "Off", value: false },
    { label: "On", value: true },
  ],
});

export const config: Config<{ components: Components; root: RootProps }> = {
  root: {
    render: PageRoot,
    fields: {
      meta: {
        type: "object",
        label: "Page / SEO",
        objectFields: {
          title: { type: "text", label: "Title" },
          date: { type: "text", label: "Date (YYYY-MM-DD)" },
          tags: { type: "text", label: "Tags (comma separated)" },
          description: { type: "textarea", label: "Description" },
          image: pathField("image", "notebook_thumbnails", "Card image"),
          draft: onOff("Draft (skipped by the Eleventy build)"),
          schemaType: {
            type: "select",
            label: "JSON-LD type",
            options: [
              { label: "Auto (from content)", value: "auto" },
              { label: "BlogPosting", value: "blogposting" },
              { label: "Article", value: "article" },
              { label: "ImageGallery", value: "imagegallery" },
              { label: "FAQPage", value: "faqpage" },
            ],
          },
        },
      },
      hasHero: onOff("Hero"),
      hero: {
        type: "object",
        label: "Hero",
        objectFields: {
          background: {
            type: "select",
            label: "Background",
            options: [
              { label: "None", value: "none" },
              { label: "Dot grid", value: "dots" },
              { label: "Blurred backdrop", value: "backdrop" },
              { label: "Full-bleed cover photo", value: "cover" },
            ],
          },
          coverStyle: {
            type: "radio",
            label: "Cover scrim",
            options: [
              { label: "Dark (white text)", value: "dark" },
              { label: "Light (black text)", value: "light" },
            ],
          },
          // Picks the full-size photo AND its _min twin in one go — the
          // backdrop uses the thumb, the cover uses the full-size image.
          image: imageField("photos", "Photo"),
          showSvg: onOff("Show SVG"),
          svgSrc: pathField("svg", "svg", "SVG file"),
          svgWidthPct: { type: "number", label: "SVG width (%)", min: 5, max: 100 },
          svgX: { type: "number", label: "SVG offset X (%)" },
          svgY: { type: "number", label: "SVG offset Y (%)" },
          kicker: { type: "text", label: "Kicker" },
          title: { type: "text", label: "Title (h1)" },
          tagline: { type: "textarea", label: "Tagline" },
          align: {
            type: "radio",
            label: "Align",
            options: [
              { label: "Left", value: "left" },
              { label: "Center", value: "center" },
            ],
          },
          anim: {
            type: "select",
            label: "Animation",
            options: [
              { label: "None", value: "none" },
              { label: "Fade", value: "fade" },
              { label: "Per-word", value: "words" },
            ],
          },
          navReveal: onOff("Nav reveals on scroll"),
          backLink: onOff("Back to Notebook link"),
          scrollPrompt: { type: "textarea", label: "Scroll prompt (empty = off)" },
        },
      },
    },
    defaultProps: {
      meta: DEFAULT_META,
      hasHero: false,
      hero: DEFAULT_HERO,
    },
  },
  components: {
    // Insertion order = palette order. Text first: it is the block you reach
    // for by default, and Heading exists only for its two extras.
    Text: {
      label: "Text (markdown + KaTeX)",
      fields: {
        md: { type: "textarea", label: "Markdown" },
        animate: animateField,
        spacing: spacingField,
      },
      defaultProps: { md: "", animate: false, spacing: "normal" },
      render: Text,
    },
    Heading: {
      label: "Heading (centred / animated)",
      fields: {
        text: { type: "text", label: "Text" },
        level: {
          type: "select",
          label: "Level",
          options: [
            { label: "H1", value: 1 },
            { label: "H2", value: 2 },
            { label: "H3", value: 3 },
          ],
        },
        align: {
          type: "radio",
          label: "Align",
          options: [
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
          ],
        },
        animate: animateField,
        spacing: spacingField,
      },
      defaultProps: {
        text: "Heading",
        level: 2,
        align: "left",
        animate: false,
        spacing: "normal",
      },
      render: Heading,
    },

    Gallery: {
      label: "Photo gallery",
      fields: {
        items: {
          type: "custom",
          label: "Photos",
          render: ({ value, onChange }) => (
            <GalleryItemsEditor value={value} onChange={onChange} />
          ),
        },
        layout: {
          type: "select",
          label: "Layout",
          options: [
            { label: "Justified (rows)", value: "justified" },
            { label: "Uniform grid", value: "uniform" },
            { label: "Feature (first image 2×2)", value: "feature" },
          ],
        },
        rowHeight: { type: "number", label: "Target row height (px)", min: 60, max: 900 },
        columns: {
          type: "select",
          label: "Columns",
          options: GALLERY_COLUMNS.map((n) => ({ label: String(n), value: n })),
        },
        aspect: {
          type: "select",
          label: "Aspect ratio",
          options: ASPECTS.map((a) => ({ label: a, value: a })),
        },
        group: { type: "text", label: "Lightbox group" },
        spacing: spacingField,
      },
      // Hide the fields the current layout ignores. v1 did this by rebuilding
      // the whole form imperatively (the edit vs editStructural distinction in
      // ui/blockForms.ts, which lost input focus when you got it wrong); here it
      // is a pure function of the props.
      //
      // `visible: false` rather than omitting the key: Fields<Props> requires
      // every prop to have a field, so omission does not typecheck.
      resolveFields: (data, { fields }) => {
        const layout = data.props.layout;
        return {
          ...fields,
          rowHeight: { ...fields.rowHeight, visible: layout === "justified" },
          columns: { ...fields.columns, visible: layout === "uniform" },
          aspect: { ...fields.aspect, visible: layout === "uniform" },
          // feature is a fixed 3x3 grid — nothing to configure
        };
      },
      defaultProps: {
        items: [],
        layout: "justified",
        rowHeight: 320,
        columns: 3,
        aspect: "5/7",
        group: "gallery",
        spacing: "normal",
      },
      render: Gallery,
    },

    Image: {
      label: "Single image",
      fields: {
        image: imageField("photos", "Image"),
        alt: { type: "text", label: "Alt text" },
        caption: { type: "text", label: "Caption" },
        lightbox: onOff("Open in lightbox"),
        widthPct: { type: "number", label: "Width (%)", min: 5, max: 100 },
        spacing: spacingField,
      },
      defaultProps: {
        image: EMPTY_IMAGE, alt: "", caption: "", lightbox: true, widthPct: 100, spacing: "normal",
      },
      render: Image,
    },

    Svg: {
      label: "SVG",
      fields: {
        src: pathField("svg", "svg", "SVG file"),
        themed: onOff("Follow light/dark theme"),
        hoverGrow: onOff("Grow on hover"),
        link: { type: "text", label: "Link (optional)" },
        alt: { type: "text", label: "Alt text" },
        widthPct: { type: "number", label: "Width (%)", min: 5, max: 100 },
        spacing: spacingField,
      },
      defaultProps: {
        src: "", themed: true, hoverGrow: false, link: "", alt: "", widthPct: 100, spacing: "normal",
      },
      render: Svg,
    },

    Video: {
      label: "Video",
      fields: {
        src: pathField("video", "video", "Video file"),
        poster: pathField("image", "photos", "Poster image"),
        caption: { type: "text", label: "Caption" },
        spacing: spacingField,
      },
      defaultProps: { src: "", poster: "", caption: "", spacing: "normal" },
      render: Video,
    },

    Audio: {
      label: "Audio",
      fields: {
        src: pathField("audio", "audio", "Audio file"),
        title: { type: "text", label: "Title" },
        panel: onOff("Frosted release card"),
        spacing: spacingField,
      },
      defaultProps: { src: "", title: "", panel: false, spacing: "normal" },
      render: Audio,
    },

    Icons: {
      label: "Social icons",
      fields: {
        items: {
          type: "custom",
          label: "Icons",
          render: ({ value, onChange }) => <IconItemsEditor value={value} onChange={onChange} />,
        },
        size: {
          type: "select",
          label: "Size",
          options: [
            { label: "Small", value: "small" },
            { label: "Medium", value: "medium" },
            { label: "Large", value: "large" },
          ],
        },
        label: { type: "text", label: "Panel label (blank = centred row)" },
        spacing: spacingField,
      },
      defaultProps: { items: [], size: "medium", label: "", spacing: "normal" },
      render: Icons,
    },

    Faq: {
      label: "FAQ (accordion)",
      fields: {
        items: {
          type: "array",
          label: "Questions",
          arrayFields: {
            q: { type: "text", label: "Question" },
            a: { type: "textarea", label: "Answer (markdown)" },
          },
          // Without this Puck appends an item with NO q/a at all, and the
          // component crashed reading `.trim()` on undefined. Required, not
          // cosmetic.
          defaultItemProps: { q: "", a: "" },
          getItemSummary: (it: { q?: string }) => it.q || "Question",
        },
        spacing: spacingField,
      },
      defaultProps: { items: [], spacing: "normal" },
      render: Faq,
    },

    Downloads: {
      label: "Downloads (SHA table)",
      fields: {
        items: {
          type: "custom",
          label: "Files",
          render: ({ value, onChange }) => <DownloadItemsEditor value={value} onChange={onChange} />,
        },
        spacing: spacingField,
      },
      defaultProps: { items: [], spacing: "normal" },
      render: Downloads,
    },

    Divider: {
      label: "Divider (rule)",
      fields: { spacing: spacingField },
      defaultProps: { spacing: "normal" },
      render: Divider,
    },

    Raw: {
      label: "Raw HTML",
      fields: {
        html: { type: "textarea", label: "HTML" },
        spacing: spacingField,
      },
      defaultProps: { html: "", spacing: "normal" },
      render: Raw,
    },

    Columns: {
      label: "Columns (1–2, any content)",
      fields: {
        count: {
          type: "radio",
          label: "Columns",
          options: [
            { label: "1", value: 1 },
            { label: "2", value: 2 },
          ],
        },
        verticalAlign: {
          type: "radio",
          label: "Vertical align",
          options: [
            { label: "Center", value: "center" },
            { label: "Top", value: "top" },
          ],
        },
        left: { type: "slot", allow: EMBEDDABLE },
        right: { type: "slot", allow: EMBEDDABLE },
        spacing: spacingField,
      },
      // With count 1 the right slot's data is kept but not rendered, so hide
      // its field rather than offering a drop target for invisible content.
      resolveFields: (data, { fields }) => ({
        ...fields,
        right: { ...fields.right, visible: data.props.count === 2 },
      }),
      defaultProps: {
        count: 2,
        verticalAlign: "center",
        left: [],
        right: [],
        spacing: "normal",
      },
      render: Columns,
    },
  },
};
