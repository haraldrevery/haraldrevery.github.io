// Theme tools: WCAG contrast checker + OKLch tint/shade scale generator.
const { useState: useTS, useEffect: useTE, useMemo: useTM, useRef: useTR } = React;

// WCAG contrast is defined for opaque colors. Composite translucent colors
// onto what's beneath them so the reported ratio matches what's rendered:
// background flattens over white, text flattens over the (flattened) bg.
function flattenOver(c, base) {
  const a = c.a == null ? 1 : c.a;
  if (a >= 0.9999) return { r: c.r, g: c.g, b: c.b, a: 1 };
  return {
    r: c.r * a + base.r * (1 - a),
    g: c.g * a + base.g * (1 - a),
    b: c.b * a + base.b * (1 - a),
    a: 1
  };
}

// ---------- Contrast checker ----------
function ContrastSlot({ role, value, set, currentRgb }) {
  const hex = ColorUtil.rgbToHex(value.r, value.g, value.b, value.a).toUpperCase();
  const [draft, setDraft] = useTS(hex);
  const focused = useTR(false);
  // Don't overwrite in-progress typing: a valid prefix (e.g. "008" on the way
  // to "008055") parses, updates the color, and would reset the field mid-edit.
  useTE(() => { if (!focused.current) setDraft(hex); }, [hex]);
  const onText = (raw) => {
    setDraft(raw);
    const c = ColorUtil.parseColor(raw);
    if (c) set(c);
  };
  return (
    <div className="cc-slot">
      <span className="cc-role">{role}</span>
      <div className="cc-slot-row">
        <span className="cc-sw checker" style={{ '--swatch-color': ColorUtil.toCss(value) }} />
        <input
          className="cc-input"
          value={draft}
          onChange={(e) => onText(e.target.value)}
          onFocus={() => { focused.current = true; }}
          onBlur={() => { focused.current = false; setDraft(hex); }}
          spellCheck={false} />
      </div>
      <button className="cc-use" onClick={() => set({ ...currentRgb })} title="Use the current color">
        use current
      </button>
    </div>
  );
}

function ContrastChecker({ currentRgb, currentHex, onPick }) {
  const [fg, setFg] = useTS({ r: 26, g: 25, b: 22, a: 1 });   // ink
  const [bg, setBg] = useTS({ r: 255, g: 255, b: 255, a: 1 }); // white

  const bgFlat = useTM(() => flattenOver(bg, { r: 255, g: 255, b: 255 }), [bg]);
  const fgFlat = useTM(() => flattenOver(fg, bgFlat), [fg, bgFlat]);
  const ratio = useTM(() => ColorUtil.contrastRatio(fgFlat, bgFlat), [fgFlat, bgFlat]);
  const r2 = Math.round(ratio * 100) / 100;

  // WCAG thresholds
  const checks = [
    { label: 'Normal text', aa: ratio >= 4.5, aaa: ratio >= 7 },
    { label: 'Large text', aa: ratio >= 3, aaa: ratio >= 4.5 },
    { label: 'UI / graphics', aa: ratio >= 3, aaa: null }
  ];

  const swap = () => { setFg(bg); setBg(fg); };

  const verdict =
    ratio >= 7 ? { t: 'AAA', cls: 'aaa' } :
    ratio >= 4.5 ? { t: 'AA', cls: 'aa' } :
    ratio >= 3 ? { t: 'AA Large', cls: 'aa-large' } :
    { t: 'Fail', cls: 'fail' };

  return (
    <section className="panel">
      <header className="panel-h">
        <h3>Contrast</h3>
        <button className="btn btn-ghost" onClick={swap} title="Swap foreground and background">⇄ swap</button>
      </header>

      <div className="cc-slots">
        <ContrastSlot role="text" value={fg} set={setFg} currentRgb={currentRgb} />
        <ContrastSlot role="background" value={bg} set={setBg} currentRgb={currentRgb} />
      </div>

      <div className="cc-readout">
        <div
          className="cc-preview"
          style={{ background: ColorUtil.toCss(bgFlat), color: ColorUtil.toCss(fgFlat) }}>
          <span className="cc-preview-lg">Aa</span>
          <span className="cc-preview-sm">The quick brown fox</span>
        </div>
        <div className="cc-score">
          <span className="cc-ratio">{r2}<span className="cc-ratio-x">:1</span></span>
          <span className={'cc-badge cc-' + verdict.cls}>{verdict.t}</span>
        </div>
      </div>

      <div className="cc-table">
        {checks.map((c) => (
          <div key={c.label} className="cc-row">
            <span className="cc-row-label">{c.label}</span>
            <span className={'cc-pill ' + (c.aa ? 'pass' : 'fail')}>AA {c.aa ? '✓' : '✕'}</span>
            {c.aaa === null
              ? <span className="cc-pill na">AAA —</span>
              : <span className={'cc-pill ' + (c.aaa ? 'pass' : 'fail')}>AAA {c.aaa ? '✓' : '✕'}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Tint / shade scale ----------
function ToneScale({ currentRgb, format, onPick, onSave }) {
  const scale = useTM(() => ColorUtil.toneScale(currentRgb), [currentRgb]);

  // Which step is closest in lightness to the current color (highlight it).
  const baseL = useTM(() => ColorUtil.rgbToOklch(currentRgb.r, currentRgb.g, currentRgb.b).L, [currentRgb]);
  const nearestIdx = useTM(() => {
    let bi = 0, bd = Infinity;
    scale.forEach((c, i) => { const d = Math.abs(c.L - baseL); if (d < bd) { bd = d; bi = i; } });
    return bi;
  }, [scale, baseL]);

  const fmt = format || 'hex';
  const copyAll = () => {
    const list = scale.map((c) => ColorUtil.formatRgbAs(c, fmt)).join(fmt === 'hex' ? ', ' : ' | ');
    navigator.clipboard.writeText(list);
  };
  const copyVars = () => {
    const css = scale.map((c) => `  --color-${c.step}: ${ColorUtil.rgbToHex(c.r, c.g, c.b).toUpperCase()};`).join('\n');
    navigator.clipboard.writeText(':root {\n' + css + '\n}');
  };

  return (
    <section className="panel">
      <header className="panel-h">
        <h3>Tint &amp; Shade Scale</h3>
        <span className="ts-sub">from current hue</span>
      </header>

      <div className="ts-ramp">
        {scale.map((c, i) => {
          const hex = ColorUtil.rgbToHex(c.r, c.g, c.b).toUpperCase();
          return (
            <button
              key={c.step}
              className={'ts-step' + (i === nearestIdx ? ' on' : '')}
              onClick={() => onPick(hex)}
              title={`${c.step} · ${hex} — click to set current`}>
              <span className="ts-sw" style={{ background: hex }} />
              <span className="ts-num">{c.step}</span>
            </button>
          );
        })}
      </div>

      <div className="grad-swatches ts-grid">
        {scale.map((c) => {
          const hex = ColorUtil.rgbToHex(c.r, c.g, c.b).toUpperCase();
          const label = ColorUtil.formatRgbAs(c, fmt);
          return (
            <button key={c.step} className="grad-sw" onClick={() => navigator.clipboard.writeText(label)} title={`${label} — click to copy`}>
              <span className="grad-sw-color checker" style={{ '--swatch-color': hex }} />
              <span className={'grad-sw-hex fmt-' + fmt}>{label}</span>
            </button>
          );
        })}
      </div>

      <div className="grad-actions">
        <button className="btn" onClick={copyAll}>copy scale</button>
        <button className="btn" onClick={copyVars}>copy CSS vars</button>
        <button className="btn btn-ghost" onClick={() => onSave && onSave(scale)} title="Save scale to library">☆ save</button>
      </div>
    </section>
  );
}

Object.assign(window, { ContrastChecker, ToneScale });
