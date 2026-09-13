import type { UserRole } from '@campusflow/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { AppError } from '../utils/app-error.js';

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden(`Papel '${req.user.role}' não autorizado. Requer: ${roles.join(', ')}.`));
      return;
    }
    next();
  };
}
