/*
 * React-to-HTML artifacts that have to be cleaned up before the markup is
 * written into shell.html.
 */

/*
 * React 19 automatically hoists <link rel="preload" as="image"> in front of any
 * <img> it considers eager — verified: it does this even when the img carries
 * NO fetch-priority attribute at all. Only loading="lazy" or
 * fetchPriority="low" suppress it, which is why gallery images (all lazy) are
 * unaffected and the hero cover photo is not.
 *
 * That link cannot stay. It is emitted into shell.html's {{HERO}} / {{CONTENT}}
 * slots, i.e. inside <body>, where <link> without itemprop is not valid HTML5 —
 * and it buys nothing, since the <img> it preloads is the very next element.
 * v1 never emitted one, so leaving it in would also mean a spurious diff on
 * every hero page.
 *
 * Deliberately narrow: only self-closing <link rel="preload" …> tags, which is
 * exactly the shape React generates. Anything a block author writes by hand in
 * a Raw block is left alone.
 */
export function stripReactPreloads(html: string): string {
  return html.replace(/<link rel="preload"[^>]*\/?>/g, "");
}
