const SVG_NS = 'http://www.w3.org/2000/svg';
const presentations = new WeakMap();

function inkBounds(metrics) {
  const left = metrics.actualBoundingBoxLeft ?? 0;
  const right = metrics.actualBoundingBoxRight ?? metrics.width;
  const ascent = metrics.actualBoundingBoxAscent ?? 70;
  const descent = metrics.actualBoundingBoxDescent ?? 0;
  return { left, right, ascent, descent, width: left + right, height: ascent + descent };
}

/** Fit the visible ink, not the font's line box, into a circular target. */
export function skillNumeralGeometry(metrics, digitMetrics, diameter = 100) {
  const ink = inkBounds(metrics);
  const references = [...digitMetrics.map(inkBounds), ink];
  const maxWidth = Math.max(...references.map(box => box.width));
  const maxHeight = Math.max(...references.map(box => box.height));
  if (!(diameter > 0 && maxWidth > 0 && maxHeight > 0)) return null;
  // A common scale keeps all single digits the same size. Wider values still
  // shrink to fit, while roomy circles stop at the requested 110px maximum.
  const scale = Math.min(diameter * .60 / maxWidth, diameter * .54 / maxHeight, 1.1);
  return {
    fontSize: 100 * scale,
    x: (ink.left - ink.right) * scale / 2,
    y: (ink.ascent - ink.descent) * scale / 2,
    inkWidth: ink.width * scale,
    inkHeight: ink.height * scale
  };
}

/** Keep the native select for editing/accessibility; draw its value optically centered. */
export function renderSkillNumeral(select) {
  if (!select?.parentElement) return;
  let presentation = presentations.get(select);
  if (!presentation) {
    const document = select.ownerDocument;
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'cs-skill-value-display');
    svg.setAttribute('viewBox', '-50 -50 100 100');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('text-anchor', 'start');
    text.setAttribute('dominant-baseline', 'alphabetic');
    svg.append(text);
    select.parentElement.append(svg);

    const update = () => {
      const style = document.defaultView.getComputedStyle(select);
      context.font = style.fontStyle + ' ' + style.fontWeight + ' 100px ' + style.fontFamily;
      const value = select.selectedOptions[0]?.textContent?.trim() ?? select.value;
      text.textContent = value;
      const digits = Array.from('0123456789', digit => context.measureText(digit));
      const geometry = skillNumeralGeometry(context.measureText(value), digits);
      if (!geometry || !Number.isFinite(geometry.fontSize)) {
        svg.style.display = 'none';
        select.classList.remove('cs-skill-value-enhanced');
        return;
      }
      text.style.setProperty('font-family', style.fontFamily, 'important');
      text.style.fontWeight = style.fontWeight;
      text.style.fontStyle = style.fontStyle;
      text.style.fontSize = geometry.fontSize + 'px';
      text.setAttribute('x', String(geometry.x));
      text.setAttribute('y', String(geometry.y));
      svg.style.removeProperty('display');
      select.classList.add('cs-skill-value-enhanced');
    };
    presentation = { update };
    presentations.set(select, presentation);
    select.addEventListener('input', update);
    select.addEventListener('change', update);
    if (!select.hasAttribute('aria-label')) {
      const label = select.parentElement.querySelector('label')?.textContent?.trim();
      if (label) select.setAttribute('aria-label', label);
    }
    document.fonts?.ready.then(() => {
      if (select.isConnected) update();
    });
  }
  presentation.update();
}
