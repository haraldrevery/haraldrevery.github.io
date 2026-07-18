/*
 * word_animation engine — wraps words in the site's per-word fade-up spans
 * (about.html / contact.html pattern):
 *   <span class="word_animation" style="animation-delay: 0.12s">Word</span>
 *
 * Delays are deterministic pseudo-random (hashed from a seed + word index) so
 * repeated renders and exports produce identical output — random enough to
 * look organic, stable enough not to churn diffs.
 *
 * Pure module: operates on strings only.
 */

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/// 0.02–0.97s, two decimals — the range observed on the live site.
export function wordDelay(seed: string): string {
  return ((hash(seed) % 96) / 100 + 0.02).toFixed(2);
}

function span(word: string, seed: string): string {
  return `<span class="word_animation" style="animation-delay: ${wordDelay(seed)}s">${word}</span>`;
}

/// Wrap each word of ALREADY-ESCAPED plain text (headings, hero lines).
export function wrapPlainWords(text: string, seed: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  return words.map((w, i) => span(w, `${seed}:${i}`)).join(" ");
}

// Subtrees whose text must never be wrapped (math markup, code, inline svg).
const SKIP_TAGS = new Set(["math", "code", "pre", "svg", "script", "style"]);

/// Wrap word runs in RENDERED HTML (markdown output). A small string state
/// machine: text inside skip-subtrees and inside tags is left alone; visible
/// text elsewhere (including link text, like the site's mailto) is wrapped.
export function wrapHtmlWords(html: string, seed: string): string {
  let out = "";
  let i = 0;
  let word = 0;
  const skipStack: string[] = [];

  const flushText = (text: string) => {
    if (skipStack.length) {
      out += text;
      return;
    }
    // wrap word chunks, preserve whitespace between them
    out += text.replace(/\S+/g, (w) => span(w, `${seed}:${word++}`));
  };

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      flushText(html.slice(i));
      break;
    }
    if (lt > i) flushText(html.slice(i, lt));
    const gt = html.indexOf(">", lt);
    if (gt === -1) {
      out += html.slice(lt);
      break;
    }
    const tag = html.slice(lt, gt + 1);
    const m = /^<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(tag);
    if (m) {
      const closing = !!m[1];
      const name = m[2].toLowerCase();
      const selfClosing = tag.endsWith("/>");
      if (SKIP_TAGS.has(name)) {
        if (closing) {
          const idx = skipStack.lastIndexOf(name);
          if (idx !== -1) skipStack.splice(idx, 1);
        } else if (!selfClosing) {
          skipStack.push(name);
        }
      }
    }
    out += tag;
    i = gt + 1;
  }
  return out;
}
