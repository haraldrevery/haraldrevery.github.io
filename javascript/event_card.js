(function () {
'use strict';


/* ─── TEXTURE IMAGE PATHS & OPACITY ───────────────────────── */
var TEXTURE_SRCS = [
    '/photos/audioplayer_texture0.jpg',
    '/photos/audioplayer_texture1.jpg',
    '/photos/audioplayer_texture2.jpg',
    '/photos/bgtexture2.jpg',
    '/photos/bgtexture0.jpg',
    '/photos/audioplayer_texture3.jpg',
]; 
var TEXTURE_OPACITY = 0.05;
var _textureImage = null;

var padRatio    = document.getElementById('ecm-pad-ratio');      // NEW
var padRatioVal = document.getElementById('ecm-pad-ratio-val');  // NEW
var showTitleRow= document.getElementById('ecm-show-title-row'); // NEW

/* ─── STATE (Adjust Defaults Here) ───────────────────────── */
var S = {
    title:      '',
    showTitle:  true,          // NEW
    author:     '',            
    desc:       '',
    date:       new Date(),
    theme:      'dark',
    lang:       'en',          
    align:      'left',        
    authorPos:  'opposite',    // NEW: Author position
    graphic:    'ring',
    columns:    '1',           // NEW: Columns toggle
    texture:    false,         
    justify:    true,         
    fontScale:  1.5,           
    padScale:   1.0,           
    titleColor: '#ffffff',
    dateColor:  '#a1a1a1',     
    formatId:   'landscape',
    calView:    new Date(),
    padRatio:   0.0,           // NEW
    fileType:   'jpg'         
};

// NEW: Store colors so they persist when toggling between themes
var themeColors = {
    dark:  { title: '#ffffff', date: '#a1a1a1' },
    light: { title: '#000000', date: '#666666' }
};

/* ─── DATA ───────────────────────────────────────────────── */
var FORMATS = [
    { id: '720p', label: '16:9 720p',              w: 1280, h: 720  },
    { id: '720p_vert',  label: '9:16 720p',        w: 720,  h: 1280 },
    { id: '1080p', label: '16:9 1080p',              w: 1920, h: 1080  },
    { id: '1080p_vert',  label: '9:16 1080p',        w: 1080,  h: 1920 },
    { id: '1440p', label: '16:9 2K / 2160p',              w: 2560, h: 1440  },
    { id: '1440p_vert',  label: '9:16 2K / 2160p',        w: 1440,  h: 2560 },
    { id: '2160p', label: '16:9 4K / 2160p',              w: 3840, h: 2160  },
    { id: '2160p_vert',  label: '9:16 4K / 2160p',        w: 2160,  h: 3840 },
    { id: 'biz',       label: 'Business',      w: 1050, h: 600  },
    { id: 'banner',    label: 'Banner',        w: 1600, h: 400  },
    { id: 'a6',        label: 'A6',            w: 1240, h: 1748 },
    { id: 'a5',        label: 'A5',            w: 1748, h: 2480 },
    { id: 'a4',        label: 'A4',            w: 2480, h: 3508 },
    { id: 'a3',        label: 'A3',            w: 3508, h: 4961 },
    { id: 'sq',        label: 'Square',         w: 1600, h: 1600 },
    { id: 'a6_ls',     label: 'A6 Land.',       w: 1748, h: 1240 },
    { id: 'a5_ls',     label: 'A5 Land.',       w: 2480, h: 1748 },
    { id: 'a4_ls',     label: 'A4 Land.',       w: 3508, h: 2480 },
    { id: 'a3_ls',     label: 'A3 Land.',       w: 4961, h: 3508 },
    { id: 'letter',    label: 'US Letter',      w: 2550, h: 3300 }
];

/* ─── DYNAMIC LOGO SVG LOADER ────────────────────────────── */
var LOGO_SRCS = [
    { src: '/svg/haraldreverylogo.svg', scale: 1.8 }, // 1.8 was your original default scale
    { src: '/svg/haraldreverytextlogo.svg', scale: 4.4 }, 
    { src: '/svg/mountain_topology1.svg',  scale: 8.2 },  
    { src: '/svg/mountain_topology3.svg',  scale: 8.2 },  
    { src: '/svg/mountain_dotted_transparent.svg',  scale: 8.2 } 
];
var _currentLogoIdx = 0;
var _rawLogoSvg = null;
var _coloredLogoImg = new Image();
var _coloredLogoHex = null;
var _lastBlobUrl = null;

// Helper to fetch the raw SVG
function loadLogoSvg(src) {
    fetch(src)
        .then(function(res) { return res.text(); })
        .then(function(text) { 
            _rawLogoSvg = text;
            _coloredLogoHex = null; // Force regeneration of the blob URL
            updateColoredLogo(S.titleColor); 
        });
}

// Fetch the initial raw SVG on load
loadLogoSvg(LOGO_SRCS[_currentLogoIdx].src);

function updateColoredLogo(hexColor) {
    if (!_rawLogoSvg || _coloredLogoHex === hexColor) return;
    
    // Inject CSS to force the SVG into an outline with the chosen color ("stroke-width: 3px" sets the lines thickness)
    var styledSvg = _rawLogoSvg.replace(
        /(<svg[^>]*>)/i,
        '$1<style>path, circle, rect, polygon, polyline { fill: none !important; stroke: ' + hexColor + ' !important; stroke-width: 3px !important; vector-effect: non-scaling-stroke !important; }</style>'
    );
    
    var blob = new Blob([styledSvg], {type: 'image/svg+xml;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    
    _coloredLogoImg.onload = function() {
        scheduleRedraw();
        // Clean up memory
        if (_lastBlobUrl) URL.revokeObjectURL(_lastBlobUrl);
        _lastBlobUrl = url;
    };
    _coloredLogoImg.src = url;
    _coloredLogoHex = hexColor;
}


var DAYS_SHORT_EN = ['Su','Mo','Tu','We','Th','Fr','Sa'];
var DAYS_FULL_EN  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var MONTHS_EN     = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

var DAYS_SHORT_SV = ['Sö','Må','Ti','On','To','Fr','Lö'];
var DAYS_FULL_SV  = ['Söndag','Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag'];
var MONTHS_SV     = ['Januari','Februari','Mars','April','Maj','Juni',
                     'Juli','Augusti','September','Oktober','November','December'];

function pad(n)  { return String(n).padStart(2,'0'); }
function pad4(n) { return String(n).padStart(4,'0'); }
function ordinal(n) {
    var s=['th','st','nd','rd'], v=n%100;
    return n+(s[(v-20)%10]||s[v]||s[0]);
}
function fmtDate(d, lang) {
    if (lang === 'sv') {
        return DAYS_FULL_SV[d.getDay()] + ' den ' + d.getDate() + ' ' + MONTHS_SV[d.getMonth()] + ' ' + d.getFullYear();
    }
    return DAYS_FULL_EN[d.getDay()] + ', ' +
           ordinal(d.getDate()) + ' ' +
           MONTHS_EN[d.getMonth()] + ' ' +
           d.getFullYear();
}

/* ─── STYLE MULTIPLIERS ──────────────────────────────────── */
var STYLE = {
    tracking: 0.10,      // The 0.12 you see for letter spacing
    lineHeight: 1.01,    // The 1.12 you see for row spacing
    bannerBody: 0.12,    // The 0.12 used for banner font scaling
    separatorOp: 0.3,     // Opacity for the line under the title
    listGap: -0.7        // Gap between the list elements in a list
};

/* ─── DOM REFS ───────────────────────────────────────────── */
var overlay    = document.getElementById('ecm-overlay');
var closeBtn   = document.getElementById('ecm-close');
var titleInput = document.getElementById('ecm-title');
var authorInput = document.getElementById('ecm-author');
var descInput  = document.getElementById('ecm-desc');
var calEl      = document.getElementById('ecm-cal');
var themeRow   = document.getElementById('ecm-theme-row');
var langRow    = document.getElementById('ecm-lang-row');
var texRow     = document.getElementById('ecm-texture-row');
var justRow    = document.getElementById('ecm-justify-row');
var colTitle   = document.getElementById('ecm-color-title');
var colDate    = document.getElementById('ecm-color-date');
var fontScale  = document.getElementById('ecm-font-scale');
var scaleVal   = document.getElementById('ecm-font-scale-val');
var formatsEl  = document.getElementById('ecm-formats');
var previewWrap= document.getElementById('ecm-preview-wrap');
var canvas     = document.getElementById('ecm-canvas');
var exportBtn  = document.getElementById('ecm-export-btn');
var clockDate  = document.getElementById('clock-date');
var padScale    = document.getElementById('ecm-pad-scale');      // NEW
var padScaleVal = document.getElementById('ecm-pad-scale-val');  // NEW
var alignRow    = document.getElementById('ecm-align-row');      // NEW

/* ─── OPEN / CLOSE ───────────────────────────────────────── */
clockDate.addEventListener('click', function () {
    overlay.classList.add('active');
    setTimeout(redrawPreview, 60); 
});
closeBtn.addEventListener('click', function () {
    overlay.classList.remove('active');
});
overlay.addEventListener('click', function (e) {
    if (e.target === overlay) overlay.classList.remove('active');
});

/* ─── INPUTS & COLORS ────────────────────────────────────── */
titleInput.addEventListener('input', function () { S.title = titleInput.value; scheduleRedraw(); });
authorInput.addEventListener('input', function () { S.author = authorInput.value; scheduleRedraw(); }); 
descInput.addEventListener('input',  function () { S.desc = descInput.value; scheduleRedraw(); });

colTitle.addEventListener('input', function() { 
    S.titleColor = colTitle.value; 
    themeColors[S.theme].title = S.titleColor; // Remember user choice
    updateColoredLogo(S.titleColor); // <--- ADDED THIS
    scheduleRedraw(); 
});
colDate.addEventListener('input',  function() { 
    S.dateColor = colDate.value; 
    themeColors[S.theme].date = S.dateColor; // Remember user choice
    scheduleRedraw(); 
});

fontScale.addEventListener('input', function() { 
    S.fontScale = parseFloat(fontScale.value);
    scaleVal.textContent = S.fontScale.toFixed(2) + 'x';
    scheduleRedraw(); 
});
padScale.addEventListener('input', function() { 
    S.padScale = parseFloat(padScale.value);
    padScaleVal.textContent = S.padScale.toFixed(2) + 'x';
    scheduleRedraw(); 
});
padRatio.addEventListener('input', function() { // NEW
    S.padRatio = parseFloat(padRatio.value);
    padRatioVal.textContent = (S.padRatio > 0 ? '+' : '') + S.padRatio.toFixed(2);
    scheduleRedraw(); 
});

setupToggleGroup(showTitleRow, 'showTitle'); // NEW

/* ─── UI TOGGLES ─────────────────────────────────────────── */
function setupToggleGroup(container, stateKey, callback) {
    container.querySelectorAll('.ecm-toggle-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            container.querySelectorAll('.ecm-toggle-btn').forEach(function(b){ b.classList.remove('active'); });
            btn.classList.add('active');
            var val = btn.dataset[stateKey];
            S[stateKey] = (val === 'true') ? true : (val === 'false') ? false : val;
            if (callback) callback();
            scheduleRedraw();
        });
    });
}

setupToggleGroup(themeRow, 'theme', function() {
    // Restore saved colors for the selected theme
    S.titleColor = themeColors[S.theme].title;
    S.dateColor  = themeColors[S.theme].date;
    colTitle.value = S.titleColor;
    colDate.value  = S.dateColor;
    updateColoredLogo(S.titleColor); // <--- ADDED THIS
});

setupToggleGroup(langRow, 'lang', function() { renderCalendar(); });
setupToggleGroup(texRow, 'texture', function() {
    if (S.texture) {
        // Picks a random texture from the array every time you click "On"
        var randomSrc = TEXTURE_SRCS[Math.floor(Math.random() * TEXTURE_SRCS.length)];
        _textureImage = new Image();
        _textureImage.onload = scheduleRedraw;
        _textureImage.src = randomSrc;
    }
});
setupToggleGroup(justRow, 'justify');
setupToggleGroup(alignRow, 'align'); // NEW
setupToggleGroup(document.getElementById('ecm-author-pos-row'), 'authorPos'); // NEW
setupToggleGroup(document.getElementById('ecm-graphic-row'), 'graphic', function() {
    if (S.graphic === 'logo') {
        _currentLogoIdx = (_currentLogoIdx + 1) % LOGO_SRCS.length;
        loadLogoSvg(LOGO_SRCS[_currentLogoIdx].src);
    }
});
setupToggleGroup(document.getElementById('ecm-columns-row'), 'columns');      // NEW

/* Initialize Toggle UI states based on Defaults */
setupToggleGroup(document.getElementById('ecm-filetype-row'), 'fileType'); 

function initToggles() {
    // Texture and Justify
    texRow.querySelector('[data-texture="' + S.texture + '"]').click();
    justRow.querySelector('[data-justify="' + S.justify + '"]').click();
    alignRow.querySelector('[data-align="' + S.align + '"]').click(); 
    document.getElementById('ecm-author-pos-row').querySelector('[data-author-pos="' + S.authorPos + '"]').click(); 
    document.getElementById('ecm-graphic-row').querySelector('[data-graphic="' + S.graphic + '"]').click();               
    document.getElementById('ecm-columns-row').querySelector('[data-columns="' + S.columns + '"]').click();         

    var fileTypeBtn = document.querySelector('#ecm-filetype-row [data-file-type="' + S.fileType + '"]');
    if (fileTypeBtn) fileTypeBtn.classList.add('active');

    fontScale.value = S.fontScale;
    scaleVal.textContent = S.fontScale.toFixed(1) + 'x';
    if (showTitleRow) showTitleRow.querySelector('[data-show-title="' + S.showTitle + '"]').click(); // NEW
    
    padScale.value = S.padScale; 
    padScaleVal.textContent = S.padScale.toFixed(1) + 'x'; 
    if (padRatio) {
        padRatio.value = S.padRatio; 
        padRatioVal.textContent = S.padRatio.toFixed(1);
    }
}
initToggles();

/* ─── FORMATS ────────────────────────────────────────────── */
function buildFormats() {
    FORMATS.forEach(function (fmt) {
        var btn = document.createElement('button');
        btn.className = 'ecm-fmt-btn' + (fmt.id === S.formatId ? ' active' : '');
        btn.textContent = fmt.label;
        btn.addEventListener('click', function () {
            formatsEl.querySelectorAll('.ecm-fmt-btn').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            S.formatId = fmt.id;
            scheduleRedraw();
        });
        formatsEl.appendChild(btn);
    });
}
buildFormats();

/* ─── CALENDAR ───────────────────────────────────────────── */
function renderCalendar() {
    var v = S.calView;
    var yr = v.getFullYear(), mo = v.getMonth();
    var firstDow = new Date(yr, mo, 1).getDay();
    var daysInMo = new Date(yr, mo + 1, 0).getDate();
    var today    = new Date();

    var d_short = S.lang === 'sv' ? DAYS_SHORT_SV : DAYS_SHORT_EN;
    var m_full  = S.lang === 'sv' ? MONTHS_SV : MONTHS_EN;

    calEl.innerHTML =
        '<div class="ecm-cal-nav">' +
          '<button class="ecm-cal-nav-btn" id="ecm-cal-prev">&#8249;</button>' +
          '<span class="ecm-cal-month-label">' + m_full[mo] + ' ' + yr + '</span>' +
          '<button class="ecm-cal-nav-btn" id="ecm-cal-next">&#8250;</button>' +
        '</div>' +
        '<div class="ecm-cal-grid" id="ecm-cal-grid"></div>';

    var grid = calEl.querySelector('#ecm-cal-grid');

    d_short.forEach(function (d) {
        var el = document.createElement('div');
        el.className = 'ecm-cal-dow';
        el.textContent = d;
        grid.appendChild(el);
    });

    for (var i = 0; i < firstDow; i++) {
        var blank = document.createElement('div');
        blank.className = 'ecm-cal-day ecm-other';
        grid.appendChild(blank);
    }

    for (var d = 1; d <= daysInMo; d++) {
        (function (day) {
            var el = document.createElement('div');
            el.className = 'ecm-cal-day';
            el.textContent = day;
            var isToday    = today.getFullYear()===yr && today.getMonth()===mo && today.getDate()===day;
            var isSel      = S.date.getFullYear()===yr && S.date.getMonth()===mo && S.date.getDate()===day;
            if (isToday) el.classList.add('ecm-today');
            if (isSel)   el.classList.add('ecm-selected');
            el.addEventListener('click', function () {
                S.date = new Date(yr, mo, day);
                renderCalendar();
                scheduleRedraw();
            });
            grid.appendChild(el);
        }(d));
    }

    calEl.querySelector('#ecm-cal-prev').addEventListener('click', function () { S.calView = new Date(yr, mo - 1, 1); renderCalendar(); });
    calEl.querySelector('#ecm-cal-next').addEventListener('click', function () { S.calView = new Date(yr, mo + 1, 1); renderCalendar(); });
}
renderCalendar();

/* ─── REDRAW SCHEDULING ──────────────────────────────────── */
var _debounceTimer = null;

function scheduleRedraw() {
    // Clear the previous timer if the user is still typing/clicking
    if (_debounceTimer) clearTimeout(_debounceTimer);
    
    // Set a 250ms delay. It feels instantaneous to the user, 
    // but saves the device from rendering mid-keystroke.
    _debounceTimer = setTimeout(function() {
        requestAnimationFrame(redrawPreview);
    }, 250);
}

function redrawPreview() {
    if (!overlay.classList.contains('active')) return;
    var fmt = FORMATS.find(function (f) { return f.id === S.formatId; });
    
    if (!fmt) return;

    // 1. Set the physical canvas to the FULL export resolution
    // This ensures ctx.measureText() calculates word-wrapping exactly as it will export.
    canvas.width  = fmt.w;
    canvas.height = fmt.h;

    // 2. Let the browser's GPU visually scale it down to fit the preview box.
    // Your CSS already has max-width: 100% and max-height: 100% for the canvas,
    // so setting these to 'auto' ensures it scales smoothly while maintaining aspect ratio.
    canvas.style.width  = 'auto';
    canvas.style.height = 'auto';

    // 3. Draw the card at full resolution
    var ctx = canvas.getContext('2d');
    
    // Optional: Smooth image scaling for the preview
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    drawCard(ctx, fmt.w, fmt.h, false); // Pass false for isExport
}
/* ─── CARD DRAWING ───────────────────────────────────────── */
function drawCard(ctx, w, h, isExport) {
    var isDark        = S.theme === 'dark';
    var bg            = isDark ? '#0d0d0d' : '#f4f3ee';
    var fg            = isDark ? 'rgba(255,255,255,0.86)' : 'rgba(0,0,0,0.86)';
    var fgBody        = isDark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.72)';
    
    // NEW: Check if transparent mode is active
    var isTransparent = S.fileType === 'png_transp' || S.fileType === 'pdf_transp';

    var isBanner  = (w / h) > 2.6;
    var isPortrait= (h / w) > 1.2;
    var small     = Math.min(w, h);

    /* ── Background ── */
    if (isExport && isTransparent) {
        // Clear canvas for completely transparent background on export
        ctx.clearRect(0, 0, w, h);
    } else {
        if (isTransparent && !isExport) {
            // Mimic paper or black background for previewing transparent cards
            ctx.fillStyle = isDark ? '#000000' : '#ffffff';
        } else {
            ctx.fillStyle = bg;
        }
        ctx.fillRect(0, 0, w, h);
    }

    /* ── Texture ── */
    if (!isTransparent && S.texture && _textureImage && _textureImage.complete && _textureImage.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = TEXTURE_OPACITY;
        var scale = Math.max(w / _textureImage.naturalWidth, h / _textureImage.naturalHeight);
        var sw = _textureImage.naturalWidth * scale;
        var sh = _textureImage.naturalHeight * scale;
        ctx.drawImage(_textureImage, (w - sw) / 2, (h - sh) / 2, sw, sh);
        ctx.restore();
    }

/* ── Background Graphic ── */
    var R;
    if (isBanner)      R = h * 0.72;
    else if (isPortrait) R = small * 0.54;
    else               R = small * 0.56;

    var rCx, rCy;
    if (isBanner)      { rCx = w - R * 0.12; rCy = h * 0.5; }
    else if (isPortrait) { rCx = w * 0.5;      rCy = h - R * 0.06; }
    else               { rCx = w - R * 0.15; rCy = h - R * 0.08; }

    if (S.graphic === 'ring') {
        drawRing(ctx, rCx, rCy, R, S.titleColor, w, h);
    } else if (S.graphic === 'logo' && _coloredLogoImg.complete && _coloredLogoImg.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = 0.18; // Opacity to match the subtle feel of the ring
        
        // Grab the specific scale for the currently selected logo (fallback to 1.8 just in case)
        var currentScale = LOGO_SRCS[_currentLogoIdx].scale || 1.8; 
        var size = R * currentScale; 
        
        ctx.drawImage(_coloredLogoImg, rCx - size/2, rCy - size/2, size, size);
        ctx.restore();
    }
    /* ── Base Font sizes ── */
    var titleSz, dateSz, bodySz;
    if (isBanner) {
        titleSz = Math.min(h * 0.32, w * 0.055, 130);
        dateSz  = Math.min(h * 0.10, 44);
        bodySz  = Math.min(h * STYLE.bannerBody, 50);
    } else {
        titleSz = Math.min(small * 0.10, 110);
        dateSz  = Math.min(small * 0.036, 36);
        bodySz  = Math.min(small * 0.043, 44);
    }


    /* Apply Font Scale */
    titleSz *= S.fontScale;
    dateSz  *= S.fontScale;
    bodySz  *= S.fontScale;

    // Grab column count early
    var cols = parseInt(S.columns) || 1; 

    var padBase = isBanner ? h * 0.17 : small * 0.074;
    padBase *= S.padScale; // Apply base padding scale

    // Apply the X/Y bias logic
    var padX = padBase * (1 + S.padRatio);
    var padY = padBase * (1 - S.padRatio);
    
    var contentW;
    if (isBanner) {
        contentW = w * 0.50;
    } else if (isPortrait) {
        contentW = w - padX * 2;
    } else {
        contentW = cols > 1 ? w - padX * 2 : w * 0.60;
    }

    var y = isBanner ? (h - (dateSz * 1.5 + titleSz * 1.4)) / 2 : padY;
    var titleX;
    if (S.align === 'center') {
        titleX = w / 2;
    } else if (S.align === 'right') {
        titleX = w - padX;
    } else {
        titleX = padX; // Default left
    }

    var initialY = y;

    /* ── Date string (Toggleable) ── */
    if (S.lang !== 'off') { // <-- NEW: Skips date if OFF
        var dateStr = fmtDate(S.date, S.lang).toUpperCase();
        ctx.font        = '400 ' + dateSz + 'px HaraldMono, monospace';
        ctx.fillStyle   = S.dateColor;
        ctx.textAlign   = S.align; // <-- NEW: Center / Right alignment applied
        ctx.textAlign   = S.align; // <-- NEW: Center / Right alignment applied
        try { ctx.letterSpacing = (dateSz * STYLE.tracking) + 'px'; } catch(e){}  
        ctx.fillText(dateStr, titleX, initialY + dateSz * 0.9);

        var gapMultiplier = 1.08; 
        y += dateSz * gapMultiplier; 
    }


/* ── Author / Contact (NEW) ── */
    if (S.author && S.author.trim()) {
        ctx.font      = '400 ' + dateSz + 'px HaraldMono, monospace';
        ctx.fillStyle = S.dateColor; 
        var authorX;
        var drawAuthorY = initialY + dateSz * 0.9;
        
        if (S.align === 'left') {
            authorX = w - padX;
            ctx.textAlign = 'right';
            if (S.authorPos === 'diagonal') drawAuthorY = h - padY; 
        } else if (S.align === 'right') {
            authorX = padX;
            ctx.textAlign = 'left';
            if (S.authorPos === 'diagonal') drawAuthorY = h - padY; 
        } else {
            authorX = w / 2;
            drawAuthorY = h - padY; 
            ctx.textAlign = 'center';
        }
        
        try { ctx.letterSpacing = (dateSz * 0.08) + 'px'; } catch(e){}
        ctx.fillText(S.author.toUpperCase(), authorX, drawAuthorY);
        try { ctx.letterSpacing = '2px'; } catch(e){}
    }

    /* ── Title ── */
    if (S.showTitle) {
        if (!isBanner) {
            if (S.lang !== 'off') {
                y += titleSz * 0.17; 
            } else {
                y -= titleSz * 0.36; 
            }
        }

        var titleText = (S.title || 'EVENT TITLE').toUpperCase();
        ctx.font      = '400 ' + titleSz + 'px HaraldMono, monospace';
        ctx.fillStyle = S.titleColor;
        ctx.textAlign = S.align; 
        y = drawWrapped(ctx, titleText, titleX, y + titleSz, contentW, titleSz * 1.14);

        y -= titleSz * 0.7;

        /* ── Thin separator ── */
        var sepLen = Math.min(contentW * 0.16, 70 * (small / 900));
        ctx.beginPath();
        
        if (S.align === 'center') {
            ctx.moveTo(w / 2 - sepLen / 2, y);
            ctx.lineTo(w / 2 + sepLen / 2, y);
        } else if (S.align === 'right') {
            ctx.moveTo(w - padX - sepLen, y);
            ctx.lineTo(w - padX, y);
        } else {
            ctx.moveTo(padX, y);
            ctx.lineTo(padX + sepLen, y);
        }
        
        ctx.strokeStyle  = S.titleColor;
        ctx.globalAlpha  = STYLE.separatorOp;
        ctx.lineWidth    = Math.max(0.6, 1.2 * (small / 900));
        ctx.stroke();
        ctx.globalAlpha  = 1;
        y += titleSz * 0.4;
    } 
    // The 'else' block forcing the massive padding gap has been entirely removed.

    /* ── Markdown description ── */
    if (S.desc && S.desc.trim() && !isBanner) {
        var mdX = padX;
        if (S.align === 'center') {
            mdX = (w - contentW) / 2;
        } else if (S.align === 'right') {
            mdX = w - padX - contentW;
        }
        
        var colState = null;

        if (cols > 1) {
            var colGap = padX * 0.5; 
            var colW = (contentW - (cols - 1) * colGap) / cols;
            var totalY = drawMarkdown(ctx, S.desc, mdX, y, colW, bodySz, fg, fgBody, null, true);
            var contentH = totalY - y;
            var limitY = y + (contentH / cols) * 1.15; 
            var maxLimitY = h - padY;
            if (limitY > maxLimitY) limitY = maxLimitY;

            colState = {
                startX: mdX,
                startY: y,
                limitY: limitY,
                width: colW,
                gap: colGap,
                current: 0,
                max: cols
            };
            drawMarkdown(ctx, S.desc, mdX, y, colW, bodySz, fg, fgBody, colState, false);
        } else {
            drawMarkdown(ctx, S.desc, mdX, y, contentW, bodySz, fg, fgBody, null, false);
        }
    }
}

/* ─── RING (Hex Color Compatible) ────────────────────────── */
function drawRing(ctx, cx, cy, R, hexColor, clipW, clipH) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, clipW, clipH);
    ctx.clip();

    var ts = R / 270; 

    /* Track */
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = hexColor;
    ctx.globalAlpha = 0.09;
    ctx.lineWidth   = 1.5 * ts;
    ctx.stroke();

    /* Ticks */
    for (var i = 0; i < 60; i++) {
        var major = (i % 5 === 0);
        var angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
        var outer = R - 2;
        var inner = outer - (major ? R * 0.058 : R * 0.028);

        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
        ctx.strokeStyle = hexColor;
        ctx.globalAlpha = major ? 0.28 : 0.11;
        ctx.lineWidth   = (major ? 1.8 : 0.9) * ts;
        ctx.stroke();
    }

    ctx.restore();
}

/* ─── TEXT WRAP ──────────────────────────────────────────── */
function drawWrapped(ctx, text, x, y, maxW, lh) {
    var words = text.split(' ');
    var line  = '';
    for (var i = 0; i < words.length; i++) {
        var test = line ? line + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > maxW && line) {
            ctx.fillText(line, x, y);
            y += lh;
            line = words[i];
        } else {
            line = test;
        }
    }
    if (line) { ctx.fillText(line, x, y); y += lh; }
    return y;
}

/* ─── MARKDOWN ───────────────────────────────────────────── */
function parseBlocks(md) {
    var lines  = md.split('\n');
    var blocks = [];
    var para   = [];
    var olN    = [0, 0, 0, 0, 0, 0]; // Tracks ordered lists up to 6 indentation levels

    function flushPara() {
        if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; }
    }

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var match;
        
        if (!line.trim()) { flushPara(); olN = [0,0,0,0,0,0]; continue; }
        
        if (/^---$/.test(line.trim())) { flushPara(); blocks.push({ type: 'hr' }); olN = [0,0,0,0,0,0]; }
        else if (/^### /.test(line)) { flushPara(); blocks.push({ type: 'h3', text: line.slice(4) }); olN = [0,0,0,0,0,0]; }
        else if (/^## /.test(line))  { flushPara(); blocks.push({ type: 'h2', text: line.slice(3) }); olN = [0,0,0,0,0,0]; }
        else if (/^# /.test(line))   { flushPara(); blocks.push({ type: 'h1', text: line.slice(2) }); olN = [0,0,0,0,0,0]; }
        else if (/^> /.test(line))   { flushPara(); blocks.push({ type: 'blockquote', text: line.slice(2) }); olN = [0,0,0,0,0,0]; }

        // FOOTNOTES
        else if ((match = /^\[\^([^\]]+)\]:\s*(.*)/.exec(line))) {
            flushPara();
            olN = [0,0,0,0,0,0];
            blocks.push({ type: 'footnote', id: match[1], text: match[2] });
        }
        // TABLE SUPPORT
        else if (/^\|(.+)\|$/.test(line.trim())) {
            flushPara();
            olN = [0,0,0,0,0,0];
            var cells = line.trim().split('|').slice(1, -1).map(function(s){ return s.trim(); });
            var isSep = cells.length > 0 && cells.every(function(c) { return /^[-:]+$/.test(c); }); // Ignore |---|---|
            if (!isSep) {
                if (blocks.length > 0 && blocks[blocks.length-1].type === 'table') {
                    blocks[blocks.length-1].rows.push(cells);
                } else {
                    blocks.push({ type: 'table', rows: [cells] });
                }
            }
        }
        
        // UNORDERED LISTS & TASK LISTS
        else if ((match = /^(\s*)[-*] (.*)/.exec(line))) {
            flushPara();
            var indent = Math.floor(match[1].length / 2); // 2 spaces = 1 indent
            var content = match[2];
            var taskMatch = /^\[([ xX])\] (.*)/.exec(content);
            if (taskMatch) {
                blocks.push({ type: 'task', text: taskMatch[2], indent: indent, checked: taskMatch[1] !== ' ' });
            } else {
                blocks.push({ type: 'li', text: content, indent: indent });
            }
        }
        
        // ORDERED LISTS (Nested tracking)
        else if ((match = /^(\s*)\d+\. (.*)/.exec(line))) {
            flushPara();
            var indent = Math.floor(match[1].length / 2);
            if (indent > 5) indent = 5;
            olN[indent]++;
            for (var j = indent + 1; j < olN.length; j++) olN[j] = 0; // Reset deeper levels
            blocks.push({ type: 'oli', text: match[2], indent: indent, n: olN[indent] });
        }
        
        else { para.push(line); }
    }
    flushPara();
    return blocks;
}

function tokenize(text) {
    var tokens = [];
    // Added support for triple backticks inline to handle block-style code input gracefully
    var re = /!\[([^\]]*)\]\([^)]+\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_|```([^`]+)```|`([^`\n]+)`|~~([^~\n]+)~~|==([^=\n]+)==|\[\^([^\]]+)\]|\[([^\]]+)\]\([^)]+\)/g;
    
    var m, lastIdx = 0;
    while ((m = re.exec(text)) !== null) {
        // 1. Push any plain text that came before this match
        if (m.index > lastIdx) {
            tokens.push({ t: 'text', s: text.slice(lastIdx, m.index) });
        }
        
        // 2. Identify and push the matched token
        if      (m[1] !== undefined) tokens.push({ t: 'text',   s: '[Image: ' + (m[1] || 'link') + ']' }); 
        else if (m[2] !== undefined) tokens.push({ t: 'bold',   s: m[2] });
        else if (m[3] !== undefined) tokens.push({ t: 'bold',   s: m[3] });
        else if (m[4] !== undefined) tokens.push({ t: 'italic', s: m[4] });
        else if (m[5] !== undefined) tokens.push({ t: 'italic', s: m[5] });
        else if (m[6] !== undefined) tokens.push({ t: 'code',   s: m[6] }); // Triple backticks
        else if (m[7] !== undefined) tokens.push({ t: 'code',   s: m[7] }); // Single backticks
        else if (m[8] !== undefined) tokens.push({ t: 'strikethrough', s: m[8] });
        else if (m[9] !== undefined) tokens.push({ t: 'highlight', s: m[9] });
        else if (m[10]!== undefined) tokens.push({ t: 'footnoteref', s: '[' + m[10] + ']' });
        else if (m[11]!== undefined) tokens.push({ t: 'link',   s: m[11] }); 
        
        lastIdx = re.lastIndex;
    }
    
    // 3. Push any remaining plain text after the last match
    if (lastIdx < text.length) {
        tokens.push({ t: 'text', s: text.slice(lastIdx) });
    }
    
    return tokens.filter(function (t) { return t.s; });
}

function getFont(type, size, forceMono) {
    var baseFont = forceMono ? 'HaraldMono, monospace' : 'HaraldText, sans-serif';
    if (type === 'code')   return '400 ' + (size * 0.91) + 'px HaraldMono, monospace';
    if (type === 'italic') return 'italic 400 ' + size + 'px ' + baseFont;
    if (type === 'footnoteref') return '400 ' + (size * 0.7) + 'px ' + baseFont;
    if (type === 'link') return '400 ' + size + 'px ' + baseFont;
    return '400 ' + size + 'px ' + baseFont;
}
function drawTokensWrapped(ctx, tokens, x0, y, maxW, lh, size, bodyColor, codeCol, isDark, justify, forceMono, colState, measureOnly, alignOverride) {
    var align = alignOverride || S.align;
    var units = [];
    tokens.forEach(function (tok) {
        var parts = tok.s.split(/(\s+)/);
        parts.forEach(function (p) { if (p) units.push({ text: p, type: tok.t }); });
    });

    var lineUnits = [], lineW = 0;
    var prevFont = ctx.font;

    function mw(u) {
        ctx.font = getFont(u.type, size, forceMono);
        var w = ctx.measureText(u.text).width;
        ctx.font = prevFont;
        return w;
    }

    function flush(isLast) {
        if (!lineUnits.length) return;

        // Column break logic
        if (colState && colState.current < colState.max - 1 && y + lh > colState.limitY) {
            colState.current++;
            y = colState.startY;
        }

        var currentX0 = colState ? colState.startX + colState.current * (colState.width + colState.gap) + (x0 - colState.startX) : x0;
        var lx = currentX0;

        ctx.textAlign = 'left';

        var extraSpace = 0;
        if (justify && !isLast) {
            var spaceCount = lineUnits.filter(function(u){ return /^\s+$/.test(u.text); }).length;
            if (spaceCount > 0) extraSpace = Math.max(0, (maxW - lineW)) / spaceCount;
            } else {
            // Apply mathematical offset using the column-aware X position
            if (align === 'center') {
                lx = currentX0 + (maxW - lineW) / 2;
            } else if (align === 'right') {
                lx = currentX0 + (maxW - lineW);
            }
        }

            if (!measureOnly) {
            // PASS 1: Draw continuous padded backgrounds for Code & Highlights
            var p1_lx = lx;
            var bgType = null;
            var bgStartX = p1_lx;
            var bgWidth = 0;

            function renderBg(type, startX, width) {
                ctx.save();
                if (type === 'code') {
                    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
                } else if (type === 'highlight') {
                    ctx.fillStyle = codeCol;
                    ctx.globalAlpha = isDark ? 0.22 : 0.28;
                }
                
                var pad = size * 0.18; // Left/Right Padding
                var h = size * 1.2;
                var drawY = y - size * 0.88;
                
                // Draw rounded pill (falls back to rect if unsupported)
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(startX - pad, drawY, width + pad * 2, h, size * 0.22);
                    ctx.fill();
                } else {
                    ctx.fillRect(startX - pad, drawY, width + pad * 2, h);
                }
                ctx.restore();
            }

            for (var i = 0; i < lineUnits.length; i++) {
                var u = lineUnits[i];
                ctx.font = getFont(u.type, size, forceMono);
                var uw = ctx.measureText(u.text).width;
                var spc = (/^\s+$/.test(u.text)) ? extraSpace : 0;

                if (u.type === 'code' || u.type === 'highlight') {
                    if (bgType === u.type) {
                        bgWidth += uw + spc;
                    } else {
                        if (bgType) renderBg(bgType, bgStartX, bgWidth);
                        bgType = u.type;
                        bgStartX = p1_lx;
                        bgWidth = uw + spc;
                    }
                } else {
                    if (bgType) {
                        renderBg(bgType, bgStartX, bgWidth);
                        bgType = null;
                    }
                }
                p1_lx += uw + spc;
            }
            if (bgType) renderBg(bgType, bgStartX, bgWidth);

            // PASS 2: Draw Text & Underlines
            lineUnits.forEach(function (u) {
                ctx.font = getFont(u.type, size, forceMono);
                var uw = ctx.measureText(u.text).width;

                if (u.type === 'code') {
                    ctx.fillStyle = codeCol;
                } else if (u.type === 'highlight') {
                    ctx.fillStyle = bodyColor;
                } else if (u.type === 'link') {
                    ctx.fillStyle = codeCol; 
                    ctx.beginPath();
                    ctx.moveTo(lx, y + size * 0.12);
                    ctx.lineTo(lx + uw, y + size * 0.12);
                    ctx.strokeStyle = codeCol;
                    ctx.lineWidth = Math.max(0.5, size * 0.05);
                    ctx.stroke();
                } else {
                    ctx.fillStyle = bodyColor;
                }

                if (u.type === 'footnoteref') {
                    ctx.fillText(u.text, lx, y - size * 0.35); // Shift up for superscript
                } else {
                    ctx.fillText(u.text, lx, y);
                }

                if (u.type === 'bold') {
                    ctx.beginPath();
                    ctx.moveTo(lx, y + size * 0.11);
                    ctx.lineTo(lx + uw, y + size * 0.11);
                    ctx.strokeStyle = bodyColor;
                    ctx.lineWidth   = Math.max(0.5, size * 0.038);
                    ctx.stroke();
                } else if (u.type === 'strikethrough') {
                    ctx.beginPath();
                    ctx.moveTo(lx, y - size * 0.25);
                    ctx.lineTo(lx + uw, y - size * 0.25);
                    ctx.strokeStyle = bodyColor;
                    ctx.lineWidth   = Math.max(0.5, size * 0.05);
                    ctx.stroke();
                }
                
                lx += uw;
                if (/^\s+$/.test(u.text)) lx += extraSpace;
            });
        }
        lineUnits = [];
        lineW     = 0;
        y        += lh;
    }

    units.forEach(function (unit) {
        var uw = mw(unit);
        if (lineW + uw > maxW && lineUnits.length > 0 && unit.text.trim()) {
            if (lineUnits.length > 0 && /^\s+$/.test(lineUnits[lineUnits.length-1].text)) {
                lineW -= mw(lineUnits.pop());
            }
            flush(false);
        }
        if (lineUnits.length === 0 && !unit.text.trim()) return; 
        lineUnits.push(unit);
        lineW += uw;
    });
    flush(true);

    return y;
}

function drawMarkdown(ctx, md, x, y, maxW, baseSize, fg, fgBody, colState, measureOnly) {
    var blocks  = parseBlocks(md);
    var isDark  = S.theme === 'dark';
    var codeCol = S.dateColor; 
    var dateColor = S.dateColor;

    function checkColBreak(currentY, lh) {
        if (colState && colState.current < colState.max - 1 && currentY + lh > colState.limitY) {
            colState.current++;
            return colState.startY;
        }
        return currentY;
    }

    function getColX(baseX) {
        if (!colState) return baseX;
        return colState.startX + colState.current * (colState.width + colState.gap) + (baseX - colState.startX);
    }

    blocks.forEach(function (block) {
        var tokens = tokenize(block.text || '');

        switch (block.type) {
            case 'h1':
            case 'h2':
            case 'h3': {
                // FIXED: Condensed H-tags and replaced drawWrapped with drawTokensWrapped
                var sz = baseSize * (block.type === 'h1' ? 1.75 : block.type === 'h2' ? 1.45 : 1.22);
                y = checkColBreak(y, sz * STYLE.lineHeight);
                y += sz * (block.type === 'h1' ? 0.4 : block.type === 'h2' ? 0.3 : 0.25);
                
                // Keep the uppercase behavior but apply it safely to the split syntax tokens
                var headerTokens = tokens.map(function(t) { return { t: t.t, s: t.s.toUpperCase() }; });
                // Pass true to forceMono parameter
                y = drawTokensWrapped(ctx, headerTokens, x, y + sz, maxW, sz * STYLE.lineHeight, sz, fg, codeCol, isDark, false, true, colState, measureOnly);
                
                y -= sz * (block.type === 'h1' ? 0.55 : block.type === 'h2' ? 0.5 : 0.45);
                break;
            }
            case 'hr': {
                y = checkColBreak(y, baseSize * 1.2);
                y += baseSize * 0.6;
                
                if (!measureOnly) {
                    var cx = getColX(x);
                    ctx.beginPath();
                    ctx.moveTo(cx, y);
                    ctx.lineTo(cx + maxW, y);
                    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
                    ctx.lineWidth = Math.max(1, baseSize * 0.05);
                    ctx.stroke();
                }
                
                y += baseSize * 0.6;
                break;
            }
            case 'blockquote': {
                y = checkColBreak(y, baseSize * STYLE.lineHeight);
                y += baseSize * 0.25;
                var startY = y;
                var bqX = x + baseSize * 1.2;
                var bqMaxW = maxW - baseSize * 1.2;
                
                var nextY = drawTokensWrapped(ctx, tokens, bqX, y + baseSize, bqMaxW, baseSize * STYLE.lineHeight, baseSize, fgBody, codeCol, isDark, S.justify, false, colState, measureOnly);
                
                if (!measureOnly) {
                    var cx = getColX(x + baseSize * 0.4);
                    ctx.beginPath();
                    ctx.moveTo(cx, startY + baseSize * 0.2);
                    ctx.lineTo(cx, nextY - baseSize * 0.2);
                    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
                    ctx.lineWidth = Math.max(1, baseSize * 0.15);
                    ctx.stroke();
                }
                
                y = nextY + baseSize * 0.2;
                break;
            }
            case 'p': {
                y = checkColBreak(y, baseSize * STYLE.lineHeight);
                y += baseSize * 0.25;
                if (!measureOnly) ctx.font = '400 ' + baseSize + 'px HaraldText, sans-serif';
                y = drawTokensWrapped(ctx, tokens, x, y + baseSize, maxW, baseSize * STYLE.lineHeight, baseSize, fgBody, codeCol, isDark, S.justify, false, colState, measureOnly);

                y += baseSize * 0.2;
                break;
            }
            case 'task': {
                y = checkColBreak(y, baseSize * STYLE.lineHeight);
                if (!measureOnly) ctx.font = '400 ' + baseSize + 'px HaraldText, sans-serif';
                y += baseSize * 0.15;
                
                var indentPad = (block.indent || 0) * baseSize * 1.5;
                var isRight = S.align === 'right';
                var textX0, textMaxW, boxLeft;
                
                if (isRight) {
                    var R = x + maxW - indentPad;
                    textX0 = x;
                    textMaxW = maxW - indentPad - baseSize * 1.2;
                    boxLeft = R - baseSize * 0.75;
                } else {
                    var ix = x + indentPad;
                    textX0 = ix + baseSize * 1.2;
                    textMaxW = maxW - indentPad - baseSize * 1.2;
                    boxLeft = ix + baseSize * 0.1;
                }
                
                if (!measureOnly) {
                    var cxBox = getColX(boxLeft);
                    var boxSz = baseSize * 0.65;
                    ctx.strokeStyle = dateColor;
                    ctx.lineWidth = Math.max(1, baseSize * 0.08);
                    ctx.strokeRect(cxBox, y + baseSize * 0.25, boxSz, boxSz);
                    
                    if (block.checked) {
                        ctx.beginPath();
                        ctx.moveTo(cxBox + baseSize * 0.15, y + baseSize * 0.55);
                        ctx.lineTo(cxBox + baseSize * 0.30, y + baseSize * 0.75);
                        ctx.lineTo(cxBox + baseSize * 0.55, y + baseSize * 0.35);
                        ctx.stroke();
                    }
                }
                
                var alignOverride = S.align === 'center' ? 'left' : S.align;
                y = drawTokensWrapped(ctx, tokens, textX0, y + baseSize, textMaxW, baseSize * STYLE.lineHeight, baseSize, fgBody, codeCol, isDark, false, false, colState, measureOnly, alignOverride);
                y += baseSize * STYLE.listGap;
                break;
            }
            case 'li': {
                y = checkColBreak(y, baseSize * STYLE.lineHeight);
                if (!measureOnly) ctx.font = '400 ' + baseSize + 'px HaraldText, sans-serif';
                y += baseSize * 0.15;
                
                var indentPad = (block.indent || 0) * baseSize * 1.5;
                var isRight = S.align === 'right';
                var textX0, textMaxW, bulletX;
                
                if (isRight) {
                    var R = x + maxW - indentPad;
                    textX0 = x;
                    textMaxW = maxW - indentPad - baseSize * 1.1;
                    bulletX = R - baseSize * 0.42;
                } else {
                    var ix = x + indentPad;
                    textX0 = ix + baseSize * 1.1;
                    textMaxW = maxW - indentPad - baseSize * 1.1;
                    bulletX = ix + baseSize * 0.42;
                }
                
                if (!measureOnly) {
                    var cxBul = getColX(bulletX);
                    ctx.beginPath();
                    ctx.arc(cxBul, y + baseSize * 1.0, baseSize * 0.17, 0, Math.PI * 2);
                    
                    if ((block.indent || 0) % 2 === 1) {
                        ctx.strokeStyle = dateColor;
                        ctx.lineWidth = Math.max(1, baseSize * 0.06);
                        ctx.stroke();
                    } else {
                        ctx.fillStyle = dateColor;
                        ctx.fill();
                    }
                }
                
                var alignOverride = S.align === 'center' ? 'left' : S.align;
                y = drawTokensWrapped(ctx, tokens, textX0, y + baseSize, textMaxW, baseSize * STYLE.lineHeight, baseSize, fgBody, codeCol, isDark, false, false, colState, measureOnly, alignOverride);
                y += baseSize * STYLE.listGap;
                break;
            }
            case 'oli': {
                y = checkColBreak(y, baseSize * STYLE.lineHeight);
                y += baseSize * 0.15;
                
                var indentPad = (block.indent || 0) * baseSize * 1.5;
                var isRight = S.align === 'right';
                var textX0, textMaxW, numX;
                
                if (isRight) {
                    var R = x + maxW - indentPad;
                    textX0 = x;
                    textMaxW = maxW - indentPad - baseSize * 1.45;
                    numX = R;
                } else {
                    var ix = x + indentPad;
                    textX0 = ix + baseSize * 1.45;
                    textMaxW = maxW - indentPad - baseSize * 1.45;
                    numX = ix;
                }
                
                if (!measureOnly) {
                    var cxNum = getColX(numX);
                    ctx.font = '400 ' + baseSize + 'px HaraldMono, monospace';
                    ctx.fillStyle = dateColor;
                    ctx.textAlign = isRight ? 'right' : 'left';
                    ctx.fillText(block.n + '.', cxNum, y + baseSize);
                    ctx.font = '400 ' + baseSize + 'px HaraldText, sans-serif';
                }
                
                var alignOverride = S.align === 'center' ? 'left' : S.align;
                y = drawTokensWrapped(ctx, tokens, textX0, y + baseSize, textMaxW, baseSize * STYLE.lineHeight, baseSize, fgBody, codeCol, isDark, false, false, colState, measureOnly, alignOverride);
                y += baseSize * STYLE.listGap;
                break;
            }
            case 'footnote': {
                y = checkColBreak(y, baseSize * STYLE.lineHeight);
                y += baseSize * 0.15;
                
                var idPad = baseSize * 1.8;
                var isRight = S.align === 'right';
                var textX0, textMaxW, idX;
                
                if (isRight) {
                    var R = x + maxW;
                    textX0 = x;
                    textMaxW = maxW - idPad;
                    idX = R; 
                } else {
                    textX0 = x + idPad;
                    textMaxW = maxW - idPad;
                    idX = x;
                }
                
                if (!measureOnly) {
                    var cxId = getColX(idX);
                    ctx.font = '400 ' + (baseSize * 0.85) + 'px HaraldMono, monospace';
                    ctx.fillStyle = dateColor;
                    ctx.textAlign = isRight ? 'right' : 'left';
                    ctx.fillText('[' + block.id + ']', cxId, y + baseSize * 0.95);
                    ctx.font = '400 ' + baseSize + 'px HaraldText, sans-serif';
                }
                
                var alignOverride = S.align === 'center' ? 'left' : S.align;
                // Render footnote body slightly smaller (0.9x scale) for standard typographical feel
                y = drawTokensWrapped(ctx, tokens, textX0, y + baseSize, textMaxW, baseSize * 1.05, baseSize * 0.9, fgBody, codeCol, isDark, false, false, colState, measureOnly, alignOverride);
                y += baseSize * 0.05;
                break;
            }
            case 'table': {
                y = checkColBreak(y, baseSize * 1.2);
                y += baseSize * 0.5;
                var cols = block.rows[0].length;
                var colW = maxW / cols;
                var startY = y;
                
                if (!measureOnly) {
                    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
                    ctx.lineWidth = Math.max(1, baseSize * 0.05);
                }

                block.rows.forEach(function(row, rIdx) {
                    var rowMaxY = y;
                    row.forEach(function(cell, cIdx) {
                        var cellTokens = tokenize(cell);
                        var cx = x + cIdx * colW + baseSize * 0.4;
                        var cMaxW = colW - baseSize * 0.8;
                        var cellFg = rIdx === 0 ? fg : fgBody;
                        var cy = drawTokensWrapped(ctx, cellTokens, cx, y + baseSize * 1.2, cMaxW, baseSize * 1.12, baseSize, cellFg, codeCol, isDark, false, false, colState, measureOnly);
                        if (cy > rowMaxY) rowMaxY = cy;
                    });
                    y = rowMaxY + baseSize * 0.4;
                    
                    if (!measureOnly) {
                        // Horizontal row divider
                        var tableX = getColX(x);
                        ctx.beginPath();
                        ctx.moveTo(tableX, y);
                        ctx.lineTo(tableX + maxW, y);
                        ctx.stroke();
                    }
                });
                
                if (!measureOnly) {
                    var tableX = getColX(x);
                    // Top border
                    ctx.beginPath(); ctx.moveTo(tableX, startY); ctx.lineTo(tableX + maxW, startY); ctx.stroke();
                    
                    // Vertical borders
                    for (var c = 0; c <= cols; c++) {
                        ctx.beginPath(); 
                        ctx.moveTo(tableX + c * colW, startY); 
                        ctx.lineTo(tableX + c * colW, y); 
                        ctx.stroke();
                    }
                }
                
                y += baseSize * 0.5;
                break;
            }
        }
    });
    return y;
}

/* ─── EXPORT ─────────────────────────────────────────────── */
exportBtn.addEventListener('click', function () {
    var fmt = FORMATS.find(function (f) { return f.id === S.formatId; });
    var off = document.createElement('canvas');
    off.width  = fmt.w;
    off.height = fmt.h;
    var ctx = off.getContext('2d');


    document.fonts.ready.then(function () {
        drawCard(ctx, fmt.w, fmt.h, true); // Pass true for isExport
        var yyyy = pad4(S.date.getFullYear());
        var mm   = pad(S.date.getMonth() + 1);
        var dd   = pad(S.date.getDate());
        var slug = (S.title || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/, '');
        var baseFilename = yyyy + '_' + mm + '_' + dd + '_' + slug;

    if (S.fileType === 'pdf' || S.fileType === 'pdf_transp') {
            var jsPDF = window.jspdf.jsPDF; 
            
            if (!jsPDF) {
                alert("PDF library not loaded. Check your script tags or CSP.");
                return;
            }

            var orientation = fmt.w > fmt.h ? 'landscape' : 'portrait';
            var pdf = new jsPDF({ 
                orientation: orientation, 
                unit: 'px', 
                format: [fmt.w, fmt.h] 
            });
            
            // NEW: Use PNG with Alpha for Transparent PDF exports, otherwise JPEG for compression
            var imgData = (S.fileType === 'pdf_transp') 
                ? off.toDataURL('image/png') 
                : off.toDataURL('image/jpeg', 0.92);
            var format = (S.fileType === 'pdf_transp') ? 'PNG' : 'JPEG';
            
            pdf.addImage(imgData, format, 0, 0, fmt.w, fmt.h);
            pdf.save(baseFilename + '.pdf');
        } else {
            var link = document.createElement('a');
            // Clean up extension naming for files
            var ext = S.fileType.replace('_transp', ''); 
            link.download = baseFilename + '.' + ext;
            
            // NEW: Make sure both 'png' and 'png_transp' output as actual PNGs
            link.href = (S.fileType.includes('png')) 
                ? off.toDataURL('image/png') 
                : off.toDataURL('image/jpeg', 0.92);
            link.click();
        }
    });
});

/* ─── RESIZE OBSERVER ── */
if (typeof ResizeObserver !== 'undefined') {
    var ro = new ResizeObserver(function () {
        if (overlay.classList.contains('active')) scheduleRedraw();
    });
    ro.observe(previewWrap);
}

document.fonts.ready.then(function () { redrawPreview(); });

}());