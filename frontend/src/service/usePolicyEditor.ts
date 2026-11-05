/** Owns the Policy editor's edit/validate/save state (E4-S2-AC2/AC3): seeds
 * one editable `ProductRule` per product from the loaded catalog, tracks
 * both the inline validator's errors and any server-returned field errors,
 * and exposes the single Save handler the page wires to its `<form>`. The
 * backend decides; this hook only mirrors its rules for inline feedback and
 * applies its 422 response when the inline check missed something. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';

import { ApiError } from '../repository/apiClient';
import { buildChangesPayload, countChanges } from './policyChanges';
import { hasFieldErrors, validateProductRule, type FieldErrors } from './policyValidation';
import type { UsePoliciesResult } from './usePolicies';
import { PRODUCT_TYPES } from '../types/policy';
import type { CreatePolicyRequest, ProductChangePatch, ProductRule, ProductType } from '../types/policy';

export type ServerErrors = Partial<Record<ProductType, FieldErrors>>;
type EditedState = Record<ProductType, ProductRule> | null;

const VALIDATION_MESSAGE_RE = /^(\w+)\.(\w+): (.+)$/;

function seedEdited(products: ProductRule[]): EditedState {
  if (products.length < PRODUCT_TYPES.length) return null;
  const record = {} as Record<ProductType, ProductRule>;
  for (const product of products) record[product.product_type] = product;
  return record;
}

function fieldErrorsFor(rule: ProductRule, serverErrors: ServerErrors, productType: ProductType): FieldErrors {
  return { ...serverErrors[productType], ...validateProductRule(rule) };
}

function computeAnyInvalid(edited: EditedState, serverErrors: ServerErrors): boolean {
  if (!edited) return true;
  return PRODUCT_TYPES.some((pt) => hasFieldErrors(fieldErrorsFor(edited[pt], serverErrors, pt)));
}

interface ParsedServerError {
  product: ProductType;
  field: keyof ProductRule;
  detail: string;
}

function parseValidationMessage(message: string): ParsedServerError | null {
  const match = VALIDATION_MESSAGE_RE.exec(message);
  if (!match) return null;
  const [, product, field, detail] = match;
  if (!product || !field || !detail) return null;
  if (!(PRODUCT_TYPES as readonly string[]).includes(product)) return null;
  return { product: product as ProductType, field: field as keyof ProductRule, detail };
}

function mergeServerError(prev: ServerErrors, parsed: ParsedServerError): ServerErrors {
  return { ...prev, [parsed.product]: { ...prev[parsed.product], [parsed.field]: parsed.detail } };
}

function useEditedState(products: ProductRule[]): {
  edited: EditedState;
  originals: EditedState;
  onFieldChange: (productType: ProductType, patch: ProductChangePatch) => void;
  markSaved: (saved: Record<ProductType, ProductRule>) => void;
} {
  const [edited, setEdited] = useState<EditedState>(null);
  const [originals, setOriginals] = useState<EditedState>(null);

  useEffect(() => {
    if (edited !== null || products.length === 0) return;
    const seeded = seedEdited(products);
    if (seeded) {
      setOriginals(seeded);
      setEdited(seeded);
    }
  }, [products, edited]);

  const onFieldChange = useCallback((productType: ProductType, patch: ProductChangePatch): void => {
    setEdited((prev) => (prev ? { ...prev, [productType]: { ...prev[productType], ...patch } } : prev));
  }, []);

  return { edited, originals, onFieldChange, markSaved: setOriginals };
}

function applySubmitError(
  err: unknown,
  setServerErrors: Dispatch<SetStateAction<ServerErrors>>,
  setTopError: Dispatch<SetStateAction<string | null>>,
): void {
  if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
    const parsed = parseValidationMessage(err.message);
    if (parsed) {
      setServerErrors((prev) => mergeServerError(prev, parsed));
      return;
    }
    setTopError(err.message);
    return;
  }
  setTopError(err instanceof Error ? err.message : 'Failed to save the policy draft.');
}

/** Resolves `true` when the draft was created, `false` when the save failed. */
async function submitDraft(
  changes: CreatePolicyRequest['changes'],
  createDraft: UsePoliciesResult['createDraft'],
  setBanner: Dispatch<SetStateAction<string | null>>,
  setServerErrors: Dispatch<SetStateAction<ServerErrors>>,
  setTopError: Dispatch<SetStateAction<string | null>>,
): Promise<boolean> {
  try {
    const created = await createDraft(changes);
    setBanner(`Draft v${created.version}`);
    setServerErrors({});
    return true;
  } catch (err) {
    applySubmitError(err, setServerErrors, setTopError);
    return false;
  }
}

function useDraftSubmit(
  edited: EditedState,
  originals: EditedState,
  createDraft: UsePoliciesResult['createDraft'],
  markSaved: (saved: Record<ProductType, ProductRule>) => void,
): {
  submitting: boolean;
  topError: string | null;
  banner: string | null;
  serverErrors: ServerErrors;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
} {
  const [submitting, setSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<ServerErrors>({});

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      if (!edited || !originals) return;
      setSubmitting(true);
      setTopError(null);
      submitDraft(buildChangesPayload(originals, edited), createDraft, setBanner, setServerErrors, setTopError)
        .then((saved) => {
          if (saved) markSaved(edited);
        })
        .finally(() => setSubmitting(false));
    },
    [edited, originals, createDraft, markSaved],
  );

  return { submitting, topError, banner, serverErrors, onSubmit };
}

export interface UsePolicyEditorResult {
  edited: Record<ProductType, ProductRule> | null;
  versions: UsePoliciesResult['versions'];
  submitting: boolean;
  topError: string | null;
  banner: string | null;
  anyInvalid: boolean;
  /** Editable fields that differ from the last loaded or saved values. */
  changeCount: number;
  errorsFor: (productType: ProductType) => FieldErrors;
  onFieldChange: (productType: ProductType, patch: ProductChangePatch) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function usePolicyEditor(policies: UsePoliciesResult): UsePolicyEditorResult {
  const { products, versions, createDraft } = policies;
  const { edited, originals, onFieldChange, markSaved } = useEditedState(products);
  const { submitting, topError, banner, serverErrors, onSubmit } = useDraftSubmit(
    edited,
    originals,
    createDraft,
    markSaved,
  );

  const anyInvalid = useMemo(() => computeAnyInvalid(edited, serverErrors), [edited, serverErrors]);
  const changeCount = useMemo(
    () => (edited && originals ? countChanges(originals, edited) : 0),
    [edited, originals],
  );
  const errorsFor = useCallback(
    (productType: ProductType): FieldErrors => (edited ? fieldErrorsFor(edited[productType], serverErrors, productType) : {}),
    [edited, serverErrors],
  );

  return { edited, versions, submitting, topError, banner, anyInvalid, changeCount, errorsFor, onFieldChange, onSubmit };
}
