export class JobCardController {
  constructor(jobCardService) {
    this.jobCardService = jobCardService;
  }

  list = (req, res, next) => {
    try {
      res.status(200).json(this.jobCardService.list(req.query));
    } catch (error) {
      next(error);
    }
  };

  get = (req, res, next) => {
    try {
      res.status(200).json({ data: this.jobCardService.get(Number(req.params.id)) });
    } catch (error) {
      next(error);
    }
  };

  create = (req, res, next) => {
    try {
      res.status(201).json({ data: this.jobCardService.create(req.body || {}, req.user?.id) });
    } catch (error) {
      next(error);
    }
  };

  addPart = (req, res, next) => {
    try {
      const part = this.jobCardService.addPart(Number(req.params.id), req.body || {}, req.user?.id);
      res.status(201).json({ data: part });
    } catch (error) {
      next(error);
    }
  };

  addLabour = (req, res, next) => {
    try {
      const labour = this.jobCardService.addLabour(Number(req.params.id), req.body || {}, req.user?.id);
      res.status(201).json({ data: labour });
    } catch (error) {
      next(error);
    }
  };

  finalize = (req, res, next) => {
    try {
      res.status(201).json({ data: this.jobCardService.finalize(Number(req.params.id), req.user?.id) });
    } catch (error) {
      next(error);
    }
  };

  getInvoice = (req, res, next) => {
    try {
      res.status(200).json({ data: this.jobCardService.getInvoice(Number(req.params.id)) });
    } catch (error) {
      next(error);
    }
  };

  cancelInvoice = (req, res, next) => {
    try {
      res.status(200).json({ data: this.jobCardService.cancelInvoice(Number(req.params.id), req.user?.id) });
    } catch (error) {
      next(error);
    }
  };
}
