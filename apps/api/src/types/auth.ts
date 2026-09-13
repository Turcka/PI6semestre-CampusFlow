import type { UserRole } from '@campusflow/shared';

export interface AuthUser {
  id: string;
  tenantId: string;
  role: UserRole;
  email: string;
  fullName: string;
}
