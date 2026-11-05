import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the error message when a previous login attempt failed', () => {
    render(<LoginPage onLogin={vi.fn()} error="Invalid email or password." loading={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('calls onLogin with the typed email and password on submit', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} error={null} loading={false} />);

    await user.type(screen.getByLabelText(/email/i), 'policy@example.test');
    await user.type(screen.getByLabelText(/password/i), 'Synthetic-Dev-Pass-1!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(onLogin).toHaveBeenCalledWith('policy@example.test', 'Synthetic-Dev-Pass-1!');
  });

  it('disables the submit button while a login request is in flight', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} loading={true} />);
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });
});
