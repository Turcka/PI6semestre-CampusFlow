import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiOptions = RequestInit & {
  candidateToken?: string | null;
};

/**
 * Cliente HTTP para a API do CampusFlow.
 * Anexa JWT Supabase (área autenticada) e/ou portalToken do candidato.
 */
export async function api<T>(path: string, init: ApiOptions = {}): Promise<T> {
  const { candidateToken, ...fetchInit } = init;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(candidateToken ? { 'X-Candidate-Token': candidateToken } : {}),
    ...(fetchInit.headers as Record<string, string> | undefined),
  };

  const response = await fetch(`${API_URL}${path}`, {
    ...fetchInit,
    headers,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string; details?: unknown };
    } | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? response.statusText,
      body?.error?.details,
    );
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function publicApi<T>(path: string, init: ApiOptions = {}) {
  return api<T>(`/api/v1/public${path}`, init);
}

export function v1Api<T>(path: string, init: ApiOptions = {}) {
  return api<T>(`/api/v1${path}`, init);
}
