/** Last-resort boundary for a render crash: a plain card with Retry and Sign
 * out instead of a blank page. The thrown error is never shown to the user
 * and never logged with application data (NFR-03). */

import { Component, type JSX, type ReactNode } from 'react';

import styles from './ErrorState.module.css';

export interface AppErrorBoundaryProps {
  children: ReactNode;
  onSignOut: () => void;
}

interface State {
  failed: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    // Name only: the message or component stack may carry application data.
    console.error(`UI render failed: ${error.name}`);
  }

  private readonly retry = (): void => {
    this.setState({ failed: false });
  };

  private readonly signOut = (): void => {
    this.props.onSignOut();
    this.setState({ failed: false });
  };

  render(): JSX.Element | ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <section role="alert" className={styles.card}>
        <h1 className={styles.message}>Something went wrong</h1>
        <p className={styles.reference}>The page could not be shown. You can try again or sign out.</p>
        <div>
          <button type="button" className={styles.retry} onClick={this.retry}>
            Retry
          </button>{' '}
          <button type="button" className={styles.link} onClick={this.signOut}>
            Sign out
          </button>
        </div>
      </section>
    );
  }
}
