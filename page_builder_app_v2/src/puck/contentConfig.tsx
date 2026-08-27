/*
 * The config used to render CONTENT ONLY — same components, but the root render
 * is a passthrough instead of PageRoot.
 *
 * The editor needs PageRoot so the preview shows blocks inside the site's
 * bg-topology-map / page-container chrome. The export must NOT include it:
 * shell.html already contains that chrome, and {{HERO}} and {{CONTENT}} are
 * separate placeholders inside it. Rendering PageRoot on export would nest a
 * second copy of the wrapper inside the first.
 *
 * IMPORTANT: this spreads the real config, keeping every component's `fields`
 * intact. Puck needs field definitions at render time to convert slot data into
 * nested components — a "lean" export config with fields stripped silently
 * drops the contents of every Columns slot.
 */
import type { ReactNode } from "react";
import { config } from "./config";

export const contentConfig: typeof config = {
  ...config,
  root: {
    ...config.root,
    render: ({ children }: { children?: ReactNode }) => <>{children}</>,
  },
};
