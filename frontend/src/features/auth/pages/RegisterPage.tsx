import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { navigate } from '../../../app/router';
import { ApiRequestError } from '../../../lib/api';
import { useAuth } from '../AuthProvider';
import {
  detectTimezone,
  hasErrors,
  validateDisplayName,
  validateEmail,
  validatePassword,
  type FieldErrors,
} from '../authForm';
import { AuthLayout, FormError } from './AuthLayout';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'TRY', 'AUD', 'CAD', 'CHF', 'JPY'] as const;

/** `POST /auth/register` (api-spec.md §9.2). */
export function RegisterPage() {
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [baseCurrency, setBaseCurrency] = useState<string>('USD');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors: FieldErrors = {
      displayName: validateDisplayName(displayName),
      email: validateEmail(email),
      password: validatePassword(password),
    };

    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setSubmitting(true);

    try {
      await signUp({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        timezone: detectTimezone(),
        baseCurrency,
      });
      navigate('/');
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const mapped = error.fieldErrors();
        setFieldErrors(mapped);
        setFormError(Object.keys(mapped).length > 0 ? null : error.message);
      } else {
        setFormError('Could not create your account. Try again in a moment.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start journalling your trades."
      footer={
        <span>
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="rounded font-medium text-accent-strong underline underline-offset-2 hover:text-accent focus:outline-none focus-visible:ring-2"
          >
            Sign in
          </button>
        </span>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={formError} />

        <Input
          label="Display name"
          name="displayName"
          autoComplete="name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          error={fieldErrors.displayName}
          required
        />

        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
          required
        />

        <Input
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
          hint="At least 10 characters."
          required
        />

        {/* A native select keeps the platform picker, consistent with the Select primitive. */}
        <div className="flex flex-col gap-1">
          <label htmlFor="register-currency" className="text-sm font-medium text-text">
            Base currency
          </label>
          <select
            id="register-currency"
            name="baseCurrency"
            value={baseCurrency}
            onChange={(event) => setBaseCurrency(event.target.value)}
            className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text transition-colors focus:border-accent focus:outline-none focus-visible:ring-2"
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <p className="text-xs text-text-muted">
            Every trade is recorded in this currency. Currency conversion is not supported.
          </p>
        </div>

        <Button type="submit" variant="primary" loading={submitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}