import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, jsonBody } from './client';
import type { Account, AccountInput, ApiEnvelope, Asset, AssetContribution, AssetInput, AssetValuation, Category, CategoryInput, DashboardData, Liability, LiabilityInput, PagedEnvelope, RecurringInput, RecurringRule, Transaction, TransactionInput, User } from './types';

export const keys = {
  me: ['auth', 'me'] as const, accounts: ['accounts'] as const, categories: ['categories'] as const,
  transactions: ['transactions'] as const, assets: ['assets'] as const, liabilities: ['liabilities'] as const,
  recurring: ['recurring-rules'] as const, dashboard: ['dashboard'] as const,
};
const getData = async <T,>(path: string) => (await apiRequest<ApiEnvelope<T>>(path)).data;
const mutate = <T,>(path: string, method: string, body?: unknown) => apiRequest<ApiEnvelope<T>>(path, { method, ...(body === undefined ? {} : jsonBody(body)) }).then((x) => x?.data);

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: async () => {
    try { return (await apiRequest<ApiEnvelope<{ user: User }>>('/api/auth/me', {}, { allowUnauthorized: true })).data.user; }
    catch (error) { if ((error as { status?: number }).status === 401) return null; throw error; }
  }, staleTime: 60_000, retry: false });
}
export const useAccounts = (includeArchived = true) => useQuery({ queryKey: [...keys.accounts, includeArchived], queryFn: () => getData<Account[]>(`/api/accounts?includeArchived=${includeArchived}`) });
export const useCategories = (includeArchived = true) => useQuery({ queryKey: [...keys.categories, includeArchived], queryFn: () => getData<Category[]>(`/api/categories?includeArchived=${includeArchived}`) });
export const useAssets = (includeArchived = true) => useQuery({ queryKey: [...keys.assets, includeArchived], queryFn: () => getData<Asset[]>(`/api/assets?includeArchived=${includeArchived}`) });
export const useLiabilities = (includeClosed = true) => useQuery({ queryKey: [...keys.liabilities, includeClosed], queryFn: () => getData<Liability[]>(`/api/liabilities?includeClosed=${includeClosed}`) });
export const useRecurring = (includeInactive = true) => useQuery({ queryKey: [...keys.recurring, includeInactive], queryFn: () => getData<RecurringRule[]>(`/api/recurring-rules?includeInactive=${includeInactive}`) });
export const useDashboard = (timeframe: string, anchor?: string) => useQuery({ queryKey: [...keys.dashboard, timeframe, anchor], queryFn: () => getData<DashboardData>(`/api/dashboard?${new URLSearchParams({ timeframe, ...(anchor ? { anchor } : {}) })}`), staleTime: 30_000 });
export const useTransactions = (params: URLSearchParams) => useQuery({ queryKey: [...keys.transactions, params.toString()], queryFn: () => apiRequest<PagedEnvelope<Transaction>>(`/api/transactions?${params}`), placeholderData: (old) => old });
export const useAssetContributions = (id: string) => useQuery({ queryKey: [...keys.assets, id, 'contributions'], queryFn: () => apiRequest<PagedEnvelope<AssetContribution>>(`/api/assets/${id}/contributions?limit=100`) });
export const useAssetValuations = (id: string) => useQuery({ queryKey: [...keys.assets, id, 'valuations'], queryFn: () => apiRequest<PagedEnvelope<AssetValuation>>(`/api/assets/${id}/valuations?limit=100`) });

function useDomainMutation<TInput, TResult>(path: string | ((input: TInput) => string), method: string, invalidates: readonly (readonly unknown[])[]) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: TInput) => mutate<TResult>(typeof path === 'function' ? path(input) : path, method, method === 'DELETE' ? undefined : input), onSuccess: async () => { await Promise.all(invalidates.map((key) => queryClient.invalidateQueries({ queryKey: key }))); } });
}
export const useCreateAccount = () => useDomainMutation<AccountInput, Account>('/api/accounts', 'POST', [keys.accounts, keys.dashboard]);
export const useUpdateAccount = (id: string) => useDomainMutation<AccountInput, Account>(`/api/accounts/${id}`, 'PATCH', [keys.accounts, keys.dashboard]);
export const useArchiveAccount = () => useDomainMutation<string, void>((id) => `/api/accounts/${id}`, 'DELETE', [keys.accounts, keys.dashboard]);
export const useRestoreAccount = (id: string) => useDomainMutation<void, Account>(`/api/accounts/${id}/restore`, 'POST', [keys.accounts, keys.dashboard]);
export const usePermanentlyDeleteAccount = () => useDomainMutation<string, void>((id) => `/api/accounts/${id}/permanent`, 'DELETE', [keys.accounts, keys.dashboard]);
export const useCreateCategory = () => useDomainMutation<CategoryInput, Category>('/api/categories', 'POST', [keys.categories]);
export const useUpdateCategory = (id: string) => useDomainMutation<CategoryInput, Category>(`/api/categories/${id}`, 'PATCH', [keys.categories, keys.transactions, keys.dashboard]);
export const useArchiveCategory = () => useDomainMutation<string, void>((id) => `/api/categories/${id}`, 'DELETE', [keys.categories, keys.transactions]);
export const useCreateTransaction = () => useDomainMutation<TransactionInput, Transaction>('/api/transactions', 'POST', [keys.transactions, keys.accounts, keys.dashboard, keys.assets, keys.liabilities]);
export const useVoidTransaction = () => useDomainMutation<string, void>((id) => `/api/transactions/${id}`, 'DELETE', [keys.transactions, keys.accounts, keys.dashboard, keys.assets, keys.liabilities]);
export const useCreateAsset = () => useDomainMutation<AssetInput, Asset>('/api/assets', 'POST', [keys.assets, keys.dashboard]);
export const useArchiveAsset = () => useDomainMutation<string, void>((id) => `/api/assets/${id}`, 'DELETE', [keys.assets, keys.dashboard]);
export const useAddContribution = (id: string) => useDomainMutation<Record<string, unknown>, unknown>(`/api/assets/${id}/contributions`, 'POST', [keys.assets, keys.transactions, keys.accounts, keys.dashboard]);
export const useAddValuation = (id: string) => useDomainMutation<Record<string, unknown>, AssetValuation>(`/api/assets/${id}/valuations`, 'POST', [keys.assets, keys.dashboard]);
export const useCreateLiability = () => useDomainMutation<LiabilityInput, Liability>('/api/liabilities', 'POST', [keys.liabilities, keys.dashboard]);
export const useUpdateLiability = (id: string) => useDomainMutation<LiabilityInput, Liability>(`/api/liabilities/${id}`, 'PATCH', [keys.liabilities, keys.dashboard]);
export const useCancelLiability = () => useDomainMutation<string, void>((id) => `/api/liabilities/${id}`, 'DELETE', [keys.liabilities, keys.dashboard]);
export const useCreateRecurring = () => useDomainMutation<RecurringInput, RecurringRule>('/api/recurring-rules', 'POST', [keys.recurring]);
export const useUpdateRecurring = (id: string) => useDomainMutation<RecurringInput, RecurringRule>(`/api/recurring-rules/${id}`, 'PATCH', [keys.recurring]);
export const useDisableRecurring = () => useDomainMutation<string, void>((id) => `/api/recurring-rules/${id}`, 'DELETE', [keys.recurring]);
