import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { navigate } from '../../../app/router';
import { ApiRequestError } from '../../../lib/api';
import { requestPasswordReset } from '../auth.api';
import { validateEmail, type FieldErrors } from '../authForm';
import { AuthLayout, FormError, FormNotice } from './AuthLayout';

/**
 * `POST /auth/forgot-password` (api-spec.md §9.2).
 *
 * The response is always `202` with the same neutral message whether or not the
 * account exists, so this screen shows that message and never reveals whether an
 * address is registered.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNotice(null);

    const emailError = validateEmail(email);
    setFieldErrors({ email: emailError });
    if (emailError) return;

    setSubmitting(true);

    try {
      const message = await requestPasswordReset(email.trim());
      setNotice(message);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setFormError(error.message);
      } else {
        setFormError('Could not send the reset email. Try again in a moment.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We will email you a link to choose a new one."
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
        <FormNotice message={notice} />

        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
          disabled={notice !== null}
          required
        />

        <Button type="submit" variant="primary" loading={submitting} disabled={notice !== null}>
          Send reset link
        </Button>

        <p className="text-xs leading-relaxed text-text-muted">
          The link is valid for 30 minutes and can be used once. If the address is not registered,
          you will see the same confirmation.
        </p>
      </form>
    </AuthLayout>
  );
}