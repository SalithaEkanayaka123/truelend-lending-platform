import { expect, test } from '@playwright/test';

import { apiLogin, ROLES } from './support/roles';

// Role matrix: specs/features/F0-platform.md (permission matrix).
//   GET /api/products  - any authenticated role
//   GET /api/policies  - POLICY_EDITOR, ADMIN
//   GET /api/audit     - ADMIN only
// Everything else is 403 FORBIDDEN, with the shared error envelope.

for (const r of ROLES) {
  test.describe(`API as ${r.role}`, () => {
    const endpoints = [
      ['/api/products', r.products],
      ['/api/policies', r.policies],
      ['/api/audit', r.audit],
    ] as const;

    for (const [path, expected] of endpoints) {
      test(`GET ${path} -> ${expected}`, async ({ request }) => {
        const token = await apiLogin(request, r.email);
        const response = await request.get(path, { headers: { Authorization: `Bearer ${token}` } });
        const cid = response.headers()['x-correlation-id'];
        expect(response.status(), `${r.role} GET ${path} correlation_id=${cid}`).toBe(expected);
        if (expected === 403) {
          const body = (await response.json()) as { error: { code: string; correlation_id: string } };
          expect(body.error.code).toBe('FORBIDDEN');
          expect(body.error.correlation_id).toBe(cid);
        }
      });
    }
  });
}

test('an unauthenticated request is 401 UNAUTHENTICATED', async ({ request }) => {
  const response = await request.get('/api/products');
  expect(response.status()).toBe(401);
  expect(((await response.json()) as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');
});
