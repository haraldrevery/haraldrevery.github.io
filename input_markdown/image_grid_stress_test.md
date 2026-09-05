---
title: Image grid stress test
date: 2026-09-05
tags: [test, template]
image: /photos/2025galdhoepiggen/2025jotunheimen_view_from_galdhopiggen1.jpg
description: Every branch of the automatic justified image grid, including the cases that must NOT become a grid.
draft: true
---

# Image grid stress test

A run of **two or more adjacent images** in a markdown post is collapsed into a
justified grid by the `rvry_image_grid` rule in `eleventy.config.js`. Nothing in
the markdown marks it up — adjacency is the whole trigger.

Every section below states what it *should* render as. If a section renders the
other thing, the rule is broken.

---

## 1. Two images on adjacent lines → grid

The minimum case: two images, no blank line between them.

![Jotunheimen seen from Galdhøpiggen](/photos/2025galdhoepiggen/2025jotunheimen_view_from_galdhopiggen1.jpg)
![Jotunheimen again, from a little further along](/photos/2025galdhoepiggen/2025jotunheimen_view_from_galdhopiggen2.jpg)

---

## 2. Two images separated by a blank line → same grid

Separate paragraphs in the token stream, but still one grid: the rule walks
forward over consecutive image-only paragraphs.

![Ringedalsvatnet, wide](/photos/2025/2025ringedalsvatnet1.jpg)

![Ringedalsvatnet, wider](/photos/2025/2025ringedalsvatnet2.jpg)

---

## 3. Two images on the SAME line → grid

Adjacency includes two images side by side in one paragraph, separated only by
a space.

![Ålesund](/photos/2025/2025alesund.jpg) ![Ålesund from Mount Aksla](/photos/2025/2025alesund_mount_aksla_view.jpg)

---

## 4. Mixed adjacency across a run → one grid

Two on one line, then a blank line, then two more. All four belong to the same
grid and the same lightbox gallery.

![Styggebreen glacier](/photos/2025galdhoepiggen/2025styggebreen_glacier_1.jpg)
![Styggebreen glacier, closer](/photos/2025galdhoepiggen/2025styggebreen_glacier_2.jpg)

![Styggebreen glacier, from the ice](/photos/2025galdhoepiggen/2025styggebreen_glacier_4.jpg)
![Styggebreen glacier, last light](/photos/2025galdhoepiggen/2025styggebreen_glacier_6.jpg)

---

## 5. Extreme ratio spread → the real justification test

Six images from 1:2 portrait to 4.5:1 ultrawide. Every row must come out flush
on both edges and dead level, and **nothing may be cropped**. Drag the reading
width down with the `><` button in the lower-right corner — the rows must
repack at every step, all the way to the narrowest.

![Portrait, 1:2](/photos/2015-2023/haraldt2019june23.jpg)
![Square, 1:1](/photos/2015-2023/1x1skog.jpg)
![Landscape, 16:10](/photos/2024/2024above_the_clouds.jpg)
![Cinemascope, 2.39:1](/photos/2024/2024matterhorn.jpg)
![Ultrawide, 3:1](/photos/2025/2025sun_shining_on_land.jpg)
![Very ultrawide, 4.5:1](/photos/2025galdhoepiggen/2025on_the_galdhopiggvegen1.jpg)

---

## 6. Odd count → lone last item must not balloon

Five images: the last row holds one image, which is capped by
`--rvry-grid-max` instead of stretching to the full column width.

![Cortina, first](/photos/2024/2024cortina1.jpg)
![Cortina, second](/photos/2024/2024cortina2.jpg)
![Cortina, third](/photos/2024/2024cortina3.jpg)
![Cortina mountains](/photos/2024/2024cortina_mountains.jpg)
![Cortina in the rain at night](/photos/2024/cortina_rain_night.jpg)

---

## 7. Captions

The first image has a markdown title, the second only alt text. The lightbox
caption uses the title when there is one and falls back to the alt text
otherwise. Click either to check.

![Alt text only, no title](/photos/2025/2025stegastein_view.jpg)
![Alt text that should be overridden](/photos/2025/2025frykstabacken_kil.jpg "Frykstabacken, Kil — this title is the caption")

---

## 8. Images with no `_min` thumbnail → full-size file in the `<img>`

Neither of these has a `_min` sibling on disk, so `src` and `href` are the same
file. The grid must still justify correctly.

![No thumbnail, portrait](/photos/2015-2023/20140724_201926.jpg)
![No thumbnail, landscape](/photos/2015-2023/2022aug24view.jpg)
![No thumbnail, wide](/photos/1996-2015/harald_running_in_sand_denmark.jpg)

---

## 9. Unreadable intrinsic size → 3/2 fallback

SVG has no pixel header to read, so both of these fall back to an assumed 3/2
ratio. They will not match their true shape — that is the documented
degradation, not a bug.

![Compass](/svg/compass.svg)
![Mountain topology](/svg/mountain_dotted_transparent.svg)

---

## 10. A remote image in a run → also 3/2

No local file to measure at build time.

![Remote placeholder](https://haraldrevery.com/opengraphimg.jpg)
![Local, measurable](/photos/2025/2025alstern.jpg)

---

## 10b. Non-ASCII filename → must still measure and thumbnail

markdown-it percent-encodes the `ø` in the href, so the build has to decode it
again before looking at the disk. If this pair renders at 3/2 instead of its
real 1.91, or serves the full-size file instead of the `_min` one, the decode
has regressed.

![Snøhetta viewpoint in the sun](/photos/2025/2025viewpoint_snøhetta_sun.jpg)
![Nightfall at the Snøhetta parking](/photos/2025/2025nightfall_at_viewpoint_snohetta_parking.jpg)

---

## 11. Attributes survive the rewrite

`markdown-it-attrs` puts a class on the image; the grid renderer must carry it
onto the `<img>` rather than dropping it.

![With a class](/photos/2025/2025sunne_1.jpg){.rvry-test-class}
![Without one](/photos/2025/2025sunne_2.jpg)

---

# Cases that must NOT become a grid

## 12. A single image → stays a full-width figure

One image is one image. No grid, no lightbox anchor.

![A lone image, full width](/photos/2025/2025hrld_trolltunga_1.jpg)

---

## 13. Text between two images → two separate figures

The run is broken by a paragraph that is not images-only, so neither image
grids.

![First, on its own](/photos/2024/2024white_alps.jpg)

A sentence in between.

![Second, also on its own](/photos/2024/2024milano.jpg)

---

## 14. An image with words in the same paragraph → no grid

The paragraph holds a word as well as images, so it is prose containing
pictures, not a gallery.

Here is one ![inline image](/photos/2024/gorizia_sunset.jpg)
and here is another ![second inline image](/photos/2024/2024march13bled.jpg)

---

## 15. Images inside a list → no grid

A flex grid has no business inside an `<li>`. The `level !== 0` guard should
skip these entirely.

- First item:
  ![In a list item](/photos/2024/2024tarvisio_view.jpg)
  ![Also in a list item](/photos/2024/2024mountain_top.jpg)
- Second item, no image.

---

## 16. Images inside a blockquote → no grid

Same guard, different container.

> Two images inside a quote:
>
> ![In a blockquote](/photos/2024/2024the_circle.jpg)
> ![Also in a blockquote](/photos/2024/2024down_to_the_clouds.jpg)

---

## 17. Images inside a table cell → no grid

| Column | Images |
|:-------|:-------|
| Two    | ![In a cell](/photos/2024/2024matterhorn_side_view.jpg) ![Also in a cell](/photos/2024/2024steep_journey.jpg) |

---

## 18. Linked images → no grid

`[![alt](img)](url)` wraps the image in a link, so the paragraph is not
images-only. These stay as two linked images, and the author's own link wins
over the lightbox.

[![Linked image one](/photos/2025/2025viewpoint_snøhetta_sun.jpg)](https://haraldrevery.com)
[![Linked image two](/photos/2025/2025sunset_at_lindesnes_lighthouse_1.jpg)](https://haraldrevery.com)

---

## 19. Raw HTML images → no grid

The rule only sees markdown-syntax images. Raw `<img>` tags pass through
untouched, which is the escape hatch if a run should stay stacked.

<img src="/photos/2025/2025trolltunga.jpg" alt="Raw HTML image, portrait">
<img src="/photos/2025/2025djupvatnet_dalsnibba_lake_1.jpg" alt="Raw HTML image, wide">

---

## 20. Two grids in one page → separate lightbox galleries

The two grids below must carry different `data-gallery` values, so paging
through the first never walks into the second.

![Grid A, first](/photos/2015-2023/2016just_mountains.jpg)
![Grid A, second](/photos/2015-2023/2016mountains_and_clouds.jpg)

A paragraph to break the run.

![Grid B, first](/photos/2015-2023/2016birdview.jpg)
![Grid B, second](/photos/2015-2023/2016somemountains.jpg)
