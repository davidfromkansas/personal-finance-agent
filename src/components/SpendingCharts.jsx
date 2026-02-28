import { useState, useEffect, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { apiFetch } from '../lib/api'

const PERIODS = [
  { key: 'week', label: 'Daily', subtitle: 'Last 7 days' },
  { key: 'month', label: 'Weekly', subtitle: 'Last 4 weeks' },
  { key: 'year', label: 'Monthly', subtitle: 'Last 12 months' },
]

const BAR_COLOR = '#4f46e5'

function formatCurrency(value) {
  if (value == null) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value)
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 shadow-sm">
      <p className="text-[12px] font-medium text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>
        {label}
      </p>
      <p className="text-[14px] font-semibold text-[#101828]" style={{ fontFamily: 'Inter,sans-serif' }}>
        {formatCurrency(payload[0]?.value)}
      </p>
    </div>
  )
}

export const SpendingCharts = forwardRef(function SpendingCharts({ connections, getToken }, ref) {
  const [activePeriod, setActivePeriod] = useState('week')
  const [data, setData] = useState({ week: null, month: null, year: null })
  const [loading, setLoading] = useState({ week: true, month: true, year: true })
  const [selectedItemIds, setSelectedItemIds] = useState(null)

  const uniqueConnections = useMemo(() => {
    const seen = new Set()
    return (connections ?? []).filter((c) => {
      if (seen.has(c.item_id)) return false
      seen.add(c.item_id)
      return true
    })
  }, [connections])

  const allSelected = selectedItemIds === null

  const fetchPeriod = useCallback(async (period, itemIds) => {
    setLoading((prev) => ({ ...prev, [period]: true }))
    try {
      let url = `/api/plaid/spending-summary?period=${period}`
      if (itemIds) url += `&item_ids=${itemIds.join(',')}`
      const result = await apiFetch(url, { getToken })
      setData((prev) => ({ ...prev, [period]: result.buckets ?? [] }))
    } catch (err) {
      console.error(`Failed to fetch ${period} spending:`, err)
      setData((prev) => ({ ...prev, [period]: [] }))
    } finally {
      setLoading((prev) => ({ ...prev, [period]: false }))
    }
  }, [getToken])

  useEffect(() => {
    PERIODS.forEach((p) => fetchPeriod(p.key, selectedItemIds))
  }, [fetchPeriod, selectedItemIds])

  useImperativeHandle(ref, () => ({
    refresh() {
      PERIODS.forEach((p) => fetchPeriod(p.key, selectedItemIds))
    },
  }), [fetchPeriod, selectedItemIds])

  function toggleConnection(itemId) {
    if (allSelected) {
      const all = uniqueConnections.map((c) => c.item_id)
      setSelectedItemIds(all.filter((id) => id !== itemId))
    } else {
      const newIds = selectedItemIds.includes(itemId)
        ? selectedItemIds.filter((id) => id !== itemId)
        : [...selectedItemIds, itemId]
      if (newIds.length === uniqueConnections.length) {
        setSelectedItemIds(null)
      } else {
        setSelectedItemIds(newIds)
      }
    }
  }

  function selectAll() {
    setSelectedItemIds(null)
  }

  const activeConfig = PERIODS.find((p) => p.key === activePeriod)
  const activeData = data[activePeriod]
  const activeLoading = loading[activePeriod]
  const total = useMemo(() => (activeData ?? []).reduce((s, b) => s + b.total, 0), [activeData])

  return (
    <div className="flex flex-col gap-4">
      {uniqueConnections.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={selectAll}
            className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
              allSelected
                ? 'border-[#4f46e5] bg-[#4f46e5] text-white'
                : 'border-[#d1d5dc] bg-white text-[#4a5565] hover:bg-[#f9fafb]'
            }`}
            style={{ fontFamily: 'Inter,sans-serif' }}
          >
            All Connections
          </button>
          {uniqueConnections.map((c) => {
            const isActive = allSelected || selectedItemIds?.includes(c.item_id)
            return (
              <button
                key={c.item_id}
                type="button"
                onClick={() => toggleConnection(c.item_id)}
                className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                  isActive
                    ? 'border-[#4f46e5] bg-[#eef2ff] text-[#4f46e5]'
                    : 'border-[#d1d5dc] bg-white text-[#4a5565] hover:bg-[#f9fafb]'
                }`}
                style={{ fontFamily: 'Inter,sans-serif' }}
              >
                {c.institution_name ?? 'Unknown'}
              </button>
            )
          })}
        </div>
      )}

      <div className="rounded-[14px] border border-[#e5e7eb] bg-white">
        <div className="flex items-center justify-between border-b border-[#e5e7eb]">
          <div className="flex">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setActivePeriod(p.key)}
                className={`relative px-5 py-3 text-[14px] font-medium transition-colors ${
                  activePeriod === p.key
                    ? 'text-[#4f46e5]'
                    : 'text-[#6a7282] hover:text-[#101828]'
                }`}
                style={{ fontFamily: 'Inter,sans-serif' }}
              >
                {p.label}
                {activePeriod === p.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4f46e5] rounded-t" />
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 pr-6">
            <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>
              {activeConfig?.subtitle}
            </span>
            <span className="text-[18px] font-semibold text-[#101828]" style={{ fontFamily: 'Inter,sans-serif' }}>
              {activeLoading ? '—' : formatCurrency(total)}
            </span>
          </div>
        </div>

        <p className="px-5 pt-4 text-[11px] text-[#9ca3af]" style={{ fontFamily: 'Inter,sans-serif' }}>
          Includes purchases and payments across all accounts. Transfers, income, and bank fees are excluded.
        </p>

        <div className="px-4 pb-5 pt-4" style={{ height: 260 }}>
          {activeLoading ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>Loading…</span>
            </div>
          ) : !activeData?.length ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>No spending data</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activeData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#6a7282', fontFamily: 'Inter,sans-serif' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6a7282', fontFamily: 'Inter,sans-serif' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f9fafb' }} />
                <Bar dataKey="total" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={64} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
})
