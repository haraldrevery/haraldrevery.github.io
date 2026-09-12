/*
 * updateBlock against a REAL Puck store, not a stand-in.
 *
 * photo-text.test.ts checks the action updateBlock builds; this checks that
 * Puck accepts it where it matters: a block nested in a slot (an Image inside
 * Columns — the case SwapColumns' top-level map could not reach), one write
 * being exactly one undo step, and the change reaching onChange, which is what
 * sets the app's unsaved-changes flag.
 *
 * Puck needs a DOM to mount, so happy-dom is registered for this file only and
 * removed afterwards. The imports are dynamic because static ones would be
 * hoisted above the registration.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, describe, expect, test } from "bun:test";

GlobalRegistrator.register();
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterAll(() => GlobalRegistrator.unregister());

const { act, createElement: h } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Puck, useGetPuck } = await import("@measured/puck");
const { updateBlock } = await import("../src/puck/fields/updateBlock");

const config: any = {
  components: {
    Cols: {
      fields: { left: { type: "slot" } },
      defaultProps: { left: [] },
      render: ({ left: Left }: any) => h(Left),
    },
    Pic: {
      fields: { caption: { type: "text" }, alt: { type: "text" } },
      defaultProps: { caption: "", alt: "" },
      render: ({ caption }: any) => h("p", null, caption),
    },
  },
};

const data: any = {
  root: { props: {} },
  content: [
    {
      type: "Cols",
      props: { id: "cols", left: [{ type: "Pic", props: { id: "pic", caption: "", alt: "typed alt" } }] },
    },
  ],
};

async function mount() {
  let getPuck: any;
  const changes: unknown[] = [];
  function Probe() {
    getPuck = useGetPuck();
    return null;
  }
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      h(Puck as any, { config, data, iframe: { enabled: false }, onChange: (d: unknown) => changes.push(d) }, h(Probe)),
    );
  });
  return { puck: () => getPuck(), changes, unmount: () => act(async () => root.unmount()) };
}

describe("updateBlock in a real Puck store", () => {
  test("writes a block nested in a slot, as one undo step, and reports the change", async () => {
    const app = await mount();
    expect(app.puck().getSelectorForId("pic")).toEqual({ zone: "cols:left", index: 0 });
    const before = app.changes.length;

    let wrote = false;
    await act(async () => {
      wrote = updateBlock(app.puck(), "pic", (p) => ({ ...p, caption: "Filled from the photo" }));
    });
    expect(wrote).toBe(true);

    const pic = app.puck().getItemById("pic");
    expect(pic.props.caption).toBe("Filled from the photo");
    expect(pic.props.alt).toBe("typed alt"); // sibling props untouched
    expect(app.puck().getSelectorForId("pic")).toEqual({ zone: "cols:left", index: 0 }); // not moved
    expect(app.changes.length).toBeGreaterThan(before); // -> the dirty flag

    // Puck records history through a 300ms debounce (createHistorySlice), so
    // the undo entry does not exist until that has elapsed.
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(app.puck().history.hasPast).toBe(true);
    await act(async () => app.puck().history.back());
    expect(app.puck().getItemById("pic").props.caption).toBe(""); // ONE undo reverts it

    await app.unmount();
  });
});
