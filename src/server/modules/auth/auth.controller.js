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
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  logout = (req, res, next) => {
    try {
      this.authService.logout(req.authToken);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  me = (req, res) => {
    res.status(200).json({ user: req.user });
  };
}
