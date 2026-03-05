import { useState, useEffect, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { apiFetch } from '../lib/api'

const RANGES = [
  { key: '1W', label: '1W' },
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: 'YTD', label: 'YTD' },
  { key: '1Y', label: '1Y' },
  { key: 'ALL', label: 'ALL' },
]

const LINE_COLOR = '#4f46e5'
const POSITIVE_COLOR = '#16a34a'
const NEGATIVE_COLOR = '#dc2626'

function formatCurrency(value) {
  if (value == null) return '$0'
  const abs = Math.abs(value)
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(abs)
  return value < 0 ? `-${formatted}` : formatted
}

function formatCompact(value) {
  if (value == null) return '$0'
  const abs = Math.abs(value)
  let str
  if (abs >= 1_000_000) str = `$${(abs / 1_000_000).toFixed(1)}M`
  else if (abs >= 1_000) str = `$${(abs / 1_000).toFixed(0)}k`
  else str = `$${abs.toFixed(0)}`
  return value < 0 ? `-${str}` : str
}

function formatDateLabel(dateStr, range) {
  const d = new Date(dateStr + 'T00:00:00')
  if (range === '1W') {
    return d.toLocaleDateString('en-US', { weekday: 'short' })
  } else if (range === '1M' || range === '3M' || range === 'YTD') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } else {
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const dateLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
  return (
    <div className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 shadow-sm">
      <p className="text-[11px] font-medium text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        {dateLabel}
      </p>
      <p className="text-[14px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        {formatCurrency(d.net_worth)}
      </p>
      <div className="mt-1 flex gap-3 text-[11px]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        <span className="text-[#16a34a]">Assets {formatCurrency(d.assets)}</span>
        <span className="text-[#dc2626]">Debts {formatCurrency(d.debts)}</span>
      </div>
    </div>
  )
}

export const NetWorthChart = forwardRef(function NetWorthChart({ getToken, embedded }, ref) {
  const [activeRange, setActiveRange] = useState('1M')
  const [cache, setCache] = useState({})
  const [loadingRanges, setLoadingRanges] = useState({})

  const fetchRange = useCallback(async (range) => {
    setLoadingRanges((prev) => ({ ...prev, [range]: true }))
    try {
      const result = await apiFetch(`/api/plaid/net-worth-history?range=${range}`, { getToken })
      setCache((prev) => ({
        ...prev,
        [range]: { history: result.history ?? [], current: result.current ?? null },
      }))
    } catch (err) {
      console.error(`Failed to fetch net worth history (${range}):`, err)
      setCache((prev) => ({
        ...prev,
        [range]: { history: [], current: null },
      }))
    } finally {
      setLoadingRanges((prev) => ({ ...prev, [range]: false }))
    }
  }, [getToken])

  const fetchAllRanges = useCallback(() => {
    setCache({})
    RANGES.forEach((r) => fetchRange(r.key))
  }, [fetchRange])

  useEffect(() => {
    fetchAllRanges()
  }, [fetchAllRanges])

  useImperativeHandle(ref, () => ({
    refresh() { fetchAllRanges() },
  }), [fetchAllRanges])

  function handleRangeChange(range) {
    setActiveRange(range)
  }

  const cached = cache[activeRange]
  const data = cached?.history ?? null
  const current = cached?.current ?? null
  const loading = !cached || loadingRanges[activeRange]

  const change = useMemo(() => {
    if (!data?.length || !current) return null
    const startVal = data[0].net_worth
    const endVal = current.net_worth
    const diff = endVal - startVal
    const pct = startVal !== 0 ? (diff / Math.abs(startVal)) * 100 : 0
    return { diff, pct }
  }, [data, current])

  const isPositiveChange = change && change.diff >= 0

  const chartData = useMemo(() => {
    if (!data?.length) return []
    const maxPoints = activeRange === '1W' ? 100 : activeRange === '1M' ? 60 : 90
    if (data.length <= maxPoints) return data
    const step = Math.ceil(data.length / maxPoints)
    const sampled = data.filter((_, i) => i % step === 0)
    if (sampled[sampled.length - 1]?.date !== data[data.length - 1]?.date) {
      sampled.push(data[data.length - 1])
    }
    return sampled
  }, [data, activeRange])

  return (
    <div className={`bg-white ${embedded ? 'rounded-t-[14px]' : 'rounded-[14px] border border-[#e5e7eb]'}`}>
      <div className="flex flex-col gap-3 border-b border-[#e5e7eb] px-5 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[18px] font-semibold leading-5 tracking-[-0.31px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            Net Worth
          </h2>
          <div className="flex items-baseline gap-3">
            <span className="text-[28px] font-bold tracking-tight text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              {loading ? '—' : formatCurrency(current?.net_worth)}
            </span>
            {!loading && change && (
              <span
                className={`text-[14px] font-semibold ${isPositiveChange ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}
                style={{ fontFamily: 'JetBrains Mono,monospace' }}
              >
                {isPositiveChange ? '+' : ''}{formatCurrency(change.diff)} ({isPositiveChange ? '+' : ''}{change.pct.toFixed(1)}%)
              </span>
            )}
          </div>
          {!loading && current && (
            <div className="mt-1 flex gap-4 text-[12px]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              <span className="text-[#16a34a]">Assets: {formatCurrency(current.assets)}</span>
              <span className="text-[#dc2626]">Debts: {formatCurrency(current.debts)}</span>
            </div>
          )}
        </div>

        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => handleRangeChange(r.key)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                activeRange === r.key
                  ? 'bg-[#4f46e5] text-white'
                  : 'bg-[#f3f4f6] text-[#6a7282] hover:bg-[#e5e7eb] hover:text-[#101828]'
              }`}
              style={{ fontFamily: 'JetBrains Mono,monospace' }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <p className="px-6 text-[11px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        Net worth = assets minus debts across all connected accounts. Investment values reflect current holdings.
      </p>

      <div className="px-4 pb-5 pt-4" style={{ height: 260 }}>
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading...</span>
          </div>
        ) : !chartData.length ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              Connect accounts to see your net worth
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#6a7282', fontFamily: 'JetBrains Mono,monospace' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatDateLabel(v, activeRange)}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6a7282', fontFamily: 'JetBrains Mono,monospace' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCompact(v)}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="net_worth"
                stroke={LINE_COLOR}
                strokeWidth={2}
                fill="url(#nwGradient)"
                dot={false}
                activeDot={{ r: 4, fill: LINE_COLOR, stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
})
