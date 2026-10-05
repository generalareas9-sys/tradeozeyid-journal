import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReportsPage } from './ReportsPage';
import { vi } from 'vitest';

// Mock the api module
vi.mock('../../lib/api', () => ({
  apiRequest: vi.fn(),
}));

// Mock the router
vi.mock('../../app/router', () => ({
  usePathname: vi.fn(() => '/reports'),
  navigate: vi.fn(),
}));

// Mock the Toast
vi.mock('../../components/ui/Toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

// Mock format
vi.mock('../../lib/format', () => ({
  formatMoney: vi.fn((val: string) => `$${val}`),
  formatPercent: vi.fn((val: number) => `${val}%`),
}));

import { apiRequest } from '../../lib/api';
import { navigate } from '../../app/router';

const mockApiRequest = apiRequest as vi.Mock;
const mockNavigate = navigate as vi.Mock;

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest
      .mockResolvedValueOnce({
        netPnl: '100.0000000000',
        winRate: 60,
        lossRate: 40,
        profitFactor: '1.5000',
        averageR: '0.8000',
        totalTrades: 10,
        closedTrades: 10,
        openTrades: 0,
        bestTrade: '50.0000000000',
        worstTrade: '-30.0000000000',
        averageWin: '40.0000000000',
        averageLoss: '-25.0000000000',
        maxDrawdownPercent: 5.5,
        maxDrawdownAmount: '-150.0000000000',
        totalR: '8.0000',
        currency: 'USD',
      })
      .mockResolvedValueOnce({
        data: [
          {
            key: 'Strategy A',
            secondaryKey: null,
            tradeCount: 5,
            closedTrades: 5,
            netPnl: '100.0000000000',
            winRate: 60,
            profitFactor: '1.5000',
            averageR: '0.8000',
            averageWin: '40.0000000000',
            averageLoss: '-25.0000000000',
          },
          {
            key: 'Strategy B',
            secondaryKey: null,
            tradeCount: 5,
            closedTrades: 5,
            netPnl: '50.0000000000',
            winRate: 50,
            profitFactor: '1.2000',
            averageR: '0.5000',
            averageWin: '30.0000000000',
            averageLoss: '-20.0000000000',
          },
        ],
      });
  });

  it('renders the Reports page with title and description', () => {
    render(<ReportsPage />);

    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.getByText('Overview of trading performance metrics')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    mockApiRequest.mockImplementationOnce(() => new Promise(() => {})); // never resolves

    render(<ReportsPage />);

    expect(screen.getByText('Loading analytics…')).toBeInTheDocument();
  });

  it('renders metric cards after loading', async () => {
    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText('Net P&L')).toBeInTheDocument();
      expect(screen.getByText('$100.0000000000')).toBeInTheDocument();
      expect(screen.getByText('Win Rate')).toBeInTheDocument();
      expect(screen.getByText('60%')).toBeInTheDocument();
    });
  });

  it('renders report type tabs', () => {
    render(<ReportsPage />);

    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('Risk')).toBeInTheDocument();
    expect(screen.getByText('Strategies')).toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
    expect(screen.getByText('Symbol')).toBeInTheDocument();
    expect(screen.getByText('Direction')).toBeInTheDocument();
    expect(screen.getByText('Tag')).toBeInTheDocument();
  });

  it('renders breakdown table with data', async () => {
    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText('Strategy A')).toBeInTheDocument();
      expect(screen.getByText('Strategy B')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument(); // trade count
    });
  });

  it('renders filter controls', () => {
    render(<ReportsPage />);

    expect(screen.getByLabelText('From Date')).toBeInTheDocument();
    expect(screen.getByLabelText('To Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Symbol')).toBeInTheDocument();
    expect(screen.getByLabelText('Direction')).toBeInTheDocument();
    expect(screen.getByLabelText('Session')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('calls navigate when filter form is submitted', async () => {
    render(<ReportsPage />);

    await waitFor(() => {
      const fromInput = screen.getByLabelText('From Date');
      fireEvent.change(fromInput, { target: { value: '2026-01-01' } });
    });

    const applyButton = screen.getByText('Apply');
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('from=2026-01-01'));
    });
  });

  it('calls navigate when clear filters is clicked', async () => {
    render(<ReportsPage />);

    await waitFor(() => {
      const clearButton = screen.getByText('Clear');
      fireEvent.click(clearButton);
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/reports?reportType=performance');
    });
  });

  it('calls navigate when report type tab changes', async () => {
    render(<ReportsPage />);

    await waitFor(() => {
      const riskTab = screen.getByText('Risk');
      fireEvent.click(riskTab);
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('reportType=risk'));
    });
  });

  it('shows error state when API fails', async () => {
    mockApiRequest.mockRejectedValueOnce(new Error('Network error'));

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load report data')).toBeInTheDocument();
    });
  });

  it('has accessible form labels', () => {
    render(<ReportsPage />);

    expect(screen.getByLabelText('From Date')).toBeInTheDocument();
    expect(screen.getByLabelText('To Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Symbol')).toBeInTheDocument();
    expect(screen.getByLabelText('Direction')).toBeInTheDocument();
    expect(screen.getByLabelText('Session')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('shows empty state when no breakdown data', async () => {
    mockApiRequest
      .mockResolvedValueOnce({
        netPnl: '0.0000000000',
        winRate: 0,
        lossRate: 0,
        profitFactor: null,
        averageR: '0.0000',
        totalTrades: 0,
        closedTrades: 0,
        openTrades: 0,
        bestTrade: '0.0000000000',
        worstTrade: '0.0000000000',
        averageWin: '0.0000000000',
        averageLoss: '0.0000000000',
        maxDrawdownPercent: 0,
        maxDrawdownAmount: '0.0000000000',
        totalR: '0.0000',
        currency: 'USD',
      })
      .mockResolvedValueOnce({ data: [] });

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText('No data')).toBeInTheDocument();
    });
  });

  it('displays shareable URL notice', async () => {
    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText('Filters in URL are shareable')).toBeInTheDocument();
    });
  });
});