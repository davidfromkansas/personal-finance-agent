import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import { AppHeader } from '../components/AppHeader'

function formatCurrency(value) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function groupByInstitution(holdings) {
  const groups = {}
  for (const h of holdings) {
    const key = h.institution_name
    if (!groups[key]) groups[key] = []
    groups[key].push(h)
  }
  return Object.entries(groups)
}

function HoldingRow({ holding }) {
  const gain = holding.cost_basis != null ? holding.value - holding.cost_basis : null
  const gainPct = gain != null && holding.cost_basis ? (gain / holding.cost_basis) * 100 : null
  const isPositive = gain != null && gain >= 0

  return (
    <div className="flex items-center justify-between rounded-[10px] px-2 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-[14px] leading-5 tracking-[-0.15px] text-[#101828]" style={{ fontFamily: 'Inter,sans-serif' }}>
            {holding.security_name}
          </p>
          {holding.ticker && (
            <span
              className="rounded-[6px] bg-[#f1f5f9] px-1.5 py-0.5 text-[11px] font-semibold text-[#475569]"
              style={{ fontFamily: 'Inter,sans-serif' }}
            >
              {holding.ticker}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] leading-4 text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>
          {holding.quantity.toFixed(holding.quantity % 1 === 0 ? 0 : 4)} shares
          {holding.close_price != null && ` @ ${formatCurrency(holding.close_price)}`}
          {holding.account_name && ` · ${holding.account_name}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-semibold text-[14px] leading-5 text-[#101828]" style={{ fontFamily: 'Inter,sans-serif' }}>
          {formatCurrency(holding.value)}
        </p>
        {gain != null && (
          <p
            className={`text-[12px] font-medium leading-4 ${isPositive ? 'text-[#008236]' : 'text-[#f54900]'}`}
            style={{ fontFamily: 'Inter,sans-serif' }}
          >
            {isPositive ? '+' : ''}{formatCurrency(gain)}
            {gainPct != null && ` (${isPositive ? '+' : ''}${gainPct.toFixed(1)}%)`}
          </p>
        )}
      </div>
    </div>
  )
}

export function InvestmentsPage() {
  const { getIdToken } = useAuth()
  const [holdings, setHoldings] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchInvestments = useCallback(async () => {
    try {
      const data = await apiFetch('/api/plaid/investments', { getToken: getIdToken })
      setHoldings(data.holdings ?? [])
    } catch (err) {
      console.error('Failed to load investments:', err)
      setHoldings([])
    } finally {
      setLoading(false)
    }
  }, [getIdToken])

  useEffect(() => {
    fetchInvestments()
  }, [fetchInvestments])

  const groups = groupByInstitution(holdings)
  const totalValue = holdings.reduce((sum, h) => sum + (h.value ?? 0), 0)

  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <AppHeader />
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[700px]">
          <div className="rounded-[14px] border border-[#e5e7eb] bg-white">
            <div className="flex items-start justify-between px-6 pt-6 pb-1.5">
              <div>
                <h2 className="text-[16px] font-medium leading-4 tracking-[-0.31px] text-[#101828]" style={{ fontFamily: 'Inter,sans-serif' }}>
                  Investments
                </h2>
                <p className="mt-1 text-[16px] leading-6 tracking-[-0.31px] text-[#4a5565]" style={{ fontFamily: 'Inter,sans-serif' }}>
                  Holdings across all investment accounts
                </p>
              </div>
              {!loading && holdings.length > 0 && (
                <div className="shrink-0 text-right">
                  <p className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>Total Value</p>
                  <p className="font-semibold text-[16px] text-[#101828]" style={{ fontFamily: 'Inter,sans-serif' }}>
                    {formatCurrency(totalValue)}
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 pb-6">
              {loading ? (
                <p className="text-[14px] text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>Loading investments…</p>
              ) : holdings.length === 0 ? (
                <p className="text-[14px] text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>
                  No investment holdings found. Link an investment account to see holdings.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {groups.map(([institution, items]) => (
                    <div key={institution} className="flex flex-col gap-1">
                      <div className="border-b border-[#d1d5dc] pb-1 pt-2">
                        <p className="text-[14px] font-bold uppercase leading-5 tracking-[0.2px] text-[#101828]" style={{ fontFamily: 'Inter,sans-serif' }}>
                          {institution}
                        </p>
                      </div>
                      {items.map((h, i) => (
                        <HoldingRow key={`${h.ticker ?? h.security_name}-${i}`} holding={h} />
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
