/*
 * Full-page preview (/__pb/preview).
 *
 * Two properties carry the whole feature:
 *
 *  1. The preview is the PUBLISHED document, not the exported file. exportText
 *     prepends YAML front matter that Eleventy strips before copying the body to
 *     notebook_pages/; previewing that string would put raw YAML at the top of
 *     the page. So buildPreview must equal exportText minus the front matter.
 *
 *  2. Rendering a preview must not touch the project. buildExport runs the
 *     fix-up passes, which mutate `data` in place — reusing it here would mean
 *     that merely LOOKING at a page silently edits it and flips the dirty flag.
 *
 * project.ts reaches Tauri for setPreviewHtml and the svg cache, so `invoke` is
 * stubbed. The stub is installed before the dynamic import, because a static
 * import would be hoisted above mock.module and get the real module.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "fs";
import type { Data } from "@measured/puck";
import { DEFAULT_HERO, DEFAULT_META } from "../src/puck/PageRoot";
import { frontmatterYaml, exportText } from "../src/export/export";
import { renderExportContent, renderExportHero, renderExportHeader } from "../src/export/renderExport";
import { config } from "../src/puck/config";
import { humanDate } from "../src/export/export";

const invoked: { cmd: string; args: unknown }[] = [];

mock.module("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: unknown) => {
    invoked.push({ cmd, args });
    // read_svg is the only call buildPreview can make; hash_files/check_files
    // would mean a fix-up pass leaked in, which the mutation test also catches.
    if (cmd === "read_svg") return "<svg viewBox='0 0 1 1'></svg>";
    return undefined;
  },
}));

const { buildPreview, setPreviewHtml } = await import("../src/app/project");

const SITE = "https://haraldrevery.com";
const shell = readFileSync(new URL("../shell.html", import.meta.url).pathname, "utf8");

const meta = (over = {}) => ({
  ...DEFAULT_META,
  title: "Galdhøpiggen",
  date: "2025-08-17",
  tags: "photography, hiking",
  description: "A walk up the tallest thing in Norway.",
  ...over,
});

const mk = (content: any[] = [], root: any = {}): Data =>
  ({
    root: { props: { meta: meta(), hasHero: false, hero: DEFAULT_HERO, ...root } },
    content,
  }) as unknown as Data;

const text = (id: string, md: string) =>
  ({ type: "Text", props: { id, md, animate: false, spacing: "normal" } });

/// A Downloads block is the sharpest mutation probe: refreshDownloadHashes
/// rewrites sha256/sha512/size/missing in place on exactly these props.
const downloads = (id: string) => ({
  type: "Downloads",
  props: {
    id,
    spacing: "normal",
    items: [{ label: "Tool", src: "/downloads/tool.zip", sha256: "stale", sha512: "stale", size: 1 }],
  },
});

beforeEach(() => {
  invoked.length = 0;
});

describe("buildPreview", () => {
  test("emits the published document, with no front matter", async () => {
    const html = await buildPreview(mk([text("t1", "Hello **there**.")]), shell, SITE);

    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).not.toStartWith("---");
    // The front matter keys must not appear as page text anywhere.
    expect(html).not.toContain('title: "Galdhøpiggen"');
    expect(html).toContain("<h1");
    expect(html).toContain("Hello <strong>there</strong>.");
  });

  test("is exactly exportText minus the front matter", async () => {
    const data = mk([text("t1", "Body copy.")], { hasHero: false });
    const preview = await buildPreview(data, shell, SITE, "galdhopiggen");

    const exported = exportText({
      shell, data, config, siteUrl: SITE, slug: "galdhopiggen",
      heroHtml: renderExportHero(data),
      headerHtml: renderExportHeader(data, humanDate),
      contentHtml: renderExportContent(data),
    });

    expect(exported).toBe(frontmatterYaml(meta()) + "\n" + preview);
  });

  test("leaves no unresolved shell placeholders", async () => {
    // navReveal exercises NAV_EXTRA and NAV_SCRIPT, the two that are empty by
    // default and so are easiest to leave unsubstituted.
    const withHero = mk([text("t1", "Body.")], {
      hasHero: true,
      hero: { ...DEFAULT_HERO, title: "Galdhøpiggen", navReveal: true },
    });
    for (const data of [mk([text("t1", "Body.")]), withHero]) {
      const html = await buildPreview(data, shell, SITE);
      expect(html).not.toMatch(/\{\{\w+\}\}/);
    }
  });

  test("resolves the slug the same way export does", async () => {
    const derived = await buildPreview(mk(), shell, SITE);
    expect(derived).toContain(`${SITE}/notebook_pages/galdhøpiggen`);

    const overridden = await buildPreview(mk(), shell, SITE, "  custom-slug  ");
    expect(overridden).toContain(`${SITE}/notebook_pages/custom-slug`);
  });

  test("does not mutate the project data", async () => {
    const data = mk([text("t1", "Body."), downloads("d1")]);
    const before = structuredClone(data);

    await buildPreview(data, shell, SITE);
    await buildPreview(data, shell, SITE); // twice: a second pass must be a no-op too

    expect(data).toEqual(before);
    // No fix-up pass ran, so nothing was hashed or stat-ed.
    expect(invoked.map((i) => i.cmd)).not.toContain("hash_files");
    expect(invoked.map((i) => i.cmd)).not.toContain("check_files");
  });
});

describe("setPreviewHtml", () => {
  test("passes the document through, and clears with an empty string", async () => {
    await setPreviewHtml("<!DOCTYPE html><p>x</p>");
    await setPreviewHtml("");
    expect(invoked).toEqual([
      { cmd: "set_preview_html", args: { contents: "<!DOCTYPE html><p>x</p>" } },
      { cmd: "set_preview_html", args: { contents: "" } },
    ]);
  });
});
