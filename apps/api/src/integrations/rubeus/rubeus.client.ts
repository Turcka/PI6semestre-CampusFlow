import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export type RubeusContact = {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  cpf?: string | null;
  trackingCode: string;
  courseName?: string | null;
};

export type RubeusVisitPayload = {
  trackingCode: string;
  visitId: string;
  status: string;
  occurredAt?: string;
};

function assertConfigured() {
  if (!env.RUBEUS_BASE_URL || !env.RUBEUS_API_TOKEN) {
    throw new Error('Rubeus não configurado (RUBEUS_BASE_URL / RUBEUS_API_TOKEN).');
  }
}

async function rubeusFetch(path: string, init?: RequestInit) {
  assertConfigured();
  const url = `${env.RUBEUS_BASE_URL!.replace(/\/$/, '')}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RUBEUS_API_TOKEN}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Rubeus HTTP ${response.status}: ${body}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function upsertContact(candidate: RubeusContact) {
  const payload = {
    originId: env.RUBEUS_ORIGIN_ID,
    trackingCode: candidate.trackingCode,
    name: candidate.fullName,
    email: candidate.email,
    phone: candidate.phone,
    document: candidate.cpf,
    course: candidate.courseName,
  };
  logger.info({ trackingCode: candidate.trackingCode }, 'Rubeus upsertContact');
  return rubeusFetch('/contacts', { method: 'POST', body: JSON.stringify(payload) });
}

export async function registerVisit(visit: RubeusVisitPayload) {
  const payload = {
    originId: env.RUBEUS_ORIGIN_ID,
    trackingCode: visit.trackingCode,
    visitId: visit.visitId,
    status: visit.status,
    occurredAt: visit.occurredAt ?? new Date().toISOString(),
  };
  logger.info({ visitId: visit.visitId }, 'Rubeus registerVisit');
  return rubeusFetch('/visits', { method: 'POST', body: JSON.stringify(payload) });
}

export async function getConversionStatus(trackingCodeOrContactId: string) {
  return rubeusFetch(`/conversions/${encodeURIComponent(trackingCodeOrContactId)}`, { method: 'GET' });
}
