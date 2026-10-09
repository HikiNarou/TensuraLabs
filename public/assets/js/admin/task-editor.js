/** Reusable task editor dialog (Tasks page, lead drawer, dashboard, command palette). */
import { api } from './api.js';
import { ic } from './icons.js';
import { confirmDialog, errorMessage, fmtDue, html, LEAD_PRIORITY, overlay, qs, render, toast, toLocalInput } from './ui.js';

let metaCache = null;
async function loadMeta(isAdmin) {
  if (!metaCache) {
    const [meta, leads] = await Promise.all([
      api.taskMeta().catch(() => ({ assignees: [] })),
      isAdmin ? api.leads({ status: 'open', pageSize: 100, sort: 'updated' }).then((r) => r.items).catch(() => []) : Promise.resolve([]),
    ]);
    metaCache = { assignees: meta.assignees, leads };
    setTimeout(() => { metaCache = null; }, 60000);
  }
  return metaCache;
}

/** Quick due presets, computed in the browser's local time. */
function preset(kind) {
  const d = new Date();
  d.setSeconds(0, 0);
  if (kind === 'hour') d.setHours(d.getHours() + 1, 0);
  if (kind === 'today') d.setHours(17, 0);
  if (kind === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(9, 0); }
  if (kind === 'week') { d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(9, 0); }
  return toLocalInput(d.toISOString());
}

/**
 * Opens the editor. Resolves to the saved task, `{ deleted: true }`, or null when dismissed.
 * `defaults` may carry leadId / assignedTo for new tasks.
 */
export async function openTaskEditor({ task = null, user, defaults = {} } = {}) {
  const isAdmin = user.role === 'admin';
  const meta = await loadMeta(isAdmin);
  const value = task ?? { title: '', description: '', priority: 'normal', dueAt: null, assignedTo: user.id, leadId: null, ...defaults };
  const leads = [...meta.leads];
  if (value.leadId && !leads.some((l) => l.id === value.leadId)) leads.unshift({ id: value.leadId, name: value.leadName ?? `Lead #${value.leadId}`, company: value.leadCompany ?? '' });

  return new Promise((resolve) => {
    let result = null;
    const ov = overlay({ title: task ? 'Edit tugas' : 'Tugas baru', onClose: () => resolve(result) });
    render(ov.body, html`
      <form class="stack task-form" novalidate>
        <label class="field"><span class="field__label">Judul tugas</span>
          <input class="input input--lg" name="title" maxlength="160" required autofocus value="${value.title}" placeholder="mis. Telepon klien untuk kickoff"></label>
        <label class="field"><span class="field__label">Detail <small class="muted">(opsional)</small></span>
          <textarea class="input" name="description" rows="3" maxlength="2000" placeholder="Konteks, checklist, atau tautan…">${value.description}</textarea></label>
        <div class="form-grid">
          <label class="field"><span class="field__label">Penanggung jawab</span>
            <select class="input" name="assignedTo"><option value="">— Belum ditugaskan —</option>
              ${meta.assignees.map((u) => html`<option value="${u.id}" ${value.assignedTo === u.id ? 'selected' : ''}>${u.name}${u.id === user.id ? ' (saya)' : ''}</option>`)}</select></label>
          <div class="field"><span class="field__label">Prioritas</span>
            <div class="segmented segmented--block" role="radiogroup" data-priority>
              ${Object.entries(LEAD_PRIORITY).map(([key, meta2]) => html`<button type="button" role="radio" aria-checked="${value.priority === key}" class="${value.priority === key ? 'is-active' : ''}" data-value="${key}">${meta2.label}</button>`)}
            </div></div>
        </div>
        <div class="field"><span class="field__label">Jatuh tempo</span>
          <div class="row row--wrap">
            <input class="input" type="datetime-local" name="dueAt" value="${toLocalInput(value.dueAt)}">
            <div class="chips chips--inline">${[['hour', '+1 jam'], ['today', 'Sore ini'], ['tomorrow', 'Besok'], ['week', 'Senin depan'], ['none', 'Tanpa']].map(([k, l]) => html`<button type="button" class="chip chip--btn" data-due="${k}">${l}</button>`)}</div>
          </div></div>
        ${isAdmin ? html`<label class="field"><span class="field__label">Terkait lead</span>
          <select class="input" name="leadId"><option value="">— Tidak terkait lead —</option>
            ${leads.map((l) => html`<option value="${l.id}" ${value.leadId === l.id ? 'selected' : ''}>${l.name}${l.company ? ` · ${l.company}` : ''}</option>`)}</select>
          <small class="field__hint">Tugas yang terkait lead muncul di timeline lead tersebut.</small></label>` : ''}
        <p class="form-error" data-error hidden></p>
        <div class="ov__actions">
          ${task ? html`<button type="button" class="btn btn--danger-ghost" data-delete>${ic.trash}<span>Hapus</span></button><span class="spacer"></span>` : ''}
          <button type="button" class="btn" data-ov-close>Batal</button>
          <button type="submit" class="btn btn--primary">${ic.check}<span>${task ? 'Simpan' : 'Buat tugas'}</span></button>
        </div>
      </form>`);
    const form = qs('form', ov.body);
    let priority = value.priority;

    form.addEventListener('click', async (event) => {
      const option = event.target.closest('[data-priority] [data-value]');
      if (option) {
        priority = option.dataset.value;
        form.querySelectorAll('[data-priority] [data-value]').forEach((b) => { const on = b === option; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', String(on)); });
      }
      const due = event.target.closest('[data-due]');
      if (due) form.elements.dueAt.value = due.dataset.due === 'none' ? '' : preset(due.dataset.due);
      if (event.target.closest('[data-delete]')) {
        if (!(await confirmDialog({ title: 'Hapus tugas?', message: `"${task.title}" akan dihapus permanen.` }))) return;
        try { await api.deleteTask(task.id); toast('Tugas dihapus'); result = { deleted: true }; ov.close(); } catch (error) { toast(errorMessage(error), 'danger'); }
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = qs('[data-error]', form);
      const title = form.elements.title.value.trim();
      if (title.length < 2) { error.hidden = false; error.textContent = 'Judul minimal 2 karakter.'; form.elements.title.focus(); return; }
      const dueRaw = form.elements.dueAt.value;
      const body = {
        title,
        description: form.elements.description.value.trim(),
        assignedTo: form.elements.assignedTo.value ? Number(form.elements.assignedTo.value) : null,
        priority,
        dueAt: dueRaw ? new Date(dueRaw).toISOString() : null,
      };
      if (isAdmin) body.leadId = form.elements.leadId.value ? Number(form.elements.leadId.value) : null;
      const button = qs('[type=submit]', form);
      button.disabled = true;
      try {
        result = task ? await api.updateTask(task.id, body) : await api.createTask(body);
        toast(task ? 'Tugas diperbarui' : 'Tugas dibuat');
        ov.close();
      } catch (err) {
        error.hidden = false;
        error.textContent = errorMessage(err);
      } finally {
        button.disabled = false;
      }
    });
  });
}

/** Compact task row used on the Tasks page, the dashboard and the lead drawer. */
export function taskRow(task, { showLead = true, compact = false } = {}) {
  const tone = task.status === 'done' ? 'muted' : task.isOverdue ? 'danger' : '';
  return html`
    <li class="todo ${task.status === 'done' ? 'is-done' : ''} ${task.isOverdue ? 'is-overdue' : ''} ${compact ? 'todo--compact' : ''}" data-task="${task.id}" tabindex="0">
      <button type="button" class="todo__check" data-toggle-task="${task.id}" aria-pressed="${task.status === 'done'}" aria-label="${task.status === 'done' ? 'Tandai belum selesai' : 'Tandai selesai'}">${ic.check}</button>
      <div class="todo__main">
        <b class="todo__title">${task.priority === 'high' ? html`<i class="todo__flag" title="Prioritas tinggi"></i>` : ''}${task.title}</b>
        <span class="todo__meta">
          <span class="todo__due ${tone ? `todo__due--${tone}` : ''}">${ic.clock}${task.status === 'done' ? 'Selesai' : fmtDue(task.dueAt)}</span>
          ${showLead && task.leadId ? html`<a class="todo__lead" href="#/leads/${task.leadId}">${ic.leads}${task.leadName}</a>` : ''}
          ${task.assigneeName ? html`<span class="todo__who">${ic.user}${task.assigneeName}</span>` : html`<span class="todo__who muted">Belum ditugaskan</span>`}
        </span>
      </div>
    </li>`;
}

/** Toggles a task's completion; returns the updated task (or throws). */
export async function toggleTask(id, done) {
  return api.updateTask(id, { status: done ? 'done' : 'open' });
}
