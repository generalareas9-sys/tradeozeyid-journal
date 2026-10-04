import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table } from './Table';

const HEADERS = ['Symbol', 'Direction', 'PnL'];

describe('Table', () => {
  it('renders a semantic table with column headers', () => {
    render(
      <Table headers={HEADERS}>
        <tr>
          <td>XAUUSDc</td>
          <td>long</td>
          <td>-0.5560000000</td>
        </tr>
      </Table>,
    );

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual(HEADERS);
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('renders rows as table rows and cells', () => {
    render(
      <Table headers={HEADERS}>
        <tr>
          <td>XAUUSDc</td>
          <td>long</td>
          <td>-0.5560000000</td>
        </tr>
      </Table>,
    );

    const rows = screen.getAllByRole('row');
    // One header row plus one body row.
    expect(rows).toHaveLength(2);
    expect(screen.getByRole('cell', { name: 'XAUUSDc' })).toBeTruthy();
  });

  it('renders a caption when given', () => {
    render(
      <Table caption="Recent trades" headers={HEADERS}>
        <tr>
          <td>XAUUSDc</td>
          <td>long</td>
          <td>0</td>
        </tr>
      </Table>,
    );

    expect(screen.getByText('Recent trades').tagName).toBe('CAPTION');
  });

  it('shows the empty state instead of rows when there are none', () => {
    render(
      <Table headers={HEADERS} empty={<span>No trades yet</span>}>
        {null}
      </Table>,
    );

    expect(screen.getByText('No trades yet')).toBeTruthy();
    expect(screen.queryAllByRole('cell', { name: 'XAUUSDc' })).toHaveLength(0);
  });

  it('spans the empty row across every column', () => {
    render(
      <Table headers={HEADERS} empty={<span>Nothing here</span>}>
        {null}
      </Table>,
    );

    const cell = screen.getByRole('cell');
    expect(cell.getAttribute('colspan')).toBe('3');
  });

  it('aligns a column right when asked, for numeric columns', () => {
    render(
      <Table headers={HEADERS} align={['left', 'left', 'right']}>
        <tr>
          <td>XAUUSDc</td>
          <td>long</td>
          <td>245.20</td>
        </tr>
      </Table>,
    );

    expect(screen.getAllByRole('columnheader')[2].className).toContain('text-right');
  });

  it('wraps the table in a horizontal scroll container', () => {
    const { container } = render(
      <Table headers={HEADERS}>
        <tr>
          <td>XAUUSDc</td>
          <td>long</td>
          <td>0</td>
        </tr>
      </Table>,
    );

    expect(container.querySelector('.overflow-x-auto')).toBeTruthy();
  });
});