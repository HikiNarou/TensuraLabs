/**
 * Schema-driven form builder used by the appearance, content and settings editors.
 *
 * Field descriptor: { type, key, label, hint, placeholder, max, rows, options, fields, wide, itemTitle, min, maxItems }
 * types: text | textarea | number | color | toggle | select | date | image | list | repeater | group | localized | pairs
 * The form keeps its own deep-cloned state; inputs are bound by `data-path` (dot path with numeric indices).
 */
import { html, qs, qsa, render } from '../core/dom.js';
import { ic } from './icons.js';
import { openMediaPicker } from './media-picker.js';

const LOCALES = [{ code: 'id', label: 'Indonesia' }, { code: 'en', label: 'English' }];
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const join = (base, key) => {
  if (key === null || key === undefined || key === '') return base;
  return base === '' ? String(key) : `${base}.${key}`;
};

export function getPath(obj, path) {
  if (!path) return obj;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let target = obj;
  keys.slice(0, -1).forEach((key, i) => {
    if (target[key] == null) target[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    target = target[key];
  });
  target[keys[keys.length - 1]] = value;
}

/** Default value for a descriptor (used when adding repeater items). */
function blank(field) {
  switch (field.type) {
    case 'toggle': return false;
    case 'number': return field.min ?? 0;
    case 'color': return '#5ea8ff';
    case 'select': return field.options?.[0]?.value ?? '';
    case 'list': case 'repeater': case 'pairs': return [];
    case 'group': return Object.fromEntries(field.fields.map((f) => [f.key, blank(f)]));
    case 'localized': return Object.fromEntries(LOCALES.map((l) => [l.code, Object.fromEntries(field.fields.map((f) => [f.key, blank(f)]))]));
    default: return '';
  }
}
export const blankItem = (fields) => Object.fromEntries(fields.map((f) => [f.key, blank(f)]));

export function createForm(container, schema, initial, { onChange } = {}) {
  let state = clone(initial) ?? {};
  const ui = { tabs: new Map(), open: new Set() };
  const clearItems = () => { for (const key of [...ui.open]) if (!key.startsWith('g:')) ui.open.delete(key); };

  const label = (field, path) => html`<label class="field__label" for="f-${path}">${field.label}${field.max && !['list', 'pairs'].includes(field.type) ? html`<small class="field__count" data-count-for="${path}"></small>` : ''}</label>`;
  const hint = (field) => (field.hint ? html`<small class="field__hint">${field.hint}</small>` : '');

  function fieldView(field, base) {
    const path = join(base, field.key);
    const value = getPath(state, path);
    const wide = field.wide || ['textarea', 'list', 'repeater', 'group', 'localized', 'pairs', 'image'].includes(field.type);
    const wrap = (inner) => html`<div class="field ${wide ? 'field--wide' : ''}" data-field="${path}">${inner}<p class="field__error" data-error-for="${path}" hidden></p></div>`;

    switch (field.type) {
      case 'textarea':
        return wrap(html`${label(field, path)}<textarea class="input" id="f-${path}" data-path="${path}" rows="${field.rows ?? 3}" ${field.max ? `maxlength="${field.max}"` : ''} placeholder="${field.placeholder ?? ''}">${value ?? ''}</textarea>${hint(field)}`);
      case 'number':
        return wrap(html`${label(field, path)}<input class="input" id="f-${path}" type="number" data-path="${path}" data-type="number" value="${value ?? ''}" ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.maxValue !== undefined ? `max="${field.maxValue}"` : ''}>${hint(field)}`);
      case 'color':
        return wrap(html`${label(field, path)}<div class="color-input"><input type="color" data-path="${path}" value="${value || '#000000'}" aria-label="${field.label}"><input class="input" id="f-${path}" data-path="${path}" value="${value ?? ''}" maxlength="7" pattern="#[0-9a-fA-F]{6}"></div>${hint(field)}`);
      case 'toggle':
        return html`<div class="field field--toggle ${field.wide ? 'field--wide' : ''}" data-field="${path}">
          <label class="toggle-row"><span><b>${field.label}</b>${field.hint ? html`<small>${field.hint}</small>` : ''}</span>
          <span class="switch"><input type="checkbox" data-path="${path}" data-type="bool" ${value ? 'checked' : ''}><i></i></span></label></div>`;
      case 'select':
        return wrap(html`${label(field, path)}<select class="input" id="f-${path}" data-path="${path}">${field.options.map((o) => html`<option value="${o.value}" ${String(o.value) === String(value) ? 'selected' : ''}>${o.label}</option>`)}</select>${hint(field)}`);
      case 'date':
        return wrap(html`${label(field, path)}<input class="input" id="f-${path}" type="date" data-path="${path}" value="${value ?? ''}">${hint(field)}`);
      case 'image':
        return wrap(html`${label(field, path)}
          <div class="image-input">
            <div class="image-input__preview">${value ? html`<img src="${value}" alt="">` : ic.image}</div>
            <div class="image-input__ctrl">
              <input class="input" id="f-${path}" data-path="${path}" value="${value ?? ''}" placeholder="/uploads/… atau https://…">
              <div class="row">
                <button type="button" class="btn btn--sm" data-act="pick" data-target="${path}">${ic.image}<span>Pustaka media</span></button>
                ${value ? html`<button type="button" class="btn btn--sm btn--ghost" data-act="clear" data-target="${path}">Hapus</button>` : ''}
              </div>
            </div>
          </div>${hint(field)}`);
      case 'list':
        return wrap(html`${label(field, path)}
          <div class="list-input">
            ${(value ?? []).map((item, i) => html`
              <div class="list-input__row">
                ${field.multiline ? html`<textarea class="input" rows="3" data-path="${path}.${i}" ${field.max ? `maxlength="${field.max}"` : ''}>${item}</textarea>` : html`<input class="input" data-path="${path}.${i}" value="${item}" ${field.max ? `maxlength="${field.max}"` : ''}>`}
                <div class="list-input__btns">
                  <button type="button" class="btn btn--icon btn--ghost btn--sm" data-act="up" data-target="${path}" data-index="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Naikkan">${ic.up}</button>
                  <button type="button" class="btn btn--icon btn--ghost btn--sm" data-act="down" data-target="${path}" data-index="${i}" ${i === value.length - 1 ? 'disabled' : ''} aria-label="Turunkan">${ic.down}</button>
                  <button type="button" class="btn btn--icon btn--ghost btn--sm" data-act="remove" data-target="${path}" data-index="${i}" aria-label="Hapus">${ic.x}</button>
                </div>
              </div>`)}
            ${(value?.length ?? 0) < (field.maxItems ?? 50) ? html`<button type="button" class="btn btn--sm btn--dashed" data-act="add-string" data-target="${path}">${ic.plus}<span>${field.addLabel ?? 'Tambah'}</span></button>` : ''}
          </div>${hint(field)}`);
      case 'pairs':
        return wrap(html`${label(field, path)}
          <div class="list-input">
            ${(value ?? []).map((pair, i) => html`
              <div class="list-input__row list-input__row--pair">
                <input class="input" data-path="${path}.${i}.0" value="${pair[0]}" placeholder="${field.labels?.[0] ?? 'Nama'}">
                <input class="input input--num" type="number" min="0" max="100" data-type="number" data-path="${path}.${i}.1" value="${pair[1]}">
                <button type="button" class="btn btn--icon btn--ghost btn--sm" data-act="remove" data-target="${path}" data-index="${i}" aria-label="Hapus">${ic.x}</button>
              </div>`)}
            ${(value?.length ?? 0) < (field.maxItems ?? 8) ? html`<button type="button" class="btn btn--sm btn--dashed" data-act="add-pair" data-target="${path}">${ic.plus}<span>Tambah</span></button>` : ''}
          </div>${hint(field)}`);
      case 'repeater': {
        const items = value ?? [];
        return wrap(html`
          <div class="repeater__head"><span class="field__label">${field.label}</span><small class="muted">${items.length}${field.maxItems ? ` / ${field.maxItems}` : ''}</small></div>
          <div class="repeater">
            ${items.map((item, i) => {
              const itemPath = `${path}.${i}`;
              const open = ui.open.has(itemPath);
              return html`
                <div class="repeater__item ${open ? 'is-open' : ''}" data-item="${itemPath}">
                  <div class="repeater__bar">
                    <button type="button" class="repeater__toggle" data-act="toggle" data-target="${itemPath}" aria-expanded="${open}">
                      <span class="repeater__num">${i + 1}</span><span class="repeater__title" data-title-for="${itemPath}">${field.itemTitle?.(item) || `Item ${i + 1}`}</span>${ic.down}
                    </button>
                    <button type="button" class="btn btn--icon btn--ghost btn--sm" data-act="up" data-target="${path}" data-index="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Naikkan">${ic.up}</button>
                    <button type="button" class="btn btn--icon btn--ghost btn--sm" data-act="down" data-target="${path}" data-index="${i}" ${i === items.length - 1 ? 'disabled' : ''} aria-label="Turunkan">${ic.down}</button>
                    <button type="button" class="btn btn--icon btn--ghost btn--sm" data-act="duplicate" data-target="${path}" data-index="${i}" ${items.length >= (field.maxItems ?? 50) ? 'disabled' : ''} aria-label="Duplikat">${ic.copy}</button>
                    <button type="button" class="btn btn--icon btn--ghost btn--sm" data-act="remove" data-target="${path}" data-index="${i}" ${items.length <= (field.min ?? 0) ? 'disabled' : ''} aria-label="Hapus">${ic.trash}</button>
                  </div>
                  <div class="repeater__body"><div class="form-grid">${field.fields.map((f) => fieldView(f, itemPath))}</div></div>
                </div>`;
            })}
            ${items.length < (field.maxItems ?? 50) ? html`<button type="button" class="btn btn--sm btn--dashed" data-act="add-item" data-target="${path}">${ic.plus}<span>${field.addLabel ?? 'Tambah item'}</span></button>` : ''}
          </div>${hint(field)}`);
      }
      case 'group':
        if (field.collapsible) {
          return html`<details class="group group--collapsible field--wide" data-field="${path}" data-group="g:${path}:${field.label}" ${ui.open.has(`g:${path}:${field.label}`) ? 'open' : ''}>
            <summary>${field.icon ? html`<span class="group__icon">${ic[field.icon]}</span>` : ''}<span><b>${field.label}</b>${field.hint ? html`<small>${field.hint}</small>` : ''}</span>${ic.down}</summary>
            <div class="form-grid">${field.fields.map((f) => fieldView(f, path))}</div></details>`;
        }
        return html`<fieldset class="group field--wide" data-field="${path}">
          ${field.label ? html`<legend>${field.label}</legend>` : ''}${field.hint ? html`<p class="field__hint">${field.hint}</p>` : ''}
          <div class="form-grid">${field.fields.map((f) => fieldView(f, path))}</div></fieldset>`;
      case 'localized': {
        const active = ui.tabs.get(path) ?? 'id';
        return html`<div class="localized field--wide" data-field="${path}">
          <div class="tabs tabs--sm" role="tablist">
            ${LOCALES.map((l) => html`<button type="button" role="tab" class="tab ${active === l.code ? 'is-active' : ''}" aria-selected="${active === l.code}" data-act="tab" data-target="${path}" data-locale="${l.code}">${l.code.toUpperCase()} · ${l.label}</button>`)}
            ${field.copyable !== false ? html`<button type="button" class="btn btn--sm btn--ghost tabs__extra" data-act="copy-locale" data-target="${path}" title="Salin isi tab aktif ke bahasa lain">${ic.copy}<span>Salin ke bahasa lain</span></button>` : ''}
          </div>
          ${LOCALES.map((l) => html`<div class="localized__pane form-grid" data-pane="${path}" data-locale="${l.code}" ${active === l.code ? '' : 'hidden'}>${field.fields.map((f) => fieldView(f, join(path, l.code)))}</div>`)}
        </div>`;
      }
      default:
        return wrap(html`${label(field, path)}<input class="input" id="f-${path}" type="${field.inputType ?? 'text'}" data-path="${path}" value="${value ?? ''}" ${field.max ? `maxlength="${field.max}"` : ''} placeholder="${field.placeholder ?? ''}">${hint(field)}`);
    }
  }

  function findField(fields, path, base = '') {
    for (const field of fields) {
      const own = join(base, field.key);
      if (own === path) return field;
      if (field.type === 'group' && path.startsWith(`${own}.`)) { const r = findField(field.fields, path, own); if (r) return r; }
      if (field.type === 'localized' && (own === '' || path.startsWith(`${own}.`))) {
        for (const l of LOCALES) { const r = findField(field.fields, path, join(own, l.code)); if (r) return r; }
      }
      if (field.type === 'repeater' && path.startsWith(`${own}.`)) {
        const index = path.slice(own.length + 1).split('.')[0];
        const r = findField(field.fields, path, `${own}.${index}`);
        if (r) return r;
      }
    }
    return null;
  }

  function paint() {
    const scrollY = container.closest('.ov__body, .main')?.scrollTop;
    render(container, html`<div class="form-grid form-root">${schema.map((f) => fieldView(f, ''))}</div>`);
    updateCounts();
    if (scrollY !== undefined) container.closest('.ov__body, .main').scrollTop = scrollY;
  }

  function updateCounts(scope = container) {
    qsa('[data-count-for]', scope).forEach((el) => {
      const field = findField(schema, el.dataset.countFor);
      const len = String(getPath(state, el.dataset.countFor) ?? '').length;
      el.textContent = field?.max ? `${len}/${field.max}` : '';
      el.classList.toggle('is-over', field?.max && len > field.max * 0.95);
    });
  }

  const emit = () => onChange?.(state);

  function onInput(event) {
    const input = event.target.closest('[data-path]');
    if (!input) return;
    const path = input.dataset.path;
    let value = input.value;
    if (input.dataset.type === 'bool') value = input.checked;
    else if (input.dataset.type === 'number') value = input.value === '' ? 0 : Number(input.value);
    setPath(state, path, value);
    if (input.type === 'color' || /^#[0-9a-f]{6}$/i.test(value)) {
      qsa(`[data-path="${CSS.escape(path)}"]`, container).forEach((el) => { if (el !== input) el.value = value; });
    }
    const imagePreview = input.closest('.image-input')?.querySelector('.image-input__preview');
    if (imagePreview && event.type === 'change') paint();
    // Keep repeater titles in sync.
    const item = input.closest('[data-item]');
    if (item) {
      const itemPath = item.dataset.item;
      const repeaterPath = itemPath.replace(/\.\d+$/, '');
      const field = findField(schema, repeaterPath);
      const title = qs(`[data-title-for="${CSS.escape(itemPath)}"]`, container);
      if (field?.itemTitle && title) title.textContent = field.itemTitle(getPath(state, itemPath)) || `Item ${Number(itemPath.split('.').pop()) + 1}`;
    }
    clearError(path);
    updateCounts(input.closest('.field') ?? container);
    emit();
  }

  async function onClick(event) {
    const button = event.target.closest('[data-act]');
    if (!button || !container.contains(button)) return;
    const { act, target } = button.dataset;
    const index = Number(button.dataset.index);
    const list = () => getPath(state, target);
    switch (act) {
      case 'tab': {
        ui.tabs.set(target, button.dataset.locale);
        qsa(`[data-pane="${CSS.escape(target)}"]`, container).forEach((pane) => { pane.hidden = pane.dataset.locale !== button.dataset.locale; });
        qsa('.tab', button.parentElement).forEach((tab) => { const on = tab === button; tab.classList.toggle('is-active', on); tab.setAttribute('aria-selected', String(on)); });
        return;
      }
      case 'copy-locale': {
        const from = ui.tabs.get(target) ?? 'id';
        const to = from === 'id' ? 'en' : 'id';
        if (!window.confirm(`Timpa isi bahasa ${to.toUpperCase()} dengan salinan dari ${from.toUpperCase()}?`)) return;
        setPath(state, join(target, to), clone(getPath(state, join(target, from))));
        ui.tabs.set(target, to);
        break;
      }
      case 'toggle': {
        const item = button.closest('[data-item]');
        const open = !ui.open.has(target);
        if (open) ui.open.add(target); else ui.open.delete(target);
        item.classList.toggle('is-open', open);
        button.setAttribute('aria-expanded', String(open));
        return;
      }
      case 'pick': {
        const url = await openMediaPicker();
        if (!url) return;
        setPath(state, target, url);
        break;
      }
      case 'clear': setPath(state, target, ''); break;
      case 'add-string': list().push(''); break;
      case 'add-pair': list().push(['', 80]); break;
      case 'add-item': {
        const field = findField(schema, target);
        const items = list() ?? [];
        if (!list()) setPath(state, target, items);
        items.push(blankItem(field.fields));
        ui.open.add(`${target}.${items.length - 1}`);
        break;
      }
      case 'duplicate': {
        const items = list();
        items.splice(index + 1, 0, clone(items[index]));
        clearItems();
        ui.open.add(`${target}.${index + 1}`);
        break;
      }
      case 'remove': list().splice(index, 1); clearItems(); break;
      case 'up': case 'down': {
        const items = list();
        const to = act === 'up' ? index - 1 : index + 1;
        if (to < 0 || to >= items.length) return;
        [items[index], items[to]] = [items[to], items[index]];
        const wasOpen = ui.open.has(`${target}.${index}`);
        clearItems();
        if (wasOpen) ui.open.add(`${target}.${to}`);
        break;
      }
      default: return;
    }
    paint();
    emit();
  }

  function clearError(path) {
    const box = qs(`[data-error-for="${CSS.escape(path)}"]`, container);
    if (box) { box.hidden = true; box.closest('.field')?.classList.remove('is-invalid'); }
  }

  const onToggle = (event) => {
    const group = event.target.closest?.('[data-group]');
    if (!group || event.target !== group) return;
    if (group.open) ui.open.add(group.dataset.group); else ui.open.delete(group.dataset.group);
  };
  container.addEventListener('toggle', onToggle, true);
  container.addEventListener('input', onInput);
  container.addEventListener('change', onInput);
  container.addEventListener('click', onClick);
  paint();

  return {
    get value() { return state; },
    set(value) { state = clone(value); paint(); },
    refresh: paint,
    /** Highlights server-side validation errors ({ field, message }[]) and reveals the first one. */
    showErrors(details = []) {
      qsa('.field.is-invalid', container).forEach((el) => el.classList.remove('is-invalid'));
      let first = null;
      for (const { field, message } of details) {
        if (!field) continue;
        let path = field;
        let box = qs(`[data-error-for="${CSS.escape(path)}"]`, container);
        while (!box && path.includes('.')) { path = path.replace(/\.[^.]+$/, ''); box = qs(`[data-error-for="${CSS.escape(path)}"]`, container); }
        if (!box) continue;
        box.hidden = false;
        box.textContent = message;
        box.closest('.field')?.classList.add('is-invalid');
        first ??= box;
      }
      if (!first) return false;
      // Reveal hidden tabs / collapsed repeater items containing the error.
      for (let el = first.parentElement; el && el !== container; el = el.parentElement) {
        if (el.matches('[data-pane]') && el.hidden) qs(`[data-act="tab"][data-target="${CSS.escape(el.dataset.pane)}"][data-locale="${el.dataset.locale}"]`, container)?.click();
        if (el.matches('[data-item]') && !el.classList.contains('is-open')) { ui.open.add(el.dataset.item); el.classList.add('is-open'); }
        if (el.matches('details[data-group]') && !el.open) el.open = true;
      }
      first.closest('.field')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return true;
    },
    destroy() {
      container.removeEventListener('input', onInput);
      container.removeEventListener('change', onInput);
      container.removeEventListener('click', onClick);
      container.removeEventListener('toggle', onToggle, true);
    },
  };
}
