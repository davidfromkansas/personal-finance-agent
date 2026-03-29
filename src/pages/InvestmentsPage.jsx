import { useState, useMemo, useRef } from 'react'
import { useMarketClock } from '../hooks/useMarketClock'
import { AppHeader } from '../components/AppHeader'
import { useInvestments, usePortfolioHistory, usePortfolioSnapshot, useTickerHistory, useQuotes, useAccounts, useInvestmentTransactions } from '../hooks/usePlaidQueries'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'

const RANGES = ['1W', '1M', '3M', 'YTD', '1Y', 'ALL']
const MOVERS_RANGES = ['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y', 'ALL']
const LINE_COLORS = ['#0072B2', '#E69F00', '#009E73', '#D55E00', '#CC79A7', '#56B4E9', '#F0E442', '#999999']

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
  if (range === '1D') {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }
  const d = new Date(dateStr + 'T00:00:00')
  if (range === '1W') return d.toLocaleDateString('en-US', { weekday: 'short' })
  if (range === '1M' || range === '3M') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (range === 'YTD') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const dateLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
  return (
    <div className="rounded-lg border border-[#9ca3af] bg-white px-3 py-2 shadow-sm" style={MONO}>
      <p className="text-[11px] text-[#6a7282]">{dateLabel}</p>
      <p className="text-[14px] font-semibold text-[#101828]">{fmt(d.value)}</p>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="text-[13px] font-bold uppercase tracking-[1px] text-[#101828]" style={MONO}>
      {children}
    </p>
  )
}

function Skeleton({ className }) {
  return <div className={`animate-pulse rounded bg-[#e5e7eb] ${className}`} />
}


function AllocationDonut({ allocation }) {
  const [activeIdx, setActiveIdx] = useState(null)
  const active = activeIdx != null ? allocation[activeIdx] : null
  return (
    <div className="flex flex-col items-center gap-3 pt-2">
      <div className="relative" style={{ width: 140, height: 140 }}>
        <PieChart width={140} height={140}>
          <Pie
            data={allocation}
            dataKey="pct"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={42}
            outerRadius={66}
            startAngle={90}
            endAngle={-270}
            strokeWidth={0}
            onMouseEnter={(_, i) => setActiveIdx(i)}
            onMouseLeave={() => setActiveIdx(null)}
          >
            {allocation.map((a, i) => (
              <Cell
                key={i}
                fill={LINE_COLORS[i % LINE_COLORS.length]}
                opacity={activeIdx == null || activeIdx === i ? 1 : 0.4}
              />
            ))}
          </Pie>
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-2">
          {active && (
            <>
              <p className="text-[9px] text-[#6a7282] leading-tight" style={MONO}>{active.name}</p>
              <p className="text-[11px] font-semibold text-[#101828] leading-tight mt-0.5" style={MONO}>{active.pct.toFixed(2)}%</p>
              <p className="text-[9px] text-[#6a7282] leading-tight mt-0.5" style={MONO}>{fmt(active.value)}</p>
            </>
          )}
        </div>
      </div>
      <div className="flex w-full flex-col gap-1.5">
        {allocation.map((a, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-2 transition-opacity cursor-default"
            style={{ opacity: activeIdx == null || activeIdx === i ? 1 : 0.4 }}
            onMouseEnter={() => setActiveIdx(i)}
            onMouseLeave={() => setActiveIdx(null)}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />
              <p className="truncate text-[12px] text-[#4a5565]" style={MONO}>{a.name}</p>
            </div>
            <p className="shrink-0 text-[12px] font-medium text-[#101828]" style={MONO}>{a.pct.toFixed(2)}%</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function TopMoversRow({ movers, isLoading, isOpen }) {
  if (!isLoading && movers.length === 0) return null
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#9ca3af] bg-white mb-4">
      <div className="flex h-[44px] items-center justify-between border-b border-[#9ca3af] px-5">
        <SectionLabel>Top Movers</SectionLabel>
        <span className="text-[11px] text-[#9ca3af]" style={MONO}>
          {isOpen
            ? 'Intraday change from previous close · ~15 min delayed'
            : "Change from previous close · final prices for the day"}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto p-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {isLoading
          ? [0,1,2,3,4].map(i => (
              <div key={i} className="flex w-[160px] shrink-0 flex-col gap-1.5 rounded-[10px] border border-[#9ca3af] p-4">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))
          : movers.map((m) => {
              const up = m.changePct >= 0
              const has52W = m.week52Low != null && m.week52High != null && m.week52High !== m.week52Low
              const pct52W = has52W ? Math.min(100, Math.max(0, ((m.price - m.week52Low) / (m.week52High - m.week52Low)) * 100)) : null
              return (
                <div key={m.ticker} className="flex w-[160px] shrink-0 flex-col rounded-[10px] border border-[#9ca3af] bg-[#fafafa] p-4 transition-colors hover:bg-[#f3f4f6]">
                  <p className="text-[11px] font-bold text-[#101828]" style={MONO}>{m.ticker}</p>
                  <p className="mt-1 text-[15px] font-semibold text-[#101828]" style={MONO}>
                    ${m.price.toFixed(2)}
                  </p>
                  <div className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${up ? 'text-[#16a34a]' : 'text-[#dc2626]'}`} style={MONO}>
                    <span>{up ? '▲' : '▼'}</span>
                    <span>{Math.abs(m.changePct).toFixed(2)}%</span>
                    <span className="font-normal opacity-70">{up ? '+$' : '-$'}{Math.abs(m.change ?? 0).toFixed(2)}</span>
                  </div>
                  {has52W && (
                    <div className="mt-3">
                      <p className="mb-1 text-[9px] font-semibold uppercase tracking-[1px] text-[#9ca3af]" style={MONO}>52W Range</p>
                      <div className="relative h-1 rounded-full bg-[#e5e7eb]">
                        <div className="absolute inset-y-0 left-0 rounded-full bg-[#d1d5db]" style={{ width: `${pct52W}%` }} />
                        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#101828] shadow-sm" style={{ left: `${pct52W}%` }} />
                      </div>
                      <div className="mt-1 flex justify-between">
                        <span className="text-[9px] text-[#9ca3af]" style={MONO}>${m.week52Low.toFixed(2)}</span>
                        <span className="text-[9px] text-[#9ca3af]" style={MONO}>${m.week52High.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
        }
      </div>
    </div>
  )
}

function MarketStatusInline() {
  const { isOpen, timeStr, dateStr, tzAbbr } = useMarketClock()
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${isOpen ? 'bg-[#16a34a]' : 'bg-[#6a7282]'}`}
          style={isOpen ? { boxShadow: '0 0 0 2px #dcfce7' } : {}} />
        <span className="text-[16px] font-medium text-[#4a5565]" style={MONO}>
          Market {isOpen ? 'Open' : 'Closed'}
        </span>
      </div>
      <span className="text-[#d1d5db]">·</span>
      <span className="text-[16px] text-[#6a7282]" style={MONO}>
        {timeStr} <span className="text-[#9ca3af]">{tzAbbr}</span>
      </span>
      <span className="text-[#d1d5db]">·</span>
      <span className="text-[16px] text-[#9ca3af]" style={MONO}>{dateStr}</span>
    </div>
  )
}

function AccountDetailPanel({ account, holdings, accountsMeta, onClose }) {
  const open = !!account
  const accHoldings = (holdings ?? []).filter(h => h.account_id === account?.account_id)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

  const { data: tradeData, isLoading: tradesLoading } = useInvestmentTransactions(account?.account_id)

  const meta = (accountsMeta ?? []).find(a => a.account_id === account?.account_id)

  const totalValue = accHoldings.reduce((s, h) => s + (h.value ?? 0), 0)
  const totalCostBasis = accHoldings.reduce((s, h) => s + (h.cost_basis ?? 0), 0)
  const unrealizedGain = totalCostBasis > 0 ? totalValue - totalCostBasis : null

  const typeLabel = [meta?.type, meta?.subtype].filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' · ')

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={onClose} />}
      <div className={`fixed right-0 top-0 z-50 flex h-full w-[400px] flex-col border-l border-[#d9d9d9] bg-white shadow-xl transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-[#d9d9d9] px-5 py-4">
          <div className="min-w-0 pr-3">
            <p className="text-[16px] font-semibold text-[#101828] leading-tight" style={MONO}>{account?.name}</p>
            <p className="mt-0.5 text-[12px] text-[#6a7282]" style={MONO}>{account?.institution}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-[#999] hover:text-[#1e1e1e] transition-colors text-xl leading-none cursor-pointer mt-0.5">×</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Account metadata */}
          <div className="border-b border-[#f3f4f6] px-5 py-4 flex flex-col gap-2.5">
            {typeLabel && (
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[#6a7282]" style={MONO}>Type</span>
                <span className="text-[12px] font-medium text-[#101828]" style={MONO}>{typeLabel}</span>
              </div>
            )}
            {meta?.current != null && (
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[#6a7282]" style={MONO}>Current balance</span>
                <span className="text-[12px] font-medium text-[#101828]" style={MONO}>{fmt(meta.current)}</span>
              </div>
            )}
            {meta?.available != null && (
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[#6a7282]" style={MONO}>Available balance</span>
                <span className="text-[12px] font-medium text-[#101828]" style={MONO}>{fmt(meta.available)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#6a7282]" style={MONO}>Holdings value</span>
              <span className="text-[12px] font-semibold text-[#101828]" style={MONO}>{fmt(totalValue)}</span>
            </div>
            {unrealizedGain != null && (
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[#6a7282]" style={MONO}>Unrealized gain/loss</span>
                <span className={`text-[12px] font-semibold ${unrealizedGain >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`} style={MONO}>
                  {unrealizedGain >= 0 ? '+' : ''}{fmt(unrealizedGain)}
                </span>
              </div>
            )}
            {totalCostBasis > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[#6a7282]" style={MONO}>Cost basis</span>
                <span className="text-[12px] text-[#101828]" style={MONO}>{fmt(totalCostBasis)}</span>
              </div>
            )}
            {meta?.account_id && (
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[#6a7282]" style={MONO}>Account ID</span>
                <span className="text-[11px] text-[#9ca3af] font-mono">{meta.account_id}</span>
              </div>
            )}
          </div>

          {/* Holdings */}
          {accHoldings.length > 0 && (
            <div className="px-5 py-4">
              <p className="mb-3 text-[13px] font-bold uppercase tracking-[1px] text-[#101828]" style={MONO}>
                Holdings ({accHoldings.length})
              </p>
              <div className="divide-y divide-[#d1d5db]">
                {accHoldings.map((h, i) => {
                  const gain = h.cost_basis != null && h.value != null ? h.value - h.cost_basis : null
                  const gainPct = gain != null && h.cost_basis > 0 ? (gain / h.cost_basis) * 100 : null
                  return (
                    <div key={i} className="py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-[#101828]" style={MONO}>{h.ticker ?? '—'}</p>
                          <p className="truncate text-[11px] text-[#6a7282]" style={MONO}>{h.security_name}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[13px] font-semibold text-[#101828]" style={MONO}>{fmt(h.value)}</p>
                          {gain != null && (
                            <p className={`text-[11px] ${gain >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`} style={MONO}>
                              {gain >= 0 ? '+' : ''}{fmt(gain)}{gainPct != null ? ` (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                        {h.quantity != null && (
                          <span className="text-[11px] text-[#9ca3af]" style={MONO}>{h.quantity.toFixed(4)} shares</span>
                        )}
                        {h.close_price != null && (
                          <span className="text-[11px] text-[#9ca3af]" style={MONO}>@ {fmt(h.close_price)}</span>
                        )}
                        {h.security_type && (
                          <span className="text-[11px] text-[#9ca3af]" style={MONO}>{h.security_type}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {accHoldings.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="text-[16px] text-[#6a7282]" style={MONO}>No holdings data available</p>
            </div>
          )}

          {/* Trade History */}
          <div className="border-t border-[#f3f4f6] px-5 py-4">
            <p className="mb-3 text-[13px] font-bold uppercase tracking-[1px] text-[#101828]" style={MONO}>
              Trade History
            </p>
            {tradesLoading ? (
              <div className="flex flex-col gap-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <div className="h-3 w-32 animate-pulse rounded bg-[#e5e7eb]" />
                    <div className="h-3 w-48 animate-pulse rounded bg-[#f3f4f6]" />
                  </div>
                ))}
              </div>
            ) : (tradeData?.transactions ?? []).length === 0 ? (
              <p className="text-[13px] text-[#9ca3af]" style={MONO}>No trade history available</p>
            ) : (
              <div className="divide-y divide-[#f3f4f6]">
                {(tradeData.transactions).map((t, i) => (
                  <div key={i} className="py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {t.ticker && <span className="text-[12px] font-semibold text-[#101828]" style={MONO}>{t.ticker}</span>}
                          <span className="rounded px-1 py-0.5 text-[10px] font-medium uppercase tracking-[0.5px]"
                            style={{
                              background: t.type === 'buy' ? '#dcfce7' : t.type === 'sell' ? '#fee2e2' : '#f3f4f6',
                              color: t.type === 'buy' ? '#15803d' : t.type === 'sell' ? '#b91c1c' : '#4a5565',
                              fontFamily: 'JetBrains Mono,monospace',
                            }}>
                            {t.subtype || t.type || '—'}
                          </span>
                        </div>
                        {t.security_name && !t.ticker && (
                          <p className="mt-0.5 truncate text-[11px] text-[#6a7282]" style={MONO}>{t.security_name}</p>
                        )}
                        <p className="mt-0.5 text-[11px] text-[#9ca3af]" style={MONO}>{t.date}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        {t.amount != null && (
                          <p className="text-[12px] font-semibold text-[#101828]" style={MONO}>{fmt(Math.abs(t.amount))}</p>
                        )}
                        {t.quantity != null && t.price != null && (
                          <p className="text-[11px] text-[#9ca3af]" style={MONO}>
                            {Math.abs(t.quantity).toFixed(4)} @ {fmt(t.price)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export function InvestmentsPage() {
  const { isOpen } = useMarketClock()
  const [chartRange, setChartRange] = useState('1W')
  const [selectedDate, setSelectedDate] = useState(null)
  const [moversRange, setMoversRange] = useState('1D')
  const [highlightedTicker, setHighlightedTicker] = useState(null)
  const [showAllAccounts, setShowAllAccounts] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState(null)
  const [panelAccount, setPanelAccount] = useState(null)
  const hoveredDateRef = useRef(null)

  const { data: investmentsData, isLoading: holdingsLoading } = useInvestments()
  const { data: accountsData } = useAccounts()
  const { data: chartData, isLoading: chartLoading } = usePortfolioHistory(chartRange, selectedAccountId)
  const { data: ytdData } = usePortfolioHistory('YTD', selectedAccountId)
  const { data: weekData } = usePortfolioHistory('1W', selectedAccountId)
  const { data: snapshotData, isLoading: snapshotLoading } = usePortfolioSnapshot(selectedDate)

  const holdings = investmentsData?.holdings ?? []

  // Unique tickers eligible for Yahoo Finance lookup (skip cash/currency entries)
  const portfolioTickers = useMemo(() => {
    const seen = new Set()
    return holdings
      .map(h => h.ticker)
      .filter(t => t && !t.startsWith('CUR:') && !seen.has(t) && seen.add(t))
  }, [holdings])

  // YTD start price per ticker for the holdings table YTD Change column
  const { data: ytdTickerData } = useTickerHistory(portfolioTickers, 'YTD')
  const ytdStartPriceMap = useMemo(() => {
    const map = {}
    for (const s of ytdTickerData?.series ?? []) {
      if (s.data.length > 0) map[s.ticker] = s.data[0].price
    }
    return map
  }, [ytdTickerData])

  // Movers-range start price per ticker (reuses cached data from PortfolioMoversChart)
  const { data: moversTickerData } = useTickerHistory(portfolioTickers, moversRange)
  const moversStartPriceMap = useMemo(() => {
    const map = {}
    for (const s of moversTickerData?.series ?? []) {
      if (s.data.length > 0) map[s.ticker] = s.data[0].price
    }
    return map
  }, [moversTickerData])

  // Stable color assignment per ticker — shared between chart and table
  const colorMap = useMemo(() => {
    const series = moversTickerData?.series ?? []
    const sorted = [...series].sort((a, b) => {
      const av = a.data[a.data.length - 1]?.price ?? 0
      const bv = b.data[b.data.length - 1]?.price ?? 0
      return bv - av
    })
    const map = {}
    sorted.forEach((s, i) => { map[s.ticker] = LINE_COLORS[i % LINE_COLORS.length] })
    return map
  }, [moversTickerData])

  const { data: quotesData, isLoading: quotesLoading } = useQuotes(portfolioTickers)
  const topMovers = useMemo(() => {
    if (!quotesData?.quotes?.length) return []
    return [...quotesData.quotes]
      .filter(q => q.changePct != null)
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
  }, [quotesData])

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
      const key = h.account_id
      if (!map[key]) map[key] = { account_id: h.account_id, name: h.account_name, institution: h.institution_name, value: 0 }
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
      .map(([name, value]) => ({ name, value, pct: (value / totalValue) * 100 }))
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

  const chartPoints = useMemo(() => {
    const history = chartData?.history ?? []
    if (!history.length) return []
    const maxPoints = chartRange === '1W' ? 100 : chartRange === '1M' ? 60 : 90
    if (history.length <= maxPoints) return history
    const step = Math.ceil(history.length / maxPoints)
    const sampled = history.filter((_, i) => i % step === 0)
    if (sampled[sampled.length - 1]?.date !== history[history.length - 1]?.date) {
      sampled.push(history[history.length - 1])
    }
    return sampled
  }, [chartData, chartRange])

  const isLoading = holdingsLoading

  return (
    <div className="min-h-screen bg-[#f8f8f8]" style={{ paddingLeft: 'var(--sidebar-w)' }}>
      <AppHeader />

      <AccountDetailPanel
        account={panelAccount}
        holdings={holdings}
        accountsMeta={accountsData?.accounts}
        onClose={() => { setPanelAccount(null); setSelectedAccountId(null) }}
      />

      {/* Snapshot side panel */}
      {selectedDate && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setSelectedDate(null)}>
          <div
            className="relative flex h-full w-full max-w-[420px] flex-col overflow-y-auto bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#9ca3af] px-5 py-4">
              <div>
                <p className="text-[13px] font-bold uppercase tracking-[1px] text-[#101828]" style={MONO}>Snapshot</p>
                <p className="mt-0.5 text-[15px] font-semibold text-[#101828]" style={MONO}>
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="rounded-md p-1.5 text-[#6a7282] hover:bg-[#f3f4f6] hover:text-[#101828]"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/></svg>
              </button>
            </div>

            {snapshotLoading ? (
              <div className="flex flex-1 flex-col gap-3 px-5 py-6">
                {[0,1,2,3,4,5].map(i => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : !snapshotData || snapshotData.holdings?.length === 0 ? (
              <p className="px-5 py-6 text-[16px] text-[#6a7282]" style={MONO}>No holdings data for this date.</p>
            ) : (
              <>
                {/* Total value */}
                <div className="border-b border-[#9ca3af] px-5 py-4">
                  <p className="text-[13px] font-bold uppercase tracking-[1px] text-[#101828]" style={MONO}>Total Value</p>
                  <p className="mt-1 text-[28px] font-bold tracking-tight text-[#101828]" style={MONO}>{fmt(snapshotData.total)}</p>
                </div>

                {/* Accounts */}
                {snapshotData.accounts?.length > 0 && (
                  <div className="border-b border-[#9ca3af] px-5 py-4">
                    <p className="mb-3 text-[13px] font-bold uppercase tracking-[1px] text-[#101828]" style={MONO}>Accounts</p>
                    <div className="flex flex-col gap-2">
                      {snapshotData.accounts.map((acc, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div>
                            <p className="text-[13px] font-medium text-[#101828]" style={MONO}>{acc.account_name}</p>
                            <p className="text-[11px] text-[#6a7282]" style={MONO}>{acc.institution}</p>
                          </div>
                          <p className="text-[13px] text-[#4a5565]" style={MONO}>{fmt(acc.value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Holdings */}
                <div className="px-5 py-4">
                  <p className="mb-3 text-[13px] font-bold uppercase tracking-[1px] text-[#101828]" style={MONO}>
                    Holdings ({snapshotData.holdings.length})
                  </p>
                  <div className="flex flex-col divide-y divide-[#d1d5db]">
                    {snapshotData.holdings.map((h, i) => {
                      const gainLoss = h.value != null && h.cost_basis != null ? h.value - h.cost_basis : null
                      const gainPct = gainLoss != null && h.cost_basis ? (gainLoss / h.cost_basis) * 100 : null
                      return (
                        <div key={i} className="py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              {h.ticker && (
                                <span className="mr-1.5 inline-block rounded bg-[#f3f4f6] px-1.5 py-0.5 text-[11px] font-semibold text-[#4a5565]" style={MONO}>
                                  {h.ticker}
                                </span>
                              )}
                              <p className="mt-0.5 truncate text-[12px] text-[#6a7282]" style={MONO}>{h.security_name}</p>
                            </div>
                            <p className="shrink-0 text-[13px] font-medium text-[#101828]" style={MONO}>{fmt(h.value)}</p>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <p className="text-[11px] text-[#9ca3af]" style={MONO}>
                              {h.quantity != null ? `${h.quantity.toFixed(4)} shares` : ''}
                              {h.quantity != null && h.price != null ? ` · ${fmt(h.price)}` : ''}
                            </p>
                            {gainLoss != null && (
                              <p className={`text-[11px] font-semibold ${gainLoss >= 0 ? 'text-[#155dfc]' : 'text-[#dc2626]'}`} style={MONO}>
                                {gainLoss >= 0 ? '+' : ''}{fmt(gainLoss)}
                                {gainPct != null && ` (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)`}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="border-b border-[#9ca3af] bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <h1 className="text-[24px] font-semibold tracking-[-0.5px] text-[#18181b]" style={MONO}>Investments</h1>
          <MarketStatusInline />
        </div>
      </div>

      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1100px]">
          <TopMoversRow movers={topMovers} isLoading={holdingsLoading || quotesLoading} isOpen={isOpen} />
          <div className="overflow-hidden rounded-[14px] border border-[#9ca3af] bg-white">

            {/* ── Top stats row ── */}
            <div className="grid grid-cols-1 divide-y divide-[#9ca3af] border-b border-[#9ca3af] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {/* Total Balance */}
              <div className="px-6 py-5">
                <SectionLabel>Total Portfolio Value</SectionLabel>
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
                  <div className="mt-1 flex items-center gap-2">
                    <p className={`text-[28px] font-bold tracking-tight ${
                      dayChange == null ? 'text-[#101828]' : dayChange >= 0 ? 'text-[#155dfc]' : 'text-[#dc2626]'
                    }`} style={MONO}>
                      {dayChange != null ? `${dayChange >= 0 ? '↑ ' : '↓ '}${fmt(Math.abs(dayChange))}` : '—'}
                    </p>
                    {dayChangePct != null && (
                      <span className={`rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${
                        dayChangePct >= 0 ? 'bg-[#eff6ff] text-[#155dfc]' : 'bg-[#fef2f2] text-[#dc2626]'
                      }`} style={MONO}>
                        {fmtPct(dayChangePct)}
                      </span>
                    )}
                  </div>
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
                  <div className="mt-1 flex items-center gap-2">
                    <p className={`text-[28px] font-bold tracking-tight ${
                      ytdReturn == null ? 'text-[#101828]' : ytdReturn >= 0 ? 'text-[#155dfc]' : 'text-[#dc2626]'
                    }`} style={MONO}>
                      {ytdReturn != null ? `${ytdReturn >= 0 ? '↑ ' : '↓ '}${fmt(Math.abs(ytdReturn))}` : '—'}
                    </p>
                    {ytdReturnPct != null && (
                      <span className={`rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${
                        ytdReturnPct >= 0 ? 'bg-[#eff6ff] text-[#155dfc]' : 'bg-[#fef2f2] text-[#dc2626]'
                      }`} style={MONO}>
                        {fmtPct(ytdReturnPct)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Main content ── */}
            <div className="flex flex-col divide-y divide-[#9ca3af] lg:flex-row lg:divide-x lg:divide-y-0" style={{ minHeight: 480 }}>

              {/* Left: Accounts + Allocation */}
              <div className="w-full shrink-0 lg:w-[260px]">
                {/* Accounts */}
                <div>
                  <div className="flex h-[52px] items-center justify-between border-b border-[#9ca3af] px-5">
                    <SectionLabel>Accounts</SectionLabel>
                    {!isLoading && accounts.length > 0 && (
                      <span className="text-[11px] font-semibold text-[#6a7282]" style={MONO}>{accounts.length}</span>
                    )}
                  </div>
                  <div className="px-5 py-4">
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
                      <p className="text-[16px] text-[#6a7282]" style={MONO}>No accounts</p>
                    ) : (
                      <div className="divide-y divide-[#d1d5db]">
                        {(showAllAccounts ? accounts : accounts.slice(0, 5)).map((acc, i) => {
                          const isSelected = selectedAccountId === acc.account_id
                          return (
                          <div
                            key={i}
                            className={`flex cursor-pointer items-start justify-between gap-2 rounded-[6px] px-2 py-2.5 transition-colors ${isSelected ? 'bg-[#f0f4ff]' : 'hover:bg-[#f9fafb]'}`}
                            onClick={() => { setPanelAccount(acc); setSelectedAccountId(acc.account_id) }}
                          >
                            <div className="min-w-0">
                              <p className={`line-clamp-2 text-[12px] ${isSelected ? 'font-semibold text-[#101828]' : 'text-[#4a5565]'}`} style={MONO}>{acc.name}</p>
                              {acc.institution && (
                                <p className="truncate text-[11px] text-[#9ca3af]" style={MONO}>{acc.institution}</p>
                              )}
                            </div>
                            <p className={`shrink-0 text-[13px] font-semibold ${isSelected ? 'text-[#101828]' : 'text-[#101828]'}`} style={MONO}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(acc.value)}</p>
                          </div>
                        )})}

                        {accounts.length > 5 && (
                          <button
                            onClick={() => setShowAllAccounts(v => !v)}
                            className="mt-2 text-left text-[11px] font-semibold text-[#6a7282] hover:text-[#101828] transition-colors"
                            style={MONO}
                          >
                            {showAllAccounts ? 'Show less' : `Show all (${accounts.length})`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Allocation */}
                <div>
                  <div className="flex h-[52px] items-center border-b border-[#9ca3af] px-5">
                    <SectionLabel>Asset Allocation</SectionLabel>
                  </div>
                  <div className="px-5 pb-4">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="h-[120px] w-[120px] animate-pulse rounded-full bg-[#f3f4f6]" />
                    </div>
                  ) : allocation.length === 0 ? (
                    <p className="text-[16px] text-[#6a7282]" style={MONO}>—</p>
                  ) : (
                    <AllocationDonut allocation={allocation} />
                  )}
                  </div>
                </div>
              </div>

              {/* Middle: Performance chart */}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-[52px] items-center justify-between border-b border-[#9ca3af] px-5">
                  <div className="flex items-center gap-2">
                    <SectionLabel>Performance</SectionLabel>
                    {selectedAccountId && (
                      <span className="rounded-full bg-[#f0f4ff] px-2 py-0.5 text-[10px] font-semibold text-[#3b5bdb]" style={MONO}>
                        {accounts.find(a => a.account_id === selectedAccountId)?.name ?? '1 account'}
                      </span>
                    )}
                  </div>
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
                    <div className="h-full w-full animate-pulse rounded bg-[#f3f4f6]" style={{ minHeight: 240 }} />
                  ) : chartPoints.length < 2 ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <p className="text-center text-[16px] text-[#6a7282]" style={MONO}>
                        Not enough history yet — check back after another day of data accumulates.
                      </p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                      <AreaChart
                        data={chartPoints}
                        margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
                        onMouseMove={(data) => {
                          const date = data?.activePayload?.[0]?.payload?.date ?? data?.activeLabel
                          if (date) hoveredDateRef.current = date
                        }}
                        onClick={(data) => {
                          const date = data?.activePayload?.[0]?.payload?.date ?? data?.activeLabel ?? hoveredDateRef.current
                          if (date) setSelectedDate(prev => prev === date ? null : date)
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <defs>
                          <linearGradient id="invGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.15} />
                            <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
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
                          tickFormatter={(v) => fmtCompact(v)}
                          width={56}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#7c3aed"
                          strokeWidth={2}
                          fill="url(#invGradient)"
                          dot={false}
                          activeDot={{ r: 4, fill: '#7c3aed', stroke: '#fff', strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Right: Top Holdings */}
              <div className="w-full shrink-0 lg:w-[300px]">
                <div className="flex h-[52px] items-center justify-between border-b border-[#9ca3af] px-5">
                  <SectionLabel>Top Holdings</SectionLabel>
                  <span className="text-[11px] font-semibold text-[#6a7282]" style={MONO}>%</span>
                </div>
                <div className="px-5">
                  <div className="grid grid-cols-3 gap-2 border-b border-[#9ca3af] py-2.5">
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
                    <p className="py-4 text-[16px] text-[#6a7282]" style={MONO}>No holdings</p>
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

          {/* ── Portfolio movers chart ── */}
          <PortfolioMoversChart
            tickers={portfolioTickers}
            range={moversRange}
            onRangeChange={setMoversRange}
            highlightedTicker={highlightedTicker}
            onTickerClick={(ticker) => setHighlightedTicker(prev => prev === ticker ? null : ticker)}
            colorMap={colorMap}
          />

          {/* ── Holdings performance table ── */}
          <HoldingsPerformanceTable
            holdings={holdings}
            isLoading={isLoading}
            highlightedTicker={highlightedTicker}
            onTickerClick={(ticker) => setHighlightedTicker(prev => prev === ticker ? null : ticker)}
            ytdStartPriceMap={ytdStartPriceMap}
            moversRange={moversRange}
            moversStartPriceMap={moversStartPriceMap}
            colorMap={colorMap}
          />

        </div>
      </main>
    </div>
  )
}

function MoversTooltip({ active, payload, label, highlightedTicker, isIntraday }) {
  if (!active || !payload?.length) return null
  const dateLabel = isIntraday
    ? new Date(label).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    : new Date(label + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const items = highlightedTicker
    ? payload.filter(p => p.dataKey === highlightedTicker)
    : payload.slice().sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  return (
    <div className="rounded-lg border border-[#9ca3af] bg-white px-3 py-2 shadow-sm" style={MONO}>
      <p className="mb-1.5 text-[11px] text-[#6a7282]">{dateLabel}</p>
      {items.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
          <span className="text-[11px] text-[#6a7282]">{p.dataKey}</span>
          <span className="ml-auto pl-4 text-[13px] font-semibold text-[#101828]">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function PortfolioMoversChart({ tickers, range, onRangeChange, highlightedTicker, onTickerClick, colorMap }) {
  const { isOpen } = useMarketClock()
  const { data, isLoading } = useTickerHistory(
    tickers,
    range,
    range === '1D' && isOpen ? { refetchInterval: 60_000, staleTime: 60_000 } : {},
  )
  const series = data?.series ?? []
  const isIntraday = data?.isIntraday ?? false

  // Build flat chart data: [{ date, TICKER: price, ... }]
  const chartData = useMemo(() => {
    if (!series.length) return []
    const dateSet = new Set()
    for (const s of series) s.data.forEach(d => dateSet.add(d.date))
    const allDates = [...dateSet].sort()
    return allDates.map(date => {
      const point = { date }
      for (const s of series) {
        const d = s.data.find(x => x.date === date)
        if (d != null) point[s.ticker] = d.price
      }
      return point
    })
  }, [series])

  const isEmpty = !isLoading && chartData.length === 0

  return (
    <div className="mt-4 overflow-hidden rounded-t-[14px] border border-b-0 border-[#9ca3af] bg-white">
      {/* Header */}
      <div className="flex h-[52px] items-center justify-between border-b border-[#9ca3af] px-6">
        <SectionLabel>Your Positions</SectionLabel>
        <div className="flex items-center gap-0.5">
          {MOVERS_RANGES.map(r => (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              className={`rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${r === range ? 'bg-[#101828] text-white' : 'text-[#6a7282] hover:bg-[#f3f4f6]'}`}
              style={MONO}
            >
              {r === 'ALL' ? 'MAX' : r}
            </button>
          ))}
        </div>
      </div>

      {/* 1D session label */}
      {range === '1D' && data?.tradingDate && (
        <div className="flex items-center gap-2 border-b border-[#f3f4f6] px-6 py-1.5">
          {isOpen ? (
            <>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
              <span className="text-[10px] text-[#9ca3af]" style={MONO}>Live · updates every minute</span>
            </>
          ) : (
            <span className="text-[10px] text-[#9ca3af]" style={MONO}>
              {(() => {
                const [y, m, d] = data.tradingDate.split('-')
                return new Date(+y, +m - 1, +d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              })()} session · market closed
            </span>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="px-2 py-4" style={{ height: 280 }}>
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-full w-full animate-pulse rounded bg-[#f3f4f6]" />
          </div>
        ) : isEmpty ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[16px] text-[#6a7282]" style={MONO}>No historical price data yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={d => fmtDateLabel(d, range)}
                tick={{ fontSize: 11, fill: '#9ca3af', fontFamily: 'JetBrains Mono,monospace' }}
                axisLine={false}
                tickLine={false}
                minTickGap={isIntraday ? 60 : 40}
              />
              <YAxis
                tickFormatter={v => fmt(v)}
                tick={{ fontSize: 11, fill: '#9ca3af', fontFamily: 'JetBrains Mono,monospace' }}
                axisLine={false}
                tickLine={false}
                width={72}
              />
              <Tooltip
                content={<MoversTooltip highlightedTicker={highlightedTicker} isIntraday={isIntraday} />}
                cursor={{ stroke: '#e5e7eb', strokeWidth: 1 }}
              />
              {series.map(s => {
                const color = colorMap[s.ticker] ?? '#9ca3af'
                const isHL = highlightedTicker === s.ticker
                const dimmed = highlightedTicker && !isHL
                return (
                  <Line
                    key={s.ticker}
                    type="monotone"
                    dataKey={s.ticker}
                    stroke={color}
                    strokeWidth={isHL ? 2.5 : 1.5}
                    dot={false}
                    strokeOpacity={dimmed ? 0.12 : 1}
                    connectNulls
                    onClick={() => onTickerClick(s.ticker)}
                    style={{ cursor: 'pointer' }}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

    </div>
  )
}

function TickerLogo({ ticker, size = 32 }) {
  const [errored, setErrored] = useState(false)
  if (!ticker || errored) {
    const colors = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2', '#7c3aed']
    const color = colors[(ticker?.charCodeAt(0) ?? 0) % colors.length]
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-md font-bold text-white"
        style={{ width: size, height: size, background: color, fontSize: Math.floor(size * 0.35), fontFamily: 'JetBrains Mono,monospace' }}
      >
        {(ticker ?? '?').slice(0, 2)}
      </div>
    )
  }
  return (
    <img
      src={`https://assets.parqet.com/logos/symbol/${ticker}`}
      alt={ticker}
      width={size}
      height={size}
      className="shrink-0 rounded-md object-contain"
      onError={() => setErrored(true)}
    />
  )
}

function shortenName(name) {
  if (!name) return name
  const parts = name.split(' - ')
  if (parts.length === 1) return name
  const last = parts[parts.length - 1]
  return last.length > 8 ? last : parts[0]
}

function HoldingsPerformanceTable({ holdings, isLoading, highlightedTicker, onTickerClick, ytdStartPriceMap = {}, moversRange = '1Y', moversStartPriceMap = {}, colorMap = {} }) {
  const rows = useMemo(() => {
    if (!holdings.length) return []
    const map = {}
    for (const h of holdings) {
      const key = h.ticker ?? h.security_name ?? 'Unknown'
      if (!map[key]) map[key] = {
        ticker: h.ticker,
        security_name: h.security_name,
        security_type: h.security_type,
        quantity: 0,
        value: 0,
        cost_basis_total: 0,
        has_cost_basis: false,
        institution_price: h.institution_price,
      }
      map[key].quantity += h.quantity ?? 0
      map[key].value += h.value ?? 0
      if (h.cost_basis != null) {
        map[key].cost_basis_total += h.cost_basis
        map[key].has_cost_basis = true
      }
    }
    return Object.values(map)
      .map(r => ({
        ...r,
        price: r.institution_price ?? (r.quantity > 0 ? r.value / r.quantity : null),
        avg_cost_per_share: r.has_cost_basis && r.quantity > 0 ? r.cost_basis_total / r.quantity : null,
      }))
      .sort((a, b) => b.value - a.value)
  }, [holdings])

  const moversLabel = moversRange === 'ALL' ? 'MAX' : moversRange
  const showMoversCol = moversRange !== 'YTD'
  const COLS = ['Asset', 'Shares', 'Price', 'Value', 'Cost Basis', 'Avg / Share', 'YTD Change', ...(showMoversCol ? [`${moversLabel} Change`] : [])]

  return (
    <div className="overflow-hidden rounded-b-[14px] border border-[#9ca3af] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse">
          <thead>
            <tr className="border-b border-[#9ca3af]">
              {COLS.map((col, i) => (
                <th
                  key={i}
                  className={`px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[1px] text-[#6a7282] ${i === 0 ? 'text-left' : 'text-right'} ${i < COLS.length - 1 ? 'border-r border-[#9ca3af]' : ''}`}
                  style={MONO}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [0,1,2,3,4].map(i => (
                <tr key={i} className="border-b border-[#f3f4f6]">
                  <td className="border-r border-[#9ca3af] px-6 py-3"><div className="flex items-center gap-3"><Skeleton className="h-8 w-8 rounded-md" /><div className="flex flex-col gap-1"><Skeleton className="h-3.5 w-28" /><Skeleton className="h-3 w-16" /></div></div></td>
                  {(showMoversCol ? [0,1,2,3,4,5,6] : [0,1,2,3,4,5]).map(j => <td key={j} className={`px-6 py-3 ${j < (showMoversCol ? 6 : 5) ? 'border-r border-[#9ca3af]' : ''}`}><Skeleton className="ml-auto h-3.5 w-20" /></td>)}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={COLS.length} className="px-6 py-8 text-center text-[16px] text-[#6a7282]" style={MONO}>No holdings</td></tr>
            ) : (
              rows.map((row, i) => {
                const gainLoss = row.has_cost_basis ? row.value - row.cost_basis_total : null
                const gainPct = gainLoss != null && row.cost_basis_total
                  ? (gainLoss / row.cost_basis_total) * 100
                  : null
                return (
                  <tr
                    key={i}
                    onClick={() => row.ticker && onTickerClick?.(row.ticker)}
                    className={`border-b border-[#f3f4f6] transition-colors ${row.ticker ? 'cursor-pointer' : ''} ${
                      highlightedTicker && highlightedTicker !== row.ticker ? 'opacity-40' : 'hover:bg-[#fafafa]'
                    } ${highlightedTicker === row.ticker ? 'bg-[#f5f8ff]' : ''}`}
                  >
                    {/* Asset */}
                    <td className="relative w-[225px] max-w-[225px] border-r border-[#9ca3af] py-3 pl-5 pr-6">
                      {colorMap[row.ticker] && (
                        <div
                          className="absolute left-[6px] top-[8px] bottom-[8px] w-[4px] rounded-full"
                          style={{ background: colorMap[row.ticker] }}
                        />
                      )}
                      <div className="flex items-center gap-3">
                        <TickerLogo ticker={row.ticker} size={32} />
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold leading-snug text-[#101828]">{shortenName(row.security_name)}</p>
                          <p className="text-[11px] text-[#6a7282]" style={MONO}>
                            {row.ticker ?? '—'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Shares */}
                    <td className="border-r border-[#9ca3af] px-6 py-3 text-right text-[13px] text-[#4a5565]" style={MONO}>
                      {row.quantity != null ? row.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—'}
                    </td>

                    {/* Price */}
                    <td className="border-r border-[#9ca3af] px-6 py-3 text-right text-[13px] text-[#101828]" style={MONO}>
                      {row.price != null ? fmt(row.price) : '—'}
                    </td>

                    {/* Value */}
                    <td className="border-r border-[#9ca3af] px-6 py-3 text-right" style={MONO}>
                      <p className="text-[13px] font-medium text-[#101828]">{fmt(row.value)}</p>
                      {gainPct != null && (
                        <p className={`text-[11px] font-semibold ${gainPct >= 0 ? 'text-[#155dfc]' : 'text-[#dc2626]'}`}>
                          {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%
                        </p>
                      )}
                    </td>

                    {/* Cost Basis */}
                    <td className="border-r border-[#9ca3af] px-6 py-3 text-right" style={MONO}>
                      {row.has_cost_basis ? (
                        <>
                          <p className="text-[13px] text-[#4a5565]">{fmt(row.cost_basis_total)}</p>
                          {gainLoss != null && (
                            <p className={`text-[11px] font-semibold ${gainLoss >= 0 ? 'text-[#155dfc]' : 'text-[#dc2626]'}`}>
                              {gainLoss >= 0 ? '+' : ''}{fmt(gainLoss)}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-[16px] text-[#9ca3af]">—</p>
                      )}
                    </td>

                    {/* Avg Cost / Share */}
                    <td className="border-r border-[#9ca3af] px-6 py-3 text-right" style={MONO}>
                      {row.avg_cost_per_share != null ? (
                        <>
                          <p className="text-[13px] text-[#4a5565]">{fmt(row.avg_cost_per_share)}</p>
                          {row.price != null && (
                            <p className={`text-[11px] font-semibold ${row.price >= row.avg_cost_per_share ? 'text-[#155dfc]' : 'text-[#dc2626]'}`}>
                              {row.price >= row.avg_cost_per_share ? '+' : ''}{fmt(row.price - row.avg_cost_per_share)} / sh
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-[16px] text-[#9ca3af]">—</p>
                      )}
                    </td>

                    {/* YTD Change */}
                    {(() => {
                      const ytdStart = row.ticker ? ytdStartPriceMap[row.ticker] : null
                      const ytdDiff = ytdStart != null && row.price != null ? row.price - ytdStart : null
                      const ytdPct = ytdDiff != null && ytdStart ? (ytdDiff / ytdStart) * 100 : null
                      return (
                        <td className={`px-6 py-3 text-right ${showMoversCol ? 'border-r border-[#9ca3af]' : ''}`} style={MONO}>
                          {ytdPct != null ? (
                            <>
                              <p className={`text-[13px] font-medium ${ytdPct >= 0 ? 'text-[#155dfc]' : 'text-[#dc2626]'}`}>
                                {ytdPct >= 0 ? '+' : ''}{ytdPct.toFixed(2)}%
                              </p>
                              <p className={`text-[11px] font-semibold ${ytdDiff >= 0 ? 'text-[#155dfc]' : 'text-[#dc2626]'}`}>
                                {ytdDiff >= 0 ? '+' : ''}{fmt(ytdDiff)}
                              </p>
                            </>
                          ) : (
                            <p className="text-[16px] text-[#9ca3af]">—</p>
                          )}
                        </td>
                      )
                    })()}

                    {/* Movers Range Change */}
                    {showMoversCol && (() => {
                      const mStart = row.ticker ? moversStartPriceMap[row.ticker] : null
                      const mDiff = mStart != null && row.price != null ? row.price - mStart : null
                      const mPct = mDiff != null && mStart ? (mDiff / mStart) * 100 : null
                      return (
                        <td className="px-6 py-3 text-right" style={MONO}>
                          {mPct != null ? (
                            <>
                              <p className={`text-[13px] font-medium ${mPct >= 0 ? 'text-[#155dfc]' : 'text-[#dc2626]'}`}>
                                {mPct >= 0 ? '+' : ''}{mPct.toFixed(2)}%
                              </p>
                              <p className={`text-[11px] font-semibold ${mDiff >= 0 ? 'text-[#155dfc]' : 'text-[#dc2626]'}`}>
                                {mDiff >= 0 ? '+' : ''}{fmt(mDiff)}
                              </p>
                            </>
                          ) : (
                            <p className="text-[16px] text-[#9ca3af]">—</p>
                          )}
                        </td>
                      )
                    })()}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
