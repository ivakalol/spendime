// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Area: ({ dataKey }: { dataKey: string }) => <div data-testid={`series-${dataKey}`} />,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

import { TrendChart } from '../../src/client/pages/DashboardPage';

afterEach(() => { cleanup(); localStorage.clear(); });

describe('dashboard trend selection', () => {
  it('shows every series initially and lets the user toggle each one', async () => {
    const rows=[{name:'2026-09-18',growth:1,income:2,spending:3,utility:4}];
    const {unmount}=render(<TrendChart currency="EUR" rows={rows} />);
    const growth=screen.getByRole('checkbox',{name:'Asset gain change'});
    expect(growth).toBeChecked();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.getByTestId('series-growth')).toBeInTheDocument();

    await userEvent.click(growth);
    expect(growth).not.toBeChecked();
    expect(screen.queryByTestId('series-growth')).not.toBeInTheDocument();
    expect(screen.getByTestId('series-income')).toBeInTheDocument();
    unmount();
    render(<TrendChart currency="EUR" rows={rows} />);
    expect(screen.getByRole('checkbox',{name:'Asset gain change'})).not.toBeChecked();

    await userEvent.click(screen.getByRole('checkbox',{name:'Income'}));
    await userEvent.click(screen.getByRole('checkbox',{name:'Actual spending'}));
    await userEvent.click(screen.getByRole('checkbox',{name:'Utility impact'}));
    expect(screen.getByText('Select a trend to show it on the chart.')).toBeInTheDocument();
  });
});
