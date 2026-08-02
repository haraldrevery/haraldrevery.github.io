/*
 * The thumbnail-adoption rules. Pure, so they can be exercised without Tauri.
 *
 * The `_min` convention drives real behaviour here: linking a photo before its
 * thumbnail exists is the intended workflow, so a `_min` file that appears
 * later must be picked up on the next open.
 */
import { describe, expect, test } from "bun:test";
import { resolveThumb } from "../src/export/fixups";

const none = () => false;
const all = () => true;
const only = (...paths: string[]) => (p: string) => paths.includes(p);

describe("resolveThumb", () => {
  test("adopts a _min that has appeared since the photo was linked", () => {
    const it = { full: "/photos/a.jpg", thumb: "/photos/a.jpg" };
    expect(resolveThumb(it, only("/photos/a_min.jpg"))).toEqual({
      thumb: "/photos/a_min.jpg",
      thumbMissing: false,
    });
  });

  test("flags a still-absent _min but keeps the full-size fallback", () => {
    const it = { full: "/photos/a.jpg", thumb: "/photos/a.jpg" };
    expect(resolveThumb(it, none)).toEqual({
      thumb: "/photos/a.jpg",
      thumbMissing: true,
    });
  });

  test("an empty thumb falls back to the full-size image", () => {
    const it = { full: "/photos/a.jpg", thumb: "" };
    expect(resolveThumb(it, none).thumb).toBe("/photos/a.jpg");
  });

  test("keeps an existing thumb and confirms it is still on disk", () => {
    const it = { full: "/photos/a.jpg", thumb: "/photos/a_min.jpg" };
    expect(resolveThumb(it, all)).toEqual({
      thumb: "/photos/a_min.jpg",
      thumbMissing: false,
    });
  });

  test("flags a stored thumb that has since been deleted", () => {
    const it = { full: "/photos/a.jpg", thumb: "/photos/a_min.jpg" };
    expect(resolveThumb(it, none).thumbMissing).toBe(true);
  });

  test("a file already named _min is its own thumbnail", () => {
    // deriveMinPath is idempotent, so expected === full and there is nothing
    // to adopt — it must not go looking for a_min_min.jpg.
    const it = { full: "/photos/a_min.jpg", thumb: "/photos/a_min.jpg" };
    expect(resolveThumb(it, only("/photos/a_min.jpg"))).toEqual({
      thumb: "/photos/a_min.jpg",
      thumbMissing: false,
    });
  });
});
