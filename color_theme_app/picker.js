// Picker components: Hue wheel + SV square + Lightness slider
const {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback
} = React;
function HueWheel({
  hue,
  onChange,
  size = 240,
  harmonyHues = []
}) {
  const ref = useRef(null);
  const dragging = useRef(false);

  // Geometry — kept consistent w/ marker math below
  const outerR = size / 2 - 2;
  const innerR = outerR - 26;

  // Draw the wheel
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const w = size,
      cx = w / 2,
      cy = w / 2;
    c.width = w;
    c.height = w;
    ctx.clearRect(0, 0, w, w);
    const steps = 360;
    for (let i = 0; i < steps; i++) {
      const a0 = (i - 0.6 - 90) * Math.PI / 180;
      const a1 = (i + 0.6 - 90) * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a0) * innerR, cy + Math.sin(a0) * innerR);
      ctx.arc(cx, cy, outerR, a0, a1);
      ctx.lineTo(cx + Math.cos(a1) * innerR, cy + Math.sin(a1) * innerR);
      ctx.arc(cx, cy, innerR, a1, a0, true);
      ctx.closePath();
      const {
        r,
        g,
        b
      } = ColorUtil.hsvToRgb(i, 1, 1);
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.stroke();
  }, [size, outerR, innerR]);
  const handle = useCallback(e => {
    const c = ref.current;
    const rect = c.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    let h = Math.atan2(y, x) * 180 / Math.PI + 90;
    if (h < 0) h += 360;
    onChange(h);
  }, [onChange]);

  // Pointer Events cover mouse, touch and pen with one path. setPointerCapture
  // keeps drag tracking even when the pointer leaves the canvas.
  const handleDown = e => {
    dragging.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    handle(e);
  };
  const handleMove = e => {
    if (dragging.current) handle(e);
  };
  const handleUp = () => {
    dragging.current = false;
  };

  // Main indicator (current hue) sits centered on the ring
  const ringMidR = (outerR + innerR) / 2;
  const a = (hue - 90) * Math.PI / 180;
  const ix = size / 2 + Math.cos(a) * ringMidR;
  const iy = size / 2 + Math.sin(a) * ringMidR;

  // Harmony markers
  const markers = harmonyHues.map((h, i) => {
    const ang = (h - 90) * Math.PI / 180;
    return {
      key: i,
      x: size / 2 + Math.cos(ang) * ringMidR,
      y: size / 2 + Math.sin(ang) * ringMidR,
      hue: h,
      isCurrent: Math.abs((h - hue + 540) % 360 - 180) < 0.5
    };
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: size,
      height: size
    }
  }, /*#__PURE__*/React.createElement("canvas", {
    ref: ref,
    style: {
      width: size,
      height: size,
      cursor: 'crosshair',
      display: 'block',
      touchAction: 'none'
    },
    onPointerDown: handleDown,
    onPointerMove: handleMove,
    onPointerUp: handleUp,
    onPointerCancel: handleUp
  }), markers.length > 1 && /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("polyline", {
    points: markers.map(m => `${m.x},${m.y}`).join(' '),
    fill: "none",
    stroke: "rgba(255,255,255,0.85)",
    strokeWidth: "1.5",
    strokeDasharray: "3 3"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: markers.map(m => `${m.x},${m.y}`).join(' '),
    fill: "none",
    stroke: "rgba(0,0,0,0.5)",
    strokeWidth: "1.5",
    strokeDasharray: "3 3",
    strokeDashoffset: "3"
  })), markers.map(m => !m.isCurrent && /*#__PURE__*/React.createElement("div", {
    key: m.key,
    style: {
      position: 'absolute',
      left: m.x - 6,
      top: m.y - 6,
      width: 12,
      height: 12,
      borderRadius: '50%',
      background: `hsl(${m.hue}, 100%, 50%)`,
      border: '2px solid #fff',
      boxShadow: '0 0 0 1px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.3)',
      pointerEvents: 'none'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: ix - 10,
      top: iy - 10,
      width: 20,
      height: 20,
      borderRadius: '50%',
      border: '2px solid #fff',
      boxShadow: '0 0 0 1.5px #000, 0 2px 6px rgba(0,0,0,0.35)',
      background: `hsl(${hue}, 100%, 50%)`,
      pointerEvents: 'none'
    }
  }));
}
function SVSquare({
  hue,
  sat,
  val,
  onChange,
  size = 180
}) {
  const ref = useRef(null);
  const dragging = useRef(false);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    c.width = size;
    c.height = size;
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    ctx.fillRect(0, 0, size, size);
    const gx = ctx.createLinearGradient(0, 0, size, 0);
    gx.addColorStop(0, 'rgba(255,255,255,1)');
    gx.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gx;
    ctx.fillRect(0, 0, size, size);
    const gy = ctx.createLinearGradient(0, 0, 0, size);
    gy.addColorStop(0, 'rgba(0,0,0,0)');
    gy.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gy;
    ctx.fillRect(0, 0, size, size);
  }, [hue, size]);
  const handle = useCallback(e => {
    const rect = ref.current.getBoundingClientRect();
    const x = ColorUtil.clamp(e.clientX - rect.left, 0, rect.width);
    const y = ColorUtil.clamp(e.clientY - rect.top, 0, rect.height);
    onChange(x / rect.width, 1 - y / rect.height);
  }, [onChange]);
  const handleDown = e => {
    dragging.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    handle(e);
  };
  const handleMove = e => {
    if (dragging.current) handle(e);
  };
  const handleUp = () => {
    dragging.current = false;
  };
  const px = sat * size,
    py = (1 - val) * size;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: size,
      height: size
    }
  }, /*#__PURE__*/React.createElement("canvas", {
    ref: ref,
    style: {
      width: size,
      height: size,
      cursor: 'crosshair',
      display: 'block',
      borderRadius: 2,
      touchAction: 'none'
    },
    onPointerDown: handleDown,
    onPointerMove: handleMove,
    onPointerUp: handleUp,
    onPointerCancel: handleUp
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: px - 8,
      top: py - 8,
      width: 16,
      height: 16,
      borderRadius: '50%',
      border: '2px solid #fff',
      boxShadow: '0 0 0 1px #000',
      pointerEvents: 'none'
    }
  }));
}
function HueStrip({
  hue,
  onChange
}) {
  const ref = useRef(null);
  const dragging = useRef(false);
  const handle = useCallback(e => {
    const rect = ref.current.getBoundingClientRect();
    const x = ColorUtil.clamp(e.clientX - rect.left, 0, rect.width);
    onChange(x / rect.width * 360);
  }, [onChange]);
  const handleDown = e => {
    dragging.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    handle(e);
  };
  const handleMove = e => {
    if (dragging.current) handle(e);
  };
  const handleUp = () => {
    dragging.current = false;
  };
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    onPointerDown: handleDown,
    onPointerMove: handleMove,
    onPointerUp: handleUp,
    onPointerCancel: handleUp,
    style: {
      position: 'relative',
      height: 14,
      borderRadius: 2,
      background: 'linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))',
      cursor: 'crosshair',
      border: '1px solid rgba(0,0,0,0.12)',
      touchAction: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: `${hue / 360 * 100}%`,
      top: -2,
      width: 8,
      height: 18,
      marginLeft: -4,
      background: '#fff',
      border: '1px solid #000',
      borderRadius: 1,
      pointerEvents: 'none'
    }
  }));
}
Object.assign(window, {
  HueWheel,
  SVSquare,
  HueStrip
});