/** Policy editor screen (S-M-4): one `ProductThresholdForm` per product,
 * pre-filled from the base version, Save disabled while any product has an
 * inline validation error (E4-S2-AC2), and a "Draft v{N}" confirmation with
 * an updated version list after a successful save (E4-S2-AC3). Approving a
 * version is an ADMIN-only action, out of this screen's scope. */

import type { JSX } from 'react';

import { usePolicies } from '../../service/usePolicies';
import { usePolicyEditor, type UsePolicyEditorResult } from '../../service/usePolicyEditor';
import { PRODUCT_TYPES } from '../../types/policy';
import type { PolicyVersion } from '../../types/policy';
import { ProductThresholdForm } from '../components/ProductThresholdForm';
import styles from './PolicyEditorPage.module.css';

function EditorForm({ editor }: { editor: UsePolicyEditorResult }): JSX.Element {
  if (!editor.edited) return <p aria-busy="true">Loading policy catalog…</p>;
  const edited = editor.edited;
  return (
    <form onSubmit={editor.onSubmit}>
      {editor.topError ? <p role="alert">{editor.topError}</p> : null}
      <div className={styles.productForms}>
        {PRODUCT_TYPES.map((pt) => (
          <ProductThresholdForm
            key={pt}
            productType={pt}
            rule={edited[pt]}
            errors={editor.errorsFor(pt)}
            onChange={(patch) => editor.onFieldChange(pt, patch)}
          />
        ))}
      </div>
      <div className={styles.saveRow}>
        <button type="submit" className={styles.saveBtn} disabled={editor.anyInvalid || editor.submitting}>
          {editor.submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
      {editor.banner ? (
        <p role="status" aria-live="polite" className={styles.banner}>
          {editor.banner}
        </p>
      ) : null}
    </form>
  );
}

function VersionList({ versions }: { versions: PolicyVersion[] }): JSX.Element {
  if (versions.length === 0) {
    return <p className={styles.emptyState}>No policy versions.</p>;
  }
  return (
    <ul className={styles.versionList}>
      {versions.map((version) => (
        <li key={version.version}>
          <span>{`v${version.version}`}</span>
          <span className={version.status === 'APPROVED' ? styles.badgeSuccess : styles.badgeInfo}>
            {version.status === 'APPROVED' ? 'Approved' : 'Draft'}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PolicyEditorPage(): JSX.Element {
  const policies = usePolicies();
  const editor = usePolicyEditor(policies);

  if (policies.loading) return <p aria-busy="true">Loading policy catalog…</p>;
  if (policies.error) return <p role="alert">{policies.error}</p>;

  return (
    <main className={styles.main}>
      <section className={styles.card} aria-labelledby="editor-heading">
        <h1 id="editor-heading">Policy editor</h1>
        <EditorForm editor={editor} />
      </section>
      <aside className={styles.card} aria-labelledby="versions-heading">
        <h2 id="versions-heading">Versions</h2>
        <VersionList versions={policies.versions} />
      </aside>
    </main>
  );
}
