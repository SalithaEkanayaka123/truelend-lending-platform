/** Details-step form state with live validation (E2-S4-AC2): a field shows
 * its error as soon as it has a value or has been left. */

import { useCallback, useMemo, useState } from 'react';

import type { ProductRule } from '../types/policy';
import {
  EMPTY_DETAILS,
  validateDetails,
  type DetailsErrors,
  type DetailsField,
  type DetailsForm,
} from './applyForm';

export interface UseDetailsForm {
  form: DetailsForm;
  errors: DetailsErrors;
  visibleErrors: DetailsErrors;
  valid: boolean;
  setField: <K extends keyof DetailsForm>(key: K, value: DetailsForm[K]) => void;
  touch: (field: DetailsField) => void;
}

const TEXT_FIELDS: readonly DetailsField[] = ['amount', 'tenure', 'age', 'income', 'pan', 'aadhaar'];

export function useDetailsForm(rule: ProductRule | null): UseDetailsForm {
  const [form, setForm] = useState<DetailsForm>(EMPTY_DETAILS);
  const [touched, setTouched] = useState<ReadonlySet<DetailsField>>(new Set());

  const errors = useMemo<DetailsErrors>(() => (rule ? validateDetails(form, rule) : {}), [form, rule]);
  const visibleErrors = useMemo<DetailsErrors>(() => {
    const shown: DetailsErrors = {};
    for (const field of TEXT_FIELDS) {
      const message = errors[field];
      if (message && (form[field] !== '' || touched.has(field))) shown[field] = message;
    }
    return shown;
  }, [errors, form, touched]);

  const setField = useCallback(<K extends keyof DetailsForm>(key: K, value: DetailsForm[K]): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);
  const touch = useCallback((field: DetailsField): void => setTouched((prev) => new Set(prev).add(field)), []);

  return { form, errors, visibleErrors, valid: rule !== null && Object.keys(errors).length === 0, setField, touch };
}
