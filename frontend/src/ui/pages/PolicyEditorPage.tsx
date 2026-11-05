/** Policy editor screen (S-M-4): one collapsible `ProductSection` per product
 * pre-filled from the base version, inline validation, a sticky action bar
 * (Save is disabled until something changed, E4-S2-AC2), a "Draft v{N}" toast
 * after a successful save (E4-S2-AC3), and the versions as a timeline.
 * Approving a version is an ADMIN-only action, out of this screen's scope. */

import type { JSX } from 'react';

import { useDismissable } from '../../service/useDismissable';
import { usePolicies, type UsePoliciesResult } from '../../service/usePolicies';
import { usePolicyEditor, type UsePolicyEditorResult } from '../../service/usePolicyEditor';
import { PRODUCT_TYPES } from '../../types/policy';
import { ActionBar } from '../components/ActionBar';
import { ErrorState } from '../components/ErrorState';
import { FullPageState } from '../components/FullPageState';
import { ProductSection } from '../components/ProductSection';
import { ProductThresholdForm } from '../components/ProductThresholdForm';
import { Toast } from '../components/Toast';
import { VersionTimeline } from '../components/VersionTimeline';
import styles from './PolicyEditorPage.module.css';

function EditorForm({ editor }: { editor: UsePolicyEditorResult }): JSX.Element {
  const edited = editor.edited;
  if (!edited) return <p aria-busy="true">Loading policy catalog…</p>;
  return (
    <form className={styles.form} onSubmit={editor.onSubmit}>
      {PRODUCT_TYPES.map((pt) => (
        <ProductSection
          key={pt}
          productType={pt}
          rule={edited[pt]}
          errorCount={Object.keys(editor.errorsFor(pt)).length}
          defaultOpen={pt === PRODUCT_TYPES[0]}
        >
          <ProductThresholdForm
            productType={pt}
            rule={edited[pt]}
            errors={editor.errorsFor(pt)}
            onChange={(patch) => editor.onFieldChange(pt, patch)}
          />
        </ProductSection>
      ))}
      <ActionBar changeCount={editor.changeCount} invalid={editor.anyInvalid} submitting={editor.submitting} />
    </form>
  );
}

function Toasts({ banner, error }: { banner: string | null; error: string | null }): JSX.Element {
  const [success, dismissSuccess] = useDismissable(banner);
  const [failure, dismissFailure] = useDismissable(error);
  return (
    <div className={styles.toasts}>
      {success ? <Toast kind="success" message={success} onDismiss={dismissSuccess} /> : null}
      {failure ? <Toast kind="error" message={failure} onDismiss={dismissFailure} /> : null}
    </div>
  );
}

/** A failed catalog load: a friendly No access for 403, otherwise an inline
 * error card with the reference and Retry -- never a blank page. */
function LoadFailure({ policies }: { policies: UsePoliciesResult }): JSX.Element {
  if (policies.loadError?.code === 'FORBIDDEN') {
    return <FullPageState title="No access" message="Your role cannot open this page." />;
  }
  return (
    <main className={styles.main}>
      <ErrorState
        message={policies.error ?? 'Failed to load the policy catalog.'}
        correlationId={policies.loadError?.correlationId}
        onRetry={policies.reload}
      />
    </main>
  );
}

export function PolicyEditorPage(): JSX.Element {
  const policies = usePolicies();
  const editor = usePolicyEditor(policies);

  if (policies.loading) return <p aria-busy="true">Loading policy catalog…</p>;
  if (policies.error) return <LoadFailure policies={policies} />;

  return (
    <main className={styles.main}>
      <header className={styles.pageHead}>
        <h1 id="editor-heading">Policy editor</h1>
        <p className={styles.lead}>Adjust underwriting thresholds by product. Saving creates a new draft version.</p>
      </header>
      <div className={styles.layout}>
        <section aria-labelledby="editor-heading" className={styles.editor}>
          <EditorForm editor={editor} />
        </section>
        <aside className={styles.card} aria-labelledby="versions-heading">
          <h2 id="versions-heading" className={styles.cardTitle}>
            Versions
          </h2>
          <VersionTimeline versions={policies.versions} />
        </aside>
      </div>
      <Toasts banner={editor.banner} error={editor.topError} />
    </main>
  );
}
