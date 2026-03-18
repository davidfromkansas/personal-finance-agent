import { useState, useMemo } from 'react'
import { AppHeader } from '../components/AppHeader'
import { useInvestments, usePortfolioHistory } from '../hooks/usePlaidQueries'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts'

const RANGES = ['1W', '1M', '3M', 'YTD', '1Y', 'ALL']

const SECURITY_TYPE_CATEGORY = {
  equity: 'Equities',
  etf: 'Equities',
  'mutual fund': 'Equities',
  'fixed income': 'Fixed Income',
  bond: 'Fixed Income',
  'real estate': 'Real Estate',
  cash: 'Cash',
}

const MONO = { fontFamily: 'JetBrains Mono,monospace' }

function fmt(value) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function fmtCompact(value) {
  if (value == null) return '—'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`
  return `${sign}$${abs.toFixed(0)}`
}

function fmtPct(value, decimals = 2) {
  if (value == null) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}

function fmtDateLabel(dateStr, range) {
  const d = new Date(dateStr + 'T00:00:00')
  if (range === '1W') return d.toLocaleDateString('en-US', { weekday: 'short' })
  if (range === '1M' || range === '3M') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (range === 'YTD') return d.toLocaleDateString('en-US', { month: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function ChartTooltip({ active, payload, range }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const dateLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
  return (
    <div className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 shadow-sm" style={MONO}>
      <p className="text-[11px] text-[#6a7282]">{dateLabel}</p>
      <p className={`text-[14px] font-semibold ${d.pct >= 0 ? 'text-[#155dfc]' : 'text-[#dc2626]'}`}>
        {fmtPct(d.pct)}
      </p>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#6a7282]" style={MONO}>
      {children}
    </p>
  )
}

function Skeleton({ className }) {
  return <div className={`animate-pulse rounded bg-[#e5e7eb] ${className}`} />
}

export function InvestmentsPage() {
  const [chartRange, setChartRange] = useState('1Y')

  const { data: investmentsData, isLoading: holdingsLoading } = useInvestments()
  const { data: chartData, isLoading: chartLoading } = usePortfolioHistory(chartRange, null)
  const { data: ytdData } = usePortfolioHistory('YTD', null)
  const { data: weekData } = usePortfolioHistory('1W', null)

  const holdings = investmentsData?.holdings ?? []

  const totalValue = useMemo(
    () => holdings.reduce((s, h) => s + (h.value ?? 0), 0),
    [holdings]
  )

  const { dayChange, dayChangePct } = useMemo(() => {
    const history = weekData?.history ?? []
    if (history.length < 2) return { dayChange: null, dayChangePct: null }
    const prev = history[history.length - 2].value
    const curr = history[history.length - 1].value
    const diff = curr - prev
    return { dayChange: diff, dayChangePct: prev ? (diff / prev) * 100 : null }
  }, [weekData])

  const { ytdReturn, ytdReturnPct } = useMemo(() => {
    const history = ytdData?.history ?? []
    if (history.length < 2) return { ytdReturn: null, ytdReturnPct: null }
    const start = history[0].value
    const end = history[history.length - 1].value
    const diff = end - start
    return { ytdReturn: diff, ytdReturnPct: start ? (diff / Math.abs(start)) * 100 : null }
  }, [ytdData])

  const accounts = useMemo(() => {
    const map = {}
    for (const h of holdings) {
      const key = `${h.institution_name}|${h.account_name}`
      if (!map[key]) map[key] = { name: h.account_name, institution: h.institution_name, value: 0 }
      map[key].value += h.value ?? 0
    }
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [holdings])

  const allocation = useMemo(() => {
    if (!holdings.length || !totalValue) return []
    const buckets = {}
    for (const h of holdings) {
      const type = (h.security_type ?? '').toLowerCase()
      const cat = SECURITY_TYPE_CATEGORY[type] ?? 'Other'
      buckets[cat] = (buckets[cat] ?? 0) + (h.value ?? 0)
    }
    return Object.entries(buckets)
      .map(([name, value]) => ({ name, pct: (value / totalValue) * 100 }))
      .sort((a, b) => b.pct - a.pct)
  }, [holdings, totalValue])

  const topHoldings = useMemo(() => {
    if (!totalValue) return []
    const map = {}
    for (const h of holdings) {
      const key = h.ticker ?? h.security_name ?? 'Unknown'
      if (!map[key]) map[key] = { ticker: h.ticker, security_name: h.security_name, close_price: h.close_price, value: 0 }
      map[key].value += h.value ?? 0
    }
    return Object.values(map)
      .map(h => ({ ...h, weight: (h.value / totalValue) * 100 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [holdings, totalValue])

  const pctChartData = useMemo(() => {
    const history = chartData?.history ?? []
    if (history.length < 2) return []
    const startVal = history[0].value
    if (!startVal) return []
    return history.map(h => ({
      date: h.date,
      pct: ((h.value - startVal) / Math.abs(startVal)) * 100,
    }))
  }, [chartData])

  const chartDomain = useMemo(() => {
    if (!pctChartData.length) return [-10, 10]
    const vals = pctChartData.map(d => d.pct)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = Math.max((max - min) * 0.1, 1)
    return [Math.floor((min - pad) / 5) * 5, Math.ceil((max + pad) / 5) * 5]
  }, [pctChartData])

  const isLoading = holdingsLoading

  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <AppHeader />
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1100px]">
          <div className="overflow-hidden rounded-[14px] border border-[#e5e7eb] bg-white">

            {/* ── Top stats row ── */}
            <div className="grid grid-cols-1 divide-y divide-[#e5e7eb] border-b border-[#e5e7eb] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {/* Total Balance */}
              <div className="px-6 py-5">
                <SectionLabel>Total Balance</SectionLabel>
                {isLoading ? (
                  <Skeleton className="mt-3 h-9 w-52" />
                ) : (
                  <p className="mt-1 text-[36px] font-bold tracking-tight text-[#101828]" style={MONO}>
                    {totalValue > 0 ? fmt(totalValue) : '—'}
                  </p>
                )}
              </div>

              {/* Day Change */}
              <div className="px-6 py-5">
                <SectionLabel>Day Change</SectionLabel>
                {isLoading ? (
                  <>
                    <Skeleton className="mt-3 h-8 w-40" />
                    <Skeleton className="mt-1.5 h-4 w-16" />
                  </>
                ) : (
                  <>
                    <p className={`mt-1 text-[28px] font-bold tracking-tight ${
                      dayChange == null ? 'text-[#101828]' : dayChange >= 0 ? 'text-[#155dfc]' : 'text-[#dc2626]'
                    }`} style={MONO}>
                      {dayChange != null
                        ? `${dayChange >= 0 ? '+ ' : '− '}${fmt(Math.abs(dayChange))}`
                        : '—'}
                    </p>
                    {dayChangePct != null && (
                      <p className={`text-[13px] font-medium ${dayChangePct >= 0 ? 'text-[#155dfc]' : 'text-[#dc2626]'}`} style={MONO}>
                        {fmtPct(dayChangePct)}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* YTD Return */}
              <div className="px-6 py-5">
                <SectionLabel>YTD Return</SectionLabel>
                {isLoading ? (
                  <>
                    <Skeleton className="mt-3 h-8 w-40" />
                    <Skeleton className="mt-1.5 h-4 w-16" />
                  </>
                ) : (
                  <>
                    <p className={`mt-1 text-[28px] font-bold tracking-tight ${
                      ytdReturn == null ? 'text-[#101828]' : ytdReturn >= 0 ? 'text-[#155dfc]' : 'text-[#dc2626]'
                    }`} style={MONO}>
                      {ytdReturn != null
                        ? `${ytdReturn >= 0 ? '+ ' : '− '}${fmt(Math.abs(ytdReturn))}`
                        : '—'}
                    </p>
                    {ytdReturnPct != null && (
                      <p className={`text-[13px] font-medium ${ytdReturnPct >= 0 ? 'text-[#155dfc]' : 'text-[#dc2626]'}`} style={MONO}>
                        {fmtPct(ytdReturnPct)}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ── Main content ── */}
            <div className="flex flex-col divide-y divide-[#e5e7eb] lg:flex-row lg:divide-x lg:divide-y-0" style={{ minHeight: 480 }}>

              {/* Left: Accounts + Allocation */}
              <div className="w-full shrink-0 lg:w-[260px]">
                {/* Accounts */}
                <div className="border-b border-[#e5e7eb] px-5 py-4">
                  <div className="mb-3 flex items-center justify-between">
                    <SectionLabel>Accounts</SectionLabel>
                    {!isLoading && accounts.length > 0 && (
                      <span className="text-[11px] font-semibold text-[#6a7282]" style={MONO}>{accounts.length}</span>
                    )}
                  </div>
                  {isLoading ? (
                    <div className="flex flex-col gap-3">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="flex items-center justify-between">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-4 w-12" />
                        </div>
                      ))}
                    </div>
                  ) : accounts.length === 0 ? (
                    <p className="text-[13px] text-[#6a7282]" style={MONO}>No accounts</p>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {accounts.map((acc, i) => (
                        <div key={i} className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-[#101828]" style={MONO}>{acc.name}</p>
                            {acc.institution && (
                              <p className="truncate text-[11px] text-[#6a7282]" style={MONO}>{acc.institution}</p>
                            )}
                          </div>
                          <p className="shrink-0 text-[13px] text-[#4a5565]" style={MONO}>{fmtCompact(acc.value)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Allocation */}
                <div className="px-5 py-4">
                  <div className="mb-3">
                    <SectionLabel>Allocation</SectionLabel>
                  </div>
                  {isLoading ? (
                    <div className="flex flex-col gap-3">
                      {[0, 1, 2, 3].map(i => (
                        <div key={i} className="flex items-center justify-between">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-4 w-8" />
                        </div>
                      ))}
                    </div>
                  ) : allocation.length === 0 ? (
                    <p className="text-[13px] text-[#6a7282]" style={MONO}>—</p>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {allocation.map((a, i) => (
                        <div key={i} className="flex items-center justify-between gap-2">
                          <p className="text-[13px] text-[#101828]" style={MONO}>{a.name}</p>
                          <p className="text-[13px] font-medium text-[#4a5565]" style={MONO}>{a.pct.toFixed(0)}%</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Middle: Performance chart */}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-[#e5e7eb] px-5 py-4">
                  <SectionLabel>Performance</SectionLabel>
                  <div className="flex gap-0.5">
                    {RANGES.map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setChartRange(r)}
                        className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                          chartRange === r
                            ? 'bg-[#101828] text-white'
                            : 'text-[#6a7282] hover:text-[#101828]'
                        }`}
                        style={MONO}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-1 items-stretch px-2 py-4" style={{ minHeight: 300 }}>
                  {chartLoading ? (
                    <div className="flex w-full items-center justify-center">
                      <div className="h-full w-full animate-pulse rounded bg-[#f3f4f6]" style={{ minHeight: 240 }} />
                    </div>
                  ) : pctChartData.length < 2 ? (
                    <div className="flex w-full items-center justify-center">
                      <p className="text-center text-[13px] text-[#6a7282]" style={MONO}>
                        Not enough history yet — check back after another day of data accumulates.
                      </p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                      <LineChart data={pctChartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: '#6a7282', fontFamily: 'JetBrains Mono,monospace' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => fmtDateLabel(v, chartRange)}
                          interval="preserveStartEnd"
                          minTickGap={40}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#6a7282', fontFamily: 'JetBrains Mono,monospace' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
                          domain={chartDomain}
                          width={48}
                        />
                        <ReferenceLine y={0} stroke="#d1d5dc" strokeWidth={1} />
                        <Tooltip content={<ChartTooltip range={chartRange} />} />
                        <Line
                          type="monotone"
                          dataKey="pct"
                          stroke="#7c3aed"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: '#7c3aed', stroke: '#fff', strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Right: Top Holdings */}
              <div className="w-full shrink-0 lg:w-[300px]">
                <div className="flex items-center justify-between border-b border-[#e5e7eb] px-5 py-4">
                  <SectionLabel>Top Holdings</SectionLabel>
                  <span className="text-[11px] font-semibold text-[#6a7282]" style={MONO}>%</span>
                </div>
                <div className="px-5">
                  <div className="grid grid-cols-3 gap-2 border-b border-[#e5e7eb] py-2.5">
                    {['Asset', 'Price', 'Weight'].map((label, i) => (
                      <p key={label} className={`text-[11px] font-semibold uppercase tracking-[1px] text-[#6a7282] ${i > 0 ? 'text-right' : ''}`} style={MONO}>
                        {label}
                      </p>
                    ))}
                  </div>
                  {isLoading ? (
                    <div className="flex flex-col">
                      {[0, 1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="grid grid-cols-3 gap-2 border-b border-[#f3f4f6] py-3">
                          <Skeleton className="h-4 w-10" />
                          <Skeleton className="ml-auto h-4 w-14" />
                          <Skeleton className="ml-auto h-4 w-8" />
                        </div>
                      ))}
                    </div>
                  ) : topHoldings.length === 0 ? (
                    <p className="py-4 text-[13px] text-[#6a7282]" style={MONO}>No holdings</p>
                  ) : (
                    <div className="flex flex-col">
                      {topHoldings.map((h, i) => (
                        <div key={i} className="grid grid-cols-3 gap-2 border-b border-[#f3f4f6] py-3">
                          <p className="truncate text-[13px] font-semibold text-[#101828]" style={MONO}>
                            {h.ticker ?? h.security_name}
                          </p>
                          <p className="text-right text-[13px] text-[#4a5565]" style={MONO}>
                            {h.close_price != null ? fmt(h.close_price) : '—'}
                          </p>
                          <p className="text-right text-[13px] font-medium text-[#101828]" style={MONO}>
                            {h.weight.toFixed(1)}%
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
