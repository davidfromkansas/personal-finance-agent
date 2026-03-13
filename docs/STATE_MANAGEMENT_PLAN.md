# State Management Plan

## Problem

Every page and component fetches its own data independently on mount. There is no shared cache. This causes:

- **Redundant requests** — `/api/plaid/accounts` is called by AccountsPage, InvestmentPortfolio, and previously TransactionsPage. Each page load triggers all of them again.
- **Latency on navigation** — switching from Dashboard → Transactions → Accounts re-fetches everything even if the data hasn't changed.
- **No coordination on invalidation** — when a new account is connected, each component has its own `refresh()` method that the parent must call manually. Easy to miss.

---

## Recommended Solution: TanStack Query

TanStack Query (React Query) is the standard for server state in React apps. It solves all of the above without requiring a global store.

**Key benefits:**

| Feature | What it gives us |
|---|---|
| Shared cache | Same query key → same cached result, regardless of which component requests it |
| Deduplication | Two components mounting simultaneously → one HTTP request |
| Stale-while-revalidate | Shows cached data instantly, re-fetches in background when stale |
| Cache invalidation | `invalidateQueries(['connections'])` → every component using that key re-fetches |
| Background refetch | On window focus, data re-validates silently |

---

## Query Inventory

Every `apiFetch` call in the app maps to a query key. Here is the complete list:

### Global / shared across pages

| Query key | Endpoint | Stale time | Used by |
|---|---|---|---|
| `['connections']` | `GET /api/plaid/connections` | 2 min | LoggedInPage, (future: any page needing account list) |
| `['accounts']` | `GET /api/plaid/accounts` | 2 min | AccountsPage, InvestmentPortfolio |
| `['investments']` | `GET /api/plaid/investments` | 5 min | InvestmentsPage, InvestmentPortfolio |
| `['recurring']` | `GET /api/plaid/recurring` | 5 min | UpcomingPayments |
| `['transaction-accounts']` | `GET /api/plaid/transactions/accounts` | 10 min | TransactionsPage filter panel |
| `['transaction-categories']` | `GET /api/plaid/transactions/categories` | 10 min | TransactionsPage filter panel |

### Parameterized queries

| Query key | Endpoint | Notes |
|---|---|---|
| `['transactions', filters, offset]` | `GET /api/plaid/transactions?...` | One entry per unique filter+offset combo |
| `['spending', period, accountIds]` | `GET /api/plaid/spending-summary?period=X` | 3 entries (week/month/year) |
| `['net-worth', range]` | `GET /api/plaid/net-worth-history?range=X` | 6 entries (1W/1M/3M/YTD/1Y/ALL) |
| `['portfolio-history', range, accountKey]` | `GET /api/plaid/portfolio-history?...` | 6 entries per account selection |
| `['cash-flow']` | `GET /api/plaid/cash-flow?months=24` | Single entry |

### Mutations (write operations)

| Mutation | Endpoint | Cache to invalidate after |
|---|---|---|
| Connect account | `POST /api/plaid/exchange-token` | `['connections']` — then poll until `syncing: false`, then invalidate all |
| Disconnect | `POST /api/plaid/disconnect` | All query keys |
| Refresh connection | `POST /api/plaid/refresh` | `['transactions', ...]`, `['spending', ...]`, `['net-worth', ...]`, `['cash-flow']` |
| Sync | `POST /api/plaid/sync` | Same as refresh |

---

## Cache Invalidation Strategy

When data changes, we invalidate by **prefix** (not exact key) so all parameterized variants are swept at once:

```js
// After disconnect — nuke everything
queryClient.invalidateQueries()

// After refresh — invalidate transaction-derived data only
queryClient.invalidateQueries({ queryKey: ['transactions'] })
queryClient.invalidateQueries({ queryKey: ['spending'] })
queryClient.invalidateQueries({ queryKey: ['net-worth'] })
queryClient.invalidateQueries({ queryKey: ['cash-flow'] })
queryClient.invalidateQueries({ queryKey: ['transaction-categories'] })

// After connect (once syncing: false) — same as refresh + connections
queryClient.invalidateQueries({ queryKey: ['connections'] })
queryClient.invalidateQueries({ queryKey: ['accounts'] })
// ... plus transaction-derived as above
```

This replaces the current manual `ref.current?.refresh()` call pattern scattered across LoggedInPage.

---

## Migration Approach

The migration is incremental — TanStack Query can coexist with the current `useState + useEffect` pattern. We convert one page or component at a time.

### Phase 1 — Setup
- Install `@tanstack/react-query`
- Add `QueryClientProvider` to `App.jsx`
- Create `src/lib/queryClient.js` with shared `QueryClient` config (default stale times, retry policy)
- Create `src/hooks/usePlaidQueries.js` — all query/mutation hooks in one file

### Phase 2 — Quick wins (reference data, high redundancy)
Convert the data that is fetched most redundantly first:
- `['connections']` — currently re-fetched on every dashboard mount
- `['accounts']` — fetched by AccountsPage and InvestmentPortfolio independently
- `['investments']` — fetched by InvestmentsPage and InvestmentPortfolio independently
- `['transaction-accounts']` and `['transaction-categories']` — TransactionsPage filter data

### Phase 3 — Chart components
Convert SpendingCharts, NetWorthChart, CashFlowChart, InvestmentPortfolio to use query hooks. Remove `forwardRef` + `useImperativeHandle` refresh pattern — chart components just read from the cache and re-render when it's invalidated.

### Phase 4 — Transactions pagination
The TransactionsPage has its own in-component `Map` cache for paginated results. TanStack Query has built-in support for infinite queries (`useInfiniteQuery`) which handles this natively.

### Phase 5 — Mutations
Replace the manual `apiFetch` + `spendingRef.current?.refresh()` chain with `useMutation` hooks that automatically invalidate the right cache keys on success.

---

## Open Questions

1. **Stale times** — How fresh does data need to be? Balances feel like they should be fresher than transaction history. Suggested defaults above, but worth confirming.

2. **Background refetch on focus** — TanStack Query re-fetches stale data when the user returns to the browser tab. This is usually good UX but could trigger unnecessary Plaid calls. Should we disable `refetchOnWindowFocus` globally or per-query?

3. **Infinite scroll + TanStack Query** — `useInfiniteQuery` works well for the Transactions page but requires restructuring `fetchPage`. Worth doing in Phase 4 or keep the current Map cache as-is?

4. **forwardRef removal** — Currently SpendingCharts, NetWorthChart, etc. expose `refresh()` to LoggedInPage. With TanStack Query, they just invalidate the cache key and the components re-render automatically. The `forwardRef` pattern goes away entirely — is that desirable now or do it as part of Phase 3?

5. **Polling for sync status** — Currently handled with `setInterval` in `handlePlaidSuccess`. With TanStack Query this could be `useQuery` with `refetchInterval` that stops when `syncing: false`. Cleaner?

---

## Files to Create or Modify

| Action | File | What changes |
|---|---|---|
| Create | `src/lib/queryClient.js` | QueryClient instance with default config |
| Create | `src/hooks/usePlaidQueries.js` | All query + mutation hooks |
| Modify | `src/App.jsx` | Wrap with QueryClientProvider |
| Modify | `src/pages/LoggedInPage.jsx` | Replace local fetches + ref.refresh() calls |
| Modify | `src/pages/TransactionsPage.jsx` | Replace local fetch + Map cache |
| Modify | `src/pages/AccountsPage.jsx` | Replace local fetch |
| Modify | `src/pages/InvestmentsPage.jsx` | Replace local fetch |
| Modify | `src/components/SpendingCharts.jsx` | Replace fetch + remove forwardRef |
| Modify | `src/components/NetWorthChart.jsx` | Replace fetch + remove forwardRef |
| Modify | `src/components/CashFlowChart.jsx` | Replace fetch + remove forwardRef |
| Modify | `src/components/InvestmentPortfolio.jsx` | Replace fetch + remove forwardRef |
| Modify | `src/components/UpcomingPayments.jsx` | Replace local fetch |
