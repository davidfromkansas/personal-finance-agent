import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceArea,
} from 'recharts'
import { AppHeader } from '../components/AppHeader'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import { useAccounts, useConnections, useNetWorth, useInvestments, invalidateAll, invalidateTransactionData } from '../hooks/usePlaidQueries'
import { usePlaidLinkContext } from '../context/PlaidLinkContext'
import { TransactionDetailPanel, bestLogoUrl } from '../components/TransactionDetailPanel.jsx'
import { AccountDetailPanel } from './InvestmentsPage'
import queryClient from '../lib/queryClient'

function formatCurrency(value) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

const MONO = { fontFamily: 'JetBrains Mono,monospace' }

function formatTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

const RANGES = ['1W', '1M', '3M', 'YTD', '1Y', 'ALL']

const RANGE_LABELS = {
  '1W': 'this week',
  '1M': 'this month',
  '3M': 'past 3 months',
  'YTD': 'year to date',
  '1Y': 'past year',
  'ALL': 'all time',
}

const TYPE_COLORS = {
  depository: '#155dfc',
  credit: '#dc2626',
  investment: '#16a34a',
  loan: '#d97706',
  other: '#6a7282',
}

function nwFormatCurrency(value) {
  if (value == null) return '—'
  const abs = Math.abs(value)
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(abs)
  return value < 0 ? `-${formatted}` : formatted
}

function nwFormatCompact(value) {
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

function nwFormatDateLabel(ts, range) {
  const d = new Date(ts)
  if (range === '1W') return d.toLocaleDateString('en-US', { weekday: 'short' })
  if (range === '1M' || range === '3M' || range === 'YTD') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function NWTooltip({ active, payload }) {
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
      <p className="text-[14px] font-semibold text-[#101828]" style={MONO}>{nwFormatCurrency(d.net_worth)}</p>
      <div className="mt-1 flex gap-3 text-[11px]" style={MONO}>
        <span className="text-[#155dfc]">Assets {nwFormatCurrency(d.assets)}</span>
        <span className="text-[#dc2626]">Debts {nwFormatCurrency(d.debts)}</span>
      </div>
      {ac && (
        <div className="mt-1.5 border-t border-[#e5e7eb] pt-1.5 text-[10px]" style={MONO}>
          {ac.added.map(a => (
            <p key={a.id} className="text-[#8b5cf6]">+ {a.name} ({nwFormatCurrency(a.value)})</p>
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

function NetWorthDrillPanel({ dataPoint, accounts, onClose }) {
  const open = !!dataPoint
  if (!dataPoint) return (
    <div className={`fixed right-0 top-0 z-50 flex h-full w-1/3 flex-col border-l border-[#d9d9d9] bg-white shadow-xl transition-transform duration-300 ease-in-out translate-x-full`} />
  )

  const dateLabel = new Date(dataPoint.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })

  const accountMap = {}
  for (const acc of accounts) {
    accountMap[acc.account_id] = acc
  }

  const byAccount = dataPoint.by_account ?? {}
  const items = Object.entries(byAccount)
    .map(([id, value]) => ({ id, value, name: accountMap[id]?.name ?? id, type: accountMap[id]?.type ?? 'other' }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

  const assetItems = items.filter(i => i.value >= 0)
  const debtItems = items.filter(i => i.value < 0)

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={onClose} />}
      <div className={`fixed right-0 top-0 z-50 flex h-full w-1/3 flex-col border-l border-[#d9d9d9] bg-white shadow-xl transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-[#d9d9d9] px-5 py-4">
          <div>
            <span className="text-[16px] font-normal text-[#1e1e1e]" style={MONO}>{dateLabel}</span>
            <p className="text-[13px] text-[#6a7282] mt-0.5" style={MONO}>
              Net worth: {nwFormatCurrency(dataPoint.net_worth)}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="text-[#999] hover:text-[#1e1e1e] transition-colors text-xl leading-none cursor-pointer">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {assetItems.length > 0 && (
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-[#f3f4f6]">
                <span className="text-[13px] font-semibold text-[#101828]" style={MONO}>Assets</span>
                <span className="text-[13px] font-semibold text-[#101828]" style={MONO}>{nwFormatCurrency(dataPoint.assets)}</span>
              </div>
              <div className="mt-2 space-y-1">
                {assetItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: TYPE_COLORS[item.type] ?? TYPE_COLORS.other }} />
                      <span className="text-[13px] text-[#101828] truncate" style={MONO}>{item.name}</span>
                      <span className="text-[11px] text-[#9ca3af]" style={MONO}>{item.type}</span>
                    </div>
                    <span className="shrink-0 text-[13px] font-medium text-[#101828]" style={MONO}>{nwFormatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {debtItems.length > 0 && (
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-[#f3f4f6]">
                <span className="text-[13px] font-semibold text-[#101828]" style={MONO}>Liabilities</span>
                <span className="text-[13px] font-semibold text-[#dc2626]" style={MONO}>{nwFormatCurrency(dataPoint.debts)}</span>
              </div>
              <div className="mt-2 space-y-1">
                {debtItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: TYPE_COLORS[item.type] ?? TYPE_COLORS.other }} />
                      <span className="text-[13px] text-[#101828] truncate" style={MONO}>{item.name}</span>
                      <span className="text-[11px] text-[#9ca3af]" style={MONO}>{item.type}</span>
                    </div>
                    <span className="shrink-0 text-[13px] font-medium text-[#dc2626]" style={MONO}>{nwFormatCurrency(Math.abs(item.value))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function NetWorthSection() {
  const [range, setRange] = useState('1M')
  const { data: rawData, isLoading } = useNetWorth(range)
  const [selectedIds, setSelectedIds] = useState(null) // null = all selected
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [drillPoint, setDrillPoint] = useState(null)

  const accounts = rawData?.accounts ?? []
  const effectiveSelected = selectedIds ?? new Set(accounts.map(a => a.account_id))
  const allSelected = accounts.length > 0 && accounts.every(a => effectiveSelected.has(a.account_id))

  function toggleAccount(id) {
    setSelectedIds(prev => {
      const base = prev ?? new Set(accounts.map(a => a.account_id))
      const next = new Set(base)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const { chartData, noDataStart, noDataEnd } = useMemo(() => {
    if (!rawData?.history?.length || !accounts.length) return { chartData: [], noDataStart: null, noDataEnd: null }
    let prevAccountIds = null
    const history = rawData.history.map(row => {
      let assets = 0, debts = 0
      const currentIds = new Set()
      for (const acc of accounts) {
        if (!effectiveSelected.has(acc.account_id)) continue
        const c = row.by_account?.[acc.account_id]
        if (c == null) continue
        currentIds.add(acc.account_id)
        if (c >= 0) assets += c
        else debts += Math.abs(c)
      }

      // Detect account set changes
      let accountChange = null
      if (prevAccountIds) {
        const added = [...currentIds].filter(id => !prevAccountIds.has(id))
        const removed = [...prevAccountIds].filter(id => !currentIds.has(id))
        if (added.length || removed.length) {
          const addedValue = added.reduce((s, id) => s + (row.by_account?.[id] ?? 0), 0)
          const removedValue = removed.reduce((s, id) => {
            // Use the previous row's value for removed accounts
            const prevRow = rawData.history[rawData.history.indexOf(row) - 1]
            return s + (prevRow?.by_account?.[id] ?? 0)
          }, 0)
          const accMap = Object.fromEntries(accounts.map(a => [a.account_id, a.name]))
          accountChange = {
            added: added.map(id => ({ id, name: accMap[id] || id, value: row.by_account?.[id] ?? 0 })),
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
        by_account: row.by_account,
        accountChange,
      }
    })

    // Compute expected start date for the selected range
    const today = new Date()
    const pad = n => String(n).padStart(2, '0')
    const toStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    let expectedStart
    if (range === '1W') { const d = new Date(today); d.setDate(d.getDate() - 7); expectedStart = toStr(d) }
    else if (range === '1M') { const d = new Date(today); d.setMonth(d.getMonth() - 1); expectedStart = toStr(d) }
    else if (range === '3M') { const d = new Date(today); d.setMonth(d.getMonth() - 3); expectedStart = toStr(d) }
    else if (range === 'YTD') { expectedStart = `${today.getFullYear()}-01-01` }
    else if (range === '1Y') { const d = new Date(today); d.setFullYear(d.getFullYear() - 1); expectedStart = toStr(d) }
    else { expectedStart = null }

    // If data starts after the expected range start, track the no-data region
    let noDataStart = null, noDataEnd = null
    if (expectedStart && history.length > 0 && history[0].date > expectedStart) {
      noDataStart = dateToTs(expectedStart)
      noDataEnd = dateToTs(history[0].date)
      // Prepend a null point so the x-axis spans the full range but no line draws in the gap
      history.unshift({
        date: expectedStart,
        ts: dateToTs(expectedStart),
        net_worth: null,
        assets: null,
        debts: null,
        by_account: {},
      })
    }

    const maxPoints = range === '1W' ? 100 : range === '1M' ? 60 : 90
    if (history.length <= maxPoints) return { chartData: history, noDataStart, noDataEnd }
    const step = Math.ceil(history.length / maxPoints)
    const sampled = history.filter((_, i) => i % step === 0)
    if (sampled[sampled.length - 1]?.date !== history[history.length - 1]?.date) sampled.push(history[history.length - 1])
    return { chartData: sampled, noDataStart, noDataEnd }
  }, [rawData, effectiveSelected, accounts, range])

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
    // If there's a no-data region, the first real data point is the second entry
    const startIdx = noDataEnd ? 1 : 0
    if (startIdx >= chartData.length) return null
    const startVal = chartData[startIdx].net_worth
    if (startVal == null) return null
    const diff = currentNW - startVal
    const pct = startVal !== 0 ? (diff / Math.abs(startVal)) * 100 : 0
    // Sum up account change impacts across the range
    const accountImpact = chartData.reduce((s, d) => s + (d.accountChange?.impact ?? 0), 0)
    const organicDiff = diff - accountImpact
    return { diff, pct, accountImpact, organicDiff }
  }, [chartData, currentNW, noDataEnd])
  const isPos = change && change.diff >= 0

  return (
    <div className="mb-6 overflow-hidden rounded-[14px] border border-[#9ca3af] bg-white">
      {/* Header — all white, matches the accounts list card */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e7eb]">
        <h2 className="text-[16px] font-semibold tracking-[-0.3px] text-[#101828]" style={MONO}>Net Worth</h2>
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('open-assistant', { detail: { prompt: 'Analyze my net worth trends and give me insights' } }))
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-[10px] bg-[#3d3d42] px-3 py-1.5 cursor-pointer hover:opacity-80 transition-opacity"
          title="Ask AI about net worth"
        >
          <img src="/ai-icon.svg" alt="" className="h-5 w-5" />
          <span className="text-[12px] font-semibold text-white" style={MONO}>Ask AI</span>
        </button>
      </div>
      <div className="flex items-start justify-between px-5 pt-3 pb-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[30px] font-bold tracking-[-0.5px] text-[#101828]" style={MONO}>
              {isLoading ? '—' : nwFormatCurrency(currentNW)}
            </span>
            {!isLoading && change && (
              <>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                    isPos ? 'bg-[#f0fdf4] text-[#16a34a]' : 'bg-[#fef2f2] text-[#dc2626]'
                  }`}
                  style={MONO}
                >
                  {isPos ? '+' : ''}{change.pct.toFixed(1)}%
                </span>
                <span className="text-[12px] text-[#9ca3af]" style={MONO}>
                  {isPos ? '+' : ''}{nwFormatCurrency(change.diff)} {RANGE_LABELS[range]}
                </span>
              </>
            )}
          </div>
          {!isLoading && change && change.accountImpact !== 0 && (
            <div className="mt-2 flex gap-4 text-[11px]" style={MONO}>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-[0.5px] text-[#9ca3af]">Total</span>
                <span className={`font-semibold ${isPos ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                  {change.diff >= 0 ? '+' : ''}{nwFormatCurrency(change.diff)}
                </span>
              </div>
              <div className="w-px bg-[#e5e7eb]" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-[0.5px] text-[#9ca3af]">Organic</span>
                <span className={`font-semibold ${change.organicDiff >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                  {change.organicDiff >= 0 ? '+' : ''}{nwFormatCurrency(change.organicDiff)}
                </span>
              </div>
              <div className="w-px bg-[#e5e7eb]" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-[0.5px] text-[#9ca3af]">Account Changes</span>
                <span className="font-semibold text-[#8b5cf6]">
                  {change.accountImpact >= 0 ? '+' : ''}{nwFormatCurrency(change.accountImpact)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Segmented range control */}
        <div className="flex rounded-[8px] border border-[#e5e7eb] bg-[#f9fafb] p-[3px]">
          {RANGES.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-[6px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                range === r
                  ? 'bg-white text-[#101828] shadow-sm'
                  : 'text-[#9ca3af] hover:text-[#6a7282]'
              }`}
              style={MONO}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Dropdown + chart */}
      <div className="border-t border-[#f3f4f6]">

        {/* Account filter dropdown */}
        {accounts.length > 0 && (
          <div className="relative px-5 py-2.5">
            <button
              type="button"
              onClick={() => setDropdownOpen(o => !o)}
              className="flex items-center gap-1.5 rounded-[6px] border border-[#e5e7eb] bg-white px-3 py-1.5 text-[11px] font-medium text-[#101828] transition-colors hover:bg-[#f9fafb]"
              style={MONO}
            >
              {allSelected ? 'All accounts' : `${effectiveSelected.size} of ${accounts.length} accounts`}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}>
                <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                <div className="absolute left-5 top-full z-20 mt-1 w-[220px] overflow-hidden rounded-[10px] border border-[#e5e7eb] bg-white shadow-lg">
                  <div className="p-1.5">
                    <button
                      type="button"
                      onClick={() => { setSelectedIds(null); setDropdownOpen(false) }}
                      className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[11px] font-medium transition-colors hover:bg-[#f3f4f6]"
                      style={MONO}
                    >
                      <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border ${allSelected ? 'border-[#101828] bg-[#101828]' : 'border-[#d1d5dc]'}`}>
                        {allSelected && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </span>
                      <span className="text-[#101828]">All accounts</span>
                    </button>
                    <div className="my-1 border-t border-[#f3f4f6]" />
                    {accounts.map(acc => {
                      const active = effectiveSelected.has(acc.account_id)
                      const color = TYPE_COLORS[acc.type] ?? TYPE_COLORS.other
                      return (
                        <button
                          key={acc.account_id}
                          type="button"
                          onClick={() => toggleAccount(acc.account_id)}
                          className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[11px] transition-colors hover:bg-[#f3f4f6]"
                          style={MONO}
                        >
                          <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border ${active ? 'border-[#101828] bg-[#101828]' : 'border-[#d1d5dc]'}`}>
                            {active && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </span>
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                          <span className="truncate text-[#101828]">{acc.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Chart */}
        <div className="px-2 pb-5 pt-1" style={{ height: 210 }}>
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-[13px] text-[#9ca3af]" style={MONO}>Loading…</span>
          </div>
        ) : !chartData.length ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-[13px] text-[#9ca3af]" style={MONO}>No data for this range</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} style={{ cursor: 'pointer' }}>
              <defs>
                <linearGradient id="acctNwGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#101828" stopOpacity={0.07} />
                  <stop offset="100%" stopColor="#101828" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 11, fill: '#9ca3af', fontFamily: 'JetBrains Mono,monospace' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => nwFormatDateLabel(v, range)}
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af', fontFamily: 'JetBrains Mono,monospace' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={nwFormatCompact}
                domain={yDomain}
                allowDataOverflow
              />
              <Tooltip content={<NWTooltip />} />
              {noDataStart && noDataEnd && (
                <ReferenceArea x1={noDataStart} x2={noDataEnd} fill="#f3f4f6" fillOpacity={0.8} strokeOpacity={0} />
              )}
              <Area
                type="monotone"
                dataKey="net_worth"
                stroke="#101828"
                strokeWidth={1.5}
                fill="url(#acctNwGrad)"
                dot={<AccountChangeDot />}
                activeDot={{ r: 3.5, fill: '#101828', stroke: '#fff', strokeWidth: 2, cursor: 'pointer', onClick: (_, e) => { if (e?.payload) setDrillPoint(e.payload) } }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
        </div>
      </div>
      <NetWorthDrillPanel dataPoint={drillPoint} accounts={accounts} onClose={() => setDrillPoint(null)} />
    </div>
  )
}

const SUMMARY_COLORS = {
  investment: '#6366f1',
  depository: '#22c55e',
  credit: '#ef4444',
  loan: '#f59e0b',
  other: '#6a7282',
}

const SUMMARY_LABELS = {
  investment: 'Investments',
  depository: 'Cash',
  credit: 'Credit Cards',
  loan: 'Loans',
  other: 'Other',
}

function SummaryPanel({ accounts }) {
  const [mode, setMode] = useState('totals')

  const assetTypes = ['investment', 'depository']
  const debtTypes = ['credit', 'loan']

  const grouped = {}
  for (const a of accounts) {
    const t = (a.type || 'other').toLowerCase()
    if (!grouped[t]) grouped[t] = 0
    grouped[t] += Math.abs(a.current ?? 0)
  }

  const totalAssets = assetTypes.reduce((s, t) => s + (grouped[t] ?? 0), 0)
  const totalDebts = debtTypes.reduce((s, t) => s + (grouped[t] ?? 0), 0)

  const assetBreakdown = assetTypes.filter(t => grouped[t]).map(t => ({ type: t, value: grouped[t] }))
  const debtBreakdown = debtTypes.filter(t => grouped[t]).map(t => ({ type: t, value: grouped[t] }))

  function Bar({ items, total }) {
    if (!total) return null
    return (
      <div className="flex h-[8px] w-full overflow-hidden rounded-full">
        {items.map(({ type, value }) => (
          <div
            key={type}
            className="h-full"
            style={{ width: `${(value / total) * 100}%`, backgroundColor: SUMMARY_COLORS[type] }}
          />
        ))}
      </div>
    )
  }

  function Rows({ items, total }) {
    return items.map(({ type, value }) => (
      <div key={type} className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SUMMARY_COLORS[type] }} />
          <span className="text-[13px] text-[#101828]" style={MONO}>{SUMMARY_LABELS[type]}</span>
        </div>
        <span className="text-[13px] font-medium text-[#101828]" style={MONO}>
          {mode === 'totals' ? formatCurrency(value) : `${(total ? (value / total) * 100 : 0).toFixed(1)}%`}
        </span>
      </div>
    ))
  }

  return (
    <div className="rounded-[14px] border border-[#9ca3af] bg-white">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <h2 className="text-[16px] font-semibold text-[#101828]" style={MONO}>Summary</h2>
        <div className="flex rounded-[8px] border border-[#e5e7eb] bg-[#f9fafb] p-[3px]">
          {['totals', 'percent'].map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-[6px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                mode === m ? 'bg-white text-[#101828] shadow-sm' : 'text-[#9ca3af] hover:text-[#6a7282]'
              }`}
              style={MONO}
            >
              {m === 'totals' ? 'Totals' : 'Percent'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-5 space-y-5">
        {/* Assets */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-t border-[#f3f4f6] pt-4">
            <span className="text-[14px] font-semibold text-[#101828]" style={MONO}>Assets</span>
            <span className="text-[14px] font-semibold text-[#101828]" style={MONO}>{formatCurrency(totalAssets)}</span>
          </div>
          <Bar items={assetBreakdown} total={totalAssets} />
          <div className="space-y-2">
            <Rows items={assetBreakdown} total={totalAssets} />
          </div>
        </div>

        {/* Liabilities */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-t border-[#f3f4f6] pt-4">
            <span className="text-[14px] font-semibold text-[#101828]" style={MONO}>Liabilities</span>
            <span className="text-[14px] font-semibold text-[#101828]" style={MONO}>{formatCurrency(totalDebts)}</span>
          </div>
          <Bar items={debtBreakdown} total={totalDebts} />
          <div className="space-y-2">
            <Rows items={debtBreakdown} total={totalDebts} />
          </div>
        </div>
      </div>
    </div>
  )
}

const TYPE_LABELS = {

  depository: 'Deposits',
  credit: 'Credit',
  loan: 'Loans',
  investment: 'Investments',
  other: 'Other',
}

const TYPE_ORDER = ['depository', 'credit', 'investment', 'loan', 'other']

function AccountTransactionsPanel({ account, onClose }) {
  const { getIdToken } = useAuth()
  const [transactions, setTransactions] = useState(null)
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState(null)
  const open = !!account

  const fetchTransactions = useCallback(async (offset = 0) => {
    const url = `/api/plaid/transactions?limit=100&offset=${offset}&account_ids=${account.account_id}`
    const d = await apiFetch(url, { getToken: getIdToken })
    return d
  }, [account?.account_id, getIdToken])

  useEffect(() => {
    if (!account) return
    setTransactions(null)
    setSelectedTransaction(null)
    setHasMore(false)
    fetchTransactions(0)
      .then(d => { setTransactions(d.transactions ?? []); setHasMore(d.has_more ?? false) })
      .catch(() => setTransactions([]))
  }, [account?.account_id, fetchTransactions])

  async function handleBackfill() {
    if (backfilling || !account) return
    setBackfilling(true)
    setBackfillResult(null)
    try {
      const d = await apiFetch('/api/plaid/backfill', { method: 'POST', body: { item_id: account.item_id }, getToken: getIdToken })
      setBackfillResult(`${d.transactions_fetched} transactions fetched`)
      // Re-fetch the transaction list
      const fresh = await fetchTransactions(0)
      setTransactions(fresh.transactions ?? [])
      setHasMore(fresh.has_more ?? false)
    } catch (err) {
      setBackfillResult('Backfill failed')
    }
    setBackfilling(false)
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const d = await fetchTransactions(transactions.length)
      setTransactions(prev => [...prev, ...(d.transactions ?? [])])
      setHasMore(d.has_more ?? false)
    } catch (_) {}
    setLoadingMore(false)
  }

  return (
    <>
      <TransactionDetailPanel
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        zBackdrop="z-[60]"
        zPanel="z-[70]"
      />
      {open && !selectedTransaction && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      )}
      <div className={`fixed right-0 top-0 z-50 flex h-full w-1/3 flex-col border-l border-[#d9d9d9] bg-white shadow-xl transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-[#d9d9d9] px-5 py-4">
          <div className="min-w-0">
            <span className="text-[16px] font-normal text-[#1e1e1e]" style={MONO}>{account?.name ?? ''}</span>
            {transactions && (
              <span className="ml-2 text-[13px] text-[#6a7282]" style={MONO}>
                {transactions.length}{hasMore ? '+' : ''} transactions
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleBackfill} disabled={backfilling}
              className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[#6a7282] border border-[#e5e7eb] hover:text-[#101828] hover:bg-[#f3f4f6] transition-colors cursor-pointer disabled:opacity-50"
              style={MONO} title="Fetch up to 2 years of transaction history">
              {backfilling ? 'Backfilling…' : 'Backfill history'}
            </button>
            <button type="button" onClick={onClose}
              className="text-[#999] hover:text-[#1e1e1e] transition-colors text-xl leading-none cursor-pointer">×</button>
          </div>
        </div>
        {backfillResult && (
          <div className="px-5 py-2 border-b border-[#f3f4f6] text-[11px] text-[#6a7282]" style={MONO}>
            {backfillResult}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {!transactions ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-[13px] text-[#6a7282]" style={MONO}>Loading…</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-[13px] text-[#6a7282]" style={MONO}>No transactions</span>
            </div>
          ) : (
            <div className="divide-y divide-[#d1d5db]">
              {transactions.map(tx => {
                const amt = Number(tx.amount)
                const isCredit = amt < 0
                const displayAmt = isCredit ? `+$${Math.abs(amt).toFixed(2)}` : `$${Math.abs(amt).toFixed(2)}`
                const dateStr = (tx.authorized_date || tx.date || '').slice(0, 10)
                const dateLabel = dateStr ? new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
                const logo = bestLogoUrl(tx)
                return (
                  <button
                    key={tx.plaid_transaction_id || tx.id}
                    type="button"
                    onClick={() => setSelectedTransaction(tx)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-[#f9fafb] transition-colors cursor-pointer"
                  >
                    {logo ? (
                      <img src={logo} alt="" className="h-8 w-8 shrink-0 rounded-full border border-[#e5e7eb] object-contain bg-white"
                        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                    ) : null}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-[#f9fafb] text-[12px] font-bold text-[#4a5565]"
                      style={{ ...MONO, display: logo ? 'none' : 'flex' }}>
                      {(tx.name ?? '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-[#101828] truncate" style={MONO}>{tx.name}</p>
                      <p className="text-[11px] text-[#9ca3af]" style={MONO}>{dateLabel}{tx.pending ? ' · Pending' : ''}</p>
                    </div>
                    <span className={`shrink-0 text-[13px] font-semibold ${isCredit ? 'text-[#155dfc]' : 'text-[#101828]'}`} style={MONO}>
                      {displayAmt}
                    </span>
                  </button>
                )
              })}
              {hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-3 text-center text-[12px] font-medium text-[#6a7282] hover:text-[#101828] hover:bg-[#f9fafb] transition-colors cursor-pointer disabled:opacity-50"
                  style={MONO}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function groupByType(accounts) {
  const groups = {}
  for (const a of accounts) {
    const t = (a.type || 'other').toLowerCase()
    if (!groups[t]) groups[t] = []
    groups[t].push(a)
  }
  return TYPE_ORDER.filter((t) => groups[t]?.length).map((t) => [TYPE_LABELS[t] || t, groups[t]])
}

function AccountRow({ account, onRefresh, onDelete, refreshing, onClick, needsReconnect, onReconnect }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <div className={`flex items-center justify-between rounded-[10px] border px-[13px] py-3 cursor-pointer transition-colors ${needsReconnect ? 'border-[#ffc9c9] bg-[#fef2f2] hover:bg-[#fde8e8]' : 'border-black/10 hover:bg-[#f9fafb]'}`} onClick={onClick}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-[14px] leading-5 tracking-[-0.15px] text-[#0a0a0a]" style={MONO}>
            {account.name}
          </p>
          {account.subtype && (
            <span className="text-[12px] leading-4 text-[#6a7282]" style={MONO}>
              {account.subtype}
            </span>
          )}
          {needsReconnect && (
            <span className="inline-flex items-center gap-1 rounded-[8px] border border-[#ffc9c9] bg-[#fef2f2] px-2 py-0.5 text-[11px] font-medium text-[#c10007]" style={MONO}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Error
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] leading-4 text-[#99a1af]" style={MONO}>
          {account.institution_name}
          {account.last_synced_at && (
            <span className="ml-2 text-[11px] text-[#c5c9d0]">
              synced {formatTimeAgo(account.last_synced_at)}
            </span>
          )}
        </p>
        {needsReconnect && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onReconnect?.(account.item_id) }}
            className="mt-1.5 rounded-md bg-[#c10007] px-2.5 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
            style={MONO}
          >
            Reconnect
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="shrink-0 text-right">
          <p className="font-semibold text-[14px] leading-5 text-[#101828]" style={MONO}>
            {formatCurrency(account.current)}
          </p>
        </div>
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onRefresh(account.item_id)}
            disabled={refreshing}
            className="rounded-md p-1.5 text-[#9ca3af] hover:text-[#101828] hover:bg-[#f3f4f6] transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh account"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? 'animate-spin' : ''}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { onDelete(account.item_id); setConfirmDelete(false) }}
                className="rounded-md px-2 py-1 text-[11px] font-medium bg-[#dc2626] text-white hover:bg-[#b91c1c] transition-colors cursor-pointer"
                style={MONO}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-[#6a7282] hover:text-[#101828] hover:bg-[#f3f4f6] transition-colors cursor-pointer"
                style={MONO}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-md p-1.5 text-[#9ca3af] hover:text-[#dc2626] hover:bg-[#fef2f2] transition-colors cursor-pointer"
              title="Remove account"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function AccountsPage() {
  const { data, isLoading: loading } = useAccounts()
  const { getIdToken } = useAuth()
  const accounts = data?.accounts ?? []
  const [refreshingItems, setRefreshingItems] = useState(new Set())
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [selectedInvestmentAccount, setSelectedInvestmentAccount] = useState(null)
  const [showConnectionTypeModal, setShowConnectionTypeModal] = useState(false)
  const { data: investmentsData } = useInvestments()
  const holdings = investmentsData?.holdings ?? []
  const investmentAccountsMeta = accounts.filter(a => a.type === 'investment')
  const { openLink, reconnect, linkLoading, linkError } = usePlaidLinkContext()
  const { data: connectionsData } = useConnections()
  const errorConnections = useMemo(() =>
    (connectionsData?.connections ?? []).filter(c => c.status === 'error' && ['ITEM_LOGIN_REQUIRED', 'NO_ACCOUNTS'].includes(c.error_code)),
    [connectionsData]
  )
  const errorItemIds = useMemo(() => new Set(errorConnections.map(c => c.item_id)), [errorConnections])

  async function handleRefresh(itemId) {
    if (refreshingItems.has(itemId)) return
    setRefreshingItems(prev => new Set(prev).add(itemId))
    try {
      await apiFetch('/api/plaid/refresh', { method: 'POST', body: { item_id: itemId }, getToken: getIdToken })
      await Promise.all([
        invalidateTransactionData(),
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      ])
    } catch (err) {
      console.error('Refresh failed:', err)
    } finally {
      setRefreshingItems(prev => { const next = new Set(prev); next.delete(itemId); return next })
    }
  }

  async function handleDelete(itemId) {
    try {
      await apiFetch('/api/plaid/disconnect', { method: 'POST', body: { item_id: itemId }, getToken: getIdToken })
      await invalidateAll()
    } catch (err) {
      console.error('Disconnect failed:', err)
    }
  }

  const groups = groupByType(accounts)
  const totalCurrent = accounts.reduce((sum, a) => {
    const val = a.current ?? 0
    const isLiability = a.type === 'credit' || a.type === 'loan'
    return sum + (isLiability ? -val : val)
  }, 0)

  return (
    <div className="min-h-screen bg-[#f8f8f8]" style={{ paddingLeft: 'var(--sidebar-w)' }}>
      <AppHeader />

      {/* Page header */}
      <div className="flex items-center justify-between border-b border-[#9ca3af] bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.5px] text-[#18181b]" style={MONO}>
            Accounts
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setShowConnectionTypeModal(true)}
          disabled={linkLoading}
          className="flex items-center gap-1.5 rounded-[10px] bg-[#101828] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1e293b] transition-colors cursor-pointer disabled:opacity-50"
          style={MONO}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Account
        </button>
      </div>

      {linkError && (
        <div className="mx-4 mt-4 sm:mx-6 lg:mx-8">
          <div className="mx-auto max-w-[1050px] rounded-[10px] border border-[#ffc9c9] bg-[#fef2f2] px-4 py-3">
            <p className="text-[13px] text-[#c10007]" style={MONO}>{linkError}</p>
          </div>
        </div>
      )}
      {errorConnections.length > 0 && (
        <div className="mx-4 mt-4 sm:mx-6 lg:mx-8">
          <div className="mx-auto max-w-[1050px] rounded-[10px] border border-[#ffc9c9] bg-[#fef2f2] px-4 py-3">
            <div className="flex items-start gap-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c10007" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden>
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[#c10007]" style={MONO}>
                  {errorConnections.length === 1 ? '1 connection needs attention' : `${errorConnections.length} connections need attention`}
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {errorConnections.map(c => (
                    <div key={c.item_id} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {c.institution_logo ? (
                          <img src={c.institution_logo} alt="" className="h-5 w-5 rounded object-contain" />
                        ) : (
                          <div className="h-5 w-5 rounded bg-[#dbeafe] flex items-center justify-center">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M3 21h18" /><path d="M3 10h18" /><path d="M5 6l7-3 7 3" />
                            </svg>
                          </div>
                        )}
                        <span className="text-[12px] text-[#4a5565] truncate" style={MONO}>{c.institution_name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => reconnect(c.item_id)}
                          disabled={linkLoading}
                          className="rounded-md bg-[#c10007] px-2.5 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
                          style={MONO}
                        >
                          Reconnect
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c.item_id)}
                          className="rounded-md border border-[#d1d5dc] px-2.5 py-1 text-[11px] font-semibold text-[#4a5565] hover:bg-[#f3f4f6] transition-colors cursor-pointer"
                          style={MONO}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1050px]">
          <NetWorthSection />
          <div className="flex gap-6 items-start">
          <div className="flex-[2] min-w-0 rounded-[14px] border border-[#9ca3af] bg-white">
            <div className="flex items-start justify-between px-6 pt-6 pb-1.5">
              <div>
                <h2 className="text-[16px] font-medium leading-4 tracking-[-0.31px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  Accounts
                </h2>
                <p className="mt-1 text-[16px] leading-6 tracking-[-0.31px] text-[#4a5565]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  All linked accounts and balances
                </p>
              </div>
              {!loading && accounts.length > 0 && (
                <div className="shrink-0 text-right">
                  <p className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Net Worth</p>
                  <p className="font-semibold text-[16px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    {formatCurrency(totalCurrent)}
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 pb-6">
              {loading ? (
                <div className="flex flex-col gap-4">
                  {[0, 1].map((g) => (
                    <div key={g} className="flex flex-col gap-2">
                      <div className="border-b border-[#d1d5dc] pb-1 pt-2">
                        <div className="flex items-center justify-between">
                          <div className="h-4 w-24 animate-pulse rounded bg-[#e5e7eb]" />
                          <div className="h-5 w-7 animate-pulse rounded-[8px] bg-[#e5e7eb]" />
                        </div>
                      </div>
                      {[0, 1, 2].map((r) => (
                        <div key={r} className="flex items-center justify-between rounded-[10px] border border-black/10 px-[13px] py-3">
                          <div className="flex flex-col gap-1.5">
                            <div className="h-4 w-36 animate-pulse rounded bg-[#e5e7eb]" />
                            <div className="h-3 w-24 animate-pulse rounded bg-[#f3f4f6]" />
                          </div>
                          <div className="h-4 w-20 animate-pulse rounded bg-[#e5e7eb]" />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : accounts.length === 0 ? (
                <p className="text-[14px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  No accounts found. Link an account from the Dashboard to get started.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {groups.map(([label, items]) => (
                    <div key={label} className="flex flex-col gap-2">
                      <div className="border-b border-[#d1d5dc] pb-1 pt-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <p className="text-[14px] font-bold uppercase leading-5 tracking-[0.2px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                              {label}
                            </p>
                            <span className="rounded-[8px] border border-black/10 px-2 py-0.5 text-[12px] font-medium leading-4 text-[#0a0a0a]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                              {items.length}
                            </span>
                          </div>
                          <p className="text-[13px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                            {formatCurrency(items.reduce((s, a) => s + (a.current ?? 0), 0))}
                          </p>
                        </div>
                      </div>
                      {items.map((a) => (
                        <AccountRow key={a.account_id} account={a} onRefresh={handleRefresh} onDelete={handleDelete} refreshing={refreshingItems.has(a.item_id)} onClick={() => a.type === 'investment' ? setSelectedInvestmentAccount({ account_id: a.account_id, name: a.name, institution: a.institution_name }) : setSelectedAccount(a)} needsReconnect={errorItemIds.has(a.item_id)} onReconnect={(itemId) => reconnect(itemId)} />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            {!loading && accounts.length > 0 && <SummaryPanel accounts={accounts} />}
          </div>
          </div>
        </div>
      </main>
      <AccountTransactionsPanel account={selectedAccount} onClose={() => setSelectedAccount(null)} />
      <AccountDetailPanel account={selectedInvestmentAccount} holdings={holdings} accountsMeta={investmentAccountsMeta} onClose={() => setSelectedInvestmentAccount(null)} />

      {showConnectionTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowConnectionTypeModal(false)}>
          <div
            className="w-full max-w-md rounded-[14px] border border-[#9ca3af] bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[18px] font-semibold tracking-tight text-[#101828]" style={MONO}>
              What do you want to connect?
            </h3>
            <p className="mt-1 text-[14px] text-[#6a7282]" style={MONO}>
              Choose the type of accounts to link. Plaid will open next.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => { setShowConnectionTypeModal(false); openLink('add') }}
                disabled={linkLoading}
                className="flex items-center gap-4 rounded-[10px] border border-[#9ca3af] bg-white px-4 py-3 text-left transition-colors hover:bg-[#f9fafb] disabled:opacity-60"
                style={MONO}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#dbeafe] text-[#1e40af]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 21h18" /><path d="M3 10h18" /><path d="M5 6l7-3 7 3" /><path d="M4 10v11" /><path d="M20 10v11" /><path d="M8 14v3" /><path d="M12 14v3" /><path d="M16 14v3" />
                  </svg>
                </span>
                <div>
                  <p className="font-medium text-[#101828]">Credit Cards, Checking and Savings</p>
                  <p className="text-[12px] text-[#6a7282]">Link bank and credit card accounts</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => { setShowConnectionTypeModal(false); openLink('investments') }}
                disabled={linkLoading}
                className="flex items-center gap-4 rounded-[10px] border border-[#9ca3af] bg-white px-4 py-3 text-left transition-colors hover:bg-[#f9fafb] disabled:opacity-60"
                style={MONO}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#dbeafe] text-[#1e40af]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" />
                  </svg>
                </span>
                <div>
                  <p className="font-medium text-[#101828]">Investments</p>
                  <p className="text-[12px] text-[#6a7282]">Link brokerage, IRA, and investment accounts</p>
                </div>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowConnectionTypeModal(false)}
              className="mt-4 w-full rounded-lg border border-[#d1d5dc] bg-white py-2 text-[14px] font-medium text-[#4a5565] hover:bg-[#f3f4f6]"
              style={MONO}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
