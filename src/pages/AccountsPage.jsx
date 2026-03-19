import { AppHeader } from '../components/AppHeader'
import { useAccounts } from '../hooks/usePlaidQueries'

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
    <div className="min-h-screen bg-slate-900 pl-[220px]">
      <AppHeader />
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[700px]">
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
