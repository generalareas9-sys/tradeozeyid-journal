import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { JournalPage } from './JournalPage.js';
import { JournalEntryResource } from '@tradeozeyid/contracts';

// Mock the journal API
vi.mock('./journal.api', () => ({
  journalApi: {
    listEntries: vi.fn(),
    createEntry: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
  },
}));

// Mock the toast
vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({
    show: vi.fn(),
  }),
}));

// Mock fetch for trading accounts
global.fetch = vi.fn();

import { journalApi } from './journal.api.js';

const mockEntry: JournalEntryResource = {
  id: '01980000-0000-0000-0000-000000000001',
  accountId: null,
  account: null,
  entryDate: '2026-01-15',
  title: 'Test Entry',
  body: 'This is a test journal entry',
  moodScore: 4,
  wordCount: 6,
  emotions: [],
  tradeSummary: { tradeCount: 0, netPnl: '0.0000000000', closedTrades: 0 },
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  deletedAt: null,
};

const mockAccounts = [
  { id: 'acc1', name: 'Main Account', currency: 'USD' },
];

beforeEach(() => {
  vi.clearAllMocks();
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => ({ data: mockAccounts }),
  });
});

describe('JournalPage', () => {
  it('renders journal title and new entry button', async () => {
    (journalApi.listEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      meta: { pagination: { limit: 20, offset: 0, totalCount: 0 } },
    });

    render(<JournalPage />);

    expect(screen.getByText('Journal')).toBeInTheDocument();
    expect(screen.getByText('Daily journal entries with emotions and trade summary')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New Entry/i })).toBeInTheDocument();
  });

  it('shows empty state when no entries', async () => {
    (journalApi.listEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      meta: { pagination: { limit: 20, offset: 0, totalCount: 0 } },
    });

    render(<JournalPage />);

    await waitFor(() => {
      expect(screen.getByText('No journal entries')).toBeInTheDocument();
      expect(screen.getByText('Create your first journal entry')).toBeInTheDocument();
    });
  });

  it('displays journal entries', async () => {
    (journalApi.listEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [mockEntry],
      meta: { pagination: { limit: 20, offset: 0, totalCount: 1 } },
    });

    render(<JournalPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Entry')).toBeInTheDocument();
      expect(screen.getByText('This is a test journal entry')).toBeInTheDocument();
      expect(screen.getByText('Mood: 4/5')).toBeInTheDocument();
    });
  });

  it('opens create form when clicking New Entry', async () => {
    (journalApi.listEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      meta: { pagination: { limit: 20, offset: 0, totalCount: 0 } },
    });

    render(<JournalPage />);

    const newEntryBtn = screen.getByRole('button', { name: /New Entry/i });
    fireEvent.click(newEntryBtn);

    await waitFor(() => {
      expect(screen.getByText('New Journal Entry')).toBeInTheDocument();
      expect(screen.getByLabelText(/Entry Date.*required/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Body.*required/i)).toBeInTheDocument();
    });
  });

  it('shows validation errors for required fields', async () => {
    (journalApi.listEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      meta: { pagination: { limit: 20, offset: 0, totalCount: 0 } },
    });

    render(<JournalPage />);

    const newEntryBtn = screen.getByRole('button', { name: /New Entry/i });
    fireEvent.click(newEntryBtn);

    const saveBtn = screen.getByRole('button', { name: /Create/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Entry date is required')).toBeInTheDocument();
      expect(screen.getByText('Body is required')).toBeInTheDocument();
    });
  });
});