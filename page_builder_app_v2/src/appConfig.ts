/*
 * Backend config, fetched once at boot (Tauri `get_config`, commands.rs:87).
 * `previewPort` is the ephemeral port the repo-serving tiny_http server bound
 * to; everything the preview iframe loads (/main.css, /photos/**, /fonts/**)
 * resolves against it via a <base href> — see puck/SiteFrame.tsx.
 */
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export interface AppConfig {
  repoRoot: string | null;
  previewPort: number;
  siteUrl: string;
}

export function useAppConfig(): AppConfig | null {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  useEffect(() => {
    let live = true;
    invoke<AppConfig>("get_config")
      .then((c) => live && setCfg(c))
      .catch(() => live && setCfg({ repoRoot: null, previewPort: 0, siteUrl: "" }));
    return () => {
      live = false;
    };
  }, []);
  return cfg;
}

export const previewOrigin = (port: number) => `http://127.0.0.1:${port}`;
