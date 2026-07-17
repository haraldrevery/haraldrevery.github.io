use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tiny_http::{Header, Method, Response, Server, StatusCode};

/// Repo root shared with the request thread; None until located.
pub type SharedRoot = Arc<RwLock<Option<PathBuf>>>;

// The bridge is compiled into the binary so the release build works even if
// the page_builder folder is not next to it.
const EDITOR_BRIDGE_JS: &str = include_str!("../../preview-harness/editor-bridge.js");

fn mime_for(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "xml" => "application/xml",
        "webmanifest" => "application/manifest+json",
        _ => "application/octet-stream",
    }
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).unwrap()
}

fn html_response(body: String, status: u16) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_data(body.into_bytes())
        .with_status_code(StatusCode(status))
        .with_header(header("Content-Type", "text/html; charset=utf-8"))
}

/// Fill the export shell into a live preview document: placeholders neutralised,
/// content slot replaced by the container the editor bridge renders into.
fn preview_document(root: &std::path::Path) -> Result<String, String> {
    let shell_path = root.join("page_builder").join("shell.html");
    let shell = fs::read_to_string(&shell_path)
        .map_err(|e| format!("Cannot read {}: {}", shell_path.display(), e))?;
    let mut doc = shell;
    for (from, to) in [
        ("{{HERO}}", r#"<div id="pb-hero"></div>"#),
        ("{{NAV_EXTRA}}", ""),
        ("{{NAV_SCRIPT}}", ""),
        ("{{TITLE}}", "Preview — Notebook Page Builder"),
        ("{{DESCRIPTION}}", ""),
        ("{{KEYWORDS}}", ""),
        ("{{OG_TITLE}}", ""),
        ("{{OG_DESC}}", ""),
        ("{{OG_IMAGE}}", ""),
        ("{{OG_URL}}", ""),
        ("{{CANONICAL}}", ""),
        ("{{DATE_ISO}}", ""),
        ("{{DATE_HUMAN}}", "<span data-pb-date></span>"),
        ("{{JSONLD}}", ""),
        ("{{CONTENT}}", r#"<div id="pb-content"></div>"#),
    ] {
        doc = doc.replace(from, to);
    }
    // Bridge script goes last so it runs after the deferred GLightbox scripts.
    let bridge = r#"<script src="/__pb/editor-bridge.js" defer></script>"#;
    if doc.contains("</html>") {
        doc = doc.replace("</html>", &format!("{}\n</html>", bridge));
    } else {
        doc.push_str(bridge);
    }
    Ok(doc)
}

fn parse_range(req: &tiny_http::Request, len: u64) -> Option<(u64, u64)> {
    let raw = req
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))?
        .value
        .to_string();
    let spec = raw.strip_prefix("bytes=")?.split(',').next()?.trim().to_string();
    let (start_s, end_s) = spec.split_once('-')?;
    if start_s.is_empty() {
        // suffix range: last N bytes
        let n: u64 = end_s.parse().ok()?;
        let start = len.saturating_sub(n);
        return Some((start, len - 1));
    }
    let start: u64 = start_s.parse().ok()?;
    let end: u64 = if end_s.is_empty() {
        len - 1
    } else {
        end_s.parse::<u64>().ok()?.min(len - 1)
    };
    (start <= end && start < len).then_some((start, end))
}

fn serve_static(req: tiny_http::Request, root: &std::path::Path, path: &str) {
    let rel = path.trim_start_matches('/');
    let rel = if rel.is_empty() { "index.html" } else { rel };
    if rel.split(['/', '\\']).any(|c| c == "..") {
        let _ = req.respond(html_response("403".into(), 403));
        return;
    }
    let file = root.join(rel);
    let (file, meta) = match fs::canonicalize(&file).ok().and_then(|f| {
        let m = fs::metadata(&f).ok()?;
        Some((f, m))
    }) {
        Some(v) => v,
        None => {
            let _ = req.respond(html_response("404 not found".into(), 404));
            return;
        }
    };
    // Canonical containment check — symlinks cannot escape the repo.
    let canon_root = match fs::canonicalize(root) {
        Ok(r) => r,
        Err(_) => {
            let _ = req.respond(html_response("500".into(), 500));
            return;
        }
    };
    if !file.starts_with(&canon_root) || !meta.is_file() {
        let _ = req.respond(html_response("404 not found".into(), 404));
        return;
    }

    let mime = mime_for(rel);
    let len = meta.len();
    let range = parse_range(&req, len);
    let data = match fs::read(&file) {
        Ok(d) => d,
        Err(_) => {
            let _ = req.respond(html_response("500 read error".into(), 500));
            return;
        }
    };
    match range {
        // Partial-content support so <video>/<audio> seeking works in WebKit.
        Some((start, end)) => {
            let slice = data[start as usize..=(end as usize)].to_vec();
            let resp = Response::from_data(slice)
                .with_status_code(StatusCode(206))
                .with_header(header("Content-Type", mime))
                .with_header(header("Accept-Ranges", "bytes"))
                .with_header(header(
                    "Content-Range",
                    &format!("bytes {}-{}/{}", start, end, len),
                ));
            let _ = req.respond(resp);
        }
        None => {
            let resp = Response::from_data(data)
                .with_header(header("Content-Type", mime))
                .with_header(header("Accept-Ranges", "bytes"));
            let _ = req.respond(resp);
        }
    }
}

fn handle(req: tiny_http::Request, root: &SharedRoot) {
    if *req.method() != Method::Get {
        let _ = req.respond(html_response("405".into(), 405));
        return;
    }
    let path = percent_decode(req.url().split('?').next().unwrap_or("/"));

    if path == "/__pb/editor-bridge.js" {
        let resp = Response::from_data(EDITOR_BRIDGE_JS.as_bytes().to_vec())
            .with_header(header("Content-Type", "text/javascript; charset=utf-8"))
            .with_header(header("Cache-Control", "no-store"));
        let _ = req.respond(resp);
        return;
    }

    let root_path = root.read().ok().and_then(|g| g.clone());
    let root_path = match root_path {
        Some(r) => r,
        None => {
            let _ = req.respond(html_response(
                "<h1>Site repo not located yet</h1>".into(),
                503,
            ));
            return;
        }
    };

    if path == "/__pb/preview" {
        match preview_document(&root_path) {
            Ok(doc) => {
                let resp = html_response(doc, 200).with_header(header("Cache-Control", "no-store"));
                let _ = req.respond(resp);
            }
            Err(e) => {
                let _ = req.respond(html_response(format!("<h1>{}</h1>", e), 500));
            }
        }
        return;
    }

    serve_static(req, &root_path, &path);
}

/// Bind on an ephemeral port and serve forever on a background thread.
pub fn start(root: SharedRoot) -> u16 {
    let server = Server::http("127.0.0.1:0").expect("failed to bind preview server");
    let port = server
        .server_addr()
        .to_ip()
        .map(|a| a.port())
        .expect("no port");
    std::thread::spawn(move || {
        for req in server.incoming_requests() {
            handle(req, &root);
        }
    });
    port
}
