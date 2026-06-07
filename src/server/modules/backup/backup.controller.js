export class BackupController {
  constructor(backupService) {
    this.backupService = backupService;
  }

  manualBackup = async (req, res, next) => {
    try {
      const backupLog = await this.backupService.backupDatabase({
        type: 'MANUAL',
        userId: req.user?.id
      });
      res.status(201).json({ data: backupLog });
    } catch (error) {
      next(error);
    }
  };

  list = (req, res, next) => {
    try {
      res.status(200).json(this.backupService.list(req.query));
    } catch (error) {
      next(error);
    }
  };
}
