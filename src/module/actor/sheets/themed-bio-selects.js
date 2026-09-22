/**
 * Present native Bio selects using the sheet theme. The native options are the
 * sole source of truth: race eligibility can replace them without a sheet render.
 * Returns a cleanup function for re-render/close; no actor data is written here.
 */
export function activateThemedBioSelects(root) {
  if (!root) return () => {};
  const document = root.ownerDocument;
  const { Event, MutationObserver } = document.defaultView;
  const controls = [];
  const selector = '.tab[data-tab="bio"] select:is(.cs-class-select, .cs-race-select, .cs-alignment-select, .cs-background-select, .cs-sex-field)';

  const closeMenus = (except = null) => {
    for (const { wrapper, trigger } of controls) {
      if (wrapper === except) continue;
      wrapper.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  };

  for (const select of root.querySelectorAll(selector)) {
    if (select.dataset.themedSelect === 'true' || select.disabled) continue;
    select.dataset.themedSelect = 'true';
    select.classList.add('cs-themed-select-native');

    const wrapper = document.createElement('div');
    wrapper.className = 'cs-themed-select';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cs-themed-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div');
    menu.className = 'cs-themed-select-menu';
    menu.setAttribute('role', 'listbox');

    const optionDisabled = (option) => option.disabled || (option.parentElement?.tagName === 'OPTGROUP' && option.parentElement.disabled);
    let signature;
    const update = () => {
      const options = Array.from(select.options).filter((option) => !option.hidden);
      const nextSignature = JSON.stringify(options.map((option) => [option.value, option.label, optionDisabled(option)]));
      trigger.textContent = select.selectedOptions[0]?.label ?? '';
      trigger.disabled = select.disabled;
      if (select.disabled) {
        wrapper.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      }

      if (signature !== nextSignature) {
        signature = nextSignature;
        menu.replaceChildren();
        for (const nativeOption of options) {
          const option = document.createElement('button');
          option.type = 'button';
          option.className = 'cs-themed-select-option';
          option.dataset.value = nativeOption.value;
          option.textContent = nativeOption.label;
          option.disabled = optionDisabled(nativeOption);
          option.setAttribute('role', 'option');
          option.addEventListener('click', () => {
            // Even a formerly rendered button must never select a class which
            // the current native eligibility list no longer permits.
            const current = Array.from(select.options).find((entry) => entry.value === option.dataset.value);
            if (select.disabled || !current || current.hidden || optionDisabled(current)) {
              update();
              closeMenus();
              return;
            }
            select.value = current.value;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
            update();
            closeMenus();
            if (trigger.isConnected) trigger.focus();
          });
          menu.appendChild(option);
        }
      }
      for (const option of menu.children) {
        const selected = option.dataset.value === select.value;
        option.classList.toggle('is-selected', selected);
        option.setAttribute('aria-selected', String(selected));
      }
    };

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      // Also covers programmatic .value changes which emit no DOM event.
      update();
      if (select.disabled) return;
      const opening = !wrapper.classList.contains('is-open');
      closeMenus(wrapper);
      wrapper.classList.toggle('is-open', opening);
      trigger.setAttribute('aria-expanded', String(opening));
    });

    const observer = new MutationObserver(update);
    observer.observe(select, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['disabled', 'hidden', 'label', 'selected', 'value'],
    });
    select.addEventListener('change', update);
    wrapper.append(trigger, menu);
    select.parentElement.appendChild(wrapper);
    controls.push({ select, wrapper, trigger, update, observer });
    update();
  }

  // Native race handlers finish filtering before the event bubbles here. Sync
  // the Class menu and any fallback selection immediately, without inventing a
  // second class-change event (which would also invoke XP/level handlers).
  const updateAll = () => controls.forEach(({ update }) => update());
  const outsideClick = (event) => {
    if (!event.target.closest('.cs-themed-select')) closeMenus();
  };
  const escape = (event) => {
    if (event.key !== 'Escape') return;
    const current = controls.find(({ wrapper }) => wrapper.contains(event.target));
    closeMenus();
    if (current) current.trigger.focus();
  };
  root.addEventListener('change', updateAll);
  root.addEventListener('click', outsideClick);
  root.addEventListener('keydown', escape);

  return () => {
    root.removeEventListener('change', updateAll);
    root.removeEventListener('click', outsideClick);
    root.removeEventListener('keydown', escape);
    for (const { select, wrapper, update, observer } of controls) {
      observer.disconnect();
      select.removeEventListener('change', update);
      select.classList.remove('cs-themed-select-native');
      delete select.dataset.themedSelect;
      wrapper.remove();
    }
  };
}
