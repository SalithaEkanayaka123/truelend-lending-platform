import { expect, test } from '@playwright/test';

import { apiLogin, ROLES } from './support/roles';

const CALLS = 200;

// Hunts the intermittent GET /api/products 500: every call must be 200, and
// the first failure reports the response's correlation_id so the backend
// log line can be found.
for (const r of ROLES) {
  test(`GET /api/products x${CALLS} as ${r.role} is always 200`, async ({ request }) => {
    test.setTimeout(180_000);
    const token = await apiLogin(request, r.email);
    const failures: string[] = [];

    for (let i = 1; i <= CALLS; i += 1) {
      const response = await request.get('/api/products', { headers: { Authorization: `Bearer ${token}` } });
      if (response.status() !== 200) {
        const header = response.headers()['x-correlation-id'] ?? 'none';
        const body = (await response.json().catch(() => null)) as { error?: { correlation_id?: string } } | null;
        failures.push(
          `call ${i}/${CALLS} -> ${response.status()} correlation_id=${body?.error?.correlation_id ?? header}`,
        );
      }
    }

    expect(failures, `${r.role}: ${failures.length} non-200 of ${CALLS}`).toEqual([]);
  });

  // The sequential loop reuses one server worker thread, so it cannot see a
  // thread-affinity bug. Concurrent bursts (what the browser does: products and
  // policies fetched together) can.
  test(`GET /api/products x${CALLS} in concurrent bursts as ${r.role} is always 200`, async ({ request }) => {
    test.setTimeout(180_000);
    const token = await apiLogin(request, r.email);
    const failures: string[] = [];
    const BURST = 8;

    for (let sent = 0; sent < CALLS; sent += BURST) {
      const burst = await Promise.all(
        Array.from({ length: Math.min(BURST, CALLS - sent) }, (_, k) =>
          request.get('/api/products', { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => {
            if (response.status() === 200) return null;
            const body = (await response.json().catch(() => null)) as { error?: { correlation_id?: string } } | null;
            return `call ${sent + k + 1}/${CALLS} -> ${response.status()} correlation_id=${body?.error?.correlation_id ?? 'none'}`;
          }),
        ),
      );
      failures.push(...burst.filter((f): f is string => f !== null));
    }

    expect(failures, `${r.role}: ${failures.length} non-200 of ${CALLS}`).toEqual([]);
  });
}
