import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { navigate } from '../../../app/router';
import { ApiRequestError } from '../../../lib/api';
import { useAuth } from '../AuthProvider';
import {
  hasErrors,
  validateEmail,
  validatePassword,
  type FieldErrors,
} from '../authForm';
import { AuthLayout, FormError } from './AuthLayout';

/** `POST /auth/login` (api-spec.md §9.2). */
export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors: FieldErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
    };

    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setSubmitting(true);

    try {
      await signIn(email.trim(), password);
      navigate('/');
    } catch (error) {
      if (error instanceof ApiRequestError) {
        // Field-level details win when the server sent them; otherwise show the
        // server's own message verbatim.
        const mapped = error.fieldErrors();
        setFieldErrors(mapped);
        setFormError(
          Object.keys(mapped).length > 0 ? null : error.message,
        );
      } else {
        setFormError('Could not sign in. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Your trading journal is waiting."
      footer={
        <div className="flex flex-col gap-1">
          <span>
            No account yet?{' '}
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="rounded font-medium text-accent-strong underline underline-offset-2 hover:text-accent focus:outline-none focus-visible:ring-2"
            >
              Create one
            </button>
          </span>
          <span>
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              className="rounded font-medium text-accent-strong underline underline-offset-2 hover:text-accent focus:outline-none focus-visible:ring-2"
            >
              Forgot your password?
            </button>
          </span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={formError} />

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
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
          required
        />

        <Button type="submit" variant="primary" loading={submitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}