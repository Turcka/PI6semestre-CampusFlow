const TOKEN_KEY = 'campusflow.portalToken';
const SESSION_KEY = 'campusflow.chatbotSession';

export type CandidateSessionState = {
  sessionId: string;
  portalToken: string;
  candidateId: string;
  campusSlug: string;
};

export function saveCandidateSession(state: CandidateSessionState) {
  localStorage.setItem(TOKEN_KEY, state.portalToken);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
}

export function loadCandidateSession(): CandidateSessionState | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CandidateSessionState;
  } catch {
    return null;
  }
}

export function getPortalToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? loadCandidateSession()?.portalToken ?? null;
}

export function clearCandidateSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function setPortalToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
