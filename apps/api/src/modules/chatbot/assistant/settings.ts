import { DEFAULT_ASSISTANT_SETTINGS, assistantSettingsSchema, type AssistantSettings } from '@campusflow/shared';

/**
 * Lê `tenants.settings.assistant` com defaults. Configuração ausente ou inválida resulta em
 * assistente desligado (o chatbot segue por botões).
 */
export function resolveAssistantSettings(tenantSettings: unknown, defaults: Partial<AssistantSettings> = {}): AssistantSettings {
  const base: AssistantSettings = { ...DEFAULT_ASSISTANT_SETTINGS, ...defaults };
  const raw =
    tenantSettings && typeof tenantSettings === 'object' ? (tenantSettings as Record<string, unknown>).assistant : undefined;
  if (!raw || typeof raw !== 'object') return base;

  const parsed = assistantSettingsSchema.safeParse({ ...base, ...(raw as Record<string, unknown>) });
  return parsed.success ? parsed.data : base;
}
