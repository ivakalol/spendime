// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/client/app/App';
import { LoginPage, RegisterPage } from '../../src/client/auth/AuthPages';
import { LanguageProvider } from '../../src/client/i18n';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderAt(path: string, content = <App />) {
  return render(<QueryClientProvider client={new QueryClient()}><LanguageProvider>
    <MemoryRouter initialEntries={[path]}>{content}</MemoryRouter>
  </LanguageProvider></QueryClientProvider>);
}

describe('public legal pages', () => {
  it('shows the privacy policy without a session or authentication request', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/privacy');
    expect(screen.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Ivaylo Chernev in Bulgaria/)).toBeInTheDocument();
    expect(screen.getByText(/bank connection is a separate feature/)).toBeInTheDocument();
    expect(screen.getByText(/does not send real financial data to Google Gemini/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the terms without a session or authentication request', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/terms');
    expect(screen.getByRole('heading', { name: 'Terms of Service', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Banking is available only to the account specifically configured/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('links both documents from login and registration', () => {
    const { unmount } = renderAt('/login', <LoginPage />);
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
    unmount();
    renderAt('/register', <RegisterPage />);
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
  });
});
