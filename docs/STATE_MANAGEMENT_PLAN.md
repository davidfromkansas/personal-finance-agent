# State Management Plan

## What We're Building (Plain English)

**The goal:** Make the app feel instant. No more waiting every time you switch pages or open a chart tab.

**Requirements:**

1. **Switching between pages should not reload data.** If you look at the Dashboard, then click Transactions, then go back to the Dashboard — none of that should trigger a reload. The app should remember what it already loaded and show it immediately.

2. **Charts should only load the tab you're looking at.** Right now the spending chart and net worth chart secretly load all their tabs at once in the background, even the ones you never open. They should only load a tab when you actually click on it.

3. **Data should quietly stay fresh in the background.** Every few minutes, the app should silently check for updated balances and transactions without interrupting you or showing a loading spinner.

4. **Write actions should feel instant.** When you disconnect an account or hit Refresh, the screen should update immediately — not wait for the server to respond before showing any change.

5. **Loading states should look like the content they're replacing.** Instead of a spinning circle on a blank page, you should see a grayed-out outline of the page layout while data loads. This makes the app feel faster even when it isn't.

6. **The server should do work efficiently.** Some behind-the-scenes Plaid API calls and database lookups that currently run one after another should run at the same time, cutting server response time.

---

## Problem (Technical)

Every page and component fetches its own data independently on mount. There is no shared cache. This causes:

- **Redundant requests** — `/api/plaid/accounts` is called by AccountsPage, InvestmentPortfolio, and previously TransactionsPage. Each page load triggers all of them again.
- **Latency on navigation** — switching from Dashboard → Transactions → Accounts re-fetches everything even if the data hasn't changed.
- **No coordination on invalidation** — when a new account is connected, each component has its own `refresh()` method that the parent must call manually. Easy to miss.
- **Charts pre-fetch all range tabs at once** — SpendingCharts fires 3 requests (week/month/year) and NetWorthChart fires 6 (1W/1M/3M/YTD/1Y/ALL) on mount, even though the user only sees one tab at a time. That's 9 wasted requests on every dashboard load.

---

## Recommended Solution: TanStack Query + localStorage Persistence

TanStack Query (React Query) is the standard for server state in React apps. It solves all of the above without requiring a global store.

**Key benefits:**

| Feature | What it gives us |
|---|---|
| Shared cache | Same query key → same cached result, regardless of which component requests it |
| Deduplication | Two components mounting simultaneously → one HTTP request |
| Stale-while-revalidate | Shows cached data instantly, re-fetches in background when stale |
| Cache invalidation | `invalidateQueries(['connections'])` → every component using that key re-fetches |
| localStorage persistence | Cache survives full page reloads — user sees last-known data in ~0ms, background fetch updates silently |

**`refetchOnWindowFocus` will be disabled globally.** Plaid data doesn't change second-to-second; triggering refetches on tab switch would generate unnecessary load. Users can hit Refresh manually when they want fresh data.

---

## Lazy Chart Loading (Key Architecture Decision)

Charts currently pre-fetch all range tabs on mount. With TanStack Query:

- Only the **active tab** fires a request on mount
- Other tabs fetch on first click, then are cached for the session
- No `forwardRef` + `useImperativeHandle` refresh pattern — charts just read from the cache and re-render when it's invalidated

This alone cuts 7–8 requests from the initial dashboard load down to 1–2.

**Why not a single bootstrap endpoint?**
A bootstrap endpoint (`GET /api/plaid/bootstrap`) would bundle all dashboard data into one request. The problem: everything is coupled under one cache key. You lose the ability to set different stale times per data type and you can't invalidate "just transactions" without refetching connections and accounts too. The granular caching is worth more than saving the parallel requests, which complete in ~200ms anyway.

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

### Parameterized queries (lazy — fetch active tab only)

| Query key | Endpoint | Notes |
|---|---|---|
| `['transactions', filters, offset]` | `GET /api/plaid/transactions?...` | One entry per unique filter+offset combo |
| `['spending', period, accountIds]` | `GET /api/plaid/spending-summary?period=X` | Fetch active period only; others load on tab click |
| `['net-worth', range]` | `GET /api/plaid/net-worth-history?range=X` | Fetch active range only; others load on tab click |
| `['portfolio-history', range, accountKey]` | `GET /api/plaid/portfolio-history?...` | Fetch active range only; others load on tab click |
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

### Phase 1 — Setup ✅
- Install `@tanstack/react-query`
- Add `QueryClientProvider` to `App.jsx`
- Create `src/lib/queryClient.js` with shared `QueryClient` config:
  - `refetchOnWindowFocus: false` globally
  - Default stale times per query type
- Create `src/hooks/usePlaidQueries.js` — all query/mutation hooks in one file

### Phase 2 — Quick wins (reference data, high redundancy) ✅
Convert the data that is fetched most redundantly first:
- `['connections']` — currently re-fetched on every dashboard mount
- `['accounts']` — fetched by AccountsPage and InvestmentPortfolio independently
- `['investments']` — fetched by InvestmentsPage and InvestmentPortfolio independently
- `['transaction-accounts']` and `['transaction-categories']` — TransactionsPage filter data

### Phase 3 — Chart components + UpcomingPayments (lazy tab loading) ✅
Convert SpendingCharts, NetWorthChart, CashFlowChart, InvestmentPortfolio to use query hooks. Each chart only fetches the active tab on mount; other tabs load on first click and are then cached. Remove `forwardRef` + `useImperativeHandle` refresh pattern — chart components just read from the cache and re-render when it's invalidated.

Also fixed: UpcomingPayments migrated to `useRecurring()` hook and `['recurring']` added to `invalidateTransactionData()`. Server-side `/api/plaid/recurring` parallelized — previously called `transactionsRecurringGet` + `liabilitiesGet` **sequentially per item** (worst case: N items × 2 Plaid calls in series). Now both calls run concurrently per item and all items run concurrently via `Promise.all`, cutting load time from O(N×2) serial to O(1) parallel.

### Phase 4 — Transactions pagination ✅
Migrated to `useInfiniteQuery` with `queryKey: ['transactions', filterParams]` (UI-only `preset` field stripped from the key so it doesn't cause spurious cache misses). Filters changing resets to page 0 automatically via key change. Returning to the Transactions tab within the 2-min stale window shows cached data immediately — no reload. Removed the in-component `Map` cache, `fetchPage`, `offsetRef`, and the filter `useEffect`.

### Phase 5 — Mutations + polling ✅
- `handleDisconnect` and `handleRefresh` converted to `useMutation` — `onSuccess`/`onError` handle cache invalidation and error display respectively.
- `setInterval` polling after account connect replaced: `useConnections()` now accepts a `refetchInterval` option; `isPolling` state drives `refetchInterval: 3000`; a `useEffect` watching `connections` calls `setIsPolling(false)` + `invalidateTransactionData()` the moment no connections report `syncing: true`. No more manual `clearInterval` or `getQueryData` calls.

### Phase 6 — Optimistic updates
For write actions (disconnect, refresh), update the UI immediately before the server responds. If the server returns an error, roll back. Makes destructive actions feel instant instead of showing a loading state.

Priority mutations for optimistic updates:
- **Disconnect** — remove the connection from the list immediately, restore it if the server call fails
- **Refresh** — immediately mark the connection as "syncing" in the UI without waiting for the server to confirm

### Phase 7 — Server-side parallel DB queries
Audit server routes for sequential database queries that could run in parallel with `Promise.all`. Focus on chart routes (`/spending-summary`, `/net-worth-history`, `/cash-flow`) which may be doing multiple DB calls in series.

### Phase 8 — Consistent skeleton screens
Audit every page and component for loading states. Replace full-page spinners and blank states with skeleton placeholders that match the shape of the content. Users perceive skeleton screens as faster even when load time is identical.

Pages/components to audit:
- AccountsPage — currently shows a spinner for the full page
- InvestmentsPage — currently shows a spinner for the full page
- UpcomingPayments — currently blank while loading
- Transaction rows on dashboard — currently absent until loaded

---

## Decisions Made

| Question | Decision |
|---|---|
| Stale times | connections/accounts: 2 min; charts/investments: 5 min; filter reference data: 10 min |
| `refetchOnWindowFocus` | Disabled globally — Plaid data doesn't change second-to-second |
| localStorage persistence | **No** — financial data should be fresh on reload; in-memory cache covers the navigation case |
| Bootstrap endpoint | **No** — granular per-key caching and invalidation is worth more than saving parallel requests |
| Lazy chart tabs | **Yes** — only fetch active tab on mount; cuts 7–8 initial requests to 1–2 |
| `forwardRef` removal | **Yes** — remove as part of Phase 3; charts read from cache directly |
| `useInfiniteQuery` for transactions | **Yes** — Phase 4; replaces in-component Map cache |
| Polling for sync status | **Yes** — replace setInterval with `useQuery` + `refetchInterval` in Phase 5 |
| Optimistic updates | **Yes** — Phase 6; disconnect and refresh feel instant |
| Server-side parallelism | **Yes** — Phase 7; audit chart routes for sequential DB queries |
| Skeleton screens | **Yes** — Phase 8; consistent across all pages |

---

## Files to Create or Modify

| Action | File | What changes |
|---|---|---|
| Create | `src/lib/queryClient.js` | QueryClient instance with default config |
| Create | `src/hooks/usePlaidQueries.js` | All query + mutation hooks |
| Modify | `src/App.jsx` | Wrap with QueryClientProvider |
| Modify | `src/pages/LoggedInPage.jsx` | Replace local fetches + ref.refresh() calls + setInterval polling |
| Modify | `src/pages/TransactionsPage.jsx` | Replace local fetch + Map cache with useInfiniteQuery |
| Modify | `src/pages/AccountsPage.jsx` | Replace local fetch + add skeleton loading |
| Modify | `src/pages/InvestmentsPage.jsx` | Replace local fetch + add skeleton loading |
| Modify | `src/components/SpendingCharts.jsx` | Replace fetch + remove forwardRef + lazy tab loading |
| Modify | `src/components/NetWorthChart.jsx` | Replace fetch + remove forwardRef + lazy tab loading |
| Modify | `src/components/CashFlowChart.jsx` | Replace fetch + remove forwardRef |
| Modify | `src/components/InvestmentPortfolio.jsx` | Replace fetch + remove forwardRef + lazy tab loading |
| Modify | `src/components/UpcomingPayments.jsx` | Replace local fetch + add skeleton loading |
| Modify | `server/routes/plaid.js` | Audit for sequential DB queries → parallelize with Promise.all |
