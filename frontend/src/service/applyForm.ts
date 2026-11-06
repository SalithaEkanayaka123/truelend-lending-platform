/** Details-step form model and inline validation (E2-S4, ui_spec S-A-3).
 * Mirrors the product ranges for instant feedback only; the API stays the
 * authority. Money is compared as integer paise from strings (NFR-01). */

import type { CreateApplicationRequest } from '../types/apply';
import type { ProductRule } from '../types/policy';
import { formatRupees } from './formatMoney';
import { moneyToMinorUnits } from './policyValidation';

export interface DetailsForm {
  amount: string;
  tenure: string;
  age: string;
  income: string;
  priorDefault: boolean;
  missedPayment: boolean;
  thinFile: boolean;
  pan: string;
  aadhaar: string;
}

export type DetailsField = 'amount' | 'tenure' | 'age' | 'income' | 'pan' | 'aadhaar';
export type DetailsErrors = Partial<Record<DetailsField, string>>;

export const EMPTY_DETAILS: DetailsForm = {
  amount: '',
  tenure: '',
  age: '',
  income: '',
  priorDefault: false,
  missedPayment: false,
  thinFile: false,
  pan: '',
  aadhaar: '',
};

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const WHOLE_RE = /^\d+$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR_RE = /^\d{12}$/;

/** "50000" -> "50000.00", "50000.5" -> "50000.50" (string work only). */
export function toWireMoney(value: string): string {
  const [whole = '', fraction = ''] = value.trim().split('.');
  return `${whole}.${(fraction + '00').slice(0, 2)}`;
}

export function tenureHint(rule: ProductRule): string {
  return `${rule.min_tenure_months}-${rule.max_tenure_months} months`;
}

export function ageHint(rule: ProductRule): string {
  return `${rule.min_age}-${rule.max_age} years`;
}

export function amountHint(rule: ProductRule): string {
  return `${formatRupees(rule.min_amount)} to ${formatRupees(rule.max_amount)}`;
}

function inRange(value: string, min: number, max: number): boolean {
  return WHOLE_RE.test(value) && Number(value) >= min && Number(value) <= max;
}

function amountError(value: string, rule: ProductRule): string | undefined {
  if (value === '') return 'Enter the amount you need.';
  if (!MONEY_RE.test(value)) return 'Use digits with up to 2 decimals.';
  const paise = moneyToMinorUnits(toWireMoney(value));
  if (paise < moneyToMinorUnits(rule.min_amount) || paise > moneyToMinorUnits(rule.max_amount)) {
    return `Amount must be ${amountHint(rule)}.`;
  }
  return undefined;
}

function incomeError(value: string): string | undefined {
  if (value === '') return 'Enter your monthly income.';
  return MONEY_RE.test(value) ? undefined : 'Use digits with up to 2 decimals.';
}

export function validateDetails(form: DetailsForm, rule: ProductRule): DetailsErrors {
  const errors: DetailsErrors = {};
  const set = (field: DetailsField, message: string | undefined): void => {
    if (message) errors[field] = message;
  };
  set('amount', amountError(form.amount, rule));
  if (!inRange(form.tenure, rule.min_tenure_months, rule.max_tenure_months)) {
    set('tenure', `Tenure must be ${tenureHint(rule)}.`);
  }
  if (!inRange(form.age, rule.min_age, rule.max_age)) set('age', `Age must be ${ageHint(rule)}.`);
  set('income', incomeError(form.income));
  if (!PAN_RE.test(form.pan)) set('pan', 'PAN looks like ABCDE1234F.');
  if (!AADHAAR_RE.test(form.aadhaar)) set('aadhaar', 'Aadhaar is 12 digits.');
  return errors;
}

export function toRequest(form: DetailsForm, rule: ProductRule): CreateApplicationRequest {
  return {
    product_type: rule.product_type,
    requested_amount: toWireMoney(form.amount),
    tenure_months: Number(form.tenure),
    age_years: Number(form.age),
    monthly_income: toWireMoney(form.income),
    credit_flags: {
      prior_default: form.priorDefault,
      missed_payment_12m: form.missedPayment,
      thin_file: form.thinFile,
    },
    pan: form.pan,
    aadhaar: form.aadhaar,
  };
}
