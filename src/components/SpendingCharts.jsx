import { useState, useEffect, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { apiFetch } from '../lib/api'

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

export const SpendingCharts = forwardRef(function SpendingCharts({ connections, getToken, embeddedHeight }, ref) {
  const [activePeriod, setActivePeriod] = useState('week')
  const [data, setData] = useState({ week: null, month: null, year: null })
  const [loading, setLoading] = useState({ week: true, month: true, year: true })
  const [selectedAccountIds, setSelectedAccountIds] = useState(null)

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

  const fetchPeriod = useCallback(async (period, accountIds) => {
    setLoading((prev) => ({ ...prev, [period]: true }))
    try {
      let url = `/api/plaid/spending-summary?period=${period}`
      if (accountIds) url += `&account_ids=${accountIds.join(',')}`
      const result = await apiFetch(url, { getToken })
      setData((prev) => ({
        ...prev,
        [period]: { buckets: result.buckets ?? [], accounts: result.accounts ?? [] },
      }))
    } catch (err) {
      console.error(`Failed to fetch ${period} spending:`, err)
      setData((prev) => ({ ...prev, [period]: { buckets: [], accounts: [] } }))
    } finally {
      setLoading((prev) => ({ ...prev, [period]: false }))
    }
  }, [getToken])

  useEffect(() => {
    PERIODS.forEach((p) => fetchPeriod(p.key, selectedAccountIds))
  }, [fetchPeriod, selectedAccountIds])

  useImperativeHandle(ref, () => ({
    refresh() {
      PERIODS.forEach((p) => fetchPeriod(p.key, selectedAccountIds))
    },
  }), [fetchPeriod, selectedAccountIds])

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
  const activePeriodData = data[activePeriod]
  const activeLoading = loading[activePeriod]
  const activeBuckets = activePeriodData?.buckets ?? []
  const activeAccounts = activePeriodData?.accounts ?? []

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
    <div
      className={`rounded-[14px] border border-[#e5e7eb] bg-white ${embeddedHeight ? 'flex flex-col overflow-hidden' : ''}`}
      style={embeddedHeight ? { height: embeddedHeight } : undefined}
    >
      <div className="flex items-center justify-between border-b border-[#e5e7eb] px-5 py-3">
        <div className="flex items-center gap-8">
          <h2 className="text-[18px] font-semibold leading-5 tracking-[-0.31px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            Spending
          </h2>
          <div className="flex border-l border-[#e5e7eb] pl-6">
            {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setActivePeriod(p.key)}
              className={`relative px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activePeriod === p.key
                  ? 'text-[#4f46e5]'
                  : 'text-[#6a7282] hover:text-[#101828]'
              }`}
              style={{ fontFamily: 'JetBrains Mono,monospace' }}
            >
              {p.label}
              {activePeriod === p.key && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4f46e5] rounded-t" />
              )}
            </button>
          ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            {activeConfig?.subtitle}
          </span>
          <span className="text-[18px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            {activeLoading ? '—' : formatCurrency(total)}
          </span>
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
            <BarChart data={activeBuckets} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {allAccounts.length > 0 && !activeLoading && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-5 pb-4">
          {allAccounts.map((acc) => {
            const active = isAccountActive(acc.name)
            const color = stableColorMap[acc.name]
            return (
              <button
                key={acc.account_id}
                type="button"
                onClick={() => toggleLegendItem(acc.account_id)}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-opacity cursor-pointer ${
                  active ? 'opacity-100' : 'opacity-35'
                }`}
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
  )
})
