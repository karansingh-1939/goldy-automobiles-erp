import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api/api-client.js';
import { queryClient } from '../api/query-client.js';
import { useAppStore } from '../store/use-app-store.js';
import {
  LayoutDashboard,
  Wrench,
  Package,
  ShoppingCart,
  BookOpen,
  FileSpreadsheet,
  Settings,
  LogOut,
  Sun,
  Moon,
  Search,
  X,
  CheckCircle,
  AlertTriangle,
  Info,
  Users,
  Car,
  Truck,
  Receipt,
  Wallet,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  const user = useAppStore((state) => state.user);
  const logout = useAppStore((state) => state.logout);
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);

  const notifications = useAppStore((state) => state.notifications);
  const removeNotification = useAppStore((state) => state.removeNotification);

  const dialog = useAppStore((state) => state.dialog);
  const closeDialog = useAppStore((state) => state.closeDialog);

  // Command Palette State
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);

  // Everyday screens use plain words for a non-technical owner; specialist
  // screens stay one click away under "More tools".
  const navItems = [
    { name: 'Home', path: '/', icon: LayoutDashboard },
    { name: 'Job Cards', path: '/job-cards', icon: Wrench },
    { name: 'Bills', path: '/invoices', icon: Receipt },
    { name: 'Customers', path: '/customers', icon: Users },
    { name: 'Vehicles', path: '/vehicles', icon: Car },
    { name: 'Stock', path: '/inventory', icon: Package },
    { name: 'Buy Stock', path: '/purchasing', icon: ShoppingCart },
    { name: 'Suppliers', path: '/suppliers', icon: Truck },
    { name: 'Money In / Out', path: '/money', icon: Wallet },
    { name: 'Dues & Daily Cash', path: '/cash-receivables', icon: BookOpen },
    { name: 'Expenses', path: '/expenses', icon: BookOpen },
    { name: 'Reports & GST', path: '/reports', icon: FileSpreadsheet },
    { name: 'Settings & Backup', path: '/settings', icon: Settings },
  ];
  const moreItems = [
    { name: 'Workshop Queue', path: '/workshop' },
    { name: 'Service Reminders', path: '/reminders' },
    { name: 'Service History', path: '/service-history' },
    { name: 'Mechanics', path: '/technicians' },
    { name: 'Accounts (Ledger)', path: '/accounting' },
    { name: 'Supplier Ledger', path: '/supplier-ledger' },
    { name: 'Sales Orders', path: '/sales-orders' },
    { name: 'Returns', path: '/returns' },
    { name: 'Warranties', path: '/warranties' },
    { name: 'Stock Count', path: '/stock-verification' },
    { name: 'Godowns & Masters', path: '/masters' },
    { name: 'Fixed Assets', path: '/assets' },
    { name: 'Audit Log', path: '/audit-logs' },
  ];
  const [showMore, setShowMore] = useState(() => {
    try {
      return localStorage.getItem('goldy_show_more_tools') === '1';
    } catch {
      return false;
    }
  });
  const toggleMore = () => {
    setShowMore((open) => {
      try {
        localStorage.setItem('goldy_show_more_tools', open ? '0' : '1');
      } catch {
        // Remembering the choice is optional.
      }
      return !open;
    });
  };
  const companyProfile = useQuery({
    queryKey: ['company-profile'],
    queryFn: () => api.get('/api/v1/settings/company'),
    staleTime: 5 * 60 * 1000,
  });

  // Hotkey handlers
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Toggle Command Palette: Ctrl + P
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }

      // Close Command Palette / Dialog: Escape
      if (e.key === 'Escape') {
        if (showSearch) setShowSearch(false);
        if (dialog.isOpen) closeDialog();
      }

      // F-Keys Navigation
      if (e.key === 'F1') {
        e.preventDefault();
        navigate('/');
      }
      if (e.key === 'F2') {
        e.preventDefault();
        navigate('/job-cards');
      }
      if (e.key === 'F3') {
        e.preventDefault();
        navigate('/sales-orders');
      }
      if (e.key === 'F4') {
        e.preventDefault();
        navigate('/inventory');
      }
      if (e.key === 'F5') {
        e.preventDefault();
        navigate('/purchasing');
      }
      if (e.key === 'F6') {
        e.preventDefault();
        navigate('/accounting');
      }
      if (e.key === 'F7') {
        e.preventDefault();
        navigate('/reports');
      }
      if (e.key === 'F8') {
        e.preventDefault();
        navigate('/customers');
      }
      if (e.key === 'F9') {
        e.preventDefault();
        navigate('/settings');
      }
      if (e.key === 'F10') {
        e.preventDefault();
        navigate('/vehicles');
      }
      if (e.key === 'F11') {
        e.preventDefault();
        navigate('/suppliers');
      }
      if (e.key === 'F12') {
        e.preventDefault();
        navigate('/warranties');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch, dialog.isOpen, navigate, closeDialog]);

  // Focus input when command palette opens
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  const filteredNavItems = [...navItems, ...moreItems].filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 transition-colors duration-200">
      {/* 1. SIDEBAR */}
      <aside className="w-64 overflow-y-auto bg-white border-r border-gray-200 dark:bg-gray-900 dark:border-gray-800 flex flex-col justify-between shrink-0">
        <div>
          <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-gray-800">
            <span className="text-lg font-bold tracking-wider text-brand-600 dark:text-brand-400">
              GOLDY AUTOMOBILES
            </span>
          </div>
          <nav className="p-4 space-y-1" aria-label="Main menu">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-all ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.name}</span>
                </button>
              );
            })}
            <div className="border-t border-gray-200 pt-3 mt-3 dark:border-gray-800">
              <button
                onClick={toggleMore}
                aria-expanded={showMore}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              >
                {showMore ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                More tools
              </button>
              {showMore &&
                moreItems.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    aria-current={location.pathname === item.path ? 'page' : undefined}
                    className={`block w-full text-left px-4 py-2 pl-10 text-sm rounded-lg ${
                      location.pathname === item.path
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                        : 'text-gray-600 hover:text-brand-600 dark:text-gray-400'
                    }`}
                  >
                    {item.name}
                  </button>
                ))}
            </div>
          </nav>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
            <div>
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                {user?.username}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">
                {user?.role?.name || 'Administrator'}
              </p>
            </div>
            <button
              onClick={async () => {
                try {
                  await api.post('/api/v1/auth/logout');
                } catch (error) {
                  useAppStore.getState().addNotification(error.message, 'error');
                } finally {
                  queryClient.clear();
                  logout();
                }
              }}
              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/30 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. MAIN COCKPIT VIEW */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* TOP HEADER */}
        <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-3 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/30 text-xs w-64 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">Find a screen...</span>
              <kbd className="text-[10px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-1 py-0.5 rounded shadow-sm">
                Ctrl + P
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs font-semibold px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800 rounded-full">
              {companyProfile.data?.data?.name || 'GOLDY AUTOMOBILE'}
            </span>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
            >
              {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </button>
          </div>
        </header>

        {/* PAGE CONTENT CONTAINER */}
        <main className="flex-1 overflow-y-auto min-h-0 bg-gray-50 dark:bg-gray-950">
          <Outlet />
        </main>
      </div>

      {/* 3. TOAST NOTIFICATIONS OVERLAY */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
        {notifications.map((n) => {
          let Icon = Info;
          let color =
            'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/80 dark:border-blue-900 dark:text-blue-400';
          if (n.type === 'success') {
            Icon = CheckCircle;
            color =
              'bg-green-50 border-green-200 text-green-800 dark:bg-green-950/80 dark:border-green-900 dark:text-green-400';
          } else if (n.type === 'error') {
            Icon = AlertTriangle;
            color =
              'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/80 dark:border-red-900 dark:text-red-400';
          }
          return (
            <div
              key={n.id}
              className={`flex items-center justify-between p-4 rounded-xl border shadow-lg backdrop-blur-sm pointer-events-auto transition-all animate-slide-in ${color}`}
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 shrink-0" />
                <p className="text-sm font-medium">{n.message}</p>
              </div>
              <button
                onClick={() => removeNotification(n.id)}
                className="p-1 rounded-md hover:bg-white/20 dark:hover:bg-black/20 transition-colors ml-4 shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* 4. CONFIRMATION DIALOG MODAL */}
      {dialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 rounded-2xl max-w-md w-full shadow-2xl animate-fade-in">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{dialog.title}</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{dialog.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={dialog.onCancel}
                className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={dialog.onConfirm}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 focus-ring transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. COMMAND PALETTE (CTRL + P) */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-xs pt-[15vh]">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-slide-down">
            <div className="flex items-center px-4 border-b border-gray-200 dark:border-gray-800">
              <Search className="h-5 w-5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type a screen name or action..."
                className="w-full py-4 px-3 text-sm text-gray-900 placeholder-gray-400 dark:text-white dark:bg-gray-900 border-none outline-none focus:ring-0"
              />
              <button
                onClick={() => setShowSearch(false)}
                className="p-1 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[300px] overflow-y-auto p-2">
              {filteredNavItems.length > 0 ? (
                filteredNavItems.map((item) => {
                  const Icon = item.icon || ChevronRight;
                  return (
                    <button
                      key={item.path}
                      onClick={() => {
                        navigate(item.path);
                        setShowSearch(false);
                        setSearchQuery('');
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4.5 w-4.5 text-gray-400" />
                        <span className="font-medium">{item.name}</span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-gray-400">No matching screen.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
