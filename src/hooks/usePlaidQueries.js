/**
 * All TanStack Query hooks for Plaid data.
 * Each hook encapsulates the query key, endpoint, and stale time so components
 * just call e.g. useConnections() with no token or URL plumbing.
 *
 * Cache invalidation helpers are exported at the bottom for use in mutations.
 */
import { useQuery, useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import queryClient, { STALE } from '../lib/queryClient'

// ---------------------------------------------------------------------------
// Shared queries
// ---------------------------------------------------------------------------

export function useConnections(options = {}) {
  const { getIdToken } = useAuth()
  return useQuery({
    queryKey: ['connections'],
    queryFn: () => apiFetch('/api/plaid/connections', { getToken: getIdToken }),
    staleTime: STALE.connections,
    ...options,
  })
}

export function useAccounts() {
  const { getIdToken } = useAuth()
  return useQuery({
    queryKey: ['accounts'],
    queryFn: () => apiFetch('/api/plaid/accounts', { getToken: getIdToken }),
    staleTime: STALE.accounts,
  })
}

export function useInvestments() {
  const { getIdToken } = useAuth()
  return useQuery({
    queryKey: ['investments'],
    queryFn: () => apiFetch('/api/plaid/investments', { getToken: getIdToken }),
    staleTime: STALE.investments,
  })
}

export function useRecurring() {
  const { getIdToken } = useAuth()
  return useQuery({
    queryKey: ['recurring'],
    queryFn: () => apiFetch('/api/plaid/recurring', { getToken: getIdToken }),
    staleTime: STALE.recurring,
  })
}

// ---------------------------------------------------------------------------
// Transactions (paginated)
// ---------------------------------------------------------------------------

const TRANSACTIONS_PAGE_SIZE = 150

export function useTransactions(filters) {
  const { getIdToken } = useAuth()
  // Strip UI-only `preset` field so cache key only reflects actual API params
  const { preset: _preset, ...filterParams } = filters
  return useInfiniteQuery({
    queryKey: ['transactions', filterParams],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams()
      params.set('limit', String(TRANSACTIONS_PAGE_SIZE))
      params.set('offset', String(pageParam))
      if (filterParams.after_date) params.set('after_date', filterParams.after_date)
      if (filterParams.before_date) params.set('before_date', filterParams.before_date)
      filterParams.account_ids.forEach(id => params.append('account_ids', id))
      filterParams.categories.forEach(cat => params.append('categories', cat))
      filterParams.detailed_categories?.forEach(cat => params.append('detailed_categories', cat))
      if (filterParams.search) params.set('search', filterParams.search)
      return apiFetch(`/api/plaid/transactions?${params}`, { getToken: getIdToken })
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const total = lastPage.total ?? 0
      const fetched = allPages.reduce((sum, p) => sum + (p.transactions?.length ?? 0), 0)
      return fetched < total ? fetched : undefined
    },
    staleTime: STALE.connections,
  })
}

// ---------------------------------------------------------------------------
// Filter reference data (TransactionsPage filter panel)
// ---------------------------------------------------------------------------

export function useTransactionAccounts() {
  const { getIdToken } = useAuth()
  return useQuery({
    queryKey: ['transaction-accounts'],
    queryFn: () => apiFetch('/api/plaid/transactions/accounts', { getToken: getIdToken }),
    staleTime: STALE.refData,
  })
}

export function useTransactionCategories() {
  const { getIdToken } = useAuth()
  return useQuery({
    queryKey: ['transaction-categories'],
    queryFn: () => apiFetch('/api/plaid/transactions/categories', { getToken: getIdToken }),
    staleTime: STALE.refData,
  })
}

// ---------------------------------------------------------------------------
// Parameterized chart queries (lazy — only fetches when enabled)
// ---------------------------------------------------------------------------

export function useSpending(period, accountIds = []) {
  const { getIdToken } = useAuth()
  const params = new URLSearchParams({ period })
  if (accountIds.length) params.set('account_ids', accountIds.join(','))
  return useQuery({
    queryKey: ['spending', period, accountIds],
    queryFn: () => apiFetch(`/api/plaid/spending-summary?${params}`, { getToken: getIdToken }),
    staleTime: STALE.charts,
  })
}

export function useNetWorth(range) {
  const { getIdToken } = useAuth()
  return useQuery({
    queryKey: ['net-worth', range],
    queryFn: () => apiFetch(`/api/plaid/net-worth-history?range=${range}`, { getToken: getIdToken }),
    staleTime: STALE.charts,
  })
}

export function useCashFlow() {
  const { getIdToken } = useAuth()
  return useQuery({
    queryKey: ['cash-flow'],
    queryFn: () => apiFetch('/api/plaid/cash-flow?months=24', { getToken: getIdToken }),
    staleTime: STALE.charts,
  })
}

export function useCashFlowTransactions(month) {
  const { getIdToken } = useAuth()
  return useQuery({
    queryKey: ['cash-flow-transactions', month],
    queryFn: () => apiFetch(`/api/plaid/cash-flow-transactions?month=${month}`, { getToken: getIdToken }),
    staleTime: STALE.charts,
    enabled: !!month,
  })
}

export function useCashFlowTransactionsByRange(startDate, endDate) {
  const { getIdToken } = useAuth()
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate })
  return useQuery({
    queryKey: ['cash-flow-transactions-range', startDate, endDate],
    queryFn: () => apiFetch(`/api/plaid/cash-flow-transactions?${params}`, { getToken: getIdToken }),
    staleTime: STALE.charts,
    enabled: !!startDate && !!endDate,
  })
}

export function useCashFlowTimeSeries(startDate, endDate, granularity = 'month') {
  const { getIdToken } = useAuth()
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate, granularity })
  return useQuery({
    queryKey: ['cash-flow-time-series', startDate, endDate, granularity],
    queryFn: () => apiFetch(`/api/plaid/cash-flow-time-series?${params}`, { getToken: getIdToken }),
    staleTime: STALE.charts,
    enabled: !!startDate && !!endDate,
  })
}

export function useCashFlowBreakdown(period, breakdown = 'category', accountIds = [], customRange = null) {
  const { getIdToken } = useAuth()
  const params = new URLSearchParams({ period, breakdown })
  if (accountIds.length) params.set('account_ids', accountIds.join(','))
  if (period === 'custom' && customRange) {
    params.set('start_date', customRange.startDate)
    params.set('end_date', customRange.endDate)
  }
  return useQuery({
    queryKey: ['cash-flow-breakdown', period, breakdown, accountIds, customRange],
    queryFn: () => apiFetch(`/api/plaid/cash-flow-breakdown?${params}`, { getToken: getIdToken }),
    staleTime: STALE.charts,
    enabled: period !== 'custom' || (!!customRange?.startDate && !!customRange?.endDate),
  })
}

export function useCashFlowNodeTransactions(period, breakdown, flowType, categoryKey, accountIds = [], customRange = null) {
  const { getIdToken } = useAuth()
  const params = new URLSearchParams({ period, breakdown, flow_type: flowType, category_key: categoryKey })
  if (accountIds.length) params.set('account_ids', accountIds.join(','))
  if (period === 'custom' && customRange) {
    params.set('start_date', customRange.startDate)
    params.set('end_date', customRange.endDate)
  }
  return useQuery({
    queryKey: ['cash-flow-node-transactions', period, breakdown, flowType, categoryKey, accountIds, customRange],
    queryFn: () => apiFetch(`/api/plaid/cash-flow-node-transactions?${params}`, { getToken: getIdToken }),
    staleTime: STALE.charts,
    enabled: !!categoryKey && (period !== 'custom' || (!!customRange?.startDate && !!customRange?.endDate)),
  })
}

export function usePortfolioHistory(range, accountIds, options = {}) {
  const { getIdToken } = useAuth()
  return useQuery({
    queryKey: ['portfolio-history', range, accountIds ?? null],
    queryFn: () =>
      apiFetch(`/api/plaid/portfolio-history?range=${range}${accountIds ? `&account_ids=${accountIds}` : ''}`, {
        getToken: getIdToken,
      }),
    staleTime: STALE.charts,
    ...options,
  })
}

export function useTickerHistory(tickers, range, options = {}) {
  const { getIdToken } = useAuth()
  const tickerStr = tickers.join(',')
  return useQuery({
    queryKey: ['ticker-history', tickerStr, range],
    queryFn: () => apiFetch(`/api/plaid/ticker-history?tickers=${tickerStr}&range=${range}`, { getToken: getIdToken }),
    enabled: tickers.length > 0,
    staleTime: STALE.charts,
    ...options,
  })
}

export function useQuotes(tickers) {
  const { getIdToken } = useAuth()
  const tickerStr = tickers.join(',')
  return useQuery({
    queryKey: ['quotes', tickerStr],
    queryFn: () => apiFetch(`/api/plaid/quotes?tickers=${tickerStr}`, { getToken: getIdToken }),
    enabled: tickers.length > 0,
    staleTime: 60_000, // 1 min — quotes are live, no need to cache long
    refetchInterval: 60_000, // auto-refresh every minute when market is open
  })
}

export function useInvestmentTransactions(accountId) {
  const { getIdToken } = useAuth()
  return useQuery({
    queryKey: ['investment-transactions', accountId],
    queryFn: () => apiFetch(`/api/plaid/investment-transactions?account_id=${accountId}`, { getToken: getIdToken }),
    enabled: !!accountId,
    staleTime: STALE.charts,
  })
}

export function useTickerTransactions(ticker) {
  const { getIdToken } = useAuth()
  return useQuery({
    queryKey: ['ticker-transactions', ticker],
    queryFn: () => apiFetch(`/api/plaid/ticker-transactions?ticker=${ticker}`, { getToken: getIdToken }),
    enabled: !!ticker,
    staleTime: STALE.charts,
  })
}

export function usePortfolioSnapshot(date) {
  const { getIdToken } = useAuth()
  return useQuery({
    queryKey: ['portfolio-snapshot', date],
    queryFn: () => apiFetch(`/api/plaid/portfolio-snapshot?date=${date}`, { getToken: getIdToken }),
    enabled: !!date,
    staleTime: Infinity, // historical snapshots never change
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useUpdateTransactionCategory() {
  const { getIdToken } = useAuth()
  return useMutation({
    mutationFn: ({ plaidTransactionId, category, detailedCategory }) =>
      apiFetch(`/api/plaid/transactions/${plaidTransactionId}/category`, {
        method: 'PATCH',
        body: { category, detailed_category: detailedCategory },
        getToken: getIdToken,
      }),
    onSuccess: () => invalidateTransactionData(),
  })
}

export function useUpdateTransactionRecurring() {
  const { getIdToken } = useAuth()
  return useMutation({
    mutationFn: ({ plaidTransactionId, recurring }) =>
      apiFetch(`/api/plaid/transactions/${plaidTransactionId}/recurring`, {
        method: 'PATCH',
        body: { recurring },
        getToken: getIdToken,
      }),
    onSuccess: () => {
      invalidateTransactionData()
      queryClient.invalidateQueries({ queryKey: ['recurring'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Cache invalidation helpers — call these after mutations
// ---------------------------------------------------------------------------

/** Invalidate everything (e.g. after disconnect) */
export function invalidateAll() {
  return queryClient.invalidateQueries()
}

/** Invalidate transaction-derived data (e.g. after sync/refresh) */
export function invalidateTransactionData() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['transactions'] }),
    queryClient.invalidateQueries({ queryKey: ['spending'] }),
    queryClient.invalidateQueries({ queryKey: ['net-worth'] }),
    queryClient.invalidateQueries({ queryKey: ['cash-flow'] }),
    queryClient.invalidateQueries({ queryKey: ['cash-flow-breakdown'] }),
    queryClient.invalidateQueries({ queryKey: ['recurring'] }),
    queryClient.invalidateQueries({ queryKey: ['transaction-categories'] }),
  ])
}

/** Invalidate everything after a new account finishes syncing or disconnecting */
export function invalidateAfterConnect() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['connections'] }),
    queryClient.invalidateQueries({ queryKey: ['accounts'] }),
    queryClient.invalidateQueries({ queryKey: ['investments'] }),
    queryClient.invalidateQueries({ queryKey: ['portfolio-history'] }),
    invalidateTransactionData(),
  ])
}
