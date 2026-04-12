import { useState, useMemo, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useTickerTransactions, useTickerHistory, useQuotes } from '../hooks/usePlaidQueries'

const MONO = { fontFamily: 'JetBrains Mono,monospace' }
const STOCK_RANGES = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'ALL']

function fmt(value) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

export function StockDetailPanel({ ticker, holdings, onClose }) {
  const open = !!ticker
  const security_name = (holdings ?? []).find(h => h.ticker === ticker)?.security_name ?? ticker
  const { data: txnData, isLoading: txnLoading } = useTickerTransactions(ticker)
  const allTxns = useMemo(() => {
    if (!txnData?.transactions) return []
    return txnData.transactions
  }, [txnData])
  const [showAllTxns, setShowAllTxns] = useState(false)
  const [chartRange, setChartRange] = useState('5D')
  useEffect(() => { setShowAllTxns(false); setChartRange('5D') }, [ticker])
  const visibleTxns = showAllTxns ? allTxns : allTxns.slice(0, 3)

  const tickerArr = useMemo(() => ticker ? [ticker] : [], [ticker])
  const { data: histData, isLoading: histLoading } = useTickerHistory(tickerArr, chartRange)
  const { data: quoteData } = useQuotes(tickerArr)

  const chartData = useMemo(() => {
    if (!histData?.series?.length) return []
    return histData.series[0].data
  }, [histData])

  const quote = quoteData?.quotes?.[0]
  const currentPrice = quote?.price ?? chartData[chartData.length - 1]?.price ?? null
  const startPrice = chartData[0]?.price
  const priceChange = currentPrice != null && startPrice != null ? currentPrice - startPrice : null
  const pctChange = priceChange != null && startPrice ? (priceChange / startPrice) * 100 : null
  const isPositive = priceChange >= 0

  const chartXFormat = useMemo(() => {
    if (chartRange === '1D') return (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
    if (chartRange === '5D') return (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })
    if (chartRange === '1M') return (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (['6M', 'YTD', '1Y'].includes(chartRange)) return (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }, [chartRange])

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={onClose} />}
      <div className={`fixed right-0 top-0 z-50 flex h-full w-[400px] flex-col border-l border-[#d9d9d9] bg-white shadow-xl transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex shrink-0 items-start justify-between border-b border-[#d9d9d9] px-5 py-4">
          <div className="min-w-0 pr-3">
            <p className="text-[16px] font-semibold text-[#101828] leading-tight" style={MONO}>{security_name}</p>
            {ticker !== security_name && (
              <p className="mt-0.5 text-[12px] text-[#6a7282]" style={MONO}>{ticker}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-[#999] hover:text-[#1e1e1e] transition-colors text-xl leading-none cursor-pointer mt-0.5">×</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Price + Change */}
          <div className="px-5 pt-4 pb-1">
            {currentPrice != null ? (
              <>
                <div className="flex items-baseline gap-2">
                  <p className="text-[24px] font-bold text-[#101828]" style={MONO}>{fmt(currentPrice)}</p>
                  <span className="text-[11px] text-[#9ca3af]" style={MONO}>{quote?.marketState === 'REGULAR' ? 'Live' : 'Previous close'}</span>
                </div>
                {priceChange != null && (
                  <p className="text-[13px] font-medium mt-0.5" style={{ ...MONO, color: isPositive ? '#16a34a' : '#dc2626' }}>
                    {isPositive ? '+' : ''}{fmt(priceChange)} ({isPositive ? '+' : ''}{pctChange.toFixed(2)}%) <span className="text-[#9ca3af] font-normal">{chartRange}</span>
                  </p>
                )}
              </>
            ) : (
              <div className="h-9 w-32 animate-pulse rounded bg-[#f3f4f6]" />
            )}
          </div>

          {/* Range buttons */}
          <div className="flex gap-1 px-5 py-2">
            {STOCK_RANGES.map(r => (
              <button
                key={r}
                onClick={() => setChartRange(r)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded cursor-pointer transition-colors ${chartRange === r ? 'bg-[#101828] text-white' : 'text-[#6a7282] hover:bg-[#f3f4f6]'}`}
                style={MONO}
              >
                {r === 'ALL' ? 'Max' : r}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div className="px-3 pb-2" style={{ height: 180 }}>
            {histLoading ? (
              <div className="h-full w-full animate-pulse rounded bg-[#f3f4f6]" />
            ) : chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[12px] text-[#9ca3af]" style={MONO}>No chart data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={isPositive ? '#16a34a' : '#dc2626'} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={isPositive ? '#16a34a' : '#dc2626'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af', fontFamily: 'JetBrains Mono' }} tickFormatter={chartXFormat} axisLine={false} tickLine={false} minTickGap={30} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#9ca3af', fontFamily: 'JetBrains Mono' }} tickFormatter={(v) => `$${v.toFixed(0)}`} axisLine={false} tickLine={false} width={45} />
                  <Tooltip
                    contentStyle={{ fontFamily: 'JetBrains Mono', fontSize: 12, border: '1px solid #d9d9d9', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                    formatter={(v) => [fmt(v), 'Price']}
                    labelFormatter={chartXFormat}
                  />
                  <Area type="monotone" dataKey="price" stroke={isPositive ? '#16a34a' : '#dc2626'} strokeWidth={1.5} fill="url(#stockGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Ask Abacus */}
          <div className="px-5 py-3">
            <button
              type="button"
              onClick={() => {
                onClose()
                window.dispatchEvent(new CustomEvent('open-assistant', { detail: { prompt: `Tell me about ${ticker} — latest news, analyst ratings, and key fundamentals` } }))
              }}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#111113] px-4 py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-80 cursor-pointer"
              style={MONO}
            >
              <img src="/ai-icon.svg" alt="Ask Abacus" className="h-9 w-9" />
              Ask Abacus about {ticker}
            </button>
          </div>

          {/* Key Stats */}
          {quote && (
            <div className="mx-5 mb-3 mt-1 rounded-[10px] border border-[#d9d9d9] p-4">
              {[
                { label: 'Market Cap', value: quote.marketCap != null ? (quote.marketCap >= 1e12 ? `$${(quote.marketCap / 1e12).toFixed(2)}T` : quote.marketCap >= 1e9 ? `$${(quote.marketCap / 1e9).toFixed(2)}B` : quote.marketCap >= 1e6 ? `$${(quote.marketCap / 1e6).toFixed(2)}M` : `$${quote.marketCap.toLocaleString()}`) : '—' },
                { label: 'P/E Ratio', value: quote.peRatio != null ? quote.peRatio.toFixed(2) : '—' },
                { label: 'EPS', value: quote.eps != null ? `$${quote.eps.toFixed(2)}` : '—' },
                { label: 'Earnings', value: quote.earningsDate ? new Date(quote.earningsDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
              ].map(s => (
                <div key={s.label} className="flex justify-between border-b border-[#f3f4f6] py-1.5">
                  <span className="text-[11px] text-[#9ca3af]" style={MONO}>{s.label}</span>
                  <span className="text-[11px] font-medium text-[#101828]" style={MONO}>{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* 52W Range */}
          {quote?.week52Low != null && quote?.week52High != null && quote.week52High !== quote.week52Low && (() => {
            const pct = Math.min(100, Math.max(0, ((currentPrice - quote.week52Low) / (quote.week52High - quote.week52Low)) * 100))
            return (
              <div className="mx-5 mb-4 mt-1 rounded-[10px] border border-[#d9d9d9] p-4">
                <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[1px] text-[#9ca3af]" style={MONO}>52W Range</p>
                <div className="relative h-1 rounded-full bg-[#e5e7eb]">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-[#d1d5db]" style={{ width: `${pct}%` }} />
                  <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#101828] shadow-sm" style={{ left: `${pct}%` }} />
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-[9px] text-[#9ca3af]" style={MONO}>${quote.week52Low.toFixed(2)}</span>
                  <span className="text-[9px] text-[#9ca3af]" style={MONO}>${quote.week52High.toFixed(2)}</span>
                </div>
              </div>
            )
          })()}

          <div className="border-b border-[#d9d9d9] px-5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[1px] text-[#6a7282]" style={MONO}>Trade History</p>
          </div>
          {txnLoading ? (
            <div className="px-5 py-4">
              <div className="flex flex-col gap-3">
                {[0, 1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded bg-[#f3f4f6]" />)}
              </div>
            </div>
          ) : allTxns.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-[#6a7282]" style={MONO}>No trade records found</p>
          ) : (
            <div className="flex flex-col">
              {visibleTxns.map((txn, i) => {
                const d = new Date(txn.date + 'T00:00:00')
                const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                const isBuy = txn.type === 'buy'
                const isSell = txn.type === 'sell'
                const typeLabel = txn.type ? txn.type.charAt(0).toUpperCase() + txn.type.slice(1) : ''
                const typeColor = isBuy ? '#15803d' : isSell ? '#b91c1c' : '#6a7282'
                return (
                  <div key={i} className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[#101828]" style={MONO}>{dateLabel}</p>
                      <p className="text-[11px] text-[#6a7282]" style={MONO}>{txn.account_name ?? 'Unknown account'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-semibold" style={{ ...MONO, color: typeColor }}>{typeLabel} · {fmt(txn.price)}</p>
                      <p className="text-[11px] text-[#6a7282]" style={MONO}>{txn.quantity} shares</p>
                    </div>
                  </div>
                )
              })}
              {allTxns.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllTxns(!showAllTxns)}
                  className="px-5 py-3 text-[12px] font-medium text-[#155dfc] hover:text-[#0f4ad4] transition-colors cursor-pointer text-left"
                  style={MONO}
                >
                  {showAllTxns ? 'Show less' : `See all ${allTxns.length} trades`}
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  )
}
