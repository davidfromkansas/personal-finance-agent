import { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceArea,
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import { useNetWorth, useAccounts } from '../hooks/usePlaidQueries'

const MONO = { fontFamily: 'JetBrains Mono,monospace' }

const RANGES = [
  { key: '1W', label: '1W' },
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: 'YTD', label: 'YTD' },
  { key: '1Y', label: '1Y' },
  { key: 'ALL', label: 'ALL' },
]

const RANGE_LABELS = { '1W': 'past week', '1M': 'past month', '3M': 'past 3 months', YTD: 'year to date', '1Y': 'past year', ALL: 'all time' }

const LINE_COLOR = '#4f46e5'

function formatCurrency(value) {
  if (value == null) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value)
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

function dateToTs(dateStr) {
  return new Date(dateStr + 'T00:00:00').getTime()
}

function formatDateLabelFromTs(ts, range) {
  const d = new Date(ts)
  if (range === '1W') return d.toLocaleDateString('en-US', { weekday: 'short' })
  if (range === '1M' || range === '3M' || range === 'YTD') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const dateLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
  const ac = d.accountChange
  return (
    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 shadow-md max-w-[260px]">
      <p className="text-[11px] font-medium text-[#6a7282]" style={MONO}>{dateLabel}</p>
      <p className="text-[14px] font-semibold text-[#101828]" style={MONO}>{formatCurrency(d.net_worth)}</p>
      <div className="mt-1 flex gap-3 text-[11px]" style={MONO}>
        <span className="text-[#155dfc]">Assets {formatCurrency(d.assets)}</span>
        <span className="text-[#dc2626]">Debts {formatCurrency(d.debts)}</span>
      </div>
      {ac && (
        <div className="mt-1.5 border-t border-[#e5e7eb] pt-1.5 text-[10px]" style={MONO}>
          {ac.added.map(a => (
            <p key={a.id} className="text-[#8b5cf6]">+ {a.name} ({formatCurrency(a.value)})</p>
          ))}
          {ac.removed.map(a => (
            <p key={a.id} className="text-[#ef4444]">- {a.name}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function AccountChangeDot({ cx, cy, payload }) {
  if (!payload?.accountChange || cx == null || cy == null) return null
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill="#8b5cf6" stroke="#fff" strokeWidth={2} />
      <line x1={cx} y1={cy + 5} x2={cx} y2={cy + 18} stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="2 2" />
    </g>
  )
}

export function NetWorthChart({ embedded }) {
  const navigate = useNavigate()
  const [activeRange, setActiveRange] = useState('1M')

  const { data: rawData, isLoading: loading } = useNetWorth(activeRange)
  const { data: accountsData } = useAccounts()
  const accounts = accountsData?.accounts ?? []

  const { chartData, noDataStart, noDataEnd } = useMemo(() => {
    const history = rawData?.history ?? []
    if (!history.length) return { chartData: [], noDataStart: null, noDataEnd: null }

    let prevAccountIds = null
    const accMap = Object.fromEntries(accounts.map(a => [a.account_id, a.name]))

    const mapped = history.map((row, idx) => {
      const byAcc = row.by_account ?? {}
      let assets = 0, debts = 0
      const currentIds = new Set()
      for (const [id, val] of Object.entries(byAcc)) {
        if (val == null) continue
        currentIds.add(id)
        if (val >= 0) assets += val
        else debts += Math.abs(val)
      }

      let accountChange = null
      if (prevAccountIds) {
        const added = [...currentIds].filter(id => !prevAccountIds.has(id))
        const removed = [...prevAccountIds].filter(id => !currentIds.has(id))
        if (added.length || removed.length) {
          const addedValue = added.reduce((s, id) => s + (byAcc[id] ?? 0), 0)
          const prevRow = history[idx - 1]
          const removedValue = removed.reduce((s, id) => s + (prevRow?.by_account?.[id] ?? 0), 0)
          accountChange = {
            added: added.map(id => ({ id, name: accMap[id] || id, value: byAcc[id] ?? 0 })),
            removed: removed.map(id => ({ id, name: accMap[id] || id, value: removedValue })),
            impact: addedValue - removedValue,
          }
        }
      }
      prevAccountIds = currentIds

      return {
        date: row.date,
        ts: dateToTs(row.date),
        net_worth: Math.round((assets - debts) * 100) / 100,
        assets: Math.round(assets * 100) / 100,
        debts: Math.round(debts * 100) / 100,
        by_account: byAcc,
        accountChange,
      }
    })

    // Compute expected start date
    const today = new Date()
    const pad = n => String(n).padStart(2, '0')
    const toStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    let expectedStart
    if (activeRange === '1W') { const d = new Date(today); d.setDate(d.getDate() - 7); expectedStart = toStr(d) }
    else if (activeRange === '1M') { const d = new Date(today); d.setMonth(d.getMonth() - 1); expectedStart = toStr(d) }
    else if (activeRange === '3M') { const d = new Date(today); d.setMonth(d.getMonth() - 3); expectedStart = toStr(d) }
    else if (activeRange === 'YTD') { expectedStart = `${today.getFullYear()}-01-01` }
    else if (activeRange === '1Y') { const d = new Date(today); d.setFullYear(d.getFullYear() - 1); expectedStart = toStr(d) }
    else { expectedStart = null }

    let noDataStart = null, noDataEnd = null
    if (expectedStart && mapped.length > 0 && mapped[0].date > expectedStart) {
      noDataStart = dateToTs(expectedStart)
      noDataEnd = dateToTs(mapped[0].date)
      mapped.unshift({
        date: expectedStart,
        ts: dateToTs(expectedStart),
        net_worth: null,
        assets: null,
        debts: null,
        by_account: {},
        accountChange: null,
      })
    }

    const maxPoints = activeRange === '1W' ? 100 : activeRange === '1M' ? 60 : 90
    if (mapped.length <= maxPoints) return { chartData: mapped, noDataStart, noDataEnd }
    const step = Math.ceil(mapped.length / maxPoints)
    const sampled = mapped.filter((_, i) => i % step === 0)
    if (sampled[sampled.length - 1]?.date !== mapped[mapped.length - 1]?.date) sampled.push(mapped[mapped.length - 1])
    return { chartData: sampled, noDataStart, noDataEnd }
  }, [rawData, activeRange, accounts])

  const currentNW = chartData[chartData.length - 1]?.net_worth ?? null

  const yDomain = useMemo(() => {
    const vals = chartData.map(d => d.net_worth).filter(v => v != null)
    if (!vals.length) return [0, 0]
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = (max - min) * 0.05 || max * 0.02
    return [Math.floor(min - pad), Math.ceil(max + pad)]
  }, [chartData])

  const change = useMemo(() => {
    if (!chartData.length || currentNW == null) return null
    const startIdx = noDataEnd ? 1 : 0
    if (startIdx >= chartData.length) return null
    const startVal = chartData[startIdx].net_worth
    if (startVal == null) return null
    const diff = currentNW - startVal
    const pct = startVal !== 0 ? (diff / Math.abs(startVal)) * 100 : 0
    const accountImpact = chartData.reduce((s, d) => s + (d.accountChange?.impact ?? 0), 0)
    const organicDiff = diff - accountImpact
    return { diff, pct, accountImpact, organicDiff }
  }, [chartData, currentNW, noDataEnd])

  const isPos = change && change.diff >= 0

  return (
    <div className={`relative bg-white ${embedded ? 'rounded-t-[14px]' : 'rounded-[14px] border border-[#9ca3af]'}`}>
      {/* Dark header — title + Ask AI */}
      <div className="flex items-center justify-between rounded-t-[14px] bg-[#2B2B2B] pl-5 pr-3 py-3">
        <h2 className="text-[18px] font-semibold leading-5 tracking-[-0.31px] text-white cursor-pointer hover:text-white/80 transition-colors" style={MONO} onClick={() => navigate('/app/accounts')}>
          Net Worth <span className="ml-0.5 text-[22px] font-bold text-white/60">›</span>
        </h2>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('open-assistant', { detail: { prompt: 'Analyze my net worth trends and give me insights' } }))}
          className="flex items-center gap-1.5 rounded-[7px] bg-white/15 px-2.5 py-1.5 hover:bg-white/25 transition-colors cursor-pointer"
          title="Ask AI about net worth"
        >
          <img src="/ai-icon.svg" alt="" className="h-5 w-5" />
          <span className="text-[13px] font-medium text-white/90" style={MONO}>Ask AI</span>
        </button>
      </div>

      {/* Value + change */}
      <div className="flex items-start justify-between px-5 pt-4 pb-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[1px] text-[#9ca3af] mb-0.5" style={MONO}>Total Net Worth</p>
          <div className="flex items-baseline gap-3">
            <span className="text-[28px] font-bold tracking-tight text-[#101828]" style={MONO}>
              {loading ? '—' : formatCurrency(currentNW)}
            </span>
            {!loading && change && (
              <span
                className={`whitespace-nowrap text-[14px] font-semibold ${isPos ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}
                style={MONO}
              >
                {isPos ? '+' : ''}{formatCurrency(change.diff)} ({isPos ? '+' : ''}{change.pct.toFixed(1)}%)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="px-4 pb-3 pt-2" style={{ height: 200 }}>
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-[13px] text-[#6a7282]" style={MONO}>Loading...</span>
          </div>
        ) : !chartData.length ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-[13px] text-[#6a7282]" style={MONO}>
              Connect accounts to see your net worth
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 11, fill: '#6a7282', ...MONO }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => formatDateLabelFromTs(v, activeRange)}
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6a7282', ...MONO }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatCompact}
                domain={yDomain}
                allowDataOverflow
              />
              <Tooltip content={<CustomTooltip />} />
              {noDataStart != null && noDataEnd != null && (
                <ReferenceArea x1={noDataStart} x2={noDataEnd} fill="#f3f4f6" fillOpacity={0.8} strokeOpacity={0} />
              )}
              <Area
                type="monotone"
                dataKey="net_worth"
                stroke={LINE_COLOR}
                strokeWidth={2}
                fill="url(#nwGradient)"
                dot={<AccountChangeDot />}
                activeDot={{ r: 4, fill: LINE_COLOR, stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Range toggles — portfolio style */}
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
            style={MONO}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  )
}
