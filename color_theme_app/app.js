const {
  useState: useS,
  useEffect: useE,
  useRef: useR,
  useMemo: useM,
  useCallback: useC
} = React;

// Stable IDs for list items that get reordered (e.g. gradient stops).
// Index keys lose focus/in-flight edits on drag-reorder; using identity fixes it.
let __idCounter = 0;
const genStopId = () => 's_' + (++__idCounter).toString(36) + Math.random().toString(36).slice(2, 6);
const withStopId = c => c && c.id ? c : {
  ...c,
  id: genStopId()
};

// Small helpers so localStorage failures (private mode, quota) don't crash effects.
const safeGet = k => {
  try {
    return localStorage.getItem(k);
  } catch (_) {
    return null;
  }
};
const safeSet = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch (_) {/* ignore */}
};

// --------- Custom dropdown (so options use the brand font) ---------
function Dropdown({
  value,
  onChange,
  options,
  leading,
  width
}) {
  const [open, setOpen] = useS(false);
  const wrap = useR(null);
  useE(() => {
    if (!open) return;
    const onDoc = e => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onDoc);
    return () => window.removeEventListener('mousedown', onDoc);
  }, [open]);
  const current = options.find(o => o.value === value);
  return /*#__PURE__*/React.createElement("div", {
    className: 'dd' + (open ? ' open' : ''),
    ref: wrap,
    style: width ? {
      minWidth: width
    } : null
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "dd-trigger",
    onClick: () => setOpen(o => !o),
    "aria-haspopup": "listbox",
    "aria-expanded": open
  }, leading && /*#__PURE__*/React.createElement("span", {
    className: "dd-leading"
  }, leading), /*#__PURE__*/React.createElement("span", {
    className: "dd-current"
  }, current ? current.label : ''), /*#__PURE__*/React.createElement("svg", {
    className: "dd-caret",
    width: "10",
    height: "10",
    viewBox: "0 0 10 10",
    fill: "none",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 4l3 3 3-3",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), open && /*#__PURE__*/React.createElement("ul", {
    className: "dd-menu",
    role: "listbox"
  }, options.map(o => /*#__PURE__*/React.createElement("li", {
    key: o.value,
    role: "option",
    "aria-selected": o.value === value,
    className: 'dd-item' + (o.value === value ? ' on' : ''),
    onClick: () => {
      onChange(o.value);
      setOpen(false);
    }
  }, o.label))));
}

// --------- Copy chip ---------
function CopyRow({
  label,
  value
}) {
  const [copied, setCopied] = useS(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "copy-row",
    onClick: copy,
    title: "Click to copy"
  }, /*#__PURE__*/React.createElement("span", {
    className: "copy-label"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "copy-value"
  }, value), /*#__PURE__*/React.createElement("span", {
    className: "copy-cta"
  }, copied ? 'copied' : 'copy'));
}

// --------- Color outputs (current color, single format readout + tabs) ---------
const FORMAT_DEFS = [{
  key: 'hex',
  label: 'HEX'
}, {
  key: 'rgb',
  label: 'RGB'
}, {
  key: 'hsl',
  label: 'HSL'
}, {
  key: 'hsv',
  label: 'HSV'
}, {
  key: 'oklch',
  label: 'OKLCH'
}, {
  key: 'cmyk',
  label: 'CMYK'
}];
function ColorOutputs({
  rgb,
  format,
  setFormat
}) {
  const f = ColorUtil.format(rgb);
  const valueByKey = {
    hex: f.hex,
    rgb: f.rgb,
    hsl: f.hsl,
    hsv: f.hsv,
    oklch: f.oklch,
    cmyk: f.cmyk
  };
  const current = valueByKey[format] || f.hex;
  const [copied, setCopied] = useS(false);
  const copy = () => {
    navigator.clipboard.writeText(current).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "outputs"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fmt-tabs",
    role: "tablist"
  }, FORMAT_DEFS.map(x => /*#__PURE__*/React.createElement("button", {
    key: x.key,
    role: "tab",
    "aria-selected": format === x.key,
    className: 'fmt-tab' + (format === x.key ? ' on' : ''),
    onClick: () => setFormat(x.key)
  }, x.label))), /*#__PURE__*/React.createElement("button", {
    className: "readout",
    onClick: copy,
    title: "Click to copy"
  }, /*#__PURE__*/React.createElement("span", {
    className: "readout-value"
  }, current), /*#__PURE__*/React.createElement("span", {
    className: "readout-cta"
  }, copied ? 'copied' : 'copy')), f.name && /*#__PURE__*/React.createElement("div", {
    className: "readout-name"
  }, /*#__PURE__*/React.createElement("span", {
    className: "rn-label"
  }, "named"), /*#__PURE__*/React.createElement("span", {
    className: "rn-value"
  }, f.name)));
}

// --------- Named colors panel ---------
function NamedColors({
  onPick,
  currentHex
}) {
  const [q, setQ] = useS('');
  const list = useM(() => {
    const all = window.CSS_NAMED_COLORS;
    if (!q) return all;
    return all.filter(([n]) => n.includes(q.toLowerCase()));
  }, [q]);
  return /*#__PURE__*/React.createElement("section", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("header", {
    className: "panel-h"
  }, /*#__PURE__*/React.createElement("h3", null, "HTML Color Names"), /*#__PURE__*/React.createElement("input", {
    className: "search",
    placeholder: "search\u2026",
    value: q,
    onChange: e => setQ(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "named-grid"
  }, list.map(([n, h]) => /*#__PURE__*/React.createElement("button", {
    key: n,
    className: 'named-chip' + (h.toLowerCase() === currentHex.toLowerCase() ? ' on' : ''),
    onClick: () => onPick(h),
    title: `${n} ${h}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "named-sw",
    style: {
      background: h
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "named-text"
  }, /*#__PURE__*/React.createElement("span", {
    className: "named-name"
  }, n), /*#__PURE__*/React.createElement("span", {
    className: "named-hex"
  }, h.toUpperCase())))), list.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "empty"
  }, "no matches")));
}

// --------- Harmonies ---------
// Clicking a harmony chip copies its color code (in the active format) to the
// clipboard, with brief "copied" feedback — it does NOT change the picker.
function HarmonyChip({
  color,
  format
}) {
  const [copied, setCopied] = useS(false);
  const css = ColorUtil.toCss(color);
  const label = ColorUtil.formatRgbAs(color, format || 'hex');
  const copy = () => {
    navigator.clipboard.writeText(label).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    }).catch(() => {});
  };
  return /*#__PURE__*/React.createElement("button", {
    className: 'harm-chip' + (copied ? ' copied' : ''),
    onClick: copy,
    title: `${label} — click to copy`
  }, /*#__PURE__*/React.createElement("span", {
    className: "harm-sw checker",
    style: {
      '--swatch-color': css
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "harm-copied"
  }, "copied")), /*#__PURE__*/React.createElement("span", {
    className: "harm-hex"
  }, label));
}
function Harmonies({
  hsv,
  alpha,
  mode,
  setMode,
  count,
  setCount,
  spread,
  setSpread,
  harmonyHues,
  format,
  onPick,
  onSave
}) {
  const colors = useM(() => {
    return harmonyHues.map(h => {
      const c = ColorUtil.hsvToRgb(h, hsv.s, hsv.v);
      c.a = alpha == null ? 1 : alpha;
      return c;
    });
  }, [harmonyHues, hsv.s, hsv.v, alpha]);
  const maxSpread = mode === 'analogous' ? 90 : 60;
  const spreadLabel = mode === 'analogous' ? 'Spread' : 'Distance from complement';
  // Display the clamped value so the readout matches the slider + generated
  // colors when a >maxSpread value carries over from the other mode.
  const shownSpread = Math.min(spread, maxSpread);
  return /*#__PURE__*/React.createElement("section", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("header", {
    className: "panel-h"
  }, /*#__PURE__*/React.createElement("h3", null, "Color Harmonies"), /*#__PURE__*/React.createElement("div", {
    className: "seg"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'seg-btn' + (mode === 'analogous' ? ' on' : ''),
    onClick: () => setMode('analogous')
  }, "Analogous"), /*#__PURE__*/React.createElement("button", {
    className: 'seg-btn' + (mode === 'split' ? ' on' : ''),
    onClick: () => setMode('split')
  }, "Split-comp"))), mode === 'analogous' && /*#__PURE__*/React.createElement("div", {
    className: "row-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, /*#__PURE__*/React.createElement("span", null, "Count"), /*#__PURE__*/React.createElement("span", {
    className: "lbl-val"
  }, count)), /*#__PURE__*/React.createElement("div", {
    className: "seg seg-full"
  }, [3, 4, 5, 7].map(n => /*#__PURE__*/React.createElement("button", {
    key: n,
    className: 'seg-btn' + (count === n ? ' on' : ''),
    onClick: () => setCount(n)
  }, n)))), /*#__PURE__*/React.createElement("div", {
    className: "harm-row"
  }, colors.map((c, i) => /*#__PURE__*/React.createElement(HarmonyChip, {
    key: i,
    color: c,
    format: format
  }))), /*#__PURE__*/React.createElement("div", {
    className: "row-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, /*#__PURE__*/React.createElement("span", null, spreadLabel), /*#__PURE__*/React.createElement("span", {
    className: "lbl-val"
  }, shownSpread, "\xB0")), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: 5,
    max: maxSpread,
    value: Math.min(spread, maxSpread),
    onChange: e => setSpread(Number(e.target.value))
  })), /*#__PURE__*/React.createElement("div", {
    className: "grad-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => onSave && onSave({
      type: 'harmony',
      colors,
      mode,
      count,
      spread: shownSpread,
      baseHsv: {
        h: hsv.h,
        s: hsv.s,
        v: hsv.v
      },
      alpha: alpha == null ? 1 : alpha
    }),
    title: "Save harmony to library (remembers mode + spread)"
  }, "\u2606 save palette")));
}

// --------- Gradient generator ---------
function Gradient({
  currentHex,
  currentRgb,
  format,
  stops,
  setStops,
  onSave
}) {
  const [steps, setSteps] = useS(7);
  const [activeId, setActiveId] = useS(() => stops[0] && stops[0].id || null);
  const stopFormat = format || 'hex';
  const [dragId, setDragId] = useS(null);
  const [overId, setOverId] = useS(null);

  // Ensure every stop has a stable id. This survives reorders, edits,
  // and remounts — so React reconciles by identity (not position),
  // preserving focus + the `drafts` map below.
  useE(() => {
    if (stops.some(s => !s.id)) {
      setStops(prev => prev.map(s => s.id ? s : withStopId(s)));
    }
  }, [stops, setStops]);

  // Keep activeId pointing at a real stop (e.g. after loading a new gradient
  // from the library, the previously-active id no longer exists).
  useE(() => {
    if (!stops.length) return;
    if (!activeId || !stops.some(s => s.id === activeId)) {
      setActiveId(stops[0].id || null);
    }
  }, [stops, activeId]);

  // Per-stop text being typed, keyed by stop id (NOT index — so a
  // partial edit follows the color even if the stop is dragged).
  const [drafts, setDrafts] = useS({}); // { [id]: string }
  const formattedFor = s => {
    if (drafts[s.id] !== undefined) return drafts[s.id];
    return ColorUtil.formatRgbAs(s, stopFormat);
  };
  // When format toggles, clear drafts so all inputs reflect new format
  useE(() => {
    setDrafts({});
  }, [stopFormat]);
  const idAt = i => stops[i] && stops[i].id;
  const indexOf = id => stops.findIndex(s => s.id === id);
  const onDragStart = id => e => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(id));
    } catch (_) {}
  };
  const onDragOver = id => e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overId !== id) setOverId(id);
  };
  const onDragLeave = id => e => {
    if (overId === id) setOverId(null);
  };
  const onDrop = targetId => e => {
    e.preventDefault();
    const from = dragId;
    setDragId(null);
    setOverId(null);
    if (from == null || from === targetId) return;
    setStops(prev => {
      const fromIdx = prev.findIndex(s => s.id === from);
      const toIdx = prev.findIndex(s => s.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const arr = prev.slice();
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return arr;
    });
    // activeId tracks identity, so it follows the moved stop automatically.
  };
  const onDragEnd = () => {
    setDragId(null);
    setOverId(null);
  };
  const swatches = useM(() => {
    return ColorUtil.gradientSteps(stops, steps);
  }, [stops, steps]);
  const setStop = (id, raw) => {
    setDrafts(d => ({
      ...d,
      [id]: raw
    }));
    const c = ColorUtil.parseColor(raw);
    if (c) setStops(s => s.map(x => x.id === id ? {
      ...c,
      id: x.id
    } : x));
  };
  const commitStop = id => {
    setDrafts(d => {
      const {
        [id]: _,
        ...rest
      } = d;
      return rest;
    });
  };
  const addStop = () => setStops(s => [...s, withStopId({
    ...currentRgb
  })]);
  const removeStop = id => setStops(s => s.length > 2 ? s.filter(x => x.id !== id) : s);
  const useCurrent = () => {
    if (!activeId) return;
    setStops(s => s.map(x => x.id === activeId ? {
      ...currentRgb,
      id: x.id
    } : x));
    setDrafts(d => {
      const {
        [activeId]: _,
        ...rest
      } = d;
      return rest;
    });
  };
  const copyCSS = () => {
    const list = stops.map(c => ColorUtil.toCss(c)).join(', ');
    navigator.clipboard.writeText(`linear-gradient(90deg, ${list})`);
  };
  const copySteps = () => {
    const list = swatches.map(c => ColorUtil.formatRgbAs(c, stopFormat)).join(stopFormat === 'hex' ? ', ' : ' | ');
    navigator.clipboard.writeText(list);
  };
  return /*#__PURE__*/React.createElement("section", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("header", {
    className: "panel-h"
  }, /*#__PURE__*/React.createElement("h3", null, "Gradient")), /*#__PURE__*/React.createElement("div", {
    className: "grad-bar",
    style: {
      '--grad-stops': `linear-gradient(to right, ${stops.map(c => ColorUtil.toCss(c)).join(', ')})`
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "grad-stops"
  }, stops.map((c, i) => {
    const id = c.id;
    const hex = ColorUtil.rgbToHex(c.r, c.g, c.b, c.a).toUpperCase();
    const css = ColorUtil.toCss(c);
    const cls = 'stop' + (activeId === id ? ' on' : '') + (dragId === id ? ' dragging' : '') + (overId === id && dragId !== null && dragId !== id ? ' over' : '');
    return /*#__PURE__*/React.createElement("div", {
      key: id,
      className: cls,
      draggable: true,
      onDragStart: onDragStart(id),
      onDragOver: onDragOver(id),
      onDragLeave: onDragLeave(id),
      onDrop: onDrop(id),
      onDragEnd: onDragEnd,
      onClick: () => setActiveId(id)
    }, /*#__PURE__*/React.createElement("span", {
      className: "stop-handle",
      title: "Drag to reorder",
      "aria-hidden": "true"
    }, "\u22EE\u22EE"), /*#__PURE__*/React.createElement("span", {
      className: "stop-sw checker",
      style: {
        '--swatch-color': css
      }
    }), /*#__PURE__*/React.createElement("input", {
      type: "text",
      className: 'stop-input fmt-' + stopFormat,
      value: formattedFor(c),
      onChange: e => setStop(id, e.target.value),
      onBlur: () => commitStop(id),
      onFocus: () => setActiveId(id),
      onMouseDown: e => e.stopPropagation(),
      placeholder: stopFormat === 'hex' ? '#000000' : stopFormat === 'rgb' ? 'R, G, B' : stopFormat === 'hsl' ? 'H, S%, L%' : stopFormat === 'hsv' ? 'H, S%, V%' : stopFormat === 'oklch' ? 'L C H' : 'C%, M%, Y%, K%',
      spellCheck: false
    }), /*#__PURE__*/React.createElement("button", {
      className: "x",
      onClick: e => {
        e.stopPropagation();
        removeStop(id);
      },
      title: "remove"
    }, "\xD7"));
  }), /*#__PURE__*/React.createElement("button", {
    className: "add-stop",
    onClick: addStop
  }, "+ stop"), /*#__PURE__*/React.createElement("button", {
    className: "add-stop",
    onClick: useCurrent,
    title: "Replace selected stop with current color"
  }, "set from current")), /*#__PURE__*/React.createElement("div", {
    className: "row-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, /*#__PURE__*/React.createElement("span", null, "Steps"), /*#__PURE__*/React.createElement("span", {
    className: "lbl-val"
  }, steps)), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: 2,
    max: 24,
    value: steps,
    onChange: e => setSteps(Number(e.target.value))
  })), /*#__PURE__*/React.createElement("div", {
    className: "grad-swatches"
  }, swatches.map((c, i) => {
    const hex = ColorUtil.rgbToHex(c.r, c.g, c.b, c.a).toUpperCase();
    const css = ColorUtil.toCss(c);
    const label = ColorUtil.formatRgbAs(c, stopFormat);
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      className: "grad-sw",
      onClick: () => navigator.clipboard.writeText(label),
      title: `${label} — click to copy`
    }, /*#__PURE__*/React.createElement("span", {
      className: "grad-sw-color checker",
      style: {
        '--swatch-color': css
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: 'grad-sw-hex fmt-' + stopFormat
    }, label));
  })), /*#__PURE__*/React.createElement("div", {
    className: "grad-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: copyCSS
  }, "copy CSS"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: copySteps
  }, "copy steps"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => onSave && onSave(stops),
    title: "Save current stops to library"
  }, "\u2606 save")));
}

// --------- Image palette extractor ---------
// Tiny seeded PRNG so re-extracting the same image yields the same palette.
const _hash32 = s => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const _mulberry32 = seed => {
  let a = seed >>> 0;
  return () => {
    a = a + 0x6D2B79F5 >>> 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};
function ImageExtractor({
  onPick,
  format,
  onSave
}) {
  const [src, setSrc] = useS(null);
  const [palette, setPalette] = useS([]);
  const [count, setCount] = useS(6);
  const [eyedrop, setEyedrop] = useS(false);
  const [hover, setHover] = useS(null); // { x, y, hex, css }
  const imgRef = useR(null);
  const pickCanvasRef = useR(null);
  const fileInputRef = useR(null);
  const [dragOver, setDragOver] = useS(false);
  const onFile = file => {
    if (!file || !file.type || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => setSrc(e.target.result);
    reader.readAsDataURL(file);
  };
  const onZoneDragOver = e => {
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  };
  const onZoneDragLeave = e => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOver(false);
  };
  const onZoneDrop = e => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  // Build a full-resolution offscreen canvas so eyedropper reads exact pixels.
  useE(() => {
    if (!src) {
      pickCanvasRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      pickCanvasRef.current = c;
    };
    img.src = src;
  }, [src]);
  const sampleAt = (clientX, clientY) => {
    const imgEl = imgRef.current;
    const c = pickCanvasRef.current;
    if (!imgEl || !c) return null;
    const rect = imgEl.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
    const px = Math.max(0, Math.min(c.width - 1, Math.floor(x / rect.width * c.width)));
    const py = Math.max(0, Math.min(c.height - 1, Math.floor(y / rect.height * c.height)));
    const d = c.getContext('2d').getImageData(px, py, 1, 1).data;
    // Skip near-transparent pixels — premultiplied RGB is meaningless there.
    if (d[3] < 13) return null;
    const a = d[3] / 255;
    const hex = ColorUtil.rgbToHex(d[0], d[1], d[2], a).toUpperCase();
    const css = a >= 0.9999 ? `rgb(${d[0]}, ${d[1]}, ${d[2]})` : `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${a.toFixed(3)})`;
    return {
      x,
      y,
      hex,
      css
    };
  };
  const onImgMove = e => {
    if (!eyedrop) return;
    const s = sampleAt(e.clientX, e.clientY);
    setHover(s); // null when over a transparent pixel
  };
  const onImgLeave = () => setHover(null);
  const onImgClick = e => {
    if (!eyedrop) return;
    e.preventDefault();
    e.stopPropagation();
    const s = sampleAt(e.clientX, e.clientY);
    if (s) onPick(s.hex);
  };

  // K-means in OKLab. Seeded by the image data URL so re-picking the same
  // image with the same `k` yields the same palette every time.
  const extract = useC((imageEl, k) => {
    const c = document.createElement('canvas');
    const max = 120;
    const sc = Math.min(max / imageEl.naturalWidth, max / imageEl.naturalHeight, 1);
    c.width = Math.max(1, Math.floor(imageEl.naturalWidth * sc));
    c.height = Math.max(1, Math.floor(imageEl.naturalHeight * sc));
    const ctx = c.getContext('2d');
    ctx.drawImage(imageEl, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const pts = [];
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 128) continue;
      pts.push(ColorUtil.rgbToOklab(data[i], data[i + 1], data[i + 2]));
    }
    if (pts.length === 0) return [];
    const rng = _mulberry32(_hash32((imageEl.src || '') + '|k=' + k));

    // init: k random unique points (seeded)
    const cents = [];
    const used = new Set();
    while (cents.length < k && used.size < pts.length) {
      const idx = Math.floor(rng() * pts.length);
      if (used.has(idx)) continue;
      used.add(idx);
      cents.push({
        ...pts[idx]
      });
    }
    while (cents.length < k) cents.push({
      ...pts[Math.floor(rng() * pts.length)]
    });
    for (let it = 0; it < 12; it++) {
      const sums = cents.map(() => ({
        L: 0,
        a: 0,
        b: 0,
        n: 0
      }));
      for (const p of pts) {
        let best = 0,
          bd = Infinity;
        for (let j = 0; j < cents.length; j++) {
          const dL = p.L - cents[j].L,
            da = p.a - cents[j].a,
            db = p.b - cents[j].b;
          const d = dL * dL + da * da + db * db;
          if (d < bd) {
            bd = d;
            best = j;
          }
        }
        sums[best].L += p.L;
        sums[best].a += p.a;
        sums[best].b += p.b;
        sums[best].n++;
      }
      for (let j = 0; j < cents.length; j++) {
        if (sums[j].n > 0) {
          cents[j] = {
            L: sums[j].L / sums[j].n,
            a: sums[j].a / sums[j].n,
            b: sums[j].b / sums[j].n
          };
        }
      }
    }
    // count for sort
    const counts = cents.map(() => 0);
    for (const p of pts) {
      let best = 0,
        bd = Infinity;
      for (let j = 0; j < cents.length; j++) {
        const dL = p.L - cents[j].L,
          da = p.a - cents[j].a,
          db = p.b - cents[j].b;
        const d = dL * dL + da * da + db * db;
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      counts[best]++;
    }
    const out = cents.map((c, i) => ({
      ...ColorUtil.oklabToRgb(c.L, c.a, c.b),
      w: counts[i]
    })).sort((a, b) => b.w - a.w);
    return out;
  }, []);
  useE(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () => setPalette(extract(img, count));
    img.src = src;
  }, [src, count, extract]);
  useE(() => {
    if (!eyedrop) return;
    const onKey = e => {
      if (e.key === 'Escape') {
        setEyedrop(false);
        setHover(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [eyedrop]);
  return /*#__PURE__*/React.createElement("section", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("header", {
    className: "panel-h"
  }, /*#__PURE__*/React.createElement("h3", null, "Palette from Image"), /*#__PURE__*/React.createElement("div", {
    className: "seg"
  }, [4, 6, 8, 10].map(n => /*#__PURE__*/React.createElement("button", {
    key: n,
    className: 'seg-btn' + (count === n ? ' on' : ''),
    onClick: () => setCount(n)
  }, n)))), /*#__PURE__*/React.createElement("label", {
    className: 'dropzone' + (eyedrop && src ? ' eyedrop' : '') + (dragOver ? ' drag-over' : ''),
    onClick: e => {
      if (src) e.preventDefault();
    },
    onDragOver: onZoneDragOver,
    onDragLeave: onZoneDragLeave,
    onDrop: onZoneDrop
  }, src ? /*#__PURE__*/React.createElement("div", {
    className: "img-wrap"
  }, /*#__PURE__*/React.createElement("img", {
    ref: imgRef,
    src: src,
    alt: "",
    draggable: false,
    onMouseMove: onImgMove,
    onMouseLeave: onImgLeave,
    onClick: onImgClick
  }), eyedrop && hover && /*#__PURE__*/React.createElement("div", {
    className: "eyedrop-cursor",
    style: {
      left: hover.x,
      top: hover.y
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyedrop-ring",
    style: {
      '--swatch-color': hover.css
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "eyedrop-tag"
  }, hover.hex))) : /*#__PURE__*/React.createElement("div", {
    className: "dz-empty"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dz-text"
  }, "drop image or click to upload")), /*#__PURE__*/React.createElement("input", {
    ref: fileInputRef,
    type: "file",
    accept: "image/*",
    onChange: e => onFile(e.target.files[0]),
    onClick: e => e.stopPropagation(),
    hidden: true
  })), src && /*#__PURE__*/React.createElement("div", {
    className: "grad-actions eyedrop-bar"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'btn' + (eyedrop ? ' btn-on' : ''),
    onClick: () => setEyedrop(v => !v),
    title: "Click anywhere on the image to set the current color"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyedrop-glyph",
    "aria-hidden": "true"
  }, "\u2299"), eyedrop ? 'picking — click image' : 'pick from image'), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => fileInputRef.current && fileInputRef.current.click(),
    title: "Replace the current image"
  }, "change image"), /*#__PURE__*/React.createElement("span", {
    className: "eyedrop-hint"
  }, eyedrop ? 'esc / toggle off to stop' : '')), palette.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "grad-swatches"
  }, palette.map((c, i) => {
    const hex = ColorUtil.rgbToHex(c.r, c.g, c.b, c.a).toUpperCase();
    const css = ColorUtil.toCss(c);
    const label = ColorUtil.formatRgbAs(c, format || 'hex');
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      className: "grad-sw",
      onClick: () => onPick(hex),
      title: hex
    }, /*#__PURE__*/React.createElement("span", {
      className: "grad-sw-color checker",
      style: {
        '--swatch-color': css
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: 'grad-sw-hex fmt-' + (format || 'hex')
    }, label));
  })), /*#__PURE__*/React.createElement("div", {
    className: "grad-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => {
      const list = palette.map(c => ColorUtil.formatRgbAs(c, format || 'hex')).join((format || 'hex') === 'hex' ? ', ' : ' | ');
      navigator.clipboard.writeText(list);
    }
  }, "copy palette"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => onSave && onSave(palette)
  }, "\u2606 save"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setSrc(null)
  }, "clear"))));
}

// --------- Library (saved palettes + gradients, persisted to localStorage) ---------
function Library({
  items,
  onLoadGradient,
  onLoadPalette,
  onRename,
  onRemove,
  onPick,
  onImport,
  onExport,
  format
}) {
  const [filter, setFilter] = useS('all'); // all | gradient | palette
  const [msg, setMsg] = useS(null); // { kind: 'ok'|'err', text }
  const fileRef = useR(null);
  const list = items.filter(it => filter === 'all' || it.type === filter);
  const flash = (kind, text) => {
    setMsg({
      kind,
      text
    });
    setTimeout(() => setMsg(m => m && m.text === text ? null : m), 2600);
  };
  const triggerImport = () => fileRef.current && fileRef.current.click();
  const onFile = e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-import of same file
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        const result = onImport(data);
        const bits = [];
        if (result.added > 0) bits.push(`${result.added} added`);
        if (result.renamed > 0) bits.push(`${result.renamed} renamed`);
        if (result.skipped > 0) bits.push(`${result.skipped} unchanged`);
        if (bits.length === 0) {
          flash('err', 'No valid items in file');
        } else if (result.added === 0 && result.renamed === 0) {
          flash('ok', `Nothing new — ${result.skipped} already in library`);
        } else {
          flash('ok', 'Imported · ' + bits.join(' · '));
        }
      } catch (err) {
        flash('err', 'Could not parse file');
      }
    };
    reader.readAsText(file);
  };
  const handleExport = () => {
    onExport();
    flash('ok', `Exported ${items.length} item${items.length === 1 ? '' : 's'}`);
  };
  const ioControls = /*#__PURE__*/React.createElement("div", {
    className: "lib-io"
  }, /*#__PURE__*/React.createElement("input", {
    ref: fileRef,
    type: "file",
    accept: "application/json,.json",
    onChange: onFile,
    hidden: true
  }), /*#__PURE__*/React.createElement("button", {
    className: "lib-io-btn",
    onClick: triggerImport,
    title: "Import library from a .json file"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "none",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 1.5v6m0 0L3.5 5M6 7.5L8.5 5M2 9.5h8",
    stroke: "currentColor",
    strokeWidth: "1.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), "import"), /*#__PURE__*/React.createElement("button", {
    className: "lib-io-btn",
    onClick: handleExport,
    disabled: items.length === 0,
    title: items.length === 0 ? 'Library is empty' : 'Download library as .json'
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "none",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 7.5v-6m0 0L3.5 4M6 1.5L8.5 4M2 9.5h8",
    stroke: "currentColor",
    strokeWidth: "1.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), "export"));
  if (items.length === 0) {
    return /*#__PURE__*/React.createElement("section", {
      className: "panel library-panel"
    }, /*#__PURE__*/React.createElement("header", {
      className: "panel-h"
    }, /*#__PURE__*/React.createElement("h3", null, "Library"), ioControls), /*#__PURE__*/React.createElement("div", {
      className: "lib-empty"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lib-empty-icon"
    }, "\u2605"), /*#__PURE__*/React.createElement("div", {
      className: "lib-empty-text"
    }, "No saved items yet. Use ", /*#__PURE__*/React.createElement("em", null, "save"), " in Harmonies, Gradient, or Image palette to build your library \u2014 or ", /*#__PURE__*/React.createElement("em", null, "import"), " a previously exported ", /*#__PURE__*/React.createElement("code", null, ".json"), " file.")), msg && /*#__PURE__*/React.createElement("div", {
      className: 'lib-msg lib-msg-' + msg.kind
    }, msg.text));
  }
  return /*#__PURE__*/React.createElement("section", {
    className: "panel library-panel"
  }, /*#__PURE__*/React.createElement("header", {
    className: "panel-h"
  }, /*#__PURE__*/React.createElement("h3", null, "Library ", /*#__PURE__*/React.createElement("span", {
    className: "lib-count"
  }, items.length)), /*#__PURE__*/React.createElement("div", {
    className: "lib-header-tools"
  }, /*#__PURE__*/React.createElement("div", {
    className: "seg"
  }, [{
    v: 'all',
    l: 'All'
  }, {
    v: 'gradient',
    l: 'Gradients'
  }, {
    v: 'palette',
    l: 'Palettes'
  }].map(o => /*#__PURE__*/React.createElement("button", {
    key: o.v,
    className: 'seg-btn' + (filter === o.v ? ' on' : ''),
    onClick: () => setFilter(o.v)
  }, o.l))), ioControls)), /*#__PURE__*/React.createElement("div", {
    className: "lib-grid"
  }, list.map(it => /*#__PURE__*/React.createElement(LibraryItem, {
    key: it.id,
    item: it,
    onLoad: () => it.type === 'gradient' ? onLoadGradient(it) : onLoadPalette(it),
    onRename: name => onRename(it.id, name),
    onRemove: () => onRemove(it.id),
    onPick: onPick,
    format: format
  }))), msg && /*#__PURE__*/React.createElement("div", {
    className: 'lib-msg lib-msg-' + msg.kind
  }, msg.text));
}
function LibraryItem({
  item,
  onLoad,
  onRename,
  onRemove,
  onPick,
  format
}) {
  const [editing, setEditing] = useS(false);
  const [name, setName] = useS(item.name);
  useE(() => setName(item.name), [item.name]);
  const colors = item.type === 'gradient' ? item.stops : item.colors;
  const previewBg = item.type === 'gradient' ? `linear-gradient(to right, ${colors.map(c => ColorUtil.toCss(c)).join(', ')})` : null;
  return /*#__PURE__*/React.createElement("div", {
    className: "lib-card"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'lib-preview ' + (item.type === 'gradient' ? 'lib-grad' : 'lib-pal'),
    onClick: onLoad,
    title: item.type === 'gradient' ? 'Load into gradient' : undefined
  }, item.type === 'gradient' ? /*#__PURE__*/React.createElement("span", {
    className: "lib-grad-bar",
    style: {
      '--grad-stops': previewBg
    }
  }) : /*#__PURE__*/React.createElement("span", {
    className: "lib-pal-row"
  }, colors.map((c, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "lib-pal-sw checker",
    style: {
      '--swatch-color': ColorUtil.toCss(c)
    },
    onClick: e => {
      e.stopPropagation();
      onPick(ColorUtil.rgbToHex(c.r, c.g, c.b, c.a).toUpperCase());
    },
    title: ColorUtil.formatRgbAs(c, format || 'hex')
  })))), /*#__PURE__*/React.createElement("div", {
    className: "lib-meta"
  }, editing ? /*#__PURE__*/React.createElement("input", {
    className: "lib-name-input",
    autoFocus: true,
    value: name,
    onChange: e => setName(e.target.value),
    onBlur: () => {
      onRename(name.trim() || item.name);
      setEditing(false);
    },
    onKeyDown: e => {
      if (e.key === 'Enter') {
        onRename(name.trim() || item.name);
        setEditing(false);
      }
      if (e.key === 'Escape') {
        setName(item.name);
        setEditing(false);
      }
    }
  }) : /*#__PURE__*/React.createElement("button", {
    className: "lib-name",
    onClick: () => setEditing(true),
    title: "Rename"
  }, item.name), /*#__PURE__*/React.createElement("div", {
    className: "lib-meta-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "lib-type"
  }, item.type === 'gradient' ? `gradient · ${colors.length} stops` : item.meta && item.meta.type === 'harmony' ? `${item.meta.mode === 'split' ? 'split-comp' : 'analogous'} · ${colors.length} · ${item.meta.spread}°` : `palette · ${colors.length} colors`), /*#__PURE__*/React.createElement("button", {
    className: "lib-load",
    onClick: onLoad,
    title: item.type === 'gradient' ? 'Load into gradient' : 'Load palette into picker + gradient'
  }, "load \u21A9"))), /*#__PURE__*/React.createElement("button", {
    className: "lib-x",
    onClick: onRemove,
    title: "Delete"
  }, "\xD7"));
}

// --------- App ---------
function App() {
  // Theme. Falls back to the OS preference, and follows OS changes UNTIL the
  // user explicitly toggles (after which the explicit choice is persisted).
  const themeIsExplicit = useR(!!safeGet('cw-theme'));
  const [theme, setTheme] = useS(() => {
    const saved = safeGet('cw-theme');
    if (saved) return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useE(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeIsExplicit.current) safeSet('cw-theme', theme);
  }, [theme]);
  useE(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = e => {
      if (!themeIsExplicit.current) setTheme(e.matches ? 'dark' : 'light');
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, []);
  const toggleTheme = () => {
    themeIsExplicit.current = true;
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  };
  const [fontSize, setFontSize] = useS(() => safeGet('cw-fontsize') || 'md');
  useE(() => {
    document.documentElement.setAttribute('data-fontsize', fontSize);
    safeSet('cw-fontsize', fontSize);
  }, [fontSize]);
  const [colorFormat, setColorFormat] = useS(() => safeGet('cw-format') || 'hex');
  useE(() => {
    safeSet('cw-format', colorFormat);
  }, [colorFormat]);

  // Gradient stops live here so the Library can load into them.
  // Each stop carries a stable `id` so React reconciles by identity through
  // drag-reorder (preserving focus / in-flight text edits on .stop-input).
  const [gradStops, setGradStops] = useS(() => [withStopId({
    r: 245,
    g: 234,
    b: 215,
    a: 1
  }), withStopId({
    r: 38,
    g: 70,
    b: 83,
    a: 1
  })]);

  // Library (palettes + gradients), persisted.
  const [library, setLibrary] = useS(() => {
    try {
      return JSON.parse(safeGet('cw-library') || '[]');
    } catch (e) {
      return [];
    }
  });
  useE(() => {
    safeSet('cw-library', JSON.stringify(library));
  }, [library]);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const countByType = type => library.filter(it => it.type === type).length;
  const savePalette = input => {
    // Accept either a bare colors array OR an object { colors, ...meta }
    let colors,
      meta = null;
    if (Array.isArray(input)) {
      colors = input;
    } else if (input && Array.isArray(input.colors)) {
      const {
        colors: c,
        ...rest
      } = input;
      colors = c;
      meta = rest;
    } else {
      return;
    }
    if (!colors || colors.length === 0) return;
    const copy = colors.map(c => ({
      r: c.r,
      g: c.g,
      b: c.b,
      a: c.a == null ? 1 : c.a
    }));
    const isHarmony = meta && meta.type === 'harmony';
    const baseName = isHarmony ? `${meta.mode === 'split' ? 'Split-comp' : 'Analogous'} ${countByType('palette') + 1}` : `Palette ${countByType('palette') + 1}`;
    setLibrary(L => [{
      id: uid(),
      type: 'palette',
      name: baseName,
      colors: copy,
      meta,
      created: Date.now()
    }, ...L]);
  };
  const saveGradient = stops => {
    if (!stops || stops.length < 2) return;
    const copy = stops.map(c => ({
      r: c.r,
      g: c.g,
      b: c.b,
      a: c.a == null ? 1 : c.a
    }));
    setLibrary(L => [{
      id: uid(),
      type: 'gradient',
      name: `Gradient ${countByType('gradient') + 1}`,
      stops: copy,
      created: Date.now()
    }, ...L]);
  };
  const renameLib = (id, name) => setLibrary(L => L.map(it => it.id === id ? {
    ...it,
    name
  } : it));
  const removeLib = id => setLibrary(L => L.filter(it => it.id !== id));

  // ---- Import / Export ----
  const normColor = c => {
    if (!c || typeof c !== 'object') return null;
    const r = Number(c.r),
      g = Number(c.g),
      b = Number(c.b);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
    const clamp = x => Math.max(0, Math.min(255, Math.round(x)));
    const a = c.a == null ? 1 : Math.max(0, Math.min(1, Number(c.a)));
    return {
      r: clamp(r),
      g: clamp(g),
      b: clamp(b),
      a: Number.isFinite(a) ? a : 1
    };
  };
  const sigOf = item => {
    const arr = item.type === 'gradient' ? item.stops : item.colors;
    return item.type + ':' + arr.map(c => `${c.r},${c.g},${c.b},${c.a}`).join('|');
  };
  const validateItem = raw => {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.type === 'gradient') {
      const stops = Array.isArray(raw.stops) ? raw.stops.map(normColor).filter(Boolean) : [];
      if (stops.length < 2) return null;
      return {
        id: uid(),
        type: 'gradient',
        name: String(raw.name || `Gradient`),
        stops,
        created: Number(raw.created) || Date.now()
      };
    }
    if (raw.type === 'palette') {
      const colors = Array.isArray(raw.colors) ? raw.colors.map(normColor).filter(Boolean) : [];
      if (colors.length === 0) return null;
      const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : null;
      return {
        id: uid(),
        type: 'palette',
        name: String(raw.name || `Palette`),
        colors,
        meta,
        created: Number(raw.created) || Date.now()
      };
    }
    return null;
  };
  const importLibrary = data => {
    // Accept either { items: [...] } envelope OR a bare array of items.
    const raw = Array.isArray(data) ? data : data && Array.isArray(data.items) ? data.items : null;
    if (!raw) return {
      added: 0,
      skipped: 0,
      renamed: 0
    };
    const incoming = raw.map(validateItem).filter(Boolean);
    if (incoming.length === 0) return {
      added: 0,
      skipped: 0,
      renamed: 0
    };
    // Merge OUTSIDE the state updater: updaters must be pure (React may call
    // them more than once), and the counts are needed synchronously below.
    let added = 0,
      skipped = 0,
      renamed = 0;
    const sigToIdx = new Map();
    library.forEach((it, i) => sigToIdx.set(sigOf(it), i));
    const next = library.slice();
    const fresh = [];
    for (const it of incoming) {
      const s = sigOf(it);
      if (sigToIdx.has(s)) {
        const idx = sigToIdx.get(s);
        if (next[idx].name !== it.name) {
          next[idx] = {
            ...next[idx],
            name: it.name
          };
          renamed++;
        } else {
          skipped++;
        }
      } else {
        fresh.push(it);
        added++;
      }
    }
    setLibrary([...fresh, ...next]);
    return {
      added,
      skipped,
      renamed
    };
  };
  const exportLibrary = () => {
    const payload = {
      type: 'color-workbench-library',
      version: 1,
      exported: new Date().toISOString(),
      items: library
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `color-workbench-library-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const loadGradient = item => setGradStops(item.stops.map(c => withStopId({
    ...c,
    id: undefined
  })));
  const loadPalette = item => {
    // If saved from Harmonies, restore the harmony controls + base color so the
    // panel regenerates the same colors.
    if (item.meta && item.meta.type === 'harmony') {
      const m = item.meta;
      if (m.baseHsv) setHsv({
        h: m.baseHsv.h,
        s: m.baseHsv.s,
        v: m.baseHsv.v
      });
      if (m.alpha != null) setAlpha(m.alpha);
      if (m.mode) setHarmonyMode(m.mode);
      if (m.count != null) setHarmonyCount(m.count);
      if (m.spread != null) setHarmonySpread(m.spread);
    } else if (item.colors && item.colors.length > 0) {
      // Legacy palette without metadata — at least set the picker to the first color
      // so the user lands somewhere meaningful.
      const c0 = item.colors[0];
      const v = ColorUtil.rgbToHsv(c0.r, c0.g, c0.b);
      setHsv(cur => ({
        h: v.s < 0.001 ? cur.h : v.h,
        s: v.s,
        v: v.v
      }));
      if (c0.a != null) setAlpha(c0.a);
    }
    // Also drop the colors into the gradient for inspection.
    if (item.colors.length >= 2) setGradStops(item.colors.map(c => withStopId({
      ...c,
      id: undefined
    })));
  };
  const [hsv, setHsv] = useS({
    h: 18,
    s: 0.62,
    v: 0.92
  });
  const [alpha, setAlpha] = useS(1);
  const [harmonyMode, setHarmonyMode] = useS('analogous');
  const [harmonyCount, setHarmonyCount] = useS(3);
  const [harmonySpread, setHarmonySpread] = useS(30);
  const harmonyHues = useM(() => {
    if (harmonyMode === 'split') {
      const s = Math.min(harmonySpread, 60);
      return [hsv.h, ((hsv.h + 180 - s) % 360 + 360) % 360, ((hsv.h + 180 + s) % 360 + 360) % 360];
    }
    const out = [];
    const half = (harmonyCount - 1) / 2;
    for (let i = 0; i < harmonyCount; i++) {
      let h = hsv.h + (i - half) * harmonySpread;
      h = (h % 360 + 360) % 360;
      out.push(h);
    }
    return out;
  }, [hsv.h, harmonyMode, harmonyCount, harmonySpread]);
  const rgb = useM(() => {
    const r = ColorUtil.hsvToRgb(hsv.h, hsv.s, hsv.v);
    r.a = alpha;
    return r;
  }, [hsv, alpha]);
  const hex = useM(() => ColorUtil.rgbToHex(rgb.r, rgb.g, rgb.b, rgb.a).toUpperCase(), [rgb]);
  const cssColor = useM(() => ColorUtil.toCss(rgb), [rgb]);
  const setFromHex = h => {
    const r = ColorUtil.parseColor(h);
    if (!r) return;
    const v = ColorUtil.rgbToHsv(r.r, r.g, r.b);
    setHsv(cur => ({
      h: v.s < 0.001 ? cur.h : v.h,
      s: v.s,
      v: v.v
    }));
    if (r.a != null) setAlpha(r.a);
  };
  const [hexInput, setHexInput] = useS(hex);
  const hexFocused = useR(false);
  // Don't clobber the field while the user is typing — a valid 3/4-digit
  // prefix (e.g. "f00" on the way to "f00f3a") parses, changes `hex`, and
  // would otherwise overwrite the in-progress text. Normalize on blur instead.
  useE(() => {
    if (!hexFocused.current) setHexInput(hex);
  }, [hex]);
  const onHexChange = val => {
    setHexInput(val);
    const cleaned = val.replace('#', '');
    if (/^[0-9a-f]{3}$|^[0-9a-f]{4}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/i.test(cleaned)) {
      setFromHex(val.startsWith('#') ? val : '#' + val);
    }
  };

  // history
  const [history, setHistory] = useS([]);
  const pushHistory = hex => {
    setHistory(h => {
      const dedup = h.filter(x => x.toLowerCase() !== hex.toLowerCase());
      return [hex, ...dedup].slice(0, 14);
    });
  };
  const timer = useR(null);
  useE(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => pushHistory(hex), 350);
    return () => clearTimeout(timer.current);
  }, [hex]);
  return /*#__PURE__*/React.createElement("div", {
    className: "app"
  }, /*#__PURE__*/React.createElement("header", {
    className: "topbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand"
  }, /*#__PURE__*/React.createElement("span", {
    className: "brand-mark checker",
    style: {
      '--swatch-color': cssColor
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "brand-title"
  }, "Color\xA0Workbench")), /*#__PURE__*/React.createElement("div", {
    className: "topbar-right"
  }, /*#__PURE__*/React.createElement(Dropdown, {
    value: fontSize,
    onChange: setFontSize,
    leading: /*#__PURE__*/React.createElement("span", {
      className: "fs-aa"
    }, "Aa"),
    width: 140,
    options: [{
      value: 'xs',
      label: 'Extra small'
    }, {
      value: 'sm',
      label: 'Small'
    }, {
      value: 'md',
      label: 'Medium'
    }, {
      value: 'lg',
      label: 'Large'
    }, {
      value: 'xl',
      label: 'Extra large'
    }]
  }), /*#__PURE__*/React.createElement("button", {
    className: "theme-toggle",
    onClick: toggleTheme,
    title: `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`,
    "aria-label": "Toggle theme"
  }, /*#__PURE__*/React.createElement("span", {
    className: 'tt-track tt-' + theme
  }, /*#__PURE__*/React.createElement("span", {
    className: "tt-icon tt-sun"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: "14",
    height: "14",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
  }))), /*#__PURE__*/React.createElement("span", {
    className: "tt-icon tt-moon"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: "14",
    height: "14",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M21 12.5A9 9 0 1 1 11.5 3a7 7 0 0 0 9.5 9.5z"
  }))), /*#__PURE__*/React.createElement("span", {
    className: "tt-knob"
  }))))), /*#__PURE__*/React.createElement("main", {
    className: "main"
  }, /*#__PURE__*/React.createElement("section", {
    className: "panel picker-panel"
  }, /*#__PURE__*/React.createElement("header", {
    className: "panel-h"
  }, /*#__PURE__*/React.createElement("h3", null, "Picker")), /*#__PURE__*/React.createElement("div", {
    className: "picker-stack"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wheel-wrap"
  }, /*#__PURE__*/React.createElement(HueWheel, {
    hue: hsv.h,
    onChange: h => setHsv(s => ({
      ...s,
      h
    })),
    size: 260,
    harmonyHues: harmonyHues
  }), /*#__PURE__*/React.createElement("div", {
    className: "sv-overlay"
  }, /*#__PURE__*/React.createElement(SVSquare, {
    hue: hsv.h,
    sat: hsv.s,
    val: hsv.v,
    onChange: (s, v) => setHsv(cur => ({
      ...cur,
      s,
      v
    })),
    size: 136
  }))), /*#__PURE__*/React.createElement(HueStrip, {
    hue: hsv.h,
    onChange: h => setHsv(s => ({
      ...s,
      h
    }))
  }), /*#__PURE__*/React.createElement("div", {
    className: "row-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, /*#__PURE__*/React.createElement("span", null, "Hue"), /*#__PURE__*/React.createElement("span", {
    className: "lbl-val"
  }, Math.round(hsv.h), "\xB0")), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: 0,
    max: 360,
    value: hsv.h,
    onChange: e => setHsv(s => ({
      ...s,
      h: Number(e.target.value)
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "row-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, /*#__PURE__*/React.createElement("span", null, "Saturation"), /*#__PURE__*/React.createElement("span", {
    className: "lbl-val"
  }, Math.round(hsv.s * 100), "%")), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: 0,
    max: 100,
    value: hsv.s * 100,
    onChange: e => setHsv(s => ({
      ...s,
      s: Number(e.target.value) / 100
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "row-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, /*#__PURE__*/React.createElement("span", null, "Brightness (V)"), /*#__PURE__*/React.createElement("span", {
    className: "lbl-val"
  }, Math.round(hsv.v * 100), "%")), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: 0,
    max: 100,
    value: hsv.v * 100,
    onChange: e => setHsv(s => ({
      ...s,
      v: Number(e.target.value) / 100
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "row-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, /*#__PURE__*/React.createElement("span", null, "Alpha"), /*#__PURE__*/React.createElement("span", {
    className: "lbl-val"
  }, Math.round(alpha * 100), "%")), /*#__PURE__*/React.createElement("div", {
    className: "alpha-track",
    style: {
      '--alpha-color-from': `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, 0)`,
      '--alpha-color-to': `rgb(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: 0,
    max: 100,
    value: alpha * 100,
    onChange: e => setAlpha(Number(e.target.value) / 100)
  }))), /*#__PURE__*/React.createElement("div", {
    className: "hexinput-wrap hexinput-picker"
  }, /*#__PURE__*/React.createElement("span", {
    className: "hexinput-label"
  }, "HEX"), /*#__PURE__*/React.createElement("input", {
    className: "hexinput",
    value: hexInput,
    onChange: e => onHexChange(e.target.value),
    onFocus: () => {
      hexFocused.current = true;
    },
    onBlur: () => {
      hexFocused.current = false;
      setHexInput(hex);
    },
    spellCheck: false
  })))), /*#__PURE__*/React.createElement("section", {
    className: "center-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "big-swatch checker",
    style: {
      '--swatch-color': cssColor
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "bs-meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "bs-label"
  }, "current"), /*#__PURE__*/React.createElement("span", {
    className: "bs-hex"
  }, hex))), /*#__PURE__*/React.createElement(ColorOutputs, {
    rgb: rgb,
    format: colorFormat,
    setFormat: setColorFormat
  }), history.length > 1 && /*#__PURE__*/React.createElement("div", {
    className: "history"
  }, /*#__PURE__*/React.createElement("span", {
    className: "hist-label"
  }, "history"), /*#__PURE__*/React.createElement("div", {
    className: "hist-row"
  }, history.map((h, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    className: "hist-chip checker",
    style: {
      '--swatch-color': h
    },
    onClick: () => setFromHex(h),
    title: h
  })))), /*#__PURE__*/React.createElement(Harmonies, {
    hsv: hsv,
    alpha: alpha,
    mode: harmonyMode,
    setMode: setHarmonyMode,
    count: harmonyCount,
    setCount: setHarmonyCount,
    spread: harmonySpread,
    setSpread: setHarmonySpread,
    harmonyHues: harmonyHues,
    format: colorFormat,
    onPick: setFromHex,
    onSave: savePalette
  })), /*#__PURE__*/React.createElement(NamedColors, {
    onPick: setFromHex,
    currentHex: hex
  })), /*#__PURE__*/React.createElement("section", {
    className: "tools"
  }, /*#__PURE__*/React.createElement(ContrastChecker, {
    currentRgb: rgb,
    currentHex: hex,
    onPick: setFromHex
  }), /*#__PURE__*/React.createElement(ToneScale, {
    currentRgb: rgb,
    format: colorFormat,
    onPick: setFromHex,
    onSave: savePalette
  })), /*#__PURE__*/React.createElement("section", {
    className: "bottom"
  }, /*#__PURE__*/React.createElement(Gradient, {
    currentHex: hex,
    currentRgb: rgb,
    format: colorFormat,
    stops: gradStops,
    setStops: setGradStops,
    onSave: saveGradient
  }), /*#__PURE__*/React.createElement(ImageExtractor, {
    onPick: setFromHex,
    format: colorFormat,
    onSave: savePalette
  })), /*#__PURE__*/React.createElement(Library, {
    items: library,
    onLoadGradient: loadGradient,
    onLoadPalette: loadPalette,
    onRename: renameLib,
    onRemove: removeLib,
    onPick: setFromHex,
    onImport: importLibrary,
    onExport: exportLibrary,
    format: colorFormat
  }), /*#__PURE__*/React.createElement("footer", {
    className: "foot"
  }, /*#__PURE__*/React.createElement("span", null, "click any swatch to set current \xB7 click any code to copy")));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));