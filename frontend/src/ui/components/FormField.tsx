/** Labelled text input with a range hint and an inline error (ui_spec §6.1).
 * The error is announced and linked with `aria-describedby`. */

import { useId, type JSX } from 'react';

import styles from './controls.module.css';

export interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  hint?: string;
  error?: string;
  inputMode?: 'numeric' | 'decimal' | 'text';
  maxLength?: number;
}

function Note({ id, hint, error }: { id: string; hint?: string; error?: string }): JSX.Element {
  return (
    <div id={id}>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}

export function FormField(props: FormFieldProps): JSX.Element {
  const { label, value, onChange, onBlur, hint, error, inputMode = 'text', maxLength } = props;
  const id = useId();
  return (
    <div>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        value={value}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete="off"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={`${id}-note`}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      <Note id={`${id}-note`} hint={hint} error={error} />
    </div>
  );
}
