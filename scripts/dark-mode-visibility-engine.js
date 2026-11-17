/**
 * Dark-mode visibility engine — evaluated inside the browser page.
 *
 * Plain JavaScript (NOT a module, NOT a template string) so it can be
 * read with `fs.readFileSync` and handed to `page.evaluate` without
 * escaping. It returns one measurement per visible text element.
 */

/* eslint-disable */
function vParseColor(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (s === 'transparent') return [0, 0, 0, 0];
  if (s === 'currentColor' || s === 'none' || s === '') return null;

  let m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = m[1].split(/[,\s\/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => !Number.isNaN(n))) {
      return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
    }
  }

  m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    const hex = m[1];
    const expand = (h) => parseInt(h.length === 1 ? h + h : h, 16);
    if (hex.length === 3 || hex.length === 4) {
      return [expand(hex[0]), expand(hex[1]), expand(hex[2]), hex.length === 4 ? expand(hex[3]) / 255 : 1];
    }
    if (hex.length === 6 || hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      ];
    }
  }

  m = s.match(/^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.%]+)\s*)?\)$/i);
  if (m) {
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }

  return null;
}

function vComposite(fg, bg) {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

function vChannel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function vLuminance(rgb) {
  return (
    0.2126 * vChannel(rgb[0]) + 0.7152 * vChannel(rgb[1]) + 0.0722 * vChannel(rgb[2])
  );
}

function vContrast(a, b) {
  const la = vLuminance(a);
  const lb = vLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function vHex(rgb) {
  return '#' + rgb.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Blend every painted background behind `el` into one effective colour. */
function vBackground(el) {
  const layers = [];
  let node = el;
  let guard = 0;
  while (node && node.nodeType === 1 && guard < 60) {
    const cs = getComputedStyle(node);
    if (cs) {
      const bg = vParseColor(cs.backgroundColor);
      const hasImage = cs.backgroundImage && cs.backgroundImage !== 'none';
      const ownAlpha = cs.opacity === '' ? 1 : Math.max(0, Math.min(1, parseFloat(cs.opacity)));
      const scale = (c) => [c[0], c[1], c[2], c[3] * ownAlpha];

      if (bg && bg[3] > 0) layers.push(scale(bg));

      let opaque = bg && bg[3] >= 1 && !hasImage;
      if (hasImage) {
        const stops = vGradientStops(cs.backgroundImage);
        if (stops.length) {
          const avg = [0, 1, 2].map((i) => stops.reduce((s, c) => s + c[i], 0) / stops.length);
          layers.push(scale([avg[0], avg[1], avg[2], 1]));
        } else {
          layers.push([0, 0, 0, 1]);
        }
        opaque = true;
      }
      if (opaque && ownAlpha >= 1) break;
    }
    node = node.parentElement;
    guard += 1;
  }
  let result = [255, 255, 255, 1];
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    result = vComposite(layers[i], result);
    if (result[3] >= 1) break;
  }
  return result;
}

function vGradientStops(image) {
  if (!image || image === 'none') return [];
  const stops = [];
  const re = /(rgba?\([^)]*\)|#[0-9a-f]{3,8}|[a-z]+)/gi;
  let m;
  while ((m = re.exec(image)) !== null) {
    const token = m[1];
    if (/^(to|from|at|in|deg|rad|turn|left|right|top|bottom)$/i.test(token)) continue;
    const c = vParseColor(token);
    if (c && c[3] > 0) stops.push(c);
  }
  return stops;
}

function auditVisibility() {
  const results = [];
  const seen = new Set();

  for (const el of document.querySelectorAll('body *')) {
    let text = '';
    for (const node of el.childNodes) {
      if (node.nodeType === 3) {
        const t = node.textContent.trim();
        if (t) text += t + ' ';
      }
    }
    if (!text.trim()) continue;

    const cs = getComputedStyle(el);
    if (!cs) continue;
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (el.disabled === true) continue;

    // The transparent textarea is an input proxy layered over a
    // syntax-highlighted <pre> that paints the real, visible text.
    if (el.classList && el.classList.contains('code-overlay-textarea')) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;

    const opacity = cs.opacity === '' ? 1 : parseFloat(cs.opacity);
    if (!(opacity > 0.01)) continue;

    const key = el.tagName + '|' + text.slice(0, 40) + '|' + cs.color;
    if (seen.has(key)) continue;
    seen.add(key);

    // Clipped by an ancestor with overflow hidden.
    let clipped = false;
    let anc = el.parentElement;
    let g = 0;
    while (anc && g < 40) {
      const acs = getComputedStyle(anc);
      if (acs && (acs.overflow === 'hidden' || acs.overflowX === 'hidden' || acs.overflowY === 'hidden')) {
        const ar = anc.getBoundingClientRect();
        if (
          rect.bottom <= ar.top + 1 ||
          rect.top >= ar.bottom - 1 ||
          rect.right <= ar.left + 1 ||
          rect.left >= ar.right - 1
        ) {
          clipped = true;
          break;
        }
      }
      anc = anc.parentElement;
      g += 1;
    }

    const fg = vParseColor(cs.color);
    const bg = vBackground(el);

    // Gradient-clipped text: the glyphs are painted from the element's
    // own background-image and `color` is deliberately transparent. The
    // colour behind the element is the real backdrop, and the gradient
    // stops are the real glyph colour — measuring the transparent
    // `color` would report a false "same-color" verdict.
    const clipText =
      cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text';
    if (clipText) {
      const behind = vBackground(el.parentElement || el);
      const stops = vGradientStops(cs.backgroundImage);
      let ratio = null;
      if (stops.length) {
        let worst = null;
        for (const stop of stops) {
          const c = vContrast(vComposite(stop, behind), behind);
          if (worst === null || c < worst) worst = c;
        }
        ratio = Math.round(worst * 100) / 100;
      }
      results.push({
        tag: el.tagName.toLowerCase(),
        className: (typeof el.className === 'string' ? el.className : '').slice(0, 160),
        text: text.trim().slice(0, 100),
        color: 'gradient',
        bg: vHex(behind),
        ratio,
        opacity,
        problem: ratio !== null && ratio < 1.2 ? 'same-color' : null,
        x: Math.round(rect.left + window.scrollX),
        y: Math.round(rect.top + window.scrollY),
      });
      continue;
    }

    const fgSolid = fg && fg[3] >= 1 ? fg : fg ? vComposite(fg, bg) : null;
    const faded = fgSolid
      ? vComposite([fgSolid[0], fgSolid[1], fgSolid[2], opacity], bg)
      : null;
    const ratio = faded ? Math.round(vContrast(faded, bg) * 100) / 100 : null;

    let problem = null;
    if (clipped) problem = 'clipped';
    else if (ratio !== null && ratio < 1.2) problem = 'same-color';

    results.push({
      tag: el.tagName.toLowerCase(),
      className: (typeof el.className === 'string' ? el.className : '').slice(0, 160),
      text: text.trim().slice(0, 100),
      color: faded ? vHex(faded) : cs.color,
      bg: vHex(bg),
      ratio,
      opacity,
      problem,
      x: Math.round(rect.left + window.scrollX),
      y: Math.round(rect.top + window.scrollY),
    });
  }

  return results;
}
