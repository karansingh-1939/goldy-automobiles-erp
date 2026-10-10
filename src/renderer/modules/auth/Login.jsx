import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../shared/store/use-app-store.js';
import { api } from '../../shared/api/api-client.js';

export default function Login() {
  const setToken = useAppStore((state) => state.setToken);
  const [mode, setMode] = useState('loading');
  const [fields, setFields] = useState({ username: '', password: '', email: '', recoveryCode: '' });
  const [issuedCode, setIssuedCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get('/api/v1/auth/setup-status', { signal: controller.signal })
      .then((result) => setMode(result.setupCompleted ? 'login' : 'setup'))
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setMode('unavailable');
        }
      });
    return () => controller.abort();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        const result = await api.post('/api/v1/auth/login', {
          username: fields.username,
          password: fields.password,
        });
        setToken(result.token, result.user);
      } else {
        const result =
          mode === 'setup'
            ? await api.post('/api/v1/auth/setup', {
                username: fields.username,
                password: fields.password,
                email: fields.email,
              })
            : await api.post('/api/v1/auth/forgot-password', {
                username: fields.username,
                recoveryCode: fields.recoveryCode,
                newPassword: fields.password,
              });
        setIssuedCode(result.recoveryCode || '');
        setFields((previous) => ({ ...previous, password: '' }));
        setMode('login');
      }
    } catch (err) {
      setError(err.message || 'Unable to complete this request.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white focus-ring';
  const visibleFields = [
    ['username', 'Username', 'text'],
    ...(mode === 'setup' ? [['email', 'Email (optional)', 'email']] : []),
    ...(mode === 'recovery' ? [['recoveryCode', 'Recovery code', 'text']] : []),
    ['password', mode === 'recovery' ? 'New password' : 'Password', 'password'],
  ];
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md space-y-6 rounded-2xl bg-white p-8 shadow-xl dark:bg-gray-900">
        <h1 className="text-center text-2xl font-bold text-gray-900 dark:text-white">
          GOLDY AUTOMOBILES
        </h1>
        <h2 className="text-center text-lg text-gray-700 dark:text-gray-300">
          {mode === 'setup'
            ? 'Create your administrator account'
            : mode === 'recovery'
              ? 'Recover your account'
              : 'Sign in'}
        </h2>
        {mode === 'loading' && <p role="status">Checking workshop setup...</p>}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {issuedCode && (
          <div role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <p>
              Save this recovery code securely before signing in. You will need it if you forget
              your password.
            </p>
            <p className="mt-2 break-all font-mono font-bold">{issuedCode}</p>
          </div>
        )}
        {['login', 'setup', 'recovery'].includes(mode) && (
          <form onSubmit={submit} className="space-y-4">
            {visibleFields.map(([name, label, type]) => (
              <label
                key={name}
                className="block text-sm text-gray-700 dark:text-gray-300"
                htmlFor={`${name}-input`}
              >
                {label}
                <input
                  id={`${name}-input`}
                  type={type}
                  autoComplete={
                    name === 'password'
                      ? mode === 'login'
                        ? 'current-password'
                        : 'new-password'
                      : name === 'username'
                        ? 'username'
                        : name === 'email'
                          ? 'email'
                          : 'off'
                  }
                  required={name !== 'email'}
                  minLength={name === 'password' && mode !== 'login' ? 8 : undefined}
                  value={fields[name]}
                  onChange={(e) => setFields({ ...fields, [name]: e.target.value })}
                  disabled={busy}
                  className={inputClass}
                />
              </label>
            ))}
            {mode !== 'login' && (
              <p className="text-xs text-gray-500">
                Use at least 8 characters, including uppercase and lowercase letters and a number.
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy
                ? 'Please wait...'
                : mode === 'setup'
                  ? 'Create administrator'
                  : mode === 'recovery'
                    ? 'Reset password'
                    : 'Sign In'}
            </button>
            {mode !== 'setup' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError('');
                  setFields({ ...fields, password: '' });
                  setMode(mode === 'login' ? 'recovery' : 'login');
                }}
                className="w-full text-sm text-brand-600"
              >
                {mode === 'login' ? 'Forgot password?' : 'Back to sign in'}
              </button>
            )}
          </form>
        )}
        {mode === 'unavailable' && (
          <button onClick={() => window.location.reload()} className="text-brand-600">
            Retry connection
          </button>
        )}
      </div>
    </main>
  );
}
