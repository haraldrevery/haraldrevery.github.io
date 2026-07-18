/*
 * SVG theming transforms against the repo's real files, plus modal promise
 * semantics (needs happy-dom).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { themeSvgText, prepareSvgForInline } from "../src/blocks/svgStore";

GlobalRegistrator.register();
const { listModal, promptModal } = await import("../src/ui/dom");

const REPO = new URL("../..", import.meta.url).pathname;

describe("svg theming", () => {
  test("Illustrator export with no fills gets currentColor on the root", () => {
    const logo = readFileSync(`${REPO}/svg/haraldreverylogo.svg`, "utf8");
    expect(themeSvgText(logo)).toMatch(/<svg fill="currentColor"/i);
  });
  test("QR: root fill recolored, viewport-fill untouched", () => {
    const qr = readFileSync(`${REPO}/svg/haraldreverycomqrcode.svg`, "utf8");
    const themed = themeSvgText(qr);
    expect(themed).toContain('fill="currentColor"');
    expect(themed).toContain('viewport-fill="rgb(255,255,255)"');
  });
  test("fill none / url() preserved; style fills recolored", () => {
    const t = themeSvgText(
      '<svg><path fill="#f00"/><circle fill="none"/><rect style="fill:#0f0;stroke:#000"/><path fill="url(#g)"/></svg>'
    );
    expect(t).toContain('fill="currentColor"');
    expect(t).toContain('fill="none"');
    expect(t).toContain('fill="url(#g)"');
    expect(t).toContain("fill:currentColor");
    expect(t).toContain("stroke:currentColor");
  });
  test("inline prep: prolog stripped, root fluid-sized, viewBox kept", () => {
    const s = prepareSvgForInline('<?xml version="1.0"?><svg width="10" height="5" viewBox="0 0 10 5"><path d="M0 0"/></svg>');
    expect(s).not.toContain("<?xml");
    expect(s).not.toContain('width="10"');
    expect(s).toContain("width:100%;height:auto");
    expect(s).toContain('viewBox="0 0 10 5"');
  });
});

describe("modals", () => {
  test("listModal resolves the clicked value (not null)", async () => {
    const p = listModal<string>("Pick", [
      { label: "A", value: "a" },
      { label: "B", value: "b" },
    ]);
    document.querySelectorAll<HTMLButtonElement>(".modal-list-item")[1].click();
    expect(await p).toBe("b");
    expect(document.querySelector(".modal-overlay")).toBeNull();
  });
  test("listModal cancel + escape resolve null", async () => {
    let p = listModal<string>("Pick", [{ label: "A", value: "a" }]);
    document.querySelector<HTMLButtonElement>(".modal-actions button")!.click();
    expect(await p).toBeNull();
    p = listModal<string>("Pick", [{ label: "A", value: "a" }]);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(await p).toBeNull();
  });
  test("promptModal OK/Enter resolve the value; cancel resolves null", async () => {
    let p = promptModal("Name", "my-page");
    [...document.querySelectorAll("button")].find((b) => b.textContent === "OK")!.click();
    expect(await p).toBe("my-page");

    p = promptModal("Name", "enter-name");
    document
      .querySelector<HTMLInputElement>(".modal-box input")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(await p).toBe("enter-name");

    p = promptModal("Name", "x");
    [...document.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!.click();
    expect(await p).toBeNull();
  });
});
