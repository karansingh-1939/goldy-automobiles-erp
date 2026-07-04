import { parseAuditListQuery } from './audit.validator.js';

export class AuditController {
  constructor(auditService) {
    this.auditService = auditService;
  }

  list = (req, res, next) => {
    try {
      const filters = parseAuditListQuery(req.query);
      const result = this.auditService.list(filters);
      res.status(200).json({
        data: result.data,
        pagination: {
          page: filters.page,
          pageSize: filters.pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.pageSize),
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
