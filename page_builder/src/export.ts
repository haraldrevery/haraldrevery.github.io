/*
 * Export pipeline — port of the pure helpers in
 * old_page_builder/notebook_builder.py. An exported page is:
 * YAML front matter + shell.html with every {{PLACEHOLDER}} filled.
 * Eleventy's before-hook then strips the front matter and copies the body
 * verbatim to notebook_pages/; the front matter drives the Notebook index.
 */
import { renderContent } from "./blocks/render";
import type { Block } from "./blocks/model";

export interface Meta {
  title: string;
  date: string;
  tags: string;
  description: string;
  image: string;
  draft: boolean;
}

export function slugify(text: string): string {
  let s = (text || "untitled").toLowerCase();
  s = s.replace(/[^\p{L}\p{N}_\s-]/gu, "");
  s = s.replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
  s = s.replace(/-+/g, "-");
  return s || "untitled";
}

export function humanDate(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateStr || "").trim());
  if (!m) return dateStr || "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function splitTags(tags: string): string[] {
  return tags.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
}

// gray-matter needs values containing ':' quoted (the old builder broke here)
function yamlValue(v: string): string {
  if (/[:#\[\]{}"']/g.test(v)) {
    return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return v;
}

export function frontmatterYaml(meta: Meta): string {
  const lines = ["---"];
  lines.push(`title: ${yamlValue(meta.title || "")}`);
  lines.push(`date: ${meta.date || ""}`);
  lines.push(`tags: [${splitTags(meta.tags).join(", ")}]`);
  if (meta.image) lines.push(`image: ${meta.image}`);
  if (meta.description) lines.push(`description: ${yamlValue(meta.description)}`);
  if (meta.draft) lines.push("draft: true");
  lines.push("---");
  return lines.join("\n");
}

export function jsonld(meta: Meta, canonical: string, siteUrl: string): string {
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: meta.title || "",
    description: meta.description || "",
    datePublished: meta.date || "",
    author: { "@type": "Person", name: "Harald Revery", url: `${siteUrl}/about` },
    publisher: { "@type": "Person", name: "Harald Revery" },
    mainEntityOfPage: canonical,
  };
  if (meta.image) obj.image = siteUrl + meta.image;
  return (
    '<script type="application/ld+json">\n' + JSON.stringify(obj, null, 2) + "\n</script>"
  );
}

export function assembleDocument(
  shell: string,
  meta: Meta,
  blocks: Block[],
  siteUrl: string,
  slug?: string
): string {
  const s = slug || slugify(meta.title);
  const canonical = `${siteUrl}/notebook_pages/${s}`;
  const title = (meta.title || "").trim();
  const repl: Record<string, string> = {
    "{{TITLE}}": title ? `Harald Revery - ${title}` : "Harald Revery",
    "{{DESCRIPTION}}": meta.description || "",
    "{{KEYWORDS}}": meta.tags || "",
    // og/twitter title order matches base.njk ("title - Harald Revery")
    "{{OG_TITLE}}": title ? `${title} - Harald Revery` : "Harald Revery",
    "{{OG_DESC}}": meta.description || "",
    "{{OG_IMAGE}}": meta.image ? siteUrl + meta.image : `${siteUrl}/opengraphimg.jpg`,
    "{{OG_URL}}": canonical,
    "{{CANONICAL}}": canonical,
    "{{DATE_ISO}}": meta.date || "",
    "{{DATE_HUMAN}}": humanDate(meta.date),
    "{{JSONLD}}": jsonld(meta, canonical, siteUrl),
    "{{CONTENT}}": renderContent(blocks, { editMode: false }),
  };
  let doc = shell;
  for (const [k, v] of Object.entries(repl)) {
    doc = doc.split(k).join(v);
  }
  return doc;
}

export function exportText(
  shell: string,
  meta: Meta,
  blocks: Block[],
  siteUrl: string,
  slug?: string
): string {
  return frontmatterYaml(meta) + "\n" + assembleDocument(shell, meta, blocks, siteUrl, slug);
}
