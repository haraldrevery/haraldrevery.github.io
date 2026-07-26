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
#   A. broken references  - src/href/poster/srcset in HTML, url() in CSS
#   B. case-only mismatch - works on Windows, 404s on GitHub Pages
#   C. size budgets       - oversized images/svg, and per-page image weight
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
    'index','about','contact','music','notebook','discography','download','legal','404','h',
    'wallpaper_line','wallpaper_particles','wallpaper_plexus','wallpaper_topography'
)
$PAGE_DIRS = @('notebook_pages','release')
$CSS_FILES = @('main.css','prose.css')

# Directories skipped when hunting for oversized assets. Only things that are
# genuinely not served: tooling, backups and scaffolds. Generator output dirs
# like svg/python_generated_svg ARE deployed (the asset root is "./"), so they
# stay in scope - an unused 576 kB svg still ships to visitors. Top level only,
# matching the "-path ./x -prune" form in healthcheck.sh.
$SKIP_DIRS = @('node_modules','.git','page_builder','test_pages','notebook_templates',
               'css_bkup','eleventy_binary')

# Directories the "is this asset used anywhere?" fallback ignores. Deliberately
# a shorter list than $SKIP_DIRS, and matched at any depth - it mirrors the
# --exclude-dir flags on the grep in healthcheck.sh. See Test-Referenced.
$GREP_SKIP_DIRS = @('node_modules','.git','page_builder')
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
    # url(...) inside inline style attributes, e.g.
    #   style="background-image: url('/photos/audioplayer_texture1.jpg')"
    # music.html alone has four of these; without this pass they are invisible.
    for ($i = 0; $i -lt $lines.Length; $i++) {
        foreach ($m in $reUrl.Matches($lines[$i])) { Add-Ref $f ($i + 1) (Get-Capture $m) }
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

foreach ($r in $refs) {
    $url = $r.Url
    if (-not $url) { continue }
    if ($reExternal.IsMatch($url)) { continue }
    if ($url.StartsWith('/cdn-cgi/')) { continue }   # Cloudflare-injected runtime path, not a file

    $clean = $url.Split('#')[0].Split('?')[0]        # drop #fragment and ?query
    if (-not $clean) { continue }

    $res = Test-Ref (Resolve-RefPath $r.File $clean)
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
        if ($d -eq '.' -and ($SKIP_DIRS -contains [System.IO.Path]::GetFileName($sub))) { continue }
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
# Report.
# ---------------------------------------------------------------------------
Out-Line 'References' 'White'
Write-Section $missing              'broken references (missing file)'            'error'
Write-Section @($caseBad)           'case-only mismatch (breaks on GitHub Pages)' 'error'

Write-Host ''
Out-Line 'Size budgets' 'White'
Write-Section (Sort-Rows $bigUsed)   ("images over {0} kB, used on a live page" -f $IMG_MAX_KB)          'warn'
Write-Section (Sort-Rows $bigSvg)    ("svg over {0} kB" -f $SVG_MAX_KB)                                  'warn'
Write-Section (Sort-Rows $heavy)     ("pages referencing over {0} kB of images" -f $PAGE_IMG_MAX_KB)      'warn'
Write-Section (Sort-Rows $bigOrphan) ("images over {0} kB, referenced by nothing (repo bloat only)" -f $IMG_MAX_KB) 'warn'

Write-Host ''
Out-Line '---' 'DarkGray'
if ($script:errors -gt 0 -or $script:warnings -gt 0) {
    Write-Host ("{0} error(s), {1} warning(s)" -f $script:errors, $script:warnings)
    Out-Line 'notebook_pages/ and release/ are build output - fix findings there in' 'DarkGray'
    Out-Line 'input_custom_html_pages/, input_markdown/, eleventy_njk/ or eleventy_settings/,' 'DarkGray'
    Out-Line 'then rebuild with eleventy-win-x64.exe' 'DarkGray'
} else {
    Out-Line 'All checks passed.' 'Green'
}

if ($script:errors -gt 0) { exit 1 }
exit 0
