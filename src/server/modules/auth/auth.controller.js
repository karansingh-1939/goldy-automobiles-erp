export class AuthController {
  constructor(authService) {
    this.authService = authService;
  }

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
