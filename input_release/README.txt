================================================================================
  RELEASE PAGES — how to publish a music release
================================================================================

Drop one file in this folder per release. Easiest start: copy _template.jsonc
(it has an inline comment on every field), remove the leading underscore, and
rename it. When the site is built, Eleventy generates:

  • release/<slug>.html   — the full release page  (from release.njk)
  • release/index.html     — the discography grid    (from discography.njk),
                             one tile per release, newest first, linking to the
                             release pages.

Build the site the usual way (./dev.sh, or the eleventy binary). No npm needed.

--------------------------------------------------------------------------------
  FILE FORMAT  —  .jsonc (comments allowed) or .json
--------------------------------------------------------------------------------
Use a .jsonc extension to write // and /* */ comments and trailing commas
(great for keeping notes while you fill things in). Plain .json also works but
most editors flag comments in it as errors. Both are read the same way — URLs
like https://... are always safe, comments never touch text inside quotes.

--------------------------------------------------------------------------------
  DRAFTS
--------------------------------------------------------------------------------
Prefix a filename with an underscore to keep it OUT of the build:
      _my-unreleased-track.jsonc     (ignored — this is why _template.jsonc never publishes)
      my-unreleased-track.jsonc      (published)

--------------------------------------------------------------------------------
  FIELD REFERENCE   (see _template.jsonc for the same notes inline)
--------------------------------------------------------------------------------
Required:
  type            "Single" | "EP" | "Album"   (drives the og:type + default kicker)
  name            Release title, e.g. "Phrases"
  date            Release date, ISO format "YYYY-MM-DD"
  artcover        Full-size cover image link, e.g. "/artcover/phrases11.jpg"
  artcoverMin     Minimized cover link (used on the hero + discography grid),
                  e.g. "/artcover/phrases11_min.jpg"

Recommended:
  slug            URL name -> release/<slug>.html. If omitted, it is generated
                  from "name" (e.g. "Phrases" -> "phrases").
  artist          Defaults to "Harald Revery" if omitted.
  isrc            The release's ISRC code.
  genres          Array of genre / tag strings. Shown as hero chips + the
                  "Genre" row, e.g. ["Melodic House", "Electronic"].
  kicker          Small line above the title. Defaults to "New <type> — Out Now".
  introduction    One-line tagline under the title (also used as the page's
                  meta description + social share text).
  about           "About the release" text. HTML is allowed (<p>, <em>, <a> ...).

Optional (a field/section is only rendered when present):
  streaming       Object of links; include only the ones you have. Keys:
                    spotify, apple, soundcloud, tidal, deezer, amazon,
                    youtube, odysee
  audio           Array of preview players: [{ "label": "...", "src": "...mp3" }]
                  e.g. label "Preview", "Extended Mix". Omit for no players.
  tracklist       Array of tracks (for EPs / albums). Each:
                    { "order": 1, "name": "...", "version": "", "length": "3:24",
                      "isrc": "XXXXXXXXXXXX" }
                  "version" and "isrc" are optional (both shown dimmed; the
                  ISRC sits under the track title). Omit the whole array for a
                  single with no tracklist.
  video           { "src": "...mp4", "thumbnail": "...jpg", "description": "..." }
                  Omit for no video section.

--------------------------------------------------------------------------------
  PATH CONVENTIONS (existing asset folders)
--------------------------------------------------------------------------------
  Cover art   /artcover/<name>11.jpg  and  /artcover/<name>11_min.jpg
  Audio       /music/mp3/harald_revery_-_<name>.mp3
  Video       /video/under_25_mb/harald_revery_-_<name>.mp4

See phrases.json in this folder for a complete, working example.
