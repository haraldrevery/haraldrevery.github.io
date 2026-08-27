# Adding a third-party licence to the Legal page

**Drop the licence file in this folder. That's it.**

Name it after the library, with **no file extension** (e.g. `alpine`), and copy
the text verbatim from the project — never edit it. On the next build it becomes
a block in Section 10 of the Legal page, showing the library name, its copyright
notice, and the complete licence inside a "Show full license" toggle. The file is
also published to `/licence/<name>` so the block's link resolves.

Everything on the block is read out of the file itself:

| Shown | Where it comes from |
| ----- | ------------------- |
| Name | the filename |
| Copyright | the first line starting with `Copyright` at column 0, plus any `(c)` / `©` / `All rights reserved.` lines directly after it |
| Licence badge | `MIT` / `BSD 3-Clause` / `Apache-2.0` / `Apache-2.0 / MPL-2.0`, sniffed from the text |
| Full text | the whole file, verbatim |

## The optional sidecar

Add a `<name>.json` **only when the file cannot speak for itself**:

```json
{
  "name": "Alpine.js",
  "description": "Reactive JavaScript framework used for the nav bar and audio player."
}
```

| Field | When you need it |
| ----- | ---------------- |
| `name` | the filename reads badly (`mathjs-develop` → `Math.js`) |
| `description` | you want a "what this site uses it for" line. Purely editorial |
| `copyright` | **the file genuinely has no notice** — see below |
| `license` | the badge sniffed wrong, or nothing was detected |
| `licenseUrl` | there is no local text file at all; the block links out instead |

Anything you set overrides what was read from the file. Sidecars are otherwise
unnecessary — a freshly dropped licence needs none.

## Two rules the build enforces

**1. A library with no findable copyright fails the build.**
Not every licence file contains one. `mathjs-develop` is the example here: it is
the bare Apache-2.0 template whose copyright appendix (`Copyright [yyyy] [name of
copyright owner]`) was never filled in, so Jos de Jong's name appears nowhere in
it. Publishing the library without its notice would breach the licence, so the
build stops and asks you to put a `copyright` in the sidecar rather than quietly
showing an unattributed block.

The search deliberately only matches `Copyright` at **column 0** within the first
30 lines. Apache-2.0 body text is indented and contains phrases like
`copyright notice that is included in or attached to the work` — those are prose,
not attribution, and must never be mistaken for it.

**2. A sidecar with no text file must carry `licenseUrl` and `copyright`.**
`tailwind.json` and `codemirror.json` are the two here: neither project's LICENSE
text exists in this repo (Tailwind ships as a standalone binary, CodeMirror only
as a minified bundle), so they link out. Saving their real LICENSE files as
`tailwind` and `codemirror` in this folder would turn both into ordinary entries.

## Notes

- The list is **alphabetical by display name**. There is no ordering field.
- `licence/` at the repo root is **generated from this folder**. Never add files
  there by hand — they would sit unreferenced while the real source is here.
- Eleventy caches directory data files, so **adding** a licence while `npm start`
  is running needs a dev-server restart. Editing a sidecar's values is fine.
- The wording around the list (Section 10's intro, the licence-family
  explanations, the closing "No Warranty" paragraph) lives in
  `../legal.md` — the body for the intro, the frontmatter for the closing.
