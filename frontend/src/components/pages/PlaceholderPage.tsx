import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';

export interface PlaceholderPageProps {
  /** Phase of docs/phase-plan.md that delivers this area. */
  phase: number;
  /** What the area will hold, from the locked documentation. */
  description: string;
}

/**
 * The placeholder screen for an area whose real implementation lands in a later
 * phase. It states what the area is for and when it arrives, and deliberately
 * renders no sample figures: fabricated prices or P&L on a trading screen
 * could be mistaken for real data.
 */
export function PlaceholderPage({ phase, description }: PlaceholderPageProps) {
  return (
    <Card
      title="Not built yet"
      actions={<Badge variant="accent">Planned for Phase {phase}</Badge>}
      footer="No data is requested by this screen."
    >
      <p className="text-sm leading-relaxed text-text-muted">{description}</p>

      <div className="mt-5 flex flex-col gap-2" aria-hidden="true">
        <span className="h-3 w-3/4 rounded-full bg-accent-soft" />
        <span className="h-3 w-1/2 rounded-full bg-accent-soft" />
      </div>
    </Card>
  );
}