/*
 * Editor layout and drag-and-drop checks, in real browsers.
 *
 *   node e2e/editor.e2e.mjs        every installed engine (Chromium, Firefox, WebKit)
 *   bun e2e/editor.e2e.mjs         Chromium only — Firefox never finishes launching under Bun
 *   ... --headed                   watch it
 *   ... --only drawer              run only scenarios whose name contains "drawer"
 *   ... --dist                     test the production build in dist/ (what the
 *                                  binary embeds) instead of Vite's dev server;
 *                                  run `bun run build` first
 *
 * Browsers are a one-time download, kept outside the repo:
 *   node node_modules/playwright-core/cli.js install chromium firefox
 *
 * WHY THIS EXISTS. The unit tests (tests/) run in happy-dom, which has no
 * layout: they cannot see how tall a panel is, what scrolls, or where a drop
 * lands. The editor's worst bugs lived exactly there — the whole app scrolling
 * with the canvas, blocks landing at the end of the page — and each earlier
 * "fix" was checked by reasoning about CSS rather than by measuring, and missed.
 * These scenarios measure. Run them after changing src/style.css, the layout
 * in App.tsx, SiteFrame.tsx, or after upgrading Puck or dnd-kit.
 *
 * What runs: the REAL editor bundle, served by Vite from src/, with the Tauri
 * backend replaced by e2e/tauri-mock.js and a small static server standing in
 * for server.rs. Chromium is the engine of the Windows build (WebView2); the
 * Linux build runs WebKitGTK, which Playwright's WebKit approximates.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import * as playwright from "playwright-core";

const APP = fileURLToPath(new URL("..", import.meta.url));
const REPO = resolve(APP, "..");
const HEADED = process.argv.includes("--headed");
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : "";
const DIST = process.argv.includes("--dist");
const UNDER_BUN = typeof globalThis.Bun !== "undefined";
const ENGINES = UNDER_BUN ? ["chromium"] : ["chromium", "firefox", "webkit"];

// ------------------------------------------------------------------ servers

const TYPES = {
  ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".woff2": "font/woff2",
  ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
};

/// The repo root over HTTP, as server.rs serves it to the editor frame: GET
/// only, jailed to the repo, with the CORS header fonts need.
function startRepoServer() {
  const server = createServer(async (req, res) => {
    const path = normalize(join(REPO, decodeURIComponent(new URL(req.url, "http://x").pathname)));
    if (req.method !== "GET" || (path !== REPO && !path.startsWith(REPO + sep))) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(path);
      res.writeHead(200, {
        "content-type": TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
        "access-control-allow-origin": "*",
      }).end(body);
    } catch {
      res.writeHead(404, { "access-control-allow-origin": "*" }).end();
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

/// dist/ as the binary serves it, plus the Tauri mock. editor.html is
/// dist/index.html with the mock loaded ahead of the bundle.
function startDistServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x").pathname;
    try {
      if (url === "/e2e/editor.html") {
        const html = await readFile(join(APP, "dist", "index.html"), "utf8");
        res.writeHead(200, { "content-type": "text/html" })
          .end(html.replace("<head>", '<head><script src="/e2e/tauri-mock.js"></script>'));
        return;
      }
      const path = url === "/e2e/tauri-mock.js" ? join(APP, "e2e", "tauri-mock.js") : normalize(join(APP, "dist", url));
      if (!path.startsWith(APP)) throw new Error("outside");
      const body = await readFile(path);
      res.writeHead(200, { "content-type": TYPES[extname(path).toLowerCase()] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function startVite() {
  const vite = await createViteServer({
    root: APP,
    configFile: join(APP, "vite.config.ts"),
    // Any free port, so this can run beside `bunx tauri dev` (5174).
    server: { port: 0, strictPort: false, host: "127.0.0.1" },
    logLevel: "error",
    clearScreen: false,
  });
  await vite.listen();
  return vite;
}

// ---------------------------------------------------------- in-page probes
// Passed to page.evaluate, so they must be self-contained.

/// Scroll state of everything that must NOT scroll, plus the frame's own.
function probeScroll() {
  const f = document.querySelector("#preview-frame");
  let app = document.scrollingElement.scrollTop;
  for (let el = f.parentElement; el; el = el.parentElement) app = Math.max(app, el.scrollTop, el.scrollLeft);
  const doc = f.contentDocument.scrollingElement;
  return {
    appScroll: app,
    toolbarTop: Math.round(document.querySelector(".pb-toolbar").getBoundingClientRect().top),
    frameH: Math.round(f.getBoundingClientRect().height),
    frameScroll: Math.round(doc.scrollTop),
    frameMax: Math.round(doc.scrollHeight - f.contentWindow.innerHeight),
  };
}

/// Every ancestor of the iframe that could scroll, with how far it could.
function probeLayout() {
  const f = document.querySelector("#preview-frame");
  const r = f.getBoundingClientRect();
  const scrollable = [];
  for (let el = f.parentElement; el; el = el.parentElement) {
    const cs = getComputedStyle(el);
    const could = /(auto|scroll|hidden)/.test(cs.overflowX + cs.overflowY);
    if (could && el.scrollHeight - el.clientHeight > 1) {
      scrollable.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${[...el.classList].join(".")} (${el.scrollHeight - el.clientHeight}px)`);
    }
  }
  const doc = document.scrollingElement;
  if (doc.scrollHeight - innerHeight > 1) scrollable.push(`document (${doc.scrollHeight - innerHeight}px)`);
  return {
    innerHeight,
    layoutH: Math.round(document.querySelector(".pb-layout").getBoundingClientRect().height),
    frameTop: Math.round(r.top),
    frameBottom: Math.round(r.bottom),
    frameH: Math.round(r.height),
    scrollable,
  };
}

/// What CSS the canvas actually renders with.
function probeFrameCss() {
  const d = document.querySelector("#preview-frame").contentDocument;
  const block = d.querySelector("article.mb-16, section.mb-16");
  const rules = [...d.styleSheets].flatMap((sh) => { try { return [...sh.cssRules].map((r) => r.cssText); } catch { return []; } });
  // The site scales its root font size, so compare in rem, not px.
  const rem = parseFloat(getComputedStyle(d.documentElement).fontSize);
  return {
    mbInRem: block ? parseFloat(getComputedStyle(block).marginBottom) / rem : null,
    appCssInFrame: rules.some((r) => r.includes(".pb-toolbar")),
  };
}

/// Root-level block ids, in page order.
function probeOrder() {
  const d = document.querySelector("#preview-frame").contentDocument;
  return [...d.querySelectorAll("[data-puck-component]")]
    .filter((e) => !e.parentElement.closest("[data-puck-component]"))
    .map((e) => e.getAttribute("data-puck-component"));
}

/// Where every block is, in APP coordinates, and the visible canvas box.
function probeBlocks() {
  const f = document.querySelector("#preview-frame");
  const fr = f.getBoundingClientRect();
  const pane = document.querySelector(".pb-layout__center").getBoundingClientRect();
  const blocks = {};
  for (const e of f.contentDocument.querySelectorAll("[data-puck-component], [data-puck-dropzone]")) {
    const r = e.getBoundingClientRect();
    const key = e.getAttribute("data-puck-component") ?? "zone:" + e.getAttribute("data-puck-dropzone");
    blocks[key] = { top: fr.top + r.top, bottom: fr.top + r.bottom, cx: fr.left + r.left + r.width / 2 };
  }
  return { blocks, canvas: { top: pane.top, bottom: Math.min(pane.bottom, innerHeight), cx: pane.left + pane.width / 2 } };
}

/// Which slot each block sits in ("root" for top level).
function probeZones() {
  const d = document.querySelector("#preview-frame").contentDocument;
  const out = {};
  for (const e of d.querySelectorAll("[data-puck-component]")) {
    const zone = e.parentElement.closest("[data-puck-dropzone]");
    const parent = e.parentElement.closest("[data-puck-component]");
    out[e.getAttribute("data-puck-component")] = parent ? zone?.getAttribute("data-puck-dropzone") ?? "?" : "root";
  }
  return out;
}

/// Drawer items (the block palette), label -> centre point.
function probeDrawer() {
  const out = {};
  for (const e of document.querySelectorAll("[data-puck-drawer-item]")) {
    const r = e.getBoundingClientRect();
    out[e.textContent.trim()] = { x: r.left + r.width / 2, y: r.top + r.height / 2, bottom: r.bottom };
  }
  return out;
}

function setFrameScroll(y) {
  document.querySelector("#preview-frame").contentDocument.scrollingElement.scrollTop = y;
}

// ------------------------------------------------------------------ harness

const results = [];
const pageErrors = [];
let current = "";

function check(name, ok, detail = "") {
  results.push({ scenario: current, name, ok, detail });
  console.log(`    ${ok ? "ok  " : "FAIL"}  ${name}${ok || !detail ? "" : `\n          ${detail}`}`);
}

async function openEditor(browser, base, { width = 1400, height = 900 } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  // The first load after a dependency change can be interrupted by Vite
  // re-optimising and reloading the page, so allow one retry.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(base);
      await page.getByRole("button", { name: "Restore", exact: true }).click({ timeout: 20000 });
      await page.waitForFunction(() => {
        const f = document.querySelector("#preview-frame");
        return f?.contentDocument?.querySelectorAll("[data-puck-component]").length > 20;
      }, null, { timeout: 20000 });
      break;
    } catch (e) {
      if (attempt >= 1) throw e;
    }
  }
  await page.waitForTimeout(600);
  return { page };
}

/// A pointer drag the way a person does it: press, pause past Puck's 200ms
/// activation delay, nudge, travel, then hover at the target while sampling.
/// Leaves the button DOWN — the caller decides when and where to release.
async function dragTo(page, from, to, { hover = 600, sample } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.move(from.x + 6, from.y + 3, { steps: 3 });
  for (let i = 1; i <= 25; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 25, from.y + ((to.y - from.y) * i) / 25);
    await page.waitForTimeout(16);
  }
  const samples = [];
  for (let t = 0; t < hover / 150; t++) {
    await page.mouse.move(to.x + (t % 2), to.y); // keep pointermove flowing
    await page.waitForTimeout(150);
    if (sample) samples.push(await sample());
  }
  return samples;
}

async function release(page) {
  await page.mouse.up();
  await page.waitForTimeout(800);
}

const added = (before, after) => after.filter((id) => !before.includes(id));

/// The block in the middle of the visible canvas, and a point in its upper
/// quarter — dropping there means "insert before this block".
async function midTarget(page) {
  const { blocks, canvas } = await page.evaluate(probeBlocks);
  const order = await page.evaluate(probeOrder);
  const midY = canvas.top + (canvas.bottom - canvas.top) * 0.45;
  const id = order.find((b) => blocks[b].top <= midY && blocks[b].bottom >= midY) ??
    order.find((b) => blocks[b].top >= midY);
  const b = blocks[id];
  return { id, index: order.indexOf(id), point: { x: canvas.cx, y: b.top + (b.bottom - b.top) * 0.25 } };
}

// ---------------------------------------------------------------- scenarios

const scenarios = {
  async "layout fits the window"(browser, base) {
    for (const [width, height] of [[1400, 900], [1000, 600]]) {
      const { page } = await openEditor(browser, base, { width, height });
      const l = await page.evaluate(probeLayout);
      check(`${width}x${height}: layout is exactly the window height`, Math.abs(l.layoutH - l.innerHeight) <= 1, `layout ${l.layoutH}px, window ${l.innerHeight}px`);
      check(`${width}x${height}: the canvas ends at the window edge`, l.frameBottom <= l.innerHeight + 1, `frame bottom ${l.frameBottom}px, window ${l.innerHeight}px`);
      check(`${width}x${height}: nothing around the canvas can scroll`, l.scrollable.length === 0, l.scrollable.join(", "));
      if (width === 1400) {
        const css = await page.evaluate(probeFrameCss);
        check("the canvas renders with the site's main.css (mb-16 = 4rem)", css.mbInRem !== null && Math.abs(css.mbInRem - 4) < 0.01, `mb-16 = ${css.mbInRem}rem`);
        check("the editor's own stylesheet does not leak into the canvas", !css.appCssInFrame);
      }
      // Selecting a block swaps the right panel's contents; the canvas must not
      // follow the panel's height.
      await page.evaluate(setFrameScroll, 600);
      await page.waitForTimeout(200);
      const { blocks, canvas } = await page.evaluate(probeBlocks);
      const order = await page.evaluate(probeOrder);
      const centre = (id) => (blocks[id].top + blocks[id].bottom) / 2;
      const vis = order.find((id) => id !== "Columns-A" && centre(id) > canvas.top + 20 && centre(id) < canvas.bottom - 20);
      await page.mouse.click(canvas.cx, centre(vis));
      await page.waitForTimeout(400);
      const l2 = await page.evaluate(probeLayout);
      check(`${width}x${height}: selecting a block does not resize the canvas`, l2.frameH === l.frameH && l2.scrollable.length === 0, `frame ${l.frameH}px -> ${l2.frameH}px; ${l2.scrollable.join(", ")}`);
      await page.close();
    }
  },

  async "wheel past the end scrolls only the canvas"(browser, base) {
    const { page } = await openEditor(browser, base);
    const { canvas } = await page.evaluate(probeBlocks);
    await page.mouse.move(canvas.cx, canvas.top + 300);
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(600);
    const s = await page.evaluate(probeScroll);
    check("the canvas reached its end", s.frameScroll >= s.frameMax - 2, `frame at ${s.frameScroll} of ${s.frameMax}`);
    check("the app did not scroll (panels and toolbar stay put)", s.appScroll === 0 && s.toolbarTop === 0, `app scrolled ${s.appScroll}px, toolbar at ${s.toolbarTop}px`);
    await page.close();
  },

  async "drawer to canvas: the block lands under the pointer"(browser, base) {
    const { page } = await openEditor(browser, base);
    await page.evaluate(setFrameScroll, 1200);
    await page.waitForTimeout(200);
    const target = await midTarget(page);
    const before = await page.evaluate(probeOrder);
    const drawer = await page.evaluate(probeDrawer);
    const item = drawer[Object.keys(drawer).find((k) => k.startsWith("Heading"))];
    const samples = await dragTo(page, item, target.point, { sample: () => page.evaluate(probeScroll) });
    await release(page);
    const after = await page.evaluate(probeOrder);
    const [id] = added(before, after);
    check("exactly one block was added", after.length === before.length + 1, `${before.length} -> ${after.length}`);
    check(`it landed before ${target.id}, where the pointer was`, after.indexOf(id) === target.index, `landed at ${after.indexOf(id)}, expected ${target.index}`);
    check("the app never scrolled during the drag", samples.every((s) => s.appScroll === 0 && s.toolbarTop === 0), JSON.stringify(samples.at(-1)));
    await page.close();
  },

  async "drag from the bottom of the drawer does not move the app"(browser, base) {
    // The lowest visible palette item sits in the window's bottom autoscroll
    // band. This is the drag that used to slide the whole app up under the
    // pointer and drop the block one or more slots off.
    const { page } = await openEditor(browser, base);
    await page.evaluate(setFrameScroll, 1200);
    await page.waitForTimeout(200);
    const target = await midTarget(page);
    const before = await page.evaluate(probeOrder);
    const drawer = await page.evaluate(probeDrawer);
    const vh = page.viewportSize().height;
    const [label, item] = Object.entries(drawer).filter(([, p]) => p.bottom < vh - 4).sort((a, b) => b[1].y - a[1].y)[0];
    const samples = await dragTo(page, item, target.point, { sample: () => page.evaluate(probeScroll) });
    await release(page);
    const after = await page.evaluate(probeOrder);
    const [id] = added(before, after);
    check(`dragged "${label}" from y=${Math.round(item.y)} of ${vh}`, true);
    check("the app never scrolled during the drag", samples.every((s) => s.appScroll === 0 && s.toolbarTop === 0), JSON.stringify(samples.find((s) => s.appScroll !== 0)));
    check(`it landed before ${target.id}, where the pointer was`, after.indexOf(id) === target.index, `landed at ${after.indexOf(id)}, expected ${target.index}`);
    await page.close();
  },

  async "holding at the canvas edge scrolls the canvas, not the app"(browser, base) {
    const { page } = await openEditor(browser, base);
    const { canvas } = await page.evaluate(probeBlocks);
    const before = await page.evaluate(probeOrder);
    const drawer = await page.evaluate(probeDrawer);
    const item = drawer[Object.keys(drawer).find((k) => k.startsWith("Heading"))];
    const start = await page.evaluate(probeScroll);
    const samples = await dragTo(page, item, { x: canvas.cx, y: canvas.bottom - 30 }, { hover: 1500, sample: () => page.evaluate(probeScroll) });
    const end = samples.at(-1);
    check("the canvas autoscrolled down", end.frameScroll - start.frameScroll > 150, `frame ${start.frameScroll} -> ${end.frameScroll}`);
    check("the app never scrolled", samples.every((s) => s.appScroll === 0 && s.toolbarTop === 0), JSON.stringify(samples.find((s) => s.appScroll !== 0)));
    // Park mid-canvas so the autoscroll stops, then drop.
    await page.mouse.move(canvas.cx, (canvas.top + canvas.bottom) / 2, { steps: 5 });
    await page.waitForTimeout(500);
    await release(page);
    const after = await page.evaluate(probeOrder);
    const [id] = added(before, after);
    const { blocks } = await page.evaluate(probeBlocks);
    const mid = (canvas.top + canvas.bottom) / 2;
    check("the block landed in the scrolled-to part of the page", !!id && Math.abs(blocks[id].top - mid) < (canvas.bottom - canvas.top) / 2 && after.indexOf(id) > 5, `landed at index ${after.indexOf(id)}`);
    await page.close();
  },

  async "moving a block within the canvas lands under the pointer"(browser, base) {
    const { page } = await openEditor(browser, base);
    await page.evaluate(setFrameScroll, 600);
    await page.waitForTimeout(200);
    const { blocks, canvas } = await page.evaluate(probeBlocks);
    const before = await page.evaluate(probeOrder);
    // Of the blocks whose top edge is on screen, move the first to just above
    // the one after next.
    const vis = before.filter((id) => id !== "Columns-A" && blocks[id].top > canvas.top && blocks[id].top + 20 < canvas.bottom);
    const [src, , dst] = vis;
    await dragTo(page, { x: canvas.cx, y: (blocks[src].top + blocks[src].bottom) / 2 }, { x: canvas.cx, y: blocks[dst].top + 10 });
    await release(page);
    const after = await page.evaluate(probeOrder);
    check(`${src} ended up directly before ${dst}`, after.indexOf(src) === after.indexOf(dst) - 1 && after.length === before.length, after.slice(0, 6).join(" "));
    await page.close();
  },

  async "column slots accept only embeddable blocks"(browser, base) {
    const { page } = await openEditor(browser, base);
    const drawer = await page.evaluate(probeDrawer);
    const pick = (prefix) => drawer[Object.keys(drawer).find((k) => k.startsWith(prefix))];
    const slot = async (name) => {
      const { blocks } = await page.evaluate(probeBlocks);
      const z = blocks[`zone:Columns-A:${name}`];
      return { x: z.cx, y: (z.top + z.bottom) / 2 };
    };
    let before = await page.evaluate(probeOrder);
    let zonesBefore = await page.evaluate(probeZones);
    await dragTo(page, pick("Text"), await slot("left"));
    await release(page);
    let zones = await page.evaluate(probeZones);
    const [text] = Object.keys(zones).filter((id) => !(id in zonesBefore));
    check("a Text block dropped into the left column lands inside it", zones[text] === "Columns-A:left", `new block ${text} is in ${zones[text]}`);
    zonesBefore = zones;
    before = await page.evaluate(probeOrder);
    await dragTo(page, pick("Featured"), await slot("right"));
    await release(page);
    zones = await page.evaluate(probeZones);
    const [featured] = Object.keys(zones).filter((id) => !(id in zonesBefore));
    check("a Featured block (not embeddable) never lands inside a column", !featured || zones[featured] === "root", `new block ${featured} is in ${zones[featured]}`);
    await page.close();
  },

  async "clicking an outline layer keeps the toolbar in place"(browser, base) {
    // Puck scrolls the chosen block into view with scrollIntoView, which walks
    // up through every scrollable ancestor — including the app's, if any.
    const { page } = await openEditor(browser, base);
    const layers = page.locator(".pb-layout__left").locator("li, [role=treeitem]").filter({ hasText: "Text (markdown" });
    const last = layers.last();
    await last.scrollIntoViewIfNeeded();
    const box = await last.boundingBox();
    await page.mouse.click(box.x + 40, box.y + Math.min(box.height / 2, 14));
    await page.waitForTimeout(1500);
    const s = await page.evaluate(probeScroll);
    check("the canvas scrolled to the chosen block", s.frameScroll > 500, `frame at ${s.frameScroll}`);
    check("the app did not scroll", s.appScroll === 0 && s.toolbarTop === 0, `app scrolled ${s.appScroll}px, toolbar at ${s.toolbarTop}px`);
    await page.close();
  },

  async "sidebar rows reorder by dragging their grip"(browser, base) {
    // The app's own dnd-kit use (Gallery / Icons / Downloads editors), separate
    // from Puck's: it has broken on dnd-kit API changes before Puck's has.
    const { page } = await openEditor(browser, base);
    const max = (await page.evaluate(probeScroll)).frameMax;
    await page.evaluate(setFrameScroll, max);
    await page.waitForTimeout(300);
    const svgs = await page.evaluate(() =>
      document.querySelector("#preview-frame").contentDocument.querySelectorAll('[data-puck-component="Icons-Z"] svg').length);
    check("a restored draft renders its svg icons (cache warmed)", svgs >= 3, `${svgs} <svg> in the Icons block`);
    const { blocks } = await page.evaluate(probeBlocks);
    const icons = blocks["Icons-Z"];
    await page.mouse.click(icons.cx, (icons.top + icons.bottom) / 2);
    const rows = page.locator(".pb-layout__right .pb-item");
    await rows.first().waitFor({ timeout: 5000 });
    await rows.last().scrollIntoViewIfNeeded();
    const labels = () => page.evaluate(() =>
      [...document.querySelectorAll(".pb-layout__right .pb-item")].map((r) => r.querySelector("input").value));
    check("the Icons editor shows rows A, B, C", (await labels()).join("") === "ABC", (await labels()).join(","));
    const grip = await rows.first().locator(".pb-item__grip").boundingBox();
    const lastRow = await rows.last().boundingBox();
    const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(from.x, from.y + (lastRow.y + lastRow.height - 6 - from.y) * (i / 20));
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(700); // dnd-kit's 250ms drop-settle, then the commit
    check("dragging A below C gives B, C, A", (await labels()).join("") === "BCA", (await labels()).join(","));
    await page.close();
  },

  async "keys pressed while a dialog is open never delete the selected block"(browser, base) {
    // Puck 0.21+ deletes the selected block on Delete/Backspace unless focus is
    // in a text field or a visible [role=dialog]/[aria-modal] exists. Our own
    // dialogs must count as dialogs, or a keypress on a dialog's button deletes
    // a block hidden behind it.
    const withDialog = async (label, open, close) => {
      const { page } = await openEditor(browser, base);
      await page.evaluate(setFrameScroll, 600);
      await page.waitForTimeout(200);
      const { blocks, canvas } = await page.evaluate(probeBlocks);
      const before = await page.evaluate(probeOrder);
      const centre = (id) => (blocks[id].top + blocks[id].bottom) / 2;
      const text = before.find((id) => id.startsWith("Text-") && centre(id) > canvas.top + 20 && centre(id) < canvas.bottom - 20);
      await page.mouse.click(canvas.cx, centre(text));
      await page.waitForTimeout(300);
      await open(page);
      for (const key of ["Backspace", "Delete"]) await page.keyboard.press(key);
      await close(page);
      await page.waitForTimeout(300);
      const after = await page.evaluate(probeOrder);
      check(label, after.includes(text) && after.length === before.length, `${text} was deleted behind it`);
      await page.close();
    };
    await withDialog(
      "a confirm dialog",
      async (page) => {
        await page.getByRole("button", { name: "New", exact: true }).click(); // restored work is unsaved
        await page.getByRole("button", { name: "Cancel", exact: true }).waitFor({ timeout: 3000 });
      },
      (page) => page.getByRole("button", { name: "Cancel", exact: true }).click(),
    );
    await withDialog(
      "the full-screen Preview",
      async (page) => {
        await page.getByRole("button", { name: "Preview", exact: true }).click();
        await page.locator(".pb-preview").waitFor({ timeout: 5000 });
        await page.locator(".pb-preview__bar").click({ position: { x: 5, y: 5 } });
      },
      (page) => page.getByRole("button", { name: /^Close/ }).click(),
    );
  },

  async "editing keys in a sidebar field never delete the block"(browser, base) {
    const { page } = await openEditor(browser, base);
    const { blocks, canvas } = await page.evaluate(probeBlocks);
    const before = await page.evaluate(probeOrder);
    const text = before.find((id) => id.startsWith("Text-") && blocks[id].top > canvas.top && blocks[id].bottom < canvas.bottom);
    await page.mouse.click(canvas.cx, (blocks[text].top + blocks[text].bottom) / 2);
    await page.waitForTimeout(400);
    // A structural change first, so there is something for a stray undo to undo.
    await page.getByRole("button", { name: "Split into columns" }).click();
    await page.waitForTimeout(400);
    const split = await page.evaluate(probeZones);
    // The split selects the new Columns block; select the moved Text again.
    const moved = (await page.evaluate(probeBlocks)).blocks[text];
    await page.mouse.click(moved.cx, (moved.top + moved.bottom) / 2);
    await page.waitForTimeout(400);
    const field = page.locator(".pb-layout__right textarea").first();
    await field.click();
    await page.keyboard.press("End");
    for (const key of ["Backspace", "Delete", "Backspace"]) await page.keyboard.press(key);
    await page.keyboard.type("xyz");
    await page.keyboard.press("Control+z"); // text undo, not "undo the split"
    await page.waitForTimeout(500);
    const zones = await page.evaluate(probeZones);
    check(`${text} is still on the page`, text in zones, "block deleted");
    check("Ctrl+Z in the field did not undo the split", split[text] !== "root" && zones[text] === split[text], `before ${split[text]}, after ${zones[text]}`);
    await page.close();
  },
};

// --------------------------------------------------------------------- main

const repoServer = await startRepoServer();
const app = DIST ? await startDistServer() : await startVite();
const appPort = DIST ? app.address().port : app.httpServer.address().port;
const base = `http://127.0.0.1:${appPort}/e2e/editor.html?repo=${repoServer.address().port}`;
console.log(DIST ? "Testing the production build in dist/" : "Testing src/ through Vite");
let ran = 0;

try {
  for (const engine of ENGINES) {
    let browser;
    try {
      browser = await playwright[engine].launch({ headless: !HEADED });
    } catch (e) {
      console.log(`\n${engine}: skipped — ${String(e.message).split("\n")[0]}`);
      continue;
    }
    ran++;
    console.log(`\n${engine} ${browser.version()}`);
    pageErrors.length = 0;
    for (const [name, run] of Object.entries(scenarios)) {
      if (!name.includes(ONLY)) continue;
      current = `${engine}: ${name}`;
      console.log(`  ${name}`);
      try {
        await run(browser, base);
      } catch (e) {
        check("scenario completed", false, String(e.message).split("\n").slice(0, 3).join(" | "));
      }
    }
    current = `${engine}: page errors`;
    console.log("  uncaught page errors");
    check("none", pageErrors.length === 0, [...new Set(pageErrors)].slice(0, 5).join(" | "));
    await browser.close();
  }
} finally {
  await (DIST ? new Promise((ok) => app.close(ok)) : app.close());
  repoServer.close();
}

const failed = results.filter((r) => !r.ok);
if (ran === 0) {
  console.log("\nNo browser engine could be launched. Install one with:\n  node node_modules/playwright-core/cli.js install chromium");
  process.exit(2);
}
if (UNDER_BUN) console.log("\n(Chromium only: run with node to include Firefox and WebKit.)");
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
for (const f of failed) console.log(`  FAIL  ${f.scenario} — ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
process.exit(failed.length ? 1 : 0);
