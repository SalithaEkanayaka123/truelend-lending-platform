/** Apply step 2 (S-A-3): amount, tenure, age, income, three credit-flag
 * toggles, PAN and Aadhaar. Range hints sit under each field and errors show
 * live (E2-S4-AC2). Validation here is feedback only; the API decides. */

import type { JSX } from 'react';

import { ageHint, amountHint, tenureHint } from '../../service/applyForm';
import type { UseDetailsForm } from '../../service/useDetailsForm';
import type { ProductRule } from '../../types/policy';
import styles from './DetailsStep.module.css';
import { FormField } from './FormField';

export interface DetailsStepProps {
  details: UseDetailsForm;
  rule: ProductRule;
}

const FLAGS = [
  ['priorDefault', 'I have defaulted on a loan before'],
  ['missedPayment', 'I missed a payment in the last 12 months'],
  ['thinFile', 'I have little or no credit history'],
] as const;

function Flags({ details }: { details: UseDetailsForm }): JSX.Element {
  return (
    <fieldset className={styles.flags}>
      <legend className={styles.legend}>Credit history</legend>
      {FLAGS.map(([key, label]) => (
        <label key={key} className={styles.flag}>
          <input type="checkbox" checked={details.form[key]} onChange={(e) => details.setField(key, e.target.checked)} />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

function Amounts({ details, rule }: DetailsStepProps): JSX.Element {
  const { form, visibleErrors: errors, setField, touch } = details;
  return (
    <>
      <FormField label="Loan amount (INR)" value={form.amount} inputMode="decimal" hint={amountHint(rule)}
        error={errors.amount} onChange={(v) => setField('amount', v)} onBlur={() => touch('amount')} />
      <FormField label="Tenure (months)" value={form.tenure} inputMode="numeric" hint={tenureHint(rule)}
        error={errors.tenure} onChange={(v) => setField('tenure', v)} onBlur={() => touch('tenure')} />
      <FormField label="Age (years)" value={form.age} inputMode="numeric" hint={ageHint(rule)}
        error={errors.age} onChange={(v) => setField('age', v)} onBlur={() => touch('age')} />
      <FormField label="Monthly income (INR)" value={form.income} inputMode="decimal"
        error={errors.income} onChange={(v) => setField('income', v)} onBlur={() => touch('income')} />
    </>
  );
}

function Identity({ details }: { details: UseDetailsForm }): JSX.Element {
  const { form, visibleErrors: errors, setField, touch } = details;
  return (
    <>
      <FormField label="PAN" value={form.pan} maxLength={10} hint="Format ABCDE1234F"
        error={errors.pan} onChange={(v) => setField('pan', v.toUpperCase())} onBlur={() => touch('pan')} />
      <FormField label="Aadhaar" value={form.aadhaar} inputMode="numeric" maxLength={12} hint="12 digits"
        error={errors.aadhaar} onChange={(v) => setField('aadhaar', v)} onBlur={() => touch('aadhaar')} />
    </>
  );
}

export function DetailsStep({ details, rule }: DetailsStepProps): JSX.Element {
  return (
    <div className={styles.grid}>
      <Amounts details={details} rule={rule} />
      <Flags details={details} />
      <Identity details={details} />
    </div>
  );
}
