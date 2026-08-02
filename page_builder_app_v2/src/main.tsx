import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Puck's own editor chrome. The SITE's main.css/prose.css are deliberately NOT
// imported here — they are injected into the preview iframe only (see the
// SiteFrame override). Tailwind's preflight is global and would wreck this UI.
import "@measured/puck/puck.css";
import "./style.css";

const el = document.getElementById("app");
if (!el) throw new Error("#app missing from index.html");

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
