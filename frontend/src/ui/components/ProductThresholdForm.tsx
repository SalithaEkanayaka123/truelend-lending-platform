/** One product's editable threshold fields, pre-filled from `ProductRule`
 * (E4-S2-AC1/AC2). Money/rate fields stay strings end to end (NFR-01); only
 * the integer fields are ever passed through `Number()`. Units are shown as
 * adornments (₹ prefix, "months" and "%" suffixes) and money gets a grouped
 * preview beneath the input; the input's own value is never reformatted. The
 * product heading lives in `ProductSection`, which wraps this form. */

import type { ChangeEvent, JSX } from 'react';

import type { FieldErrors } from '../../service/policyValidation';
import { formatRupees } from '../../service/formatMoney';
import type { EditableProductField, ProductChangePatch, ProductRule, ProductType } from '../../types/policy';
import styles from './ProductThresholdForm.module.css';

export interface ProductThresholdFormProps {
  productType: ProductType;
  rule: ProductRule;
  errors: FieldErrors;
  onChange: (patch: ProductChangePatch) => void;
}

interface FieldSpec {
  field: EditableProductField;
  label: string;
  kind: 'integer' | 'money';
  /** Money in rupees: shows a ₹ prefix and a grouped preview. */
  currency?: boolean;
  suffix?: string;
}

const FIELD_SPECS: readonly FieldSpec[] = [
  { field: 'min_age', label: 'Min age', kind: 'integer' },
  { field: 'max_age', label: 'Max age', kind: 'integer' },
  { field: 'min_income', label: 'Min income', kind: 'money', currency: true, suffix: 'per month' },
  { field: 'min_tenure_months', label: 'Min tenure', kind: 'integer', suffix: 'months' },
  { field: 'max_tenure_months', label: 'Max tenure', kind: 'integer', suffix: 'months' },
  { field: 'min_amount', label: 'Min amount', kind: 'money', currency: true },
  { field: 'max_amount', label: 'Max amount', kind: 'money', currency: true },
  { field: 'annual_rate_pct', label: 'Annual rate', kind: 'money', suffix: '%' },
  { field: 'auto_reject_below_score', label: 'Auto-reject below score', kind: 'integer' },
  { field: 'auto_approve_min_score', label: 'Auto-approve min score', kind: 'integer' },
];

interface FieldIds {
  input: string;
  unit: string;
  hint: string;
  error: string;
}

function idsFor(productType: ProductType, field: EditableProductField): FieldIds {
  const input = `${productType}-${field}`;
  return { input, unit: `${input}-unit`, hint: `${input}-hint`, error: `${input}-error` };
}

function describedBy(ids: (string | false | undefined)[]): string | undefined {
  const joined = ids.filter(Boolean).join(' ');
  return joined === '' ? undefined : joined;
}

interface FieldControlProps {
  spec: FieldSpec;
  ids: FieldIds;
  value: string | number | null;
  hasHint: boolean;
  invalid: boolean;
  onChange: (patch: ProductChangePatch) => void;
}

function FieldControl({ spec, ids, value, hasHint, invalid, onChange }: FieldControlProps): JSX.Element {
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const raw = event.target.value;
    onChange({ [spec.field]: spec.kind === 'integer' ? Number(raw) : raw } as ProductChangePatch);
  }

  return (
    <div className={styles.control} data-invalid={invalid ? 'true' : undefined}>
      {spec.currency ? <span className={styles.prefix}>₹</span> : null}
      <input
        id={ids.input}
        type={spec.kind === 'integer' ? 'number' : 'text'}
        inputMode={spec.kind === 'money' ? 'decimal' : undefined}
        value={value ?? ''}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={describedBy([spec.suffix && ids.unit, hasHint && ids.hint, invalid && ids.error])}
        onChange={handleChange}
      />
      {spec.suffix ? (
        <span id={ids.unit} className={styles.suffix}>
          {spec.suffix}
        </span>
      ) : null}
    </div>
  );
}

function FieldMessages({ ids, preview, error }: { ids: FieldIds; preview: string; error?: string }): JSX.Element {
  return (
    <>
      {preview ? (
        <p id={ids.hint} className={styles.hint}>
          {preview}
        </p>
      ) : null}
      {error ? (
        <p id={ids.error} role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </>
  );
}

interface ThresholdFieldProps {
  productType: ProductType;
  spec: FieldSpec;
  value: string | number | null;
  errorMessage: string | undefined;
  onChange: (patch: ProductChangePatch) => void;
}

function ThresholdField({ productType, spec, value, errorMessage, onChange }: ThresholdFieldProps): JSX.Element {
  const ids = idsFor(productType, spec.field);
  const preview = spec.currency && value !== null && value !== '' ? formatRupees(String(value)) : '';
  return (
    <div className={styles.field} data-field={spec.field}>
      <label htmlFor={ids.input}>{spec.label}</label>
      <FieldControl
        spec={spec}
        ids={ids}
        value={value}
        hasHint={preview !== ''}
        invalid={errorMessage !== undefined}
        onChange={onChange}
      />
      <FieldMessages ids={ids} preview={preview} error={errorMessage} />
    </div>
  );
}

export function ProductThresholdForm({ productType, rule, errors, onChange }: ProductThresholdFormProps): JSX.Element {
  return (
    <div className={styles.productForm} data-product={productType}>
      <div className={styles.fieldGrid}>
        {FIELD_SPECS.map((spec) => (
          <ThresholdField
            key={spec.field}
            productType={productType}
            spec={spec}
            value={rule[spec.field]}
            errorMessage={errors[spec.field]}
            onChange={onChange}
          />
        ))}
      </div>
      <div className={styles.docChips}>
        {rule.required_documents.map((doc) => (
          <span key={doc} className={styles.chip}>
            {doc}
          </span>
        ))}
      </div>
    </div>
  );
}
