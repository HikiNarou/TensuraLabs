/** Client for the public mail API (same origin, cookie session). */
import { request } from '../core/api.js';

const BASE = '/api/mail';
const box = (id) => `${BASE}/mailboxes/${encodeURIComponent(id)}`;
const query = (params) => {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const mailApi = {
  config: () => request(`${BASE}/config`),
  session: () => request(`${BASE}/session`),
  create: (body) => request(`${BASE}/addresses`, { method: 'POST', body }),
  login: (body) => request(`${BASE}/login`, { method: 'POST', body }),
  logout: () => request(`${BASE}/logout`, { method: 'POST' }),
  forget: (id) => request(`${box(id)}/session`, { method: 'DELETE' }),
  remove: (id) => request(box(id), { method: 'DELETE' }),
  rotateKey: (id) => request(`${box(id)}/rotate-key`, { method: 'POST' }),
  poll: (id) => request(`${box(id)}/poll`, { timeoutMs: 10000 }),
  messages: (id, params) => request(`${box(id)}/messages${query(params)}`),
  message: (id, messageId) => request(`${box(id)}/messages/${messageId}`),
  update: (id, messageId, body) => request(`${box(id)}/messages/${messageId}`, { method: 'PATCH', body }),
  removeMessage: (id, messageId) => request(`${box(id)}/messages/${messageId}`, { method: 'DELETE' }),
  bulk: (id, body) => request(`${box(id)}/messages/bulk`, { method: 'POST', body }),
  readAll: (id) => request(`${box(id)}/messages/read-all`, { method: 'POST' }),
  send: (id, body) => request(`${box(id)}/send`, { method: 'POST', body, timeoutMs: 60000 }),
  htmlUrl: (id, messageId, images) => `${box(id)}/messages/${messageId}/html${images ? '?images=1' : ''}`,
  rawUrl: (id, messageId) => `${box(id)}/messages/${messageId}/raw`,
  attachmentUrl: (id, messageId, attachmentId, inline = false) => `${box(id)}/messages/${messageId}/attachments/${attachmentId}${inline ? '?inline=1' : ''}`,
};
