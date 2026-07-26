#!/bin/bash
# ---------------------------------------------------------------------------
# healthcheck.sh - report-only sanity scan of the deployed site.
#
#   ./healthcheck.sh            full report
#   ./healthcheck.sh --quiet    only sections that found something
#
# Checks:
#   A. broken references  - src/href/srcset in HTML, url() in CSS
#   B. case-only mismatch - works on Windows, 404s on GitHub Pages
#   C. size budgets       - oversized images/svg, and per-page image weight
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
[ "$1" = "--quiet" ] && QUIET=1

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
    # src="..." and href="..."
    grep -noE '(src|href)="[^"]*"' "$f" 2>/dev/null \
      | sed -E 's/:(src|href)="/\t/; s/"$//' \
      | awk -F'\t' -v F="$f" 'NF==2 {print F "\t" $1 "\t" $2}' >> "$TMP/refs"

    # srcset="a.jpg 1x, b.jpg 2x" -> one row per candidate, descriptor dropped
    grep -noE 'srcset="[^"]*"' "$f" 2>/dev/null \
      | sed -E 's/:srcset="/\t/; s/"$//' \
      | awk -F'\t' -v F="$f" 'NF==2 {
            n = split($2, parts, ",")
            for (i = 1; i <= n; i++) {
                split(parts[i], tok, " ")
                gsub(/^[ \t]+|[ \t]+$/, "", tok[1])
                if (tok[1] != "") print F "\t" $1 "\t" tok[1]
            }
        }' >> "$TMP/refs"
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
    hit=$(find "$(dirname "$path")" -maxdepth 1 -iname "$(basename "$path")" 2>/dev/null | head -1)
    if [ -n "$hit" ]; then
        printf '%s:%s  %s\n        -> exists as %s\n' "$f" "$line" "$url" "${hit#./}" >> "$TMP/case"
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
        case "$rurl" in
            *.jpg|*.jpeg|*.png|*.gif|*.webp|*.svg|*.JPG|*.JPEG|*.PNG) ;;
            *) continue ;;
        esac
        c=${rurl%%\#*}; c=${c%%\?*}
        if [ "${c#/}" != "$c" ]; then p=".${c}"; else p="$(dirname "$f")/${c}"; fi
        [ -f "$p" ] && total=$(( total + $(stat -c%s "$p") ))
    done < "$TMP/refs"
    kb=$(( total / 1024 ))
    [ "$kb" -gt "$PAGE_IMG_MAX_KB" ] && printf '%6d KB  %s\n' "$kb" "$f" >> "$TMP/heavy"
done < "$TMP/pages"
sort -rn -o "$TMP/heavy" "$TMP/heavy" 2>/dev/null

# ---------------------------------------------------------------------------
# Report.
# ---------------------------------------------------------------------------
printf '%sReferences%s\n' "$BLD" "$RST"
section "$TMP/missing" "broken references (missing file)"            error
section "$TMP/case"    "case-only mismatch (breaks on GitHub Pages)" error

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
