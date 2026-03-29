import { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { AppHeader } from '../components/AppHeader'
import { useAccounts, useNetWorth } from '../hooks/usePlaidQueries'

function formatCurrency(value) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

const MONO = { fontFamily: 'JetBrains Mono,monospace' }

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
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
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

function nwFormatDateLabel(dateStr, range) {
  const d = new Date(dateStr + 'T00:00:00')
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
  return (
    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 shadow-md">
      <p className="text-[11px] font-medium text-[#6a7282]" style={MONO}>{dateLabel}</p>
      <p className="text-[14px] font-semibold text-[#101828]" style={MONO}>{nwFormatCurrency(d.net_worth)}</p>
      <div className="mt-1 flex gap-3 text-[11px]" style={MONO}>
        <span className="text-[#155dfc]">Assets {nwFormatCurrency(d.assets)}</span>
        <span className="text-[#dc2626]">Debts {nwFormatCurrency(d.debts)}</span>
      </div>
    </div>
  )
}

function NetWorthSection() {
  const [range, setRange] = useState('1M')
  const { data: rawData, isLoading } = useNetWorth(range)
  const [selectedIds, setSelectedIds] = useState(null) // null = all selected
  const [dropdownOpen, setDropdownOpen] = useState(false)

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

  const chartData = useMemo(() => {
    if (!rawData?.history?.length || !accounts.length) return []
    const history = rawData.history.map(row => {
      let assets = 0, debts = 0
      for (const acc of accounts) {
        if (!effectiveSelected.has(acc.account_id)) continue
        const c = row.by_account?.[acc.account_id] ?? 0
        if (c >= 0) assets += c
        else debts += Math.abs(c)
      }
      return {
        date: row.date,
        net_worth: Math.round((assets - debts) * 100) / 100,
        assets: Math.round(assets * 100) / 100,
        debts: Math.round(debts * 100) / 100,
      }
    })
    const maxPoints = range === '1W' ? 100 : range === '1M' ? 60 : 90
    if (history.length <= maxPoints) return history
    const step = Math.ceil(history.length / maxPoints)
    const sampled = history.filter((_, i) => i % step === 0)
    if (sampled[sampled.length - 1]?.date !== history[history.length - 1]?.date) sampled.push(history[history.length - 1])
    return sampled
  }, [rawData, effectiveSelected, accounts, range])

  const currentNW = chartData[chartData.length - 1]?.net_worth ?? null
  const change = useMemo(() => {
    if (!chartData.length || currentNW == null) return null
    const startVal = chartData[0].net_worth
    const diff = currentNW - startVal
    const pct = startVal !== 0 ? (diff / Math.abs(startVal)) * 100 : 0
    return { diff, pct }
  }, [chartData, currentNW])
  const isPos = change && change.diff >= 0

  return (
    <div className="mb-6 overflow-hidden rounded-[14px] border border-[#9ca3af] bg-white">
      {/* Header — all white, matches the accounts list card */}
      <div className="flex items-start justify-between px-5 pt-5 pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.8px] text-[#9ca3af]" style={MONO}>
            Net Worth
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[30px] font-bold tracking-[-0.5px] text-[#101828]" style={MONO}>
              {isLoading ? '—' : nwFormatCurrency(currentNW)}
            </span>
            {!isLoading && change && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                  isPos ? 'bg-[#f0fdf4] text-[#16a34a]' : 'bg-[#fef2f2] text-[#dc2626]'
                }`}
                style={MONO}
              >
                {isPos ? '+' : ''}{change.pct.toFixed(1)}%
              </span>
            )}
          </div>
          {!isLoading && change && (
            <p className="mt-0.5 text-[12px] text-[#9ca3af]" style={MONO}>
              {isPos ? '+' : ''}{nwFormatCurrency(change.diff)} {RANGE_LABELS[range]}
            </p>
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
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="acctNwGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#101828" stopOpacity={0.07} />
                  <stop offset="100%" stopColor="#101828" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#9ca3af', fontFamily: 'JetBrains Mono,monospace' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => nwFormatDateLabel(v, range)}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af', fontFamily: 'JetBrains Mono,monospace' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={nwFormatCompact}
              />
              <Tooltip content={<NWTooltip />} />
              <Area
                type="monotone"
                dataKey="net_worth"
                stroke="#101828"
                strokeWidth={1.5}
                fill="url(#acctNwGrad)"
                dot={false}
                activeDot={{ r: 3.5, fill: '#101828', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
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

function groupByType(accounts) {
  const groups = {}
  for (const a of accounts) {
    const t = (a.type || 'other').toLowerCase()
    if (!groups[t]) groups[t] = []
    groups[t].push(a)
  }
  return TYPE_ORDER.filter((t) => groups[t]?.length).map((t) => [TYPE_LABELS[t] || t, groups[t]])
}

function AccountRow({ account }) {
  return (
    <div className="flex items-center justify-between rounded-[10px] border border-black/10 px-[13px] py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-[14px] leading-5 tracking-[-0.15px] text-[#0a0a0a]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            {account.name}
          </p>
          {account.subtype && (
            <span className="text-[12px] leading-4 text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              {account.subtype}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] leading-4 text-[#99a1af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
          {account.institution_name}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-semibold text-[14px] leading-5 text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
          {formatCurrency(account.current)}
        </p>
        {account.available != null && account.available !== account.current && (
          <p className="text-[12px] leading-4 text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            {formatCurrency(account.available)} available
          </p>
        )}
      </div>
    </div>
  )
}

export function AccountsPage() {
  const { data, isLoading: loading } = useAccounts()
  const accounts = data?.accounts ?? []

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
      <div className="border-b border-[#9ca3af] bg-white px-4 py-4 sm:px-6 lg:px-8">
        <h1 className="text-[24px] font-semibold tracking-[-0.5px] text-[#18181b]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
          Accounts
        </h1>
        {!loading && accounts.length > 0 && (
          <p className="mt-0.5 text-[13px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            Net worth {formatCurrency(totalCurrent)}
          </p>
        )}
      </div>

      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[700px]">
          <NetWorthSection />
          <div className="rounded-[14px] border border-[#9ca3af] bg-white">
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
                          <p className="text-[14px] font-bold uppercase leading-5 tracking-[0.2px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                            {label}
                          </p>
                          <span className="rounded-[8px] border border-black/10 px-2 py-0.5 text-[12px] font-medium leading-4 text-[#0a0a0a]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                            {items.length}
                          </span>
                        </div>
                      </div>
                      {items.map((a) => (
                        <AccountRow key={a.account_id} account={a} />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
