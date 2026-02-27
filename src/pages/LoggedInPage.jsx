import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlaidLink } from 'react-plaid-link'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import { AppHeader } from '../components/AppHeader'

function HamburgerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function RefreshCwIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
    </svg>
  )
}

function Trash2Icon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

function AlertCircleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  )
}

function Building2Icon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
    </svg>
  )
}

function CreditCardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="22" height="16" x="1" y="4" rx="2" ry="2" />
      <path d="M1 10h22" />
    </svg>
  )
}

function LandmarkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 21h18" />
      <path d="M3 10h18" />
      <path d="M5 6l7-3 7 3" />
      <path d="M4 10v11" />
      <path d="M20 10v11" />
      <path d="M8 14v3" />
      <path d="M12 14v3" />
      <path d="M16 14v3" />
    </svg>
  )
}

function TrendingUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m22 7-8.5 8.5-5-5L2 17" />
      <path d="M16 7h6v6" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  )
}

const CATEGORY_CONFIG = {
  Credit: { icon: CreditCardIcon, color: 'text-purple-600' },
  Deposits: { icon: LandmarkIcon, color: 'text-green-600' },
  Investments: { icon: TrendingUpIcon, color: 'text-blue-600' },
  Other: { icon: FolderIcon, color: 'text-amber-600' },
}

function SectionHeader({ category, count }) {
  const { icon: Icon, color } = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.Other
  return (
    <div className="flex h-8 items-center justify-between border-b border-black/10">
      <div className="flex items-center gap-2">
        <span className={`flex size-4 shrink-0 items-center justify-center ${color}`}><Icon /></span>
        <span className="font-semibold text-[14px] leading-5 tracking-[-0.15px] text-[#0a0a0a]" style={{ fontFamily: 'Inter,sans-serif' }}>
          {category}
        </span>
      </div>
      <span className="rounded-[8px] border border-black/10 px-2 py-0.5 text-[12px] font-medium leading-4 text-[#0a0a0a]" style={{ fontFamily: 'Inter,sans-serif' }}>
        {count}
      </span>
    </div>
  )
}

/** Format an ISO date as "X ago" for last sync display. Accepts ISO string or null; or a pre-formatted string (for placeholder). */
function formatLastSynced(value) {
  if (value == null || value === '') return 'Never'
  if (typeof value === 'string' && !value.includes('T')) return value // already "2 hours ago" etc.
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never'
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  return date.toLocaleDateString()
}

/** Format balance for display; null/undefined -> "—" */
function formatBalance(value) {
  if (value == null || typeof value !== 'number') return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

/** Build account summary from API accounts array; also returns primary type for grouping */
function getAccountSummary(accounts) {
  if (!accounts?.length) return { summary: 'No accounts', balanceText: null, primaryType: 'other' }
  const types = [...new Set(accounts.map((a) => (a.type || 'other').toLowerCase()))]
  // Priority order for mixed-type connections: Credit > Deposits > Investments > Other
  const primaryType = types.includes('credit') || types.includes('loan')
    ? 'credit'
    : types.includes('depository')
      ? 'depository'
      : types.includes('investment')
        ? 'investment'
        : 'other'
  const summary = accounts.length === 1
    ? `${accounts[0].type || 'Account'} • 1 account`
    : `${accounts.length} accounts`
  const parts = accounts.map((a) => {
    const name = a.name || a.subtype || a.type || 'Account'
    const bal = formatBalance(a.current ?? a.available)
    return `${name} ${bal}`
  })
  const balanceText = parts.join(' • ')
  return { summary, balanceText, primaryType }
}

/** Design’s 4 categories; map Plaid account types onto these for automatic grouping */
const CONNECTION_CATEGORIES = ['Credit', 'Deposits', 'Investments', 'Other']

/** Plaid account types that belong to each design category */
const CATEGORY_PLAID_TYPES = {
  Credit: ['credit', 'loan'],
  Deposits: ['depository'],
  Investments: ['investment'],
  Other: ['other'],
}

/** Group connections by the 4 design categories; split by account type and by account — each account appears as its own row in the matching category. */
function groupConnectionsByCategory(connections) {
  const groups = Object.fromEntries(CONNECTION_CATEGORIES.map((c) => [c, []]))
  connections.forEach((conn) => {
    const accounts = conn.accounts ?? []
    CONNECTION_CATEGORIES.forEach((category) => {
      const types = CATEGORY_PLAID_TYPES[category] || ['other']
      accounts
        .filter((a) => types.includes((a.type || 'other').toLowerCase()))
        .forEach((account) => {
          groups[category].push({ connection: conn, accounts: [account] })
        })
    })
  })
  return groups
}

function toDateKey(raw) {
  if (!raw) return ''
  const s = String(raw)
  return s.length >= 10 ? s.slice(0, 10) : s
}

function formatTransactionDate(dateStr) {
  const key = toDateKey(dateStr)
  const d = new Date(key + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return String(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()
}

function groupTransactionsByDate(transactions) {
  const groups = []
  let current = null
  for (const t of transactions) {
    const key = toDateKey(t.date)
    if (!current || current.date !== key) {
      current = { date: key, label: formatTransactionDate(key), items: [] }
      groups.push(current)
    }
    current.items.push(t)
  }
  return groups
}

function TransactionRow({ transaction }) {
  const amt = Number(transaction.amount)
  const isCredit = amt < 0
  const displayAmt = isCredit
    ? `+$${Math.abs(amt).toFixed(2)}`
    : `-$${Math.abs(amt).toFixed(2)}`
  const amtColor = isCredit ? 'text-[#155dfc]' : 'text-[#f54900]'

  return (
    <div className="flex h-[62px] items-center justify-between rounded-[10px] px-2">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[14px] leading-5 tracking-[-0.15px] text-[#101828]" style={{ fontFamily: 'Inter,sans-serif' }}>
          {transaction.name}
        </p>
        {transaction.account_name && (
          <span
            className="mt-1 inline-block rounded-[8px] border border-[#d1d5dc] bg-[#f9fafb] px-2 py-[3px] text-[12px] font-medium leading-4 text-[#4a5565]"
            style={{ fontFamily: 'Inter,sans-serif' }}
          >
            {transaction.account_name}
          </span>
        )}
      </div>
      <span className={`shrink-0 text-right font-semibold text-[14px] leading-5 tracking-[-0.15px] ${amtColor}`} style={{ fontFamily: 'Inter,sans-serif' }}>
        {displayAmt}
      </span>
    </div>
  )
}

export function TransactionList({ transactions, loading, title, subtitle, headerRight }) {
  const groups = groupTransactionsByDate(transactions)
  return (
    <div className="rounded-[14px] border border-[#e5e7eb] bg-white">
      <div className="flex items-start justify-between px-6 pt-6 pb-1.5">
        <div>
          <h2 className="text-[16px] font-medium leading-4 tracking-[-0.31px] text-[#101828]" style={{ fontFamily: 'Inter,sans-serif' }}>
            {title ?? 'Recent Transactions'}
          </h2>
          <p className="mt-1 text-[16px] leading-6 tracking-[-0.31px] text-[#4a5565]" style={{ fontFamily: 'Inter,sans-serif' }}>
            {subtitle ?? 'Latest activity across all accounts'}
          </p>
        </div>
        {headerRight}
      </div>
      <div className="px-6 pb-6">
        {loading ? (
          <p className="text-[14px] text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>Loading transactions…</p>
        ) : transactions.length === 0 ? (
          <p className="text-[14px] text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>
            No transactions yet. Link an account to see activity.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((group) => (
              <div key={group.date} className="flex flex-col gap-1">
                <div className="border-b border-[#d1d5dc] pb-1 pt-2">
                  <p className="text-[14px] font-bold uppercase leading-5 tracking-[0.2px] text-[#101828]" style={{ fontFamily: 'Inter,sans-serif' }}>
                    {group.label}
                  </p>
                </div>
                {group.items.map((t) => (
                  <TransactionRow key={t.plaid_transaction_id ?? t.id} transaction={t} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ConnectionRow({ connection, accounts, onRefresh, onRemove, onReconnect }) {
  const isError = connection.status === 'error'
  const needsReconnect = isError && connection.error_code === 'ITEM_LOGIN_REQUIRED'
  const { summary, balanceText } = getAccountSummary(accounts ?? connection.accounts)
  const displayName = connection.institution_name ?? connection.name ?? 'Unknown'
  return (
    <div className="flex min-h-[80px] items-center justify-between rounded-[10px] border border-black/10 px-[13px] py-0.5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#dbeafe] text-[#1e40af]">
          <Building2Icon />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-[14px] leading-5 tracking-[-0.15px] text-[#0a0a0a]" style={{ fontFamily: 'Inter,sans-serif' }}>
              {displayName}
            </h4>
            <span
              className={`inline-flex items-center gap-1 rounded-[8px] border px-2 py-0.5 text-[12px] font-medium leading-4 ${
                isError
                  ? 'border-[#ffc9c9] bg-[#fef2f2] text-[#c10007]'
                  : 'border-[#b9f8cf] bg-[#f0fdf4] text-[#008236]'
              }`}
              style={{ fontFamily: 'Inter,sans-serif' }}
            >
              {isError && <AlertCircleIcon />}
              {isError ? 'Error' : 'Connected'}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] leading-4 text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>
            {summary}
          </p>
          {balanceText && (
            <p className="text-[12px] font-medium leading-4 text-[#0a0a0a]" style={{ fontFamily: 'Inter,sans-serif' }}>
              Balance: {balanceText}
            </p>
          )}
          <p className="text-[12px] leading-4 text-[#99a1af]" style={{ fontFamily: 'Inter,sans-serif' }}>
            Last synced {formatLastSynced(connection.last_synced_at ?? connection.lastSynced)}
          </p>
          {needsReconnect && (
            <button
              type="button"
              onClick={() => onReconnect?.(connection)}
              className="mt-1 rounded-md bg-[#FF3B30] px-2.5 py-1 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ fontFamily: 'Inter,sans-serif' }}
            >
              Reconnect
            </button>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => onRefresh?.(connection)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-white text-[#1e1e1e] hover:bg-black/5"
          aria-label="Refresh connection"
        >
          <RefreshCwIcon />
        </button>
        <button
          type="button"
          onClick={() => onRemove?.(connection)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-white text-[#1e1e1e] hover:bg-red-50 hover:text-red-600"
          aria-label="Remove connection"
        >
          <Trash2Icon />
        </button>
      </div>
    </div>
  )
}

export function LoggedInPage() {
  const navigate = useNavigate()
  const { getIdToken } = useAuth()
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState([])
  const [txnLoading, setTxnLoading] = useState(true)
  const [linkToken, setLinkToken] = useState(null)
  const [linkMode, setLinkMode] = useState('add')
  const [addError, setAddError] = useState(null)
  const [exchanging, setExchanging] = useState(false)
  const openedRef = useRef(false)

  const fetchConnections = useCallback(async () => {
    try {
      const data = await apiFetch('/api/plaid/connections', { getToken: getIdToken })
      setConnections(data.connections ?? [])
    } catch (err) {
      console.error('Failed to load connections:', err)
      setConnections([])
    } finally {
      setLoading(false)
    }
  }, [getIdToken])

  const fetchTransactions = useCallback(async () => {
    try {
      const data = await apiFetch('/api/plaid/transactions?limit=25', { getToken: getIdToken })
      setTransactions(data.transactions ?? [])
    } catch (err) {
      console.error('Failed to load transactions:', err)
      setTransactions([])
    } finally {
      setTxnLoading(false)
    }
  }, [getIdToken])

  useEffect(() => {
    fetchConnections()
    fetchTransactions()
  }, [fetchConnections, fetchTransactions])

  const { open: openPlaidLink, ready: plaidReady } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token, metadata) => {
      setAddError(null)
      setExchanging(true)
      try {
        if (linkMode === 'add') {
          await apiFetch('/api/plaid/exchange-token', {
            method: 'POST',
            body: { public_token, institution_name: metadata?.institution?.name ?? null },
            getToken: getIdToken,
          })
        }
        await Promise.all([fetchConnections(), fetchTransactions()])
        setLinkToken(null)
        setLinkMode('add')
        openedRef.current = false
      } catch (err) {
        setAddError(err.message ?? 'Failed to add connection')
      } finally {
        setExchanging(false)
      }
    },
    onExit: () => {
      setLinkToken(null)
      setLinkMode('add')
      setAddError(null)
      openedRef.current = false
    },
  })

  useEffect(() => {
    if (linkToken && plaidReady && !openedRef.current) {
      openedRef.current = true
      openPlaidLink()
    }
  }, [linkToken, plaidReady, openPlaidLink])

  async function handleAddConnection() {
    setAddError(null)
    try {
      const data = await apiFetch('/api/plaid/link-token', { method: 'POST', getToken: getIdToken })
      if (data.link_token) setLinkToken(data.link_token)
      else setAddError('Could not start connection')
    } catch (err) {
      setAddError(err.message ?? 'Could not start connection')
    }
  }

  async function handleDisconnect(connection) {
    if (!window.confirm(`Disconnect ${connection.institution_name ?? 'this connection'}? This will remove all linked accounts.`)) return
    try {
      await apiFetch('/api/plaid/disconnect', {
        method: 'POST',
        body: { item_id: connection.item_id },
        getToken: getIdToken,
      })
      await Promise.all([fetchConnections(), fetchTransactions()])
    } catch (err) {
      setAddError(err.message ?? 'Failed to disconnect')
    }
  }

  async function handleRefresh(connection) {
    setAddError(null)
    try {
      await apiFetch('/api/plaid/refresh', {
        method: 'POST',
        body: { item_id: connection.item_id },
        getToken: getIdToken,
      })
      await Promise.all([fetchConnections(), fetchTransactions()])
    } catch (err) {
      if (err.message === 'Login required') {
        setAddError(`${connection.institution_name ?? 'Connection'} requires re-login. Click "Reconnect" to fix.`)
        await fetchConnections()
      } else {
        setAddError(err.message ?? 'Failed to refresh')
      }
    }
  }

  async function handleReconnect(connection) {
    setAddError(null)
    try {
      const data = await apiFetch('/api/plaid/link-token/update', {
        method: 'POST',
        body: { item_id: connection.item_id },
        getToken: getIdToken,
      })
      if (data.link_token) {
        setLinkMode('reconnect')
        setLinkToken(data.link_token)
      } else {
        setAddError('Could not start reconnection')
      }
    } catch (err) {
      setAddError(err.message ?? 'Could not start reconnection')
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f8f8]" data-name="Logged-In Dashboard">
      <AppHeader />

      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1140px] flex-col gap-6 lg:flex-row lg:items-start">
          {/* Left column — Plaid Connections */}
          <div className="w-full max-w-[550px] shrink-0 rounded-[14px] border border-black/10 bg-white">
          <div className="flex flex-col gap-1 px-6 pt-6 pb-1.5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-[16px] font-medium leading-4 tracking-[-0.31px] text-[#0a0a0a]" style={{ fontFamily: 'Inter,sans-serif' }}>
                Plaid Connections
              </h2>
              <p className="mt-1 text-[16px] leading-6 tracking-[-0.31px] text-[#717182]" style={{ fontFamily: 'Inter,sans-serif' }}>
                Manage your linked financial institutions
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddConnection}
              disabled={exchanging}
              className="mt-4 flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#030213] px-2.5 py-2 text-[14px] font-medium leading-5 tracking-[-0.15px] text-white transition-opacity hover:opacity-90 disabled:opacity-60 sm:mt-0"
              style={{ fontFamily: 'Inter,sans-serif' }}
            >
              <PlusIcon />
              {exchanging ? 'Connecting…' : 'Add Connection'}
            </button>
          </div>
          {addError && (
            <p className="px-6 pb-4 text-[14px] text-red-600" style={{ fontFamily: 'Inter,sans-serif' }}>
              {addError}
            </p>
          )}

          <div className="px-6 pb-6">
            {loading ? (
              <p className="text-[14px] text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>Loading connections…</p>
            ) : connections.length === 0 ? (
              <p className="text-[14px] text-[#6a7282]" style={{ fontFamily: 'Inter,sans-serif' }}>
                No connections yet. Click “Add Connection” to link a bank account.
              </p>
            ) : (
              <div className="flex flex-col gap-6">
                {Object.entries(groupConnectionsByCategory(connections)).map(([category, items]) => {
                  if (items.length === 0) return null
                  return (
                    <div key={category} className="flex flex-col gap-3">
                      <SectionHeader category={category} count={items.length} />
                      <div className="flex flex-col gap-2">
                        {items.map(({ connection: conn, accounts: accountsForCategory }, index) => {
                          const singleAccount = accountsForCategory[0]
                          return (
                            <ConnectionRow
                              key={`${conn.id}-${category}-${singleAccount?.account_id ?? index}`}
                              connection={conn}
                              accounts={accountsForCategory}
                              onRefresh={handleRefresh}
                              onRemove={handleDisconnect}
                              onReconnect={handleReconnect}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          </div>

          {/* Right column — Recent Transactions */}
          <div className="w-full max-w-[550px] shrink-0">
            <TransactionList
              transactions={transactions}
              loading={txnLoading}
              headerRight={
                <button
                  type="button"
                  onClick={() => navigate('/app/transactions')}
                  className="shrink-0 rounded-lg border border-black/10 px-3 py-1.5 text-[13px] font-medium text-[#101828] transition-colors hover:bg-black/5"
                  style={{ fontFamily: 'Inter,sans-serif' }}
                >
                  View All
                </button>
              }
            />
          </div>
        </div>
      </main>
    </div>
  )
}
