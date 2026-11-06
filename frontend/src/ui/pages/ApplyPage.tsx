/** Apply wizard (S-A-2..S-A-4): Product, Details, Documents and submit, one
 * step at a time with a progress indicator. After submit the API underwrites
 * and the page routes to the tracker for the new application. */

import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApplyWizard, type UseApplyWizard } from '../../service/useApplyWizard';
import { DetailsStep } from '../components/DetailsStep';
import { DocumentsStep } from '../components/DocumentsStep';
import { ErrorState } from '../components/ErrorState';
import { ProductStep } from '../components/ProductStep';
import { StepProgress } from '../components/StepProgress';
import controls from '../components/controls.module.css';
import styles from './ApplyPage.module.css';

function Body({ wizard }: { wizard: UseApplyWizard }): JSX.Element | null {
  const { products, step, rule, details, draft } = wizard;
  const navigate = useNavigate();
  if (step === 0 && products.data) {
    return <ProductStep products={products.data} selected={rule?.product_type ?? null} onSelect={wizard.selectProduct} />;
  }
  if (step === 1 && rule) return <DetailsStep details={details} rule={rule} />;
  if (step === 2 && draft.application) {
    const submit = async (): Promise<void> => {
      const id = await draft.submit();
      if (id !== null) navigate(`/applications/${id}`);
    };
    return (
      <DocumentsStep
        application={draft.application}
        busy={draft.busy}
        highlightMissing={draft.highlightMissing}
        onUpload={(type) => void draft.upload(type)}
        onSubmit={() => void submit()}
      />
    );
  }
  return null;
}

function Nav({ wizard }: { wizard: UseApplyWizard }): JSX.Element | null {
  if (wizard.step === 2) return null;
  return (
    <div className={styles.nav}>
      {wizard.step === 1 && !wizard.draft.application ? (
        <button type="button" className={controls.secondary} onClick={wizard.back}>
          Back
        </button>
      ) : null}
      <button type="button" className={controls.primary} disabled={!wizard.canContinue} onClick={() => void wizard.next()}>
        Continue
      </button>
    </div>
  );
}

function Status({ wizard }: { wizard: UseApplyWizard }): JSX.Element | null {
  const { products, draft } = wizard;
  if (products.loading) return <div className={controls.skeleton} aria-busy="true" aria-label="Loading products" />;
  if (products.error) return <ErrorState message={products.error.message} correlationId={products.error.correlationId} onRetry={products.reload} />;
  if (draft.error) return <ErrorState message={draft.error.message} correlationId={draft.error.correlationId} />;
  return null;
}

export function ApplyPage(): JSX.Element {
  const wizard = useApplyWizard();
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Apply for a loan</h1>
      <StepProgress current={wizard.step} />
      <div className={styles.step}>
        <Status wizard={wizard} />
        <Body wizard={wizard} />
      </div>
      <Nav wizard={wizard} />
    </main>
  );
}
