import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { apiLogin, assertNoHorizontalScroll, gotoClient, uiSignIn, watchProblems } from './support/roles';

const CUSTOMER = 'customer1@example.test';
const UNDERWRITER = 'underwriter@example.test';
const DOCS = [
  { type: 'ID_PROOF', filename: 'id.png' },
  { type: 'ADDRESS_PROOF', filename: 'addr.png' },
  { type: 'SALARY_SLIP', filename: 'slip.png' },
];
const CLEAN = { prior_default: false, missed_payment_12m: false, thin_file: false };

interface Stored {
  score: number;
  policy_version: number;
  reason_codes: { code: string; message: string }[];
}

/** Creates, submits and underwrites an application through the API (synthetic data only). */
async function underwritten(request: APIRequestContext, income: string, flags: Record<string, boolean>): Promise<number> {
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

async function storedDecision(request: APIRequestContext, id: number): Promise<Stored> {
  const headers = { Authorization: `Bearer ${await apiLogin(request, UNDERWRITER)}` };
  const response = await request.get(`/api/applications/${id}/decision`, { headers });
  expect(response.status()).toBe(200);
  return (await response.json()) as Stored;
}

async function openAsUnderwriter(page: Page, id: number): Promise<void> {
  await uiSignIn(page, UNDERWRITER);
  await expect(page.getByRole('heading', { level: 1, name: 'Work queue' })).toBeVisible();
  await gotoClient(page, `/applications/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: `Application #${id}` })).toBeVisible();
}

test.describe('Decision review and override UI (E3-S6)', () => {
  // tags: E3-S6-AC1
  test('QA-VM-062: decision panel shows score 680, reason code message and policy version; panels stack at 375x812', async ({ page, request }) => {
    const id = await underwritten(request, '60000.00', CLEAN);
    const stored = await storedDecision(request, id);
    expect(stored.score).toBe(680);
    const problems = watchProblems(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await openAsUnderwriter(page, id);

    const panel = page.getByRole('region', { name: 'Decision' });
    await expect(panel.getByRole('img', { name: /credit score/i })).toContainText('680');
    await expect(panel.getByText(`policy v${stored.policy_version}`)).toBeVisible();
    for (const reason of stored.reason_codes) {
      await expect(panel.getByText(reason.code, { exact: true })).toBeVisible();
      await expect(panel.getByText(reason.message, { exact: true })).toBeVisible();
    }
    await assertNoHorizontalScroll(page);
    const tops = await page.evaluate(() =>
      ['applicant-title', 'documents-title', 'decision-title'].map((n) => document.getElementById(n)?.getBoundingClientRect().top ?? -1),
    );
    expect(tops[0]).toBeLessThan(tops[1] ?? 0);
    expect(tops[1]).toBeLessThan(tops[2] ?? 0);
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });

  // tags: E3-S6-AC2
  test('QA-VM-063: override Submit stays disabled until a reason code and a comment are set, then confirms', async ({ page, request }) => {
    const id = await underwritten(request, '30000.00', { ...CLEAN, prior_default: true });
    const problems = watchProblems(page);
    await openAsUnderwriter(page, id);
    await page.getByRole('button', { name: 'Override' }).click();
    const dialog = page.getByRole('dialog', { name: 'Override decision' });
    const submit = dialog.getByRole('button', { name: 'Submit override' });

    await expect(submit).toBeDisabled();
    await dialog.getByLabel('Comment').fill('Income evidence corrected');
    await expect(submit).toBeDisabled();
    await dialog.getByLabel('Comment').fill('');
    await dialog.getByLabel('Reason code').selectOption('DATA_CORRECTION');
    await expect(submit).toBeDisabled();
    await dialog.getByLabel('Comment').fill('Income evidence corrected');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText(/override recorded/i)).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });

  // tags: E3-S6-AC3
  test('QA-VM-064: manual review Approve and Reject are disabled while the reason is empty, at 375, 768 and 1280', async ({ page, request }) => {
    const id = await underwritten(request, '60000.00', CLEAN);
    const problems = watchProblems(page);
    await openAsUnderwriter(page, id);
    for (const width of [1280, 768, 375]) {
      await page.setViewportSize({ width, height: 812 });
      await expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Reject' })).toBeDisabled();
      await assertNoHorizontalScroll(page);
    }
    await page.getByLabel('Reason').fill('   ');
    await expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled();
    await page.getByLabel('Reason').fill('Documents verified');
    await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Reject' })).toBeEnabled();
    expect(problems).toEqual([]);
  });

  // tags: E3-S6-AC1
  test('QA-VM-062b: an unknown application shows an error state, not a blank page', async ({ page }) => {
    const problems = watchProblems(page);
    await uiSignIn(page, UNDERWRITER);
    await expect(page.getByRole('heading', { level: 1, name: 'Work queue' })).toBeVisible();
    await gotoClient(page, '/applications/999999');
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
    expect(problems.filter((p) => !p.includes('404'))).toEqual([]);
  });
});
