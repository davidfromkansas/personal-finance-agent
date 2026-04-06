import { useState, useEffect, useCallback, useMemo, useRef, useImperativeHandle, forwardRef } from 'react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import { useInvestments, useAccounts, usePortfolioHistory, useQuotes, useTickerHistory } from '../hooks/usePlaidQueries'
import { useMarketClock } from '../hooks/useMarketClock'
import { usePlaidLinkContext } from '../context/PlaidLinkContext'
import { useNavigate } from 'react-router-dom'
import { StockDetailPanel } from './StockDetailPanel'


const RANGES = [
  { key: '1D', label: '1D' },
  { key: '1W', label: '1W' },
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: 'YTD', label: 'YTD' },
  { key: '1Y', label: '1Y' },
  { key: 'ALL', label: 'ALL' },
]

const LINE_COLOR = '#7c3aed'
const TICKER_COLORS = ['#2563eb', '#d97706', '#16a34a', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#ca8a04']

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
  if (range === '1D') {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }
  const d = new Date(dateStr + 'T00:00:00')
  if (range === '1W') {
    return d.toLocaleDateString('en-US', { weekday: 'short' })
  } else if (range === '1M' || range === '3M' || range === 'YTD') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } else {
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }
}

function ChartTooltip({ active, payload, isIntraday }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  let dateLabel
  if (isIntraday) {
    const dt = new Date(d.date)
    dateLabel = dt.toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    })
  } else {
    dateLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    })
  }
  return (
    <div className="rounded-lg border border-[#9ca3af] bg-white px-3 py-2 shadow-sm">
      <p className="text-[11px] font-medium text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        {dateLabel}
      </p>
      <p className="text-[14px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        {formatCurrency(d.value)}
      </p>
    </div>
  )
}

function TickerTooltip({ active, payload, isIntraday }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  let dateLabel
  if (isIntraday) {
    const dt = new Date(d.date)
    dateLabel = dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  } else {
    dateLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }
  const sorted = [...payload].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
  return (
    <div className="rounded-lg border border-[#9ca3af] bg-white px-3 py-2 shadow-sm min-w-[150px]">
      <p className="mb-1.5 text-[11px] font-medium text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{dateLabel}</p>
      {sorted.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4">
          <span className="text-[11px] font-semibold" style={{ color: entry.color, fontFamily: 'JetBrains Mono,monospace' }}>{entry.dataKey}</span>
          <span className="text-[11px] font-semibold" style={{ color: entry.value >= 0 ? '#16a34a' : '#dc2626', fontFamily: 'JetBrains Mono,monospace' }}>
            {entry.value != null ? `${entry.value >= 0 ? '+' : ''}${entry.value.toFixed(2)}%` : '—'}
          </span>
        </div>
      ))}
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

function Week52Range({ low, high, price }) {
  if (low == null || high == null || price == null || high === low) return null
  const pct = Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100))
  const MONO = { fontFamily: 'JetBrains Mono,monospace' }
  return (
    <div className="mt-3">
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-[1px] text-[#9ca3af]" style={MONO}>52W Range</p>
      <div className="relative h-1 rounded-full bg-[#e5e7eb]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-[#d1d5db]" style={{ width: `${pct}%` }} />
        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#101828] shadow-sm" style={{ left: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between">
        <span className="text-[9px] text-[#9ca3af]" style={MONO}>${low.toFixed(2)}</span>
        <span className="text-[9px] text-[#9ca3af]" style={MONO}>${high.toFixed(2)}</span>
      </div>
    </div>
  )
}

function MoverCard({ quote, onClick }) {
  const up = quote.changePct >= 0
  const MONO = { fontFamily: 'JetBrains Mono,monospace' }
  return (
    <div onClick={() => onClick?.(quote.ticker)} className="flex w-[160px] shrink-0 flex-col rounded-[10px] border border-[#9ca3af] bg-[#fafafa] p-4 transition-colors hover:bg-[#f3f4f6] cursor-pointer">
      <p className="text-[11px] font-bold text-[#101828]" style={MONO}>{quote.ticker}</p>
      <p className="mt-1 text-[15px] font-semibold text-[#101828]" style={MONO}>${quote.price.toFixed(2)}</p>
      <div className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${up ? 'text-[#16a34a]' : 'text-[#dc2626]'}`} style={MONO}>
        <span>{up ? '▲' : '▼'}</span>
        <span>{Math.abs(quote.changePct).toFixed(2)}%</span>
        <span className="font-normal opacity-70">{up ? '+$' : '-$'}{Math.abs(quote.change ?? 0).toFixed(2)}</span>
      </div>
      <Week52Range low={quote.week52Low} high={quote.week52High} price={quote.price} />
    </div>
  )
}

export const InvestmentPortfolio = forwardRef(function InvestmentPortfolio(_, ref) {
  const { isOpen } = useMarketClock()
  const navigate = useNavigate()
  const { openLink, linkLoading } = usePlaidLinkContext()
  const { data: investmentsData, isLoading: holdingsLoading, refetch: refetchInvestments } = useInvestments()
  const { data: accountsData, refetch: refetchAccounts } = useAccounts()
  const holdings = investmentsData?.holdings ?? []
  const investmentAccounts = useMemo(
    () => (accountsData?.accounts ?? []).filter((a) => (a.type || '').toLowerCase() === 'investment'),
    [accountsData]
  )

  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const [activeRange, setActiveRange] = useState('1D')
  const [selectedAccountKey, setSelectedAccountKey] = useState(null)
  const [chartMode, setChartMode] = useState('portfolio') // 'portfolio' | 'holdings'
  const [panelTicker, setPanelTicker] = useState(null)

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

  const { data: chartData, isLoading: chartLoading } = usePortfolioHistory(
    activeRange,
    selectedAccountIds,
    activeRange === '1D' && isOpen ? { refetchInterval: 60_000, staleTime: 60_000 } : {},
  )
  const chartHistory = chartData?.history ?? null
  const isIntraday = chartData?.isIntraday ?? false

  // Always fetch 1D data for live portfolio value during market hours
  const { data: liveData } = usePortfolioHistory(
    '1D',
    selectedAccountIds,
    isOpen ? { refetchInterval: 60_000, staleTime: 60_000 } : { enabled: false },
  )
  const liveValue = liveData?.current?.value ?? null

  const refreshAll = useCallback(() => {
    setSelectedAccountKey(null)
    refetchInvestments()
    refetchAccounts()
  }, [refetchInvestments, refetchAccounts])

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

  const portfolioTickers = useMemo(() => {
    const seen = new Set()
    return holdings
      .map(h => h.ticker)
      .filter(t => t && !t.startsWith('CUR:') && !seen.has(t) && seen.add(t))
  }, [holdings])

  const { data: quotesData } = useQuotes(portfolioTickers)
  const topMovers = useMemo(() => {
    if (!quotesData?.quotes?.length) return []
    return [...quotesData.quotes]
      .filter(q => q.changePct != null)
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
  }, [quotesData])

  const displayValue = isOpen && liveValue ? liveValue : (totalValue > 0 ? totalValue : 0)
  const hasInvestmentData = totalValue > 0 || (liveValue != null && liveValue > 0)

  const chartChange = useMemo(() => {
    if (!chartHistory?.length) return null
    const startVal = chartHistory[0].value
    const endVal = chartHistory[chartHistory.length - 1].value
    const diff = endVal - startVal
    const pct = startVal !== 0 ? (diff / Math.abs(startVal)) * 100 : 0
    return { diff, pct }
  }, [chartHistory])

  const chartPoints = useMemo(() => {
    if (!chartHistory?.length) return []
    if (activeRange === '1D') return chartHistory // intraday: use all 5m bars as-is
    const maxPoints = activeRange === '1W' ? 100 : activeRange === '1M' ? 60 : 90
    if (chartHistory.length <= maxPoints) return chartHistory
    const step = Math.ceil(chartHistory.length / maxPoints)
    const sampled = chartHistory.filter((_, i) => i % step === 0)
    if (sampled[sampled.length - 1]?.date !== chartHistory[chartHistory.length - 1]?.date) {
      sampled.push(chartHistory[chartHistory.length - 1])
    }
    return sampled
  }, [chartHistory, activeRange])

  // Top tickers by value for the % change chart (max 8, exclude cash/currency entries)
  const topTickers = useMemo(() => {
    const seen = new Set()
    return [...filteredHoldings]
      .filter((h) => h.ticker && !h.ticker.startsWith('CUR:'))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .map((h) => h.ticker)
      .filter((t) => !seen.has(t) && seen.add(t))
      .slice(0, 8)
  }, [filteredHoldings])

  const { data: tickerHistoryData, isLoading: tickerHistoryLoading } = useTickerHistory(
    topTickers,
    activeRange,
    {
      enabled: chartMode === 'holdings' && topTickers.length > 0,
      ...(activeRange === '1D' && isOpen ? { refetchInterval: 60_000, staleTime: 60_000 } : {}),
    },
  )

  // Normalize to % change from first price point and merge into recharts-friendly format
  const tickerChartData = useMemo(() => {
    const series = (tickerHistoryData?.series ?? []).filter((s) => s.data.length > 0)
    if (!series.length) return { points: [], tickers: [] }
    const dateMap = new Map()
    const tickerList = series.map((s) => s.ticker)
    for (const { ticker, data } of series) {
      const basePrice = data[0].price
      if (!basePrice) continue
      for (const { date, price } of data) {
        if (!dateMap.has(date)) dateMap.set(date, { date })
        dateMap.get(date)[ticker] = ((price - basePrice) / basePrice) * 100
      }
    }
    const points = [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date))
    return { points, tickers: tickerList }
  }, [tickerHistoryData])

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
    <>
    <div className="rounded-[14px] border border-[#9ca3af] bg-white">
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-[14px] bg-[#2B2B2B] pl-5 pr-3 py-3">
        <h2 className="text-[18px] font-semibold leading-5 tracking-[-0.31px] text-white cursor-pointer hover:text-white/80 transition-colors" style={{ fontFamily: 'JetBrains Mono,monospace' }} onClick={() => navigate('/app/investments')}>
          Investment Portfolio <span className="ml-0.5 text-[22px] font-bold text-white/60">›</span>
          {selectedAccountKey && (
            <span className="ml-1.5 text-white/70">
              · {accounts.find((a) => a.key === selectedAccountKey)?.account ?? 'Account'}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('open-assistant', { detail: { prompt: 'Explain my portfolio performance in the past one month' } }))}
          className="flex items-center gap-1.5 rounded-[7px] bg-white/15 px-2.5 py-1.5 hover:bg-white/25 transition-colors cursor-pointer"
          title="Ask AI about your portfolio"
        >
          <img src="/ai-icon.svg" alt="Ask AI" className="h-5 w-5" />
          <span className="text-[13px] font-medium text-white/90" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Ask AI</span>
        </button>
      </div>

      {/* Value + change + chart mode toggle */}
      <div className="flex items-start justify-between px-5 pt-4 pb-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[1px] text-[#9ca3af] mb-0.5" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Total Value</p>
          <div className="flex items-baseline gap-3">
            <span className="text-[28px] font-bold tracking-tight text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              {holdingsLoading && chartLoading ? '—' : formatCurrency(displayValue)}
            </span>
            {!holdingsLoading && !chartLoading && chartChange && (
              <span
                className={`whitespace-nowrap text-[14px] font-semibold ${chartChange.diff >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}
                style={{ fontFamily: 'JetBrains Mono,monospace' }}
              >
                {chartChange.diff >= 0 ? '+' : ''}{formatCurrency(chartChange.diff)} ({formatPct(chartChange.pct)})
              </span>
            )}
          </div>
          {activeRange === '1D' && chartData?.tradingDate && (
            <div className="flex items-center gap-2 mt-1">
              {isOpen ? (
                <>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
                  <span className="text-[10px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    Live · updates every minute
                  </span>
                </>
              ) : (
                <span className="text-[10px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  {(() => {
                    const [y, m, d] = chartData.tradingDate.split('-')
                    return new Date(+y, +m - 1, +d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                  })()} session · market closed
                </span>
              )}
            </div>
          )}
        </div>
        {topTickers.length > 0 && (
          <div className="flex rounded-md border border-[#e5e7eb] bg-[#f9fafb] p-0.5 mt-1">
            {(['portfolio', 'holdings']).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setChartMode(mode)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  chartMode === mode ? 'bg-white text-[#101828] shadow-sm' : 'text-[#6a7282] hover:text-[#101828]'
                }`}
                style={{ fontFamily: 'JetBrains Mono,monospace' }}
              >
                {mode === 'portfolio' ? '$ Total' : '% Holdings'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="px-4 pb-3 pt-2" style={{ height: 200 }}>
        {chartMode === 'portfolio' ? (
          chartLoading ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading...</span>
            </div>
          ) : !chartPoints.length ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>No investment history available</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartPoints} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="invGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6a7282', fontFamily: 'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatDateLabel(v, activeRange)} interval="preserveStartEnd" minTickGap={isIntraday ? 60 : 40} />
                <YAxis tick={{ fontSize: 11, fill: '#6a7282', fontFamily: 'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompact(v)} />
                <Tooltip content={<ChartTooltip isIntraday={isIntraday} />} />
                <Area type="monotone" dataKey="value" stroke={LINE_COLOR} strokeWidth={2} fill="url(#invGradient)" dot={false} activeDot={{ r: 4, fill: LINE_COLOR, stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          )
        ) : (
          tickerHistoryLoading ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading...</span>
            </div>
          ) : !tickerChartData.points.length ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>No price history available</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tickerChartData.points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6a7282', fontFamily: 'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatDateLabel(v, activeRange)} interval="preserveStartEnd" minTickGap={tickerHistoryData?.isIntraday ? 60 : 40} />
                <YAxis tick={{ fontSize: 11, fill: '#6a7282', fontFamily: 'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`} />
                <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="3 3" />
                <Tooltip content={<TickerTooltip isIntraday={tickerHistoryData?.isIntraday} />} />
                {tickerChartData.tickers.map((ticker, i) => (
                  <Line key={ticker} type="monotone" dataKey={ticker} stroke={TICKER_COLORS[i % TICKER_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )
        )}
      </div>

      {/* Range toggles */}
      <div className="flex justify-center gap-1 px-5 pb-3">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setActiveRange(r.key)}
            className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
              activeRange === r.key
                ? 'bg-[#101828] text-white'
                : 'text-[#6a7282] hover:bg-[#f3f4f6]'
            }`}
            style={{ fontFamily: 'JetBrains Mono,monospace' }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {holdingsLoading ? (
        <div className="flex h-20 items-center justify-center">
          <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading...</span>
        </div>
      ) : !hasInvestmentData ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-6">
          <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            Link an investment account to see your portfolio
          </span>
          <button
            type="button"
            onClick={() => openLink('investments')}
            disabled={linkLoading}
            className="flex items-center gap-1.5 rounded-[8px] bg-[#111113] px-3.5 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ fontFamily: 'JetBrains Mono,monospace' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            {linkLoading ? 'Opening…' : 'Connect investment account'}
          </button>
        </div>
      ) : accounts.length === 0 ? null : (
        <>
          {/* Top Movers carousel */}
          {topMovers.length > 0 && (
            <div className="border-t border-[#9ca3af] px-6 pt-3 pb-5">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.5px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    Top Movers
                  </p>
                  <p className="text-[10px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    {isOpen ? 'Intraday change from previous close · ~15 min delayed' : 'Change from previous close · final prices for the day'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => scrollBy(-1)}
                    disabled={!canScrollLeft}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-[#9ca3af] text-[#6a7282] transition-colors hover:bg-[#f3f4f6] disabled:opacity-30"
                    aria-label="Scroll left"
                  >
                    <ChevronLeftIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollBy(1)}
                    disabled={!canScrollRight}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-[#9ca3af] text-[#6a7282] transition-colors hover:bg-[#f3f4f6] disabled:opacity-30"
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
                {topMovers.map((q) => (
                  <MoverCard key={q.ticker} quote={q} onClick={(ticker) => setPanelTicker(ticker)} />
                ))}
              </div>
            </div>
          )}

          {/* Accounts link */}
          <div className="border-t border-[#9ca3af] px-6 py-2.5">
            <div className="flex w-full items-center justify-between px-2">
              <span
                onClick={() => navigate('/app/investments')}
                className="text-[12px] font-medium text-[#101828] transition-colors hover:text-[#6a7282] cursor-pointer"
                style={{ fontFamily: 'JetBrains Mono,monospace' }}
              >
                {accounts.length} investment account{accounts.length !== 1 ? 's' : ''} connected
              </span>
              <button
                type="button"
                onClick={() => openLink('investments')}
                disabled={linkLoading}
                className="flex items-center gap-1.5 rounded-md bg-[#111113] px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-50 cursor-pointer"
                style={{ fontFamily: 'JetBrains Mono,monospace' }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {linkLoading ? 'Opening…' : 'Add investment account'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
    <StockDetailPanel ticker={panelTicker} holdings={holdings} onClose={() => setPanelTicker(null)} />
    </>
  )
})
