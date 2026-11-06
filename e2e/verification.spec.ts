import { expect, test, type APIRequestContext } from '@playwright/test';

import { apiLogin, assertNoHorizontalScroll, uiSignIn, watchProblems } from './support/roles';

const CUSTOMER = 'customer1@example.test';
const UNDERWRITER = 'underwriter@example.test';

/** Creates a draft with one uploaded ID_PROOF through the API (synthetic data only). */
async function applicationWithUploadedDocument(request: APIRequestContext): Promise<number> {
  const headers = { Authorization: `Bearer ${await apiLogin(request, CUSTOMER)}` };
  const created = await request.post('/api/applications', {
    headers,
    data: {
      product_type: 'PERSONAL',
      requested_amount: '200000.00',
      tenure_months: 24,
      age_years: 30,
      monthly_income: '60000.00',
      credit_flags: { prior_default: false, missed_payment_12m: false, thin_file: false },
      pan: 'ABCDE1234F',
      aadhaar: '123456789012',
    },
  });
  expect(created.status()).toBe(201);
  const id = ((await created.json()) as { id: number }).id;
  const doc = await request.post(`/api/applications/${id}/documents`, {
    headers,
    data: { type: 'ID_PROOF', filename: 'id.png' },
  });
  expect(doc.status()).toBe(201);
  return id;
}

test.describe('Verification queue (E2-S4)', () => {
  test('QA-VM-037: table at 1280x800, cards at 375x812; verifying removes the row with no navigation', async ({ page, request }) => {
    const id = await applicationWithUploadedDocument(request);
    const problems = watchProblems(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await uiSignIn(page, UNDERWRITER);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Verification' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Verification queue' })).toBeVisible();

    await expect(page.getByTestId('queue-table')).toBeVisible();
    await expect(page.getByTestId('queue-cards')).toBeHidden();
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByTestId('queue-cards')).toBeVisible();
    await expect(page.getByTestId('queue-table')).toBeHidden();
    await assertNoHorizontalScroll(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    const urlBefore = page.url();
    const row = page.getByRole('row').filter({ hasText: `#${id}` });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: /^Verify/ }).click();
    const dialog = page.getByRole('dialog', { name: /Verify/ });
    const confirm = dialog.getByRole('button', { name: 'Confirm verify' });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Reason').fill('Document matches the application');
    await expect(dialog.getByTestId('reason-counter')).toHaveText('32/500');
    await confirm.click();

    await expect(page.getByRole('row').filter({ hasText: `#${id}` })).toHaveCount(0);
    expect(page.url()).toBe(urlBefore);
    await expect(page.getByRole('heading', { level: 1, name: 'Verification queue' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });
});
