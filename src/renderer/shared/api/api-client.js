import { useAppStore } from '../store/use-app-store.js';

class ApiClientError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiClientError';
  }
}

async function request(path, options = {}) {
  const token = useAppStore.getState().token;
  const timeoutMs = options.timeout || 10000;
  const retries =
    options.retries !== undefined
      ? options.retries
      : options.method === 'GET' || !options.method
        ? 1
        : 0;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(path, {
        ...options,
        headers,
        signal: controller.signal,
      });

      let data = null;
      if (response.ok && options.responseType === 'blob') return await response.blob();
      try {
        data = await response.json();
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        // Response is not JSON
      }

      if (!response.ok) {
        const errorMsg = data?.error?.message || `Request failed with status ${response.status}`;
        if (response.status === 401 && token === useAppStore.getState().token) {
          useAppStore.getState().logout();
        }
        throw new ApiClientError(errorMsg, response.status, data);
      }

      return data;
    } catch (err) {
      clearTimeout(id);
      lastError = err;

      // Cancellation and HTTP failures must not be replayed.
      if (err.name === 'AbortError' || err instanceof ApiClientError) {
        throw err;
      }

      if (attempt < retries) {
        // Brief backoff for transient network failures.
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
      }
    } finally {
      clearTimeout(id);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  throw lastError || new Error('Request failed');
}

export const api = {
  get: (path, options) => request(path, { method: 'GET', ...options }),
  post: (path, body, options) =>
    request(path, { method: 'POST', body: JSON.stringify(body), ...options }),
  put: (path, body, options) =>
    request(path, { method: 'PUT', body: JSON.stringify(body), ...options }),
  patch: (path, body, options) =>
    request(path, { method: 'PATCH', body: JSON.stringify(body), ...options }),
  del: (path, options) => request(path, { method: 'DELETE', ...options }),
};

export const apiClient = api;
