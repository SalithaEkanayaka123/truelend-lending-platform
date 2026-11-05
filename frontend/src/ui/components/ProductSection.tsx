/** A collapsible product card for the Policy editor: a heading button, a live
 * one-line summary (rate and amount range, from the edited values) and the
 * form body. The body stays in the document when collapsed, so edits and
 * validation survive; a card with errors is held open so a problem is never
 * hidden behind a closed header. */

import { useId, useState, type JSX, type ReactNode } from 'react';

import { groupThousands } from '../../service/formatMoney';
import type { ProductRule, ProductType } from '../../types/policy';
import styles from './ProductSection.module.css';

export interface ProductSectionProps {
  productType: ProductType;
  rule: ProductRule;
  errorCount: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

const LABELS: Record<ProductType, string> = {
  PERSONAL: 'Personal',
  VEHICLE: 'Vehicle',
  EDUCATION: 'Education',
};

function summaryOf(rule: ProductRule): string {
  const range = `₹${groupThousands(rule.min_amount)} – ₹${groupThousands(rule.max_amount)}`;
  return `${rule.annual_rate_pct}% p.a. · ${range}`;
}

function Chevron(): JSX.Element {
  return (
    <svg className={styles.chevron} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Issues({ count }: { count: number }): JSX.Element | null {
  if (count === 0) return null;
  return <span className={styles.issues}>{count === 1 ? '1 issue' : `${count} issues`}</span>;
}

interface SectionHeaderProps {
  productType: ProductType;
  summary: string;
  errorCount: number;
  expanded: boolean;
  bodyId: string;
  onToggle: () => void;
}

function SectionHeader({ productType, summary, errorCount, expanded, bodyId, onToggle }: SectionHeaderProps): JSX.Element {
  const summaryId = useId();
  return (
    <div className={styles.header}>
      <h2 className={styles.heading}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-describedby={summaryId}
          onClick={onToggle}
        >
          {LABELS[productType]}
          <Chevron />
        </button>
      </h2>
      <p id={summaryId} className={styles.summary}>
        {summary}
      </p>
      <Issues count={errorCount} />
    </div>
  );
}

export function ProductSection({ productType, rule, errorCount, defaultOpen = false, children }: ProductSectionProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const expanded = open || errorCount > 0;
  return (
    <section className={styles.card} data-product={productType} data-invalid={errorCount > 0 ? 'true' : undefined}>
      <SectionHeader
        productType={productType}
        summary={summaryOf(rule)}
        errorCount={errorCount}
        expanded={expanded}
        bodyId={bodyId}
        onToggle={() => setOpen((prev) => !prev)}
      />
      <div id={bodyId} className={styles.body} hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
