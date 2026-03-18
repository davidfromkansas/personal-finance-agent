import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { apiFetch } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useSpending } from '../hooks/usePlaidQueries'

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
    <div className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2.5 shadow-sm min-w-[160px]">
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
        <div className="flex items-center justify-between gap-4 border-t border-[#e5e7eb] mt-1.5 pt-1.5">
          <span className="text-[12px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Total</span>
          <span className="text-[12px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{formatCurrency(total)}</span>
        </div>
      )}
    </div>
  )
}

function SpendingDrillPanel({ bucket, period, accountIds, onClose }) {
  const { getIdToken } = useAuth()
  const [transactions, setTransactions] = useState(null)
  const open = !!bucket

  useEffect(() => {
    if (!bucket) return
    setTransactions(null)
    const { fromDate, toDate } = bucketDateRange(bucket.date, period)
    let url = `/api/plaid/transactions?limit=500&from_date=${fromDate}&to_date=${toDate}`
    if (accountIds?.length) url += `&account_ids=${accountIds.join(',')}`
    apiFetch(url, { getToken: getIdToken })
      .then((d) => setTransactions((d.transactions ?? []).filter((t) => t.amount > 0)))
      .catch(() => setTransactions([]))
  }, [bucket, period, accountIds, getIdToken])

  const total = transactions?.reduce((s, t) => s + t.amount, 0) ?? 0

  return (
    <>
      {open && (
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
            <div className="divide-y divide-[#f3f4f6]">
              {transactions.map((t) => {
                const logo = t.logo_url ?? (t.website ? `https://www.google.com/s2/favicons?domain=${t.website.replace(/^https?:\/\//, '').split('/')[0]}&sz=64` : null)
                const initial = (t.name ?? '?')[0].toUpperCase()
                const displayAmt = `-$${Math.abs(t.amount).toFixed(2)}`
                const dateStr = t.authorized_date
                  ? new Date(String(t.authorized_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : null
                return (
                  <div key={t.plaid_transaction_id ?? t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {logo ? (
                        <div className="relative h-9 w-9 shrink-0">
                          <img src={logo} alt="" className="h-9 w-9 rounded-full border border-[#e5e7eb] object-contain bg-white"
                            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                          <div className="absolute inset-0 hidden items-center justify-center rounded-full border border-[#e5e7eb] bg-[#f9fafb] text-[12px] font-bold text-[#4a5565]"
                            style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
                        </div>
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-[#f9fafb] text-[12px] font-bold text-[#4a5565]"
                          style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{t.name}</p>
                        <p className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                          {[t.account_name, dateStr].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 text-[14px] font-bold text-[#f54900]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
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

export function SpendingCharts({ connections, embeddedHeight }) {
  const [activePeriod, setActivePeriod] = useState('week')
  const [selectedAccountIds, setSelectedAccountIds] = useState(null)
  const [drillBucket, setDrillBucket] = useState(null)
  const [showInfo, setShowInfo] = useState(false)

  const { data: spendingData, isLoading: activeLoading } = useSpending(activePeriod, selectedAccountIds ?? [])
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
    // Spending accounts get first colors so they stay stable before/after connections loads
    const orderedNames = [...activeAccounts]
    for (const acc of allAccounts) {
      if (!orderedNames.includes(acc.name)) orderedNames.push(acc.name)
    }
    orderedNames.forEach((name, i) => { map[name] = colorForIndex(i) })
    return map
  }, [allAccounts, activeAccounts])

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

  const selectedNames = useMemo(() => {
    if (allSelected) return null
    const idSet = new Set(selectedAccountIds)
    return new Set(allAccounts.filter((a) => idSet.has(a.account_id)).map((a) => a.name))
  }, [allSelected, selectedAccountIds, allAccounts])

  function isAccountActive(name) {
    return selectedNames === null || selectedNames.has(name)
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
      className={`relative rounded-[14px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.08)] ${embeddedHeight ? 'flex flex-col overflow-hidden' : ''}`}
      style={embeddedHeight ? { height: embeddedHeight } : undefined}
    >
      {showInfo && (
        <div className="absolute inset-0 z-10 rounded-[14px] bg-white/97 px-6 py-5 overflow-y-auto" onClick={() => setShowInfo(false)}>
          <p className="text-[13px] font-semibold text-[#101828] mb-3" style={{ fontFamily: 'JetBrains Mono,monospace' }}>What's in this chart</p>
          <div className="mb-3">
            <p className="text-[11px] font-semibold text-[#4a5565] uppercase tracking-wide mb-1.5" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Included</p>
            {['Purchases & payments (retail, restaurants, subscriptions, etc.)', 'Loan payments (mortgage, auto, personal)', 'Rent payments'].map(item => (
              <div key={item} className="flex items-start gap-2 mb-1">
                <span className="text-[#16a34a] text-[12px] font-bold shrink-0 mt-px">✓</span>
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
      )}
      <div className="flex items-center justify-between rounded-t-[14px] bg-[#b91c1c] px-5 py-3">
        <div className="flex items-center gap-8">
          <h2 className="text-[18px] font-semibold leading-5 tracking-[-0.31px] text-white" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            Spending
          </h2>
          <div className="flex border-l border-white/20 pl-6">
            {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setActivePeriod(p.key)}
              className={`relative px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activePeriod === p.key
                  ? 'text-white'
                  : 'text-white/50 hover:text-white'
              }`}
              style={{ fontFamily: 'JetBrains Mono,monospace' }}
            >
              {p.label}
              {activePeriod === p.key && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-t" />
              )}
            </button>
          ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-white/60" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            {activeConfig?.subtitle}
          </span>
          <span className="text-[18px] font-semibold text-white" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            {activeLoading ? '—' : formatCurrency(total)}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowInfo(v => !v) }}
            className="flex items-center justify-center w-5 h-5 rounded-full border border-white/40 text-white/70 hover:text-white hover:border-white/70 transition-colors text-[11px] font-bold leading-none"
            title="What's included in this chart"
          >i</button>
        </div>
      </div>

      <p className="px-5 pt-4 text-[11px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        Includes purchases and payments across all accounts. Transfers, income, and bank fees are excluded.
      </p>

      <div className={`px-4 pb-2 pt-4 ${embeddedHeight ? 'flex-1 min-h-0' : ''}`} style={embeddedHeight ? {} : { height: 299 }}>
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
                tick={{ fontSize: 11, fill: '#6a7282', fontFamily: 'JetBrains Mono,monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6a7282', fontFamily: 'JetBrains Mono,monospace' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              />
              <Tooltip content={<StackedTooltip />} cursor={{ fill: '#f9fafb' }} />
              {activeAccounts.map((name, i) => (
                <Bar
                  key={name}
                  dataKey={name}
                  stackId="spending"
                  fill={stableColorMap[name] || colorForIndex(i)}
                  maxBarSize={64}
                  radius={i === activeAccounts.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  style={{ cursor: 'pointer' }}
                  onClick={(barData) => setDrillBucket({ date: barData.date, label: barData.label })}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {(allAccounts.length > 0 || (!activeLoading && activeAccounts.length > 0)) && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-5 pb-4">
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
      )}
    </div>
    </>
  )
}
