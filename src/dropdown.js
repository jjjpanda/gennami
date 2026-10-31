export const DROPDOWN_CHEVRON = `<svg class="dropdown-chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
  <path d="m2 4 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;

export function renderDropdown(name, label, options, value) {
  const selected = options.find(option => option.value === value) ?? options[0];
  return `<div class="dropdown" data-dropdown="${name}">
    <button type="button" class="dropdown-trigger" data-control="${name}" role="combobox"
      aria-label="${label}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${name}-options">
      <span data-dropdown-label>${selected.label}</span>${DROPDOWN_CHEVRON}
    </button>
    <div class="dropdown-menu" id="${name}-options" role="listbox" aria-label="${label}" popover="auto">
      ${options.map(option => `<button type="button" class="dropdown-option" role="option" tabindex="-1"
        data-value="${option.value}" aria-selected="${option.value === selected.value}">${option.label}</button>`).join('')}
    </div>
  </div>`;
}

export class Dropdown {
  constructor(element, signal, onChange) {
    this.element = element;
    this.trigger = element.querySelector('.dropdown-trigger');
    this.menu = element.querySelector('[role="listbox"]');
    this.search = '';
    this.searchTime = 0;
    this.menu.addEventListener('beforetoggle', event => {
      this.trigger.setAttribute('aria-expanded', String(event.newState === 'open'));
    }, { signal });
    this.trigger.addEventListener('click', () => {
      if (this.open) this.close();
      else this.show();
    }, { signal });
    this.menu.addEventListener('click', event => {
      const option = event.target.closest('[role="option"]');
      if (!option) return;
      this.setValue(option.dataset.value);
      this.close(true);
      onChange(option.dataset.value);
    }, { signal });
    element.addEventListener('keydown', event => this.onKeyDown(event), { signal });
    element.addEventListener('focusout', event => {
      if (!element.contains(event.relatedTarget)) this.close();
    }, { signal });
    window.addEventListener('resize', () => this.close(), { signal });
    element.getRootNode().addEventListener('scroll', event => {
      if (!this.menu.contains(event.target)) this.close();
    }, { signal, capture: true });
  }

  get options() { return [...this.menu.querySelectorAll('[role="option"]')]; }
  get open() { return this.menu.matches(':popover-open'); }

  setValue(value, customLabel) {
    const customOption = this.menu.querySelector('[data-custom-option]');
    if (customOption && customOption.dataset.value !== value) customOption.remove();
    let selected = this.options.find(option => option.dataset.value === value);
    if (!selected && customLabel) {
      selected = document.createElement('button');
      selected.type = 'button';
      selected.className = 'dropdown-option';
      selected.setAttribute('role', 'option');
      selected.tabIndex = -1;
      selected.dataset.value = value;
      selected.dataset.customOption = '';
      selected.textContent = customLabel;
      this.menu.append(selected);
    }
    if (!selected) return;
    this.options.forEach(option => option.setAttribute('aria-selected', String(option === selected)));
    const label = this.trigger.querySelector('[data-dropdown-label]');
    if (label) label.textContent = selected.textContent;
    this.trigger.dataset.value = value;
  }

  show() {
    this.menu.showPopover();
    const rect = this.trigger.getBoundingClientRect();
    this.menu.style.width = `${Math.max(rect.width, 112)}px`;
    this.menu.style.maxHeight = `${Math.min(300, Math.max(rect.top, window.innerHeight - rect.bottom) - 20)}px`;
    const height = this.menu.getBoundingClientRect().height;
    this.menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - this.menu.offsetWidth - 8))}px`;
    this.menu.style.top = `${rect.bottom + height + 8 > window.innerHeight ? rect.top - height - 6 : rect.bottom + 6}px`;
    this.focusOption(this.options.find(option => option.getAttribute('aria-selected') === 'true') ?? this.options[0]);
  }

  focusOption(option) {
    if (!option) return;
    option.focus({ preventScroll: true });
    const menuRect = this.menu.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    const top = menuRect.top + this.menu.clientTop;
    const bottom = top + this.menu.clientHeight;
    if (optionRect.top < top) this.menu.scrollTop -= top - optionRect.top;
    if (optionRect.bottom > bottom) this.menu.scrollTop += optionRect.bottom - bottom;
  }

  close(restoreFocus = false) {
    if (this.open) this.menu.hidePopover();
    if (restoreFocus) this.trigger.focus({ preventScroll: true });
  }

  onKeyDown(event) {
    // Keep simulation shortcuts from intercepting dropdown interaction.
    event.stopPropagation();
    const { key } = event;
    if (key === 'Tab') { this.close(); return; }
    if (key === 'Escape') { event.preventDefault(); this.close(true); return; }
    const options = this.options;
    const index = options.indexOf(this.element.getRootNode().activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault();
      if (!this.open) { this.show(); return; }
      const next = key === 'Home' ? 0 : key === 'End' ? options.length - 1
        : (index + (key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      this.focusOption(options[next]);
    } else if (key.length === 1 && key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (!this.open) this.show();
      const now = performance.now();
      this.search = (now - this.searchTime < 600 ? this.search : '') + key.toLowerCase();
      this.searchTime = now;
      this.focusOption(options.find(option => option.textContent.trim().toLowerCase().startsWith(this.search)));
    }
  }
}
