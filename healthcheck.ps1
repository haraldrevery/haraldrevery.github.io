#Requires -Version 5.1
# ---------------------------------------------------------------------------
# healthcheck.ps1 - report-only sanity scan of the deployed site. (Windows)
#
#   healthcheck.bat            full report
#   healthcheck.bat --quiet    only sections that found something
#
# This is the Windows twin of healthcheck.sh. Same scope, same thresholds, same
# findings, same exit codes - run either one and you should get the same report.
# Double-click healthcheck.bat, or run it from cmd/PowerShell in the site root.
#
# Checks:
#   A. broken references  - src/href/poster/srcset in HTML, url() in CSS, and
#                           every URL in sitemap.xml, feed.xml and
#                           search-index.json. Resolved the way GitHub Pages
#                           serves them, including https://haraldrevery.com/...
#   B. case-only mismatch - works on Windows, 404s on GitHub Pages
#   C. size budgets       - oversized images/svg, and per-page image weight
#   D. build output       - orphaned pages, sources that published nothing, and
#                           ?v= versions that no longer match the file
#
# Note on C: per-page image weight is an UPPER BOUND, not real transfer size.
# Every srcset candidate is summed on top of the <img src>, and an image used
# twice on a page counts twice. A browser downloads far less. Treat the number
# as "this page is carrying too much", not as a byte count.
#
# Note on B - and this is why a Windows version exists at all. NTFS is case
# insensitive, so Test-Path './Photos/X.JPG' happily succeeds for a file that
# is really ./photos/x.jpg, and GitHub Pages then 404s it. Every existence
# test below therefore goes through Test-Ref, which compares each path segment
# against the real on-disk name with an ordinal (case-sensitive) comparison.
# Never replace those calls with Test-Path - it would silently gut check B on
# the one platform where wrong-cased references are easiest to create.
#
# This script never writes, moves or deletes anything. Exit 1 if errors found.
# Thresholds and scope are the two blocks below - keep them in step with
# healthcheck.sh.
# ---------------------------------------------------------------------------

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

Set-Location -LiteralPath $PSScriptRoot
# The .NET current directory is independent of PowerShell's location, and the
# fast [System.IO.*] calls used throughout resolve relative paths against it.
# Without this line every one of them would look in the wrong folder.
[System.IO.Directory]::SetCurrentDirectory((Get-Location).ProviderPath)

# --- thresholds (override from the environment, e.g. set IMG_MAX_KB=500)
function Get-Threshold([string]$name, [int]$fallback) {
    $v = [Environment]::GetEnvironmentVariable($name)
    $n = 0
    if ($v -and [int]::TryParse($v, [ref]$n) -and $n -gt 0) { return $n }
    return $fallback
}
$IMG_MAX_KB      = Get-Threshold 'IMG_MAX_KB'      850
$SVG_MAX_KB      = Get-Threshold 'SVG_MAX_KB'      500
$PAGE_IMG_MAX_KB = Get-Threshold 'PAGE_IMG_MAX_KB' 8000

# --- scope -----------------------------------------------------------------
# Deployed pages only. Scaffolds and drafts are deliberately excluded: every
# broken image path in this repo lives in one, and including them buries the
# findings that matter. Add new sections here as the site grows.
$ROOT_PAGES = @(
    'index','about','contact','music','notebook','discography','download','legal','404','h'
)
$PAGE_DIRS = @('notebook_pages','release','h','clock','rvry_ascii','revery_notebook')
$CSS_FILES = @('main.css')
# Generated indexes: every URL in them must resolve like a link would.
$INDEX_FILES = @('sitemap.xml','feed.xml','search-index.json')
$SITE_ORIGIN = 'https://haraldrevery.com'

# Directories skipped when hunting for oversized assets. Only things that are
# genuinely not served: tooling, backups and scaffolds. Generator output dirs
# like svg/python_generated_svg ARE deployed (the asset root is "./"), so they
# stay in scope - an unused 576 kB svg still ships to visitors. Paths from the
# site root, matching the "-path ./x -prune" list in healthcheck.sh.
$SKIP_DIRS = @('node_modules','.git','page_builder_app_v2/node_modules',
               'page_builder_app_v2/src-tauri/target','revery_notebook/build_tools/node_modules',
               'test_pages','notebook_templates','css_bkup','eleventy_binary')

# Directories the "is this asset used anywhere?" fallback ignores. Deliberately
# a shorter list than $SKIP_DIRS, and matched at any depth - it mirrors the
# --exclude-dir flags on the grep in healthcheck.sh. See Test-Referenced.
$GREP_SKIP_DIRS = @('node_modules','.git','target')
$GREP_EXTS      = @('.html','.js','.css','.njk','.json','.jsonc','.md')

# --- output helpers --------------------------------------------------------
$script:UseColor = -not [Console]::IsOutputRedirected

function Out-Part([string]$Text, [string]$Color) {
    if ($Color -and $script:UseColor) { Write-Host $Text -ForegroundColor $Color -NoNewline }
    else { Write-Host $Text -NoNewline }
}
function Out-Line([string]$Text, [string]$Color) {
    if ($Color -and $script:UseColor) { Write-Host $Text -ForegroundColor $Color }
    else { Write-Host $Text }
}

$name = 'healthcheck.bat'
function Show-Usage {
    Write-Host "usage: $name [--quiet]"
    Write-Host ''
    Write-Host '  --quiet   print only the sections that found something'
    Write-Host '  --help    this message'
    Write-Host ''
    Write-Host 'Thresholds can be overridden from the environment:'
    Write-Host ("  IMG_MAX_KB={0}  SVG_MAX_KB={1}  PAGE_IMG_MAX_KB={2}" -f $IMG_MAX_KB, $SVG_MAX_KB, $PAGE_IMG_MAX_KB)
}

$QUIET = $false
if ($args.Count -gt 1) {
    [Console]::Error.WriteLine("${name}: too many arguments")
    [Console]::Error.WriteLine("usage: $name [--quiet]")
    exit 2
}
if ($args.Count -eq 1) {
    # Several spellings on purpose: --quiet keeps parity with healthcheck.sh,
    # but powershell.exe -File eats leading dashes in its own way depending on
    # how the .bat was invoked, so accept whatever actually arrives.
    $a = [string]$args[0]
    if     ($a -in @('--quiet','-quiet','/quiet','-q','quiet'))       { $QUIET = $true }
    elseif ($a -in @('--help','-help','/help','/?','-h','-?','help')) { Show-Usage; exit 0 }
    else {
        [Console]::Error.WriteLine("${name}: unknown option ""$a""")
        [Console]::Error.WriteLine("usage: $name [--quiet]")
        exit 2
    }
}

$script:errors   = 0
$script:warnings = 0

# section <findings> <label> <severity>  - print a findings list, or a pass line
function Write-Section([string[]]$Findings, [string]$Label, [string]$Severity) {
    $n = 0
    if ($Findings) { $n = $Findings.Count }
    if ($n -eq 0) {
        if (-not $QUIET) { Out-Part '  '; Out-Part 'ok' 'Green'; Out-Line ("    {0}" -f $Label) }
        return
    }
    Write-Host ''
    if ($Severity -eq 'error') {
        Out-Part '  '; Out-Part 'ERROR' 'Red'; Out-Line ("{0,4}  {1}" -f $n, $Label)
        $script:errors += $n
    } else {
        Out-Part '  '; Out-Part 'WARN' 'Yellow'; Out-Line ("{0,5}  {1}" -f $n, $Label)
        $script:warnings += $n
    }
    foreach ($line in $Findings) { Write-Host ('        ' + $line) }
}

# --- path helpers ----------------------------------------------------------
function ConvertTo-Rel([string]$p) {
    # ".\notebook_pages\x.html" -> "notebook_pages/x.html", so every path this
    # script prints or compares looks the same as it does on Linux.
    $r = $p -replace '\\','/'
    if ($r.StartsWith('./')) { $r = $r.Substring(2) }
    return $r
}

# Cache of directory listings: lowercased entry name -> real on-disk name.
# Test-Ref is called once per reference (thousands of them) and would otherwise
# re-enumerate the same handful of folders over and over.
$script:DirCache = @{}
function Get-DirEntries([string]$dir) {
    $key = $dir.ToLowerInvariant()
    if (-not $script:DirCache.ContainsKey($key)) {
        $map = @{}
        try {
            foreach ($e in [System.IO.Directory]::GetFileSystemEntries($dir)) {
                $n = [System.IO.Path]::GetFileName($e)
                $map[$n.ToLowerInvariant()] = $n
            }
        } catch { }
        $script:DirCache[$key] = $map
    }
    return $script:DirCache[$key]
}

# Test-Ref <relative path> - resolve a reference the way GitHub Pages would.
#
# Returns an object with:
#   Status = 'exact'   the file is there and the casing matches
#            'case'    it is there but under different casing -> 404 on Pages
#            'missing' no such file in any casing
#   Path   = the real on-disk path (relative, forward slashes) when found
#   IsFile = true when the resolved target is a file rather than a directory
#
# Compares segment by segment rather than probing only the basename, so a
# wrong-cased *directory* (./Photos/x.jpg) is reported as a case mismatch and
# not as a plain missing file - which would point at the wrong fix.
function Test-Ref([string]$path) {
    $rest = ($path -replace '\\','/')
    if ($rest.StartsWith('./')) { $rest = $rest.Substring(2) }
    $cur   = '.'
    $exact = $true
    foreach ($seg in $rest.Split('/')) {
        if ($seg -eq '' -or $seg -eq '.') { continue }
        if ($seg -eq '..') { $cur = "$cur/.."; continue }
        $entries = Get-DirEntries $cur
        $lower   = $seg.ToLowerInvariant()
        if (-not $entries.ContainsKey($lower)) {
            return [pscustomobject]@{ Status = 'missing'; Path = $null; IsFile = $false }
        }
        $real = $entries[$lower]
        if (-not [string]::Equals($real, $seg, [StringComparison]::Ordinal)) { $exact = $false }
        $cur = "$cur/$real"
    }
    $isFile = [System.IO.File]::Exists($cur)
    $status = 'case'
    if ($exact) { $status = 'exact' }
    return [pscustomobject]@{ Status = $status; Path = (ConvertTo-Rel $cur); IsFile = $isFile }
}

# ---------------------------------------------------------------------------
# Build the list of pages to scan.
# ---------------------------------------------------------------------------
$pages = New-Object System.Collections.Generic.List[string]
foreach ($p in $ROOT_PAGES) {
    if ([System.IO.File]::Exists("./$p.html")) { $pages.Add("$p.html") }
}
foreach ($d in $PAGE_DIRS) {
    if ([System.IO.Directory]::Exists("./$d")) {
        # Filter on the extension rather than passing a "*.html" search pattern:
        # Windows still matches short 8.3 aliases against wildcard patterns, so a
        # pattern can pull in files it visibly should not.
        foreach ($f in [System.IO.Directory]::EnumerateFiles("./$d")) {
            if ([System.IO.Path]::GetExtension($f).ToLowerInvariant() -eq '.html') {
                $pages.Add((ConvertTo-Rel $f))
            }
        }
    }
}
$pages = @($pages | Sort-Object -CaseSensitive)

Write-Host ''
Out-Line 'Harald Revery - site health check' 'White'
Out-Line ("{0} pages, {1}" -f $pages.Count, ($CSS_FILES -join ',')) 'DarkGray'
Write-Host ''

# ---------------------------------------------------------------------------
# Extract every local reference as file / line / url.
#
# Skipped: absolute URLs, protocol-relative, data:, mailto:, tel:, javascript:,
# bare #anchors, and url(#id) - those last are SVG gradient references inside
# main.css (e.g. url(#logoGradient_legacy)), not files. Without that exclusion
# the script reports phantom failures on its very first run.
# ---------------------------------------------------------------------------
# src="...", href="..." and poster="..." (video thumbnails - three of them are
# live). Both quote styles: the page builder emits double quotes today, but a
# single-quoted attribute would otherwise drop out of the scan silently. This
# also picks up data-src= and xlink:href= incidentally, because the pattern is
# unanchored. That is harmless - leave it.
$reAttr   = [regex]'(?:src|href|poster)=(?:"([^"]*)"|''([^'']*)'')'
$reSrcset = [regex]'srcset=(?:"([^"]*)"|''([^'']*)'')'
$reUrl    = [regex]'url\([''"]?([^)''"]+)[''"]?\)'
$reStyleUrl = [regex]'url\((?:[''"]|&#x27;|&#39;|&quot;|&#34;)?([^)''"&]+?)(?:[''"]|&#x27;|&#39;|&quot;|&#34;)?\)'
$reMeta     = [regex]'<meta[^>]*(?:og:image|twitter:image|og:url)"[^>]*content="([^"]*)"'
$reXmlUrl   = [regex]'<loc>([^<]*)</loc>|<link>([^<]*)</link>|<guid[^>]*>([^<]*)</guid>|<enclosure[^>]*url="([^"]*)"'
$reJsonUrl  = [regex]'"url":"([^"]*)"'

$refs = New-Object System.Collections.Generic.List[object]
function Add-Ref([string]$file, [int]$line, [string]$url) {
    if ($url) { $refs.Add([pscustomobject]@{ File = $file; Line = $line; Url = $url }) }
}
function Get-Capture($m) {
    if ($m.Groups[1].Success) { return $m.Groups[1].Value }
    if ($m.Groups.Count -gt 2 -and $m.Groups[2].Success) { return $m.Groups[2].Value }
    return ''
}

# Three separate passes over each file, in this order, because healthcheck.sh
# runs three greps per file and the case-mismatch findings are printed in the
# order they were collected. Interleaving them per line would list the same
# findings in a different order and the two reports would stop matching.
foreach ($f in $pages) {
    $lines = [System.IO.File]::ReadAllLines($f)

    for ($i = 0; $i -lt $lines.Length; $i++) {
        foreach ($m in $reAttr.Matches($lines[$i])) { Add-Ref $f ($i + 1) (Get-Capture $m) }
    }
    # srcset="a.jpg 1x, b.jpg 2x" -> one row per candidate, descriptor dropped
    for ($i = 0; $i -lt $lines.Length; $i++) {
        foreach ($m in $reSrcset.Matches($lines[$i])) {
            foreach ($part in (Get-Capture $m).Split(',')) {
                # -split '\s+', not .Split(' '): a tab between the candidate and
                # its descriptor has to separate them too, as awk's split does.
                $cand = ($part.Trim() -split '\s+')[0]
                Add-Ref $f ($i + 1) $cand
            }
        }
    }
    # Share images and the page's own address: <meta property="og:image">,
    # <meta name="twitter:image">, <meta property="og:url">. Absolute URLs, made
    # local by the origin pass below. A quote must follow the property name, so
    # og:image:width/height/alt are not taken for file references.
    for ($i = 0; $i -lt $lines.Length; $i++) {
        foreach ($m in $reMeta.Matches($lines[$i])) { Add-Ref $f ($i + 1) $m.Groups[1].Value }
    }
    # url(...) inside inline style attributes, e.g.
    #   style="background-image: url('/photos/audioplayer_texture1.jpg')"
    # music.html alone has four of these; without this pass they are invisible.
    # The quote may be an HTML entity (the page builder emits url(&#x27;...&#x27;)).
    for ($i = 0; $i -lt $lines.Length; $i++) {
        foreach ($m in $reStyleUrl.Matches($lines[$i])) { Add-Ref $f ($i + 1) $m.Groups[1].Value }
    }
}

# The generated indexes. A URL in the sitemap, the feed or the search index is
# a promise that the page exists, and each is built from a hand-kept list or
# from front matter - a typo there published a dead URL with no other check
# noticing.
foreach ($x in $INDEX_FILES) {
    if (-not [System.IO.File]::Exists("./$x")) { continue }
    $re = $reXmlUrl
    if ($x.EndsWith('.json')) { $re = $reJsonUrl }
    $lineNo = 0
    foreach ($text in [System.IO.File]::ReadLines("./$x")) {
        $lineNo++
        foreach ($m in $re.Matches($text)) {
            foreach ($g in 1..4) {
                if ($m.Groups.Count -gt $g -and $m.Groups[$g].Success) { Add-Ref $x $lineNo $m.Groups[$g].Value; break }
            }
        }
    }
}

# url(...) in the compiled stylesheets
foreach ($c in $CSS_FILES) {
    if (-not [System.IO.File]::Exists("./$c")) { continue }
    $lineNo = 0
    foreach ($text in [System.IO.File]::ReadLines("./$c")) {
        $lineNo++
        foreach ($m in $reUrl.Matches($text)) { Add-Ref $c $lineNo (Get-Capture $m) }
    }
}

# The site's own absolute URLs are local paths - a canonical, og:url, sitemap
# or search-index typo used to pass as "external".
foreach ($r in $refs) {
    if ($r.Url -eq $SITE_ORIGIN) { $r.Url = '/' }
    elseif ($r.Url.StartsWith($SITE_ORIGIN + '/', [StringComparison]::Ordinal)) { $r.Url = $r.Url.Substring($SITE_ORIGIN.Length) }
}

$reExternal = [regex]'^(https?:|//|data:|mailto:|tel:|javascript:|#)'

# ---------------------------------------------------------------------------
# Check A + B: resolve each reference.
# ---------------------------------------------------------------------------
$missing = New-Object System.Collections.Generic.List[string]
$caseBad = New-Object System.Collections.Generic.List[string]

function Resolve-RefPath([string]$file, [string]$clean) {
    if ($clean.StartsWith('/')) { return '.' + $clean }   # site-absolute
    $dir = [System.IO.Path]::GetDirectoryName($file)      # relative to the containing file
    if (-not $dir) { return "./$clean" }
    return (ConvertTo-Rel $dir) + '/' + $clean
}

# Resolve-Served <path> - what GitHub Pages answers for it (measured live
# 2026-09-28 against /music, /music/, /download/, /release/, /clock):
#   ends in /  ->  <path>index.html, or nothing. A folder is not a page.
#   otherwise  ->  the file itself; else <path>.html - even when a folder of the
#                  same name exists, which is the only reason /music works next
#                  to music/ (keep music.html, or every /music link 404s);
#                  else <path>/index.html (Pages redirects /x to /x/).
# Returns a Test-Ref result: 'exact' when served, 'case' when it only would be
# with different casing, else 'missing'. This used to accept ANY existing
# directory: /download/ and /release/ (both 404 live) passed.
function Resolve-Served([string]$path) {
    if ($path.EndsWith('/')) { $cands = @($path + 'index.html') }
    else { $cands = @($path, ($path + '.html'), ($path + '/index.html')) }
    $caseHit = $null
    foreach ($c in $cands) {
        $t = Test-Ref $c
        if (-not $t.IsFile) { continue }
        if ($t.Status -eq 'exact') { return $t }
        if ($t.Status -eq 'case' -and $null -eq $caseHit) { $caseHit = $t }
    }
    if ($null -ne $caseHit) { return $caseHit }
    return [pscustomobject]@{ Status = 'missing'; Path = $null; IsFile = $false }
}

foreach ($r in $refs) {
    $url = $r.Url
    if (-not $url) { continue }
    if ($reExternal.IsMatch($url)) { continue }
    if ($url.StartsWith('/cdn-cgi/')) { continue }   # Cloudflare-injected runtime path, not a file

    $clean = $url.Split('#')[0].Split('?')[0]        # drop #fragment and ?query
    if (-not $clean) { continue }
    # Percent-decode before comparing against the disk. markdown-it encodes every
    # non-ASCII character in a link, so a real file named "sn<o-slash>hetta.jpg" arrives
    # as "sn%C3%B8hetta.jpg" - this script reported it missing (3 false errors
    # on the image grid stress test) until 2026-09. The encoded URL is correct
    # and stays in the HTML; only this lookup decodes it.
    if ($clean.Contains('%')) { $clean = [System.Uri]::UnescapeDataString($clean) }

    $path = Resolve-RefPath $r.File $clean
    $res = Resolve-Served $path
    if ($res.Status -eq 'exact') { continue }

    # One line per finding - Write-Section counts findings by list length, and
    # the shell twin counts them with wc -l, so a two-line entry here would
    # report (and charge to the error count) double.
    # The extra parens around each -f are load-bearing: inside a method call's
    # argument list a bare comma would be read as an argument separator.
    if ($res.Status -eq 'case') {
        $caseBad.Add(("{0}:{1}  {2}  ->  exists as {3}" -f $r.File, $r.Line, $url, $res.Path))
    } else {
        $missing.Add(("{0}:{1}  {2}" -f $r.File, $r.Line, $url))
    }
}
$missing = @($missing | Sort-Object -CaseSensitive -Unique)

# ---------------------------------------------------------------------------
# Check C: size budgets.
# ---------------------------------------------------------------------------
# Every asset actually referenced by a live page, for the referenced/orphan split.
$referenced = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($r in $refs) {
    $u = $r.Url
    if (-not $u) { continue }
    $u = $u.Split('#')[0].Split('?')[0]
    if (-not $u -or $reExternal.IsMatch($u)) { continue }
    if ($u.StartsWith('/'))  { $u = $u.Substring(1) }
    if ($u.StartsWith('./')) { $u = $u.Substring(2) }
    if ($u) { [void]$referenced.Add($u.ToLowerInvariant()) }
}

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
#
# Built once into a single string rather than re-scanned per asset: the shell
# twin can afford a fresh "grep -r" for every oversized file, Select-String in a
# loop cannot.
$script:corpus = $null
function Get-Corpus {
    if ($null -ne $script:corpus) { return $script:corpus }
    $sb = New-Object System.Text.StringBuilder
    $stack = New-Object System.Collections.Generic.Stack[string]
    $stack.Push('.')
    while ($stack.Count -gt 0) {
        $d = $stack.Pop()
        foreach ($sub in [System.IO.Directory]::EnumerateDirectories($d)) {
            $leaf = [System.IO.Path]::GetFileName($sub)
            if ($GREP_SKIP_DIRS -contains $leaf) { continue }   # at any depth, like --exclude-dir
            $stack.Push($sub)
        }
        foreach ($file in [System.IO.Directory]::EnumerateFiles($d)) {
            if ($GREP_EXTS -notcontains [System.IO.Path]::GetExtension($file).ToLowerInvariant()) { continue }
            try { [void]$sb.AppendLine([System.IO.File]::ReadAllText($file)) } catch { }
        }
    }
    $script:corpus = $sb.ToString()
    return $script:corpus
}

function Test-Referenced([string]$rel) {
    if ($referenced.Contains($rel.ToLowerInvariant())) { return $true }
    $base = [System.IO.Path]::GetFileName($rel)
    return (Get-Corpus).Contains($base)          # ordinal, case-sensitive - like grep -F
}

# Walk the tree once, pruning the same top-level directories the shell twin does.
$assets = New-Object System.Collections.Generic.List[object]
$stack  = New-Object System.Collections.Generic.Stack[string]
$stack.Push('.')
while ($stack.Count -gt 0) {
    $d = $stack.Pop()
    foreach ($sub in [System.IO.Directory]::EnumerateDirectories($d)) {
        if ($SKIP_DIRS -contains (ConvertTo-Rel $sub)) { continue }
        $stack.Push($sub)
    }
    foreach ($file in [System.IO.Directory]::EnumerateFiles($d)) { $assets.Add($file) }
}

$IMG_EXTS = @('.jpg','.jpeg','.png','.gif','.webp')
$bigUsed   = New-Object System.Collections.Generic.List[object]
$bigOrphan = New-Object System.Collections.Generic.List[object]
$bigSvg    = New-Object System.Collections.Generic.List[object]

foreach ($file in $assets) {
    $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
    $isImg = $IMG_EXTS -contains $ext
    $isSvg = $ext -eq '.svg'
    if (-not $isImg -and -not $isSvg) { continue }

    $len = (New-Object System.IO.FileInfo $file).Length
    $kb  = [int][Math]::Floor($len / 1024)
    $rel = ConvertTo-Rel $file

    if ($isImg -and $len -gt ($IMG_MAX_KB * 1024)) {
        $row = [pscustomobject]@{ KB = $kb; Text = ("{0,6} KB  {1}" -f $kb, $rel) }
        if (Test-Referenced $rel) { $bigUsed.Add($row) } else { $bigOrphan.Add($row) }
    }
    if ($isSvg -and $len -gt ($SVG_MAX_KB * 1024)) {
        $bigSvg.Add([pscustomobject]@{ KB = $kb; Text = ("{0,6} KB  {1}" -f $kb, $rel) })
    }
}

function Sort-Rows($rows) {
    if (-not $rows -or $rows.Count -eq 0) { return @() }
    return @($rows | Sort-Object -Property KB, Text -Descending | ForEach-Object { $_.Text })
}

# Per-page total image weight. See the header note: this is an upper bound.
# Every srcset candidate is added on top of the <img src> and a repeated image
# counts twice, which is deliberate and matches healthcheck.sh.
$byPage = @{}
foreach ($r in $refs) {
    if (-not $byPage.ContainsKey($r.File)) { $byPage[$r.File] = New-Object System.Collections.Generic.List[object] }
    $byPage[$r.File].Add($r)
}

$WEIGHT_EXTS = @('.jpg','.jpeg','.png','.gif','.webp','.svg')
$heavy = New-Object System.Collections.Generic.List[object]
foreach ($f in $pages) {
    if (-not $byPage.ContainsKey($f)) { continue }
    $total = [int64]0
    foreach ($r in $byPage[$f]) {
        $u = $r.Url
        if (-not $u -or $reExternal.IsMatch($u)) { continue }
        # Strip #fragment/?query first, then match the extension case
        # insensitively - photo.JPG and anything carrying a ?query must count.
        $c = $u.Split('#')[0].Split('?')[0]
        if ($WEIGHT_EXTS -notcontains [System.IO.Path]::GetExtension($c).ToLowerInvariant()) { continue }
        # Test-Ref, not Test-Path: a wrong-cased reference is already an ERROR
        # above and contributes nothing on Linux, so it must contribute nothing
        # here either or the two scripts would disagree on page weight.
        $res = Test-Ref (Resolve-RefPath $f $c)
        if ($res.Status -eq 'exact' -and $res.IsFile) {
            $total += (New-Object System.IO.FileInfo ('./' + $res.Path)).Length
        }
    }
    $kb = [int][Math]::Floor($total / 1024)
    if ($kb -gt $PAGE_IMG_MAX_KB) {
        $heavy.Add([pscustomobject]@{ KB = $kb; Text = ("{0,6} KB  {1}" -f $kb, $f) })
    }
}

# ---------------------------------------------------------------------------
# Orphaned build output. Ported from healthcheck.sh in 2026-09: until then this
# script had no such section, so on Windows a drafted, renamed or deleted post
# stayed live with nothing saying so.
#
# Eleventy's output dir IS the repo root, so the build only ever writes - it
# never deletes. Set `draft: true` on a published post and the already-generated
# notebook_pages/<slug>.html stays on disk, live and reachable. Same for a tag
# page whose last post went draft, a renamed/deleted source, release/ pages and
# licence/ texts. Report-only: it names the files, you delete them.
# ---------------------------------------------------------------------------
$orphan      = New-Object System.Collections.Generic.List[string]
$unpublished = New-Object System.Collections.Generic.List[string]

# Mirrors the "slugify" filter in eleventy.config.js, which is ASCII-only (\w):
# "<A-ring>ngstr<o-umlaut>m" -> "ngstrm" there and here. -creplace: -replace ignores case.
function ConvertTo-Slug([string]$s) {
    $s = $s.ToLowerInvariant() -creplace '[^a-z0-9_ -]', ''
    return ($s -creplace '\s+', '-') -creplace '-+', '-'
}

# Front matter lines of a source file (the block between the first two ---).
function Get-FrontMatter([string]$file) {
    $out = New-Object System.Collections.Generic.List[string]
    $lines = [System.IO.File]::ReadAllLines($file)
    if ($lines.Length -eq 0 -or -not $lines[0].TrimStart([char]0xFEFF).StartsWith('---')) { return ,$out.ToArray() }
    for ($i = 1; $i -lt $lines.Length; $i++) {
        if ($lines[$i].StartsWith('---')) { break }
        $out.Add($lines[$i])
    }
    return ,$out.ToArray()
}
function Test-Draft([string[]]$fm) {
    foreach ($l in $fm) { if ($l -match '^draft:\s*true\s*$') { return $true } }
    return $false
}
# All three YAML shapes: tags: [a, b] / tags: a / "tags:" then "- a" lines.
function Get-Tags([string[]]$fm) {
    $tags = New-Object System.Collections.Generic.List[string]
    $list = $false
    foreach ($l in $fm) {
        if ($l -match '^tags:\s*\[(.*)\]\s*$') { foreach ($t in $Matches[1].Split(',')) { $tags.Add($t.Trim()) }; $list = $false; continue }
        if ($l -match '^tags:\s*$') { $list = $true; continue }
        if ($list -and $l -match '^\s*-\s*(.*)$') { $tags.Add($Matches[1].Trim()); continue }
        $list = $false
        if ($l -match '^tags:\s*(\S.*)$') { $tags.Add($Matches[1].Trim()) }
    }
    return ,$tags.ToArray()
}
function Get-Files([string]$dir, [string[]]$exts) {
    if (-not [System.IO.Directory]::Exists("./$dir")) { return @() }
    return @([System.IO.Directory]::EnumerateFiles("./$dir") |
        Where-Object { $exts -contains [System.IO.Path]::GetExtension($_).ToLowerInvariant() } |
        ForEach-Object { ConvertTo-Rel $_ } | Sort-Object -CaseSensitive)
}

$liveSlugs = New-Object 'System.Collections.Generic.HashSet[string]'
$liveTags  = New-Object 'System.Collections.Generic.HashSet[string]'
$sources = @(Get-Files 'input_markdown' @('.md')) + @(Get-Files 'input_custom_html_pages' @('.html')) +
           @(Get-Files 'input_custom_post' @('.html'))
foreach ($src in $sources) {
    $fm = Get-FrontMatter $src
    if (Test-Draft $fm) { continue }
    $slug = [System.IO.Path]::GetFileNameWithoutExtension($src)
    [void]$liveSlugs.Add($slug)
    foreach ($t in (Get-Tags $fm)) { if ($t) { [void]$liveTags.Add((ConvertTo-Slug $t)) } }
    # The reverse check: a LIVE source that published no page at all. Likely
    # cause: a binary compiled before its input folder existed.
    if (-not [System.IO.File]::Exists("./notebook_pages/$slug.html")) {
        $unpublished.Add(("{0}   published no page - rebuild, and if that does not fix it, recompile the binary" -f $src))
    }
}

foreach ($f in (Get-Files 'notebook_pages' @('.html'))) {
    # Moved-page stubs from eleventy_njk/redirects.njk have no source by design.
    if ([System.IO.File]::ReadAllText($f) -match '(?i)http-equiv="refresh"') { continue }
    $b = [System.IO.Path]::GetFileNameWithoutExtension($f)
    if ($b.StartsWith('notebook-page-')) { continue }   # index pagination
    if ($b.StartsWith('tag-')) {
        $t = $b.Substring(4) -creplace '-page-[0-9].*$', ''
        if (-not $liveTags.Contains($t)) { $orphan.Add(("{0}   no live post carries tag ""{1}""" -f $f, $t)) }
    } elseif (-not $liveSlugs.Contains($b)) {
        $orphan.Add(("{0}   source is draft, renamed or deleted" -f $f))
    }
}

# release/<slug>.html <- input_release/*.json ("_" prefix = draft, as in the config)
$liveReleases = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($j in (Get-Files 'input_release' @('.json','.jsonc'))) {
    if ([System.IO.Path]::GetFileName($j).StartsWith('_')) { continue }
    $text = [System.IO.File]::ReadAllText($j)
    $s = ''
    $m = [regex]::Match($text, '"slug"\s*:\s*"([^"]*)"')
    if ($m.Success) { $s = $m.Groups[1].Value }
    else {
        $m = [regex]::Match($text, '"name"\s*:\s*"([^"]*)"')
        if ($m.Success) { $s = ConvertTo-Slug $m.Groups[1].Value }
    }
    if ($s) { [void]$liveReleases.Add($s) }
}
foreach ($f in (Get-Files 'release' @('.html'))) {
    if (-not $liveReleases.Contains([System.IO.Path]::GetFileNameWithoutExtension($f))) {
        $orphan.Add(("{0}   no input_release/ json produces this slug" -f $f))
    }
}

# licence/<slug>.txt <- input_legal/licenses/<slug>. A licence/ file without
# .txt is from before 2026-09, when the texts were published extensionless and
# so were downloaded instead of shown.
if ([System.IO.Directory]::Exists('./licence')) {
    foreach ($f in @([System.IO.Directory]::EnumerateFiles('./licence') | ForEach-Object { ConvertTo-Rel $_ } | Sort-Object -CaseSensitive)) {
        $b = [System.IO.Path]::GetFileName($f)
        if ($b.EndsWith('.txt')) {
            if (-not [System.IO.File]::Exists("./input_legal/licenses/" + $b.Substring(0, $b.Length - 4))) {
                $orphan.Add(("{0}   no matching input_legal/licenses/ text" -f $f))
            }
        } else {
            $orphan.Add(("{0}   no longer published (the build writes licence/<name>.txt)" -f $f))
        }
    }
}

# ---------------------------------------------------------------------------
# ?v= versions. Pages link /main.css?v=<first 10 hex of its SHA-256> (see
# _data/assets.js) so a changed stylesheet is a new URL: CSS is cached for 186
# days. A version that no longer matches the file means that page still points
# visitors at the OLD cached stylesheet. Eleventy pages: rebuild (build.bat
# builds the CSS first, then the pages). Hand-written pages (h/1dgraph.html,
# h/2dphaseportrait.html): paste the version shown here into the link. Only
# content hashes are judged: clock/ and the wallpaper pages bump a date by hand.
# ---------------------------------------------------------------------------
$staleVer = New-Object System.Collections.Generic.List[string]
$vhash = @{}
$sha = [System.Security.Cryptography.SHA256]::Create()
foreach ($r in $refs) {
    $u = $r.Url
    if (-not $u -or -not $u.Contains('?v=') -or $reExternal.IsMatch($u)) { continue }
    $want = ($u.Substring($u.IndexOf('?v=') + 3) -split '[&#]')[0]
    if ($want -cnotmatch '^[0-9a-f]{10}$') { continue }
    $res = Test-Ref (Resolve-RefPath $r.File $u.Split('?')[0])
    if ($res.Status -ne 'exact' -or -not $res.IsFile) { continue }   # missing: already an error
    if (-not $vhash.ContainsKey($res.Path)) {
        $bytes = [System.IO.File]::ReadAllBytes('./' + $res.Path)
        $vhash[$res.Path] = (-join ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })).Substring(0, 10)
    }
    if ($vhash[$res.Path] -cne $want) {
        $staleVer.Add(("{0}:{1}  {2}  ->  current is ?v={3}" -f $r.File, $r.Line, $u, $vhash[$res.Path]))
    }
}

# ---------------------------------------------------------------------------
# Report.
# ---------------------------------------------------------------------------
Out-Line 'References' 'White'
Write-Section $missing              'broken references (missing file)'            'error'
Write-Section @($caseBad)           'case-only mismatch (breaks on GitHub Pages)' 'error'

Write-Section @($orphan)            'orphaned build output (still live, no live source)' 'error'
Write-Section @($unpublished)       'live source that published no page (stale binary?)' 'error'
Write-Section @($staleVer)          'stale ?v= (page points at an old cached stylesheet)' 'warn'

Write-Host ''
Out-Line 'Size budgets' 'White'
Write-Section (Sort-Rows $bigUsed)   ("images over {0} kB, used on a live page" -f $IMG_MAX_KB)          'warn'
Write-Section (Sort-Rows $bigSvg)    ("svg over {0} kB" -f $SVG_MAX_KB)                                  'warn'
Write-Section (Sort-Rows $heavy)     ("pages referencing over {0} kB of images" -f $PAGE_IMG_MAX_KB)      'warn'
Write-Section (Sort-Rows $bigOrphan) ("images over {0} kB, referenced by nothing (still publicly served)" -f $IMG_MAX_KB) 'warn'

Write-Host ''
Out-Line '---' 'DarkGray'
if ($script:errors -gt 0 -or $script:warnings -gt 0) {
    Write-Host ("{0} error(s), {1} warning(s)" -f $script:errors, $script:warnings)
    Out-Line 'notebook_pages/ and release/ are build output - fix findings there in' 'DarkGray'
    Out-Line 'input_custom_html_pages/, input_markdown/, input_custom_post/, eleventy_njk/' 'DarkGray'
    Out-Line 'or eleventy_settings/, then rebuild with build.bat' 'DarkGray'
} else {
    Out-Line 'All checks passed.' 'Green'
}

if ($script:errors -gt 0) { exit 1 }
exit 0
