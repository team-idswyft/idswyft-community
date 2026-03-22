import { Request, Response, NextFunction } from 'express';
import config from '../config/index.js';

export function requireServiceToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-service-token'];
  if (!token || token !== config.serviceToken) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid service token' } });
    return;
  }
  next();
}
