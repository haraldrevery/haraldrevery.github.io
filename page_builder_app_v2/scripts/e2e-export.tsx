/*
 * Step 17's end-to-end fixture: renders a page containing every block type in
 * the vertical slice and prints the exported file to stdout.
 *
 *   bun run scripts/e2e-export.tsx > /tmp/page.html
 *
 * Kept in the repo because it is the fastest way to eyeball real export output
 * without launching the app; it is not imported by anything.
 */
import { readFileSync } from "fs";
import type { Data } from "@measured/puck";
import { config } from "../src/puck/config";
import { DEFAULT_HERO, DEFAULT_META } from "../src/puck/PageRoot";
import { exportText } from "../src/export/export";
import { renderExportContent, renderExportHero } from "../src/export/renderExport";

const SITE = "https://haraldrevery.com";
const shell = readFileSync(new URL("../shell.html", import.meta.url).pathname, "utf8");

const photo = (n: string, alt: string, w: number, h: number) => ({
  full: `/photos/2025galdhoepiggen/${n}.jpg`,
  thumb: `/photos/2025galdhoepiggen/${n}_min.jpg`,
  alt,
  title: alt,
  description: `${alt} on the way up.`,
  w,
  h,
});

const data = {
  root: {
    props: {
      meta: {
        ...DEFAULT_META,
        title: "PB v2 end-to-end test",
        date: "2025-08-17",
        tags: "photography, test",
        description: "A page built by page_builder_app_v2 to verify the export pipeline.",
        image: "/photos/2025galdhoepiggen/2025jotunheimen_view_from_galdhopiggen1_min.jpg",
      },
      hasHero: true,
      hero: {
        ...DEFAULT_HERO,
        background: "backdrop",
        image: {
          full: "/photos/2025haraldgaldhopiggen3.jpg",
          thumb: "/photos/2025haraldgaldhopiggen3.jpg",
        },
        kicker: "Photography",
        title: "Galdhøpiggen",
        tagline: "A hike to the highest point in Norway.",
        anim: "fade",
      },
    },
  },
  content: [
    {
      type: "Text",
      props: {
        id: "t1",
        md: "## The approach\n\nWe walked the *north ridge* at first light. The air was thin and the light was flat, which suited the rock.\n\n---\n\n## Numbers\n\nThe summit sits at 2469 m, and the energy of the climb is roughly $E = mgh$.",
        animate: false,
        spacing: "normal",
      },
    },
    {
      type: "Gallery",
      props: {
        id: "g1",
        items: [
          photo("2025jotunheimen_view_from_galdhopiggen1", "View from the summit", 4032, 3024),
          photo("2025h_close_to_galdhopiggen_top5", "Close to the top", 3024, 4032),
        ],
        layout: "justified",
        rowHeight: 320,
        columns: 3,
        aspect: "5/7",
        group: "galdhopiggen",
        spacing: "normal",
      },
    },
    {
      type: "Image",
      props: {
        id: "im1",
        image: { full: "/photos/2025haraldgaldhopiggen3.jpg", thumb: "/photos/2025haraldgaldhopiggen3.jpg" },
        alt: "On the summit", caption: "On the summit", lightbox: true, widthPct: 80, spacing: "normal",
      },
    },
    { type: "Divider", props: { id: "d1", spacing: "normal" } },
    {
      type: "Faq",
      props: {
        id: "f1",
        items: [
          { q: "How long does it take?", a: "About **six hours** round trip." },
          { q: "Do you need a guide?", a: "Only for the glacier route." },
        ],
        spacing: "normal",
      },
    },
    {
      type: "Downloads",
      props: {
        id: "dl1",
        items: [{ src: "/files/example.zip", label: "Route GPX", size: 11200000, sha256: "aa11", sha512: "bb22" }],
        spacing: "normal",
      },
    },
    { type: "Raw", props: { id: "r1", html: '<p class="font-mono text-sm opacity-60">Raw HTML passthrough.</p>', spacing: "normal" } },
    {
      type: "Columns",
      props: {
        id: "c1",
        count: 2,
        verticalAlign: "center",
        spacing: "normal",
        left: [
          { type: "Text", props: { id: "cl", md: "The descent took longer than the climb.", animate: false, spacing: "normal" } },
        ],
        right: [
          { type: "Heading", props: { id: "cr", text: "Descent", level: 2, align: "center", animate: false, spacing: "normal" } },
        ],
      },
    },
  ],
} as unknown as Data;

process.stdout.write(
  exportText({
    shell,
    data,
    config,
    siteUrl: SITE,
    slug: "pb-v2-e2e-test",
    heroHtml: renderExportHero(data),
    contentHtml: renderExportContent(data),
  }),
);
