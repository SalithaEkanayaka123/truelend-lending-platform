import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { apiLogin, assertNoHorizontalScroll, uiSignIn, watchProblems } from './support/roles';

const CUSTOMER = 'customer1@example.test';
const UNDERWRITER = 'underwriter@example.test';
const DOCS = [
  { type: 'ID_PROOF', filename: 'id.png' },
  { type: 'ADDRESS_PROOF', filename: 'addr.png' },
  { type: 'SALARY_SLIP', filename: 'slip.png' },
];
const CLEAN = { prior_default: false, missed_payment_12m: false, thin_file: false };

/** Creates, submits and underwrites an application through the API (synthetic data only). */
async function underwrittenApplication(
  request: APIRequestContext,
  income: string,
  flags: Record<string, boolean>,
): Promise<number> {
  const headers = { Authorization: `Bearer ${await apiLogin(request, CUSTOMER)}` };
  const created = await request.post('/api/applications', {
    headers,
    data: {
      product_type: 'PERSONAL',
      requested_amount: '200000.00',
      tenure_months: 24,
      age_years: 30,
      monthly_income: income,
      credit_flags: flags,
      pan: 'ABCDE1234F',
      aadhaar: '123456789012',
    },
  });
  expect(created.status()).toBe(201);
  const id = ((await created.json()) as { id: number }).id;
  for (const doc of DOCS) {
    expect((await request.post(`/api/applications/${id}/documents`, { headers, data: doc })).status()).toBe(201);
  }
  expect((await request.post(`/api/applications/${id}/submit`, { headers })).status()).toBe(200);
  expect((await request.post(`/api/applications/${id}/underwrite`, { headers })).status()).toBe(200);
  return id;
}

// Token lives in memory, so navigate client-side rather than with page.goto.
async function openApplication(page: Page, id: number): Promise<void> {
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/applications/${id}`);
}

test.describe('Application review (E3-S5)', () => {
  test('UNDERWRITER approves a manual review with a reason (E3-S5-AC1)', async ({ page, request }) => {
    const id = await underwrittenApplication(request, '60000.00', CLEAN);
    const problems = watchProblems(page);
    await uiSignIn(page, UNDERWRITER);
    await expect(page.getByRole('heading', { level: 1, name: 'Work queue' })).toBeVisible();
    await openApplication(page, id);

    await expect(page.getByRole('heading', { level: 1, name: `Application #${id}` })).toBeVisible();
    await expect(page.getByText('******234F')).toBeVisible();
    await expect(page.getByRole('img', { name: /credit score/i })).toBeVisible();
    const approve = page.getByRole('button', { name: 'Approve' });
    await expect(approve).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Reject' })).toBeDisabled();

    await page.getByLabel('Reason').fill('Stable income, documents verified');
    await approve.click();

    await expect(page.getByTestId('resolution')).toContainText('Stable income, documents verified');
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    await assertNoHorizontalScroll(page);
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });

  test('UNDERWRITER overrides an auto-reject through the dialog (E3-S5-AC4)', async ({ page, request }) => {
    const id = await underwrittenApplication(request, '30000.00', { ...CLEAN, prior_default: true });
    const problems = watchProblems(page);
    await uiSignIn(page, UNDERWRITER);
    await expect(page.getByRole('heading', { level: 1, name: 'Work queue' })).toBeVisible();
    await openApplication(page, id);

    await page.getByRole('button', { name: 'Override' }).click();
    const dialog = page.getByRole('dialog', { name: 'Override decision' });
    const submit = dialog.getByRole('button', { name: 'Submit override' });
    await expect(submit).toBeDisabled();
    await dialog.getByLabel('Reason code').selectOption('DATA_CORRECTION');
    await dialog.getByLabel('Comment').fill('Income evidence corrected');
    await submit.click();

    await expect(page.getByText(/override recorded/i)).toBeVisible();
    await expect(page.getByTestId('resolution')).toContainText('Income evidence corrected');
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });

  test('CUSTOMER gets 403 on review and a No access page in the UI (E3-S5-AC5)', async ({ page, request }) => {
    const id = await underwrittenApplication(request, '60000.00', CLEAN);
    const headers = { Authorization: `Bearer ${await apiLogin(request, CUSTOMER)}` };
    const review = await request.post(`/api/applications/${id}/review`, {
      headers,
      data: { outcome: 'APPROVE', reason: 'Trying to approve myself' },
    });
    expect(review.status()).toBe(403);

    const problems = watchProblems(page);
    await uiSignIn(page, CUSTOMER);
    await expect(page.getByRole('heading', { level: 1, name: 'My applications' })).toBeVisible();
    await openApplication(page, id);
    await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });

  test('the review page stacks without horizontal scroll at 375x812', async ({ page, request }) => {
    const id = await underwrittenApplication(request, '60000.00', CLEAN);
    await page.setViewportSize({ width: 375, height: 812 });
    await uiSignIn(page, UNDERWRITER);
    await expect(page.getByRole('heading', { level: 1, name: 'Work queue' })).toBeVisible();
    await openApplication(page, id);
    await expect(page.getByRole('heading', { level: 1, name: `Application #${id}` })).toBeVisible();
    await assertNoHorizontalScroll(page);
  });
});
