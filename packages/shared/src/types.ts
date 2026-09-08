import type {
  LeadStatus,
  MessageChannel,
  MessageStatus,
  PoiCategory,
  UserRole,
  VisitStatus,
  VisitType,
} from './enums.js';

/** Entidades de domínio expostas pela API (DTOs). */

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

export interface Lead {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  phone: string;
  courseId: string | null;
  source: string | null;
  status: LeadStatus;
  consentAt: string | null;
  createdAt: string;
}

export interface VisitSlot {
  id: string;
  coordinatorId: string;
  campusId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
}

export interface Visit {
  id: string;
  tenantId: string;
  leadId: string;
  slotId: string;
  coordinatorId: string;
  type: VisitType;
  status: VisitStatus;
  startsAt: string;
  endsAt: string;
  checkinToken: string | null;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  visitId: string;
  coordinatorId: string;
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
  leadId: string | null;
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
