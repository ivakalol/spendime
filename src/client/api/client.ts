import type { ApiErrorBody } from './types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields: Array<{ field: string; message: string }> = []) {
    super(message); this.name = 'ApiError';
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, options: { allowUnauthorized?: boolean } = {}): Promise<T> {
  if (!navigator.onLine && init.method && init.method !== 'GET') {
    throw new ApiError(0, 'offline', 'You are offline. Financial changes are disabled until your connection returns.');
  }
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'network_error', 'The server could not be reached. Check your connection and try again.');
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({})) as ApiErrorBody & T;
  if (!response.ok) {
    const error = new ApiError(response.status, body.error?.code ?? 'request_failed', body.error?.message ?? 'The request could not be completed.', body.error?.fields ?? []);
    if (response.status === 401 && !options.allowUnauthorized) window.dispatchEvent(new CustomEvent('spendime:unauthorized'));
    throw error;
  }
  return body as T;
}

export const jsonBody = (value: unknown): Pick<RequestInit, 'body'> => ({ body: JSON.stringify(value) });
