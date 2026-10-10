import { create } from 'zustand';

function readStoredUser() {
  try {
    return JSON.parse(sessionStorage.getItem('goldy_auth_user')) || null;
  } catch {
    sessionStorage.removeItem('goldy_auth_token');
    sessionStorage.removeItem('goldy_auth_user');
    return null;
  }
}
const storedUser = readStoredUser();

export const useAppStore = create((set, get) => ({
  // AUTHENTICATION
  token: sessionStorage.getItem('goldy_auth_token') || null,
  user: storedUser,

  setToken: (token, user) => {
    if (token) {
      sessionStorage.setItem('goldy_auth_token', token);
      sessionStorage.setItem('goldy_auth_user', JSON.stringify(user));
      set({ token, user });
    } else {
      sessionStorage.removeItem('goldy_auth_token');
      sessionStorage.removeItem('goldy_auth_user');
      set({ token: null, user: null });
    }
  },

  logout: () => {
    get().setToken(null);
    get().closeDialog();
    set({ notifications: [] });
  },

  // THEME (Dark / Light Mode)
  theme: localStorage.getItem('goldy_theme') || 'light',

  setTheme: (theme) => {
    localStorage.setItem('goldy_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ theme });
  },

  toggleTheme: () => {
    const nextTheme = get().theme === 'light' ? 'dark' : 'light';
    get().setTheme(nextTheme);
  },

  // TOAST NOTIFICATIONS SYSTEM
  notifications: [],

  addNotification: (message, type = 'success') => {
    const id = Date.now() + Math.random().toString(36).substr(2, 5);
    set((state) => ({
      notifications: [...state.notifications, { id, message, type }],
    }));

    // Automatically auto-clear notification after 4 seconds
    setTimeout(() => {
      get().removeNotification(id);
    }, 4000);
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  // CONFIRMATION DIALOG MODAL SYSTEM
  dialog: {
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null,
  },

  openDialog: ({ title, message, onConfirm, onCancel }) => {
    set({
      dialog: {
        isOpen: true,
        title,
        message,
        onConfirm: () => {
          if (onConfirm) onConfirm();
          get().closeDialog();
        },
        onCancel: () => {
          if (onCancel) onCancel();
          get().closeDialog();
        },
      },
    });
  },

  closeDialog: () => {
    set({
      dialog: {
        isOpen: false,
        title: '',
        message: '',
        onConfirm: null,
        onCancel: null,
      },
    });
  },
}));

// Initialize theme class list on import
if (localStorage.getItem('goldy_theme') === 'dark') {
  document.documentElement.classList.add('dark');
} else {
  document.documentElement.classList.remove('dark');
}
