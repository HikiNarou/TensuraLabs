/** JSON API client with timeouts and normalized errors. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const cache = new Map();
const CACHE_TTL_MS = 60_000;

export async function request(path, { method = 'GET', body, signal, timeoutMs = 15000, cacheable = false } = {}) {
  const key = `${method}:${path}`;
  if (cacheable && method === 'GET') {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.time < CACHE_TTL_MS) return hit.data;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
  const onAbort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = payload?.error ?? {};
      throw new ApiError(response.status, error.code ?? 'HTTP_ERROR', error.message ?? `HTTP ${response.status}`, error.details);
    }
    if (cacheable && method === 'GET') cache.set(key, { time: Date.now(), data: payload.data });
    return payload.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError' && signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Koneksi bermasalah. Periksa jaringan Anda lalu coba lagi.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const query = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

export const api = {
  site: () => request('/api/site', { cacheable: true }),
  squad: (lang) => request(`/api/squad?${query({ lang })}`, { cacheable: true }),
  portfolio: (lang) => request(`/api/portfolio?${query({ lang })}`, { cacheable: true }),
  gazette: (lang) => request(`/api/gazette?${query({ lang })}`, { cacheable: true }),
  articles: (params, signal) => request(`/api/articles?${query(params)}`, { cacheable: true, signal }),
  article: (slug, lang, signal) => request(`/api/articles/${encodeURIComponent(slug)}?${query({ lang })}`, { cacheable: true, signal }),
  submitLead: (body) => request('/api/leads', { method: 'POST', body }),
};
