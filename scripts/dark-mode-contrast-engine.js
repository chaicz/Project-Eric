/**
 * Contrast engine - evaluated inside the browser page.
 *
 * This file is plain JavaScript (NOT a module, NOT a template string) so
 * it can be read with `fs.readFileSync` and handed to `page.evaluate`
 * without any escaping. It returns an array of measurements.
 *
 * How the backdrop is worked out
 * ------------------------------
 * The backgrounds painted behind a piece of text are collected from the
 * element outwards and then composited back to front, so a translucent
 * surface that sits ON TOP of an opaque one is measured against the
 * surface the text actually sits on. The two rules that matter:
 *
 *   - Every layer is applied. An opaque layer does not end the walk,
 *     because the layers nearer the text are painted over it.
 *   - The base starts transparent. The outermost layer is composited
 *     over nothing rather than over an assumed white.
 *
 * How opacity is handled
 * ----------------------
 * An element's `opacity` applies to the element as a whole: its
 * background AND the text on it are drawn into a group, and the group is
 * then composited onto the backdrop. Fading only the text would report
 * a fade the browser never paints - a badge that pulses between 1 and
 * 0.5 keeps the same contrast throughout, because the badge and its
 * count fade together.
 *
 * What it cannot see
 * ------------------
 * Overlays that are SIBLINGS of the text rather than ancestors - an
 * absolutely positioned tint layer next to the content it covers, for
 * instance - are not part of the ancestor chain and are not modelled.
 * Use `scripts/verify-pixels.cjs` to check those against the pixels the
 * browser actually painted.
 */

/* eslint-disable */
function parseColor(str) {
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

function composite(fg, bg) {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

function channelLuminance(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb) {
  return (
    0.2126 * channelLuminance(rgb[0]) +
    0.7152 * channelLuminance(rgb[1]) +
    0.0722 * channelLuminance(rgb[2])
  );
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

function toHex(rgb) {
  return '#' + rgb.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function effectiveBackground(el) {
  const layers = [];
  let node = el;
  let guard = 0;
  while (node && node.nodeType === 1 && guard < 60) {
    const cs = getComputedStyle(node);
    if (cs) {
      const bg = parseColor(cs.backgroundColor);
      const hasImage = cs.backgroundImage && cs.backgroundImage !== 'none';

      // The element's own opacity scales everything it paints — its
      // background colour, its gradient, and any content it holds.
      // Without this, a decorative overlay at `opacity: 0.05` (a grid
      // texture, for instance) was measured as if it were fully opaque
      // and turned a dark page into a light one.
      const ownAlpha = cs.opacity === '' ? 1 : Math.max(0, Math.min(1, parseFloat(cs.opacity)));
      const scale = (c) => [c[0], c[1], c[2], c[3] * ownAlpha];

      // The background colour of this element.
      if (bg && bg[3] > 0) layers.push(scale(bg));

      // A gradient is painted ON TOP of the background colour, not
      // instead of it. Treating an image as opaque black made every
      // gradient-filled element report a false "invisible" verdict
      // (the active navigation pill scored 1.18:1 against black
      // while it really sits on the accent blue at 4.85:1).
      //
      // The gradient stops are averaged to one colour, because a
      // horizontal gradient is only fully one colour at its ends and
      // the text can sit anywhere across it.
      let opaque = bg && bg[3] >= 1 && !hasImage;
      if (hasImage) {
        const stops = gradientStops(cs.backgroundImage);
        if (stops.length) {
          const avg = [0, 1, 2].map((i) => stops.reduce((s, c) => s + c[i], 0) / stops.length);
          // The gradient covers the background completely, so it is
          // painted as an opaque layer.
          layers.push(scale([avg[0], avg[1], avg[2], 1]));
        } else {
          // An image with no readable colour stops: opaque, and it
          // hides everything behind it.
          layers.push([0, 0, 0, 1]);
        }
        opaque = true;
      }

      // Stop as soon as the stack is fully opaque — whether that came
      // from a solid colour or from a gradient on top of one.
      // A scaled layer (one whose element is not fully opaque) never
      // qualifies, so the walk continues to the surface behind it.
      if (opaque && ownAlpha >= 1) break;
    }
    node = node.parentElement;
    guard += 1;
  }
  // The layers are collected from the element outwards, so the last one
  // is the outermost surface. They are painted back to front: the
  // outermost one first, then each layer closer to the text on top.
  //
  // Every layer has to be applied. An opaque layer does NOT end the
  // walk, because the layers nearer the text are painted ON TOP of it:
  // a translucent `bg-white/55` card sitting on an opaque dark body
  // reads as a light surface, and the text on it has to be measured
  // against the card, not against the body behind it.
  //
  // The base starts fully transparent so the outermost layer is
  // composited over nothing rather than over an assumed white.
  let result = [255, 255, 255, 0];
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    result = composite(layers[i], result);
  }
  // Nothing opaque was found behind the text — the page itself is
  // transparent — so the backdrop is the browser's default white.
  if (result[3] < 1) {
    result = composite([255, 255, 255, 1], result);
  }
  return result;
}

function isTransparent(color) {
  return !color || color[3] === 0;
}

/**
 * Extracts the colour stops of a CSS gradient.
 *
 * Only the solid colour stops are returned — a stop written as a colour
 * with an alpha channel keeps its alpha, so it can be composited over
 * the background the same way a fill would be.
 *
 * A `transparent` stop is skipped rather than counted as a colour.
 * A texture such as `linear-gradient(#fff 1px, transparent 1px)` has
 * one visible stop and one invisible one, and averaging the two would
 * report the texture as a half-white wash.
 */
function gradientStops(image) {
  if (!image || image === 'none') return [];
  const stops = [];
  // `linear-gradient(90deg, rgb(1,2,3) 0%, #fff 100%)`
  const re = /(rgba?\([^)]*\)|#[0-9a-f]{3,8}|[a-z]+)/gi;
  let m;
  while ((m = re.exec(image)) !== null) {
    const token = m[1];
    // Skip angle/keyword noise that is not a colour.
    if (/^(to|from|at|in|deg|rad|turn|left|right|top|bottom)$/i.test(token)) continue;
    const c = parseColor(token);
    if (c && c[3] > 0) stops.push(c);
  }
  return stops;
}

function auditText() {
  const results = [];
  const seen = new Set();
  const elements = document.querySelectorAll('body *');

  for (const el of elements) {
    let hasOwnText = false;
    let text = '';
    for (const node of el.childNodes) {
      if (node.nodeType === 3) {
        const t = node.textContent.trim();
        if (t) {
          hasOwnText = true;
          text += t + ' ';
        }
      }
    }
    if (!hasOwnText) continue;

    const cs = getComputedStyle(el);
    if (!cs) continue;
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;

    // An element at `opacity: 0` is not painted at all. The landing page
    // reveals its sections with an in-view animation that starts at
    // `opacity: 0`, so those elements are below the fold and invisible
    // — but their text still carried a colour, and the background walk
    // scaled the surface to fully transparent and kept climbing to the
    // page behind it.
    const elementOpacity = cs.opacity === '' ? 1 : parseFloat(cs.opacity);
    if (!(elementOpacity > 0.01)) continue;

    // A disabled control is deliberately dimmed (`disabled:opacity-50`),
    // so its label is meant to recede. Fading it against the backdrop
    // and reporting that as a contrast failure would be noise: the
    // control cannot be used, so the label is not read.
    if (el.disabled === true) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;

    // Skip text scrolled out of a clipping ancestor.
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
    if (clipped) continue;

    // The transparent textarea is an invisible input proxy layered
    // over a syntax-highlighted `<pre>` that paints the real, visible
    // text. Its own colour is transparent by design, so measuring it
    // would report a false "transparent" finding for every editor.
    if (el.classList && el.classList.contains('code-overlay-textarea')) continue;

    const fg = parseColor(cs.color);

    const fontSize = parseFloat(cs.fontSize) || 16;
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const isLarge = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
    const required = isLarge ? 3 : 4.5;

    const key = el.tagName + '|' + text.slice(0, 40) + '|' + cs.color;
    if (seen.has(key)) continue;
    seen.add(key);

    // Gradient-clipped text: the glyphs are painted from the element's
    // own background-image, and `color` is deliberately transparent.
    // Measuring the transparent colour would report a false "invisible".
    //
    // The background for the comparison is the one BEHIND the element,
    // not the element's own gradient — the gradient is the text, so
    // comparing it with itself always scores 1:1.
    const clipText = cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text';
    let ratio = null;
    let problem = null;
    let measured = cs.color;
    let measuredBg = effectiveBackground(el);

    if (clipText) {
      // The gradient IS the text, so the backdrop is what sits behind
      // the element — not the element's own gradient.
      const behind = effectiveBackground(el.parentElement || el);
      const stops = gradientStops(cs.backgroundImage);
      measuredBg = behind;
      if (stops.length) {
        // The lightest stop is the one most likely to fail against the
        // background, so it is the one that decides the verdict.
        let worst = null;
        for (const stop of stops) {
          const c = contrastRatio(composite(stop, behind), behind);
          if (worst === null || c < worst.ratio) worst = { ratio: c, stop };
        }
        ratio = Math.round(worst.ratio * 100) / 100;
        measured = toHex(worst.stop);
        if (ratio < 1.5) problem = 'invisible';
        else if (ratio < required) problem = 'low';
      } else {
        // Gradient clipped but no readable stop — treat as fine.
        ratio = 99;
        problem = null;
      }
    } else if (isTransparent(fg)) {
      problem = 'transparent';
      ratio = 0;
    } else {
      // A text element whose own background is a gradient (a button
      // label, an avatar initial) sits ON that gradient, so the
      // gradient is the backdrop to measure against — the parent's
      // background is not what is behind the glyphs.
      const ownGradient = cs.backgroundImage && cs.backgroundImage !== 'none' ? gradientStops(cs.backgroundImage) : [];
      const bg = ownGradient.length
        ? (() => {
            const avg = [0, 1, 2].map((i) => ownGradient.reduce((s, c) => s + c[i], 0) / ownGradient.length);
            return [avg[0], avg[1], avg[2], 1];
          })()
        : effectiveBackground(el);
      measuredBg = bg;
      // An element's `opacity` applies to the element as a whole: its
      // background AND the text on it are drawn into a group, and the
      // group is then composited onto the backdrop. Fading the text
      // against an unfaded background would report a fade the browser
      // never paints.
      //
      // So the text is measured against the element's own background
      // first, and the faded group is then measured against the
      // backdrop. For a badge that pulses between 1 and 0.5, the text
      // keeps the same ratio throughout: both the badge and its count
      // fade together.
      const fgSolid = fg[3] >= 1 ? fg : composite(fg, bg);
      if (elementOpacity < 1) {
        // The backdrop the faded group lands on. The element's own
        // background is already included in `bg`, so the backdrop is
        // the surface behind the element.
        const behind = effectiveBackground(el.parentElement || el);
        const textOnOwnBg = contrastRatio(fgSolid, bg);
        // The group faded onto the backdrop.
        const groupBg = composite([bg[0], bg[1], bg[2], elementOpacity], behind);
        const groupText = composite(
          [fgSolid[0], fgSolid[1], fgSolid[2], elementOpacity],
          behind
        );
        ratio = Math.min(textOnOwnBg, contrastRatio(groupText, groupBg));
        measured = toHex(groupText);
        measuredBg = groupBg;
      } else {
        ratio = contrastRatio(fgSolid, bg);
        measured = toHex(fgSolid);
      }
      if (ratio < 1.5) problem = 'invisible';
      else if (ratio < required) problem = 'low';
    }

    results.push({
      tag: el.tagName.toLowerCase(),
      className: (typeof el.className === 'string' ? el.className : '').slice(0, 160),
      text: text.trim().slice(0, 100),
      color: measured,
      bg: measuredBg,
      ratio: ratio === null ? null : Math.round(ratio * 100) / 100,
      required,
      fontSize,
      weight,
      problem,
      x: Math.round(rect.left + window.scrollX),
      y: Math.round(rect.top + window.scrollY),
    });
  }

  return results;
}
