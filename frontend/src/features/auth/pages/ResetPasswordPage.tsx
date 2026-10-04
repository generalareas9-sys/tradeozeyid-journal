import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { navigate } from '../../../app/router';
import { ApiRequestError } from '../../../lib/api';
import { resetPassword } from '../auth.api';
import { hasErrors, validatePassword, type FieldErrors } from '../authForm';
import { AuthLayout, FormError } from './AuthLayout';

/**
 * `POST /auth/reset-password` (api-spec.md §9.2).
 *
 * The single-use token arrives in the link as `?token=...`. A successful reset
 * revokes every session, so the user is sent to sign in again.
 */
export function ResetPasswordPage({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors: FieldErrors = { password: validatePassword(password) };

    if (confirm !== password) {
      errors.confirm = 'The two passwords do not match';
    }

    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setSubmitting(true);

    try {
      await resetPassword({ token, password });
      navigate('/login');
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const mapped = error.fieldErrors();
        setFieldErrors(mapped);
        setFormError(Object.keys(mapped).length > 0 ? null : error.message);
      } else {
        setFormError('Could not reset your password. The link may have expired.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Reset your password" subtitle="This link is missing its token.">
        <FormError message="Open the link from your reset email again, or request a new one." />
        <Button variant="primary" onClick={() => navigate('/forgot-password')}>
          Request a new link
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="This will sign you out everywhere."
      footer={
        <span>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="rounded font-medium text-accent-strong underline underline-offset-2 hover:text-accent focus:outline-none focus-visible:ring-2"
          >
            Back to sign in
          </button>
        </span>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={formError} />

        <Input
          label="New password"
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
          hint="At least 10 characters."
          required
        />

        <Input
          label="Confirm new password"
          type="password"
          name="confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={fieldErrors.confirm}
          required
        />

        <Button type="submit" variant="primary" loading={submitting}>
          Reset password
        </Button>
      </form>
    </AuthLayout>
  );
}