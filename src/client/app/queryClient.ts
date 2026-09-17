import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, gcTime: 5 * 60_000, retry: (count, error) => (error as { status?: number }).status !== 401 && count < 2, refetchOnWindowFocus: true }, mutations: { retry: false } } });
