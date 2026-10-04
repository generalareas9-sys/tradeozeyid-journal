/**
 * Development-only showcase of the Phase 2 UI primitives.
 *
 * Purpose: `docs/phase-plan.md` Phase 2 G5 requires the owner to review every
 * primitive visually in a browser, and seven of the thirteen primitives
 * (`Input`, `Select`, `DatePicker`, `Dialog`, `Tabs`, `Toast`, `Skeleton`,
 * `StatTile`) are not rendered anywhere in the application, so they cannot be
 * reached through a route. This page makes them reachable.
 *
 * It is deliberately NOT part of the application:
 *  - it is reached only at `/dev/primitives`, and only when `import.meta.env.DEV`
 *    is true (see `src/main.tsx`), so it is absent from the production bundle;
 *  - it is not registered in `routeConfig.ts`, so no route or navigation changes;
 *  - it uses the real primitives, never a copy, so what is reviewed here is what
 *    the application renders.
 *
 * Data rule: this page shows no prices, balances, returns or any other trading
 * figure. Every placeholder is an em dash marked `aria-hidden`, paired with an
 * `sr-only` "no data" label so the state is available to assistive technology
 * rather than being carried by a dash.
 *
 * Not a substitute for automated tests: the primitives are covered by their own
 * `*.test.tsx` files. This page exists only so a human can look at them.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Badge } from '../components/ui/Badge';
import type { BadgeVariant } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import type { ButtonVariant } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { DatePicker } from '../components/ui/DatePicker';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Skeleton, SkeletonGroup, SkeletonLines } from '../components/ui/Skeleton';
import { StatTile } from '../components/ui/StatTile';
import { Table } from '../components/ui/Table';
import { Tabs } from '../components/ui/Tabs';
import type { TabDefinition } from '../components/ui/Tabs';
import { Toast } from '../components/ui/Toast';

const BUTTON_VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];

const BADGE_VARIANTS: BadgeVariant[] = ['neutral', 'accent', 'positive', 'negative'];

/** Every design token, so the palette can be checked in one place. */
const SWATCHES: Array<{ token: string; className: string }> = [
  { token: 'background', className: 'bg-background' },
  { token: 'surface', className: 'bg-surface' },
  { token: 'card', className: 'bg-card' },
  { token: 'border', className: 'bg-border' },
  { token: 'border-strong', className: 'bg-border-strong' },
  { token: 'text', className: 'bg-text' },
  { token: 'text-muted', className: 'bg-text-muted' },
  { token: 'accent', className: 'bg-accent' },
  { token: 'accent-strong', className: 'bg-accent-strong' },
  { token: 'accent-soft', className: 'bg-accent-soft' },
  { token: 'positive', className: 'bg-positive' },
  { token: 'positive-soft', className: 'bg-positive-soft' },
  { token: 'negative', className: 'bg-negative' },
  { token: 'negative-soft', className: 'bg-negative-soft' },
];

/**
 * The "no figure" placeholder. The dash is decoration; the label is the state.
 */
function NoFigure({ label = 'No data' }: { label?: string }) {
  return (
    <>
      <span aria-hidden="true" className="text-border-strong">
        &mdash;
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}

/** A labelled horizontal cluster. `p` rather than a heading, so it adds no level to the document structure. */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Vertical rhythm inside a section. */
function Stack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

/** Two-up on wider viewports, single column at 390px. */
function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

/**
 * A body cell. `Table` deliberately leaves body rows to the caller, so the
 * padding lives here; that contract is part of what this page makes visible.
 */
function DashCell({ align }: { align?: string }) {
  return (
    <td className={`px-5 py-3 text-sm text-text-muted ${align ?? ''}`}>
      <NoFigure label="No value" />
    </td>
  );
}

function DialogDemo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Group label="Native dialog element">
        <Button variant="primary" onClick={() => setOpen(true)}>
          Open dialog
        </Button>
      </Group>

      <Dialog
        open={open}
        title="Archive this trading account"
        description="The native dialog supplies the focus trap and Escape handling. Click the backdrop to dismiss, or use the controls below."
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => setOpen(false)}>
              Archive
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-text-muted">
          Body copy sits here. No account data is fetched or changed by this page.
        </p>
      </Dialog>
    </>
  );
}

function TabsDemo() {
  const tabs: TabDefinition[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'details', label: 'Details' },
    { id: 'locked', label: 'Locked', disabled: true },
  ];
  const [activeId, setActiveId] = useState('overview');

  return (
    <Tabs tabs={tabs} activeId={activeId} onChange={setActiveId} label="Showcase sections">
      <p className="text-sm text-text-muted">
        Active panel: <span className="font-medium text-text">{activeId}</span>. Arrow keys move
        between enabled tabs; Home and End jump to the first and last. The third tab is disabled
        and is skipped.
      </p>
    </Tabs>
  );
}

function ToastDemo() {
  const [visible, setVisible] = useState(['success', 'error', 'info']);
  const variants = ['success', 'error', 'info'] as const;

  function dismiss(id: string) {
    setVisible((current) => current.filter((item) => item !== id));
  }

  return (
    <Stack>
      <Group label="Dismiss a toast with its × control, then restore it">
        <Button variant="secondary" onClick={() => setVisible([...variants])}>
          Show all three
        </Button>
      </Group>

      {variants.map((variant) =>
        visible.includes(variant) ? (
          <Toast
            key={variant}
            variant={variant}
            title={
              variant === 'success'
                ? 'Trade saved'
                : variant === 'error'
                  ? 'Validation failed'
                  : 'Heads up'
            }
            message="A second line, in the muted text colour."
            onDismiss={() => dismiss(variant)}
          />
        ) : null,
      )}
    </Stack>
  );
}

export function PrimitivesShowcase() {
  return (
    <div className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-text">
              Phase 2 UI primitives
            </h1>
            <Badge variant="accent">Development only</Badge>
            <Badge variant="neutral">Not in the production bundle</Badge>
          </div>

          <p className="max-w-2xl text-sm leading-relaxed text-text-muted">
            Every component below is the real primitive, composed the way the application composes
            it. No prices, balances or returns appear anywhere on this page: each placeholder is an
            em dash with a screen-reader &ldquo;no data&rdquo; label.
          </p>
        </header>

        <Card title="Design tokens" subtitle="Every token in the Phase 2 table, on the real canvas.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {SWATCHES.map((swatch) => (
              <div key={swatch.token} className="flex flex-col gap-1">
                <span
                  aria-hidden="true"
                  className={`h-11 w-full rounded-lg border border-border ${swatch.className}`}
                />
                <span className="font-numeric text-xs text-text-muted">{swatch.token}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Button" subtitle="Four variants, then the default, disabled, loading and a leading glyph.">
          <Stack>
            <Group label="Variants">
              {BUTTON_VARIANTS.map((variant) => (
                <Button key={variant} variant={variant}>
                  {variant}
                </Button>
              ))}
            </Group>

            <Group label="Default variant is secondary">
              <Button>Default</Button>
            </Group>

            <Group label="Disabled">
              {BUTTON_VARIANTS.map((variant) => (
                <Button key={variant} variant={variant} disabled>
                  {variant}
                </Button>
              ))}
            </Group>

            <Group label="Loading keeps its accessible name and sets aria-busy">
              <Button variant="primary" loading>
                Saving
              </Button>
              <Button variant="secondary" loading>
                Working
              </Button>
            </Group>

            <Group label="Leading glyph">
              <Button variant="primary" leading={<span aria-hidden="true">+</span>}>
                Add trade
              </Button>
            </Group>
          </Stack>
        </Card>

        <Card
          title="Input, Select and DatePicker"
          subtitle="Native controls. Focus one with the keyboard, and open the date picker and the select list to see the browser's own widgets on a light surface."
        >
          <Stack>
            <Grid>
              <Input label="Default" placeholder="Free text" hint="Label, control and hint." />
              <Input
                label="With error"
                defaultValue="—"
                error="A validation message in the negative token."
              />
              <Input
                label="Disabled"
                defaultValue="—"
                disabled
                hint="Disabled controls are exempt from the contrast minimum."
              />
              <Input label="Required" required placeholder="The asterisk is decorative" />
            </Grid>

            <Grid>
              <Select
                label="With placeholder"
                placeholder="Choose one"
                hint="A placeholder option is not selectable."
                options={[
                  { value: 'one', label: 'Option one' },
                  { value: 'two', label: 'Option two' },
                  { value: 'three', label: 'Option three', disabled: true },
                ]}
              />
              <Select
                label="With error"
                error="A validation message in the negative token."
                options={[{ value: 'one', label: 'Option one' }]}
              />
              <Select
                label="Disabled"
                disabled
                options={[{ value: 'one', label: 'Option one' }]}
              />
            </Grid>

            <Grid>
              <DatePicker label="Default" hint="YYYY-MM-DD. Opens the native picker." />
              <DatePicker
                label="Bounded"
                min="2026-01-01"
                max="2026-12-31"
                hint="min and max are passed straight through."
              />
              <DatePicker label="With error" error="A validation message." />
              <DatePicker label="Disabled" disabled />
            </Grid>
          </Stack>
        </Card>

        <Card title="Dialog" subtitle="Focus trap, Escape, and backdrop click all come from the platform.">
          <DialogDemo />
        </Card>

        <Card
          title="Table"
          subtitle="Caption, uppercase header row, right-aligned numeric columns. The body row is structural em dashes, not data; body cell padding is the caller's job."
        >
          <Stack>
            <Table
              caption="With a body row"
              headers={['Date', 'Symbol', 'Side', 'Lots', 'Entry', 'Stop loss', 'Net P&L']}
              align={['left', 'left', 'left', 'right', 'right', 'right', 'right']}
            >
              <tr>
                <DashCell />
                <DashCell />
                <DashCell />
                <DashCell align="text-right" />
                <DashCell align="text-right" />
                <DashCell align="text-right" />
                <DashCell align="text-right" />
              </tr>
            </Table>

            <Table
              caption="Empty"
              headers={['Date', 'Symbol', 'Side', 'Lots', 'Entry', 'Stop loss', 'Net P&L']}
              align={['left', 'left', 'left', 'right', 'right', 'right', 'right']}
              empty={
                <div className="mx-auto flex max-w-sm flex-col gap-1">
                  <p className="text-sm font-semibold text-text">No trades recorded</p>
                  <p className="text-sm text-text-muted">
                    The state every table shows before any rows exist.
                  </p>
                </div>
              }
            />
          </Stack>
        </Card>

        <Card title="Card" subtitle="Shown nested, so the edge, radius and shadow can be compared against a panel.">
          <Stack>
            <Card>No header, no footer: children only.</Card>
            <Card
              title="With title and subtitle"
              subtitle="Header actions sit opposite the title."
              actions={<Button variant="secondary">Action</Button>}
            >
              Body content.
            </Card>
            <Card title="With footer" footer="The footer sits on the tinted background band.">
              Body content.
            </Card>
          </Stack>
        </Card>

        <Card title="Badge" subtitle="All four variants. Colour never carries the meaning alone: the label is always text.">
          <Stack>
            <Group label="Variants">
              {BADGE_VARIANTS.map((variant) => (
                <Badge key={variant} variant={variant}>
                  {variant}
                </Badge>
              ))}
            </Group>

            <Group label="With a leading glyph">
              <Badge variant="positive" icon={<span>▲</span>}>
                Direction glyph
              </Badge>
              <Badge variant="negative" icon={<span>▼</span>}>
                Direction glyph
              </Badge>
            </Group>
          </Stack>
        </Card>

        <Card title="Tabs" subtitle="One tab stop for the list, arrow keys to move, aria-selected on the active tab.">
          <TabsDemo />
        </Card>

        <Card title="Toast" subtitle="Meaning is carried by the glyph and the live-region role, never by colour alone.">
          <ToastDemo />
        </Card>

        <Card title="Skeleton" subtitle="Decorative shapes are hidden from assistive technology; the group announces the loading state.">
          <Stack>
            <Group label="Variants">
              <Skeleton variant="circle" />
              <Skeleton variant="text" width="w-1/3" />
              <Skeleton variant="rect" width="w-1/2" />
            </Group>

            <SkeletonGroup label="Loading the journal">
              <div className="flex flex-col gap-2">
                <Skeleton variant="text" width="w-full" />
                <Skeleton variant="text" width="w-full" />
                <Skeleton variant="text" width="w-2/3" />
              </div>
            </SkeletonGroup>

            <SkeletonGroup label="Loading grouped lines">
              <SkeletonLines count={2} />
            </SkeletonGroup>
          </Stack>
        </Card>

        <Card title="EmptyState" subtitle="The dashed edge distinguishes &ldquo;nothing here yet&rdquo; from a card with content.">
          <Stack>
            <EmptyState title="Title only" />
            <EmptyState
              title="With a description"
              description="A sentence explaining what will appear here and why it is empty."
            />
            <EmptyState
              icon="+"
              title="With icon and action"
              description="The icon sits in a tinted disc; the action is a real button."
              action={<Button variant="primary">Add the first trade</Button>}
            />
          </Stack>
        </Card>

        <Card title="StatTile" subtitle="Trend is carried by a glyph and a word as well as colour. Every value is an em dash: no figure is shown.">
          <Grid>
            <StatTile label="No trend" value={<NoFigure />} secondary="Secondary line" />
            <StatTile
              label="Trend up"
              value={<NoFigure />}
              trend="up"
              trendLabel="No data"
            />
            <StatTile
              label="Trend down"
              value={<NoFigure />}
              trend="down"
              trendLabel="No data"
            />
            <StatTile
              label="Trend flat"
              value={<NoFigure />}
              trend="flat"
              trendLabel="No data"
            />
          </Grid>
        </Card>

        <Card
          title="Focus rings and keyboard order"
          subtitle="Press Tab to walk the first group in order; each focus indicator uses the brand accent. Disabled controls are not focusable. Escape closes the dialog, and Arrow keys with Home and End drive the tabs."
        >
          <Stack>
            <Group label="In the tab order">
              <Button variant="primary">One</Button>
              <Button variant="secondary">Two</Button>
              <Button variant="ghost">Three</Button>
              <Button variant="danger">Four</Button>
              <Input label="Five" />
              <Select
                label="Six"
                options={[{ value: 'one', label: 'Option one' }]}
              />
            </Group>

            <Group label="Disabled, so skipped by Tab">
              <Button variant="primary" disabled>
                Disabled
              </Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
              <Button variant="ghost" disabled>
                Disabled
              </Button>
            </Group>
          </Stack>
        </Card>

        <footer className="border-t border-border pt-4">
          <p className="text-xs leading-relaxed text-text-muted">
            Development-only page, loaded through a dynamic import guarded by{' '}
            <span className="font-numeric">import.meta.env.DEV</span> and reachable only at{' '}
            <span className="font-numeric">/dev/primitives</span>. It is not a route, it is not in
            the navigation, and it is absent from the production bundle.
          </p>
        </footer>
      </div>
    </div>
  );
}
