import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import { AppHeader } from '../components/AppHeader'

function formatCurrency(value) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
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
          <p className="font-semibold text-[14px] leading-5 tracking-[-0.15px] text-[#0a0a0a]" style={{ fontFamily: 'Inter,sans-serif' }}>
            {account.name}
          </p>
          {account.subtype && (
            <span className="text-[12px] leading-4 text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>
              {account.subtype}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] leading-4 text-[#99a1af]" style={{ fontFamily: 'Inter,sans-serif' }}>
          {account.institution_name}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-semibold text-[14px] leading-5 text-[#101828]" style={{ fontFamily: 'Inter,sans-serif' }}>
          {formatCurrency(account.current)}
        </p>
        {account.available != null && account.available !== account.current && (
          <p className="text-[12px] leading-4 text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>
            {formatCurrency(account.available)} available
          </p>
        )}
      </div>
    </div>
  )
}

export function AccountsPage() {
  const { getIdToken } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await apiFetch('/api/plaid/accounts', { getToken: getIdToken })
      setAccounts(data.accounts ?? [])
    } catch (err) {
      console.error('Failed to load accounts:', err)
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }, [getIdToken])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const groups = groupByType(accounts)
  const totalCurrent = accounts.reduce((sum, a) => {
    const val = a.current ?? 0
    const isLiability = a.type === 'credit' || a.type === 'loan'
    return sum + (isLiability ? -val : val)
  }, 0)

  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <AppHeader />
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[700px]">
          <div className="rounded-[14px] border border-[#e5e7eb] bg-white">
            <div className="flex items-start justify-between px-6 pt-6 pb-1.5">
              <div>
                <h2 className="text-[16px] font-medium leading-4 tracking-[-0.31px] text-[#101828]" style={{ fontFamily: 'Inter,sans-serif' }}>
                  Accounts
                </h2>
                <p className="mt-1 text-[16px] leading-6 tracking-[-0.31px] text-[#4a5565]" style={{ fontFamily: 'Inter,sans-serif' }}>
                  All linked accounts and balances
                </p>
              </div>
              {!loading && accounts.length > 0 && (
                <div className="shrink-0 text-right">
                  <p className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>Net Worth</p>
                  <p className="font-semibold text-[16px] text-[#101828]" style={{ fontFamily: 'Inter,sans-serif' }}>
                    {formatCurrency(totalCurrent)}
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 pb-6">
              {loading ? (
                <p className="text-[14px] text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>Loading accounts…</p>
              ) : accounts.length === 0 ? (
                <p className="text-[14px] text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>
                  No accounts found. Link an account from the Dashboard to get started.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {groups.map(([label, items]) => (
                    <div key={label} className="flex flex-col gap-2">
                      <div className="border-b border-[#d1d5dc] pb-1 pt-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[14px] font-bold uppercase leading-5 tracking-[0.2px] text-[#101828]" style={{ fontFamily: 'Inter,sans-serif' }}>
                            {label}
                          </p>
                          <span className="rounded-[8px] border border-black/10 px-2 py-0.5 text-[12px] font-medium leading-4 text-[#0a0a0a]" style={{ fontFamily: 'Inter,sans-serif' }}>
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
