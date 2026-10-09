/** "Create address" / "Sign in with key" forms, Turnstile, and the one-time access-key dialog. */
import { html, qs, qsa, render } from '../core/dom.js';
import { mailApi } from './api.js';
import { icons } from './icons.js';
import { fmtHours, t } from './i18n.js';
import { copyText, downloadText, errorText, modal, toast } from './ui.js';

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let turnstileLoading = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  turnstileLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => { turnstileLoading = null; reject(new Error('Turnstile unavailable')); };
    document.head.append(script);
  });
  return turnstileLoading;
}

const ALPHA = 'abcdefghijkmnpqrstuvwxyz';
const ALNUM = `${ALPHA}23456789`;
/** Client-side suggestion only; the server validates (and generates its own name when the field is empty). */
function suggestName(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte, index) => (index === 0 ? ALPHA[byte % ALPHA.length] : ALNUM[byte % ALNUM.length])).join('');
}

function template(config, { tab }) {
  const domains = config.domains ?? [];
  const canCreate = config.publicCreation;
  const active = canCreate ? tab : 'login';
  return html`
    <div class="mx-access">
      <div class="mx-tabs" role="tablist">
        <button type="button" role="tab" class="mx-tab ${active === 'create' ? 'is-active' : ''}" aria-selected="${active === 'create'}" data-tab="create">${icons.plus}<span>${t('tab.create')}</span></button>
        <button type="button" role="tab" class="mx-tab ${active === 'login' ? 'is-active' : ''}" aria-selected="${active === 'login'}" data-tab="login">${icons.key}<span>${t('tab.login')}</span></button>
      </div>

      <form class="mx-form" data-form="create" ${active === 'create' ? '' : 'hidden'} novalidate>
        ${canCreate ? html`
          <label class="mx-label" for="mx-local">${config.customNames ? t('create.name') : t('create.domain')}</label>
          <div class="mx-address-input">
            ${config.customNames ? html`
              <input id="mx-local" name="localPart" class="mx-input" autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="email"
                maxlength="${config.nameMaxLength}" placeholder="${t('create.namePlaceholder')}">
              <button type="button" class="mx-icon-btn mx-icon-btn--soft" data-suggest title="${t('create.random')}" aria-label="${t('create.random')}">${icons.shuffle}</button>` : html`<span class="mx-address-input__random">${t('create.hintRandom')}</span>`}
            <span class="mx-address-input__at">@</span>
            ${domains.length > 1 ? html`
              <select name="domain" class="mx-input mx-select" aria-label="${t('create.domain')}">
                ${domains.map((domain) => html`<option value="${domain}">${domain}</option>`)}
              </select>` : html`<span class="mx-address-input__domain">${domains[0] ?? ''}</span><input type="hidden" name="domain" value="${domains[0] ?? ''}">`}
          </div>
          <p class="mx-hint">${config.customNames ? t('create.hint', { min: config.nameMinLength, max: config.nameMaxLength }) : ''}
            ${t('create.ttl', { ttl: fmtHours(config.addressTtlHours), days: config.retentionDays ? t('dur.d', { n: config.retentionDays }) : t('create.ttlForever') })}</p>
          <input type="text" name="website" class="mx-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
          ${config.turnstileSiteKey ? html`<div class="mx-turnstile" data-turnstile aria-label="${t('common.turnstile')}"></div>` : ''}
          <p class="mx-form__error" data-error role="alert" hidden></p>
          <button type="submit" class="mx-btn mx-btn--primary mx-btn--block mx-btn--lg">${icons.bolt}<span>${t('create.submit')}</span></button>`
        : html`<p class="mx-alert mx-alert--info">${icons.info}<span>${t('create.disabled')}</span></p>`}
      </form>

      <form class="mx-form" data-form="login" ${active === 'login' ? '' : 'hidden'} novalidate>
        <label class="mx-label" for="mx-login-address">${t('login.address')}</label>
        <input id="mx-login-address" name="address" type="email" class="mx-input" autocomplete="username" autocapitalize="none" spellcheck="false" required
          placeholder="nama@${domains[0] ?? 'tensuralabs.app'}">
        <label class="mx-label" for="mx-login-key">${t('login.key')}</label>
        <input id="mx-login-key" name="accessKey" type="password" class="mx-input mx-input--key" autocomplete="current-password" autocapitalize="characters" spellcheck="false" required
          placeholder="${t('login.keyPlaceholder')}">
        <p class="mx-hint">${t('login.hint')}</p>
        <p class="mx-form__error" data-error role="alert" hidden></p>
        <button type="submit" class="mx-btn mx-btn--primary mx-btn--block mx-btn--lg">${icons.key}<span>${t('login.submit')}</span></button>
      </form>
    </div>`;
}

/**
 * Mounts the access forms into `container`. `onSuccess(mailbox, accessKey|null)` runs after a
 * successful create (with the one-time key) or sign-in.
 */
export function mountAccessForm(container, { config, onSuccess, tab = 'create' }) {
  let turnstileId = null;
  let turnstileToken = '';
  let busy = false;
  render(container, template(config, { tab }));

  const setError = (form, message) => {
    const box = qs('[data-error]', form);
    box.textContent = message || '';
    box.hidden = !message;
  };

  async function mountTurnstile() {
    const slot = qs('[data-turnstile]', container);
    if (!slot || turnstileId !== null) return;
    try {
      const turnstile = await loadTurnstile();
      turnstileId = turnstile.render(slot, {
        sitekey: config.turnstileSiteKey, theme: 'dark', size: 'flexible',
        callback: (token) => { turnstileToken = token; },
        'expired-callback': () => { turnstileToken = ''; },
        'error-callback': () => { turnstileToken = ''; },
      });
    } catch {
      setError(qs('[data-form="create"]', container), t('common.error'));
    }
  }
  const resetTurnstile = () => {
    turnstileToken = '';
    if (turnstileId !== null) window.turnstile?.reset(turnstileId);
  };

  function showTab(name) {
    qsa('[data-tab]', container).forEach((button) => {
      const isActive = button.dataset.tab === name;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });
    qsa('[data-form]', container).forEach((form) => { form.hidden = form.dataset.form !== name; });
    qs(`[data-form="${name}"] input:not([type="hidden"]):not(.mx-hp)`, container)?.focus({ preventScroll: true });
    if (name === 'create') mountTurnstile();
  }

  container.addEventListener('click', (event) => {
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) { showTab(tabButton.dataset.tab); return; }
    if (event.target.closest('[data-suggest]')) {
      const input = qs('[name="localPart"]', container);
      input.value = suggestName(Math.min(Math.max(10, config.nameMinLength), config.nameMaxLength));
      input.focus();
    }
  });

  container.addEventListener('input', (event) => {
    if (event.target.name === 'localPart') {
      const cleaned = event.target.value.toLowerCase().replace(/\s+/g, '').replace(/@.*$/, '');
      if (cleaned !== event.target.value) event.target.value = cleaned;
    }
    const form = event.target.closest('form');
    if (form) setError(form, '');
  });

  container.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    if (busy) return;
    const data = Object.fromEntries(new FormData(form));
    const button = qs('button[type="submit"]', form);
    setError(form, '');

    if (form.dataset.form === 'create') {
      const localPart = String(data.localPart ?? '').trim();
      if (localPart && (localPart.length < config.nameMinLength || localPart.length > config.nameMaxLength || !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(localPart) || localPart.includes('..'))) {
        setError(form, t('create.hint', { min: config.nameMinLength, max: config.nameMaxLength }));
        return;
      }
      if (config.turnstileSiteKey && !turnstileToken) { setError(form, t('common.turnstileNeeded')); return; }
      busy = true; button.disabled = true;
      try {
        const result = await mailApi.create({ localPart, domain: data.domain, website: data.website ?? '', turnstileToken });
        onSuccess(result.mailbox, result.accessKey);
      } catch (error) {
        setError(form, errorText(error));
        resetTurnstile();
      } finally { busy = false; button.disabled = false; }
      return;
    }

    const address = String(data.address ?? '').trim().toLowerCase();
    const accessKey = String(data.accessKey ?? '').trim();
    if (!address || !accessKey) { setError(form, `${t('login.address')} & ${t('login.key')}`); return; }
    busy = true; button.disabled = true;
    try {
      const result = await mailApi.login({ address, accessKey });
      onSuccess(result.mailbox, null);
    } catch (error) {
      setError(form, errorText(error));
    } finally { busy = false; button.disabled = false; }
  });

  if (config.publicCreation && tab === 'create') mountTurnstile();
  return { focus: () => qs('form:not([hidden]) input:not([type="hidden"]):not(.mx-hp)', container)?.focus({ preventScroll: true }) };
}

/** One-time access-key dialog shown after creating an address or rotating its key. */
export function showAccessKey(address, accessKey, { rotated = false, signedOut = 0 } = {}) {
  const fileBody = `${t('key.fileIntro')}\n\n${t('key.address')}: ${address}\n${t('key.key')}: ${accessKey}\nURL: ${location.origin}/\n\n${t('key.fileWarn')}\n`;
  return new Promise((resolve) => {
    const dialog = modal({
      title: rotated ? t('key.rotatedTitle') : t('key.title'),
      size: 'sm',
      dismissible: false,
      content: html`
        <p class="mx-muted">${rotated ? t('key.rotatedText', { count: signedOut }) : t('key.text')}</p>
        <div class="mx-secret">
          <span class="mx-secret__label">${t('key.address')}</span>
          <div class="mx-secret__row"><code>${address}</code><button type="button" class="mx-icon-btn" data-copy="${address}" aria-label="${t('box.copy')}">${icons.copy}</button></div>
          <span class="mx-secret__label">${t('key.key')}</span>
          <div class="mx-secret__row mx-secret__row--key"><code>${accessKey}</code><button type="button" class="mx-icon-btn" data-copy="${accessKey}" aria-label="${t('toast.copied')}">${icons.copy}</button></div>
        </div>
        <div class="mx-actions mx-actions--split">
          <button type="button" class="mx-btn mx-btn--ghost" data-download>${icons.download}<span>${t('key.download')}</span></button>
          <button type="button" class="mx-btn mx-btn--ghost" data-copy="${`${address}\n${accessKey}`}">${icons.copy}<span>${t('key.copyAll')}</span></button>
        </div>
        <button type="button" class="mx-btn mx-btn--primary mx-btn--block" data-done>${icons.check}<span>${t('key.done')}</span></button>`,
    });
    dialog.root.addEventListener('click', async (event) => {
      const copy = event.target.closest('[data-copy]');
      if (copy) toast((await copyText(copy.dataset.copy)) ? t('toast.copied') : t('toast.copyFail'), 'ok', { timeout: 1800 });
      if (event.target.closest('[data-download]')) downloadText(`tensuralabs-mail-${address.split('@')[0]}.txt`, fileBody);
      if (event.target.closest('[data-done]')) dialog.close(true);
    });
    dialog.onClose = resolve;
  });
}
