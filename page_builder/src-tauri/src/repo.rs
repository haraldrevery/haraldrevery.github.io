use std::fs;
use std::path::{Path, PathBuf};

/// A directory counts as the site repo only if both markers are present,
/// so an unrelated Eleventy project is never picked up by accident.
fn is_repo_root(p: &Path) -> bool {
    p.join("eleventy.config.js").is_file() && p.join("html_extras").is_dir()
}

fn config_file() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join("page_builder").join("config.json"))
}

pub fn persist_repo_root(root: &Path) {
    if let Some(cf) = config_file() {
        if let Some(parent) = cf.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&cf, serde_json::json!({ "repoRoot": root }).to_string());
    }
}

fn persisted_repo_root() -> Option<PathBuf> {
    let text = fs::read_to_string(config_file()?).ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    let p = PathBuf::from(v.get("repoRoot")?.as_str()?);
    is_repo_root(&p).then_some(p)
}

/// Locate the site repo: works when the release binary sits at the repo root,
/// when `tauri dev` runs from page_builder/src-tauri, and (via the persisted
/// config) when the binary is launched from anywhere else.
pub fn find_repo_root() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.to_path_buf());
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd);
    }
    for cand in candidates {
        for dir in cand.ancestors() {
            if is_repo_root(dir) {
                return Some(dir.to_path_buf());
            }
        }
    }
    persisted_repo_root()
}

pub fn validate_repo_root(p: &Path) -> bool {
    is_repo_root(p)
}
