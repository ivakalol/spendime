// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keys } from '../../src/client/api/queries';
import type { Account } from '../../src/client/api/types';
import { AccountDialog } from '../../src/client/pages/AccountsPage';

function setup(value: Account | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(keys.me, { baseCurrency: 'EUR' });
  render(<QueryClientProvider client={client}><AccountDialog value={value} open onClose={vi.fn()} /></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('account decimal entry', () => {
  it('creates an account with 200.20 without requiring extra zeros', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: { id: 'a' } }), { status: 201 }));
    setup();
    await userEvent.type(screen.getByLabelText('Name'), 'Cash');
    const balance = screen.getByLabelText(/^Opening balance/);
    await userEvent.clear(balance);
    await userEvent.type(balance, '200.20');
    expect(balance).toHaveValue('200.20');
    expect(balance).toBeValid();
    await userEvent.click(screen.getByRole('button', { name: 'Save account' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(request?.[1]?.body)).openingBalance).toBe('200.20');
  });
  it.each([['200.2000', '200.20'], ['200.2001', '200.2001']])('loads a saved balance %s as %s', (saved, expected) => {
    setup({ id: 'a', name: 'Cash', kind: 'cash', currency: 'EUR', openingBalance: saved, currentBalance: saved,
      institution: null, color: null, icon: null, isArchived: false, createdAt: '', updatedAt: '' });
    expect(screen.getByLabelText(/^Opening balance/)).toHaveValue(expected);
  });
});
