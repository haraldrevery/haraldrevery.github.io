#!/bin/bash
# ---------------------------------------------------------------------------
# healthcheck.sh - report-only sanity scan of the deployed site.
#
#   ./healthcheck.sh            full report
#   ./healthcheck.sh --quiet    only sections that found something
#
# Checks:
#   A. broken references  - src/href/poster/srcset in HTML, url() in CSS
#   B. case-only mismatch - works on Windows, 404s on GitHub Pages
#   C. size budgets       - oversized images/svg, and per-page image weight
#
# Note on C: per-page image weight is an UPPER BOUND, not real transfer size.
# Every srcset candidate is summed on top of the <img src>, and an image used
# twice on a page counts twice. A browser downloads far less. Treat the number
# as "this page is carrying too much", not as a byte count.
#
# Note on B: this check is only meaningful on a case-sensitive filesystem. On
# NTFS/APFS the reference resolves and nothing is reported - which is exactly
# the platform where wrong-cased references get created. healthcheck.ps1 does
# the same check by comparing against the real directory listing instead.
#
# This script never writes, moves or deletes anything. Exit 1 if errors found.
# Run it from the site root. Thresholds and scope are the two blocks below.
# ---------------------------------------------------------------------------

cd "$(dirname "$0")" || exit 2

# --- thresholds (override from the environment, e.g. IMG_MAX_KB=500 ./healthcheck.sh)
IMG_MAX_KB=${IMG_MAX_KB:-850}
SVG_MAX_KB=${SVG_MAX_KB:-500}
PAGE_IMG_MAX_KB=${PAGE_IMG_MAX_KB:-8000}

# --- scope -----------------------------------------------------------------
# Deployed pages only. Scaffolds and drafts are deliberately excluded: every
# broken image path in this repo lives in one, and including them buries the
# findings that matter. Add new sections here as the site grows.
ROOT_PAGES="index about contact music notebook discography download legal 404 h \
wallpaper_line wallpaper_particles wallpaper_plexus wallpaper_topography"
PAGE_DIRS="notebook_pages release"
CSS_FILES="main.css prose.css"

# Directories skipped when hunting for oversized assets. Only things that are
# genuinely not served: tooling, backups and scaffolds. Generator output dirs
# like svg/python_generated_svg ARE deployed (the asset root is "./"), so they
# stay in scope - an unused 576 kB svg still ships to visitors.
SKIP_DIRS="./node_modules ./.git ./page_builder ./test_pages ./notebook_templates \
./css_bkup ./eleventy_binary"

# --- output helpers --------------------------------------------------------
if [ -t 1 ]; then
    RED=$'\033[31m'; YLW=$'\033[33m'; GRN=$'\033[32m'; DIM=$'\033[2m'; BLD=$'\033[1m'; RST=$'\033[0m'
else
    RED=; YLW=; GRN=; DIM=; BLD=; RST=
fi

QUIET=0
case "$1" in
    '')        ;;
    --quiet)   QUIET=1 ;;
    -h|--help)
        printf 'usage: %s [--quiet]\n\n' "${0##*/}"
        printf '  --quiet   print only the sections that found something\n'
        printf '  --help    this message\n\n'
        printf 'Thresholds can be overridden from the environment:\n'
        printf '  IMG_MAX_KB=%s  SVG_MAX_KB=%s  PAGE_IMG_MAX_KB=%s\n' \
               "$IMG_MAX_KB" "$SVG_MAX_KB" "$PAGE_IMG_MAX_KB"
        exit 0 ;;
    *)
        printf '%s: unknown option "%s"\nusage: %s [--quiet]\n' \
               "${0##*/}" "$1" "${0##*/}" >&2
        exit 2 ;;
esac
if [ $# -gt 1 ]; then
    printf '%s: too many arguments\nusage: %s [--quiet]\n' "${0##*/}" "${0##*/}" >&2
    exit 2
fi

TMP=$(mktemp -d) || exit 2
trap 'rm -rf "$TMP"' EXIT

errors=0
warnings=0

# section <file> <label> <severity>  - print a findings file, or a pass line
section() {
    local f=$1 label=$2 sev=$3 n=0
    [ -s "$f" ] && n=$(wc -l < "$f")
    if [ "$n" -eq 0 ]; then
        [ "$QUIET" -eq 0 ] && printf '  %sok%s    %s\n' "$GRN" "$RST" "$label"
        return
    fi
    if [ "$sev" = error ]; then
        printf '\n  %sERROR%s %3d  %s\n' "$RED" "$RST" "$n" "$label"
        errors=$((errors + n))
    else
        printf '\n  %sWARN%s  %3d  %s\n' "$YLW" "$RST" "$n" "$label"
        warnings=$((warnings + n))
    fi
    sed 's/^/        /' "$f"
}

# ---------------------------------------------------------------------------
# Build the list of pages to scan.
# ---------------------------------------------------------------------------
: > "$TMP/pages"
for p in $ROOT_PAGES; do
    [ -f "$p.html" ] && echo "$p.html" >> "$TMP/pages"
done
for d in $PAGE_DIRS; do
    [ -d "$d" ] && find "$d" -maxdepth 1 -name '*.html' -type f >> "$TMP/pages"
done
sort -o "$TMP/pages" "$TMP/pages"
page_count=$(wc -l < "$TMP/pages")

printf '\n%sHarald Revery - site health check%s\n' "$BLD" "$RST"
printf '%s%d pages, %s%s\n\n' "$DIM" "$page_count" "$(echo $CSS_FILES | tr ' ' ',')" "$RST"

# ---------------------------------------------------------------------------
# Extract every local reference as: file<TAB>line<TAB>url
#
# Skipped: absolute URLs, protocol-relative, data:, mailto:, tel:, javascript:,
# bare #anchors, and url(#id) - those last are SVG gradient references inside
# main.css (e.g. url(#logoGradient_legacy)), not files. Without that exclusion
# the script reports phantom failures on its very first run.
# ---------------------------------------------------------------------------
: > "$TMP/refs"

while IFS= read -r f; do
    # src="...", href="..." and poster="..." (video thumbnails - three of them
    # are live, and before they were listed here nothing validated them).
    # Both quote styles: the page builder emits double quotes today, but a
    # single-quoted attribute would otherwise drop out of the scan silently.
    # This also picks up data-src= and xlink:href= incidentally, because -oE
    # matches from "src="/"href=" onwards. That is harmless - leave it.
    grep -noE "(src|href|poster)=\"[^\"]*\"|(src|href|poster)='[^']*'" "$f" 2>/dev/null \
      | sed -E "s/:(src|href|poster)=[\"']/\t/; s/[\"']$//" \
      | awk -F'\t' -v F="$f" 'NF==2 {print F "\t" $1 "\t" $2}' >> "$TMP/refs"

    # srcset="a.jpg 1x, b.jpg 2x" -> one row per candidate, descriptor dropped
    grep -noE "srcset=\"[^\"]*\"|srcset='[^']*'" "$f" 2>/dev/null \
      | sed -E "s/:srcset=[\"']/\t/; s/[\"']$//" \
      | awk -F'\t' -v F="$f" 'NF==2 {
            n = split($2, parts, ",")
            for (i = 1; i <= n; i++) {
                split(parts[i], tok, " ")
                gsub(/^[ \t]+|[ \t]+$/, "", tok[1])
                if (tok[1] != "") print F "\t" $1 "\t" tok[1]
            }
        }' >> "$TMP/refs"
    # Share images: <meta property="og:image"> and <meta name="twitter:image">.
    # These are absolute (https://haraldrevery.com/...) and would be dropped as
    # external by the resolver below, so the site origin is stripped here to turn
    # them back into local paths. Nothing else validated them: imageMeta() in
    # eleventy.config.js swallows a missing file and still emits the tag, so a
    # typo'd `image:` in frontmatter shipped a 404 share image with no build
    # error and no finding here. The og:image:width/height pair is simply absent
    # in that case - which is the only visible symptom, and easy to miss.
    #
    # Matching requires a quote straight after the property name, so og:image:width,
    # og:image:height and og:image:alt are correctly NOT treated as file refs.
    # The JSON-LD block carries the same path a second time but is deliberately
    # not scanned: its other "url" fields are page URLs, not files, and would all
    # report as missing. Checking og:image covers it - both come from imageMeta().
    grep -noE '<meta[^>]*(og:image|twitter:image)"[^>]*content="[^"]*"' "$f" 2>/dev/null \
      | sed -E 's|^([0-9]+):.*content="([^"]*)"$|\1\t\2|' \
      | sed "s|\thttps://haraldrevery.com|\t|" \
      | awk -F'\t' -v F="$f" 'NF==2 && $2 ~ /^\// {print F "\t" $1 "\t" $2}' >> "$TMP/refs"

    # url(...) inside inline style attributes, e.g.
    #   style="background-image: url('/photos/audioplayer_texture1.jpg')"
    # music.html alone has four of these; without this pass they are invisible.
    grep -noE "url\(['\"]?[^)'\"]+['\"]?\)" "$f" 2>/dev/null \
      | sed -E "s/:url\(['\"]?/\t/; s/['\"]?\)$//" \
      | awk -F'\t' -v F="$f" 'NF==2 {print F "\t" $1 "\t" $2}' >> "$TMP/refs"
done < "$TMP/pages"

# url(...) in the compiled stylesheets
for c in $CSS_FILES; do
    [ -f "$c" ] || continue
    grep -noE "url\(['\"]?[^)'\"]+['\"]?\)" "$c" 2>/dev/null \
      | sed -E "s/:url\(['\"]?/\t/; s/['\"]?\)$//" \
      | awk -F'\t' -v F="$c" 'NF==2 {print F "\t" $1 "\t" $2}' >> "$TMP/refs"
done

# ---------------------------------------------------------------------------
# Check A + B: resolve each reference.
# ---------------------------------------------------------------------------
: > "$TMP/missing"
: > "$TMP/case"

# resolve_ci <relative path> - echo the real on-disk path if every component
# matches when compared case-insensitively, echo nothing otherwise.
#
# Called only after an exact -e test has already failed, so a hit here means
# the reference differs from the file on disk by casing alone: fine locally,
# a 404 on GitHub Pages. Walking component by component rather than probing
# the basename is what lets this catch a wrong-cased *directory* - ./Photos/x
# used to fall through to "missing file", which points at the wrong fix.
resolve_ci() {
    local rest=${1#./} cur=. seg hit
    while [ -n "$rest" ]; do
        seg=${rest%%/*}
        if [ "$seg" = "$rest" ]; then rest=; else rest=${rest#*/}; fi
        case "$seg" in
            ''|.) continue ;;
            ..)   cur=$cur/..; continue ;;
        esac
        hit=$(ls -A "$cur" 2>/dev/null | awk -v s="$seg" 'tolower($0) == tolower(s) { print; exit }')
        [ -z "$hit" ] && return
        cur=$cur/$hit
    done
    [ -e "$cur" ] && printf '%s\n' "$cur"
}

while IFS=$'\t' read -r f line url; do
    [ -z "$url" ] && continue
    case "$url" in
        http://*|https://*|//*|data:*|mailto:*|tel:*|javascript:*|\#*|'') continue ;;
        /cdn-cgi/*) continue ;;   # Cloudflare-injected runtime path, not a file
    esac

    clean=${url%%\#*}          # drop #fragment
    clean=${clean%%\?*}        # drop ?query
    [ -z "$clean" ] && continue

    if [ "${clean#/}" != "$clean" ]; then
        path=".${clean}"                   # site-absolute
    else
        path="$(dirname "$f")/${clean}"    # relative to the containing file
    fi

    [ -e "$path" ] && continue

    # Exists under different casing? Fine on Windows, 404 on GitHub Pages.
    # One line per finding - section() counts findings with wc -l, so a
    # two-line entry here reported (and charged to the error count) double.
    hit=$(resolve_ci "$path")
    if [ -n "$hit" ]; then
        printf '%s:%s  %s  ->  exists as %s\n' "$f" "$line" "$url" "${hit#./}" >> "$TMP/case"
    else
        printf '%s:%s  %s\n' "$f" "$line" "$url" >> "$TMP/missing"
    fi
done < "$TMP/refs"

sort -u -o "$TMP/missing" "$TMP/missing"

# ---------------------------------------------------------------------------
# Check C: size budgets.
# ---------------------------------------------------------------------------
# Every asset actually referenced by a live page, for the referenced/orphan split.
awk -F'\t' '{print $3}' "$TMP/refs" \
  | sed -E 's/[#?].*$//' \
  | grep -vE '^(https?:|//|data:|mailto:|tel:|javascript:|#|$)' \
  | sed -E 's#^/##; s#^\./##' \
  | awk '{print tolower($0)}' | sort -u > "$TMP/referenced"

# Is this asset used anywhere? Two passes:
#   1. exact match against paths parsed out of the scanned pages (fast, precise)
#   2. fallback: does its filename appear in any source file at all?
# Pass 2 matters because the standalone apps (revery_notebook, rvry_ascii,
# color_theme_app) load images from their own JS/CSS, which this script does not
# parse. Without it, the revery_notebook background images get reported as
# orphans when they are genuinely in use.
#
# Pass 2 is deliberately wider than the scan scope above: it matches a basename
# anywhere in any source file, so an image used only by README.md, template.html
# or test_pages/ still counts as "used" (site.png and photos/20220512_131558.jpg
# are both in that position). That is a known, accepted over-count - it errs
# towards not telling you to delete something. Don't "fix" it without deciding
# what the used/orphan split is supposed to mean.
is_referenced() {          # $1 = path like ./photos/x.jpg
    local n=${1#./}
    grep -qxF "$(echo "$n" | awk '{print tolower($0)}')" "$TMP/referenced" && return 0
    grep -rlF --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=page_builder \
        --include='*.html' --include='*.js' --include='*.css' --include='*.njk' \
        --include='*.json' --include='*.jsonc' --include='*.md' \
        "$(basename "$n")" . 2>/dev/null | grep -q .
}

prune=""
for d in $SKIP_DIRS; do prune="$prune -path $d -prune -o"; done

: > "$TMP/big_used"
: > "$TMP/big_orphan"
: > "$TMP/big_svg"

# shellcheck disable=SC2086
find . $prune -type f \
    \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.webp' \) \
    -size +$((IMG_MAX_KB))k -print 2>/dev/null \
  | while IFS= read -r img; do
        kb=$(( $(stat -c%s "$img") / 1024 ))
        if is_referenced "$img"; then
            printf '%6d KB  %s\n' "$kb" "${img#./}" >> "$TMP/big_used"
        else
            printf '%6d KB  %s\n' "$kb" "${img#./}" >> "$TMP/big_orphan"
        fi
    done

# shellcheck disable=SC2086
find . $prune -type f -iname '*.svg' -size +$((SVG_MAX_KB))k -print 2>/dev/null \
  | while IFS= read -r s; do
        printf '%6d KB  %s\n' "$(( $(stat -c%s "$s") / 1024 ))" "${s#./}" >> "$TMP/big_svg"
    done

sort -rn -o "$TMP/big_used"   "$TMP/big_used"   2>/dev/null
sort -rn -o "$TMP/big_orphan" "$TMP/big_orphan" 2>/dev/null
sort -rn -o "$TMP/big_svg"    "$TMP/big_svg"    2>/dev/null

# Per-page total image weight.
: > "$TMP/heavy"
while IFS= read -r f; do
    total=0
    while IFS=$'\t' read -r rf rline rurl; do
        [ "$rf" = "$f" ] || continue
        case "$rurl" in
            http://*|https://*|//*|data:*|mailto:*|tel:*|javascript:*|\#*|'') continue ;;
        esac
        # Strip #fragment/?query first, then match the extension case-
        # insensitively. The old order tested the raw url against a hand-listed
        # set of case variants, so photo.JPG, foo.GIF and anything carrying a
        # ?query silently contributed nothing to the page total. Mixed case is
        # real here - see photos/IMG-2867.JPG.
        c=${rurl%%\#*}; c=${c%%\?*}
        case "${c##*.}" in
            [jJ][pP][gG]|[jJ][pP][eE][gG]|[pP][nN][gG]|[gG][iI][fF]|[wW][eE][bB][pP]|[sS][vV][gG]) ;;
            *) continue ;;
        esac
        if [ "${c#/}" != "$c" ]; then p=".${c}"; else p="$(dirname "$f")/${c}"; fi
        [ -f "$p" ] && total=$(( total + $(stat -c%s "$p") ))
    done < "$TMP/refs"
    kb=$(( total / 1024 ))
    [ "$kb" -gt "$PAGE_IMG_MAX_KB" ] && printf '%6d KB  %s\n' "$kb" "$f" >> "$TMP/heavy"
done < "$TMP/pages"
sort -rn -o "$TMP/heavy" "$TMP/heavy" 2>/dev/null

# ---------------------------------------------------------------------------
# Orphaned build output.
#
# Eleventy's output dir IS the repo root, so the build only ever writes - it
# never deletes. Set `draft: true` on a published post and the already-generated
# notebook_pages/<slug>.html stays on disk, live and reachable, even though
# notebook.html, sitemap.xml and search-index.json have all dropped it. The same
# applies to a tag page whose last post went draft, to a post whose source was
# renamed or deleted, to release/ pages, and to licence/ texts (syncLicenceDir
# in input_legal/input_legal.11tydata.js publishes but never prunes).
#
# Report-only, like every other check here: it names the files, you delete them.
# Nothing below removes anything - a false positive must never cost a live page.
# ---------------------------------------------------------------------------
: > "$TMP/orphan"

# Mirrors the "slugify" filter in eleventy.config.js. Kept deliberately literal:
# that filter is ASCII-only (\w), so "Ångström" -> "ngstrm" there and here.
slugify() {
    printf '%s' "$1" | tr '[:upper:]' '[:lower:]' \
        | sed -e 's/[^a-z0-9_ -]//g' -e 's/[[:space:]]\{1,\}/-/g' -e 's/--\{1,\}/-/g'
}

# Frontmatter body of a source file. Sources are CRLF, hence the tr.
fm() { sed -e '1{/^---/!q}' -e '1d' -e '/^---/,$d' "$1" 2>/dev/null | tr -d '\r'; }
is_draft() { fm "$1" | grep -qi '^draft:[[:space:]]*true[[:space:]]*$'; }

# Every slug and tag a LIVE (non-draft) source is allowed to publish.
: > "$TMP/live_slugs"; : > "$TMP/live_tags"
for src in input_markdown/*.md input_custom_html_pages/*.html; do
    [ -f "$src" ] || continue
    is_draft "$src" && continue
    b=$(basename "$src"); printf '%s\n' "${b%.*}" >> "$TMP/live_slugs"
    fm "$src" | sed -n 's/^tags:[[:space:]]*\[\(.*\)\][[:space:]]*$/\1/p' \
        | tr ',' '\n' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
        | while read -r t; do
              [ -n "$t" ] && printf '%s\n' "$(slugify "$t")" >> "$TMP/live_tags"
          done
done
sort -u -o "$TMP/live_slugs" "$TMP/live_slugs"
sort -u -o "$TMP/live_tags"  "$TMP/live_tags"

for f in notebook_pages/*.html; do
    [ -f "$f" ] || continue
    b=$(basename "$f" .html)
    case "$b" in
        notebook-page-*)  # index pagination - driven by post count, not by a source
            continue ;;
        tag-*)
            t=${b#tag-}; t=${t%%-page-[0-9]*}
            grep -qxF "$t" "$TMP/live_tags" \
                || printf '%s   no live post carries tag "%s"\n' "$f" "$t" >> "$TMP/orphan" ;;
        *)
            grep -qxF "$b" "$TMP/live_slugs" \
                || printf '%s   source is draft, renamed or deleted\n' "$f" >> "$TMP/orphan" ;;
    esac
done

# release/<slug>.html <- input_release/*.json ("_" prefix = draft, as in the config)
: > "$TMP/live_releases"
for j in input_release/*.json input_release/*.jsonc; do
    [ -f "$j" ] || continue
    case "$(basename "$j")" in _*) continue ;; esac
    s=$(sed -n 's/.*"slug"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$j" | head -1)
    [ -z "$s" ] && s=$(slugify "$(sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$j" | head -1)")
    [ -n "$s" ] && printf '%s\n' "$s" >> "$TMP/live_releases"
done
sort -u -o "$TMP/live_releases" "$TMP/live_releases"
for f in release/*.html; do
    [ -f "$f" ] || continue
    b=$(basename "$f" .html)
    grep -qxF "$b" "$TMP/live_releases" \
        || printf '%s   no input_release/ json produces this slug\n' "$f" >> "$TMP/orphan"
done

# licence/<slug> <- input_legal/licenses/<slug> (extensionless raw texts)
for f in licence/*; do
    [ -f "$f" ] || continue
    [ -f "input_legal/licenses/$(basename "$f")" ] \
        || printf '%s   no matching input_legal/licenses/ text\n' "$f" >> "$TMP/orphan"
done

# ---------------------------------------------------------------------------
# Report.
# ---------------------------------------------------------------------------
printf '%sReferences%s\n' "$BLD" "$RST"
section "$TMP/missing" "broken references (missing file)"            error
section "$TMP/case"    "case-only mismatch (breaks on GitHub Pages)" error

section "$TMP/orphan"  "orphaned build output (still live, no live source)" error

printf '\n%sSize budgets%s\n' "$BLD" "$RST"
section "$TMP/big_used"   "images over ${IMG_MAX_KB} kB, used on a live page" warn
section "$TMP/big_svg"    "svg over ${SVG_MAX_KB} kB"                         warn
section "$TMP/heavy"      "pages referencing over ${PAGE_IMG_MAX_KB} kB of images" warn
section "$TMP/big_orphan" "images over ${IMG_MAX_KB} kB, referenced by nothing (repo bloat only)" warn

printf '\n%s---%s\n' "$DIM" "$RST"
if [ "$errors" -gt 0 ] || [ "$warnings" -gt 0 ]; then
    printf '%d error(s), %d warning(s)\n' "$errors" "$warnings"
    printf '%snotebook_pages/ and release/ are build output - fix findings there in\n' "$DIM"
    printf 'input_custom_html_pages/, input_markdown/, eleventy_njk/ or eleventy_settings/,\n'
    printf 'then rebuild with ./eleventy-linux-x64%s\n' "$RST"
else
    printf '%sAll checks passed.%s\n' "$GRN" "$RST"
fi

[ "$errors" -gt 0 ] && exit 1
exit 0
