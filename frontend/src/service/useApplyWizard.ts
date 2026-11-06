/** Three-step apply wizard (E2-S4): Product, Details, Documents and submit.
 * One step at a time. Continue on Details creates the DRAFT; after that the
 * details are locked and the flow only moves forward. */

import { useCallback, useState } from 'react';

import * as policiesRepo from '../repository/policiesRepo';
import type { ProductRule, ProductType } from '../types/policy';
import { toRequest } from './applyForm';
import { useDetailsForm, type UseDetailsForm } from './useDetailsForm';
import { useDraftFlow, type UseDraftFlow } from './useDraftFlow';
import { useLoad, type UseLoadResult } from './useLoad';

export type WizardStep = 0 | 1 | 2;

export interface UseApplyWizard {
  products: UseLoadResult<ProductRule[]>;
  step: WizardStep;
  rule: ProductRule | null;
  details: UseDetailsForm;
  draft: UseDraftFlow;
  canContinue: boolean;
  selectProduct: (type: ProductType) => void;
  back: () => void;
  next: () => Promise<void>;
}

const loadProducts = (): Promise<ProductRule[]> => policiesRepo.listProducts();

export function useApplyWizard(): UseApplyWizard {
  const products = useLoad(loadProducts);
  const [step, setStep] = useState<WizardStep>(0);
  const [productType, setProductType] = useState<ProductType | null>(null);
  const rule = products.data?.find((p) => p.product_type === productType) ?? null;
  const details = useDetailsForm(rule);
  const draft = useDraftFlow();
  const { create } = draft;
  const { form } = details;

  const next = useCallback(async (): Promise<void> => {
    if (step === 0 && rule) setStep(1);
    if (step === 1 && rule && (await create(toRequest(form, rule)))) setStep(2);
  }, [step, rule, create, form]);
  const back = useCallback((): void => setStep((s) => (s === 1 ? 0 : s)), []);
  const canContinue = step === 0 ? rule !== null : step === 1 && details.valid && !draft.busy;

  return { products, step, rule, details, draft, canContinue, selectProduct: setProductType, back, next };
}
