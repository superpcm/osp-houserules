// Single tuning point for all system tooltip hover delays.
export const TOOLTIP_DELAY_MS = 2000;

const TOOLTIP_OWNER_SELECTOR = '[data-tooltip], [data-tooltip-text], [data-tooltip-html]';
const TOOLTIP_HOVER_CONTROLLER = Symbol('ospTooltipHoverController');

/** Resolve Foundry translation keys used as editor control labels. */
export function resolveTooltipLabel(value) {
  if (typeof value !== 'string' || !value.startsWith('EDITOR.')) return value;
  const i18n = globalThis.game?.i18n;
  return i18n?.has?.(value) ? i18n.localize(value) : value;
}

const tooltipOwnerFor = target => {
  if (!(target instanceof Element)) return null;
  return target.closest(TOOLTIP_OWNER_SELECTOR);
};

/**
 * Make leaving a normal tooltip immediate without replacing Foundry's manager.
 * Document capture runs before Foundry's body capture listener, so the public
 * manager API can cancel its pending/deactivation timers without propagation
 * tricks or private-field access.
 */
function installImmediateHoverDismissal() {
  if (document[TOOLTIP_HOVER_CONTROLLER]) return document[TOOLTIP_HOVER_CONTROLLER];

  let pendingOwner = null;
  const manager = () => game?.tooltip;
  const onPointerEnter = event => {
    const owner = tooltipOwnerFor(event.target);
    if (!owner) return;
    const tooltip = manager();
    if (!tooltip) return;
    if (tooltip.element && tooltip.element !== owner) {
      tooltip.clearPending();
      tooltip.deactivate();
      pendingOwner = null;
    } else if (pendingOwner && pendingOwner !== owner) {
      tooltip.clearPending();
      pendingOwner = null;
    }
    pendingOwner = owner;
  };
  const onPointerLeave = event => {
    const owner = tooltipOwnerFor(event.target);
    if (!owner || (event.relatedTarget instanceof Node && owner.contains(event.relatedTarget))) return;
    const tooltip = manager();
    if (!tooltip) return;
    if (pendingOwner === owner || tooltip.element === owner) {
      tooltip.clearPending();
      tooltip.deactivate();
      pendingOwner = null;
    }
  };
  document.addEventListener('pointerenter', onPointerEnter, true);
  document.addEventListener('pointerleave', onPointerLeave, true);
  const controller = {
    dispose() {
      document.removeEventListener('pointerenter', onPointerEnter, true);
      document.removeEventListener('pointerleave', onPointerLeave, true);
      pendingOwner = null;
      if (document[TOOLTIP_HOVER_CONTROLLER] === controller) delete document[TOOLTIP_HOVER_CONTROLLER];
    }
  };
  document[TOOLTIP_HOVER_CONTROLLER] = controller;
  return controller;
}

/** Route native title hints through Foundry's styled tooltip renderer. */
export function initializeTooltips() {
  game.tooltip.constructor.TOOLTIP_ACTIVATION_MS = TOOLTIP_DELAY_MS;
  document.documentElement.style.setProperty('--osp-tooltip-delay', `${TOOLTIP_DELAY_MS}ms`);
  installImmediateHoverDismissal();
  const generated = new WeakMap();
  const generatedLabels = new WeakMap();
  const normalize = element => {
    if (!(element instanceof HTMLElement)) return;
    for (const attribute of ['data-tooltip', 'data-tooltip-text', 'aria-label']) {
      const value = element.getAttribute(attribute);
      const localized = resolveTooltipLabel(value);
      if (localized !== value) {
        if (attribute === 'data-tooltip') {
          const escaped = document.createElement('span');
          escaped.textContent = localized;
          element.setAttribute(attribute, escaped.innerHTML);
        } else element.setAttribute(attribute, localized);
      }
    }
    if (!element.hasAttribute('title')) return;
    const title = resolveTooltipLabel(element.getAttribute('title'));
    // Icon-only controls previously used title as their accessible name.
    if ((!element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby') && !element.textContent.trim()) ||
        (generatedLabels.has(element) && element.getAttribute('aria-label') === generatedLabels.get(element))) {
      if (title) {
        element.setAttribute('aria-label', title);
        generatedLabels.set(element, title);
      } else if (generatedLabels.has(element)) {
        element.removeAttribute('aria-label');
        generatedLabels.delete(element);
      }
    }
    if (title && (!element.hasAttribute('data-tooltip') || element.getAttribute('data-tooltip') === generated.get(element))) {
      // Foundry interprets tooltip content as HTML; preserve literal title text.
      const escaped = document.createElement('span');
      escaped.textContent = title;
      element.setAttribute('data-tooltip', escaped.innerHTML);
      generated.set(element, escaped.innerHTML);
    }
    if (!title && generated.has(element) && element.getAttribute('data-tooltip') === generated.get(element)) {
      element.removeAttribute('data-tooltip');
      generated.delete(element);
    }
    element.removeAttribute('title');
  };
  const scan = root => {
    normalize(root);
    root.querySelectorAll?.('[title], [data-tooltip], [data-tooltip-text], [aria-label]').forEach(normalize);
  };
  scan(document.body);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') normalize(record.target);
      else record.addedNodes.forEach(scan);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['title', 'data-tooltip', 'data-tooltip-text', 'aria-label']
  });
}
