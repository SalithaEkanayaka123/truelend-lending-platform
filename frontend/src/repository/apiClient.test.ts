import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiRequest, setAuthToken } from './apiClient';

describe('apiRequest', () => {
  afterEach(() => {
    setAuthToken(null);
    vi.unstubAllGlobals();
  });

  it('sends a bearer token header when one has been set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    setAuthToken('demo-token');
    await apiRequest('/api/policies');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer demo-token');
  });

  it('returns the parsed JSON body on a 2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: 2 }), { status: 201 })),
    );

    const body = await apiRequest<{ version: number }>('/api/policies', { method: 'POST' });
    expect(body.version).toBe(2);
  });

  it('throws an ApiError carrying the envelope code and message on a non-2xx response', async () => {
    const envelope = {
      error: { code: 'VALIDATION_ERROR', message: 'PERSONAL.min_age: must not exceed max_age', correlation_id: 'c-1' },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(envelope), { status: 422 })));

    await expect(apiRequest('/api/policies', { method: 'POST' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'PERSONAL.min_age: must not exceed max_age',
      correlationId: 'c-1',
    });
  });

  it('is an instance of ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'no' } }), { status: 403 })),
    );
    await expect(apiRequest('/api/policies')).rejects.toBeInstanceOf(ApiError);
  });
});
