export class ExpenseController {
  constructor(expenseService) {
    this.expenseService = expenseService;
  }

  list = (req, res, next) => {
    try {
      res.status(200).json(this.expenseService.list(req.query));
    } catch (error) {
      next(error);
    }
  };

  get = (req, res, next) => {
    try {
      res.status(200).json({ data: this.expenseService.get(Number(req.params.id)) });
    } catch (error) {
      next(error);
    }
  };

  create = (req, res, next) => {
    try {
      const expense = this.expenseService.create(req.body || {}, req.user?.id);
      res.status(201).json({ data: expense });
    } catch (error) {
      next(error);
    }
  };

  update = (req, res, next) => {
    try {
      const expense = this.expenseService.update(
        Number(req.params.id),
        req.body || {},
        req.user?.id,
      );
      res.status(200).json({ data: expense });
    } catch (error) {
      next(error);
    }
  };

  delete = (req, res, next) => {
    try {
      res.status(200).json(this.expenseService.delete(Number(req.params.id), req.user?.id));
    } catch (error) {
      next(error);
    }
  };
}
