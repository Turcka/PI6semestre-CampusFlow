import type { UserRole } from '@campusflow/shared';
import type { NextFunction, Request, Response } from 'express';

import { createUserClient, getAdminClient } from '../config/supabase.js';
import { AppError } from '../utils/app-error.js';
import type { AuthUser } from '../types/auth.js';

/**
 * Valida JWT do Supabase Auth e anexa `req.user` + `req.supabase` (cliente com RLS).
 */
export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw AppError.unauthorized('Token de autenticação ausente.');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) throw AppError.unauthorized();

    const admin = getAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) {
      throw AppError.unauthorized('Token inválido ou expirado.');
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, tenant_id, role, email, full_name, is_active')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError) throw AppError.badRequest(profileError.message);
    if (!profile || !profile.is_active) {
      throw AppError.forbidden('Perfil inativo ou não encontrado.');
    }

    const user: AuthUser = {
      id: profile.id,
      tenantId: profile.tenant_id,
      role: profile.role as UserRole,
      email: profile.email,
      fullName: profile.full_name,
    };

    req.user = user;
    req.supabase = createUserClient(token);
    next();
  } catch (err) {
    next(err);
  }
}

/** Auth opcional: se houver Bearer, valida; se não houver, segue sem user. */
export async function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    next();
    return;
  }
  await authMiddleware(req, res, next);
}
