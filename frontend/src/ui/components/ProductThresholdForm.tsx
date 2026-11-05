/** One product's editable threshold fields, pre-filled from `ProductRule`
 * (E4-S2-AC1/AC2). Money/rate fields stay strings end to end (NFR-01);
 * only the integer fields are ever passed through `Number()`. */

import type { ChangeEvent, JSX } from 'react';

import type { FieldErrors } from '../../service/policyValidation';
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
}

const PRODUCT_LABELS: Record<ProductType, string> = {
  PERSONAL: 'Personal',
  VEHICLE: 'Vehicle',
  EDUCATION: 'Education',
};

const FIELD_SPECS: readonly FieldSpec[] = [
  { field: 'min_age', label: 'Min age', kind: 'integer' },
  { field: 'max_age', label: 'Max age', kind: 'integer' },
  { field: 'min_income', label: 'Min income (₹/month)', kind: 'money' },
  { field: 'min_tenure_months', label: 'Min tenure (months)', kind: 'integer' },
  { field: 'max_tenure_months', label: 'Max tenure (months)', kind: 'integer' },
  { field: 'min_amount', label: 'Min amount (₹)', kind: 'money' },
  { field: 'max_amount', label: 'Max amount (₹)', kind: 'money' },
  { field: 'annual_rate_pct', label: 'Annual rate (%)', kind: 'money' },
  { field: 'auto_reject_below_score', label: 'Auto-reject below score', kind: 'integer' },
  { field: 'auto_approve_min_score', label: 'Auto-approve min score', kind: 'integer' },
];

interface ThresholdFieldProps {
  productType: ProductType;
  spec: FieldSpec;
  value: string | number | null;
  errorMessage: string | undefined;
  onChange: (patch: ProductChangePatch) => void;
}

function ThresholdField({ productType, spec, value, errorMessage, onChange }: ThresholdFieldProps): JSX.Element {
  const inputId = `${productType}-${spec.field}`;
  const errorId = `${inputId}-error`;

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const raw = event.target.value;
    onChange({ [spec.field]: spec.kind === 'integer' ? Number(raw) : raw } as ProductChangePatch);
  }

  return (
    <div className={styles.field}>
      <label htmlFor={inputId}>{spec.label}</label>
      <input
        id={inputId}
        type={spec.kind === 'integer' ? 'number' : 'text'}
        inputMode={spec.kind === 'money' ? 'decimal' : undefined}
        value={value ?? ''}
        aria-invalid={errorMessage ? 'true' : undefined}
        aria-describedby={errorMessage ? errorId : undefined}
        onChange={handleChange}
      />
      {errorMessage ? (
        <p id={errorId} role="alert" className={styles.error}>
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

export function ProductThresholdForm({ productType, rule, errors, onChange }: ProductThresholdFormProps): JSX.Element {
  return (
    <div className={styles.productForm} data-product={productType}>
      <h2>{PRODUCT_LABELS[productType]}</h2>
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
