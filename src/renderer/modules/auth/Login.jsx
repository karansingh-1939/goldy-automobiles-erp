import React, { useState } from 'react';
import { useAppStore } from '../../shared/store/useAppStore.js';
import { api } from '../../shared/api/apiClient.js';

export default function Login() {
  const setToken = useAppStore((state) => state.setToken);
  const addNotification = useAppStore((state) => state.addNotification);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      addNotification('Please enter both username and password.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.post('/api/v1/auth/login', { username, password });
      setToken(res.token, res.user);
      addNotification('Logged in successfully.', 'success');
    } catch (err) {
      addNotification(err.message || 'Authentication failed.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4 dark:bg-gray-950 transition-colors duration-200">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            GOLDY AUTOMOBILES
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Offline-First ERP Cockpit Portal
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 rounded-md">
            <div>
              <label htmlFor="username-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Username
              </label>
              <input
                id="username-input"
                name="username"
                type="text"
                required
                disabled={isLoading}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus-ring dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                placeholder="admin"
              />
            </div>
            
            <div>
              <label htmlFor="password-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <input
                id="password-input"
                name="password"
                type="password"
                required
                disabled={isLoading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus-ring dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex w-full justify-center rounded-lg bg-brand-600 py-2.5 px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-ring disabled:opacity-50 transition-colors"
            >
              {isLoading ? (
                <svg className="h-5 w-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                'Sign In'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
