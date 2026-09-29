/*
 * A stand-in for the Tauri backend, so the real editor bundle can run in an
 * ordinary browser under e2e/editor.e2e.mjs. EDITOR TESTS ONLY — never loaded
 * by index.html, so it is not part of any build.
 *
 * It answers only what booting the editor needs. The page to edit arrives
 * through the crash-recovery path (read_recovery), which the runner accepts by
 * clicking "Restore": that exercises a real load without a project file.
 *
 * Query string:
 *   repo=<port>   the runner's static server over the repo root (server.rs's job)
 */
(function () {
  const q = new URLSearchParams(location.search);
  const repo = "http://127.0.0.1:" + q.get("repo");
  let nextCallback = 0;

  const text = (i) =>
    "**Block " + i + ".** Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
    "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad " +
    "minim veniam, quis nostrud exercitation ullamco laboris.";

  /// An empty two-column block first (the slot-rule scenarios drop into it),
  /// then 30 alternating Text/Heading blocks — long enough that the canvas has
  /// to scroll, with a fixed block order the runner can reason about — and an
  /// Icons block last, whose three sidebar rows (A, B, C) the reorder scenario
  /// drags.
  function page() {
    const content = [{
      type: "Columns",
      props: { id: "Columns-A", count: 2, verticalAlign: "top", left: [], right: [], spacing: "normal" },
    }];
    for (let i = 0; i < 30; i++) {
      content.push(i % 3 === 1
        ? { type: "Heading", props: { id: "Heading-" + i, text: "Heading number " + i, level: 2, align: "left", animate: false, spacing: "normal" } }
        : { type: "Text", props: { id: "Text-" + i, md: text(i), animate: false, spacing: "normal" } });
    }
    content.push({
      type: "Icons",
      props: {
        id: "Icons-Z", size: "medium", label: "", spacing: "normal",
        items: [
          { src: "/svg/compass.svg", label: "A", href: "" },
          { src: "/svg/haraldreverylogo.svg", label: "B", href: "" },
          { src: "/svg/mountain_dotted_transparent.svg", label: "C", href: "" },
        ],
      },
    });
    return {
      root: { props: { meta: { title: "Editor e2e", date: "2026-09-29", tags: "", description: "", image: "", draft: false, schemaType: "auto" }, hasHero: false } },
      content,
    };
  }

  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
    transformCallback: () => ++nextCallback,
    unregisterCallback: () => {},
    convertFileSrc: (p) => p,
    async invoke(cmd, args) {
      switch (cmd) {
        case "get_config":
          return { repoRoot: "/repo", previewPort: +q.get("repo"), siteUrl: "https://haraldrevery.com" };
        case "read_shell":
          return (await fetch(repo + "/page_builder_app_v2/shell.html")).text();
        case "read_recovery":
          return {
            contents: JSON.stringify({ name: "e2e", file: { version: 2, data: page() } }),
            modified: Math.floor(Date.now() / 1000) - 60,
          };
        case "read_svg":
          return (await fetch(repo + args.path)).text();
        case "list_projects":
          return [];
        case "check_files":
          return ((args && args.paths) || []).map(() => true);
        default:
          return null; // window title, close guard, recovery writes: all no-ops here
      }
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
})();
