use std::fs;
use std::path::{Path, PathBuf};

/// A directory counts as the site repo only if both markers are present,
/// so an unrelated Eleventy project is never picked up by accident. Both are
/// structural (config + layouts), never a content folder — so renaming an
/// input folder can't break repo discovery.
fn is_repo_root(p: &Path) -> bool {
    p.join("eleventy.config.js").is_file() && p.join("eleventy_settings").is_dir()
}

fn config_file() -> Option<PathBuf> {
    // Deliberately NOT shared with v1's ~/.config/page_builder/: this file is
    // *written* by persist_repo_root, so a v2 bug would silently break v1.
    dirs::config_dir().map(|d| d.join("page_builder_v2").join("config.json"))
}

/*
 * The crash-recovery draft, beside config.json in the app's OWN config dir.
 *
 * Deliberately not in the repo and not in `projects/`: this is not the user's
 * work product, it is a safety net for work that has not become one yet. A
 * draft sitting in `projects/` would show up in the Open list as if it were a
 * real project, and would be committed to git along with the site.
 */
pub fn recovery_file() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join("page_builder_v2").join("recovery.json"))
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
/// when `tauri dev` runs from page_builder_app_v2/src-tauri, and (via the persisted
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
