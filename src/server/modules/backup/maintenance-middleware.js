import { AppError } from '../../shared/errors/app-error.js';

export function requireAdministrator(req, res, next) {
  const role = req.user?.role?.name?.toLowerCase();
  if (role === 'admin' || role === 'administrator') return next();
  return next(
    new AppError('Only an administrator can maintain business data.', 403, 'PERMISSION_DENIED'),
  );
}
