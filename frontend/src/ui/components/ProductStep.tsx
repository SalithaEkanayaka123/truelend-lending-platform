/** Apply step 1 (S-A-2): one card per product with rate, amount range,
 * tenure range and required documents. The selected card is outlined. */

import type { JSX } from 'react';

import { amountHint, tenureHint } from '../../service/applyForm';
import type { ProductRule, ProductType } from '../../types/policy';
import styles from './ProductStep.module.css';
import { statusLabel } from './StatusBadge';

export interface ProductStepProps {
  products: ProductRule[];
  selected: ProductType | null;
  onSelect: (type: ProductType) => void;
}

function ProductCard({ rule, selected, onSelect }: { rule: ProductRule; selected: boolean; onSelect: () => void }): JSX.Element {
  return (
    <label className={`${styles.card} ${selected ? styles.selected : ''}`}>
      <input type="radio" name="product" className={styles.radio} checked={selected} onChange={onSelect} />
      <span className={styles.name}>{statusLabel(rule.product_type)}</span>
      <span className={styles.rate}>{`${rule.annual_rate_pct}% a year`}</span>
      <span className={styles.row}>{`Amount ${amountHint(rule)}`}</span>
      <span className={styles.row}>{`Tenure ${tenureHint(rule)}`}</span>
      <span className={styles.row}>{`Documents: ${rule.required_documents.map(statusLabel).join(', ')}`}</span>
    </label>
  );
}

export function ProductStep({ products, selected, onSelect }: ProductStepProps): JSX.Element {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>Choose a loan product</legend>
      {products.map((rule) => (
        <ProductCard
          key={rule.product_type}
          rule={rule}
          selected={selected === rule.product_type}
          onSelect={() => onSelect(rule.product_type)}
        />
      ))}
    </fieldset>
  );
}
