import { AppError } from '../errors/app-error.js';
import { hashToken } from '../utils/tokens.js';

export function authenticate(authService) {
  return (req, res, next) => {
    const authorization = req.header('authorization') || '';
    const [, token] = authorization.match(/^Bearer\s+(.+)$/i) || [];

    if (!token) {
      return next(new AppError('Authentication token is required.', 401, 'AUTH_TOKEN_REQUIRED'));
    }

    const user = authService.getUserByToken(token);

    if (!user) {
      return next(
        new AppError('Authentication token is invalid or expired.', 401, 'AUTH_TOKEN_INVALID'),
      );
    }

    req.authToken = token;
    req.authTokenHash = hashToken(token);
    req.user = user;
    return next();
  };
}

export function requirePermission(permissionKey) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication is required.', 401, 'AUTH_REQUIRED'));
    }

    const roleName = req.user.role?.name || '';
    if (
      roleName.toLowerCase() === 'admin' ||
      roleName.toLowerCase() === 'administrator' ||
      req.user.permissions.includes(permissionKey)
    ) {
      return next();
    }

    return next(
      new AppError('You do not have permission to perform this action.', 403, 'PERMISSION_DENIED'),
    );
  };
}
