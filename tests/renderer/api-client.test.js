import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../../src/renderer/shared/api/api-client.js';
import { queryClient } from '../../src/renderer/shared/api/query-client.js';
import { useAppStore } from '../../src/renderer/shared/store/use-app-store.js';

beforeEach(() => useAppStore.getState().setToken('old-session', { username: 'admin' }));
afterEach(() => {
  vi.useRealTimers();
  queryClient.clear();
  useAppStore.getState().logout();
});

it('clears cached business data and confirmation callbacks when a session expires', async () => {
  queryClient.setQueryData(['private-report'], { profit: 100 });
  useAppStore.getState().openDialog({ title: 'Delete', onConfirm: vi.fn() });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
  );
  await expect(api.get('/private')).rejects.toMatchObject({ status: 401 });
  expect(useAppStore.getState().token).toBeNull();
  expect(queryClient.getQueryData(['private-report'])).toBeUndefined();
  expect(useAppStore.getState().dialog.isOpen).toBe(false);
  expect(fetch).toHaveBeenCalledOnce();
});

it('does not log out a new session when an old request returns 401', async () => {
  let respond;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise((resolve) => {
          respond = resolve;
        }),
    ),
  );
  const pending = api.get('/private', { retries: 0 });
  useAppStore.getState().setToken('new-session', { username: 'staff' });
  respond({ ok: false, status: 401, json: async () => ({}) });
  await expect(pending).rejects.toMatchObject({ status: 401 });
  expect(useAppStore.getState().token).toBe('new-session');
});

it('enforces the request timeout even with a caller cancellation signal', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    ),
  );
  const controller = new AbortController();
  const pending = expect(
    api.get('/slow', { signal: controller.signal, timeout: 50, retries: 0 }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(50);
  await pending;
  expect(controller.signal.aborted).toBe(false);
});
