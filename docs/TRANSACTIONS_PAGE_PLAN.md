# Transactions Page Plan

## Goals

- Full-page experience — remove the module/card wrapper, let the transaction list breathe
- Sort: most recent (default), oldest, amount high→low, amount low→high
- Filter: account, date (presets + custom range), category (dynamic from user's data)
- All filters apply together (AND logic)
- Server-side filtering with client-side caching to avoid redundant fetches

---

## UX Layout

```
[AppHeader]

Transactions                          [Sort ▾]  [Filter ▾]  [active filter pills ×]

──────────────────────────────────────────────────────
  date group header (e.g. "March 13, 2026")
  [TransactionRow]
  [TransactionRow]
  date group header
  [TransactionRow]
  ...
──────────────────────────────────────────────────────
  [Load more] (if more results available)
```

- No card/shadow wrapper around the list. Just the header bar + rows on the page background.
- Active filters show as dismissible pills below the sort/filter buttons ("Chase Checking × | Last 30 days × | Food and Drink ×"). Clicking × removes that filter and re-fetches.
- Sort and Filter each open a small dropdown/panel (not a modal — keep it lightweight).
- Transaction rows remain the same component (`TransactionRow`) so the detail side panel still works.

---

## Sort Options

Dropdown triggered by "Sort" button. Radio-style selection.

| Label | Behavior |
|---|---|
| Most recent (default) | `ORDER BY date DESC, authorized_date DESC` |
| Oldest first | `ORDER BY date ASC, authorized_date ASC` |
| Amount: high to low | `ORDER BY amount DESC` (Plaid: positive = expense) |
| Amount: low to high | `ORDER BY amount ASC` |

Sort is passed to the backend as a `sort` query param. No client-side re-sorting — the server returns rows in the right order so pagination stays correct.

---

## Filter Options

Filter panel triggered by "Filter" button. Multiple sections, all optional.

### Account

- Source: `GET /api/plaid/accounts` (already exists)
- Exclude `type = 'investment'` or `type = 'brokerage'` — checking, savings, credit card only
- Multi-select checkboxes. Default: all accounts selected (no filter applied)
- Passed to backend as `account_ids=id1&account_ids=id2`

### Date

Preset ranges (single-select):

| Label | What it sends |
|---|---|
| Last 7 days | `after_date = today - 7d` |
| Last 30 days | `after_date = today - 30d` |
| Last 90 days | `after_date = today - 90d` |
| This year | `after_date = Jan 1 of current year` |
| All time | no date params |
| Custom range | opens two date inputs (start / end) |

Custom range: two `<input type="date">` fields. "Apply" button sends `after_date` + `before_date`.

Default: All time (no date filter).

### Category

- Source: `GET /api/plaid/transactions/categories` — new endpoint (see Backend section)
- Returns distinct `personal_finance_category` values from the user's transactions, sorted alphabetically
- Multi-select checkboxes. Default: all (no filter)
- Passed to backend as `categories=Food and Drink&categories=Transportation`
- List grows automatically as new transactions arrive with new categories

---

## Backend Changes

### 1. Extend `GET /api/plaid/transactions`

Add new optional query params (all existing params still work):

| Param | Type | Description |
|---|---|---|
| `sort` | string | `recent` (default) \| `oldest` \| `amount_desc` \| `amount_asc` |
| `account_ids` | string[] | Filter to specific account IDs (repeatable param) |
| `categories` | string[] | Filter to specific `personal_finance_category` values (repeatable param) |
| `before_date` | ISO date | Already exists |
| `after_date` | ISO date | Already exists |
| `limit` | number | Already exists (default 50, max 500) |
| `offset` | number | New — for pagination (replaces cursor-based) |

Response stays the same shape: `{ transactions: [...], total: N, has_more: boolean }`. Add `total` so the frontend can show "Showing 50 of 312 transactions" and know when to stop offering "Load more".

### 2. Update `getRecentTransactions` in `server/db.js`

Extend the SQL query to accept the new filters and sort:

```sql
SELECT * FROM transactions
WHERE user_id = $1
  AND ($account_ids IS NULL OR account_id = ANY($account_ids))
  AND ($categories IS NULL OR personal_finance_category = ANY($categories))
  AND ($after_date IS NULL OR date >= $after_date)
  AND ($before_date IS NULL OR date <= $before_date)
  AND pending = false
ORDER BY
  CASE WHEN $sort = 'oldest'      THEN date END ASC,
  CASE WHEN $sort = 'amount_desc' THEN amount END DESC,
  CASE WHEN $sort = 'amount_asc'  THEN amount END ASC,
  date DESC  -- default: most recent
LIMIT $limit OFFSET $offset
```

Also add a `COUNT(*)` query with the same WHERE clause (no LIMIT/OFFSET) to return `total`.

### 3. New endpoint: `GET /api/plaid/transactions/categories`

Returns the distinct categories in the user's transaction history:

```javascript
// server/db.js
async function getTransactionCategories(userId) {
  const result = await query(
    `SELECT DISTINCT personal_finance_category
     FROM transactions
     WHERE user_id = $1
       AND personal_finance_category IS NOT NULL
     ORDER BY personal_finance_category`,
    [userId]
  )
  return result.rows.map(r => r.personal_finance_category)
}
```

Route: `GET /api/plaid/transactions/categories` → `{ categories: ['Food and Drink', 'Shopping', ...] }`

No caching needed server-side — it's a fast indexed query. Frontend caches it for the session.

---

## Frontend Changes

### `src/pages/TransactionsPage.jsx` — full rewrite

Key state:

```javascript
const [transactions, setTransactions] = useState([])
const [total, setTotal] = useState(0)
const [loading, setLoading] = useState(true)
const [loadingMore, setLoadingMore] = useState(false)

// Sort & filter state
const [sort, setSort] = useState('recent')
const [filters, setFilters] = useState({
  account_ids: [],   // [] = no filter (all)
  categories: [],    // [] = no filter (all)
  after_date: null,
  before_date: null,
})

// Reference data
const [accounts, setAccounts] = useState([])          // from /api/plaid/accounts
const [allCategories, setAllCategories] = useState([]) // from /api/plaid/transactions/categories

// Client-side cache
const cache = useRef(new Map())  // key: query string → value: { transactions, total }
```

**Caching logic:**

```javascript
function buildCacheKey(sort, filters, offset) {
  return JSON.stringify({ sort, ...filters, offset })
}

async function fetchTransactions(offset = 0, append = false) {
  const key = buildCacheKey(sort, filters, offset)
  if (cache.current.has(key)) {
    const cached = cache.current.get(key)
    if (append) setTransactions(prev => [...prev, ...cached.transactions])
    else setTransactions(cached.transactions)
    setTotal(cached.total)
    return
  }
  // ... build params, fetch, store in cache, update state
  cache.current.set(key, { transactions: data.transactions, total: data.total })
}
```

Cache is in-component memory — cleared on page unmount. This avoids refetching when the user toggles filters back to a previous combination within the same session.

**Pagination:**

- Initial fetch: 50 transactions
- "Load more" button at bottom: fetches next 50 (offset += 50), appends to list
- Show "Showing X of Y transactions" count

**Layout (no card wrapper):**

```jsx
<div className="min-h-screen bg-[#f8f8f8]">
  <AppHeader />
  <main className="px-4 sm:px-6 lg:px-8 py-8">
    <div className="mx-auto max-w-3xl">

      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#18181b]">Transactions</h1>
          <p className="text-sm text-[#71717a]">Showing {showing} of {total}</p>
        </div>
        <div className="flex gap-2">
          <SortButton sort={sort} onChange={setSort} />
          <FilterButton filters={filters} accounts={accounts} categories={allCategories} onChange={setFilters} />
        </div>
      </div>

      {/* Active filter pills */}
      <ActiveFilterPills filters={filters} sort={sort} onRemove={...} />

      {/* Transaction rows — grouped by date, no card wrapper */}
      <TransactionDateGroups transactions={transactions} loading={loading} />

      {/* Load more */}
      {transactions.length < total && (
        <button onClick={loadMore}>Load more</button>
      )}

    </div>
  </main>
</div>
```

### New components (all in `TransactionsPage.jsx` or a co-located file)

- `SortButton` — button + dropdown with 4 sort options (radio)
- `FilterButton` — button + panel with account/date/category sections
- `ActiveFilterPills` — renders one dismissible pill per active filter
- `TransactionDateGroups` — groups transactions by date, renders date headers + `TransactionRow` (reused from LoggedInPage)

`TransactionDetailPanel` and `TransactionRow` are already exported (or importable) from `LoggedInPage.jsx`. Reuse them directly.

---

## Pagination Strategy

| Scenario | Behavior |
|---|---|
| Initial load / filter change | Fetch offset=0, limit=50. Replace list. |
| "Load more" clicked | Fetch offset=current count, limit=50. Append to list. |
| Sort change | Reset to offset=0. Fetch fresh (check cache first). |
| Filter change | Reset to offset=0. Fetch fresh (check cache first). |
| Remove a filter pill | Same as filter change — reset + fetch. |

"Load more" instead of pagination pages — simpler, no page state to manage, works well for a finance feed.

---

## Files to Create or Modify

| Action | File | What changes |
|---|---|---|
| Rewrite | `src/pages/TransactionsPage.jsx` | Full-page layout, sort/filter state, caching, load more |
| Modify | `server/db.js` | Extend `getRecentTransactions` with sort/account/category params + total count; add `getTransactionCategories` |
| Modify | `server/routes/plaid.js` | Parse new query params; add `GET /transactions/categories` route |

No new migrations needed — all filtering is on existing columns.

---

## Open Questions

1. **Empty state:** When filters return 0 results, show "No transactions match your filters" with a "Clear filters" link — straightforward, just confirming.
2. **Search:** Not in scope for this plan, but a natural next addition (text search on `name` / `merchant_name`). Easy to add as another filter param later.
