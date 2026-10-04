/**
 * The reusable UI primitives.
 *
 * Conventions for every primitive here:
 *  - colours come only from the design tokens in `styles/index.css`, never from
 *    a literal value;
 *  - meaning is never carried by colour alone — text or a glyph always repeats
 *    it;
 *  - native elements are preferred, so keyboard and screen-reader behaviour
 *    comes from the platform;
 *  - no page-level or feature-level styling lives in this folder.
 */

export { Button } from './Button';
export type { ButtonProps, ButtonVariant } from './Button';

export { Input } from './Input';
export type { InputProps } from './Input';

export { Select } from './Select';
export type { SelectOption, SelectProps } from './Select';

export { DatePicker } from './DatePicker';
export type { DatePickerProps } from './DatePicker';

export { Dialog } from './Dialog';
export type { DialogProps } from './Dialog';

export { Table } from './Table';
export type { TableProps } from './Table';

export { Card } from './Card';
export type { CardProps } from './Card';

export { Badge } from './Badge';
export type { BadgeProps, BadgeVariant } from './Badge';

export { Tabs } from './Tabs';
export type { TabDefinition, TabsProps } from './Tabs';

export { Skeleton, SkeletonGroup, SkeletonLines } from './Skeleton';
export type { SkeletonProps, SkeletonVariant } from './Skeleton';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { StatTile } from './StatTile';
export type { StatTrend, StatTileProps } from './StatTile';

export { Toast, ToastProvider, useToast } from './Toast';
export type { ToastOptions, ToastRecord, ToastVariant } from './Toast';