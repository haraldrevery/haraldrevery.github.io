/*
 * The title and description a photo carries inside the file, so picking it can
 * pre-fill the caption fields instead of making the author retype them.
 *
 * XMP ONLY, deliberately. Photo editors write the same caption up to three
 * times — XMP, EXIF and IPTC — and in this repo's photos only the XMP copy is
 * right:
 *
 *   - EXIF ImageDescription is typed ASCII by the spec but holds raw UTF-8, so
 *     a spec-following reader turns "Galdhøpiggen" into "Galdh..piggen".
 *   - IPTC holds it in Latin-1 with no charset marker (a lone 0xF8 byte).
 *   - XMP is UTF-8 by definition, and has both dc:title and dc:description.
 *
 * Every photo in photos/ that has EXIF text also has it in XMP, so reading the
 * other two would add nothing except ways to be wrong.
 *
 * Header-only, like dims_of: a JPEG is read up to its start of scan, and PNG /
 * WebP seek past image data rather than reading it. Anything unreadable,
 * unknown or malformed is None — this is a convenience and must never be the
 * reason a pick fails.
 */
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use quick_xml::events::{BytesRef, Event};
use quick_xml::name::{Namespace, ResolveResult};
use quick_xml::NsReader;
use serde::Serialize;

#[derive(Debug, Default, PartialEq, Serialize)]
pub struct ImageText {
    pub title: Option<String>,
    pub description: Option<String>,
}

const DC: &[u8] = b"http://purl.org/dc/elements/1.1/";
const RDF: &[u8] = b"http://www.w3.org/1999/02/22-rdf-syntax-ns#";
/// APP1 payload prefix of a standard XMP packet in a JPEG.
const JPEG_XMP: &[u8] = b"http://ns.adobe.com/xap/1.0/\0";
const PNG_SIG: &[u8] = b"\x89PNG\r\n\x1a\n";
/// A real packet is a few KB. The cap only stops a corrupt length field from
/// allocating whatever it claims.
const MAX_XMP: u64 = 1024 * 1024;

pub fn read_image_text(path: &Path) -> Option<ImageText> {
    let mut file = File::open(path).ok()?;
    let xmp = find_xmp(&mut file)?;
    let text = parse_xmp(&String::from_utf8_lossy(&xmp));
    (text.title.is_some() || text.description.is_some()).then_some(text)
}

fn find_xmp<R: Read + Seek>(r: &mut R) -> Option<Vec<u8>> {
    let mut magic = [0u8; 12];
    r.read_exact(&mut magic).ok()?;
    if magic.starts_with(&[0xFF, 0xD8]) {
        jpeg_xmp(r)
    } else if magic.starts_with(PNG_SIG) {
        png_xmp(r)
    } else if magic.starts_with(b"RIFF") && &magic[8..12] == b"WEBP" {
        webp_xmp(r)
    } else {
        None
    }
}

fn read_vec<R: Read>(r: &mut R, len: u64) -> Option<Vec<u8>> {
    if len > MAX_XMP {
        return None;
    }
    let mut buf = vec![0u8; len as usize];
    r.read_exact(&mut buf).ok()?;
    Some(buf)
}

/// Walk the marker segments that precede the image data. XMP is an APP1
/// segment; EXIF is also APP1, so the signature is what tells them apart.
fn jpeg_xmp<R: Read + Seek>(r: &mut R) -> Option<Vec<u8>> {
    r.seek(SeekFrom::Start(2)).ok()?; // past SOI
    let mut b = [0u8; 1];
    loop {
        r.read_exact(&mut b).ok()?;
        if b[0] != 0xFF {
            return None; // not on a segment boundary: corrupt, stop
        }
        // Any number of 0xFF fill bytes may precede the marker code.
        while b[0] == 0xFF {
            r.read_exact(&mut b).ok()?;
        }
        match b[0] {
            0xDA | 0xD9 => return None, // start of scan / end of image
            0x01 | 0xD0..=0xD7 => continue, // standalone markers carry no length
            _ => {}
        }
        let mut len = [0u8; 2];
        r.read_exact(&mut len).ok()?;
        let body = (u16::from_be_bytes(len) as u64).checked_sub(2)?;
        if b[0] == 0xE1 {
            let seg = read_vec(r, body)?;
            if let Some(xmp) = seg.strip_prefix(JPEG_XMP) {
                return Some(xmp.to_vec());
            }
        } else {
            r.seek(SeekFrom::Current(body as i64)).ok()?;
        }
    }
}

fn png_xmp<R: Read + Seek>(r: &mut R) -> Option<Vec<u8>> {
    r.seek(SeekFrom::Start(8)).ok()?;
    let mut head = [0u8; 8];
    loop {
        r.read_exact(&mut head).ok()?;
        let len = u32::from_be_bytes([head[0], head[1], head[2], head[3]]) as u64;
        match &head[4..8] {
            b"IEND" => return None,
            b"iTXt" if len <= MAX_XMP => {
                if let Some(xmp) = itxt_xmp(&read_vec(r, len)?) {
                    return Some(xmp);
                }
                r.seek(SeekFrom::Current(4)).ok()?; // CRC
            }
            _ => {
                r.seek(SeekFrom::Current(len as i64 + 4)).ok()?;
            }
        }
    }
}

/// iTXt is `keyword \0 flag method language \0 translated \0 text`. Compressed
/// XMP would need zlib; the XMP spec asks writers not to compress it.
fn itxt_xmp(data: &[u8]) -> Option<Vec<u8>> {
    let rest = data.strip_prefix(b"XML:com.adobe.xmp\0")?;
    let (&compressed, rest) = rest.split_first()?;
    if compressed != 0 {
        return None;
    }
    let rest = rest.get(1..)?; // compression method
    let rest = &rest[rest.iter().position(|&c| c == 0)? + 1..]; // language tag
    let rest = &rest[rest.iter().position(|&c| c == 0)? + 1..]; // translated keyword
    Some(rest.to_vec())
}

fn webp_xmp<R: Read + Seek>(r: &mut R) -> Option<Vec<u8>> {
    let mut head = [0u8; 8]; // already past the 12-byte RIFF header
    loop {
        r.read_exact(&mut head).ok()?;
        let len = u32::from_le_bytes([head[4], head[5], head[6], head[7]]) as u64;
        if &head[..4] == b"XMP " {
            return read_vec(r, len);
        }
        // chunks are padded to an even length
        r.seek(SeekFrom::Current((len + (len & 1)) as i64)).ok()?;
    }
}

#[derive(Clone, Copy)]
enum Field {
    Title,
    Description,
}

/*
 * dc:title and dc:description out of an XMP packet.
 *
 * Both are rdf:Alt language alternatives: the x-default entry wins, else the
 * first with any text. Namespaces are RESOLVED rather than matched on the `dc:`
 * prefix, which is only a convention.
 *
 * quick-xml reports an entity reference as its own GeneralRef event, NOT as
 * part of the surrounding Text. Many captions here are stored with &quot; and
 * &#39;, so ignoring that event would silently drop their quotes.
 */
pub(crate) fn parse_xmp(xmp: &str) -> ImageText {
    let mut reader = NsReader::from_str(xmp);
    let mut out = ImageText::default();
    let mut depth = 0usize;
    // The dc element being read, and its depth.
    let mut field: Option<(Field, usize)> = None;
    // The rdf:li being read: its depth, whether it is x-default, its text.
    let mut li: Option<(usize, bool, String)> = None;
    // Finished rdf:li entries of the current field.
    let mut alts: Vec<(bool, String)> = Vec::new();
    // Text directly inside the field, for a writer that skips rdf:Alt.
    let mut bare = String::new();

    loop {
        // Malformed from here on: keep whatever was already complete.
        let Ok((ns, event)) = reader.read_resolved_event() else { break };
        let piece = match event {
            Event::Start(e) => {
                depth += 1;
                if field.is_none() {
                    if is_ns(&ns, DC) {
                        field = match e.local_name().as_ref() {
                            b"title" => Some((Field::Title, depth)),
                            b"description" => Some((Field::Description, depth)),
                            _ => None,
                        };
                    }
                } else if is_ns(&ns, RDF) && e.local_name().as_ref() == b"li" {
                    let default = e.attributes().flatten().any(|a| {
                        a.key.as_ref() == b"xml:lang" && a.value.as_ref() == b"x-default"
                    });
                    li = Some((depth, default, String::new()));
                }
                None
            }
            Event::End(_) => {
                if matches!(li, Some((d, ..)) if d == depth) {
                    if let Some((_, default, text)) = li.take() {
                        alts.push((default, text));
                    }
                }
                if let Some((f, d)) = field {
                    if d == depth {
                        commit(&mut out, f, &alts, &bare);
                        field = None;
                        alts.clear();
                        bare.clear();
                    }
                }
                depth = depth.saturating_sub(1);
                None
            }
            Event::Text(t) => t.xml10_content().ok().map(|s| s.into_owned()),
            Event::CData(t) => t.xml10_content().ok().map(|s| s.into_owned()),
            Event::GeneralRef(r) => resolve_ref(&r),
            Event::Eof => break,
            _ => None,
        };
        if let (Some(s), Some(_)) = (piece, field) {
            match &mut li {
                Some((_, _, text)) => text.push_str(&s),
                None => bare.push_str(&s),
            }
        }
    }
    out
}

fn is_ns(ns: &ResolveResult, want: &[u8]) -> bool {
    matches!(ns, ResolveResult::Bound(Namespace(n)) if *n == want)
}

/// `&quot;` / `&#39;` → the character. Unknown names (XMP cannot declare any)
/// are dropped rather than published as literal `&name;`.
fn resolve_ref(r: &BytesRef) -> Option<String> {
    let name = r.decode().ok()?;
    quick_xml::escape::unescape(&format!("&{name};"))
        .ok()
        .map(|s| s.into_owned())
}

fn commit(out: &mut ImageText, f: Field, alts: &[(bool, String)], bare: &str) {
    let has_text = |t: &str| t.chars().any(|c| !c.is_whitespace());
    let chosen = alts
        .iter()
        .find(|(default, t)| *default && has_text(t))
        .or_else(|| alts.iter().find(|(_, t)| has_text(t)))
        .map_or(bare, |(_, t)| t.as_str());
    let slot = match f {
        Field::Title => &mut out.title,
        Field::Description => &mut out.description,
    };
    // First occurrence wins; a packet may carry several rdf:Description blocks.
    if slot.is_none() {
        *slot = normalize(chosen);
    }
}

/// One line, single-spaced. The sidebar fields are single-line inputs, which
/// silently strip newlines, and the lightbox caption is a one-line attribute.
fn normalize(s: &str) -> Option<String> {
    let flat: String = s
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let joined = flat.split_whitespace().collect::<Vec<_>>().join(" ");
    (!joined.is_empty()).then_some(joined)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    /// A packet shaped like the ones in photos/: BOM in the xpacket header,
    /// single-quoted attributes, and the payload inside rdf:Description.
    fn packet(body: &str) -> String {
        format!(
            "<?xpacket begin='\u{feff}' id='W5M0MpCehiHzreSzNTczkc9d'?>\
             <x:xmpmeta xmlns:x='adobe:ns:meta/'>\
             <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>\
             <rdf:Description rdf:about='' xmlns:dc='http://purl.org/dc/elements/1.1/'>\
             {body}</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end='w'?>"
        )
    }

    fn alt(tag: &str, text: &str) -> String {
        format!("<dc:{tag}>\n <rdf:Alt>\n  <rdf:li xml:lang='x-default'>{text}</rdf:li>\n </rdf:Alt>\n</dc:{tag}>")
    }

    fn segment(marker: u8, payload: &[u8]) -> Vec<u8> {
        let mut out = vec![0xFF, marker];
        out.extend_from_slice(&((payload.len() + 2) as u16).to_be_bytes());
        out.extend_from_slice(payload);
        out
    }

    fn jpeg(before_scan: &[Vec<u8>], after_scan: &[u8]) -> Vec<u8> {
        let mut out = vec![0xFF, 0xD8];
        for s in before_scan {
            out.extend_from_slice(s);
        }
        out.extend_from_slice(&segment(0xDA, b"scan header"));
        out.extend_from_slice(after_scan);
        out.extend_from_slice(&[0xFF, 0xD9]);
        out
    }

    fn xmp_segment(xmp: &str) -> Vec<u8> {
        segment(0xE1, &[JPEG_XMP, xmp.as_bytes()].concat())
    }

    fn text(title: Option<&str>, description: Option<&str>) -> ImageText {
        ImageText {
            title: title.map(Into::into),
            description: description.map(Into::into),
        }
    }

    fn read(bytes: Vec<u8>) -> Option<ImageText> {
        let xmp = find_xmp(&mut Cursor::new(bytes))?;
        Some(parse_xmp(&String::from_utf8_lossy(&xmp)))
    }

    /// The real-world case: an EXIF APP1 first (whose ImageDescription is the
    /// mis-encoded copy), then the XMP one — and the XMP text uses entities and
    /// non-ASCII, exactly like photos/2015-2023/img_2886.jpg and the
    /// Galdhøpiggen set.
    #[test]
    fn reads_title_and_description_from_the_xmp_segment_not_exif() {
        let exif = segment(0xE1, b"Exif\0\0MM\0*Galdh\xc3\xb8piggen");
        let xmp = packet(&format!(
            "{}{}",
            alt("title", "Styggebreen glacier and Galdhøpiggen"),
            alt("description", "Harald Mark &quot;Revery&quot; Thirslund in Cortina d&#39;Ampezzo.")
        ));
        let file = jpeg(&[segment(0xE0, b"JFIF\0"), exif, xmp_segment(&xmp)], b"");
        assert_eq!(
            read(file),
            Some(text(
                Some("Styggebreen glacier and Galdhøpiggen"),
                Some("Harald Mark \"Revery\" Thirslund in Cortina d'Ampezzo.")
            ))
        );
    }

    #[test]
    fn never_reads_past_the_start_of_scan() {
        let xmp = packet(&alt("title", "hidden in the image data"));
        let file = jpeg(&[segment(0xE0, b"JFIF\0")], &xmp_segment(&xmp));
        assert_eq!(read(file), None);
    }

    #[test]
    fn prefers_x_default_and_flattens_whitespace() {
        let body = "<dc:title><rdf:Alt>\
                    <rdf:li xml:lang='nb-NO'>Utsikt</rdf:li>\
                    <rdf:li xml:lang='x-default'>  A view\n\tover   Jotunheimen  </rdf:li>\
                    </rdf:Alt></dc:title>";
        assert_eq!(parse_xmp(&packet(body)), text(Some("A view over Jotunheimen"), None));
    }

    #[test]
    fn falls_back_to_the_first_language_with_text() {
        let body = "<dc:description><rdf:Alt>\
                    <rdf:li xml:lang='x-default'>   </rdf:li>\
                    <rdf:li xml:lang='nb-NO'>Utsikt</rdf:li>\
                    </rdf:Alt></dc:description>";
        assert_eq!(parse_xmp(&packet(body)), text(None, Some("Utsikt")));
    }

    /// `dc:` is a convention, not the namespace. A different prefix bound to
    /// Dublin Core counts; the `dc` prefix bound to something else does not.
    #[test]
    fn matches_the_namespace_not_the_prefix() {
        let other_prefix = "<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>\
             <rdf:Description xmlns:d='http://purl.org/dc/elements/1.1/'>\
             <d:title><rdf:Alt><rdf:li xml:lang='x-default'>Bound</rdf:li></rdf:Alt></d:title>\
             </rdf:Description></rdf:RDF>";
        assert_eq!(parse_xmp(other_prefix), text(Some("Bound"), None));

        let impostor = "<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>\
             <rdf:Description xmlns:dc='urn:not-dublin-core'>\
             <dc:title><rdf:Alt><rdf:li xml:lang='x-default'>Nope</rdf:li></rdf:Alt></dc:title>\
             </rdf:Description></rdf:RDF>";
        assert_eq!(parse_xmp(impostor), ImageText::default());
    }

    #[test]
    fn whitespace_only_and_missing_fields_are_none() {
        assert_eq!(parse_xmp(&packet(&alt("title", " \n "))), ImageText::default());
        assert_eq!(parse_xmp(&packet("")), ImageText::default());
    }

    /// Garbage must degrade to "no text", never to a panic or a failed pick.
    #[test]
    fn malformed_input_keeps_what_was_complete_and_never_panics() {
        let broken = packet(&format!("{}<dc:description><rdf:Alt><rdf:li>unterminated", alt("title", "Kept")));
        assert_eq!(parse_xmp(&broken), text(Some("Kept"), None));
        assert_eq!(parse_xmp("<<<&&&"), ImageText::default());

        // truncated mid-segment, zero-length segment, lost sync, too short
        let mut truncated = jpeg(&[xmp_segment(&packet(&alt("title", "x")))], b"");
        truncated.truncate(40);
        assert_eq!(read(truncated), None);
        assert_eq!(read(vec![0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x00, 0, 0, 0, 0, 0, 0]), None);
        assert_eq!(read(vec![0xFF, 0xD8, 0x12, 0x34, 0, 0, 0, 0, 0, 0, 0, 0]), None);
        assert_eq!(read(vec![0xFF, 0xD8]), None);
        assert_eq!(read(b"PK\x03\x04 not an image".to_vec()), None);
    }

    #[test]
    fn reads_xmp_from_png_and_webp() {
        let xmp = packet(&alt("title", "Texture"));

        let mut itxt = b"XML:com.adobe.xmp\0\0\0\0\0".to_vec();
        itxt.extend_from_slice(xmp.as_bytes());
        let mut png = PNG_SIG.to_vec();
        for (kind, data) in [(&b"IHDR"[..], &[0u8; 13][..]), (b"iTXt", &itxt), (b"IEND", b"")] {
            png.extend_from_slice(&(data.len() as u32).to_be_bytes());
            png.extend_from_slice(kind);
            png.extend_from_slice(data);
            png.extend_from_slice(&[0; 4]); // CRC, unchecked
        }
        assert_eq!(read(png), Some(text(Some("Texture"), None)));

        let mut webp = b"RIFF\0\0\0\0WEBP".to_vec();
        for (kind, data) in [(&b"VP8X"[..], &[0u8; 9][..]), (b"XMP ", xmp.as_bytes())] {
            webp.extend_from_slice(kind);
            webp.extend_from_slice(&(data.len() as u32).to_le_bytes());
            webp.extend_from_slice(data);
            if data.len() % 2 == 1 {
                webp.push(0);
            }
        }
        assert_eq!(read(webp), Some(text(Some("Texture"), None)));
    }
}
