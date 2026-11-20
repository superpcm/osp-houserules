import { measureSkillLabelInk } from './skill-label-ink.js';

const OSP_CHAPTER_HEADER_TARGET = 90;
const OSP_WRITING_TITLE_SUBTITLE_GAP = 4;
const OSP_WRITING_SUBTITLE_BORDER_GAP = 6.65;
const OSP_WRITING_PANEL_BOTTOM_TARGET = 674;

const OSP_CHAPTER_HEADERS = {
  skills: ['.skill-tab-title', '.skill-tab-subtitle'],
  combat: ['.combat-hpac-title'],
  gear: ['.ej-running-head > span', '.gear-subtitle'],
  spells: [".spell-tab-title", ".spell-tab-subtitle"],
  character: [".bg-tab-title", ".bg-tab-subtitle"],
  details: [".bg-tab-title", ".bg-tab-subtitle"],
  attributes: ['.spell-tab-title', '.spell-tab-subtitle'],
  background: ['.bg-tab-title', '.bg-tab-subtitle'],
  notes: ['.bg-tab-title', '.bg-tab-subtitle'],
};

function ospChapterWindow(root) {
  return root?.ownerDocument?.defaultView ?? globalThis.window;
}

function ospChapterVisible(element) {
  if (!element?.getBoundingClientRect) return false;
  const rect = element.getBoundingClientRect();
  return rect.width !== 0 || rect.height !== 0;
}

function ospChapterInkMetrics(element, win) {
  const document = element.ownerDocument;
  const context = document?.createElement('canvas')?.getContext?.('2d');
  if (!context) return null;
  let text = element.querySelector(':scope > [data-ink-gap-text]');
  if (!text) {
    text = document.createElement('span');
    text.dataset.inkGapText = '1';
    text.style.cssText = 'display:inline-block; font:inherit!important; line-height:inherit!important; color:inherit!important;';
    while (element.firstChild) text.appendChild(element.firstChild);
    element.appendChild(text);
  }
  let baseline = text.querySelector('[data-ink-gap-baseline]');
  if (!baseline) {
    baseline = document.createElement('span');
    baseline.dataset.inkGapBaseline = '1';
    baseline.style.cssText = 'display:inline-block; width:0; height:0; padding:0; margin:0; border:0; vertical-align:baseline;';
    text.appendChild(baseline);
  }
  const style = win.getComputedStyle(element);
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const metrics = context.measureText(element.textContent.trim());
  const scale = ospChapterScale(element, win);
  const baselineTop = baseline.getBoundingClientRect().top;
  const ascent = Number(metrics.actualBoundingBoxAscent) || 0;
  const descent = Number(metrics.actualBoundingBoxDescent) || 0;
  // Use a descender-free title as the shared body-line reference. This keeps
  // Background's lowercase "g" from pulling its header line down while still
  // leaving the descender visible below the aligned body letters.
  const canonicalBody = context.measureText('Character Notes');
  const canonicalBodyDescent = Number(canonicalBody.actualBoundingBoxDescent) || 0;
  const bodyBottom = baselineTop + canonicalBodyDescent * scale;
  element.dataset.inkTop = String(baselineTop - ascent * scale);
  element.dataset.inkBottom = String(baselineTop + descent * scale);
  element.dataset.bodyBottom = String(bodyBottom);
  element.dataset.titleBodyBottom = String(bodyBottom);
  element.dataset.inkFont = context.font;
  return {
    top: baselineTop - ascent * scale,
    bottom: baselineTop + descent * scale,
    bodyBottom,
  };
}

function ospChapterInkTop(element, win) {
  return ospChapterInkMetrics(element, win)?.top ?? null;
}

function ospChapterScale(element, win) {
  const rect = element.getBoundingClientRect();
  const style = win.getComputedStyle(element);
  const height = Number.parseFloat(style.height);
  const cssHeight = style.boxSizing === 'border-box' ? height : height
    + (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
    + (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0);
  return cssHeight > 0 ? rect.height / cssHeight : rect.height / element.offsetHeight;
}

function ospChapterInlineState(element) {
  return {
    position: element.style?.getPropertyValue?.('position') ?? '',
    positionPriority: element.style?.getPropertyPriority?.('position') ?? '',
    top: element.style?.getPropertyValue?.('top') ?? '',
    topPriority: element.style?.getPropertyPriority?.('top') ?? '',
  };
}

function ospChapterRestore(element, state) {
  if (!element?.style || !state) return;
  if (state.position) element.style.setProperty('position', state.position, state.positionPriority);
  else element.style.removeProperty('position');
  if (state.top) element.style.setProperty('top', state.top, state.topPriority);
  else element.style.removeProperty('top');
}

function ospChapterNumber(value) {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : 0;
}

function ospChapterTranslateY(value) {
  const plain = String(value ?? '').match(/-?\d+(?:\.\d+)?px\s+(-?\d+(?:\.\d+)?)px/);
  if (plain) return Number.parseFloat(plain[1]);
  const match = String(value ?? '').match(/(?:translate|matrix)[^(]*\(([^)]+)\)/);
  if (!match) return 0;
  const parts = match[1].split(/[,\s]+/).filter(Boolean).map(Number);
  return String(value).startsWith('matrix') ? (parts[5] || 0) : (parts[1] || 0);
}

function ospChapterPseudoTranslateY(pseudo) {
  const translate = String(pseudo?.translate ?? '');
  return translate && translate !== 'none'
    ? ospChapterTranslateY(translate)
    : ospChapterTranslateY(pseudo?.transform);
}

function ospChapterPanelAncestor(panel, active, win) {
  let node = panel?.parentElement ?? active;
  while (node && node !== active?.ownerDocument?.documentElement) {
    const computed = win?.getComputedStyle?.(node);
    if (computed && (computed.position !== 'static' || computed.transform !== 'none' || computed.translate !== 'none')) return node;
    if (node === active) break;
    node = node.parentElement;
  }
  return active;
}

/**
 * Align the visible primary header of each non-Bio tab to a common 90px top edge.
 * The helper owns only temporary inline position/top values and all listeners it adds.
 */
export function activateChapterHeaderAlignment(form, appRoot) {
  if (!form?.querySelector || !appRoot?.querySelector || !appRoot?.getBoundingClientRect) return () => {};
  const win = ospChapterWindow(appRoot);
  const originals = new Map();
  const panelOriginals = new Map();
  const editorHeights = new Map();
  const skillOriginals = new Map();
  const handwrittenOriginals = new Map();
  const listeners = [];
  let disposed = false;
  let frame = null;

  const schedule = () => {
    if (disposed || frame !== null) return;
    const raf = win?.requestAnimationFrame?.bind(win);
    if (!raf) { apply(); return; }
    const tick = remaining => {
      frame = raf(() => {
        frame = null;
        if (disposed) return;
        if (remaining > 1) tick(remaining - 1);
        else apply();
      });
    };
    // The existing ink helper finishes on frame two; measure on frame three.
    tick(3);
  };

  const applyHandwrittenInk = active => {
    if (!active) return;
    const handwrittenColor = '#78694D';
    const handwrittenEntries = [];
    for (const element of active.querySelectorAll?.('*') ?? []) {
      const computed = win?.getComputedStyle?.(element);
      const family = String(computed?.fontFamily ?? '').toLowerCase();
      if (!family.includes('handwritten')) continue;
      handwrittenEntries.push({
        element,
        tagName: String(element.tagName ?? '').toLowerCase(),
        color: computed?.color,
        fill: computed?.fill,
      });
    }
    for (const { element, tagName, color, fill } of handwrittenEntries) {
      const state = handwrittenOriginals.get(element) ?? {};
      if (!Object.hasOwn(state, 'color')) {
        state.color = { value: element.style?.getPropertyValue?.('color') ?? '', priority: element.style?.getPropertyPriority?.('color') ?? '' };
      }
      if (color !== 'rgb(120, 105, 77)') element.style?.setProperty?.('color', handwrittenColor, 'important');
      if (tagName === 'text') {
        if (!Object.hasOwn(state, 'fill')) {
          state.fill = { value: element.style?.getPropertyValue?.('fill') ?? '', priority: element.style?.getPropertyPriority?.('fill') ?? '' };
        }
        if (fill !== 'rgb(120, 105, 77)') element.style?.setProperty?.('fill', handwrittenColor, 'important');
      }
      handwrittenOriginals.set(element, state);
    }
  };

  const apply = () => {
    if (disposed) return;
    const active = form.querySelector('.sheet-body > .tab.active');
    if (!active) return;
    applyHandwrittenInk(active);
    const tabName = active.dataset?.tab;
    const selectors = OSP_CHAPTER_HEADERS[tabName];
    if (!selectors) return;
    const headings = selectors.map(selector => active.querySelector(selector)).filter(ospChapterVisible);
    if (!headings.length) return;
    // Wrapping either line can affect baseline layout; prepare both before measuring.
    for (const heading of headings) ospChapterInkTop(heading, win);
    const rootRect = appRoot.getBoundingClientRect();

    // Align the primary title first. Writing tabs use a shared title ink
    // bottom so different glyphs still land on one visual baseline.
    const primary = headings[0];
    const primaryInkTop = ospChapterInkTop(primary, win);
    if (!Number.isFinite(primaryInkTop) || !Number.isFinite(rootRect.top)) return;
    const writingTab = ['character', 'details', 'background', 'notes'].includes(tabName);
    const primaryMetrics = writingTab ? ospChapterInkMetrics(primary, win) : null;
    let primaryDelta = rootRect.top + OSP_CHAPTER_HEADER_TARGET - primaryInkTop;
    if (writingTab && primaryMetrics) {
      const document = primary.ownerDocument;
      const context = document?.createElement?.('canvas')?.getContext?.('2d');
      const style = win.getComputedStyle(primary);
      if (context) {
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const canonical = context.measureText('Character Background');
        const scale = ospChapterScale(primary, win);
        const canonicalHeight = ((Number(canonical.actualBoundingBoxAscent) || 0)
          + (Number(canonical.actualBoundingBoxDescent) || 0)) * scale;
        primaryDelta = rootRect.top + OSP_CHAPTER_HEADER_TARGET + canonicalHeight - primaryMetrics.bodyBottom;
      }
    }
    if (Math.abs(primaryDelta) >= 0.05) {
      for (const heading of headings) {
        if (!originals.has(heading)) originals.set(heading, ospChapterInlineState(heading));
        const computed = win?.getComputedStyle?.(heading);
        const currentTop = Number.parseFloat(computed?.top ?? heading.style?.top) || 0;
        const scale = ospChapterScale(heading, win);
        if (!(scale > 0 && Number.isFinite(scale))) continue;
        if (computed.position === 'static') heading.style.setProperty('position', 'relative', 'important');
        heading.style.setProperty('top', `${currentTop + primaryDelta / scale}px`, 'important');
      }
    }

    let writingBorderTarget = null;
    if (writingTab && headings.length > 1) {
      const titleMetrics = ospChapterInkMetrics(headings[0], win);
      const subtitle = headings[1];
      const subtitleMetrics = ospChapterInkMetrics(subtitle, win);
      const subtitleScale = ospChapterScale(subtitle, win);
      if (titleMetrics && subtitleMetrics && subtitleScale > 0 && Number.isFinite(subtitleScale)) {
        const subtitleDelta = titleMetrics.bodyBottom + OSP_WRITING_TITLE_SUBTITLE_GAP - subtitleMetrics.top;
        if (Math.abs(subtitleDelta) >= 0.05) {
          if (!originals.has(subtitle)) originals.set(subtitle, ospChapterInlineState(subtitle));
          const computed = win?.getComputedStyle?.(subtitle);
          const currentTop = Number.parseFloat(computed?.top ?? subtitle.style?.top) || 0;
          if (computed.position === 'static') subtitle.style.setProperty('position', 'relative', 'important');
          subtitle.style.setProperty('top', `${currentTop + subtitleDelta / subtitleScale}px`, 'important');
        }
        const alignedSubtitle = ospChapterInkMetrics(subtitle, win);
        if (alignedSubtitle) writingBorderTarget = alignedSubtitle.bottom + OSP_WRITING_SUBTITLE_BORDER_GAP;
      }
    }

    if (tabName === 'skills' && headings.length > 1) {
      const subtitleMetrics = ospChapterInkMetrics(headings[1], win);
      const svgContainer = active.querySelector('.cs-skill-svg-container');
      const abilities = active.querySelector('.skill-abilities-section');
      const labels = [...(svgContainer?.querySelectorAll?.('.cs-generated-skill-label') ?? [])];
      const labelTops = labels.map(label => measureSkillLabelInk(label)?.top).filter(Number.isFinite);
      if (subtitleMetrics && labelTops.length && svgContainer && abilities) {
        const labelGap = svgContainer.dataset.skillStrip === "horizontal" ? 13 : 8;
        const desiredTop = subtitleMetrics.bottom + labelGap;
        const sectionDelta = desiredTop - Math.min(...labelTops);
        const sectionScale = ospChapterScale(active, win);
        if (sectionScale > 0 && Number.isFinite(sectionScale)) {
          const residualLocalDelta = sectionDelta / sectionScale;
          const previousLocalDelta = Number.parseFloat(svgContainer.style.getPropertyValue('--osp-skills-section-shift')) || 0;
          const localDelta = previousLocalDelta + residualLocalDelta;
          const shiftedSections = svgContainer.dataset.skillStrip === 'horizontal' ? [svgContainer] : [svgContainer, abilities];
          for (const element of shiftedSections) {
            if (!skillOriginals.has(element)) skillOriginals.set(element, {
              kind: 'section',
              top: element.style?.getPropertyValue?.('top') ?? '',
              topPriority: element.style?.getPropertyPriority?.('top') ?? '',
              marginTop: element.style?.getPropertyValue?.('margin-top') ?? '',
              marginTopPriority: element.style?.getPropertyPriority?.('margin-top') ?? '',
              shift: element.style?.getPropertyValue?.('--osp-skills-section-shift') ?? '',
              shiftPriority: element.style?.getPropertyPriority?.('--osp-skills-section-shift') ?? '',
            });
          }
          svgContainer.style.setProperty('--osp-skills-section-shift', `${localDelta}px`, 'important');
          if (shiftedSections.includes(abilities)) abilities.style.setProperty('--osp-skills-section-shift', `${localDelta}px`, 'important');
          for (const element of shiftedSections) {
            const style = win.getComputedStyle(element);
            const currentTop = Number.parseFloat(style.top) || 0;
            element.style.setProperty('top', `${currentTop + residualLocalDelta}px`, 'important');
          }
          for (const target of active.querySelectorAll?.('.listening-group') ?? []) {
            if (svgContainer.contains(target)) continue;
            if (!skillOriginals.has(target)) skillOriginals.set(target, {
              kind: 'target',
              value: target.style?.getPropertyValue?.('--top') ?? '',
              priority: target.style?.getPropertyPriority?.('--top') ?? '',
            });
            const currentTop = Number.parseFloat(win.getComputedStyle(target).getPropertyValue('--top')) || 0;
            if (Math.abs(residualLocalDelta) > 0.01) target.style.setProperty('--top', `${currentTop + residualLocalDelta}px`, 'important');
          }
          svgContainer.dataset.sectionInkShift = String(sectionDelta);
          svgContainer.dataset.sectionInkTarget = String(desiredTop);
        }
      }
    }

    if (['character', 'details', 'background'].includes(tabName)) {
      const panels = [...(active.querySelectorAll?.('.bg-panel') ?? [])];
      if (!panels.length) {
        const single = active.querySelector('.bg-panel');
        if (single) panels.push(single);
      }
      for (const panel of panels) {
        const ancestor = ospChapterPanelAncestor(panel, active, win);
        const panelRect = ancestor?.getBoundingClientRect?.();
        const pseudo = panel && win?.getComputedStyle?.(panel, '::before');
        const ancestorStyle = ancestor && win?.getComputedStyle?.(ancestor);
        if (!panel || !pseudo || !panelRect || !ancestorStyle) continue;
        const scale = ospChapterScale(ancestor, win);
        const borderTop = ospChapterNumber(ancestorStyle.borderTopWidth);
        const translateY = ospChapterPseudoTranslateY(pseudo);
        if (scale > 0 && Number.isFinite(scale)) {
          if (!panelOriginals.has(panel)) panelOriginals.set(panel, {
            value: panel.style?.getPropertyValue?.('--osp-writing-panel-height') ?? '',
            priority: panel.style?.getPropertyPriority?.('--osp-writing-panel-height') ?? '',
            topValue: panel.style?.getPropertyValue?.('--osp-writing-panel-top') ?? '',
            topPriority: panel.style?.getPropertyPriority?.('--osp-writing-panel-top') ?? '',
          });
          const borderTarget = writingBorderTarget ?? rootRect.top + 132;
          const desiredTop = (borderTarget - panelRect.top) / scale - borderTop - translateY;
          const desiredHeight = (rootRect.top + OSP_WRITING_PANEL_BOTTOM_TARGET - panelRect.top) / scale - borderTop - desiredTop - translateY;
          panel.style?.setProperty?.('--osp-writing-panel-top', `${desiredTop}px`, 'important');
          panel.style?.setProperty?.('--osp-writing-panel-height', `${desiredHeight}px`, 'important');
          if (['character', 'details', 'background'].includes(tabName)) {
            const title = panel.querySelector?.('.bg-panel-title');
            const inkTop = title && ospChapterInkTop(title, win);
            const borderY = panelRect.top + (borderTop + desiredTop + translateY) * scale;
            // Keep the title's visible ink seven pixels below the panel rule.
            // Calculating the target from the current ink position makes this
            // correction idempotent across ResizeObserver/mutation re-applies.
            const shift = borderY + 7 - inkTop;
            if (title && Number.isFinite(inkTop) && Math.abs(shift) > 0.05) {
              for (const part of panel.querySelectorAll('.bg-panel-title, .bg-panel-hint, .bg-panel-editor')) {
                if (!originals.has(part)) originals.set(part, ospChapterInlineState(part));
                const style = win.getComputedStyle(part);
                const partScale = ospChapterScale(part, win);
                if (partScale > 0) part.style.setProperty('top', `${(Number.parseFloat(style.top) || 0) + shift / partScale}px`, 'important');
              }
            }
          }
          const editor = panel.querySelector?.('.bg-panel-editor');
          if (editor) {
            if (['character', 'details', 'background'].includes(tabName)) {
              const title = panel.querySelector('.bg-panel-title');
              if (title) {
                const editorScale = ospChapterScale(editor, win);
                const shift = title.getBoundingClientRect().bottom - editor.getBoundingClientRect().top - 2;
                if (editorScale > 0 && Math.abs(shift) > 0.05) {
                  if (!originals.has(editor)) originals.set(editor, ospChapterInlineState(editor));
                  const top = Number.parseFloat(win.getComputedStyle(editor).top) || 0;
                  editor.style.setProperty('top', `${top + shift / editorScale}px`, 'important');
                }
              }
            }
            const editorRect = editor.getBoundingClientRect();
            const editorStyle = win.getComputedStyle(editor);
            const editorScale = ospChapterScale(editor, win);
            if (editorScale > 0) {
              if (!editorHeights.has(editor)) editorHeights.set(editor, {
                value: editor.style.getPropertyValue('height'), priority: editor.style.getPropertyPriority('height'),
              });
              const extra = editorStyle.boxSizing === 'border-box' ? 0 :
                ospChapterNumber(editorStyle.paddingTop) + ospChapterNumber(editorStyle.paddingBottom) +
                ospChapterNumber(editorStyle.borderTopWidth) + ospChapterNumber(editorStyle.borderBottomWidth);
              editor.style.setProperty('height', `${(rootRect.top + OSP_WRITING_PANEL_BOTTOM_TARGET - editorRect.top) / editorScale - extra}px`, 'important');
            }
          }
        }
      }
    }
    if (tabName === 'notes') {
      const menu = active.querySelector('.editor-menu');
      if (menu) {
        const menuScale = ospChapterScale(menu, win);
        if (menuScale > 0) {
          if (!originals.has(menu)) originals.set(menu, ospChapterInlineState(menu));
          const previousTop = Number.parseFloat(originals.get(menu).top) || 0;
          menu.style.setProperty('position', 'relative', 'important');
          menu.style.setProperty('top', `${previousTop - 2 / menuScale}px`, 'important');
        }
      }
      const ancestor = active;
      const panelRect = ancestor.getBoundingClientRect?.();
      const pseudo = win?.getComputedStyle?.(ancestor, '::before');
      const ancestorStyle = win?.getComputedStyle?.(ancestor);
      const editor = active.querySelector('.bg-panel-editor');
      if (panelRect && pseudo && ancestorStyle) {
        const scale = ospChapterScale(ancestor, win);
        const top = ospChapterNumber(pseudo.top);
        const borderTop = ospChapterNumber(ancestorStyle.borderTopWidth);
        const translateY = ospChapterPseudoTranslateY(pseudo);
        if (scale > 0 && Number.isFinite(scale)) {
          if (!panelOriginals.has(ancestor)) panelOriginals.set(ancestor, {
            value: ancestor.style?.getPropertyValue?.('--osp-writing-panel-height') ?? '',
            priority: ancestor.style?.getPropertyPriority?.('--osp-writing-panel-height') ?? '',
            topValue: ancestor.style?.getPropertyValue?.('--osp-writing-panel-top') ?? '',
            topPriority: ancestor.style?.getPropertyPriority?.('--osp-writing-panel-top') ?? '',
          });
      const borderTarget = writingBorderTarget ?? rootRect.top + 132;
          const desiredTop = (borderTarget - panelRect.top) / scale - borderTop - translateY;
          const desiredHeight = (rootRect.top + OSP_WRITING_PANEL_BOTTOM_TARGET - panelRect.top) / scale - borderTop - desiredTop - translateY;
          ancestor.style?.setProperty?.('--osp-writing-panel-top', `${desiredTop}px`, 'important');
          ancestor.style?.setProperty?.('--osp-writing-panel-height', `${desiredHeight}px`, 'important');
          if (editor) {
            const currentRect = editor.getBoundingClientRect();
            const currentScale = ospChapterScale(editor, win);
            const targetTop = borderTarget + 5;
            const currentTop = Number.parseFloat(win.getComputedStyle(editor).top) || 0;
            const baseTop = currentRect.top - currentTop * currentScale;
            const desiredTop = currentScale > 0 ? (targetTop - baseTop) / currentScale : currentTop;
            if (currentScale > 0 && Math.abs(desiredTop - currentTop) > 0.05) {
              if (!originals.has(editor)) originals.set(editor, ospChapterInlineState(editor));
              editor.style.setProperty('top', `${desiredTop}px`, 'important');
            }
            const editorRect = editor.getBoundingClientRect?.();
            const editorStyle = win.getComputedStyle(editor);
            const editorScale = ospChapterScale(editor, win);
            if (editorRect && editorScale > 0) {
              if (!editorHeights.has(editor)) editorHeights.set(editor, {
                value: editor.style.getPropertyValue('height'), priority: editor.style.getPropertyPriority('height'),
              });
              const extra = editorStyle.boxSizing === 'border-box' ? 0 :
                ospChapterNumber(editorStyle.paddingTop) + ospChapterNumber(editorStyle.paddingBottom) +
                ospChapterNumber(editorStyle.borderTopWidth) + ospChapterNumber(editorStyle.borderBottomWidth);
              editor.style.setProperty('height', `${(rootRect.top + OSP_WRITING_PANEL_BOTTOM_TARGET - editorRect.top) / editorScale - extra}px`, 'important');
            }
          }
        }
      }
    }
  };

  const initialActive = form.querySelector('.sheet-body > .tab.active');
  if (initialActive?.dataset?.tab === 'gear') apply();
  else applyHandwrittenInk(initialActive);

  const on = (target, type, listener, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener, options);
    listeners.push(() => target.removeEventListener(type, listener, options));
  };

  const observer = typeof win?.MutationObserver === 'function' ? new win.MutationObserver(records => {
    if (records.some(record => {
      if (record.type === 'childList') {
        const tab = record.target?.closest?.('.tab');
        if (tab && !tab.classList?.contains?.('active')) return false;
        return true;
      }
      return record.target?.matches?.('.tab[data-tab], .sheet-tabs [data-tab]');
    })) schedule();
  }) : null;
  observer?.observe(form, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  const resizeObserver = typeof win?.ResizeObserver === 'function' ? new win.ResizeObserver(schedule) : null;
  resizeObserver?.observe(appRoot);
  resizeObserver?.observe(form);
  on(win, 'resize', schedule);
  on(form, 'pointerup', schedule);
  on(win?.document?.fonts, 'loadingdone', schedule);
  Promise.resolve(win?.document?.fonts?.ready).then(() => schedule(), () => {});
  schedule();

  return () => {
    if (disposed) return;
    disposed = true;
    if (frame !== null) {
      const cancel = win?.cancelAnimationFrame ?? globalThis.cancelAnimationFrame;
      if (typeof cancel === 'function') cancel(frame);
    }
    observer?.disconnect();
    resizeObserver?.disconnect();
    listeners.splice(0).forEach(remove => remove());
    for (const [element, state] of originals) ospChapterRestore(element, state);
    for (const [panel, state] of panelOriginals) {
      if (!panel?.style) continue;
      if (state.value) panel.style.setProperty('--osp-writing-panel-height', state.value, state.priority);
      else panel.style.removeProperty('--osp-writing-panel-height');
      if (state.topValue) panel.style.setProperty('--osp-writing-panel-top', state.topValue, state.topPriority);
      else panel.style.removeProperty('--osp-writing-panel-top');
    }
    for (const [editor, state] of editorHeights) {
      if (state.value) editor.style.setProperty('height', state.value, state.priority);
      else editor.style.removeProperty('height');
    }
    for (const [element, state] of skillOriginals) {
      if (!element?.style) continue;
      if (state.kind === 'target') {
        if (state.value) element.style.setProperty('--top', state.value, state.priority);
        else element.style.removeProperty('--top');
      } else {
        for (const [property, value, priority] of [
          ['top', state.top, state.topPriority],
          ['margin-top', state.marginTop, state.marginTopPriority],
          ['--osp-skills-section-shift', state.shift, state.shiftPriority],
        ]) {
          if (value) element.style.setProperty(property, value, priority);
          else element.style.removeProperty(property);
        }
      }
    }
    for (const [element, state] of handwrittenOriginals) {
      for (const property of ['color', 'fill']) {
        const original = state[property];
        if (!original) continue;
        if (original.value) element.style.setProperty(property, original.value, original.priority);
        else element.style.removeProperty(property);
      }
    }
    editorHeights.clear();
    originals.clear();
    panelOriginals.clear();
    handwrittenOriginals.clear();
    skillOriginals.clear();
  };
}

