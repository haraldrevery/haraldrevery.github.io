use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

use crate::{repo, AppState};

const SITE_URL: &str = "https://haraldrevery.com";

/// Repo folder that exported pages are written to (Eleventy reads it as
/// HTML_PAGES_DIR in eleventy.config.js). Renaming that folder = change this
/// one line and rebuild.
const HTML_PAGES_DIR: &str = "input_custom_html_pages";

fn repo_root(state: &State<AppState>) -> Result<PathBuf, String> {
    state
        .root
        .read()
        .map_err(|_| "state poisoned".to_string())?
        .clone()
        .ok_or_else(|| "Site repo not located".to_string())
}

/// Resolve a root-absolute web path (/photos/foo.jpg) to a canonical
/// filesystem path, verifying it stays inside the repo — symlinks (and any
/// `..` in the path) cannot escape. None = missing or outside the repo.
fn resolve_in_repo(root: &Path, web: &str) -> Option<PathBuf> {
    let file = fs::canonicalize(root.join(web.trim_start_matches('/'))).ok()?;
    let canon_root = fs::canonicalize(root).ok()?;
    file.starts_with(&canon_root).then_some(file)
}

/// Write via a sibling temp file + fsync + rename, so the destination is either
/// the old contents or the new ones — never a truncated or half-written file.
/// Plain `fs::write` truncates first, so a crash, a full disk or a power loss
/// mid-write destroys the previous contents with nothing to recover from. Used
/// for every write the app makes: projects, exported pages and shell.html.
fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    use std::io::Write;
    let dir = path
        .parent()
        .ok_or_else(|| format!("{} has no parent directory", path.display()))?;
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|e| e.to_str()).unwrap_or("")
    ));
    let write = || -> std::io::Result<()> {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(contents.as_bytes())?;
        f.sync_all()?; // durable before the rename, or the rename can win a race
        Ok(())
    };
    if let Err(e) = write() {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Cannot write {}: {e}", tmp.display()));
    }
    // rename is atomic within a filesystem; tmp is a sibling so that holds
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Cannot replace {}: {e}", path.display())
    })?;
    let _ = dir; // dir handle only needed on platforms that fsync directories
    Ok(())
}

// ---------------------------------------------------------------- config

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub repo_root: Option<String>,
    pub preview_port: u16,
    pub site_url: String,
}

#[tauri::command]
pub fn get_config(state: State<AppState>) -> Config {
    let root = state.root.read().ok().and_then(|g| g.clone());
    Config {
        repo_root: root.map(|p| p.display().to_string()),
        preview_port: state.port,
        site_url: SITE_URL.to_string(),
    }
}

/// Folder picker used when auto-discovery fails; validates and persists.
#[tauri::command]
pub async fn locate_repo(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    let Some(folder) = picked else {
        return Ok(None);
    };
    let path = folder
        .into_path()
        .map_err(|e| format!("Invalid folder: {}", e))?;
    if !repo::validate_repo_root(&path) {
        return Err(format!(
            "{} does not look like the site repo (needs eleventy.config.js and eleventy_settings/)",
            path.display()
        ));
    }
    repo::persist_repo_root(&path);
    if let Ok(mut guard) = state.root.write() {
        *guard = Some(path.clone());
    }
    Ok(Some(path.display().to_string()))
}

// ---------------------------------------------------------------- media

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedFile {
    pub web: String,
    pub full: String,
    pub thumb: String,
    pub thumb_exists: bool,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

/// Pixel dimensions of an image inside the repo (header-only read).
fn dims_of(root: &Path, web: &str) -> Option<(u32, u32)> {
    let file = resolve_in_repo(root, web)?;
    imagesize::size(&file)
        .ok()
        .map(|s| (s.width as u32, s.height as u32))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickResult {
    pub files: Vec<PickedFile>,
    pub rejected: Vec<String>,
}

/// Absolute filesystem path -> root-absolute web path (/photos/...).
fn web_path_from_abs(abspath: &Path, root: &Path) -> Option<String> {
    let rel = abspath.strip_prefix(root).ok()?;
    let s = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/");
    Some(format!("/{}", s))
}

fn split_ext(web: &str) -> (&str, &str) {
    match web.rfind('.') {
        Some(i) if i > web.rfind('/').unwrap_or(0) => (&web[..i], &web[i..]),
        _ => (web, ""),
    }
}

/// The _min thumbnail convention: foo.jpg is the full-size (lightbox href),
/// foo_min.jpg the grid thumbnail. Missing _min falls back to the full-size
/// image and is flagged so the UI can show a warning badge instead of failing.
fn derive_full_thumb(web: &str, root: &Path) -> (String, String, bool) {
    let (base, ext) = split_ext(web);
    if base.ends_with("_min") {
        let full = format!("{}{}", &base[..base.len() - 4], ext);
        (full, web.to_string(), true)
    } else {
        let cand = format!("{}_min{}", base, ext);
        let exists = root.join(cand.trim_start_matches('/')).is_file();
        let thumb = if exists { cand } else { web.to_string() };
        (web.to_string(), thumb, exists)
    }
}

#[tauri::command]
pub async fn pick_media(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    kind: String,
    multiple: bool,
    start_dir: Option<String>,
) -> Result<PickResult, String> {
    let root = repo_root(&state)?;

    let filters: &[(&str, &[&str])] = match kind.as_str() {
        "image" => &[("Images", &["jpg", "jpeg", "png", "webp", "gif", "svg", "avif"])],
        "svg" => &[("SVG", &["svg"])],
        "video" => &[("Video", &["mp4", "webm"])],
        "audio" => &[("Audio", &["mp3", "wav", "ogg", "m4a"])],
        _ => &[],
    };

    let start = start_dir
        .map(|d| root.join(d))
        .filter(|d| d.is_dir())
        .unwrap_or_else(|| root.clone());

    let mut dialog = app.dialog().file().set_directory(start);
    for (name, exts) in filters {
        dialog = dialog.add_filter(*name, exts);
    }

    let picked: Vec<tauri_plugin_dialog::FilePath> = if multiple {
        dialog.blocking_pick_files().unwrap_or_default()
    } else {
        dialog.blocking_pick_file().into_iter().collect()
    };

    let mut files = Vec::new();
    let mut rejected = Vec::new();
    for fp in picked {
        let Ok(path) = fp.into_path() else { continue };
        match web_path_from_abs(&path, &root) {
            Some(web) => {
                let (full, thumb, thumb_exists) = derive_full_thumb(&web, &root);
                // ratio comes from the full-size image; fall back to the picked file
                let dims = dims_of(&root, &full).or_else(|| dims_of(&root, &web));
                files.push(PickedFile {
                    web,
                    full,
                    thumb,
                    thumb_exists,
                    width: dims.map(|d| d.0),
                    height: dims.map(|d| d.1),
                });
            }
            None => rejected.push(path.display().to_string()),
        }
    }
    Ok(PickResult { files, rejected })
}

/// Batch existence check for root-absolute web paths (thumb revalidation on load).
#[tauri::command]
pub fn check_files(state: State<AppState>, paths: Vec<String>) -> Result<Vec<bool>, String> {
    let root = repo_root(&state)?;
    Ok(paths
        .iter()
        .map(|p| resolve_in_repo(&root, p).is_some_and(|f| f.is_file()))
        .collect())
}

/// Batch pixel-dimension lookup (justified galleries need aspect ratios).
#[tauri::command]
pub fn image_dims(
    state: State<AppState>,
    paths: Vec<String>,
) -> Result<Vec<Option<(u32, u32)>>, String> {
    let root = repo_root(&state)?;
    Ok(paths.iter().map(|p| dims_of(&root, p)).collect())
}

// ---------------------------------------------------------------- file hashes

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHashInfo {
    pub size: u64,
    pub sha256: String,
    pub sha512: String,
}

/// Streamed SHA-256 + SHA-512 in one pass (1 MiB chunks — large zips/videos
/// never load into memory). MD5 is deliberately not offered.
fn hash_one(root: &Path, web: &str) -> Option<FileHashInfo> {
    use sha2::{Digest, Sha256, Sha512};
    use std::io::Read;
    let file = resolve_in_repo(root, web)?;
    let mut f = fs::File::open(&file).ok()?;
    let size = f.metadata().ok()?.len();
    let mut h256 = Sha256::new();
    let mut h512 = Sha512::new();
    let mut buf = vec![0u8; 1024 * 1024];
    loop {
        let n = f.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        h256.update(&buf[..n]);
        h512.update(&buf[..n]);
    }
    Some(FileHashInfo {
        size,
        sha256: format!("{:x}", h256.finalize()),
        sha512: format!("{:x}", h512.finalize()),
    })
}

/// Batch hashing for the downloads block; None per missing/unreadable file.
#[tauri::command]
pub fn hash_files(
    state: State<AppState>,
    paths: Vec<String>,
) -> Result<Vec<Option<FileHashInfo>>, String> {
    let root = repo_root(&state)?;
    Ok(paths.iter().map(|p| hash_one(&root, p)).collect())
}

/// Read an .svg file from inside the repo (for themed inlining in the
/// renderer). Path is a root-absolute web path like /svg/foo.svg.
#[tauri::command]
pub fn read_svg(state: State<AppState>, path: String) -> Result<String, String> {
    if !path.to_ascii_lowercase().ends_with(".svg") {
        return Err("Only .svg files can be inlined".to_string());
    }
    let root = repo_root(&state)?;
    let file = resolve_in_repo(&root, &path)
        .ok_or_else(|| format!("Cannot read {}: missing or outside the repo", path))?;
    fs::read_to_string(&file).map_err(|e| format!("Cannot read {}: {}", path, e))
}

// ---------------------------------------------------------------- projects

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub name: String,
    pub modified: u64,
}

fn projects_dir(root: &Path) -> PathBuf {
    root.join("page_builder").join("projects")
}

fn sanitize_project_name(name: &str) -> Result<String, String> {
    let clean: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if clean.is_empty() {
        return Err("Project name must contain letters, digits, - or _".to_string());
    }
    Ok(clean)
}

#[tauri::command]
pub fn list_projects(state: State<AppState>) -> Result<Vec<ProjectInfo>, String> {
    let dir = projects_dir(&repo_root(&state)?);
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                let name = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_default();
                let modified = entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                out.push(ProjectInfo { name, modified });
            }
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub written: bool,
    pub exists: bool,
    /// The sanitized stem that actually names the file. The caller must adopt
    /// this: "My Photos" becomes "MyPhotos", and keeping the raw string made the
    /// title bar disagree with the Open list.
    pub name: String,
    pub path: String,
}

#[tauri::command]
pub fn save_project(
    state: State<AppState>,
    name: String,
    data: String,
    overwrite: bool,
) -> Result<SaveResult, String> {
    let dir = projects_dir(&repo_root(&state)?);
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create {}: {e}", dir.display()))?;
    let clean = sanitize_project_name(&name)?;
    let file = dir.join(format!("{clean}.json"));
    // Sanitizing is lossy, so distinct titles can collide onto one file. Without
    // this check the second save silently destroyed the first.
    let existed = file.exists();
    if existed && !overwrite {
        return Ok(SaveResult {
            written: false,
            exists: true,
            name: clean,
            path: file.display().to_string(),
        });
    }
    write_atomic(&file, &data)?;
    Ok(SaveResult {
        written: true,
        exists: existed, // whether it was already there, not whether it is now
        name: clean,
        path: file.display().to_string(),
    })
}

#[tauri::command]
pub fn load_project(state: State<AppState>, name: String) -> Result<String, String> {
    let file = projects_dir(&repo_root(&state)?).join(format!("{}.json", sanitize_project_name(&name)?));
    fs::read_to_string(&file).map_err(|e| format!("Cannot read {}: {}", file.display(), e))
}

// ---------------------------------------------------------------- export

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub written: bool,
    pub exists: bool,
    pub path: String,
}

#[tauri::command]
pub fn export_page(
    state: State<AppState>,
    file_name: String,
    contents: String,
    overwrite: bool,
) -> Result<ExportResult, String> {
    if file_name.contains('/') || file_name.contains('\\') || !file_name.ends_with(".html") {
        return Err("Export file name must be a plain *.html name".to_string());
    }
    let dir = repo_root(&state)?.join(HTML_PAGES_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create {}: {e}", dir.display()))?;
    let file = dir.join(&file_name);
    let existed = file.exists();
    if existed && !overwrite {
        return Ok(ExportResult {
            written: false,
            exists: true,
            path: file.display().to_string(),
        });
    }
    write_atomic(&file, &contents)?;
    Ok(ExportResult {
        written: true,
        exists: existed, // report what actually happened, not a fixed false
        path: file.display().to_string(),
    })
}

#[tauri::command]
pub fn read_shell(state: State<AppState>) -> Result<String, String> {
    let file = repo_root(&state)?.join("page_builder").join("shell.html");
    fs::read_to_string(&file).map_err(|e| format!("Cannot read {}: {}", file.display(), e))
}

// ---------------------------------------------------------------- shell freshness

const REFERENCE_PAGE: &str = "galdhopiggen.html";

/// Byte span of `<tag ...>...</tag>` starting at the first occurrence,
/// depth-aware so the nested mobile <nav> inside the main <nav> is handled.
fn extract_element(html: &str, tag: &str) -> Option<(usize, usize)> {
    let open = format!("<{}", tag);
    let close = format!("</{}>", tag);
    let start = html.find(&open)?;
    let mut depth = 0usize;
    let mut i = start;
    loop {
        let next_open = html[i..].find(&open).map(|o| i + o);
        let next_close = html[i..].find(&close).map(|c| i + c);
        match (next_open, next_close) {
            (Some(o), Some(c)) if o < c => {
                depth += 1;
                i = o + open.len();
            }
            (_, Some(c)) => {
                depth = depth.checked_sub(1)?;
                i = c + close.len();
                if depth == 0 {
                    return Some((start, i));
                }
            }
            _ => return None,
        }
    }
}

fn normalize_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Remove {{PLACEHOLDER}} tokens so shell regions containing them (e.g. the
/// nav's {{NAV_EXTRA}}) still compare clean against the reference page.
fn strip_placeholders(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find("{{") {
        out.push_str(&rest[..i]);
        match rest[i..].find("}}") {
            Some(j) => rest = &rest[i + j + 2..],
            None => {
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

/// Asset URLs referenced from <head> (link href / script src), skipping
/// placeholder-bearing lines — used as a loose head-drift signal.
fn head_assets(html: &str) -> Vec<String> {
    let head = match (html.find("<head"), html.find("</head>")) {
        (Some(a), Some(b)) if a < b => &html[a..b],
        _ => return Vec::new(),
    };
    let mut out = Vec::new();
    for line in head.lines() {
        // placeholder lines and per-page canonical links are page-specific
        if line.contains("{{") || line.contains("rel=\"canonical\"") {
            continue;
        }
        let t = line.trim();
        if !(t.starts_with("<link") || t.starts_with("<script")) {
            continue;
        }
        for attr in ["href=\"", "src=\""] {
            if let Some(i) = t.find(attr) {
                let rest = &t[i + attr.len()..];
                if let Some(j) = rest.find('"') {
                    out.push(rest[..j].to_string());
                }
            }
        }
    }
    out.sort();
    out.dedup();
    out
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionReport {
    pub name: String,
    pub matches: bool,
    pub adoptable: bool,
    pub shell_excerpt: String,
    pub reference_excerpt: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FreshnessReport {
    pub reference: String,
    pub regions: Vec<RegionReport>,
}

fn load_shell_and_reference(root: &Path) -> Result<(String, String), String> {
    let shell_path = root.join("page_builder").join("shell.html");
    let ref_path = root.join(HTML_PAGES_DIR).join(REFERENCE_PAGE);
    let shell = fs::read_to_string(&shell_path)
        .map_err(|e| format!("Cannot read {}: {}", shell_path.display(), e))?;
    let reference = fs::read_to_string(&ref_path)
        .map_err(|e| format!("Cannot read {}: {}", ref_path.display(), e))?;
    Ok((shell, reference))
}

#[tauri::command]
pub fn check_shell_freshness(state: State<AppState>) -> Result<FreshnessReport, String> {
    let root = repo_root(&state)?;
    let (shell, reference) = load_shell_and_reference(&root)?;

    let mut regions = Vec::new();
    for tag in ["nav", "footer"] {
        let s = extract_element(&shell, tag).map(|(a, b)| shell[a..b].to_string());
        let r = extract_element(&reference, tag).map(|(a, b)| reference[a..b].to_string());
        let matches = match (&s, &r) {
            (Some(s), Some(r)) => {
                normalize_ws(&strip_placeholders(s)) == normalize_ws(&strip_placeholders(r))
            }
            _ => false,
        };
        regions.push(RegionReport {
            name: tag.to_string(),
            matches,
            adoptable: s.is_some() && r.is_some(),
            shell_excerpt: s.unwrap_or_default(),
            reference_excerpt: r.unwrap_or_default(),
        });
    }

    let sa = head_assets(&shell);
    let ra = head_assets(&reference);
    regions.push(RegionReport {
        name: "head-assets".to_string(),
        matches: sa == ra,
        adoptable: false,
        shell_excerpt: sa.join("\n"),
        reference_excerpt: ra.join("\n"),
    });

    Ok(FreshnessReport {
        reference: REFERENCE_PAGE.to_string(),
        regions,
    })
}

#[cfg(test)]
mod tests {
    use super::hash_one;

    #[test]
    fn hashes_match_known_sha2_test_vectors() {
        // NIST test vector: message "abc"
        let dir = std::env::temp_dir().join("pb_hash_test");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("abc.txt"), b"abc").unwrap();
        let info = hash_one(&dir, "abc.txt").unwrap();
        assert_eq!(info.size, 3);
        assert_eq!(
            info.sha256,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            info.sha512,
            "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a\
             2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f"
        );
        assert!(hash_one(&dir, "missing.bin").is_none());
    }

    #[test]
    fn write_atomic_replaces_contents_and_leaves_no_temp_file() {
        let dir = std::env::temp_dir().join("pb_write_atomic_ok");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("project.json");

        super::write_atomic(&file, "first").unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "first");

        super::write_atomic(&file, "second").unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "second");

        // no .tmp sibling survives a successful write
        let leftovers: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.contains("tmp"))
            .collect();
        assert!(leftovers.is_empty(), "temp files left behind: {leftovers:?}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_atomic_leaves_the_original_intact_when_it_cannot_write() {
        // the destination directory does not exist, so File::create fails
        let dir = std::env::temp_dir().join("pb_write_atomic_fail");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("keep.json");
        std::fs::write(&file, "original").unwrap();

        let missing = dir.join("nope").join("keep.json");
        assert!(super::write_atomic(&missing, "new").is_err());
        // the pre-existing file is untouched — the whole point of temp+rename
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "original");
        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[tauri::command]
pub fn adopt_shell_region(state: State<AppState>, region: String) -> Result<(), String> {
    if region != "nav" && region != "footer" {
        return Err(format!("Region '{}' cannot be adopted automatically", region));
    }
    let root = repo_root(&state)?;
    let (shell, reference) = load_shell_and_reference(&root)?;
    let (sa, sb) =
        extract_element(&shell, &region).ok_or(format!("<{}> not found in shell.html", region))?;
    let (ra, rb) = extract_element(&reference, &region)
        .ok_or(format!("<{}> not found in {}", region, REFERENCE_PAGE))?;
    let mut adopted = reference[ra..rb].to_string();
    if region == "nav" {
        // re-insert the hero nav-reveal placeholder the reference page lacks
        // (and drop a hard-coded navi_mechanic if the reference had one)
        adopted = adopted.replacen("main-nav navi_mechanic", "main-nav", 1);
        adopted = adopted.replacen("class=\"main-nav", "class=\"main-nav{{NAV_EXTRA}}", 1);
        // replacen silently matches nothing if the reference nav was restructured.
        // Writing anyway drops {{NAV_EXTRA}} from the shell, and every page
        // exported afterwards loses the hero nav-reveal with no error at all.
        if !adopted.contains("{{NAV_EXTRA}}") {
            return Err(format!(
                "Refusing to adopt: no `class=\"main-nav` found in {REFERENCE_PAGE}'s <nav>, so the \
                 {{{{NAV_EXTRA}}}} placeholder could not be preserved. Update shell.html by hand."
            ));
        }
    }
    let updated = format!("{}{}{}", &shell[..sa], adopted, &shell[sb..]);
    let shell_path = root.join("page_builder").join("shell.html");
    write_atomic(&shell_path, &updated)
}
