// markdown_editor_undo.js
// ── Custom Undo/Redo Manager – Fixed ──────────────────────────────────────

class UndoManager {
  constructor(maxHistory = 30, maxSizeMB = 5) {
    this.stack = [];
    this.index = -1;
    this.maxHistory = maxHistory;
    this.maxSizeBytes = maxSizeMB * 1024 * 1024;
    this.ignoreNext = false;     // prevents recording during undo/redo
  }

  capture() {
    return {
      text: editor.value,
      selStart: editor.selectionStart,
      selEnd: editor.selectionEnd
    };
  }

  estimateSize(state) {
    return state.text.length * 2; // UTF-16 ~2 bytes per char
  }

  push(state) {
  if (this.index < this.stack.length - 1) {
    this.stack = this.stack.slice(0, this.index + 1);
  }
  this.stack.push(state);
  this.index = this.stack.length - 1;

  // Dynamic cap for large documents (>2MB) – reduce history to 10 states
  const stateSize = this.estimateSize(state);
  const isLargeDoc = stateSize > 2 * 1024 * 1024; // 2MB
  const effectiveMaxHistory = isLargeDoc ? 10 : this.maxHistory;

  let totalSize = 0;
  while (this.stack.length > effectiveMaxHistory || (totalSize > this.maxSizeBytes && this.stack.length > 5)) {
    this.stack.shift();
    this.index--;
    totalSize = this.stack.reduce((sum, s) => sum + this.estimateSize(s), 0);
  }
}

  recordChange(before, after) {
    if (before.text === after.text && before.selStart === after.selStart) return;
    this.push(after);
  }

  applyState(state) {
    this.ignoreNext = true;
    editor.value = state.text;
    editor.setSelectionRange(state.selStart, state.selEnd);
    render();
    countWords();
    try {
      localStorage.setItem(AUTOSAVE_KEY, editor.value);
    } catch(e) {}
    this.ignoreNext = false;
  }

  undo() {
    if (this.index <= 0) return false;
    this.index--;
    this.applyState(this.stack[this.index]);
    return true;
  }

  redo() {
    if (this.index >= this.stack.length - 1) return false;
    this.index++;
    this.applyState(this.stack[this.index]);
    return true;
  }

  reset() {
    this.stack = [];
    this.index = -1;
    this.push(this.capture());
  }
}

window.undoManager = new UndoManager();

// ── User typing / paste / delete – record via beforeinput+input ──────────
let beforeState = null;
editor.addEventListener('beforeinput', (e) => {
  if (window.undoManager.ignoreNext) return;
  beforeState = window.undoManager.capture();
});
editor.addEventListener('input', (e) => {
  if (window.undoManager.ignoreNext) return;
  if (beforeState) {
    const afterState = window.undoManager.capture();
    window.undoManager.recordChange(beforeState, afterState);
    beforeState = null;
  }
});

// ── Programmatic insert (used by toolbar, table, etc.) – fixed ────────────
window.insertWithUndo = function(start, end, newText) {
  const before = window.undoManager.capture();
  editor.focus();
  editor.setSelectionRange(start, end);
  editor.setRangeText(newText, start, end, 'end');
  const after = window.undoManager.capture();
  window.undoManager.recordChange(before, after);
  // Manually trigger side effects without double‑recording
  window.undoManager.ignoreNext = true;
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  window.undoManager.ignoreNext = false;
};

window.performTextChange = function(newText, newSelStart = null, newSelEnd = null) {
  const before = window.undoManager.capture();
  try {
    // Disable the input event listener so it doesn't record a second state
    window.undoManager.ignoreNext = true;
    editor.value = newText;
    if (newSelStart !== null && newSelEnd !== null) {
      editor.setSelectionRange(newSelStart, newSelEnd);
    } else {
      editor.setSelectionRange(newText.length, newText.length);
    }
    const after = window.undoManager.capture();
    window.undoManager.recordChange(before, after);
  } finally {
    // Re‑enable the input listener, even if an error occurred
    window.undoManager.ignoreNext = false;
  }
  render();
  countWords();
  try {
    localStorage.setItem(AUTOSAVE_KEY, editor.value);
  } catch(e) {}
};

// ── Keyboard shortcuts ────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'z') {
    e.preventDefault();
    window.undoManager.undo();
  }
  if (e.ctrlKey && e.key === 'y') {
    e.preventDefault();
    window.undoManager.redo();
  }
});

// Also prevent native undo on the textarea itself
editor.addEventListener('keydown', (e) => {
  if (e.ctrlKey && (e.key === 'z' || e.key === 'y')) {
    e.preventDefault();
  }
});

window.undoManager.reset();