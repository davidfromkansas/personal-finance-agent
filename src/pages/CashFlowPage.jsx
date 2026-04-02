import { useState, useMemo, useEffect } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine,
} from 'recharts'
import { AppHeader } from '../components/AppHeader'
import { SankeyDiagram } from '../components/SankeyDiagram'
import { TransactionDetailPanel, bestLogoUrl } from '../components/TransactionDetailPanel'
import { useCashFlowBreakdown, useCashFlowNodeTransactions, useCashFlowTimeSeries, useCashFlowTransactionsByRange, useTransactionAccounts } from '../hooks/usePlaidQueries'

const VIEW_MODES = [
  { key: 'sankey', label: 'Cash Flow Breakdown' },
  { key: 'bar', label: 'Cash Flow Over Time' },
]

const PERIODS = [
  { key: 'week', label: 'Last Week' },
  { key: 'month', label: 'Last Month' },
  { key: 'quarter', label: 'Last 3 Months' },
  { key: 'ytd', label: 'Year to Date' },
  { key: 'year', label: 'Last Year' },
  { key: 'custom', label: 'Custom' },
]

const BREAKDOWNS = [
  { key: 'category', label: 'Category' },
  { key: 'merchant', label: 'Merchant' },
]

function formatCurrency(value) {
  if (value == null) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value)
}

function SegmentedButtons({ options, value, onChange }) {
  return (
    <div className="flex items-center rounded-lg border border-[#d1d5dc] bg-[#f9fafb] p-0.5">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
            value === opt.key
              ? 'bg-white text-[#101828] shadow-sm border border-[#d1d5dc]'
              : 'text-[#6a7282] hover:text-[#101828]'
          }`}
          style={{ fontFamily: 'JetBrains Mono,monospace' }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function AccountFilter({ selectedIds, onChange }) {
  const { data } = useTransactionAccounts()
  const accounts = data?.accounts ?? []
  const [open, setOpen] = useState(false)

  if (accounts.length === 0) return null

  const allSelected = !selectedIds
  const label = allSelected ? 'All accounts' : `${selectedIds.length} account${selectedIds.length !== 1 ? 's' : ''}`

  function toggle(id) {
    if (!selectedIds) {
      // "All accounts" is active — select only this one
      onChange([id])
    } else if (selectedIds.includes(id)) {
      const next = selectedIds.filter((x) => x !== id)
      onChange(next.length === 0 ? null : next)
    } else {
      const next = [...selectedIds, id]
      onChange(next.length === accounts.length ? null : next)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-[#d1d5dc] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6a7282] hover:text-[#101828] transition-colors cursor-pointer"
        style={{ fontFamily: 'JetBrains Mono,monospace' }}
      >
        {label} <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-[56] bg-white border border-[#9ca3af] rounded-lg shadow-lg py-1 min-w-[200px] max-h-[300px] overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-[12px] hover:bg-[#f9fafb] transition-colors flex items-center gap-2 ${allSelected ? 'text-[#101828] font-medium' : 'text-[#6a7282]'}`}
              style={{ fontFamily: 'JetBrains Mono,monospace' }}
            >
              {allSelected && <CheckSvg />} All accounts
            </button>
            {accounts.map((a) => {
              const checked = !selectedIds || selectedIds.includes(a.account_id)
              return (
                <button
                  key={a.account_id}
                  type="button"
                  onClick={() => toggle(a.account_id)}
                  className={`w-full text-left px-4 py-2 text-[12px] hover:bg-[#f9fafb] transition-colors flex items-center gap-2 ${checked && selectedIds ? 'text-[#101828] font-medium' : 'text-[#6a7282]'}`}
                  style={{ fontFamily: 'JetBrains Mono,monospace' }}
                >
                  {checked && selectedIds && <CheckSvg />}
                  <span className="truncate">{a.account_name}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function CheckSvg() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
      <path d="M2 6l3 3 5-5" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrendIndicator({ current, previous, invertColor = false }) {
  if (previous == null || previous === 0) return null
  const pct = ((current - previous) / Math.abs(previous)) * 100
  if (!isFinite(pct) || Math.abs(pct) < 0.1) return null
  const isUp = pct > 0
  // For expenses, "up" is bad (red) and "down" is good (green). For income/net/savings, it's the opposite.
  const isPositive = invertColor ? !isUp : isUp
  const color = isPositive ? '#059669' : '#dc2626'
  const arrow = isUp ? '\u2191' : '\u2193'
  return (
    <span className="block text-[11px] font-medium mt-0.5" style={{ fontFamily: 'JetBrains Mono,monospace', color }}>
      {arrow} {Math.abs(pct).toFixed(1)}% vs prior
    </span>
  )
}

function SummaryCard({ income, expenses, priorIncome, priorExpenses }) {
  const incomeTotal = income?.total ?? 0
  const expenseTotal = expenses?.total ?? 0
  const net = incomeTotal - expenseTotal
  const savingsRate = incomeTotal > 0 ? ((net / incomeTotal) * 100) : 0

  const priorIncomeTotal = priorIncome?.total ?? null
  const priorExpenseTotal = priorExpenses?.total ?? null
  const priorNet = priorIncomeTotal != null && priorExpenseTotal != null ? priorIncomeTotal - priorExpenseTotal : null
  const priorSavingsRate = priorIncomeTotal != null && priorIncomeTotal > 0 ? ((priorNet / priorIncomeTotal) * 100) : null

  return (
    <div className="grid grid-cols-4">
      {[
        { label: 'Total Income', value: formatCurrency(incomeTotal), color: 'text-[#101828]', fontWeight: 'font-bold', trend: <TrendIndicator current={incomeTotal} previous={priorIncomeTotal} /> },
        { label: 'Total Expenses', value: formatCurrency(expenseTotal), color: 'text-[#dc2626]', fontWeight: 'font-semibold', trend: <TrendIndicator current={expenseTotal} previous={priorExpenseTotal} invertColor /> },
        { label: 'Total Net Income', value: formatCurrency(net), color: net >= 0 ? 'text-[#155dfc]' : 'text-[#dc2626]', fontWeight: 'font-semibold', trend: <TrendIndicator current={net} previous={priorNet} /> },
        { label: 'Savings Rate', value: `${savingsRate.toFixed(1)}%`, color: savingsRate >= 0 ? 'text-[#155dfc]' : 'text-[#dc2626]', fontWeight: 'font-semibold', trend: <TrendIndicator current={savingsRate} previous={priorSavingsRate} /> },
      ].map((item, i) => (
        <div key={item.label} className={`px-4 py-3.5 ${i > 0 ? 'border-l border-[#e5e7eb]' : ''}`}>
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#6a7282] mb-1" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            {item.label}
          </p>
          <p className={`text-[18px] ${item.fontWeight} ${item.color}`} style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            {item.value}
          </p>
          {item.trend}
        </div>
      ))}
    </div>
  )
}

// ── Drill-down transaction row (matches CashFlowChart pattern) ───────────

function DrillDownRow({ transaction, onClick }) {
  const amt = Number(transaction.amount)
  const isCredit = amt < 0
  const displayAmt = isCredit ? `+$${Math.abs(amt).toFixed(2)}` : `-$${Math.abs(amt).toFixed(2)}`
  const amtColor = isCredit ? 'text-[#155dfc]' : 'text-[#dc2626]'
  const logo = bestLogoUrl(transaction)
  const initial = (transaction.name ?? '?')[0].toUpperCase()

  return (
    <div
      className="flex h-[40px] shrink-0 items-center justify-between gap-2 rounded-[8px] px-2 cursor-pointer hover:bg-[#f0f0f0] transition-colors"
      onClick={() => onClick(transaction)}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {logo ? (
          <div className="relative h-5 w-5 shrink-0">
            <img src={logo} alt="" className="h-5 w-5 rounded-full border border-[#9ca3af] object-contain bg-white"
              onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
            <div className="absolute inset-0 hidden items-center justify-center rounded-full border border-[#9ca3af] bg-[#f9fafb] text-[8px] font-bold text-[#4a5565]"
              style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
          </div>
        ) : (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#9ca3af] bg-[#f9fafb] text-[8px] font-bold text-[#4a5565]"
            style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[13px] leading-5 text-[#101828]"
            style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            {transaction.merchant_name || transaction.name}
          </p>
          <p className="truncate text-[11px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            {transaction.date}
          </p>
        </div>
      </div>
      <span className={`shrink-0 text-right font-bold text-[13px] leading-5 ${amtColor}`}
        style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        {displayAmt}
      </span>
    </div>
  )
}

// ── Drill-down side panel ────────────────────────────────────────────────

function NodeDrillDownPanel({ node, period, breakdown, accountIds, customRange, onClose }) {
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const open = !!node

  const flowType = node?.side === 'income' ? 'income' : 'expense'
  const categoryKey = node?.bucketedKeys ? node.bucketedKeys.join(',') : (node?.rawKey ?? '')
  const { data, isLoading } = useCashFlowNodeTransactions(
    period, breakdown, flowType, categoryKey, accountIds, customRange
  )
  const transactions = data?.transactions ?? []
  const total = transactions.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

  return (
    <>
      {open && !selectedTransaction && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      )}
      <div className={`fixed right-0 top-0 z-50 flex h-full w-[480px] flex-col border-l border-[#d9d9d9] bg-white shadow-xl transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#d9d9d9] px-5 py-4">
          <div>
            <p className="text-[16px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              {node?.name ?? ''}
            </p>
            <p className="text-[12px] mt-0.5" style={{ fontFamily: 'JetBrains Mono,monospace', color: flowType === 'income' ? '#1e40af' : '#dc2626' }}>
              {flowType === 'income' ? 'Inflow' : 'Outflow'} · {formatCurrency(node?.value ?? 0)}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="text-[#999] hover:text-[#1e1e1e] transition-colors text-xl leading-none cursor-pointer">×</button>
        </div>

        {/* Transaction count */}
        {!isLoading && transactions.length > 0 && (
          <div className="shrink-0 border-b border-[#f3f4f6] px-5 py-2">
            <span className="text-[11px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} · Total: {formatCurrency(total)}
            </span>
          </div>
        )}

        {/* Transaction list */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading…</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-[13px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>No transactions found</span>
            </div>
          ) : (
            <div className="space-y-0.5">
              {transactions.map((t) => (
                <DrillDownRow key={t.id} transaction={t} onClick={setSelectedTransaction} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Transaction detail panel stacks above */}
      <TransactionDetailPanel
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        zBackdrop="z-[60]"
        zPanel="z-[70]"
      />
    </>
  )
}

// ── Over Time bar chart ───────────────────────────────────────────────

const BAR_POSITIVE_COLOR = '#1e40af'
const BAR_NEGATIVE_COLOR = '#dc2626'
const LINE_NET_COLOR = '#111827'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatBucketLabel(bucket, granularity) {
  if (granularity === 'day') {
    const [, m, d] = bucket.split('-')
    return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`
  }
  if (granularity === 'week') {
    const [, m, d] = bucket.split('-')
    return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`
  }
  // month: YYYY-MM
  const [y, m] = bucket.split('-')
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`
}

function BarChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const inflow = payload.find((p) => p.dataKey === 'inflows')?.value ?? 0
  const negFlow = payload.find((p) => p.dataKey === 'negativeFlow')?.value ?? 0
  const outflow = negFlow <= 0 ? Math.abs(negFlow) : 0
  const net = inflow - outflow
  return (
    <div className="rounded-lg border border-[#9ca3af] bg-white px-3 py-2.5 shadow-sm min-w-[160px]">
      <p className="text-[12px] font-medium text-[#6a7282] mb-1.5" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{label}</p>
      <div className="flex items-center justify-between gap-4 py-0.5">
        <span className="text-[12px] text-[#4a5565]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Inflows</span>
        <span className="text-[12px] font-medium" style={{ fontFamily: 'JetBrains Mono,monospace', color: BAR_POSITIVE_COLOR }}>{formatCurrency(inflow)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 py-0.5">
        <span className="text-[12px] text-[#4a5565]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Outflows</span>
        <span className="text-[12px] font-medium" style={{ fontFamily: 'JetBrains Mono,monospace', color: BAR_NEGATIVE_COLOR }}>{formatCurrency(outflow)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-[#9ca3af] mt-1.5 pt-1.5">
        <span className="text-[12px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Net</span>
        <span className="text-[12px] font-semibold" style={{ fontFamily: 'JetBrains Mono,monospace', color: net >= 0 ? BAR_POSITIVE_COLOR : BAR_NEGATIVE_COLOR }}>
          {formatCurrency(net)}
        </span>
      </div>
    </div>
  )
}

/** Compute the date range for a clicked bucket based on granularity. */
function bucketToDateRange(bucket, granularity) {
  if (granularity === 'day') {
    return { startDate: bucket, endDate: bucket }
  }
  if (granularity === 'week') {
    const start = new Date(bucket + 'T00:00:00')
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return { startDate: bucket, endDate: formatDateInput(end) }
  }
  // month: YYYY-MM
  const [y, m] = bucket.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 0) // last day of month
  return { startDate: formatDateInput(start), endDate: formatDateInput(end) }
}

function formatBucketRangeLabel(bucket, granularity) {
  if (granularity === 'day') {
    const [, m, d] = bucket.split('-')
    return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`
  }
  if (granularity === 'week') {
    const { startDate, endDate } = bucketToDateRange(bucket, granularity)
    const [, sm, sd] = startDate.split('-')
    const [, em, ed] = endDate.split('-')
    return `${MONTH_NAMES[parseInt(sm, 10) - 1]} ${parseInt(sd, 10)} – ${MONTH_NAMES[parseInt(em, 10) - 1]} ${parseInt(ed, 10)}`
  }
  const [y, m] = bucket.split('-')
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`
}

// ── Sort helpers for drill-down ──────────────────────────────────────────

const SORT_OPTIONS = [
  { key: 'recent', label: 'Most recent' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'expensive', label: 'Most expensive' },
  { key: 'cheapest', label: 'Cheapest' },
]

function applySortAndSearch(txns, query, sortKey) {
  let filtered = txns
  if (query) {
    filtered = txns.filter(t => {
      const name = (t.merchant_name || t.name || '').toLowerCase()
      return name.includes(query)
    })
  }
  const sorted = [...filtered]
  if (sortKey === 'recent') sorted.sort((a, b) => (b.date > a.date ? 1 : -1))
  else if (sortKey === 'oldest') sorted.sort((a, b) => (a.date > b.date ? 1 : -1))
  else if (sortKey === 'expensive') sorted.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  else if (sortKey === 'cheapest') sorted.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount))
  return sorted
}

// ── Time-series drill-down tray ──────────────────────────────────────────

function TimeSeriesDrillDownTray({ bucket, granularity, onClose }) {
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('recent')
  const [sortOpen, setSortOpen] = useState(false)

  const range = bucket ? bucketToDateRange(bucket, granularity) : { startDate: null, endDate: null }
  const { data, isLoading } = useCashFlowTransactionsByRange(range.startDate, range.endDate)
  useEffect(() => { setSearch(''); setSortKey('recent') }, [bucket])
  const open = !!bucket

  const allInflows = data?.inflows ?? []
  const allOutflows = data?.outflows ?? []
  const net = allInflows.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
            - allOutflows.reduce((s, t) => s + Number(t.amount), 0)

  const q = search.trim().toLowerCase()
  const inflows = applySortAndSearch(allInflows, q, sortKey)
  const outflows = applySortAndSearch(allOutflows, q, sortKey)
  const totalInflows = inflows.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  const totalOutflows = outflows.reduce((s, t) => s + Number(t.amount), 0)

  return (
    <>
      {open && !selectedTransaction && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      )}
      <div className={`fixed right-0 top-0 z-50 flex h-full w-[672px] flex-col border-l border-[#d9d9d9] bg-white shadow-xl transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#d9d9d9] px-5 py-4">
          <div>
            <p className="text-[16px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              {bucket ? formatBucketRangeLabel(bucket, granularity) : ''}
            </p>
            {!isLoading && (
              <p className="text-[12px] mt-0.5" style={{ fontFamily: 'JetBrains Mono,monospace', color: net >= 0 ? BAR_POSITIVE_COLOR : BAR_NEGATIVE_COLOR }}>
                Net {net >= 0 ? '+' : ''}{formatCurrency(net)}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose}
            className="text-[#999] hover:text-[#1e1e1e] transition-colors text-xl leading-none cursor-pointer">×</button>
        </div>

        {!isLoading && (
          <div className="relative shrink-0 flex items-center justify-between gap-3 border-b border-[#f3f4f6] px-5 py-2">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search transactions..."
              className="flex-1 text-[12px] text-[#1e1e1e] placeholder-[#9ca3af] bg-transparent outline-none min-w-0"
              style={{ fontFamily: 'JetBrains Mono,monospace' }}
            />
            <button
              type="button"
              onClick={() => setSortOpen(v => !v)}
              className="flex items-center gap-1 text-[11px] text-[#6a7282] hover:text-[#1e1e1e] transition-colors cursor-pointer shrink-0"
              style={{ fontFamily: 'JetBrains Mono,monospace' }}
            >
              Sort: {SORT_OPTIONS.find(o => o.key === sortKey)?.label} ▾
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-[55]" onClick={() => setSortOpen(false)} />
                <div className="absolute right-5 top-full mt-1 z-[56] bg-white border border-[#9ca3af] rounded-lg shadow-lg py-1 min-w-[160px]">
                  {SORT_OPTIONS.map(o => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => { setSortKey(o.key); setSortOpen(false) }}
                      className={`w-full text-left px-4 py-2 text-[12px] hover:bg-[#f9fafb] transition-colors ${sortKey === o.key ? 'text-[#1e1e1e] font-medium' : 'text-[#6a7282]'}`}
                      style={{ fontFamily: 'JetBrains Mono,monospace' }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex-1 overflow-hidden flex">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading…</span>
            </div>
          ) : (
            <>
              {/* Inflows column */}
              <div className="flex-1 overflow-y-auto border-r border-[#9ca3af] px-3 pt-4 pb-4">
                <div className="flex items-center justify-between mb-2 gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ fontFamily: 'JetBrains Mono,monospace', color: BAR_POSITIVE_COLOR }}>
                    In ({inflows.length})
                  </span>
                  <span className="text-[11px] font-semibold" style={{ fontFamily: 'JetBrains Mono,monospace', color: BAR_POSITIVE_COLOR }}>
                    +{formatCurrency(totalInflows)}
                  </span>
                </div>
                {inflows.length === 0 ? (
                  <p className="text-[12px] text-[#9ca3af] py-2" style={{ fontFamily: 'JetBrains Mono,monospace' }}>None</p>
                ) : (
                  <div className="space-y-0.5">
                    {inflows.map((t) => (
                      <DrillDownRow key={t.id} transaction={t} onClick={setSelectedTransaction} />
                    ))}
                  </div>
                )}
              </div>

              {/* Outflows column */}
              <div className="flex-1 overflow-y-auto px-3 pt-4 pb-4">
                <div className="flex items-center justify-between mb-2 gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ fontFamily: 'JetBrains Mono,monospace', color: BAR_NEGATIVE_COLOR }}>
                    Out ({outflows.length})
                  </span>
                  <span className="text-[11px] font-semibold" style={{ fontFamily: 'JetBrains Mono,monospace', color: BAR_NEGATIVE_COLOR }}>
                    -{formatCurrency(totalOutflows)}
                  </span>
                </div>
                {outflows.length === 0 ? (
                  <p className="text-[12px] text-[#9ca3af] py-2" style={{ fontFamily: 'JetBrains Mono,monospace' }}>None</p>
                ) : (
                  <div className="space-y-0.5">
                    {outflows.map((t) => (
                      <DrillDownRow key={t.id} transaction={t} onClick={setSelectedTransaction} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <TransactionDetailPanel
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        zBackdrop="z-[60]"
        zPanel="z-[70]"
      />
    </>
  )
}

function CashFlowBarChart({ startDate, endDate, granularity, onBucketClick }) {
  const { data: rawData, isLoading } = useCashFlowTimeSeries(startDate, endDate, granularity)

  const data = useMemo(() => {
    const buckets = rawData?.buckets ?? []
    return buckets.map((b) => ({
      ...b,
      label: formatBucketLabel(b.bucket, granularity),
      negativeFlow: -(b.outflows || 0),
    }))
  }, [rawData, granularity])

  const yDomain = useMemo(() => {
    if (!data?.length) return { domain: [-10000, 10000], ticks: [-10000, -5000, 0, 5000, 10000] }
    let dataMin = 0, dataMax = 0
    for (const d of data) {
      const neg = -(d.outflows ?? 0)
      dataMin = Math.min(dataMin, neg, d.net ?? 0)
      dataMax = Math.max(dataMax, d.inflows ?? 0, d.net ?? 0)
    }
    const range = dataMax - dataMin || 1
    const pad = Math.max(range * 0.05, 100)
    const min = Math.floor((dataMin - pad) / 500) * 500
    const max = Math.ceil((dataMax + pad) / 500) * 500
    const span = max - min
    const step = span <= 2000 ? 500 : span <= 10000 ? 2000 : span <= 25000 ? 5000 : Math.ceil(span / 5 / 1000) * 1000
    const ticks = []
    for (let v = min; v <= max + step * 0.5; v += step) ticks.push(v)
    if (min <= 0 && max >= 0 && ticks.indexOf(0) === -1) ticks.push(0)
    ticks.sort((a, b) => a - b)
    return { domain: [min, max], ticks }
  }, [data])

  function formatYAxisTick(value) {
    const n = Number(value)
    if (Number.isNaN(n)) return '$0'
    const abs = Math.abs(n)
    if (abs >= 1000) return `$${Math.round(n / 1000)}k`
    return `$${Math.round(n)}`
  }

  if (isLoading) {
    return (
      <div className="flex h-[350px] items-center justify-center">
        <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading…</span>
      </div>
    )
  }

  if (!data.length) {
    return (
      <div className="flex h-[350px] flex-col items-center justify-center gap-2 px-4 text-center">
        <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>No cash flow data for this period.</span>
      </div>
    )
  }

  return (
    <div style={{ height: 350 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 24, left: 8 }}
          barCategoryGap="20%"
          style={{ cursor: 'pointer' }}
          onClick={(chartData) => {
            if (!chartData?.activeLabel) return
            const entry = data.find(d => d.label === chartData.activeLabel)
            if (entry?.bucket) onBucketClick?.(entry.bucket)
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#6a7282', fontFamily: 'JetBrains Mono,monospace' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            ticks={yDomain.ticks}
            domain={yDomain.domain}
            tick={{ fontSize: 11, fill: '#6a7282', fontFamily: 'JetBrains Mono,monospace' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatYAxisTick}
          />
          <Tooltip content={<BarChartTooltip />} cursor={{ fill: 'rgba(243,244,246,0.8)', stroke: '#e5e7eb' }} />
          <Legend
            wrapperStyle={{ paddingTop: 8 }}
            formatter={(value) => <span className="text-[11px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{value}</span>}
          />
          <Bar dataKey="inflows" name="Inflows" fill={BAR_POSITIVE_COLOR} maxBarSize={40} isAnimationActive={false} radius={[2, 2, 0, 0]} cursor="pointer" />
          <Bar
            dataKey="negativeFlow"
            name="Outflows"
            fill={BAR_NEGATIVE_COLOR}
            maxBarSize={40}
            isAnimationActive={false}
            cursor="pointer"
            shape={({ x, y, width, height }) => {
              if (!height || Math.abs(height) < 1) return null
              const actualY = height < 0 ? y + height : y
              return <rect x={x} y={actualY} width={width} height={Math.abs(height)} fill={BAR_NEGATIVE_COLOR} rx={2} />
            }}
          />
          <Line type="monotone" dataKey="net" name="Net" stroke={LINE_NET_COLOR} strokeWidth={3}
            dot={{ fill: LINE_NET_COLOR, r: 4, strokeWidth: 2, stroke: '#ffffff' }} connectNulls cursor="pointer" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────

function formatDateInput(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CashFlowPage() {
  const [period, setPeriod] = useState('month')
  const [breakdown, setBreakdown] = useState('category')
  const [selectedAccountIds, setSelectedAccountIds] = useState(null)
  const [drillNode, setDrillNode] = useState(null)
  const [selectedBucket, setSelectedBucket] = useState(null)
  const [viewMode, setViewMode] = useState('sankey')

  // Custom date range — defaults to Jan 1 of current year to today
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setMonth(0, 1)
    return formatDateInput(d)
  })
  const [customEnd, setCustomEnd] = useState(() => formatDateInput(new Date()))
  const customRange = period === 'custom' ? { startDate: customStart, endDate: customEnd } : null

  // Compute date range and granularity for the selected period
  const { dateRange, granularity, dateRangeLabel } = useMemo(() => {
    const fmt = (dateStr) => {
      const [y, m, d] = dateStr.split('-').map(Number)
      const date = new Date(y, m - 1, d)
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
    if (period === 'custom') {
      if (!customStart || !customEnd) return { dateRange: null, granularity: 'month', dateRangeLabel: '' }
      // Auto-pick granularity based on range length
      const diffMs = new Date(customEnd) - new Date(customStart)
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      const gran = diffDays <= 14 ? 'day' : diffDays <= 90 ? 'week' : 'month'
      return {
        dateRange: { startDate: customStart, endDate: customEnd },
        granularity: gran,
        dateRangeLabel: `${fmt(customStart)} – ${fmt(customEnd)}`,
      }
    }
    const now = new Date()
    const end = formatDateInput(now)
    let start, gran
    if (period === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 6)
      start = formatDateInput(d)
      gran = 'day'
    } else if (period === 'month') {
      const d = new Date(now); d.setDate(d.getDate() - 29)
      start = formatDateInput(d)
      gran = 'week'
    } else if (period === 'quarter') {
      const d = new Date(now); d.setMonth(d.getMonth() - 2); d.setDate(1)
      start = formatDateInput(d)
      gran = 'month'
    } else if (period === 'ytd') {
      start = `${now.getFullYear()}-01-01`
      gran = 'month'
    } else {
      const d = new Date(now); d.setFullYear(d.getFullYear() - 1)
      start = formatDateInput(d)
      gran = 'month'
    }
    return {
      dateRange: { startDate: start, endDate: end },
      granularity: gran,
      dateRangeLabel: `${fmt(start)} – ${fmt(end)}`,
    }
  }, [period, customStart, customEnd])

  const accountIds = useMemo(() => selectedAccountIds ?? [], [selectedAccountIds])
  const { data, isLoading } = useCashFlowBreakdown(period, breakdown, accountIds, customRange)

  // Compute prior period for trend indicators
  const priorRange = useMemo(() => {
    if (!dateRange) return null
    const start = new Date(dateRange.startDate)
    const end = new Date(dateRange.endDate)
    const diffMs = end - start
    const priorEnd = new Date(start.getTime() - 86400000) // day before current start
    const priorStart = new Date(priorEnd.getTime() - diffMs)
    return {
      startDate: formatDateInput(priorStart),
      endDate: formatDateInput(priorEnd),
    }
  }, [dateRange])

  const { data: priorData } = useCashFlowBreakdown(
    'custom', breakdown, accountIds, priorRange
  )

  const income = data?.income ?? null
  const expenses = data?.expenses ?? null
  const hasIncome = (income?.categories?.length ?? 0) > 0
  const hasExpenses = (expenses?.categories?.length ?? 0) > 0
  const hasData = hasIncome || hasExpenses

  return (
    <div className="min-h-screen bg-[#f8f8f8]" style={{ paddingLeft: 'var(--sidebar-w)' }}>
      <AppHeader />

      {/* Page header */}
      <div className="border-b border-[#9ca3af] bg-white px-4 py-4 sm:px-6 lg:px-8">
        <h1 className="text-[24px] font-semibold tracking-[-0.5px] text-[#18181b]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
          Cash Flow
        </h1>
      </div>

      <main className="px-4 py-8">
        <div className="mx-auto max-w-[900px] space-y-6">
          {/* Unified card: controls + summary + chart */}
          <div className="rounded-[14px] border border-[#9ca3af] bg-white overflow-hidden">
            {/* Controls row */}
            <div className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-4">
              <SegmentedButtons options={PERIODS} value={period} onChange={setPeriod} />
              {period === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={customStart}
                    max={customEnd}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="rounded-lg border border-[#d1d5dc] bg-[#f9fafb] px-3 py-1.5 text-[12px] font-medium text-[#374151] outline-none focus:border-[#6a7282]"
                    style={{ fontFamily: 'JetBrains Mono,monospace' }}
                  />
                  <span className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>to</span>
                  <input
                    type="date"
                    value={customEnd}
                    min={customStart}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="rounded-lg border border-[#d1d5dc] bg-[#f9fafb] px-3 py-1.5 text-[12px] font-medium text-[#374151] outline-none focus:border-[#6a7282]"
                    style={{ fontFamily: 'JetBrains Mono,monospace' }}
                  />
                </div>
              )}
              <div className="ml-auto">
                <AccountFilter selectedIds={selectedAccountIds} onChange={setSelectedAccountIds} />
              </div>
            </div>

            {/* Summary stats */}
            <div className="px-5 pb-5">
              <SummaryCard income={income} expenses={expenses} priorIncome={priorData?.income} priorExpenses={priorData?.expenses} />
            </div>
            {/* Tabs */}
            <div className="flex border-y border-[#e5e7eb]">
              {VIEW_MODES.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setViewMode(opt.key)}
                  className={`px-5 py-3 text-[13px] font-medium transition-colors cursor-pointer border-b-2 ${
                    viewMode === opt.key
                      ? 'border-[#101828] text-[#101828]'
                      : 'border-transparent text-[#6a7282] hover:text-[#101828]'
                  }`}
                  style={{ fontFamily: 'JetBrains Mono,monospace' }}
                >
                  {opt.label}
                </button>
              ))}
              {/* Right-aligned controls */}
              <div className="ml-auto flex items-center gap-3 pr-5">
                {dateRangeLabel && (
                  <span className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    {dateRangeLabel}
                  </span>
                )}
                {viewMode === 'sankey' && (
                  <div className="flex items-center rounded-lg border border-[#d1d5dc] bg-[#f9fafb] p-0.5">
                    {BREAKDOWNS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setBreakdown(opt.key)}
                        className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                          breakdown === opt.key
                            ? 'bg-white text-[#101828] shadow-sm border border-[#d1d5dc]'
                            : 'text-[#6a7282] hover:text-[#101828]'
                        }`}
                        style={{ fontFamily: 'JetBrains Mono,monospace' }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {viewMode === 'sankey' ? (
              <div className="px-5 py-6" style={{ minHeight: 300 }}>
                {isLoading ? (
                  <div className="flex h-[300px] items-center justify-center">
                    <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading…</span>
                  </div>
                ) : !hasData ? (
                  <div className="flex h-[300px] flex-col items-center justify-center gap-2 px-4 text-center">
                    <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                      No cash flow data yet.
                    </span>
                    <span className="text-[12px] text-[#9ca3af] max-w-[320px]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                      Link accounts or sync to pull in transaction history. Cash flow data will appear once your transactions are imported.
                    </span>
                  </div>
                ) : (
                  <>
                    {!hasIncome && hasExpenses && (
                      <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
                        <p className="text-[12px] text-amber-700" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                          No income recorded for this period. Try a wider time range or link your paycheck account.
                        </p>
                      </div>
                    )}
                    {hasIncome && !hasExpenses && (
                      <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5">
                        <p className="text-[12px] text-blue-700" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                          No expenses recorded for this period.
                        </p>
                      </div>
                    )}
                    <SankeyDiagram income={income} expenses={expenses} onNodeClick={setDrillNode} />
                  </>
                )}
              </div>
            ) : (
              <div className="px-5 py-6">
                {dateRange && (
                  <CashFlowBarChart
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                    granularity={granularity}
                    onBucketClick={setSelectedBucket}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Drill-down side panels */}
      <NodeDrillDownPanel
        node={drillNode}
        period={period}
        breakdown={breakdown}
        accountIds={accountIds}
        customRange={customRange}
        onClose={() => setDrillNode(null)}
      />
      <TimeSeriesDrillDownTray
        bucket={selectedBucket}
        granularity={granularity}
        onClose={() => setSelectedBucket(null)}
      />
    </div>
  )
}
