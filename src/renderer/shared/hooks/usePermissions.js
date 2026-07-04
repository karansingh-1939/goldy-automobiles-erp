import { useAppStore } from '../store/useAppStore.js';

export function usePermissions() {
  const user = useAppStore((state) => state.user);

  const hasPermission = (permission) => {
    if (!user) return false;
    
    // Administrator role automatically bypasses all permission checks
    const roleName = user.role?.name || '';
    if (roleName.toLowerCase() === 'admin' || roleName.toLowerCase() === 'administrator') {
      return true;
    }
    
    return user.permissions?.includes(permission) || false;
  };

  return {
    hasPermission,
    role: user?.role?.name || 'Guest',
    user
  };
}
