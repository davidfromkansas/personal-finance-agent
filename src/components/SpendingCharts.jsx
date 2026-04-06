import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts'
import { apiFetch } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useSpending, useCashFlowBreakdown, useCashFlowTransactionsByRange } from '../hooks/usePlaidQueries'
import { TransactionDetailPanel } from './TransactionDetailPanel'

const PERIODS = [
  { key: 'week', label: 'Daily', subtitle: 'Last 7 days' },
  { key: 'month', label: 'Weekly', subtitle: 'Last 4 weeks' },
  { key: 'year', label: 'Monthly', subtitle: 'Last 12 months' },
]

const STACK_COLORS = [
  '#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626',
  '#7c3aed', '#db2777', '#2563eb', '#65a30d', '#ea580c',
]

function colorForIndex(i) {
  return STACK_COLORS[i % STACK_COLORS.length]
}

function MonthYearTick({ x, y, payload }) {
  const [month, year] = (payload.value ?? '').split(' ')
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fill="#6a7282" fontSize={11} fontFamily="JetBrains Mono,monospace">{month}</text>
      <text x={0} y={0} dy={24} textAnchor="middle" fill="#9ca3af" fontSize={10} fontFamily="JetBrains Mono,monospace">{year}</text>
    </g>
  )
}

function formatCurrency(value) {
  if (value == null) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value)
}

function StackedTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="rounded-lg border border-[#9ca3af] bg-white px-3 py-2.5 shadow-sm min-w-[160px]">
      <p className="text-[12px] font-medium text-[#6a7282] mb-1.5" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        {label}
      </p>
      {payload.filter((p) => p.value > 0).map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full shrink-0" style={{ backgroundColor: p.fill }} />
            <span className="text-[12px] text-[#4a5565] truncate max-w-[120px]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              {p.dataKey}
            </span>
          </div>
          <span className="text-[12px] font-medium text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            {formatCurrency(p.value)}
          </span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="flex items-center justify-between gap-4 border-t border-[#9ca3af] mt-1.5 pt-1.5">
          <span className="text-[12px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Total</span>
          <span className="text-[12px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{formatCurrency(total)}</span>
        </div>
      )}
    </div>
  )
}

const SORT_OPTIONS = [
  { key: 'recent', label: 'Most recent' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'expensive', label: 'Most expensive' },
  { key: 'cheapest', label: 'Least expensive' },
]

function SpendingDrillPanel({ bucket, period, accountIds, onClose, excludeCategories = [] }) {
  const { getIdToken } = useAuth()
  const [transactions, setTransactions] = useState(null)
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [sortKey, setSortKey] = useState('recent')
  const [sortOpen, setSortOpen] = useState(false)
  const [search, setSearch] = useState('')
  const open = !!bucket

  const accountIdsKey = accountIds?.join(',') ?? ''
  const excludeKey = excludeCategories.join(',')
  useEffect(() => {
    if (!bucket) return
    setTransactions(null)
    setSearch('')
    const { fromDate, toDate } = bucketDateRange(bucket.date, period)
    let url = `/api/plaid/transactions?limit=500&from_date=${fromDate}&to_date=${toDate}`
    if (accountIds?.length) url += `&account_ids=${accountIds.join(',')}`
    // Mirror the backend's spending exclusions exactly — both primary and detailed categories.
    const NON_SPENDING_PRIMARY = ['INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'BANK_FEES', ...excludeCategories]
    const NON_SPENDING_DETAILED = [
      'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
      'LOAN_PAYMENTS_LINE_OF_CREDIT_PAYMENT',
      'LOAN_DISBURSEMENTS_OTHER_DISBURSEMENT',
    ]
    apiFetch(url, { getToken: getIdToken })
      .then((d) => setTransactions(
        (d.transactions ?? []).filter((t) =>
          !NON_SPENDING_PRIMARY.includes(t.personal_finance_category) &&
          !NON_SPENDING_DETAILED.includes(t.personal_finance_category_detailed)
        )
      ))
      .catch(() => setTransactions([]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, period, accountIdsKey, excludeKey, getIdToken])

  const total = transactions?.reduce((s, t) => s + Number(t.amount), 0) ?? 0

  const sortedTransactions = useMemo(() => {
    if (!transactions) return null
    const q = search.trim().toLowerCase()
    const filtered = q ? transactions.filter(t => (t.name ?? '').toLowerCase().includes(q)) : transactions
    const copy = [...filtered]
    if (sortKey === 'recent') return copy // already sorted by date desc from API
    if (sortKey === 'oldest') return copy.reverse()
    if (sortKey === 'expensive') return copy.sort((a, b) => Number(b.amount) - Number(a.amount))
    if (sortKey === 'cheapest') return copy.sort((a, b) => Number(a.amount) - Number(b.amount))
    return copy
  }, [transactions, sortKey, search])

  return (
    <>
      <TransactionDetailPanel
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        zBackdrop="z-[60]"
        zPanel="z-[70]"
      />
      {open && !selectedTransaction && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      )}
      <div className={`fixed right-0 top-0 z-50 flex h-full w-1/3 flex-col border-l border-[#d9d9d9] bg-white shadow-xl transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header — identical to TransactionDetailPanel */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#d9d9d9] px-5 py-4">
          <span className="text-[16px] font-normal text-[#1e1e1e]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            {bucket?.label ?? ''}
            {transactions && (
              <span className="ml-2 text-[13px] text-[#6a7282]">
                — {formatCurrency(total)} · {transactions.length} txn{transactions.length !== 1 ? 's' : ''}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[#999] hover:text-[#1e1e1e] transition-colors text-xl leading-none cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Sort + search bar */}
        {transactions?.length > 0 && (
          <div className="relative shrink-0 flex items-center justify-between gap-3 px-5 py-2 border-b border-[#f3f4f6]">
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
              className="flex items-center gap-1 text-[11px] text-[#6a7282] hover:text-[#1e1e1e] transition-colors cursor-pointer"
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {!transactions ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading…</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>No transactions</span>
            </div>
          ) : (
            <div className="divide-y divide-[#d1d5db]">
              {sortedTransactions.map((t) => {
                const logo = t.logo_url ?? (t.website ? `https://www.google.com/s2/favicons?domain=${t.website.replace(/^https?:\/\//, '').split('/')[0]}&sz=64` : null)
                const initial = (t.name ?? '?')[0].toUpperCase()
                const isRefund = Number(t.amount) < 0
                const displayAmt = isRefund ? `+$${Math.abs(Number(t.amount)).toFixed(2)}` : `-$${Math.abs(Number(t.amount)).toFixed(2)}`
                const dateStr = t.authorized_date
                  ? new Date(String(t.authorized_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : null
                return (
                  <div key={t.plaid_transaction_id ?? t.id} className="flex items-center justify-between gap-3 px-5 py-3 cursor-pointer hover:bg-[#f9fafb] transition-colors" onClick={() => setSelectedTransaction(t)}>
                    <div className="flex items-center gap-3 min-w-0">
                      {logo ? (
                        <div className="relative h-9 w-9 shrink-0">
                          <img src={logo} alt="" className="h-9 w-9 rounded-full border border-[#9ca3af] object-contain bg-white"
                            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                          <div className="absolute inset-0 hidden items-center justify-center rounded-full border border-[#9ca3af] bg-[#f9fafb] text-[12px] font-bold text-[#4a5565]"
                            style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
                        </div>
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#9ca3af] bg-[#f9fafb] text-[12px] font-bold text-[#4a5565]"
                          style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{t.name}</p>
                        <p className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                          {[t.account_name, dateStr].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 text-[14px] font-bold ${isRefund ? 'text-[#155dfc]' : 'text-[#dc2626]'}`} style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                      {displayAmt}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function bucketDateRange(dateKey, period) {
  if (period === 'week') {
    return { fromDate: dateKey, toDate: dateKey }
  } else if (period === 'month') {
    const start = new Date(dateKey + 'T00:00:00')
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const pad = (n) => String(n).padStart(2, '0')
    return {
      fromDate: dateKey,
      toDate: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
    }
  } else {
    const [y, m] = dateKey.split('-')
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate()
    return { fromDate: `${dateKey}-01`, toDate: `${dateKey}-${String(lastDay).padStart(2, '0')}` }
  }
}

export function SpendingCharts({ connections, embeddedHeight, standalone, excludeCategories: excludeCategoriesProp = [] }) {
  const navigate = useNavigate()
  const [activePeriod, setActivePeriod] = useState('week')
  const [selectedAccountIds, setSelectedAccountIds] = useState(null)
  const [drillBucket, setDrillBucket] = useState(null)
  const [showInfo, setShowInfo] = useState(false)
  const [showAllTransactions, setShowAllTransactions] = useState(false)
  const [allTxnSelected, setAllTxnSelected] = useState(null)
  const [showAllMerchants, setShowAllMerchants] = useState(false)
  const [excludeRent, setExcludeRent] = useState(true)

  const excludeCategories = useMemo(() => {
    const merged = [...excludeCategoriesProp]
    if (excludeRent && !merged.includes('RENT_AND_UTILITIES')) merged.push('RENT_AND_UTILITIES')
    return merged
  }, [excludeCategoriesProp, excludeRent])

  const { data: breakdownData, isLoading: breakdownLoading } = useCashFlowBreakdown(activePeriod, 'group', selectedAccountIds ?? [], null, excludeCategories)
  const { data: merchantData } = useCashFlowBreakdown(activePeriod, 'merchant', selectedAccountIds ?? [], null, excludeCategories)
  const prevRange = useMemo(() => {
    const today = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    if (activePeriod === 'week') {
      const end = new Date(today); end.setDate(end.getDate() - 7)
      const start = new Date(end); start.setDate(start.getDate() - 6)
      return { startDate: fmt(start), endDate: fmt(end) }
    } else if (activePeriod === 'month') {
      const end = new Date(today); end.setDate(end.getDate() - 28)
      const start = new Date(end); start.setDate(start.getDate() - 27)
      return { startDate: fmt(start), endDate: fmt(end) }
    } else {
      const end = new Date(today); end.setFullYear(end.getFullYear() - 1); end.setDate(end.getDate() - 1)
      const start = new Date(end); start.setFullYear(start.getFullYear() - 1); start.setDate(start.getDate() + 1)
      return { startDate: fmt(start), endDate: fmt(end) }
    }
  }, [activePeriod])
  const { data: prevBreakdownData } = useCashFlowBreakdown(
    'custom',
    'group',
    selectedAccountIds ?? [],
    prevRange,
    excludeCategories,
  )

  // Compute date range for current period (for fetching transactions)
  const periodRange = useMemo(() => {
    const today = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    let start
    if (activePeriod === 'week') {
      start = new Date(today); start.setDate(start.getDate() - 6)
    } else if (activePeriod === 'month') {
      start = new Date(today); start.setDate(start.getDate() - 27)
    } else {
      start = new Date(today); start.setFullYear(start.getFullYear() - 1); start.setDate(start.getDate() + 1)
    }
    return {
      startDate: `${start.getFullYear()}-${pad(start.getMonth()+1)}-${pad(start.getDate())}`,
      endDate: `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`,
    }
  }, [activePeriod])

  const { data: txRangeData } = useCashFlowTransactionsByRange(periodRange.startDate, periodRange.endDate)

  const { data: spendingData, isLoading: activeLoading } = useSpending(activePeriod, selectedAccountIds ?? [], excludeCategories)
  const activeBuckets = spendingData?.buckets ?? []
  const activeAccounts = spendingData?.accounts ?? []

  const allAccounts = useMemo(() => {
    const list = []
    const seen = new Set()
    for (const conn of connections ?? []) {
      for (const acc of conn.accounts ?? []) {
        if (seen.has(acc.account_id)) continue
        seen.add(acc.account_id)
        const spendingTypes = ['credit', 'loan', 'depository']
        if (!spendingTypes.includes((acc.type || '').toLowerCase())) continue
        list.push({
          account_id: acc.account_id,
          name: acc.name || 'Account',
          institution: conn.institution_name ?? 'Unknown',
        })
      }
    }
    return list
  }, [connections])

  const stableColorMap = useMemo(() => {
    const map = {}
    allAccounts.forEach((acc, i) => { map[acc.name] = colorForIndex(i) })
    return map
  }, [allAccounts])

  const allSelected = selectedAccountIds === null

  function toggleLegendItem(accountId) {
    if (allSelected) {
      setSelectedAccountIds([accountId])
    } else if (selectedAccountIds.includes(accountId)) {
      const remaining = selectedAccountIds.filter((id) => id !== accountId)
      setSelectedAccountIds(remaining.length === 0 ? null : remaining)
    } else {
      const newIds = [...selectedAccountIds, accountId]
      setSelectedAccountIds(newIds.length === allAccounts.length ? null : newIds)
    }
  }

  const activeConfig = PERIODS.find((p) => p.key === activePeriod)

  const total = useMemo(() => {
    return activeBuckets.reduce((s, b) => {
      let bucketTotal = 0
      for (const name of activeAccounts) bucketTotal += b[name] || 0
      return s + bucketTotal
    }, 0)
  }, [activeBuckets, activeAccounts])

  const yAxisTicks = useMemo(() => {
    const maxVal = activeBuckets.reduce((max, b) => {
      const bucketTotal = activeAccounts.reduce((s, name) => s + (b[name] || 0), 0)
      return Math.max(max, bucketTotal)
    }, 0)
    if (maxVal === 0) return [0]
    const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal)))
    const nice = Math.ceil(maxVal / magnitude) * magnitude
    const step = nice / 4
    return [0, step, step * 2, step * 3, nice]
  }, [activeBuckets, activeAccounts])

  const selectedNames = useMemo(() => {
    if (allSelected) return null
    const idSet = new Set(selectedAccountIds)
    return new Set(allAccounts.filter((a) => idSet.has(a.account_id)).map((a) => a.name))
  }, [allSelected, selectedAccountIds, allAccounts])

  function isAccountActive(name) {
    return selectedNames === null || selectedNames.has(name)
  }

  const infoOverlay = showInfo && (
    <div className={`absolute inset-0 z-10 ${standalone ? '' : 'rounded-[14px]'} bg-white/97 px-6 py-5 overflow-y-auto`} onClick={() => setShowInfo(false)}>
      <p className="text-[13px] font-semibold text-[#101828] mb-3" style={{ fontFamily: 'JetBrains Mono,monospace' }}>What's in this chart</p>
      <div className="mb-3">
        <p className="text-[11px] font-semibold text-[#4a5565] uppercase tracking-wide mb-1.5" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Included</p>
        {['Purchases & payments (retail, restaurants, subscriptions, etc.)', 'Loan payments (mortgage, auto, personal)', 'Rent payments', 'Merchant refunds & returns (netted against purchases in the same period)'].map(item => (
          <div key={item} className="flex items-start gap-2 mb-1">
            <span className="text-[#155dfc] text-[12px] font-bold shrink-0 mt-px">✓</span>
            <span className="text-[12px] text-[#374151]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{item}</span>
          </div>
        ))}
      </div>
      <div>
        <p className="text-[11px] font-semibold text-[#4a5565] uppercase tracking-wide mb-1.5" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Excluded</p>
        {['Income & deposits', 'Transfers between your accounts', 'Credit card payments (individual transactions are already counted)', 'Bank fees'].map(item => (
          <div key={item} className="flex items-start gap-2 mb-1">
            <span className="text-[#dc2626] text-[12px] font-bold shrink-0 mt-px">✕</span>
            <span className="text-[12px] text-[#374151]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{item}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Click anywhere to dismiss</p>
    </div>
  )

  const chartArea = (
    <div className={standalone ? 'h-[420px]' : `px-4 pb-2 pt-4 ${embeddedHeight ? 'flex-1 min-h-0' : ''}`} style={!standalone && !embeddedHeight ? { height: 299 } : undefined}>
      {activeLoading ? (
        <div className="flex h-full items-center justify-center">
          <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading…</span>
        </div>
      ) : !activeBuckets.length ? (
        <div className="flex h-full items-center justify-center">
          <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>No spending data</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={activeBuckets}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
            style={{ cursor: 'pointer' }}
            onClick={(chartData) => {
              if (!chartData?.activeLabel) return
              const b = activeBuckets.find((bkt) => bkt.label === chartData.activeLabel)
              if (b) setDrillBucket({ date: b.date, label: b.label })
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis
              dataKey="label"
              tick={activePeriod === 'year' ? <MonthYearTick /> : { fontSize: 11, fill: '#6a7282', fontFamily: 'JetBrains Mono,monospace' }}
              height={activePeriod === 'year' ? 36 : 30}
              interval={activePeriod === 'year' ? 0 : 'preserveStartEnd'}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              ticks={yAxisTicks}
              domain={[0, yAxisTicks[yAxisTicks.length - 1]]}
              tick={{ fontSize: 11, fill: '#6a7282', fontFamily: 'JetBrains Mono,monospace' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            />
            <Tooltip content={<StackedTooltip />} cursor={{ fill: '#f9fafb' }} />
            {allAccounts.map((acc, i) => (
              <Bar
                key={acc.account_id}
                dataKey={acc.name}
                stackId="spending"
                fill={stableColorMap[acc.name] || colorForIndex(i)}
                maxBarSize={64}
                radius={i === allAccounts.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                style={{ cursor: 'pointer' }}
                onClick={(barData) => setDrillBucket({ date: barData.date, label: barData.label })}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )

  const legend = (allAccounts.length > 0 || (!activeLoading && activeAccounts.length > 0)) && (
    <div className={`flex flex-wrap items-center gap-x-1 gap-y-1 ${standalone ? 'pt-3' : 'px-5 pb-4'}`}>
      {(allAccounts.length > 0 ? allAccounts : activeAccounts.map((name) => ({ account_id: name, name }))).map((acc, i) => {
        const active = isAccountActive(acc.name)
        const color = stableColorMap[acc.name] ?? colorForIndex(i)
        const interactive = allAccounts.length > 0
        return (
          <button
            key={acc.account_id}
            type="button"
            onClick={interactive ? () => toggleLegendItem(acc.account_id) : undefined}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-opacity ${
              interactive ? 'cursor-pointer' : 'cursor-default'
            } ${active ? 'opacity-100' : 'opacity-35'}`}
            style={{ fontFamily: 'JetBrains Mono,monospace' }}
          >
            <span
              className="inline-block size-2.5 rounded-full shrink-0 transition-all"
              style={active
                ? { backgroundColor: color }
                : { backgroundColor: 'transparent', boxShadow: `inset 0 0 0 1.5px ${color}` }
              }
            />
            <span className="text-[11px] text-[#6a7282] whitespace-nowrap">{acc.name}</span>
          </button>
        )
      })}
    </div>
  )

  if (standalone) {
    return (
      <>
        <SpendingDrillPanel
          bucket={drillBucket}
          period={activePeriod}
          accountIds={selectedAccountIds}
          onClose={() => setDrillBucket(null)}
          excludeCategories={excludeCategories}
        />

        {/* All Transactions panel (sorted by most expensive) */}
        <TransactionDetailPanel
          transaction={allTxnSelected}
          onClose={() => setAllTxnSelected(null)}
          zBackdrop="z-[60]"
          zPanel="z-[70]"
        />
        {showAllTransactions && !allTxnSelected && (
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={() => setShowAllTransactions(false)} />
        )}
        <div className={`fixed right-0 top-0 z-50 flex h-full w-1/3 flex-col border-l border-[#d9d9d9] bg-white shadow-xl transition-transform duration-300 ease-in-out ${showAllTransactions ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex shrink-0 items-center justify-between border-b border-[#d9d9d9] px-5 py-4">
            <span className="text-[16px] font-normal text-[#1e1e1e]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              All Transactions
              {(() => {
                const excludeSet = new Set(excludeCategories)
                const all = (txRangeData?.outflows ?? []).filter(tx => !excludeSet.has(tx.personal_finance_category))
                const t = all.reduce((s, tx) => s + Math.abs(tx.amount), 0)
                return (
                  <span className="ml-2 text-[13px] text-[#6a7282]">
                    — {formatCurrency(t)} · {all.length} txn{all.length !== 1 ? 's' : ''}
                  </span>
                )
              })()}
            </span>
            <button
              type="button"
              onClick={() => setShowAllTransactions(false)}
              className="text-[#999] hover:text-[#1e1e1e] transition-colors text-xl leading-none cursor-pointer"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {(() => {
              const excludeSet = new Set(excludeCategories)
              const allTxns = [...(txRangeData?.outflows ?? [])]
                .filter(tx => !excludeSet.has(tx.personal_finance_category))
                .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
              if (!allTxns.length) return (
                <div className="flex h-full items-center justify-center">
                  <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>No transactions</span>
                </div>
              )
              return (
                <div className="divide-y divide-[#d1d5db]">
                  {allTxns.map((tx, i) => {
                    const name = tx.merchant_name || tx.name || 'Unknown'
                    const initial = name[0].toUpperCase()
                    const logo = tx.logo_url ?? (tx.website ? `https://www.google.com/s2/favicons?domain=${tx.website.replace(/^https?:\/\//, '').split('/')[0]}&sz=64` : null)
                    const isRefund = Number(tx.amount) < 0
                    const displayAmt = isRefund ? `+$${Math.abs(Number(tx.amount)).toFixed(2)}` : `-$${Math.abs(Number(tx.amount)).toFixed(2)}`
                    const dateStr = (tx.authorized_date || tx.date || '').slice(0, 10)
                    const dateLabel = dateStr ? new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
                    return (
                      <div key={tx.plaid_transaction_id || i} className="flex items-center justify-between gap-3 px-5 py-3 cursor-pointer hover:bg-[#f9fafb] transition-colors" onClick={() => setAllTxnSelected(tx)}>
                        <div className="flex items-center gap-3 min-w-0">
                          {logo ? (
                            <div className="relative h-9 w-9 shrink-0">
                              <img src={logo} alt="" className="h-9 w-9 rounded-full border border-[#9ca3af] object-contain bg-white"
                                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                              <div className="absolute inset-0 hidden items-center justify-center rounded-full border border-[#9ca3af] bg-[#f9fafb] text-[12px] font-bold text-[#4a5565]"
                                style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
                            </div>
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#9ca3af] bg-[#f9fafb] text-[12px] font-bold text-[#4a5565]"
                              style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-medium text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{name}</p>
                            <p className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                              {[tx.account_name, dateLabel].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </div>
                        <span className={`shrink-0 text-[14px] font-bold ${isRefund ? 'text-[#155dfc]' : 'text-[#dc2626]'}`} style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                          {displayAmt}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>

        {/* All Merchants panel (sorted by most frequent) */}
        {showAllMerchants && (
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={() => setShowAllMerchants(false)} />
        )}
        <div className={`fixed right-0 top-0 z-50 flex h-full w-1/3 flex-col border-l border-[#d9d9d9] bg-white shadow-xl transition-transform duration-300 ease-in-out ${showAllMerchants ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex shrink-0 items-center justify-between border-b border-[#d9d9d9] px-5 py-4">
            <span className="text-[16px] font-normal text-[#1e1e1e]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              Most Frequent Merchants
            </span>
            <button
              type="button"
              onClick={() => setShowAllMerchants(false)}
              className="text-[#999] hover:text-[#1e1e1e] transition-colors text-xl leading-none cursor-pointer"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {(() => {
              const excludeSet = new Set(excludeCategories)
              const allOutflows = (txRangeData?.outflows ?? []).filter(tx => !excludeSet.has(tx.personal_finance_category))
              const counts = {}
              for (const tx of allOutflows) {
                const name = tx.merchant_name || tx.name || 'Unknown'
                if (!counts[name]) counts[name] = { name, count: 0, total: 0, logo_url: tx.logo_url }
                counts[name].count++
                counts[name].total += Math.abs(tx.amount)
              }
              const allMerchants = Object.values(counts).filter(m => m.count >= 2).sort((a, b) => b.count - a.count)
              if (!allMerchants.length) return (
                <div className="flex h-full items-center justify-center">
                  <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>No merchants</span>
                </div>
              )
              return (
                <div className="divide-y divide-[#d1d5db]">
                  {allMerchants.map((m) => {
                    const initial = m.name[0].toUpperCase()
                    const logo = m.logo_url ?? null
                    return (
                      <div key={m.name} className="flex items-center gap-3 px-5 py-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {logo ? (
                            <div className="relative h-9 w-9 shrink-0">
                              <img src={logo} alt="" className="h-9 w-9 rounded-full border border-[#9ca3af] object-contain bg-white"
                                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                              <div className="absolute inset-0 hidden items-center justify-center rounded-full border border-[#9ca3af] bg-[#f9fafb] text-[12px] font-bold text-[#4a5565]"
                                style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
                            </div>
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#9ca3af] bg-[#f9fafb] text-[12px] font-bold text-[#4a5565]"
                              style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-medium text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{m.name}</p>
                            <p className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                              {m.count} transaction{m.count !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 text-[14px] font-bold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                          {formatCurrency(m.total)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>

        <div className="relative">
          {infoOverlay}

          <div className="rounded-[14px] border border-[#9ca3af] bg-white overflow-hidden">
            <div className="flex items-center justify-between pl-8 pr-5 py-4 border-b border-[#e5e7eb]">
              <div className="flex items-center gap-3">
                <h2 className="text-[18px] font-semibold leading-5 tracking-[-0.31px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  Spending Breakdown
                </h2>
                <span className="text-[13px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  {activeConfig?.subtitle}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowInfo(v => !v) }}
                  className="flex items-center justify-center w-5 h-5 rounded-full border border-[#9ca3af] text-[#6a7282] hover:text-[#101828] hover:border-[#101828] transition-colors text-[11px] font-bold leading-none"
                  title="What's included in this chart"
                >i</button>
              </div>
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-assistant', {
                    detail: { prompt: 'Summarize my spending habits for the last 30 days. Specifically, identify my highest-spend categories and provide a line-item list of significant one-time purchases (excluding rent) to help me identify outliers compared to my usual budget.' },
                  }))
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-[#3d3d42] hover:opacity-80 transition-opacity cursor-pointer"
                title="AI spending summary"
              >
                <img src="/ai-icon.svg" alt="" className="h-5 w-5" />
                <span className="text-[12px] font-semibold text-white" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Ask AI</span>
              </button>
            </div>
            <div className="px-8 pt-4 pb-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[24px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                {activeLoading ? '—' : formatCurrency(total)}
              </span>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setExcludeRent(v => !v)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <span className={`text-[12px] font-medium transition-colors ${excludeRent ? 'text-[#101828]' : 'text-[#9ca3af]'}`} style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    Exclude Rent
                  </span>
                  <span
                    className={`relative inline-flex h-[20px] w-[36px] shrink-0 rounded-full transition-colors duration-200 ${
                      excludeRent ? 'bg-[#101828]' : 'bg-[#d1d5db]'
                    }`}
                  >
                    <span
                      className={`absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        excludeRent ? 'translate-x-[18px]' : 'translate-x-[2px]'
                      }`}
                    />
                  </span>
                </button>
                <div className="flex items-center gap-1">
                  {PERIODS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setActivePeriod(p.key)}
                      className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                        activePeriod === p.key
                          ? 'bg-[#101828] text-white'
                          : 'text-[#6a7282] hover:text-[#101828] hover:bg-[#f3f4f6]'
                      }`}
                      style={{ fontFamily: 'JetBrains Mono,monospace' }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex-1 min-w-0">
                {chartArea}
                {legend}
              </div>

              {/* Category breakdown */}
              <div className="w-[220px] shrink-0 border-l border-[#f3f4f6] pl-5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[#9ca3af] mb-3" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  By Category
                </p>
                {breakdownLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading…</span>
                  </div>
                ) : (() => {
                  const categories = breakdownData?.expenses?.categories ?? []
                  const expenseTotal = breakdownData?.expenses?.total ?? 0
                  if (!categories.length) return (
                    <div className="flex items-center justify-center py-12">
                      <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>No category data</span>
                    </div>
                  )
                  const pieData = categories.map((cat, i) => ({
                    name: cat.name,
                    value: cat.amount,
                    color: colorForIndex(i),
                  }))
                  return (
                    <div>
                      <div className="mx-auto" style={{ width: 160, height: 160 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={42}
                              outerRadius={70}
                              paddingAngle={2}
                              dataKey="value"
                              stroke="none"
                            >
                              {pieData.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              content={({ active, payload }) => {
                                if (!active || !payload?.length) return null
                                const d = payload[0]
                                const pct = expenseTotal > 0 ? ((d.value / expenseTotal) * 100).toFixed(1) : 0
                                return (
                                  <div className="rounded-lg border border-[#9ca3af] bg-white px-3 py-2 shadow-sm" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                                    <p className="text-[12px] font-medium text-[#101828]">{d.name}</p>
                                    <p className="text-[12px] text-[#6a7282]">{formatCurrency(d.value)} · {pct}%</p>
                                  </div>
                                )
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-2 divide-y divide-[#f3f4f6]">
                        {categories.map((cat, i) => {
                          const pct = expenseTotal > 0 ? (cat.amount / expenseTotal) * 100 : 0
                          return (
                            <div key={cat.name} className="flex items-center gap-2 py-1.5">
                              <span className="inline-block size-2 rounded-full shrink-0" style={{ backgroundColor: colorForIndex(i) }} />
                              <span className="flex-1 text-[11px] text-[#101828] truncate" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                                {cat.name}
                              </span>
                              <span className="text-[11px] font-medium text-[#101828] text-right shrink-0" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                                {formatCurrency(cat.amount)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>

          {/* Spending Insights Summary */}
          <div className="px-8 pb-6">
          {(() => {
            const excludeSet = new Set(excludeCategories)
            const outflows = (txRangeData?.outflows ?? []).filter(tx => !excludeSet.has(tx.personal_finance_category))
            const merchants = merchantData?.expenses?.categories ?? []
            const currentTotal = breakdownData?.expenses?.total ?? 0
            const prevTotal = prevBreakdownData?.expenses?.total ?? 0
            const periodDays = activePeriod === 'week' ? 7 : activePeriod === 'month' ? 28 : 365
            const dailyAvg = periodDays > 0 ? currentTotal / periodDays : 0

            // Top 5 biggest individual transactions (spending only, positive amounts)
            const biggestTxns = [...outflows]
              .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
              .slice(0, 5)

            // Top 5 most frequent merchants (by count)
            const merchantCounts = {}
            for (const tx of outflows) {
              const name = tx.merchant_name || tx.name || 'Unknown'
              if (!merchantCounts[name]) merchantCounts[name] = { name, count: 0, total: 0, logo_url: tx.logo_url }
              merchantCounts[name].count++
              merchantCounts[name].total += Math.abs(tx.amount)
            }
            const frequentMerchants = Object.values(merchantCounts)
              .sort((a, b) => b.count - a.count)
              .slice(0, 5)

            // Period-over-period change
            const deltaTotal = currentTotal - prevTotal
            const deltaPct = prevTotal > 0 ? ((deltaTotal / prevTotal) * 100) : 0
            const periodLabel = activePeriod === 'week' ? 'last week' : activePeriod === 'month' ? 'last month' : 'last year'

            if (!outflows.length && !merchants.length) return null

            return (
              <div className="mt-6 grid grid-cols-3 gap-6">
                {/* Stat cards row */}
                <div className="rounded-[14px] border border-[#9ca3af] bg-white p-4">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-[#9ca3af] mb-1" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    Daily Average
                  </p>
                  <p className="text-[20px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    {formatCurrency(dailyAvg)}
                  </p>
                  <p className="text-[11px] text-[#6a7282] mt-0.5" style={{ fontFamily: 'JetBrains Mono,monospace' }}>per day</p>
                </div>

                <div className="rounded-[14px] border border-[#9ca3af] bg-white p-4">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-[#9ca3af] mb-1" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    vs. {periodLabel}
                  </p>
                  <p className={`text-[20px] font-semibold ${deltaTotal > 0 ? 'text-[#dc2626]' : deltaTotal < 0 ? 'text-[#059669]' : 'text-[#101828]'}`} style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    {deltaTotal > 0 ? '+' : ''}{formatCurrency(deltaTotal)}
                  </p>
                  <p className={`text-[11px] mt-0.5 ${deltaTotal > 0 ? 'text-[#dc2626]' : deltaTotal < 0 ? 'text-[#059669]' : 'text-[#6a7282]'}`} style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    {deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}% {deltaTotal > 0 ? 'more' : deltaTotal < 0 ? 'less' : ''}
                  </p>
                </div>

                <div className="rounded-[14px] border border-[#9ca3af] bg-white p-4">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-[#9ca3af] mb-1" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    Transactions
                  </p>
                  <p className="text-[20px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    {outflows.length}
                  </p>
                  <p className="text-[11px] text-[#6a7282] mt-0.5" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    across {Object.keys(merchantCounts).length} merchants
                  </p>
                </div>

                {/* Biggest transactions */}
                {biggestTxns.length > 0 && (
                  <div className="col-span-3 grid grid-cols-2 gap-4">
                    <div className="rounded-[14px] border border-[#9ca3af] bg-white p-4">
                      <button
                        type="button"
                        onClick={() => setShowAllTransactions(true)}
                        className="flex items-center gap-1.5 mb-3 cursor-pointer group"
                      >
                        <p className="text-[10px] font-medium uppercase tracking-wide text-[#9ca3af] group-hover:text-[#101828] transition-colors" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                          Biggest Transactions
                        </p>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#9ca3af] group-hover:text-[#101828] transition-colors">
                          <path d="M4.5 2.5l3.5 3.5-3.5 3.5" />
                        </svg>
                      </button>
                      <div className="divide-y divide-[#f3f4f6]">
                        {biggestTxns.map((tx, i) => {
                          const name = tx.merchant_name || tx.name || 'Unknown'
                          const initial = name[0].toUpperCase()
                          const logo = tx.logo_url ?? (tx.website ? `https://www.google.com/s2/favicons?domain=${tx.website.replace(/^https?:\/\//, '').split('/')[0]}&sz=64` : null)
                          const dateStr = (tx.authorized_date || tx.date || '').slice(0, 10)
                          const dateLabel = dateStr ? new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
                          return (
                            <div key={tx.plaid_transaction_id || i} className="flex items-center gap-3 py-2.5">
                              {logo ? (
                                <div className="relative size-7 shrink-0">
                                  <img src={logo} alt="" className="size-7 rounded-full object-contain bg-white border border-[#e5e7eb]"
                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                                  <div className="absolute inset-0 hidden items-center justify-center rounded-full bg-[#f3f4f6] text-[10px] font-bold text-[#4a5565]"
                                    style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
                                </div>
                              ) : (
                                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[10px] font-bold text-[#4a5565]"
                                  style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-medium text-[#101828] truncate" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{name}</p>
                                <p className="text-[10px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{dateLabel}</p>
                              </div>
                              <span className="text-[12px] font-semibold text-[#dc2626] shrink-0" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                                -${Math.abs(tx.amount).toFixed(2)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Most frequent merchants */}
                    <div className="rounded-[14px] border border-[#9ca3af] bg-white p-4">
                      <button
                        type="button"
                        onClick={() => setShowAllMerchants(true)}
                        className="flex items-center gap-1.5 mb-3 cursor-pointer group"
                      >
                        <p className="text-[10px] font-medium uppercase tracking-wide text-[#9ca3af] group-hover:text-[#101828] transition-colors" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                          Most Frequent
                        </p>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#9ca3af] group-hover:text-[#101828] transition-colors">
                          <path d="M4.5 2.5l3.5 3.5-3.5 3.5" />
                        </svg>
                      </button>
                      <div className="divide-y divide-[#f3f4f6]">
                        {frequentMerchants.map((m, i) => {
                          const initial = m.name[0].toUpperCase()
                          const logo = m.logo_url ?? null
                          return (
                            <div key={m.name} className="flex items-center gap-3 py-2.5">
                              {logo ? (
                                <div className="relative size-7 shrink-0">
                                  <img src={logo} alt="" className="size-7 rounded-full object-contain bg-white border border-[#e5e7eb]"
                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                                  <div className="absolute inset-0 hidden items-center justify-center rounded-full bg-[#f3f4f6] text-[10px] font-bold text-[#4a5565]"
                                    style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
                                </div>
                              ) : (
                                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[10px] font-bold text-[#4a5565]"
                                  style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-medium text-[#101828] truncate" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{m.name}</p>
                                <p className="text-[10px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{m.count} transaction{m.count !== 1 ? 's' : ''}</p>
                              </div>
                              <span className="text-[12px] font-semibold text-[#101828] shrink-0" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                                {formatCurrency(m.total)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
          </div>
        </div>
        </div>
      </>
    )
  }

  return (
    <>
    <SpendingDrillPanel
      bucket={drillBucket}
      period={activePeriod}
      accountIds={selectedAccountIds}
      onClose={() => setDrillBucket(null)}
    />
    <div
      className={`relative rounded-[14px] border border-[#9ca3af] bg-white ${embeddedHeight ? 'flex flex-col overflow-hidden' : ''}`}
      style={embeddedHeight ? { height: embeddedHeight } : undefined}
    >
      {infoOverlay}
      <div className="flex items-center justify-between rounded-t-[14px] bg-[#2B2B2B] px-5 py-3">
        <button
          type="button"
          onClick={() => navigate('/app/spending')}
          className="flex items-center gap-1.5 cursor-pointer group"
        >
          <h2 className="text-[18px] font-semibold leading-5 tracking-[-0.31px] text-white" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            Spending
          </h2>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/50 group-hover:text-white transition-colors">
            <path d="M5 3l4 4-4 4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('open-assistant', {
              detail: { prompt: 'Summarize my spending habits for the last 30 days. Specifically, identify my highest-spend categories and provide a line-item list of significant one-time purchases (excluding rent) to help me identify outliers compared to my usual budget.' },
            }))
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-[#3d3d42] hover:opacity-80 transition-opacity cursor-pointer"
          title="AI spending summary"
        >
          <img src="/ai-icon.svg" alt="" className="h-5 w-5" />
          <span className="text-[12px] font-semibold text-white" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Ask AI</span>
        </button>
      </div>

      <div className="flex items-center justify-between px-5 pt-4">
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setActivePeriod(p.key)}
              className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                activePeriod === p.key
                  ? 'bg-[#101828] text-white'
                  : 'text-[#6a7282] hover:text-[#101828] hover:bg-[#f3f4f6]'
              }`}
              style={{ fontFamily: 'JetBrains Mono,monospace' }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            {activeConfig?.subtitle}
          </span>
          <span className="text-[18px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            {activeLoading ? '—' : formatCurrency(total)}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowInfo(v => !v) }}
            className="flex items-center justify-center w-4 h-4 rounded-full border border-[#9ca3af] text-[#6a7282] hover:text-[#101828] hover:border-[#101828] transition-colors text-[10px] font-bold leading-none"
            title="What's included in this chart"
          >i</button>
        </div>
      </div>

      {chartArea}

      {legend}
    </div>
    </>
  )
}
