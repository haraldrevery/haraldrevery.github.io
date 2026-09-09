/*
 * Print ready-to-paste image markup for a hand-written post.
 *
 *   node input_custom_post/imgblock.mjs photos/a.jpg               -> one figure
 *   node input_custom_post/imgblock.mjs photos/a.jpg photos/b.jpg  -> a justified gallery
 *
 * Optional: --gallery=<name> sets data-gallery (default "gallery").
 *
 * Why this exists: the justified grid needs each picture's TRUE pixel ratio in
 * three places (aspect-ratio, flex-grow, flex-basis/max-width), and <img> needs
 * width/height or the page reflows as the file arrives. Those are the numbers
 * that are tedious to look up and silently wrong when guessed - a wrong ratio
 * misjustifies the whole row. Everything else in a post is easier to type than
 * to generate, so this does only this.
 *
 * Reads the pixel size out of the file's own header bytes: no npm packages, and
 * nothing to install. Same approach, and the same four formats, as readImageSize
 * in eleventy.config.js.
 *
 * The "_min" convention: <a href> is the full-size file, <img src> the _min
 * thumbnail when one exists beside it. The RATIO is always read from the
 * full-size file - if a _min were ever cropped rather than scaled, taking it
 * from there would misjustify the row.
 */
import fs from "fs";
import path from "path";

const size = (buf) => {
  if (buf.length >= 24 && buf.toString("ascii", 1, 4) === "PNG")
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "GIF")
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const f = buf.toString("ascii", 12, 16);
    if (f === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (f === "VP8L") { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
    if (f === "VP8X") return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
};

const measure = (rel) => {
  const fd = fs.openSync(rel, "r");
  try {
    const buf = Buffer.alloc(65536);
    const read = fs.readSync(fd, buf, 0, 65536, 0);
    return size(buf.subarray(0, read));
  } finally { fs.closeSync(fd); }
};

const args = process.argv.slice(2);
let group = "gallery";
const files = [];
for (const a of args) {
  if (a.startsWith("--gallery=")) group = a.slice("--gallery=".length);
  else files.push(a);
}
if (!files.length) {
  console.error("usage: node input_custom_post/imgblock.mjs [--gallery=name] <image> [image ...]");
  process.exit(2);
}

const items = [];
for (const f of files) {
  const rel = f.replace(/^\/+/, "");
  if (!fs.existsSync(rel)) { console.error(`not found: ${rel}`); process.exit(1); }
  const dim = measure(rel);
  if (!dim) { console.error(`could not read the pixel size of ${rel} (SVG? unsupported format?)`); process.exit(1); }
  const ext = path.extname(rel);
  const min = rel.slice(0, -ext.length) + "_min" + ext;
  const hasMin = fs.existsSync(min);
  const shown = hasMin ? min : rel;
  const shownDim = hasMin ? measure(min) : dim;
  if (!hasMin) console.error(`note: no ${min} - using the full-size file in the <img>`);
  items.push({ full: "/" + rel, thumb: "/" + shown, w: dim.w, h: dim.h,
               sw: shownDim ? shownDim.w : dim.w, sh: shownDim ? shownDim.h : dim.h });
}

const round = (n, p) => Math.round(n * p) / p;

if (items.length === 1) {
  const it = items[0];
  console.log(`  <section class="mb-16">
    <figure>
      <a href="${it.full}" class="glightbox block" data-gallery="single"
         data-glightbox="title: CAPTION; description: ">
        <img src="${it.thumb}" alt="DESCRIBE THIS PICTURE"
             width="${it.sw}" height="${it.sh}"
             class="w-full rounded-lg" loading="lazy" decoding="async">
      </a>
      <figcaption>CAPTION</figcaption>
    </figure>
  </section>`);
} else {
  const rows = items.map((it) => {
    const ratio = round(it.w / it.h, 10000);
    const grow = round(ratio * 100, 100);
    return `      <a href="${it.full}"
         class="portfolio-item glightbox block" data-gallery="${group}"
         data-glightbox="title: CAPTION; description: "
         style="aspect-ratio:${it.w}/${it.h};flex-grow:${grow};flex-basis:calc(${ratio} * 240px);max-width:calc(${ratio} * 640px);--delay:0.1s">
        <div class="overlay"></div>
        <img src="${it.thumb}" alt="DESCRIBE THIS PICTURE"
             class="w-full h-full object-cover" loading="lazy">
      </a>`;
  });
  console.log(`  <section class="mb-16">
    <div class="flex flex-wrap gap-2">
${rows.join("\n\n")}
    </div>
  </section>`);
}
