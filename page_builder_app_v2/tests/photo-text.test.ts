/*
 * Pre-filling caption fields from a photo's embedded title / description.
 *
 * textFill holds the rules the site's author decided (only empty fields, never
 * alt, no description that repeats the title beside it); updateBlock is how the
 * result is written. The XMP reading itself is tested in Rust
 * (src-tauri/src/embedded_text.rs).
 */
import { describe, expect, test } from "bun:test";
import type { PuckApi } from "@measured/puck";
import { FEATURED_TEXT, GALLERY_TEXT, IMAGE_TEXT, textFill } from "../src/puck/fields/photoText";
import { updateBlock } from "../src/puck/fields/updateBlock";

const photo = (title: string | null, description: string | null) => ({ title, description });

const item = (over = {}) => ({ full: "/photos/a.jpg", thumb: "", alt: "", title: "", description: "", ...over });

describe("textFill: what a picked photo writes into its block", () => {
  test("an empty gallery item gets the photo's title and description", () => {
    expect(textFill(photo("Styggebreen glacier", "Two people crossing it."), GALLERY_TEXT, item())).toEqual({
      title: "Styggebreen glacier",
      description: "Two people crossing it.",
    });
  });

  test("typed text is never replaced; whitespace-only counts as empty", () => {
    const typed = item({ title: "My own title", description: "   " });
    expect(textFill(photo("Photo title", "Photo description"), GALLERY_TEXT, typed)).toEqual({
      description: "Photo description",
    });
  });

  test("alt is never a target, even when it is empty", () => {
    const out = textFill(photo("T", "D"), GALLERY_TEXT, item());
    expect("alt" in out).toBe(false);
  });

  test("a description identical to the title is dropped where both are shown", () => {
    const same = photo("Harald Mark \"Revery\" Thirslund, 2016.", "Harald Mark \"Revery\" Thirslund, 2016.");
    expect(textFill(same, GALLERY_TEXT, item())).toEqual({ title: same.title! });
    expect(textFill(same, FEATURED_TEXT, { title: "", excerpt: "" })).toEqual({ title: same.title! });
  });

  test("the comparison is against the title the block keeps, typed or filled", () => {
    // Typed title equals the photo's description: still a repeat, so skipped.
    expect(textFill(photo("Photo title", "Kept"), GALLERY_TEXT, item({ title: "Kept" }))).toEqual({});
    // Typed title differs: the description is not a repeat, so it is filled.
    expect(textFill(photo("Same", "Same"), GALLERY_TEXT, item({ title: "Mine" }))).toEqual({ description: "Same" });
  });

  test("the Image caption takes the description even when it equals the title", () => {
    expect(textFill(photo("Same", "Same"), IMAGE_TEXT, { caption: "", alt: "" })).toEqual({ caption: "Same" });
    expect(textFill(photo("Only a title", null), IMAGE_TEXT, { caption: "" })).toEqual({});
  });

  test("Featured maps title to title and description to excerpt", () => {
    expect(textFill(photo("T", "D"), FEATURED_TEXT, { title: "", excerpt: "", tag: "" })).toEqual({
      title: "T",
      excerpt: "D",
    });
  });

  test("a photo with no embedded text changes nothing", () => {
    expect(textFill(null, GALLERY_TEXT, item())).toEqual({});
    expect(textFill(undefined, GALLERY_TEXT, item())).toEqual({});
    expect(textFill(photo(null, null), GALLERY_TEXT, item())).toEqual({});
  });
});

/// A stand-in for Puck's API with just what updateBlock touches. `blocks` maps
/// id -> [zone, index, props] and is read at CALL time, like the real store.
function fakePuck(blocks: Record<string, [string, number, Record<string, unknown>]>) {
  const dispatched: any[] = [];
  const api = {
    getItemById: (id: string) => (blocks[id] ? { type: "Image", props: { id, ...blocks[id][2] } } : undefined),
    getSelectorForId: (id: string) => (blocks[id] ? { zone: blocks[id][0], index: blocks[id][1] } : undefined),
    dispatch: (a: unknown) => dispatched.push(a),
  } as unknown as PuckApi;
  return { api, dispatched, blocks };
}

describe("updateBlock: writing a pick to the block that asked for it", () => {
  test("replaces the block in its own zone — inside a column too — as one undo step", () => {
    const { api, dispatched } = fakePuck({ img1: ["Columns-1:left", 2, { caption: "" }] });
    expect(updateBlock(api, "img1", (p) => ({ ...p, caption: "Filled" }))).toBe(true);
    expect(dispatched).toEqual([
      {
        recordHistory: true,
        type: "replace",
        destinationIndex: 2,
        destinationZone: "Columns-1:left",
        data: { type: "Image", props: { id: "img1", caption: "Filled" } },
      },
    ]);
  });

  test("builds on the block's props as they are now, not as they were", () => {
    const { api, dispatched, blocks } = fakePuck({ g: ["root:default-zone", 0, { items: ["a"] }] });
    // An edit lands while the dialog is open...
    blocks.g[2] = { items: ["a", "b"] };
    updateBlock(api, "g", (p) => ({ ...p, items: [...(p.items as string[]), "picked"] }));
    expect(dispatched[0].data.props.items).toEqual(["a", "b", "picked"]);
  });

  test("writes nothing when the block is gone or there is nothing to change", () => {
    const { api, dispatched } = fakePuck({ img1: ["root:default-zone", 0, {}] });
    expect(updateBlock(api, "deleted-during-the-dialog", (p) => p)).toBe(false);
    expect(updateBlock(api, "img1", () => null)).toBe(false);
    expect(dispatched).toEqual([]);
  });
});
