// Theme tools: WCAG contrast checker + OKLch tint/shade scale generator.
const {
  useState: useTS,
  useEffect: useTE,
  useMemo: useTM,
  useRef: useTR
} = React;

// WCAG contrast is defined for opaque colors. Composite translucent colors
// onto what's beneath them so the reported ratio matches what's rendered:
// background flattens over white, text flattens over the (flattened) bg.
function flattenOver(c, base) {
  const a = c.a == null ? 1 : c.a;
  if (a >= 0.9999) return {
    r: c.r,
    g: c.g,
    b: c.b,
    a: 1
  };
  return {
    r: c.r * a + base.r * (1 - a),
    g: c.g * a + base.g * (1 - a),
    b: c.b * a + base.b * (1 - a),
    a: 1
  };
}

// ---------- Contrast checker ----------
function ContrastSlot({
  role,
  value,
  set,
  currentRgb
}) {
  const hex = ColorUtil.rgbToHex(value.r, value.g, value.b, value.a).toUpperCase();
  const [draft, setDraft] = useTS(hex);
  const focused = useTR(false);
  // Don't overwrite in-progress typing: a valid prefix (e.g. "008" on the way
  // to "008055") parses, updates the color, and would reset the field mid-edit.
  useTE(() => {
    if (!focused.current) setDraft(hex);
  }, [hex]);
  const onText = raw => {
    setDraft(raw);
    const c = ColorUtil.parseColor(raw);
    if (c) set(c);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "cc-slot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cc-role"
  }, role), /*#__PURE__*/React.createElement("div", {
    className: "cc-slot-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cc-sw checker",
    style: {
      '--swatch-color': ColorUtil.toCss(value)
    }
  }), /*#__PURE__*/React.createElement("input", {
    className: "cc-input",
    value: draft,
    onChange: e => onText(e.target.value),
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      setDraft(hex);
    },
    spellCheck: false
  })), /*#__PURE__*/React.createElement("button", {
    className: "cc-use",
    onClick: () => set({
      ...currentRgb
    }),
    title: "Use the current color"
  }, "use current"));
}
function ContrastChecker({
  currentRgb,
  currentHex,
  onPick
}) {
  const [fg, setFg] = useTS({
    r: 26,
    g: 25,
    b: 22,
    a: 1
  }); // ink
  const [bg, setBg] = useTS({
    r: 255,
    g: 255,
    b: 255,
    a: 1
  }); // white

  const bgFlat = useTM(() => flattenOver(bg, {
    r: 255,
    g: 255,
    b: 255
  }), [bg]);
  const fgFlat = useTM(() => flattenOver(fg, bgFlat), [fg, bgFlat]);
  const ratio = useTM(() => ColorUtil.contrastRatio(fgFlat, bgFlat), [fgFlat, bgFlat]);
  const r2 = Math.round(ratio * 100) / 100;

  // WCAG thresholds
  const checks = [{
    label: 'Normal text',
    aa: ratio >= 4.5,
    aaa: ratio >= 7
  }, {
    label: 'Large text',
    aa: ratio >= 3,
    aaa: ratio >= 4.5
  }, {
    label: 'UI / graphics',
    aa: ratio >= 3,
    aaa: null
  }];
  const swap = () => {
    setFg(bg);
    setBg(fg);
  };
  const verdict = ratio >= 7 ? {
    t: 'AAA',
    cls: 'aaa'
  } : ratio >= 4.5 ? {
    t: 'AA',
    cls: 'aa'
  } : ratio >= 3 ? {
    t: 'AA Large',
    cls: 'aa-large'
  } : {
    t: 'Fail',
    cls: 'fail'
  };
  return /*#__PURE__*/React.createElement("section", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("header", {
    className: "panel-h"
  }, /*#__PURE__*/React.createElement("h3", null, "Contrast"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: swap,
    title: "Swap foreground and background"
  }, "\u21C4 swap")), /*#__PURE__*/React.createElement("div", {
    className: "cc-slots"
  }, /*#__PURE__*/React.createElement(ContrastSlot, {
    role: "text",
    value: fg,
    set: setFg,
    currentRgb: currentRgb
  }), /*#__PURE__*/React.createElement(ContrastSlot, {
    role: "background",
    value: bg,
    set: setBg,
    currentRgb: currentRgb
  })), /*#__PURE__*/React.createElement("div", {
    className: "cc-readout"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cc-preview",
    style: {
      background: ColorUtil.toCss(bgFlat),
      color: ColorUtil.toCss(fgFlat)
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "cc-preview-lg"
  }, "Aa"), /*#__PURE__*/React.createElement("span", {
    className: "cc-preview-sm"
  }, "The quick brown fox")), /*#__PURE__*/React.createElement("div", {
    className: "cc-score"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cc-ratio"
  }, r2, /*#__PURE__*/React.createElement("span", {
    className: "cc-ratio-x"
  }, ":1")), /*#__PURE__*/React.createElement("span", {
    className: 'cc-badge cc-' + verdict.cls
  }, verdict.t))), /*#__PURE__*/React.createElement("div", {
    className: "cc-table"
  }, checks.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.label,
    className: "cc-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cc-row-label"
  }, c.label), /*#__PURE__*/React.createElement("span", {
    className: 'cc-pill ' + (c.aa ? 'pass' : 'fail')
  }, "AA ", c.aa ? '✓' : '✕'), c.aaa === null ? /*#__PURE__*/React.createElement("span", {
    className: "cc-pill na"
  }, "AAA \u2014") : /*#__PURE__*/React.createElement("span", {
    className: 'cc-pill ' + (c.aaa ? 'pass' : 'fail')
  }, "AAA ", c.aaa ? '✓' : '✕')))));
}

// ---------- Tint / shade scale ----------
function ToneScale({
  currentRgb,
  format,
  onPick,
  onSave
}) {
  const scale = useTM(() => ColorUtil.toneScale(currentRgb), [currentRgb]);

  // Which step is closest in lightness to the current color (highlight it).
  const baseL = useTM(() => ColorUtil.rgbToOklch(currentRgb.r, currentRgb.g, currentRgb.b).L, [currentRgb]);
  const nearestIdx = useTM(() => {
    let bi = 0,
      bd = Infinity;
    scale.forEach((c, i) => {
      const d = Math.abs(c.L - baseL);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    return bi;
  }, [scale, baseL]);
  const fmt = format || 'hex';
  const copyAll = () => {
    const list = scale.map(c => ColorUtil.formatRgbAs(c, fmt)).join(fmt === 'hex' ? ', ' : ' | ');
    navigator.clipboard.writeText(list);
  };
  const copyVars = () => {
    const css = scale.map(c => `  --color-${c.step}: ${ColorUtil.rgbToHex(c.r, c.g, c.b).toUpperCase()};`).join('\n');
    navigator.clipboard.writeText(':root {\n' + css + '\n}');
  };
  return /*#__PURE__*/React.createElement("section", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("header", {
    className: "panel-h"
  }, /*#__PURE__*/React.createElement("h3", null, "Tint & Shade Scale"), /*#__PURE__*/React.createElement("span", {
    className: "ts-sub"
  }, "from current hue")), /*#__PURE__*/React.createElement("div", {
    className: "ts-ramp"
  }, scale.map((c, i) => {
    const hex = ColorUtil.rgbToHex(c.r, c.g, c.b).toUpperCase();
    return /*#__PURE__*/React.createElement("button", {
      key: c.step,
      className: 'ts-step' + (i === nearestIdx ? ' on' : ''),
      onClick: () => onPick(hex),
      title: `${c.step} · ${hex} — click to set current`
    }, /*#__PURE__*/React.createElement("span", {
      className: "ts-sw",
      style: {
        background: hex
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "ts-num"
    }, c.step));
  })), /*#__PURE__*/React.createElement("div", {
    className: "grad-swatches ts-grid"
  }, scale.map(c => {
    const hex = ColorUtil.rgbToHex(c.r, c.g, c.b).toUpperCase();
    const label = ColorUtil.formatRgbAs(c, fmt);
    return /*#__PURE__*/React.createElement("button", {
      key: c.step,
      className: "grad-sw",
      onClick: () => navigator.clipboard.writeText(label),
      title: `${label} — click to copy`
    }, /*#__PURE__*/React.createElement("span", {
      className: "grad-sw-color checker",
      style: {
        '--swatch-color': hex
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: 'grad-sw-hex fmt-' + fmt
    }, label));
  })), /*#__PURE__*/React.createElement("div", {
    className: "grad-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: copyAll
  }, "copy scale"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: copyVars
  }, "copy CSS vars"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => onSave && onSave(scale),
    title: "Save scale to library"
  }, "\u2606 save")));
}
Object.assign(window, {
  ContrastChecker,
  ToneScale
});