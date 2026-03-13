import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine,
} from 'recharts'
import { apiFetch } from '../lib/api'

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

export const CashFlowChart = forwardRef(function CashFlowChart({ getToken, embeddedHeight = 320 }, ref) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchCashFlow = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiFetch('/api/plaid/cash-flow?months=24', { getToken })
      const months = result.months ?? []
      setData(months.reverse().map((m) => ({
        ...m,
        label: formatMonth(m.month),
        negativeFlow: -(m.outflows || 0),
      })))
    } catch (err) {
      console.error('Failed to fetch cash flow:', err)
      setData([])
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    fetchCashFlow()
  }, [fetchCashFlow])

  useImperativeHandle(ref, () => ({
    refresh() {
      fetchCashFlow()
    },
  }), [fetchCashFlow])

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
      className="rounded-[14px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.08)] flex flex-col overflow-hidden"
      style={embeddedHeight ? { height: embeddedHeight } : undefined}
    >
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
})
