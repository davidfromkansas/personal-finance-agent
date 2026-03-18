import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine,
} from 'recharts'
import { useCashFlow } from '../hooks/usePlaidQueries'

/** Two bars per month: blue = inflows (up), orange = outflows (down). Colorblind-friendly. */
const BAR_POSITIVE_COLOR = '#1e40af'
const BAR_NEGATIVE_COLOR = '#ea580c'
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
    <div className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2.5 shadow-sm min-w-[160px]">
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
      <div className="flex items-center justify-between gap-4 border-t border-[#e5e7eb] mt-1.5 pt-1.5">
        <span className="text-[12px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Net</span>
        <span className="text-[12px] font-semibold" style={{ fontFamily: 'JetBrains Mono,monospace', color: net >= 0 ? BAR_POSITIVE_COLOR : BAR_NEGATIVE_COLOR }}>
          {formatCurrency(net)}
        </span>
      </div>
    </div>
  )
}

export function CashFlowChart({ embeddedHeight = 320 }) {
  const { data: rawData, isLoading: loading } = useCashFlow()
  const [showInfo, setShowInfo] = useState(false)

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
      className="relative rounded-[14px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.08)] flex flex-col overflow-hidden"
      style={embeddedHeight ? { height: embeddedHeight } : undefined}
    >
      {showInfo && (
        <div className="absolute inset-0 z-10 rounded-[14px] bg-white/97 px-6 py-5 overflow-y-auto" onClick={() => setShowInfo(false)}>
          <p className="text-[13px] font-semibold text-[#101828] mb-3" style={{ fontFamily: 'JetBrains Mono,monospace' }}>What's in this chart</p>
          <div className="mb-3">
            <p className="text-[11px] font-semibold text-[#4a5565] uppercase tracking-wide mb-1.5" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Included</p>
            {['Inflows: income, deposits, refunds, transfers in', 'Outflows: purchases, loan payments, rent, transfers out'].map(item => (
              <div key={item} className="flex items-start gap-2 mb-1">
                <span className="text-[#16a34a] text-[12px] font-bold shrink-0 mt-px">✓</span>
                <span className="text-[12px] text-[#374151]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{item}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[#4a5565] uppercase tracking-wide mb-1.5" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Excluded</p>
            {['Credit card payments (individual transactions are already counted as outflows)'].map(item => (
              <div key={item} className="flex items-start gap-2 mb-1">
                <span className="text-[#dc2626] text-[12px] font-bold shrink-0 mt-px">✕</span>
                <span className="text-[12px] text-[#374151]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{item}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Click anywhere to dismiss</p>
        </div>
      )}
      <div className="shrink-0 flex items-center justify-between rounded-t-[14px] bg-[#1d4ed8] px-5 py-3">
        <h2 className="text-[18px] font-semibold leading-5 tracking-[-0.31px] text-white" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
          Cash flow
        </h2>
        <div className="flex items-center gap-4">
          {latestMonth && (
            <span className="text-[13px] text-white/60" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              {latestMonth.label}
            </span>
          )}
          <span className="text-[18px] font-semibold text-white" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
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

      <p className="shrink-0 px-4 pt-2 text-[11px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        Monthly income vs spending. Net = money in minus money out.
      </p>

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
            <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 8 }} barCategoryGap="20%">
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
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="negativeFlow"
                name="Outflows"
                fill={BAR_NEGATIVE_COLOR}
                minPointSize={3}
                maxBarSize={40}
                radius={[0, 0, 2, 2]}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="net"
                name="Net"
                stroke={LINE_NET_COLOR}
                strokeWidth={3}
                dot={{ fill: LINE_NET_COLOR, r: 4, strokeWidth: 2, stroke: '#ffffff' }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
