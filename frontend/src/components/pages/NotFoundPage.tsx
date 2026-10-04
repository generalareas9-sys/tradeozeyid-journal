import { navigate } from '../../app/router';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export interface NotFoundPageProps {
  /** The path that did not match any route. */
  pathname: string;
}

/** Shown for any path outside the route configuration, with a way back. */
export function NotFoundPage({ pathname }: NotFoundPageProps) {
  return (
    <Card title="Nothing here" subtitle="This address is not part of the workspace.">
      <p className="text-sm leading-relaxed text-text-muted">
        No screen is registered for{' '}
        <code className="rounded bg-accent-soft px-1.5 py-0.5 font-numeric text-accent-strong">
          {pathname}
        </code>
        .
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => navigate('/')}>
          Back to dashboard
        </Button>
        <Button onClick={() => window.history.back()}>Go back</Button>
      </div>
    </Card>
  );
}