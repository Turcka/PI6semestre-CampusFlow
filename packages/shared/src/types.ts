import type {
  CandidateStatus,
  InvitationStatus,
  MessageChannel,
  MessageStatus,
  ParticipantRole,
  PoiCategory,
  UserRole,
  VisitFocus,
  VisitStatus,
  VisitType,
} from './enums.js';

/** Entidades de domínio expostas pela API (DTOs) — Revisão 2. */

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  createdAt: string;
}

export interface Campus {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface Profile {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

export interface Course {
  id: string;
  tenantId: string;
  campusId: string;
  name: string;
}

export interface Candidate {
  id: string;
  tenantId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  courseId: string | null;
  source: string | null;
  status: CandidateStatus;
  preferredFocus: VisitFocus | null;
  profileSummary: string | null;
  profileCompletedAt: string | null;
  portalToken: string;
  trackingCode: string;
  consentAt: string | null;
  createdAt: string;
}

/** @deprecated Use Candidate */
export type Lead = Candidate;

export interface VisitSlot {
  id: string;
  ownerId: string;
  campusId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
}

export interface Visit {
  id: string;
  tenantId: string;
  candidateId: string;
  slotId: string;
  promoterId: string | null;
  professorId: string | null;
  type: VisitType;
  status: VisitStatus;
  focus: VisitFocus | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
}

export interface VisitInvitation {
  id: string;
  visitId: string;
  profileId: string;
  role: ParticipantRole;
  status: InvitationStatus;
  expiresAt: string;
  sentAt: string;
}

export interface CalendarEvent {
  id: string;
  visitId: string;
  promoterId: string | null;
  professorId: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  confirmedAt: string | null;
}

export interface MessageTemplate {
  id: string;
  tenantId: string;
  name: string;
  channel: MessageChannel;
  subject: string | null;
  body: string;
  providerTemplateName: string | null;
}

export interface MessageLog {
  id: string;
  tenantId: string;
  candidateId: string | null;
  visitId: string | null;
  channel: MessageChannel;
  status: MessageStatus;
  providerMessageId: string | null;
  sentAt: string | null;
}

export interface Poi {
  id: string;
  campusId: string;
  name: string;
  category: PoiCategory;
  description: string | null;
  latitude: number;
  longitude: number;
  photoUrls: string[];
}

export interface ChatbotQuestion {
  id: string;
  tenantId: string;
  courseId: string | null;
  audience: 'candidato' | 'promotor';
  key: string;
  prompt: string;
  kind: 'single_choice' | 'multi_choice' | 'scale' | 'free_text';
  options: unknown[];
  orderIndex: number;
  isRequired: boolean;
  isActive: boolean;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
