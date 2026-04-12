// editor-actions.js
// ── Menu Actions Definition ────────────────────────────────────────────────
const menuActions = [
  // Safely fallback to empty array if the external file didn't load
  { type: 'submenu', label: 'Insert YAML ▸', items: typeof yamlTemplates !== 'undefined' ? yamlTemplates : [] },
  { type: 'divider' },
  { label: 'Bold (Ctrl+B)', action: 'bold' },
  { label: 'Italic (Ctrl+I)', action: 'italic' },
  { label: 'Heading', action: 'heading' },
  { label: 'Strikethrough', action: 'strike' },
  { label: 'Code Block', action: 'code' },
  { label: 'Inline Code', action: 'inline_code' },
  { label: 'Link', action: 'link' },
  { label: 'Image', action: 'image' },
  { type: 'divider' },
  { label: 'Task List', action: 'task_list' },
  { label: 'Insert Table', action: 'table' },
  { label: 'Horizontal Rule', action: 'hr' },
  { label: 'Footnote', action: 'footnote' },
  { type: 'divider' },
  { label: 'Copy MD', action: 'copy' }
];


/* Extra items that appear only in the right-click context menu.
   "Marked" = works on the currently selected text.               */
const contextMenuExtra = [
  { type: 'divider' },
  { label: 'Cut (Marked)',            action: 'ctx_cut' },
  { label: 'Copy (Marked)',           action: 'ctx_copy' },
  { label: 'Paste',                   action: 'ctx_paste' },
  { type: 'divider' },
  { label: 'Insert Date',             action: 'insert_date' },
  { type: 'divider' },
  { label: 'Ordered List (Marked)',   action: 'list_ordered' },
  { label: 'Unordered List (Marked)', action: 'list_unordered' },
  { type: 'divider' },
  { label: 'Clear Format (Marked)',   action: 'clear_format' }
];

// Global date format setting
window.currentDateFormat = 'YYYY-MM-DD';

/* ── Global filename format setting ─────────────────────────────────────────
   Controls what suffix or prefix is appended to / prepended to the doc title
   when saving or exporting a file. Default is 'none' (just Title.md).
   Options are defined and labelled in the Settings → Filename format submenu. */
window.filenameFormat = 'none';

/* ── buildExportFilename ─────────────────────────────────────────────────────
   Constructs the final download filename from the document title, the chosen
   extension, and the active window.filenameFormat setting.
   All separators use underscores so the filename is shell-safe.
   @param  {string} baseName  – sanitised doc title (spaces→dashes, lowercase)
   @param  {string} ext       – file extension without the leading dot (md / txt)
   @return {string}           – complete filename including extension            */
function buildExportFilename(baseName, ext) {
  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');

  const yyyy = now.getFullYear();
  const MM   = pad(now.getMonth() + 1);
  const dd   = pad(now.getDate());
  const hh   = pad(now.getHours());
  const mm   = pad(now.getMinutes());
  const ss   = pad(now.getSeconds());

  /* Pre-built date / time tokens */
  const datePart     = `${yyyy}-${MM}-${dd}`;           // e.g. 2026-04-05
  const dateTimePart = `${yyyy}-${MM}-${dd}_${hh}-${mm}-${ss}`; // e.g. 2026-04-05_14-30-00
  const timePart     = `${hh}-${mm}-${ss}`;             // e.g. 14-30-00
  const compactDate  = `${yyyy}${MM}${dd}`;             // e.g. 20260405

  switch (window.filenameFormat) {
    case 'suffix_date':
      /* Title_YYYY-MM-DD.ext */
      return `${baseName}_${datePart}.${ext}`;
    case 'suffix_datetime':
      /* Title_YYYY-MM-DD_HH-MM-SS.ext */
      return `${baseName}_${dateTimePart}.${ext}`;
    case 'suffix_time':
      /* Title_HH-MM-SS.ext */
      return `${baseName}_${timePart}.${ext}`;
    case 'prefix_date':
      /* YYYY-MM-DD_Title.ext */
      return `${datePart}_${baseName}.${ext}`;
    case 'prefix_compact':
      /* YYYYMMDD_Title.ext  (compact — common in archival workflows) */
      return `${compactDate}_${baseName}.${ext}`;
    case 'none':
    default:
      /* Plain Title.ext — original default behaviour */
      return `${baseName}.${ext}`;
  }
}


// Helper for date formatting
function formatDateString(dateStr, format) {
  const [year, month, day] = dateStr.split('-');
  switch (format) {
    case 'DD/MM/YYYY': return `${day}/${month}/${year}`;
    case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
    case 'Long Date': 
      const dObj = new Date(year, month - 1, day);
      let locale = 'en-US';
      if (window.uiLanguage === 'Swedish') {
        locale = 'sv-SE';
      }
      // Future languages can be easily chained here
      return dObj.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    case 'YYYY-MM-DD':
    default:
      return `${year}-${month}-${day}`;
  }
}

// ── Action Execution System ────────────────────────────────────────────────

function wrapText(before, after = before, defaultText = "") {
  const start = editor.selectionStart;
  const end   = editor.selectionEnd;
  const selectedText = editor.value.substring(start, end) || defaultText;
  const newText = before + selectedText + after;

  insertWithUndo(start, end, newText);

  /* Re-select the inner content so the user can keep typing over it */
  editor.setSelectionRange(start + before.length, start + before.length + selectedText.length);
  render();
}

function executeAction(action) {
  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  switch(action) {
     // (cases 'yaml_blog' and 'yaml_llm' have been removed – they were dead code - see the template )

    case 'bold': wrapText('**'); break;
    case 'italic': wrapText('_'); break;
    case 'strike': wrapText('~~'); break;
    case 'heading': wrapText('### ', ''); break;
    case 'code': wrapText('```\n', '\n```', 'code here'); break;
    case 'link': wrapText('[', '](url)', 'link text'); break;
    case 'inline_code': wrapText('`', '`', 'code'); break;
    case 'image': wrapText('![', '](/notebook_thumbnails/timeclock_min.jpg)', 'Placeholder Image'); break;
    case 'task_list': wrapText('- [ ] ', '', 'Task'); break;


    case 'hr': wrapText('\n---\n\n', '', ''); break;
    case 'footnote':
    wrapText('[^1]\n\n[^1]: ', '', 'Footnote description here');
    break;
    case 'insert_date': {
      mdCalViewDate = new Date(); // Reset calendar to current month on open
      renderMdCalendar();
      document.getElementById('date-picker-modal').classList.add('show');
      break;
    }
    case 'file_new': newFile(); break;


    case 'file_import': importFile(); break;
    case 'file_save_as': openSaveAsModal(); break;
    case 'file_export_md': exportFile('md'); break;
    case 'file_export_txt': exportFile('txt'); break;

    case 'table':
      /* Open the native-style table modal instead of unreliable prompt() dialogs */
      document.getElementById('table-modal').classList.add('show');
      document.getElementById('table-cols').focus();
      break;

/* ── Context-menu clipboard actions ───────────────────────────────────
       ctx_copy / ctx_cut  operate on the current textarea selection.
       ctx_paste           inserts at the cursor (or over the selection).

       Security note: navigator.clipboard is async and requires a secure
       context (HTTPS / localhost). The try/catch keeps things safe if the
       API is unavailable or the user denies the permission prompt.        */
    case 'ctx_paste': {
      // Helper to paste text at the current selection (replaces selected text)
      const pasteText = (text) => {
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        if (start !== end) {
          // Replace selected text
          insertWithUndo(start, end, text);
        } else {
          // Insert at cursor
          insertWithUndo(start, start, text);
        }
        render();
        countWords();
      };

      // Modern async clipboard API (requires secure context & user permission)
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.readText()
          .then(text => pasteText(text))
          .catch(err => {
            console.warn('Clipboard read failed (permission or no text):', err);
            // Fallback: use a hidden textarea to read from clipboard (legacy)
            const ta = document.createElement('textarea');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            // Execute paste command into the textarea
            document.execCommand('paste');
            const pasted = ta.value;
            document.body.removeChild(ta);
            if (pasted) pasteText(pasted);
          });
      } else {
        // Insecure context: use legacy execCommand paste
        const ta = document.createElement('textarea');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        const success = document.execCommand('paste');
        const pasted = ta.value;
        document.body.removeChild(ta);
        if (success && pasted) pasteText(pasted);
      }
      break;
    }

    case 'ctx_cut': {
      const cutStart = editor.selectionStart;
      const cutEnd   = editor.selectionEnd;
      const cutSel   = editor.value.substring(cutStart, cutEnd);
      if (!cutSel) break; // Nothing selected

      // Helper to safely execute the visual cut
      const executeCut = () => {
        insertWithUndo(cutStart, cutEnd, '');
        render();
        countWords();
      };

      // Helper for the legacy synchronous fallback
      const fallbackCopy = (str) => {
        const ta = document.createElement('textarea');
        ta.value = str;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        let success = false;
        try { success = document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(ta);
        return success;
      };

      // 1. Check if we are in a secure context with the modern API
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(cutSel)
          .then(() => {
            // Success: Only delete the text once the promise resolves
            executeCut();
          })
          .catch(() => {
            // If the API rejects, it's too late to run the fallback.
            // Alert the user instead of deleting their data.
            if (typeof sizeWarning !== 'undefined') {
              sizeWarning.style.display = 'inline';
              sizeWarning.textContent = 'Clipboard permission denied. Cut failed.';
              setTimeout(() => sizeWarning.style.display = 'none', 3000);
            }
          });
      } else {
        // 2. Insecure context: run the legacy fallback synchronously 
        // while the user gesture is still active.
        if (fallbackCopy(cutSel)) {
          executeCut(); // Only delete if the fallback reported success
        } else {
          console.warn("Legacy clipboard copy failed. Text not cut.");
        }
      }
      break;
    }

    case 'copy':
      const copyText = editor.value;

      const fallbackCopy = (str) => {
        const ta = document.createElement('textarea');
        ta.value = str;
        ta.style.top = '0'; ta.style.left = '0'; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        let success = false;
        try { success = document.execCommand('copy'); } catch (err) {}
        document.body.removeChild(ta);
        return success;
      };


      const handleFeedback = (success) => {
        if (success) {
          btnToolbar.textContent = window.t('Copied!');
          setTimeout(() => btnToolbar.textContent = window.t('Toolbar ▾'), 1200);
        } else {
          console.warn("Copy MD failed.");
        }
      };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(copyText)
          .then(() => handleFeedback(true))
          .catch(() => handleFeedback(fallbackCopy(copyText)));
      } else {
        handleFeedback(fallbackCopy(copyText));
      }
      break;

    /* ── List from marked text ──────────────────────────────────────────────
       Splits the selected text on blank lines; each non-empty block
       becomes one list item. Internal line-breaks are collapsed to a space. */
    case 'list_ordered':
    case 'list_unordered': {
      const s = editor.selectionStart;
      const e = editor.selectionEnd;
      const sel = editor.value.substring(s, e);
      if (!sel.trim()) {
        /* Nothing selected — flash the border as a hint */
        editor.style.outline = '1px solid var(--border-md)';
        setTimeout(() => editor.style.outline = '', 700);
        break;
      }
      const ordered = action === 'list_ordered';
      const chunks = sel.split(/\n[ \t]*\n+/).map(c => c.trim()).filter(Boolean);
      const listText = chunks.map((chunk, i) => {
        const line = chunk.replace(/\n+/g, ' ');
        return ordered ? `${i + 1}. ${line}` : `- ${line}`;
      }).join('\n');
      insertWithUndo(s, e, listText);
      render(); countWords();
      break;
    }

    /* ── Clear Format (Marked) ──────────────────────────────────────────────
       Strips all markdown syntax from the selected text while preserving the
       plain text content. Patterns are applied most-specific-first so that,
       e.g., bold-italic (***) is handled before bold (**) or italic (*).    */
    case 'clear_format': {
      const s   = editor.selectionStart;
      const e   = editor.selectionEnd;
      const sel = editor.value.substring(s, e);
      if (!sel.trim()) {
        /* Nothing selected — flash border as a visual hint */
        editor.style.outline = '1px solid var(--border-md)';
        setTimeout(() => editor.style.outline = '', 700);
        break;
      }

      let clean = sel;

      /* Images must come before links (more specific pattern) */
      clean = clean.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
      /* Links */
      clean = clean.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
      /* Bold + Italic: ***text*** or ___text___ */
      clean = clean.replace(/\*{3}([\s\S]+?)\*{3}/g, '$1');
      clean = clean.replace(/_{3}([\s\S]+?)_{3}/g, '$1');
      /* Bold: **text** or __text__ */
      clean = clean.replace(/\*{2}([\s\S]+?)\*{2}/g, '$1');
      clean = clean.replace(/_{2}([\s\S]+?)_{2}/g, '$1');
      /* Italic: *text* or _text_ */
      clean = clean.replace(/\*([\s\S]+?)\*/g, '$1');
      clean = clean.replace(/_([\s\S]+?)_/g, '$1');
      /* Strikethrough: ~~text~~ */
      clean = clean.replace(/~~([\s\S]+?)~~/g, '$1');
      /* Fenced code blocks (```...```) */
      clean = clean.replace(/```[a-z]*\n?([\s\S]*?)```/g, '$1');
      /* Inline code: `text` */
      clean = clean.replace(/`([^`]+)`/g, '$1');
      /* ATX headings: # Heading  →  Heading (per line) */
      clean = clean.replace(/^#{1,6}\s+/gm, '');
      /* Blockquote markers: > text */
      clean = clean.replace(/^>\s*/gm, '');
      /* Task-list checkboxes: - [ ]  or  - [x] */
      clean = clean.replace(/^([-*+]|\d+\.)\s+\[[ xX]\]\s*/gm, '');
      /* Unordered list markers: - / * / + */
      clean = clean.replace(/^[-*+]\s+/gm, '');
      /* Ordered list markers: 1. */
      clean = clean.replace(/^\d+\.\s+/gm, '');
      /* Horizontal rules (standalone lines of ---, ***, ___) */
      clean = clean.replace(/^[-*_]{3,}\s*$/gm, '');

      insertWithUndo(s, e, clean);
      render();
      countWords();
      break;
    }
  }
}


/* ── Table Generator Modal Logic ─────────────────────────────────────────── */
function buildAndInsertTable() {
  const rows = parseInt(document.getElementById('table-rows').value, 10);
  const cols = parseInt(document.getElementById('table-cols').value, 10);
  if (!rows || !cols || isNaN(rows) || isNaN(cols) || rows < 1 || cols < 1) return;

  // Enforce reasonable upper limits (matches HTML input max attributes)
  const MAX_ROWS = 100;
  const MAX_COLS = 20;
  const safeRows = Math.min(rows, MAX_ROWS);
  const safeCols = Math.min(cols, MAX_COLS);

  let table = '\n\n|';
  for (let i = 0; i < safeCols; i++) table += ` Header ${i + 1} |`;
  table += '\n|';
  for (let i = 0; i < safeCols; i++) table += ` --- |`;
  for (let r = 0; r < safeRows; r++) {
    table += '\n|';
    for (let c = 0; c < safeCols; c++) table += ` Cell |`;
  }
  table += '\n\n';

  wrapText(table, '');
  document.getElementById('table-modal').classList.remove('show');
  editor.focus();
}

/* Insert on button click */
document.getElementById('table-btn-insert').addEventListener('click', buildAndInsertTable);

/* Cancel button */
document.getElementById('table-btn-cancel').addEventListener('click', () => {
  document.getElementById('table-modal').classList.remove('show');
  editor.focus();
});

/* Allow Enter key inside the number inputs to confirm */
document.getElementById('table-rows').addEventListener('keydown', e => {
  if (e.key === 'Enter') { buildAndInsertTable(); e.preventDefault(); }
  if (e.key === 'Escape') { document.getElementById('table-modal').classList.remove('show'); editor.focus(); e.preventDefault(); }
});
document.getElementById('table-cols').addEventListener('keydown', e => {
  if (e.key === 'Enter') { buildAndInsertTable(); e.preventDefault(); }
  if (e.key === 'Escape') { document.getElementById('table-modal').classList.remove('show'); editor.focus(); e.preventDefault(); }
});


/* Export function */
function exportFile(extension = 'md') {
  /* Sanitise the doc title: spaces to dashes, remove illegal OS characters, lowercase */
  let baseName = (docTitle.value.trim() || 'untitled').replace(/\s+/g, '-').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').toLowerCase();
  if (!baseName) baseName = 'untitled';
  /* Apply the active filename format (suffix, prefix, or plain) */
  const filename = buildExportFilename(baseName, extension);
  const mimeType = extension === 'md' ? 'text/markdown' : 'text/plain';
  const blob    = new Blob([editor.value], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob); // ← capture before assignment so a.href resolution can't change it
  const a = Object.assign(document.createElement('a'), { href: blobUrl, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000); // ← revoke the original reference, not a.href
  /* ── Show "File saved" in the word counter for 2 seconds ── */
  showSavedIndicator();
}

btnExport.addEventListener('click', () => exportFile('md'));

/* ── File Menu Operations ── */
let pendingFileAction = null;

function newFile() {
  if (editor.value.trim().length > 0) {
    pendingFileAction = 'new';
    // Update modal text for "New"
    document.getElementById('modal-msg').innerText = window.t("Do you want to export your current work before starting a new file? If you don't export, your current text will be lost forever.");
    document.getElementById('new-file-modal').classList.add('show');
  } else {
    // If it's already empty, just clear it safely
    executeClear();
  }
}

// Helper to handle the actual clearing of the editor
function executeClear() {
  window.performTextChange('', 0, 0);
  docTitle.value = '';
  try {
    localStorage.removeItem('revery_md_autosave');
  } catch (e) {
    console.warn('Local storage access denied. Could not remove autosave.', e);
  }
}

/* Modal Button Event Listeners */
document.getElementById('modal-btn-yes').addEventListener('click', () => {
  exportFile('md');
  executeClear();
  if (pendingFileAction === 'import') {
    executeImport();
  }
  document.getElementById('new-file-modal').classList.remove('show');
});

document.getElementById('modal-btn-no').addEventListener('click', () => {
  executeClear();
  if (pendingFileAction === 'import') {
    executeImport();
  }
  document.getElementById('new-file-modal').classList.remove('show');
});

document.getElementById('modal-btn-cancel').addEventListener('click', () => {
  // Do nothing except close the modal. The user's work is safe.
  pendingFileAction = null;
  document.getElementById('new-file-modal').classList.remove('show');
});

function importFile() {
  if (editor.value.trim().length > 0) {
    pendingFileAction = 'import';
    // Update modal text for "Import"
    document.getElementById('modal-msg').innerText = window.t("Do you want to export your current work before importing a new file? If you don't export, your current text will be lost forever.");
    document.getElementById('new-file-modal').classList.add('show');
  } else {
    executeImport();
  }
}

function executeImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.md,.txt';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;

    // Safety constraint: Prevent importing massive files that could crash the browser (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      alert("File is too large. Please select a file under 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = event => {
      window.performTextChange(event.target.result, 0, 0);
      docTitle.value = file.name.replace(/\.[^/.]+$/, "");
    };


    reader.onerror = () => alert("An error occurred while reading the file.");
    // Secure reading: only reads raw text data, no execution.
    reader.readAsText(file);
  };
  input.click();
}

/* Ctrl+S Save interception */
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    exportFile('md');
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'b') { e.preventDefault(); executeAction('bold'); }
  if (e.ctrlKey && e.key.toLowerCase() === 'i') { e.preventDefault(); executeAction('italic'); }
});


/* ── Auto-wrapping Syntax Pairs ── */
const autoWrapPairs = {
  '"': '"',
  "'": "'",
  '(': ')',
  '[': ']',
  '{': '}',
  '*': '*',
  '_': '_',
  '`': '`',
  '~': '~'
};

/* ── Tab key & Auto-wrap ── */
editor.addEventListener('keydown', e => {
  // Tab Indent
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = editor.selectionStart, en = editor.selectionEnd;
    
    // Using the safe wrapper ensures Ctrl+Z works for tabs
    insertWithUndo(s, en, '  ');
    render();
    return;
  }

  // Auto-Wrap Logic
  if (editor.selectionStart !== editor.selectionEnd && autoWrapPairs[e.key]) {
    e.preventDefault();
    const s = editor.selectionStart;
    const en = editor.selectionEnd;
    const selectedText = editor.value.substring(s, en);
    const openChar = e.key;
    const closeChar = autoWrapPairs[e.key];
    
    // Using the safe wrapper to preserve the undo stack
    insertWithUndo(s, en, openChar + selectedText + closeChar);
    
    // Keep text selected inside the new syntax wrappers
    editor.setSelectionRange(s + 1, en + 1);
    render();
    countWords();
  }
});





/* ── Custom Calendar Logic for Insert Date ────────────────────────────────── */
let mdCalViewDate = new Date();
const MD_DAYS_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa'];
function getMonthNames() {
  if (window.uiLanguage === 'Swedish') {
    return ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];
  }
  return ['January','February','March','April','May','June','July','August','September','October','November','December'];
}

function renderMdCalendar() {
  const calEl = document.getElementById('md-cal');
  if (!calEl) return;
  
  const yr = mdCalViewDate.getFullYear();
  const mo = mdCalViewDate.getMonth();
  const firstDow = new Date(yr, mo, 1).getDay();
  const daysInMo = new Date(yr, mo + 1, 0).getDate();
  const today = new Date();


  calEl.innerHTML =
      '<div class="md-cal-nav">' +
        '<button class="md-cal-nav-btn" id="md-cal-prev">&#8249;</button>' +
        '<span class="md-cal-month-label">' + getMonthNames()[mo] + ' ' + yr + '</span>' +
        '<button class="md-cal-nav-btn" id="md-cal-next">&#8250;</button>' +
      '</div>' +
      '<div class="md-cal-grid" id="md-cal-grid"></div>';

  const grid = calEl.querySelector('#md-cal-grid');

  MD_DAYS_SHORT.forEach(d => {
      const el = document.createElement('div');
      el.className = 'md-cal-dow';
      el.textContent = d;
      grid.appendChild(el);
  });




for (let i = 0; i < firstDow; i++) {
      const blank = document.createElement('div');
      blank.className = 'md-cal-day md-other';
      blank.innerHTML = '&nbsp;'; // Prevents row height collapse
      grid.appendChild(blank);
  }

  for (let d = 1; d <= daysInMo; d++) {
      const el = document.createElement('div');
      el.className = 'md-cal-day';
      el.textContent = d;
      
      const isToday = today.getFullYear() === yr && today.getMonth() === mo && today.getDate() === d;
      if (isToday) el.classList.add('md-today');
      
      el.addEventListener('click', () => {
          // Format standard YYYY-MM-DD
          const pad = (n) => String(n).padStart(2, '0');
          const dateStr = `${yr}-${pad(mo + 1)}-${pad(d)}`;
          
          const formatted = formatDateString(dateStr, window.currentDateFormat);
          insertWithUndo(editor.selectionStart, editor.selectionEnd, formatted);
          render();
          countWords();
          
          document.getElementById('date-picker-modal').classList.remove('show');
      });
      grid.appendChild(el);
  }

  // Add trailing empty cells to ensure a fixed 6-row calendar (6 * 7 = 42 cells)
  const totalCells = 42;
  const trailingCells = totalCells - (firstDow + daysInMo);
  for (let i = 0; i < trailingCells; i++) {
      const blank = document.createElement('div');
      blank.className = 'md-cal-day md-other';
      blank.innerHTML = '&nbsp;'; // Prevents row height collapse
      grid.appendChild(blank);
  }



calEl.querySelector('#md-cal-prev').addEventListener('click', () => { mdCalViewDate = new Date(yr, mo - 1, 1); renderMdCalendar(); });
  calEl.querySelector('#md-cal-next').addEventListener('click', () => { mdCalViewDate = new Date(yr, mo + 1, 1); renderMdCalendar(); });
}

// Bind modal cancel button
document.getElementById('cal-btn-cancel').addEventListener('click', () => {
  document.getElementById('date-picker-modal').classList.remove('show');
});

/* ── Quit / Exit Workflow Logic ─────────────────────────────────────────── */
function openQuitModal() {
  const modal = document.getElementById('quit-modal');
  const step1 = document.getElementById('quit-step-1');
  const step2 = document.getElementById('quit-step-2');
  const title = document.getElementById('quit-modal-title');
  const msg = document.getElementById('quit-modal-msg');

  title.innerText = window.t('Quit Editor');
  
  // If there's text, ask if they want to save first
  if (editor.value.trim().length > 0) {
    msg.innerText = window.t('Do you want to export your current work before quitting? Unsaved text will be lost.');
    step1.style.display = 'flex';
    step2.style.display = 'none';
  } else {
    // If it's completely empty, jump straight to the Engine Stopped state
    showQuitStep2();
  }
  
  modal.classList.add('show');
}

function showQuitStep2() {
  // Turn off the "engine" safety net
  window.isQuitting = true; 
  
  document.getElementById('quit-modal-title').innerText = window.t('Engine Stopped');
  document.getElementById('quit-modal-msg').innerText = window.t('The editor engine has been safely shut down. What would you like to do next?');
  document.getElementById('quit-step-1').style.display = 'none';
  document.getElementById('quit-step-2').style.display = 'flex';
  
}

// Hook up Step 1 buttons
document.getElementById('quit-btn-save')?.addEventListener('click', () => {
  exportFile('md'); // Trigger the standard export
  showQuitStep2();
});

document.getElementById('quit-btn-nosave')?.addEventListener('click', () => {
  showQuitStep2();
});


document.getElementById('quit-btn-cancel')?.addEventListener('click', () => {
  window.isQuitting = false; // ← Restore the safety net if user cancels mid-flow
  document.getElementById('quit-modal').classList.remove('show');
});


// Hook up Step 2 buttons
document.getElementById('quit-btn-restart')?.addEventListener('click', () => {
  // Resume the editor with data intact
  window.isQuitting = false; // Restore the beforeunload safety net
  document.getElementById('quit-modal').classList.remove('show');
});

document.getElementById('quit-btn-total-reset')?.addEventListener('click', () => {
  // Prevent the beforeunload warning while we reset
  window.isQuitting = true;

  // Remove both the autosaved document and all user settings
  try {
    localStorage.removeItem('revery_md_autosave');
    localStorage.removeItem('revery_md_settings');
  } catch (e) {
    console.warn('Local storage access denied. Could not fully reset before restart.', e);
  }

  // Reload the page – everything will be reinitialised to factory defaults
  window.location.reload();
});


// ── ADD THIS NEW BLOCK ──
document.getElementById('quit-btn-leave')?.addEventListener('click', () => {
  window.isQuitting = true;
  window.location.href = '/notebook.html';
});

/* ── Save As Modal Logic ─────────────────────────────────────────────────── */
function openSaveAsModal() {
  const modal = document.getElementById('save-as-modal');
  const input = document.getElementById('save-as-filename');
  
  /* Pre-fill with the sanitized current title, stripping illegal OS characters */
  let baseName = (docTitle.value.trim() || 'untitled').replace(/\s+/g, '-').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').toLowerCase();
  if (!baseName) baseName = 'untitled';
  input.value = baseName;
  
  modal.classList.add('show');
  const saveAsMsg = modal.querySelector('p');
  if (saveAsMsg) saveAsMsg.textContent = window.t('Enter filename (will be saved as .md):');
  input.focus();
  input.select();
}

function executeSaveAs() {
  const input = document.getElementById('save-as-filename');
  let rawName = input.value.trim();
  
  /* OS-safe sanitization: Strip illegal filesystem characters but preserve international letters */
  let safeName = rawName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '');
  if (!safeName) safeName = 'untitled';
  
  /* Bypass filenameFormat settings, just append .md */
  const filename = `${safeName}.md`;
  
  /* Create blob and download (bypasses beforeunload natively) */
  const blob = new Blob([editor.value], { type: 'text/markdown' });
  const blobUrl = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: blobUrl, download: filename });
  
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  
  showSavedIndicator();
  document.getElementById('save-as-modal').classList.remove('show');
  editor.focus();
}

/* Event Listeners for the Modal */
document.getElementById('save-as-btn-confirm').addEventListener('click', executeSaveAs);

document.getElementById('save-as-btn-cancel').addEventListener('click', () => {
  document.getElementById('save-as-modal').classList.remove('show');
  editor.focus();
});

/* Keyboard support: Enter to confirm, Esc to close */
document.getElementById('save-as-filename').addEventListener('keydown', e => {
  if (e.key === 'Enter') { 
    executeSaveAs(); 
    e.preventDefault(); 
  }
  if (e.key === 'Escape') { 
    document.getElementById('save-as-modal').classList.remove('show'); 
    editor.focus(); 
    e.preventDefault(); 
  }
});