// editor-find.js
// ── Find / Replace Bar ────────────────────────────────────────────────────

/* Internal state */
/* Internal state */
let findMatches    = [];   // Array of objects {index, length}
let findCurrentIdx = -1;   // Index into findMatches for the active match
let findCaseSensitive = false;
let findUseRegex = false;

/* ── DOM refs (resolved once the DOM is ready) ── */
const findBar      = document.getElementById('find-bar');
const findInput    = document.getElementById('find-input');
const findCaseBtn  = document.getElementById('find-case-btn');
const findRegexBtn = document.getElementById('find-regex-btn');
const findCount    = document.getElementById('find-count');
const replaceInput = document.getElementById('replace-input');
const findPrevBtn  = document.getElementById('find-prev');
const findNextBtn  = document.getElementById('find-next');
const replaceOneBtn= document.getElementById('find-replace-one');
const replaceAllBtn= document.getElementById('find-replace-all');
const findCloseBtn = document.getElementById('find-close');

/* ── Visual Highlighter Backdrop ─────────────────────────────────────── */
const findBackdrop = document.createElement('div');
findBackdrop.id = 'find-backdrop';
findBackdrop.style.position = 'absolute';
findBackdrop.style.pointerEvents = 'none';
findBackdrop.style.color = 'transparent'; // Only the <mark> will be visible
findBackdrop.style.zIndex = '0';
findBackdrop.style.overflow = 'hidden';
findBackdrop.style.boxSizing = 'border-box';
findBackdrop.style.whiteSpace = 'pre-wrap';
findBackdrop.style.wordBreak = 'break-word';

// Ensure editor and its container are stacked correctly
editor.parentNode.style.position = 'relative';
editor.style.position = 'relative';
editor.style.zIndex = '1';
editor.parentNode.insertBefore(findBackdrop, editor);

function syncFindBackdrop() {
  if (findBar.style.display === 'none') return;
  const computed = window.getComputedStyle(editor);
  findBackdrop.style.fontFamily = computed.fontFamily;
  findBackdrop.style.fontSize = computed.fontSize;
  findBackdrop.style.lineHeight = computed.lineHeight;
  findBackdrop.style.letterSpacing = computed.letterSpacing;
  findBackdrop.style.padding = computed.padding;
  findBackdrop.style.tabSize = computed.tabSize; // Added to sync tab width
  findBackdrop.style.top = editor.offsetTop + 'px';
  findBackdrop.style.left = editor.offsetLeft + 'px';
  findBackdrop.style.width = editor.offsetWidth + 'px';
  findBackdrop.style.height = editor.offsetHeight + 'px';
}

const editorResizeObserver = new ResizeObserver(() => syncFindBackdrop());
editorResizeObserver.observe(editor);

editor.addEventListener('scroll', () => {
  if (findBar.style.display !== 'none') findBackdrop.scrollTop = editor.scrollTop;
});

editor.addEventListener('input', () => {
  if (findBar.style.display !== 'none' && document.activeElement === editor) {
     findBackdrop.innerHTML = ''; // Hide highlight when typing to edit the text
  }
});

/* ── Open & Close ─────────────────────────────────────────────────────── */
function openFindBar() {
  findBar.style.display = 'flex';
  syncFindBackdrop();
  /* If text is already selected, seed the find field with it */
  const sel = editor.value.substring(editor.selectionStart, editor.selectionEnd);
  if (sel && !sel.includes('\n')) {
    findInput.value = sel;
  }
  findInput.focus();
  findInput.select();
  runFind();
}

function closeFindBar() {
  findBar.style.display = 'none';
  findMatches    = [];
  findCurrentIdx = -1;
  findBackdrop.innerHTML = ''; // Clear highlight on close
  updateFindCount(); // clear count label
  editor.focus();
}




/* ── Core search ──────────────────────────────────────────────────────── */
function runFind() {
  const query = findInput.value;
  findMatches    = [];
  findCurrentIdx = -1;

  if (!query) {
    updateFindCount();
    return;
  }

  const text = editor.value;
  let flags = 'g';
  if (!findCaseSensitive) flags += 'i';

  let searchRegex;
  if (findUseRegex) {
    try {
      searchRegex = new RegExp(query, flags);
    } catch (e) {
      updateFindCount(); // Invalid regex, abort search
      return;
    }
  } else {
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    searchRegex = new RegExp(escapedQuery, flags);
  }

  // Prevent infinite loops with zero-length matches
  if (searchRegex.test("")) {
    updateFindCount(); 
    return;
  }

  searchRegex.lastIndex = 0;
  let match;
  while ((match = searchRegex.exec(text)) !== null) {
    if (match[0].length > 0) {
      findMatches.push({ index: match.index, length: match[0].length });
    }
    if (searchRegex.lastIndex === match.index) {
      searchRegex.lastIndex++;
    }
  }

  if (findMatches.length > 0) {
    /* Start at whichever match is closest to the current cursor position */
    const cursor = editor.selectionStart;
    findCurrentIdx = 0;
    for (let i = 0; i < findMatches.length; i++) {
      if (findMatches[i].index >= cursor) { findCurrentIdx = i; break; }
    }
    highlightMatch(findCurrentIdx);
  }

  updateFindCount();
}





/* ── Navigation ───────────────────────────────────────────────────────── */
function findNext() {
  if (!findMatches.length) { runFind(); return; }
  findCurrentIdx = (findCurrentIdx + 1) % findMatches.length;
  highlightMatch(findCurrentIdx);
  updateFindCount();
}

function findPrev() {
  if (!findMatches.length) { runFind(); return; }
  findCurrentIdx = (findCurrentIdx - 1 + findMatches.length) % findMatches.length;
  highlightMatch(findCurrentIdx);
  updateFindCount();
}



/* ── Scroll editor to a match and select it ── */
function highlightMatch(idx) {
  if (idx < 0 || idx >= findMatches.length) return;
  const start = findMatches[idx].index;
  const end   = start + findMatches[idx].length;

  /* Scroll the textarea so the match sits ~40% down the visible area */
  const lineCount = (editor.value.match(/\n/g) || []).length + 1;
  const lineH     = editor.scrollHeight / lineCount;
  const matchLine = (editor.value.substring(0, start).match(/\n/g) || []).length;
  editor.scrollTop = Math.max(0, matchLine * lineH - editor.clientHeight * 0.4);

  /* Render the fake visual highlight behind the transparent textarea */
  syncFindBackdrop();
  const text = editor.value;
  const before = text.substring(0, start);
  const match = text.substring(start, end);
  const after = text.substring(end);
  
  const escapeHtmlLocal = (str) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  findBackdrop.innerHTML = escapeHtmlLocal(before) + `<mark class="find-highlight-mark">${escapeHtmlLocal(match)}</mark>` + escapeHtmlLocal(after);
  findBackdrop.scrollTop = editor.scrollTop;

  // Remember what is currently focused so we don't interrupt typing
  const currentFocus = document.activeElement;
  
  editor.focus();
  editor.setSelectionRange(start, end);
  
  // Restore focus to the input or button the user was interacting with
  if (currentFocus && currentFocus !== editor) {
    currentFocus.focus();
  }
}

/* ── Match counter label ── */
function updateFindCount() {
  if (!findInput.value) {
    findCount.textContent = '';
    findCount.className   = 'find-count';
    return;
  }
  if (findMatches.length === 0) {
    findCount.textContent = window.t('No results');
    findCount.className   = 'find-count find-no-results';
  } else {
    findCount.textContent = `${findCurrentIdx + 1} / ${findMatches.length}`;
    findCount.className   = 'find-count';
  }
}


/* ── Replace ──────────────────────────────────────────────────────────── */
function replaceCurrent() {
  if (!findMatches.length) return;
  const matchObj = findMatches[findCurrentIdx];
  const start = matchObj.index;
  const end = start + matchObj.length;
  let replacement = replaceInput.value;

  if (findUseRegex) {
    const matchedStr = editor.value.substring(start, end);
    let flags = '';
    if (!findCaseSensitive) flags += 'i';
    try {
      const localRegex = new RegExp(findInput.value, flags);
      replacement = matchedStr.replace(localRegex, replacement);
    } catch (e) {}
  }

  insertWithUndo(start, end, replacement);
  clearTimeout(renderTimer); // ← cancel the debounced render that execCommand's input event just queued
  render();
  countWords();

  /* Re-index matches after the edit, keeping cursor near the same spot */
  runFind();
}

function replaceAll() {
  const query = findInput.value;
  const replacement = replaceInput.value;
  if (!query) return;
  if (findMatches.length === 0) return;

  // Capture the state before replacement
  const beforeState = window.undoManager.capture();

  let flags = 'g';
  if (!findCaseSensitive) flags += 'i';

  let globalRegex;
  if (findUseRegex) {
    try {
      globalRegex = new RegExp(query, flags);
    } catch (e) { return; }
  } else {
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    globalRegex = new RegExp(escapedQuery, flags);
  }

  const newText = editor.value.replace(globalRegex, replacement);

  // If nothing changed (e.g. replacement equals original), do nothing
  if (newText === editor.value) return;

  // Determine a stable cursor position (start of document)
  const newCursorPos = 0;

  // Apply the new text without letting the input event record an extra state
  window.undoManager.ignoreNext = true;
  editor.value = newText;
  editor.setSelectionRange(newCursorPos, newCursorPos);
  const afterState = window.undoManager.capture();
  window.undoManager.recordChange(beforeState, afterState);
  window.undoManager.ignoreNext = false;

  // Refresh the UI and persist
  render();
  countWords();
  try {
    localStorage.setItem(AUTOSAVE_KEY, editor.value);
  } catch (e) {
    // Quota errors are handled elsewhere
  }

  // Re‑run the find logic to clear stale matches and update the counter
  runFind();
}

/* ── Event wiring ────────────────────────────────────────────────────── */
/* ── Event wiring ────────────────────────────────────────────────────── */
findInput.addEventListener('input',   runFind);

if (findCaseBtn) {
  findCaseBtn.addEventListener('click', () => {
    findCaseSensitive = !findCaseSensitive;
    findCaseBtn.classList.toggle('active', findCaseSensitive);
    runFind();
  });
}

if (findRegexBtn) {
  findRegexBtn.addEventListener('click', () => {
    findUseRegex = !findUseRegex;
    findRegexBtn.classList.toggle('active', findUseRegex);
    runFind();
  });
}
findInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.shiftKey ? findPrev() : findNext(); e.preventDefault(); }
  if (e.key === 'Escape') { closeFindBar(); e.preventDefault(); }
});

replaceInput.addEventListener('keydown', e => {
  if (e.key === 'Enter')  { replaceCurrent(); e.preventDefault(); }
  if (e.key === 'Escape') { closeFindBar();   e.preventDefault(); }
});

findPrevBtn  .addEventListener('click', findPrev);
findNextBtn  .addEventListener('click', findNext);
replaceOneBtn.addEventListener('click', replaceCurrent);
replaceAllBtn.addEventListener('click', replaceAll);
findCloseBtn .addEventListener('click', closeFindBar);

/* ── Ctrl+F global shortcut ── */
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key.toLowerCase() === 'f') {
    e.preventDefault(); // Suppress the browser's native find dialog
    if (findBar.style.display === 'none' || findBar.style.display === '') {
      openFindBar();
    } else {
      /* Ctrl+F again while open → focus the find field */
      findInput.focus();
      findInput.select();
    }
  }
});

/* ── Close when Escape is pressed anywhere (even in the editor) ── */
editor.addEventListener('keydown', e => {
  if (e.key === 'Escape' && findBar.style.display !== 'none') {
    closeFindBar();
    e.preventDefault();
  }
});
