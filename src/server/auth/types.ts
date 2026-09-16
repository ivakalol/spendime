export interface SafeUser {
  id: string;
  email: string;
  displayName: string;
  baseCurrency: string;
  timezone: string;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface AuthenticatedSession {
  sessionId: string;
  user: SafeUser;
  expiresAt: string;
}
