import { env } from '../../config/env.js';

export class AuthController {
  constructor(authService) {
    this.authService = authService;
  }

  getSetupStatus = (req, res, next) => {
    try {
      const result = this.authService.getSetupStatus();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  setup = async (req, res, next) => {
    try {
      const result = await this.authService.setupAdmin(req.body || {});
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  forgotPassword = async (req, res, next) => {
    try {
      const result = await this.authService.forgotPassword(req.body || {});
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  login = async (req, res, next) => {
    try {
      const result = await this.authService.login(req.body || {});
      res.cookie('goldy_session_token', result.token, {
        path: '/',
        httpOnly: true,
        secure: false, // Omit/false since it's local HTTP
        sameSite: 'strict',
        maxAge: (env.sessionTtlHours || 12) * 60 * 60 * 1000 // In milliseconds
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  logout = (req, res, next) => {
    try {
      this.authService.logout(req.authToken);
      res.clearCookie('goldy_session_token', { path: '/' });
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  me = (req, res) => {
    res.status(200).json({ user: req.user });
  };
}
