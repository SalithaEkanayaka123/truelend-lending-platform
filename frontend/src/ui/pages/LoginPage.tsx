/** Shared sign-in gate (F0, S-0-1). Routes by the returned role once
 * `onLogin` resolves; this component only owns the form fields and never
 * logs the typed email or password (NFR-03). */

import type { FormEvent, JSX } from 'react';
import { useState } from 'react';

import styles from './LoginPage.module.css';

export interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
  error: string | null;
  loading: boolean;
}

function ErrorAlert({ message }: { message: string | null }): JSX.Element | null {
  if (!message) return null;
  return (
    <p role="alert" className={styles.error}>
      {message}
    </p>
  );
}

interface CredentialFieldProps {
  id: string;
  label: string;
  type: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
}

function CredentialField({ id, label, type, autoComplete, value, onChange }: CredentialFieldProps): JSX.Element {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </div>
  );
}

export function LoginPage({ onLogin, error, loading }: LoginPageProps): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void onLogin(email, password);
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit} aria-labelledby="signin-heading">
        <h1 id="signin-heading">Sign in</h1>
        <ErrorAlert message={error} />
        <CredentialField id="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} />
        <CredentialField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />
        <button type="submit" className={styles.submit} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
