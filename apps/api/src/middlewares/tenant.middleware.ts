import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../utils/app-error.js';

/** Garante que o usuário autenticado possui tenant_id resolvido. */
export function tenantMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.tenantId) {
    next(AppError.forbidden('Tenant não resolvido para o usuário.'));
    return;
  }
  next();
}

/** Defesa em profundidade: rejeita se o recurso apontar para outro tenant. */
export function assertSameTenant(resourceTenantId: string | null | undefined, userTenantId: string): void {
  if (!resourceTenantId || resourceTenantId !== userTenantId) {
    throw AppError.forbidden('Recurso pertence a outra instituição.');
  }
}
