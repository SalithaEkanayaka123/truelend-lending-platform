/** The only module in this app that calls `fetch`. Holds the bearer token
 * issued by `POST /api/auth/login` in memory (never persisted, never
 * logged) and maps the backend's `{error:{code,message,correlation_id}}`
 * envelope onto a typed `ApiError`. Nothing here logs a request or response
 * body — those may carry application data (NFR-03). */

export class ApiError extends Error {
  readonly code: string;
  readonly correlationId: string | undefined;

  constructor(code: string, message: string, correlationId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.correlationId = correlationId;
  }
}

interface ErrorEnvelope {
  error?: { code: string; message: string; correlation_id?: string };
}

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
}

async function toApiError(response: Response): Promise<ApiError> {
  const envelope = (await response.json().catch(() => null)) as ErrorEnvelope | null;
  const detail = envelope?.error;
  return new ApiError(
    detail?.code ?? 'HTTP_ERROR',
    detail?.message ?? `Request failed with status ${response.status}.`,
    detail?.correlation_id,
  );
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as T;
}
