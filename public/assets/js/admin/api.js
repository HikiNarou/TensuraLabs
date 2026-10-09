/** Admin API client. A 401 anywhere dispatches `tl:unauthorized` so the shell can show the login screen. */
import { ApiError, request } from '../core/api.js';

export { ApiError };

const qs = (params = {}) => {
  const search = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const text = search.toString();
  return text ? `?${text}` : '';
};

async function call(path, options) {
  try {
    return await request(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new CustomEvent('tl:unauthorized'));
    }
    throw error;
  }
}

const get = (path, params) => call(`${path}${qs(params)}`);
const send = (method) => (path, body) => call(path, { method, body, timeoutMs: 60000 });
const post = send('POST');
const put = send('PUT');
const patch = send('PATCH');
const del = (path, params) => call(`${path}${qs(params)}`, { method: 'DELETE' });

export const api = {
  session: () => get('/api/auth/session'),
  login: (body) => post('/api/auth/login', body),
  verifyMfa: (body) => post('/api/auth/mfa', body),
  logout: () => post('/api/auth/logout'),

  dashboard: (days) => get('/api/admin/dashboard', { days, tzOffset: new Date().getTimezoneOffset() }),

  tasks: (params) => get('/api/admin/tasks', { tzOffset: new Date().getTimezoneOffset(), ...params }),
  taskSummary: () => get('/api/admin/tasks/summary', { tzOffset: new Date().getTimezoneOffset() }),
  taskMeta: () => get('/api/admin/tasks/meta'),
  task: (id) => get(`/api/admin/tasks/${id}`),
  createTask: (body) => post('/api/admin/tasks', body),
  updateTask: (id, body) => patch(`/api/admin/tasks/${id}`, body),
  deleteTask: (id) => del(`/api/admin/tasks/${id}`),
  bulkTasks: (body) => post('/api/admin/tasks/bulk', body),

  quotes: (params) => get('/api/admin/quotes', params),
  quote: (id) => get(`/api/admin/quotes/${id}`),
  saveQuote: (id, body) => (id ? put(`/api/admin/quotes/${id}`, body) : post('/api/admin/quotes', body)),
  quoteStatus: (id, status) => post(`/api/admin/quotes/${id}/status`, { status }),
  duplicateQuote: (id) => post(`/api/admin/quotes/${id}/duplicate`),
  deleteQuote: (id) => del(`/api/admin/quotes/${id}`),

  notifications: (params) => get('/api/admin/notifications', params),
  notificationCount: () => get('/api/admin/notifications/count'),
  readNotifications: (ids) => post('/api/admin/notifications/read', ids ? { ids } : {}),

  mailOverview: (days) => get('/api/admin/mail/overview', { days }),
  mailMeta: () => get('/api/admin/mail/meta'),
  mailUnread: () => get('/api/admin/mail/unread'),
  mailInboundLog: () => get('/api/admin/mail/inbound-log'),
  mailSettings: () => get('/api/admin/mail/settings'),
  saveMailSettings: (body) => put('/api/admin/mail/settings', body),
  resetMailSettings: () => del('/api/admin/mail/settings'),
  mailAddresses: (params) => get('/api/admin/mail/addresses', params),
  createMailAddress: (body) => post('/api/admin/mail/addresses', body),
  updateMailAddress: (id, body) => patch(`/api/admin/mail/addresses/${id}`, body),
  deleteMailAddress: (id) => del(`/api/admin/mail/addresses/${id}`),
  rotateMailKey: (id) => post(`/api/admin/mail/addresses/${id}/rotate-key`),
  bulkMailAddresses: (body) => post('/api/admin/mail/addresses/bulk', body),
  mailMessages: (params) => get('/api/admin/mail/messages', params),
  mailMessage: (id) => get(`/api/admin/mail/messages/${id}`),
  updateMailMessage: (id, body) => patch(`/api/admin/mail/messages/${id}`, body),
  deleteMailMessage: (id) => del(`/api/admin/mail/messages/${id}`),
  bulkMailMessages: (body) => post('/api/admin/mail/messages/bulk', body),
  mailToLead: (id) => post(`/api/admin/mail/messages/${id}/lead`),
  sendMail: (body) => post('/api/admin/mail/send', body),
  testMailInbound: (addressId) => post('/api/admin/mail/test-inbound', { addressId }),
  mailHtmlUrl: (id, images) => `/api/admin/mail/messages/${id}/html${images ? '?images=1' : ''}`,
  mailRawUrl: (id) => `/api/admin/mail/messages/${id}/raw`,
  mailAttachmentUrl: (messageId, attachmentId) => `/api/admin/mail/messages/${messageId}/attachments/${attachmentId}`,

  webhooks: () => get('/api/admin/webhooks'),
  createWebhook: (body) => post('/api/admin/webhooks', body),
  updateWebhook: (id, body) => patch(`/api/admin/webhooks/${id}`, body),
  deleteWebhook: (id) => del(`/api/admin/webhooks/${id}`),
  testWebhook: (id) => post(`/api/admin/webhooks/${id}/test`),
  rotateWebhookSecret: (id) => post(`/api/admin/webhooks/${id}/rotate-secret`),
  webhookDeliveries: (id) => get(`/api/admin/webhooks/${id}/deliveries`),

  leads: (params) => get('/api/admin/leads', params),
  leadMeta: () => get('/api/admin/leads/meta'),
  leadBoard: (params) => get('/api/admin/leads/board', params),
  lead: (id) => get(`/api/admin/leads/${id}`),
  updateLead: (id, body) => patch(`/api/admin/leads/${id}`, body),
  commentLead: (id, message) => post(`/api/admin/leads/${id}/comments`, { message }),
  deleteLead: (id) => del(`/api/admin/leads/${id}`),
  bulkLeads: (body) => post('/api/admin/leads/bulk', body),
  leadsExportUrl: (params) => `/api/admin/leads/export.csv${qs(params)}`,

  articles: (params) => get('/api/admin/articles', params),
  article: (id) => get(`/api/admin/articles/${id}`),
  saveArticle: (id, body) => (id ? put(`/api/admin/articles/${id}`, body) : post('/api/admin/articles', body)),
  deleteArticle: (id) => del(`/api/admin/articles/${id}`),
  bulkArticles: (body) => post('/api/admin/articles/bulk', body),
  duplicateArticle: (id, locale) => post(`/api/admin/articles/${id}/duplicate`, locale ? { locale } : {}),

  content: (collection) => get(`/api/admin/content/${collection}`),
  contentItem: (collection, id) => get(`/api/admin/content/${collection}/${id}`),
  saveContent: (collection, id, body) => (id ? put(`/api/admin/content/${collection}/${id}`, body) : post(`/api/admin/content/${collection}`, body)),
  deleteContent: (collection, id) => del(`/api/admin/content/${collection}/${id}`),
  reorderContent: (collection, ids) => put(`/api/admin/content/${collection}/reorder`, { ids }),

  settings: () => get('/api/admin/settings'),
  settingsDefaults: (key) => get(`/api/admin/settings/${key}/defaults`),
  saveSettings: (key, value) => put(`/api/admin/settings/${key}`, value),
  resetSettings: (key) => del(`/api/admin/settings/${key}`),

  media: (params) => get('/api/admin/media', params),
  mediaItem: (id) => get(`/api/admin/media/${id}`),
  uploadMedia: (body) => post('/api/admin/media', body),
  updateMedia: (id, alt) => patch(`/api/admin/media/${id}`, { alt }),
  deleteMedia: (id, force) => del(`/api/admin/media/${id}`, force ? { force: 1 } : {}),

  users: (params) => get('/api/admin/users', params),
  createUser: (body) => post('/api/admin/users', body),
  updateUser: (id, body) => patch(`/api/admin/users/${id}`, body),
  resetUserPassword: (id, password) => post(`/api/admin/users/${id}/password`, { password }),
  resetUserTwoFactor: (id) => post(`/api/admin/users/${id}/2fa/reset`),
  deleteUser: (id) => del(`/api/admin/users/${id}`),

  profile: () => get('/api/admin/profile'),
  updateProfile: (body) => patch('/api/admin/profile', body),
  changePassword: (body) => post('/api/admin/profile/password', body),
  sessions: (scope) => get('/api/admin/profile/sessions', { scope }),
  revokeSession: (id) => del(`/api/admin/profile/sessions/${id}`),
  revokeOtherSessions: () => post('/api/admin/profile/sessions/revoke-others'),
  twoFactorStatus: () => get('/api/admin/profile/2fa'),
  twoFactorSetup: () => post('/api/admin/profile/2fa/setup'),
  twoFactorEnable: (code) => post('/api/admin/profile/2fa/enable', { code }),
  twoFactorDisable: (password) => post('/api/admin/profile/2fa/disable', { password }),
  twoFactorRecovery: (password) => post('/api/admin/profile/2fa/recovery-codes', { password }),

  audit: (params) => get('/api/admin/audit', params),
  system: () => get('/api/admin/system'),
  maintenance: (task) => post('/api/admin/system/maintenance', { task }),
};

/** Reads a File as base64 (without the data: prefix). */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
