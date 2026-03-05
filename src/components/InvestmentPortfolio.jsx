import { useState, useEffect, useCallback, useMemo, useRef, useImperativeHandle, forwardRef } from 'react'
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

const LINE_COLOR = '#7c3aed'

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

function formatPct(value) {
  if (value == null) return '0%'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
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

function ChartTooltip({ active, payload }) {
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
        {formatCurrency(d.value)}
      </p>
    </div>
  )
}

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function MoverCard({ holding }) {
  const gain = holding.cost_basis != null ? holding.value - holding.cost_basis : null
  const gainPct = gain != null && holding.cost_basis ? (gain / Math.abs(holding.cost_basis)) * 100 : null
  const isPositive = gain != null && gain >= 0

  return (
    <div className="flex w-[180px] shrink-0 flex-col gap-1 rounded-[10px] border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        {holding.ticker && (
          <span
            className="rounded-[5px] bg-[#e0e7ff] px-1.5 py-0.5 text-[11px] font-bold text-[#3730a3]"
            style={{ fontFamily: 'JetBrains Mono,monospace' }}
          >
            {holding.ticker}
          </span>
        )}
        <span
          className={`text-[11px] font-semibold ${isPositive ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}
          style={{ fontFamily: 'JetBrains Mono,monospace' }}
        >
          {gainPct != null ? formatPct(gainPct) : '—'}
        </span>
      </div>
      <p className="truncate text-[12px] font-medium leading-4 text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        {holding.security_name}
      </p>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
          {formatCurrency(holding.value)}
        </span>
        {gain != null && (
          <span
            className={`text-[11px] font-medium ${isPositive ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}
            style={{ fontFamily: 'JetBrains Mono,monospace' }}
          >
            {isPositive ? '+' : ''}{formatCurrency(gain)}
          </span>
        )}
      </div>
    </div>
  )
}

export const InvestmentPortfolio = forwardRef(function InvestmentPortfolio({ getToken }, ref) {
  const [holdings, setHoldings] = useState([])
  const [holdingsLoading, setHoldingsLoading] = useState(true)
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const [activeRange, setActiveRange] = useState('1M')
  const [chartCache, setChartCache] = useState({})
  const [chartLoadingRanges, setChartLoadingRanges] = useState({})
  const [selectedAccountKey, setSelectedAccountKey] = useState(null)

  const [investmentAccounts, setInvestmentAccounts] = useState([])

  const fetchHoldings = useCallback(async () => {
    setHoldingsLoading(true)
    try {
      const data = await apiFetch('/api/plaid/investments', { getToken })
      setHoldings(data.holdings ?? [])
    } catch (err) {
      console.error('Failed to load investment portfolio:', err)
      setHoldings([])
    } finally {
      setHoldingsLoading(false)
    }
  }, [getToken])

  const fetchInvestmentAccounts = useCallback(async () => {
    try {
      const data = await apiFetch('/api/plaid/accounts', { getToken })
      setInvestmentAccounts(
        (data.accounts ?? []).filter((a) => (a.type || '').toLowerCase() === 'investment')
      )
    } catch (_) {}
  }, [getToken])

  const fetchChartRange = useCallback(async (range, accountIds) => {
    const cacheKey = `${range}:${accountIds || 'all'}`
    setChartLoadingRanges((prev) => ({ ...prev, [cacheKey]: true }))
    try {
      let url = `/api/plaid/investment-history?range=${range}`
      if (accountIds) url += `&account_ids=${accountIds}`
      const result = await apiFetch(url, { getToken })
      setChartCache((prev) => ({
        ...prev,
        [cacheKey]: { history: result.history ?? [], current: result.current ?? null },
      }))
    } catch (err) {
      console.error(`Failed to fetch investment history (${range}):`, err)
      setChartCache((prev) => ({
        ...prev,
        [cacheKey]: { history: [], current: null },
      }))
    } finally {
      setChartLoadingRanges((prev) => ({ ...prev, [cacheKey]: false }))
    }
  }, [getToken])

  const fetchAllChartRanges = useCallback((accountIds) => {
    RANGES.forEach((r) => fetchChartRange(r.key, accountIds))
  }, [fetchChartRange])

  const accounts = useMemo(() => {
    if (holdings.length > 0) {
      const map = {}
      for (const h of holdings) {
        const key = `${h.institution_name}|${h.account_name}`
        if (!map[key]) map[key] = { key, institution: h.institution_name, account: h.account_name, value: 0, cost: 0, accountIds: new Set() }
        map[key].value += h.value ?? 0
        map[key].cost += h.cost_basis ?? 0
        if (h.account_id) map[key].accountIds.add(h.account_id)
      }
      return Object.values(map)
        .map((a) => ({ ...a, accountIds: [...a.accountIds] }))
        .sort((a, b) => b.value - a.value)
    }
    return investmentAccounts.map((a) => ({
      key: `${a.institution_name}|${a.name}`,
      institution: a.institution_name ?? 'Unknown',
      account: a.name || 'Investment Account',
      value: a.current ?? 0,
      cost: 0,
      accountIds: [a.account_id],
    }))
  }, [holdings, investmentAccounts])

  const selectedAccountIds = useMemo(() => {
    if (!selectedAccountKey) return null
    const acc = accounts.find((a) => a.key === selectedAccountKey)
    return acc ? acc.accountIds.join(',') : null
  }, [selectedAccountKey, accounts])

  const refreshAll = useCallback(() => {
    setSelectedAccountKey(null)
    fetchHoldings()
    fetchInvestmentAccounts()
    fetchAllChartRanges(null)
  }, [fetchHoldings, fetchInvestmentAccounts, fetchAllChartRanges])

  useEffect(() => { refreshAll() }, [refreshAll])

  useEffect(() => {
    fetchAllChartRanges(selectedAccountIds)
  }, [selectedAccountIds, fetchAllChartRanges])

  useImperativeHandle(ref, () => ({
    refresh() { refreshAll() },
  }), [refreshAll])

  const filteredHoldings = useMemo(() => {
    if (!selectedAccountKey) return holdings
    const acc = accounts.find((a) => a.key === selectedAccountKey)
    if (!acc) return holdings
    const idSet = new Set(acc.accountIds)
    return holdings.filter((h) => idSet.has(h.account_id))
  }, [holdings, selectedAccountKey, accounts])

  const totalValue = useMemo(() => filteredHoldings.reduce((s, h) => s + (h.value ?? 0), 0), [filteredHoldings])
  const totalCost = useMemo(() => filteredHoldings.reduce((s, h) => s + (h.cost_basis ?? 0), 0), [filteredHoldings])
  const totalGain = totalValue - totalCost
  const totalGainPct = totalCost ? (totalGain / Math.abs(totalCost)) * 100 : 0
  const isPositiveTotal = totalGain >= 0

  const topMovers = useMemo(() => {
    return filteredHoldings
      .filter((h) => h.cost_basis != null && h.cost_basis !== 0)
      .map((h) => ({ ...h, gainPct: ((h.value - h.cost_basis) / Math.abs(h.cost_basis)) * 100 }))
      .sort((a, b) => Math.abs(b.gainPct) - Math.abs(a.gainPct))
      .slice(0, 10)
  }, [filteredHoldings])

  const cacheKey = `${activeRange}:${selectedAccountIds || 'all'}`
  const cached = chartCache[cacheKey]
  const chartHistory = cached?.history ?? null
  const chartCurrentValue = cached?.current?.value ?? null
  const chartLoading = !cached || chartLoadingRanges[cacheKey]

  const displayValue = totalValue > 0 ? totalValue : (chartCurrentValue ?? 0)
  const hasInvestmentData = totalValue > 0 || (chartCurrentValue != null && chartCurrentValue > 0)

  const chartChange = useMemo(() => {
    if (!chartHistory?.length) return null
    const startVal = chartHistory[0].value
    const endVal = chartHistory[chartHistory.length - 1].value
    const diff = endVal - startVal
    const pct = startVal !== 0 ? (diff / Math.abs(startVal)) * 100 : 0
    return { diff, pct }
  }, [chartHistory])

  const chartData = useMemo(() => {
    if (!chartHistory?.length) return []
    const maxPoints = activeRange === '1W' ? 100 : activeRange === '1M' ? 60 : 90
    if (chartHistory.length <= maxPoints) return chartHistory
    const step = Math.ceil(chartHistory.length / maxPoints)
    const sampled = chartHistory.filter((_, i) => i % step === 0)
    if (sampled[sampled.length - 1]?.date !== chartHistory[chartHistory.length - 1]?.date) {
      sampled.push(chartHistory[chartHistory.length - 1])
    }
    return sampled
  }, [chartHistory, activeRange])

  function handleAccountClick(accKey) {
    setSelectedAccountKey((prev) => prev === accKey ? null : accKey)
  }

  function updateScrollButtons() {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }

  useEffect(() => {
    updateScrollButtons()
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateScrollButtons, { passive: true })
    const ro = new ResizeObserver(updateScrollButtons)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', updateScrollButtons); ro.disconnect() }
  }, [topMovers])

  function scrollBy(dir) {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * 200, behavior: 'smooth' })
  }

  return (
    <div className="rounded-[14px] border border-[#e5e7eb] bg-white">
      {/* Header + range toggles */}
      <div className="flex flex-col gap-3 border-b border-[#e5e7eb] px-5 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[18px] font-semibold leading-5 tracking-[-0.31px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            Investment Portfolio
            {selectedAccountKey && (
              <span className="ml-1.5 text-[#7c3aed]">
                · {accounts.find((a) => a.key === selectedAccountKey)?.account ?? 'Account'}
              </span>
            )}
          </h2>
          <div className="flex items-baseline gap-3">
            <span className="text-[28px] font-bold tracking-tight text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              {holdingsLoading && chartLoading ? '—' : formatCurrency(displayValue)}
            </span>
            {!holdingsLoading && totalValue > 0 && (
              <span
                className={`text-[14px] font-semibold ${isPositiveTotal ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}
                style={{ fontFamily: 'JetBrains Mono,monospace' }}
              >
                {isPositiveTotal ? '+' : ''}{formatCurrency(totalGain)} ({formatPct(totalGainPct)})
              </span>
            )}
          </div>
          {!holdingsLoading && !chartLoading && chartChange && (
            <p className="mt-0.5 text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              {chartChange.diff >= 0 ? '+' : ''}{formatCurrency(chartChange.diff)} ({formatPct(chartChange.pct)}) over period
            </p>
          )}
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setActiveRange(r.key)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                activeRange === r.key
                  ? 'bg-[#7c3aed] text-white'
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
        Portfolio value based on current holdings. Historical values are approximate.
      </p>

      {/* Line chart */}
      <div className="px-4 pb-3 pt-3" style={{ height: 200 }}>
        {chartLoading ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading...</span>
          </div>
        ) : !chartData.length ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              No investment history available
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="invGradient" x1="0" y1="0" x2="0" y2="1">
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
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={LINE_COLOR}
                strokeWidth={2}
                fill="url(#invGradient)"
                dot={false}
                activeDot={{ r: 4, fill: LINE_COLOR, stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {holdingsLoading ? (
        <div className="flex h-20 items-center justify-center">
          <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading...</span>
        </div>
      ) : !hasInvestmentData ? (
        <div className="flex h-20 items-center justify-center px-6">
          <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            Link an investment account to see your portfolio
          </span>
        </div>
      ) : accounts.length === 0 ? null : (
        <>
          {/* Account list */}
          <div className="border-t border-[#e5e7eb] px-6 pt-3 pb-3">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.5px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              Accounts
            </p>
            <div className="flex flex-col gap-1">
              {accounts.map((acc) => {
                const isSelected = selectedAccountKey === acc.key
                return (
                  <button
                    key={acc.key}
                    type="button"
                    onClick={() => handleAccountClick(acc.key)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-[#ede9fe] ring-1 ring-[#7c3aed]'
                        : 'hover:bg-[#f9fafb]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                        {acc.account}
                      </p>
                      <p className="truncate text-[11px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                        {acc.institution}
                      </p>
                    </div>
                    <span className="shrink-0 text-[13px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                      {formatCurrency(acc.value)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Top Movers carousel */}
          {topMovers.length > 0 && (
            <div className="border-t border-[#e5e7eb] px-6 pt-3 pb-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[12px] font-semibold uppercase tracking-[0.5px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  Top Movers
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => scrollBy(-1)}
                    disabled={!canScrollLeft}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-[#e5e7eb] text-[#6a7282] transition-colors hover:bg-[#f3f4f6] disabled:opacity-30"
                    aria-label="Scroll left"
                  >
                    <ChevronLeftIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollBy(1)}
                    disabled={!canScrollRight}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-[#e5e7eb] text-[#6a7282] transition-colors hover:bg-[#f3f4f6] disabled:opacity-30"
                    aria-label="Scroll right"
                  >
                    <ChevronRightIcon />
                  </button>
                </div>
              </div>
              <div
                ref={scrollRef}
                className="flex gap-2 overflow-x-auto"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
              >
                {topMovers.map((h, i) => (
                  <MoverCard key={`${h.ticker ?? h.security_name}-${i}`} holding={h} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
})
