import { api } from '../core/api.js';
import { html, qs, render } from '../core/dom.js';
import { getLang, onLangChange, t } from '../core/i18n.js';
import { getHome, getSite } from '../core/site.js';
import { icons } from './icons.js';
import { createModal } from './modal.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^[+()\d\s.-]*$/;
const BUDGETS = ['lt-25', '25-75', '75-200', 'gt-200', 'undisclosed'];
const EMPTY = { name: '', email: '', phone: '', company: '', service: '', budget: '', message: '', acceptTerms: false, marketingOptIn: false };

/** Project consultation dialog wired to POST /api/leads (validated again on the server). */
export function createConsultModal() {
  const modal = createModal({ className: 'modal--consult', label: t('consult.title') });
  const state = { ...EMPTY, status: 'idle', error: '', errors: {}, result: null };

  const services = () => (getHome()?.services?.items ?? []).map((item) => item.title).filter(Boolean);

  function field(name, label, input, { optional = false, wide = false } = {}) {
    const error = state.errors[name];
    return html`
      <div class="cm-field ${wide ? 'cm-field--wide' : ''} ${error ? 'is-invalid' : ''}">
        <label for="cm-${name}">${label}${optional ? html` <small>(${t('consult.optional')})</small>` : ''}</label>
        ${input}
        ${error ? html`<p class="cm-field__error" id="cm-${name}-error">${error}</p>` : ''}
      </div>`;
  }

  const describedBy = (name) => (state.errors[name] ? html`aria-invalid="true" aria-describedby="cm-${name}-error"` : '');

  function successView() {
    const { result } = state;
    return html`
      <div class="cm cm--success">
        <button type="button" class="cm__close" data-close aria-label="${t('common.close')}">${icons.close}</button>
        <div class="cm__check" aria-hidden="true">${icons.check}</div>
        <h2 class="cm__title" id="consult-title">${t('consult.successTitle')}</h2>
        <p class="cm__lead" role="status">${t(result?.alreadyRegistered ? 'consult.already' : 'consult.success', { email: result?.email ?? state.email })}</p>
        <div class="cm__actions cm__actions--center">
          <button type="button" class="cm-btn cm-btn--ghost" data-action="again">${t('consult.again')}</button>
          <button type="button" class="cm-btn cm-btn--primary" data-close>${t('common.close')}</button>
        </div>
      </div>`;
  }

  function formView() {
    const busy = state.status === 'sending';
    const termsText = t('consult.terms').split(/(\{terms\}|\{privacy\})/);
    const list = services();
    const contact = getSite()?.contact ?? {};
    return html`
      <form class="cm" novalidate aria-labelledby="consult-title">
        <button type="button" class="cm__close" data-close aria-label="${t('common.close')}">${icons.close}</button>
        <header class="cm__head">
          <p class="cm__kicker"><span class="hx-pulse" aria-hidden="true"></span>${t('consult.kicker')}</p>
          <h2 class="cm__title" id="consult-title">${t('consult.title')}</h2>
          <p class="cm__lead">${t('consult.lead')}</p>
        </header>
        <fieldset class="cm__grid" ${busy ? 'disabled' : ''}>
          ${field('name', t('consult.name'), html`<input id="cm-name" name="name" autocomplete="name" maxlength="80" required value="${state.name}" ${describedBy('name')} autofocus>`)}
          ${field('email', t('consult.email'), html`<input id="cm-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" required value="${state.email}" ${describedBy('email')}>`)}
          ${field('phone', t('consult.phone'), html`<input id="cm-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" value="${state.phone}" ${describedBy('phone')}>`, { optional: true })}
          ${field('company', t('consult.company'), html`<input id="cm-company" name="company" autocomplete="organization" maxlength="120" value="${state.company}">`, { optional: true })}
          ${field('service', t('consult.service'), html`
            <select id="cm-service" name="service">
              <option value="">${t('consult.serviceNone')}</option>
              ${list.map((name) => html`<option value="${name}" ${state.service === name ? 'selected' : ''}>${name}</option>`)}
              <option value="${t('consult.serviceOther')}" ${state.service === t('consult.serviceOther') ? 'selected' : ''}>${t('consult.serviceOther')}</option>
            </select>`, { optional: true })}
          ${field('budget', t('consult.budget'), html`
            <select id="cm-budget" name="budget">
              <option value="">${t('consult.budget.none')}</option>
              ${BUDGETS.map((value) => html`<option value="${value}" ${state.budget === value ? 'selected' : ''}>${t(`consult.budget.${value}`)}</option>`)}
            </select>`, { optional: true })}
          ${field('message', t('consult.message'), html`<textarea id="cm-message" name="message" rows="4" maxlength="2000" required placeholder="${t('consult.messageHint')}" ${describedBy('message')}>${state.message}</textarea>`, { wide: true })}
          <input class="visually-hidden" tabindex="-1" autocomplete="off" name="website" aria-hidden="true">
          <label class="cm-check cm-field--wide ${state.errors.acceptTerms ? 'is-invalid' : ''}">
            <input type="checkbox" name="acceptTerms" ${state.acceptTerms ? 'checked' : ''}>
            <span class="cm-check__box" aria-hidden="true">${icons.check}</span>
            <span>${termsText.map((part) => {
              if (part === '{terms}') return html`<a href="/legal#terms" data-close-modal>${t('consult.termsLink')}</a>`;
              if (part === '{privacy}') return html`<a href="/legal#privacy" data-close-modal>${t('consult.privacyLink')}</a>`;
              return part;
            })}</span>
          </label>
          <label class="cm-check cm-field--wide">
            <input type="checkbox" name="marketingOptIn" ${state.marketingOptIn ? 'checked' : ''}>
            <span class="cm-check__box" aria-hidden="true">${icons.check}</span>
            <span>${t('consult.marketing')}</span>
          </label>
        </fieldset>
        <p class="cm__error" role="alert" aria-live="assertive">${state.status === 'error' ? state.error : ''}</p>
        <footer class="cm__actions">
          <p class="cm__secure">${icons.shield}<span>${t('consult.secure')}</span></p>
          <button type="submit" class="cm-btn cm-btn--primary" ${busy ? 'disabled' : ''}>
            ${busy ? html`<span class="cm-spinner" aria-hidden="true"></span>` : ''}<span>${busy ? t('consult.sending') : t('consult.submit')}</span>${busy ? '' : icons.arrowRight}
          </button>
        </footer>
        ${contact.whatsapp ? html`<a class="cm__alt" href="${contact.whatsapp}" target="_blank" rel="noopener noreferrer" data-external>${icons.whatsapp}<span>WhatsApp</span></a>` : ''}
      </form>`;
  }

  function paint() {
    render(modal.dialog, state.status === 'success' ? successView() : formView());
    modal.dialog.setAttribute('aria-label', t('consult.title'));
  }

  function readForm(form) {
    const data = new FormData(form);
    for (const key of ['name', 'email', 'phone', 'company', 'service', 'budget', 'message']) {
      if (data.has(key)) state[key] = String(data.get(key) ?? '').trim();
    }
    state.acceptTerms = data.get('acceptTerms') === 'on';
    state.marketingOptIn = data.get('marketingOptIn') === 'on';
    if (!BUDGETS.includes(state.budget)) state.budget = '';
    return String(data.get('website') ?? '');
  }

  function validate() {
    const errors = {};
    if (state.name.length < 2) errors.name = t('consult.error.name');
    if (!EMAIL_PATTERN.test(state.email)) errors.email = t('consult.error.email');
    if (!PHONE_PATTERN.test(state.phone)) errors.phone = t('consult.error.phone');
    if (state.message.length < 10) errors.message = t('consult.error.message');
    if (!state.acceptTerms) errors.acceptTerms = t('consult.error.terms');
    return errors;
  }

  async function submit(form) {
    const honeypot = readForm(form);
    state.errors = validate();
    const firstInvalid = Object.keys(state.errors)[0];
    if (firstInvalid) {
      state.status = 'error';
      state.error = state.errors[firstInvalid];
      paint();
      qs(`[name="${firstInvalid}"]`, modal.dialog)?.focus();
      return;
    }
    state.status = 'sending';
    paint();
    try {
      state.result = await api.submitLead({
        name: state.name,
        email: state.email,
        phone: state.phone,
        company: state.company,
        service: state.service,
        budget: state.budget,
        message: state.message,
        acceptTerms: true,
        marketingOptIn: state.marketingOptIn,
        locale: getLang(),
        source: location.pathname.slice(0, 120).replace(/[^\w\-/]/g, ''),
        website: honeypot,
      });
      state.status = 'success';
      paint();
      qs('[data-action="again"]', modal.dialog)?.focus();
    } catch (error) {
      const detail = error.details?.[0];
      if (detail?.field) state.errors = { [String(detail.field).split('.')[0]]: detail.message };
      state.status = 'error';
      state.error = detail?.message || error.message;
      paint();
    }
  }

  modal.dialog.addEventListener('submit', (event) => { event.preventDefault(); submit(event.target); });
  modal.dialog.addEventListener('input', (event) => {
    const name = event.target.name;
    if (name && state.errors[name]) {
      delete state.errors[name];
      event.target.closest('.cm-field, .cm-check')?.classList.remove('is-invalid');
      event.target.removeAttribute('aria-invalid');
    }
  });
  modal.dialog.addEventListener('change', (event) => { if (event.target.form) readForm(event.target.form); });
  modal.dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="again"]')) {
      Object.assign(state, { ...EMPTY, name: state.name, email: state.email, phone: state.phone, company: state.company, status: 'idle', error: '', errors: {}, result: null });
      paint();
      qs('#cm-message', modal.dialog)?.focus();
    }
    if (event.target.closest('[data-close-modal]')) modal.close();
  });
  onLangChange(() => paint());
  paint();

  return {
    /** Opens the dialog, optionally preselecting a service (e.g. from a service card). */
    open({ service } = {}) {
      if (state.status !== 'success') {
        state.status = 'idle';
        state.error = '';
        if (service) state.service = service;
        paint();
      }
      modal.open();
    },
    close: () => modal.close(),
  };
}
