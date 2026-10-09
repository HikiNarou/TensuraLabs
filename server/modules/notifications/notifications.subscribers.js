/** Turns domain events into in-app notifications for the people who need to act on them. */
export function registerNotificationSubscribers({ events, notificationsRepository: inbox }) {
  const leadLink = (lead) => `#/leads/${lead.id}`;
  const taskLink = (task) => `#/tasks/${task.id}`;
  const notMe = (actorId) => (id) => id && id !== actorId;

  events.subscribe('lead.created', ({ payload: { lead } }) => {
    inbox.notifyAdmins({ type: 'lead', title: `Lead baru: ${lead.name}`, body: `${lead.service || 'Konsultasi'} · ${lead.company || lead.email}`, link: leadLink(lead) });
  });

  events.subscribe('lead.resubmitted', ({ payload: { lead } }) => {
    const notice = { type: 'lead', title: `Permintaan ulang dari ${lead.name}`, body: lead.message.slice(0, 160), link: leadLink(lead) };
    if (lead.assignedTo) inbox.notify([lead.assignedTo], notice);
    else inbox.notifyAdmins(notice);
  });

  events.subscribe('lead.assigned', ({ payload: { lead }, actorId }) => {
    if (!notMe(actorId)(lead.assignedTo)) return;
    inbox.notify([lead.assignedTo], { type: 'assignment', title: `Lead ditugaskan ke Anda: ${lead.name}`, body: lead.service || lead.email, link: leadLink(lead) });
  });

  events.subscribe('task.assigned', ({ payload: { task }, actorId }) => {
    if (!notMe(actorId)(task.assignedTo)) return;
    inbox.notify([task.assignedTo], {
      type: 'task', title: `Tugas baru: ${task.title}`,
      body: [task.creatorName && `dari ${task.creatorName}`, task.leadName && `lead ${task.leadName}`].filter(Boolean).join(' · '),
      link: taskLink(task),
    });
  });

  events.subscribe('task.due', ({ payload: { task } }) => {
    const target = task.assignedTo ?? task.createdBy;
    if (target) inbox.notify([target], { type: 'reminder', title: `Jatuh tempo: ${task.title}`, body: task.leadName ? `Lead ${task.leadName}` : 'Tugas sudah melewati tenggat', link: taskLink(task) });
  });

  events.subscribe('task.completed', ({ payload: { task }, actorId }) => {
    const watchers = [task.createdBy, task.assignedTo].filter(notMe(actorId));
    if (watchers.length) inbox.notify(watchers, { type: 'task', title: `Tugas selesai: ${task.title}`, body: task.leadName ? `Lead ${task.leadName}` : '', link: taskLink(task) });
  });

  events.subscribe('mail.received', ({ payload: { message, address } }) => {
    if (!address.ownerUserId) return;
    const sender = message.fromName || message.from || 'pengirim tidak dikenal';
    inbox.notify([address.ownerUserId], {
      type: 'mail',
      title: `Email baru di ${address.address}`,
      body: `${sender} · ${message.subject || '(tanpa subjek)'}`.slice(0, 200),
      link: `#/mail/messages/${message.id}`,
    });
  });

  for (const status of ['accepted', 'rejected']) {
    events.subscribe(`quote.${status}`, ({ payload: { quote }, actorId }) => {
      inbox.notifyAdmins({
        type: 'quote',
        title: `Penawaran ${quote.number} ${status === 'accepted' ? 'diterima 🎉' : 'ditolak'}`,
        body: `${quote.clientName} · ${quote.title}`,
        link: `#/quotes/${quote.id}`,
      }, { except: actorId });
    });
  }
}
