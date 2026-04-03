import { useEffect, useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine,
} from 'recharts'
import { useCashFlow, useCashFlowTransactions } from '../hooks/usePlaidQueries'
import { TransactionDetailPanel, bestLogoUrl } from './TransactionDetailPanel'

/** Two bars per month: blue = inflows (up), red = outflows (down). */
const BAR_POSITIVE_COLOR = '#1e40af'
const BAR_NEGATIVE_COLOR = '#dc2626'
const LINE_NET_COLOR = '#111827'

function formatCurrency(value) {
  if (value == null) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value)
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatMonth(ym) {
  const [y, m] = String(ym).split('-')
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`
}

function CashFlowTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const inflow = payload.find((p) => p.dataKey === 'inflows')?.value ?? 0
  const negativeFlow = payload.find((p) => p.dataKey === 'negativeFlow')?.value ?? 0
  const outflow = negativeFlow <= 0 ? Math.abs(negativeFlow) : 0
  const net = inflow - outflow
  return (
    <div className="rounded-lg border border-[#9ca3af] bg-white px-3 py-2.5 shadow-sm min-w-[160px]">
      <p className="text-[12px] font-medium text-[#6a7282] mb-1.5" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        {label}
      </p>
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

function DashedBar({ x, y, width, height, fill }) {
  if (!height || Math.abs(height) < 1) return null
  const actualY = height < 0 ? y + height : y
  const actualHeight = Math.abs(height)
  return (
    <rect
      x={x}
      y={actualY}
      width={width}
      height={actualHeight}
      fill={`${fill}22`}
      stroke={fill}
      strokeWidth={1.5}
      strokeDasharray="4 2"
      rx={2}
    />
  )
}

const MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const SORT_OPTIONS = [
  { key: 'recent', label: 'Most recent' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'expensive', label: 'Most expensive' },
  { key: 'cheapest', label: 'Least expensive' },
]

function applySortAndSearch(txns, q, sortKey) {
  const filtered = q ? txns.filter(t => (t.name ?? '').toLowerCase().includes(q)) : txns
  const copy = [...filtered]
  if (sortKey === 'oldest') return copy.reverse()
  if (sortKey === 'expensive') return copy.sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
  if (sortKey === 'cheapest') return copy.sort((a, b) => Math.abs(Number(a.amount)) - Math.abs(Number(b.amount)))
  return copy // 'recent' — API order
}

function formatMonthFull(ym) {
  const [y, m] = String(ym).split('-')
  return `${MONTH_NAMES_FULL[parseInt(m, 10) - 1]} ${y}`
}

function DrillDownTransactionRow({ transaction, onClick }) {
  const amt = Number(transaction.amount)
  const isCredit = amt < 0
  const displayAmt = isCredit ? `+$${Math.abs(amt).toFixed(2)}` : `-$${Math.abs(amt).toFixed(2)}`
  const amtColor = isCredit ? 'text-[#155dfc]' : 'text-[#dc2626]'
  const logo = bestLogoUrl(transaction)
  const initial = (transaction.name ?? '?')[0].toUpperCase()

  return (
    <div
      className="flex h-[36px] shrink-0 items-center justify-between gap-2 rounded-[8px] px-2 cursor-pointer hover:bg-[#f0f0f0] transition-colors"
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
        <p className="shrink truncate font-medium text-[13px] leading-5 text-[#101828]"
          style={{ fontFamily: 'JetBrains Mono,monospace' }}>
          {transaction.name}
        </p>
      </div>
      <span className={`shrink-0 text-right font-bold text-[13px] leading-5 ${amtColor}`}
        style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        {displayAmt}
      </span>
    </div>
  )
}

function CashFlowDrillDownTray({ month, onClose }) {
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('recent')
  const [sortOpen, setSortOpen] = useState(false)
  const { data, isLoading } = useCashFlowTransactions(month)
  useEffect(() => { setSearch(''); setSortKey('recent') }, [month])
  const open = !!month

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
              {month ? formatMonthFull(month) : ''}
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
                      <DrillDownTransactionRow key={t.id} transaction={t} onClick={setSelectedTransaction} />
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
                      <DrillDownTransactionRow key={t.id} transaction={t} onClick={setSelectedTransaction} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {/* Transaction detail panel stacks above tray using elevated z-indices */}
      <TransactionDetailPanel
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        zBackdrop="z-[60]"
        zPanel="z-[70]"
      />
    </>
  )
}

export function CashFlowChart({ embeddedHeight = 320, hideHeader = false }) {
  const { data: rawData, isLoading: loading } = useCashFlow()
  const [showInfo, setShowInfo] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(null)

  const data = useMemo(() => {
    const months = rawData?.months ?? []
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1 // 1-12

    const monthMap = {}
    for (const m of months) monthMap[m.month] = m

    const result = []
    for (let mo = 1; mo <= currentMonth; mo++) {
      const key = `${currentYear}-${String(mo).padStart(2, '0')}`
      const m = monthMap[key] ?? { month: key, inflows: 0, outflows: 0, net: 0 }
      result.push({ ...m, label: formatMonth(m.month), negativeFlow: -(m.outflows || 0) })
    }
    return result
  }, [rawData])

  const latestMonth = data?.length ? data[data.length - 1] : null
  const netLatest = latestMonth ? latestMonth.net : 0

  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const yDomain = useMemo(() => {
    if (!data?.length) return { domain: [-10000, 10000], ticks: [-10000, -5000, 0, 5000, 10000] }
    let dataMin = 0
    let dataMax = 0
    for (const d of data) {
      const inflow = d.inflows ?? 0
      const outflow = d.outflows ?? 0
      const neg = -(outflow ?? 0)
      const net = d.net ?? inflow - outflow
      dataMin = Math.min(dataMin, neg, net)
      dataMax = Math.max(dataMax, inflow, net)
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

  return (
    <div
      className={`relative ${hideHeader ? '' : 'rounded-[14px] border border-[#9ca3af]'} bg-white flex flex-col overflow-hidden`}
      style={embeddedHeight ? { height: embeddedHeight } : undefined}
    >
      {showInfo && (
        <div className="absolute inset-0 z-10 rounded-[14px] bg-white/97 px-6 py-5 overflow-y-auto" onClick={() => setShowInfo(false)}>
          <p className="text-[13px] font-semibold text-[#101828] mb-3" style={{ fontFamily: 'JetBrains Mono,monospace' }}>What's in this chart</p>
          <div className="mb-3">
            <p className="text-[11px] font-semibold text-[#4a5565] uppercase tracking-wide mb-1.5" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Included</p>
            {['Inflows: income, deposits, refunds', 'Outflows: purchases, loan payments, rent'].map(item => (
              <div key={item} className="flex items-start gap-2 mb-1">
                <span className="text-[#155dfc] text-[12px] font-bold shrink-0 mt-px">✓</span>
                <span className="text-[12px] text-[#374151]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{item}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[#4a5565] uppercase tracking-wide mb-1.5" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Excluded</p>
            {['Transfers between your accounts', 'Credit card payments (individual transactions are already counted as outflows)'].map(item => (
              <div key={item} className="flex items-start gap-2 mb-1">
                <span className="text-[#dc2626] text-[12px] font-bold shrink-0 mt-px">✕</span>
                <span className="text-[12px] text-[#374151]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{item}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Click anywhere to dismiss</p>
        </div>
      )}
      {!hideHeader && (
        <div className="shrink-0 flex items-center justify-between rounded-t-[14px] bg-[#2B2B2B] px-5 py-3">
          <h2 className="text-[18px] font-semibold leading-5 tracking-[-0.31px] text-white" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            Cash flow
          </h2>
          <div className="flex items-center gap-4">
            {latestMonth && (
              <span className="text-[13px] text-white/60" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                {latestMonth.label}
              </span>
            )}
            <span className="text-[18px] font-semibold leading-5 text-white" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              {loading ? '—' : formatCurrency(netLatest)}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowInfo(v => !v) }}
              className="flex items-center justify-center w-5 h-5 rounded-full border border-white/40 text-white/70 hover:text-white hover:border-white/70 transition-colors text-[11px] font-bold leading-none"
              title="What's included in this chart"
            >i</button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 px-4 pb-2 pt-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading…</span>
          </div>
        ) : !data?.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              No cash flow data yet.
            </span>
            <span className="text-[12px] text-[#9ca3af] max-w-[260px]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              Link accounts above, or if you already have connections, refresh one to sync transaction history—cash flow uses the same data as Recent Transactions.
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 16, bottom: 24, left: 8 }}
              barCategoryGap="20%"
              style={{ cursor: 'pointer' }}
              onClick={(chartData) => {
                if (!chartData?.activeLabel) return
                const entry = data.find(d => d.label === chartData.activeLabel)
                if (entry?.month) setSelectedMonth(entry.month)
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
              <Tooltip content={<CashFlowTooltip />} cursor={{ fill: 'rgba(243,244,246,0.8)', stroke: '#e5e7eb' }} />
              <Legend
                wrapperStyle={{ paddingTop: 8 }}
                formatter={(value) => <span className="text-[11px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{value}</span>}
              />
              <Bar
                dataKey="inflows"
                name="Inflows"
                fill={BAR_POSITIVE_COLOR}
                minPointSize={3}
                maxBarSize={40}
                isAnimationActive={false}
                cursor="pointer"
                onClick={(barData) => setSelectedMonth(barData.month)}
                shape={(props) => {
                  const { x, y, width, height, month } = props
                  if (!height || Math.abs(height) < 1) return null
                  if (month === currentMonthKey) return <DashedBar x={x} y={y} width={width} height={height} fill={BAR_POSITIVE_COLOR} />
                  return <rect x={x} y={y} width={width} height={Math.abs(height)} fill={BAR_POSITIVE_COLOR} rx={2} />
                }}
              />
              <Bar
                dataKey="negativeFlow"
                name="Outflows"
                fill={BAR_NEGATIVE_COLOR}
                minPointSize={3}
                maxBarSize={40}
                isAnimationActive={false}
                cursor="pointer"
                onClick={(barData) => setSelectedMonth(barData.month)}
                shape={(props) => {
                  const { x, y, width, height, month } = props
                  if (!height || Math.abs(height) < 1) return null
                  if (month === currentMonthKey) return <DashedBar x={x} y={y} width={width} height={height} fill={BAR_NEGATIVE_COLOR} />
                  const actualY = height < 0 ? y + height : y
                  return <rect x={x} y={actualY} width={width} height={Math.abs(height)} fill={BAR_NEGATIVE_COLOR} rx={2} />
                }}
              />
              <Line
                type="monotone"
                dataKey="net"
                name="Net"
                stroke={LINE_NET_COLOR}
                strokeWidth={3}
                dot={{ fill: LINE_NET_COLOR, r: 4, strokeWidth: 2, stroke: '#ffffff' }}
                connectNulls
                cursor="pointer"
                onClick={(lineData) => setSelectedMonth(lineData.month)}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <CashFlowDrillDownTray month={selectedMonth} onClose={() => setSelectedMonth(null)} />
    </div>
  )
}
