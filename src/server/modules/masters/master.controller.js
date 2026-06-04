import { parseListQuery } from './master.validator.js';

export class MasterController {
  constructor(masterService) {
    this.masterService = masterService;
  }

  list = (req, res, next) => {
    try {
      const result = this.masterService.list(parseListQuery(req.query));
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  get = (req, res, next) => {
    try {
      res.status(200).json({ data: this.masterService.get(Number(req.params.id)) });
    } catch (error) {
      next(error);
    }
  };

  create = (req, res, next) => {
    try {
      const record = this.masterService.create(req.body || {}, req.user?.id);
      res.status(201).json({ data: record });
    } catch (error) {
      next(error);
    }
  };

  update = (req, res, next) => {
    try {
      const record = this.masterService.update(Number(req.params.id), req.body || {}, req.user?.id);
      res.status(200).json({ data: record });
    } catch (error) {
      next(error);
    }
  };

  delete = (req, res, next) => {
    try {
      res.status(200).json(this.masterService.delete(Number(req.params.id), req.user?.id));
    } catch (error) {
      next(error);
    }
  };
}
