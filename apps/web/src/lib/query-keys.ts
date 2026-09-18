export const queryKeys = {
  me: ['auth', 'me'] as const,
  campus: (slug: string) => ['public', 'campus', slug] as const,
  chatbotNext: (sessionId: string) => ['chatbot', 'next', sessionId] as const,
  chatbotReview: (sessionId: string) => ['chatbot', 'review', sessionId] as const,
  windows: (candidateId: string, from: string, to: string) =>
    ['scheduling', 'windows', candidateId, from, to] as const,
  candidateMe: (token: string) => ['candidate', 'me', token] as const,
  candidateVisits: (token: string) => ['candidate', 'visits', token] as const,
  invitations: (status?: string) => ['invitations', status ?? 'all'] as const,
  visits: (params: Record<string, string | undefined>) => ['visits', params] as const,
  visit: (id: string) => ['visit', id] as const,
  candidates: (params: Record<string, string | undefined>) => ['candidates', params] as const,
  candidate: (id: string) => ['candidate', id] as const,
  analyticsOverview: (params: Record<string, string | undefined>) => ['analytics', 'overview', params] as const,
  calendarEvents: (from: string, to: string) => ['calendar', 'events', from, to] as const,
  chatbotQuestions: () => ['chatbot', 'questions'] as const,
  matchWeights: () => ['match', 'weights'] as const,
};
