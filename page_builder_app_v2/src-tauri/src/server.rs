use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tiny_http::{Header, Method, Response, Server, StatusCode};

/// Repo root shared with the request thread; None until located.
pub type SharedRoot = Arc<RwLock<Option<PathBuf>>>;

/// The rendered page held for /__pb/preview; None until Preview is clicked.
/// Written by the `set_preview_html` command, read by the request thread.
pub type SharedPreview = Arc<RwLock<Option<String>>>;

/// Reserved URL prefix for routes this server generates rather than reads off
/// disk. Everything under it is answered here and NEVER falls through to
/// serve_static, so a repo path can neither shadow it nor be shadowed by it.
const PB_PREFIX: &str = "/__pb/";

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

/// Puck renders its preview into a `srcDoc` iframe, which inherits the PARENT's
/// origin (localhost:5174 in dev, tauri://localhost in release) rather than this
/// server's. Cross-origin CSS, images, video and audio load fine without CORS —
/// @font-face does NOT. Without this header the preview silently falls back to a
/// system font, which looks like a CSS bug and isn't one.
///
/// Safe to open up: this server is GET-only, bound to 127.0.0.1 on an ephemeral
/// port, and jailed to the repo by canonicalize + starts_with + `..` rejection.
fn cors() -> Header {
    header("Access-Control-Allow-Origin", "*")
}

fn html_response(body: String, status: u16) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_data(body.into_bytes())
        .with_status_code(StatusCode(status))
        .with_header(header("Content-Type", "text/html; charset=utf-8"))
}

// The live preview document.
//
// Unlike v1, this is not a placeholder shell filled in over postMessage — it is
// the exact string the exporter would write, minus the front matter Eleventy
// strips anyway. One render path, so the preview cannot drift from the page.
//
// Served from this origin (rather than a srcDoc iframe) so that every
// root-absolute URL the shell emits — the stylesheets under /, the woff2 files
// under /fonts, the images under /photos, the scripts under /javascript —
// resolves against the repo with no rewriting of the markup.
//
// no-store because the iframe reloads this URL after every re-render; a cached
// copy would show the previous version of the page.
fn serve_preview(req: tiny_http::Request, preview: &SharedPreview) {
    let html = preview.read().ok().and_then(|g| g.clone());
    let body = html.unwrap_or_else(|| {
        "<!doctype html><meta charset=\"utf-8\"><title>Preview</title>\
         <p style=\"font:14px system-ui;padding:2rem\">Nothing to preview yet.</p>"
            .to_string()
    });
    let resp = html_response(body, 200).with_header(header("Cache-Control", "no-store"));
    let _ = req.respond(resp);
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
                .with_header(cors())
                .with_header(header(
                    "Content-Range",
                    &format!("bytes {}-{}/{}", start, end, len),
                ));
            let _ = req.respond(resp);
        }
        None => {
            let resp = Response::from_data(data)
                .with_header(header("Content-Type", mime))
                .with_header(header("Accept-Ranges", "bytes"))
                .with_header(cors());
            let _ = req.respond(resp);
        }
    }
}

fn handle(req: tiny_http::Request, root: &SharedRoot, preview: &SharedPreview) {
    if *req.method() != Method::Get {
        let _ = req.respond(html_response("405".into(), 405));
        return;
    }
    // The query string is dropped here, which is what lets the preview iframe
    // cache-bust with ?t=<nonce> without any further handling.
    let path = percent_decode(req.url().split('?').next().unwrap_or("/"));

    // Reserved routes first, and they are exhaustive: an unknown /__pb/ path is
    // a 404, never a file read.
    if let Some(rest) = path.strip_prefix(PB_PREFIX) {
        if rest == "preview" {
            serve_preview(req, preview);
        } else {
            let _ = req.respond(html_response("404 not found".into(), 404));
        }
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

    serve_static(req, &root_path, &path);
}

/// Bind on an ephemeral port and serve forever on a background thread.
pub fn start(root: SharedRoot, preview: SharedPreview) -> u16 {
    let server = Server::http("127.0.0.1:0").expect("failed to bind preview server");
    let port = server
        .server_addr()
        .to_ip()
        .map(|a| a.port())
        .expect("no port");
    std::thread::spawn(move || {
        for req in server.incoming_requests() {
            handle(req, &root, &preview);
        }
    });
    port
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpStream;

    /// Minimal HTTP/1.1 GET — the preview iframe is the only real client, and
    /// all that matters here is which route answers.
    fn get(port: u16, path: &str) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(s, "GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n").unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).unwrap();
        out
    }

    #[test]
    fn pb_routes_are_exhaustive_and_never_touch_the_disk() {
        let dir = std::env::temp_dir().join("pb_server_routes");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("__pb")).unwrap();
        // A real file at the reserved path must stay unreachable: the prefix is
        // answered in full, so nothing under it can shadow or be shadowed.
        fs::write(dir.join("__pb").join("preview"), "ON DISK").unwrap();
        fs::write(dir.join("main.css"), "body{}").unwrap();

        let root: SharedRoot = Arc::new(RwLock::new(Some(dir.clone())));
        let preview: SharedPreview = Arc::new(RwLock::new(None));
        let port = start(root, preview.clone());

        // Nothing stored yet: a placeholder, not the file on disk.
        let empty = get(port, "/__pb/preview");
        assert!(empty.starts_with("HTTP/1.1 200"), "{empty}");
        assert!(empty.contains("Nothing to preview yet"));
        assert!(!empty.contains("ON DISK"));

        *preview.write().unwrap() = Some("<!DOCTYPE html><p>rendered</p>".into());
        let served = get(port, "/__pb/preview");
        assert!(served.contains("<p>rendered</p>"));
        assert!(served.contains("Cache-Control: no-store"));
        // The cache-busting query the iframe appends must not change routing.
        assert!(get(port, "/__pb/preview?t=123").contains("<p>rendered</p>"));

        // Anything else under the prefix is a 404, never a file read.
        assert!(get(port, "/__pb/editor-bridge.js").starts_with("HTTP/1.1 404"));
        assert!(get(port, "/__pb/").starts_with("HTTP/1.1 404"));

        // Static serving is untouched, and the jail still holds.
        assert!(get(port, "/main.css").contains("body{}"));
        assert!(get(port, "/../../etc/passwd").starts_with("HTTP/1.1 403"));

        let _ = fs::remove_dir_all(&dir);
    }
}
