export class TechnicianController {
  constructor(technicianService) {
    this.technicianService = technicianService;
  }

  list = (req, res, next) => {
    try {
      res.status(200).json(this.technicianService.list(req.query));
    } catch (error) {
      next(error);
    }
  };

  get = (req, res, next) => {
    try {
      res.status(200).json({ data: this.technicianService.get(Number(req.params.id)) });
    } catch (error) {
      next(error);
    }
  };

  create = (req, res, next) => {
    try {
      res.status(201).json({ data: this.technicianService.create(req.body || {}, req.user?.id) });
    } catch (error) {
      next(error);
    }
  };

  update = (req, res, next) => {
    try {
      res.status(200).json({ data: this.technicianService.update(Number(req.params.id), req.body || {}, req.user?.id) });
    } catch (error) {
      next(error);
    }
  };

  deactivate = (req, res, next) => {
    try {
      res.status(200).json({ data: this.technicianService.deactivate(Number(req.params.id), req.user?.id) });
    } catch (error) {
      next(error);
    }
  };

  assignToJobCard = (req, res, next) => {
    try {
      const { jobCardId, notes } = req.body || {};
      res.status(200).json({ data: this.technicianService.assignToJobCard(Number(jobCardId), Number(req.params.id), req.user?.id, notes) });
    } catch (error) {
      next(error);
    }
  };

  getHistory = (req, res, next) => {
    try {
      res.status(200).json(this.technicianService.getHistoryAndMetrics(Number(req.params.id), req.query));
    } catch (error) {
      next(error);
    }
  };
}
