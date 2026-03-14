import { QueryClient } from '@tanstack/react-query'

const MIN = 1000 * 60

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Never refetch just because the user switched browser tabs
      refetchOnWindowFocus: false,
      // Retry once on failure before showing an error
      retry: 1,
    },
  },
})

// Stale times by data type — import and use these in each query hook
export const STALE = {
  connections: 2 * MIN,        // balances — reasonably fresh
  accounts: 2 * MIN,
  investments: 5 * MIN,        // slower-moving
  charts: 5 * MIN,
  recurring: 5 * MIN,
  refData: 10 * MIN,           // filter options (accounts/categories) — rarely changes
}

export default queryClient
