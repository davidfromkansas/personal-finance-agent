import { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePlaidLink } from 'react-plaid-link'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import { AppHeader } from '../components/AppHeader'
import { SpendingCharts } from '../components/SpendingCharts'
import { NetWorthChart } from '../components/NetWorthChart'
import { InvestmentPortfolio } from '../components/InvestmentPortfolio'
import { UpcomingPayments } from '../components/UpcomingPayments'
import { CashFlowChart } from '../components/CashFlowChart'

/**
 * Renders nothing — exists solely to own a fresh usePlaidLink instance.
 * Unmounting this component cleanly destroys the Plaid Link iframe.
 * Accepts receivedRedirectUri for completing OAuth flows.
 */
const PlaidLinkOpener = memo(function PlaidLinkOpener({ token, receivedRedirectUri, onSuccess, onExit, onReady }) {
  const config = {
    token,
    onSuccess,
    onExit: (err, metadata) => {
      if (err) console.error('[PlaidLink] exit error:', err, metadata)
      onExit?.(err, metadata)
    },
    onEvent: (eventName, metadata) => {
      console.log('[PlaidLink] event:', eventName, metadata)
    },
  }
  if (receivedRedirectUri) config.receivedRedirectUri = receivedRedirectUri

  const { open, ready } = usePlaidLink(config)

  useEffect(() => {
    if (ready) {
      onReady?.()
      open()
    }
  }, [ready, open, onReady])

  return null
})

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
        <span className="font-semibold text-[14px] leading-5 tracking-[-0.15px] text-[#0a0a0a]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
          {category}
        </span>
      </div>
      <span className="rounded-[8px] border border-black/10 px-2 py-0.5 text-[12px] font-medium leading-4 text-[#0a0a0a]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
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
    if (accounts.length === 0) {
      groups['Other'].push({ connection: conn, accounts: [] })
      return
    }
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
    const reportedDate = t.authorized_date || t.date
    const key = toDateKey(reportedDate)
    if (!current || current.date !== key) {
      current = { date: key, label: formatTransactionDate(key), items: [] }
      groups.push(current)
    }
    current.items.push(t)
  }
  return groups
}

const TRANSACTION_DATE_HEADER_HEIGHT_PX = 26
const TRANSACTION_ROW_HEIGHT_PX = 32
/** Max height for the list area so it fits in the 826px module (header + pagination ~104px). */
const TRANSACTION_MAX_LIST_HEIGHT_PX = 722
/** gap-0.5 between date groups in the list */
const TRANSACTION_GROUP_GAP_PX = 2
/** Conservative buffer so the last row never clips (browsers/layout can vary). */
const TRANSACTION_FIT_BUFFER_PX = 20

function getTransactionsThatFit(transactions, startIndex) {
  if (startIndex >= transactions.length) return []
  const maxHeight = TRANSACTION_MAX_LIST_HEIGHT_PX - TRANSACTION_FIT_BUFFER_PX
  let groups = 0
  let count = 0
  let lastDate = null
  for (let i = startIndex; i < transactions.length; i++) {
    const t = transactions[i]
    const key = toDateKey(t.authorized_date || t.date)
    if (lastDate !== key) {
      groups++
      lastDate = key
    }
    const gapTotal = groups > 1 ? (groups - 1) * TRANSACTION_GROUP_GAP_PX : 0
    const height =
      groups * TRANSACTION_DATE_HEADER_HEIGHT_PX +
      (count + 1) * TRANSACTION_ROW_HEIGHT_PX +
      gapTotal
    if (height > maxHeight && count > 0) break
    count++
  }
  return transactions.slice(startIndex, startIndex + count)
}

function formatCategory(raw) {
  if (!raw) return null
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function bestLogoUrl(t) {
  if (t.logo_url) return t.logo_url
  const website = t.website ?? t.counterparties?.[0]?.website ?? null
  if (!website) return null
  const domain = website.replace(/^https?:\/\//, '').split('/')[0]
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
}

function formatPaymentChannel(raw) {
  if (!raw) return null
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function TransactionDetailPanel({ transaction, onClose }) {
  const open = !!transaction
  const t = transaction ?? {}
  const amt = Number(t.amount)
  const isCredit = amt < 0
  const displayAmt = isCredit
    ? `+$${Math.abs(amt).toFixed(2)}`
    : `-$${Math.abs(amt).toFixed(2)}`
  const amtColor = isCredit ? 'text-[#155dfc]' : 'text-[#f54900]'

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-1/3 flex-col border-l border-[#d9d9d9] bg-white shadow-xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#d9d9d9] px-5 py-4">
          <span className="text-[16px] font-normal text-[#1e1e1e]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            Transaction
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[#999] hover:text-[#1e1e1e] transition-colors text-xl leading-none cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
          {/* Logo + name + amount */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {bestLogoUrl(t) ? (
                <img src={bestLogoUrl(t)} alt="" className="h-10 w-10 shrink-0 rounded-full border border-[#e5e7eb] object-contain"
                  onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                />
              ) : null}
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-[#f9fafb] text-[14px] font-bold text-[#4a5565]"
                style={{ fontFamily: 'JetBrains Mono,monospace', display: bestLogoUrl(t) ? 'none' : 'flex' }}
              >
                {(t.name ?? '?')[0].toUpperCase()}
              </div>
              <p className="text-[16px] font-semibold text-[#101828] leading-tight" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                {t.name}
              </p>
            </div>
            <span className={`shrink-0 text-[22px] font-bold leading-tight ${amtColor}`} style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              {displayAmt}
            </span>
          </div>

          <div className="border-t border-[#e5e7eb]" />

          {/* Fields */}
          <div className="space-y-4">
            {[
              { label: 'Status', value: t.pending ? 'Pending' : 'Posted' },
              { label: 'Category', value: formatCategory(t.personal_finance_category) },
              { label: 'Detailed Category', value: formatCategory(t.personal_finance_category_detailed) },
              { label: 'Category Confidence', value: t.personal_finance_category_confidence ? t.personal_finance_category_confidence.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) : null },
              { label: 'Payment Method', value: formatPaymentChannel(t.payment_channel) },
              { label: 'Account', value: t.account_name },
              {
                label: 'Transaction Date',
                value: t.authorized_date
                  ? new Date(String(t.authorized_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                  : null,
              },
              {
                label: 'Post Date',
                value: t.date
                  ? new Date(String(t.date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                  : null,
              },
              { label: 'Merchant', value: t.merchant_name ?? null },
              { label: 'Check #', value: t.check_number ?? null },
              { label: 'Original Description', value: t.original_description ?? null },
            ]
              .map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-4">
                  <span className="shrink-0 text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    {label}
                  </span>
                  <span className={`text-right text-[14px] ${value ? 'text-[#101828]' : 'text-[#bbb]'}`} style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    {value ?? '—'}
                  </span>
                </div>
              ))}

            {/* Website */}
            <div className="flex items-start justify-between gap-4">
              <span className="shrink-0 text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Website</span>
              {t.website ? (
                <a
                  href={t.website.startsWith('http') ? t.website : `https://${t.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-right text-[14px] text-[#0066CC] underline"
                  style={{ fontFamily: 'JetBrains Mono,monospace' }}
                >
                  {t.website.replace(/^https?:\/\//, '')} ↗
                </a>
              ) : (
                <span className="text-right text-[14px] text-[#bbb]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>—</span>
              )}
            </div>
          </div>

          {/* Counterparties */}
          {t.counterparties?.length > 0 && (
            <div className="border-t border-[#e5e7eb] pt-4 space-y-3">
              <p className="text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Counterparties</p>
              {t.counterparties.map((cp, i) => (
                <div key={i} className="flex items-center gap-3">
                  {(() => {
                    const cpLogo = cp.logo_url ?? (cp.website ? `https://www.google.com/s2/favicons?domain=${cp.website.replace(/^https?:\/\//, '').split('/')[0]}&sz=64` : null)
                    return cpLogo ? (
                      <img src={cpLogo} alt="" className="h-7 w-7 shrink-0 rounded-full border border-[#e5e7eb] object-contain bg-white"
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    ) : (
                      <div className="h-7 w-7 shrink-0 rounded-full border border-[#e5e7eb] bg-[#f9fafb]" />
                    )
                  })()}
                  <div className="min-w-0">
                    <p className="text-[14px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{cp.name}</p>
                    <p className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                      {cp.type?.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())}
                      {cp.confidence_level ? ` · ${cp.confidence_level.toLowerCase()}` : ''}
                    </p>
                    {cp.website && (
                      <a href={cp.website.startsWith('http') ? cp.website : `https://${cp.website}`} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[#0066CC] underline" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                        {cp.website.replace(/^https?:\/\//, '')} ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Payment Details (payment_meta) */}
          {t.payment_meta && (() => {
            const pm = t.payment_meta
            const rows = [
              { label: 'Reference #', value: pm.reference_number },
              { label: 'PPD ID', value: pm.ppd_id },
              { label: 'Processor', value: pm.payment_processor },
              { label: 'Payer', value: pm.payer },
              { label: 'Payee', value: pm.payee },
              { label: 'Reason', value: pm.reason },
              { label: 'By Order Of', value: pm.by_order_of },
            ].filter(r => r.value)
            if (!rows.length) return null
            return (
              <div className="border-t border-[#e5e7eb] pt-4 space-y-3">
                <p className="text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Payment Details</p>
                {rows.map(({ label, value }) => (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <span className="shrink-0 text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{label}</span>
                    <span className="text-right text-[14px] text-[#101828] break-all" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{value}</span>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Location */}
          {t.location && Object.values(t.location).some(Boolean) && (
            <div className="border-t border-[#e5e7eb] pt-4 space-y-1">
              <p className="text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Location</p>
              {t.location.address && (
                <p className="text-[14px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{t.location.address}</p>
              )}
              {(t.location.city || t.location.region || t.location.postal_code) && (
                <p className="text-[14px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  {[t.location.city, t.location.region, t.location.postal_code].filter(Boolean).join(', ')}
                </p>
              )}
              {t.location.country && (
                <p className="text-[14px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{t.location.country}</p>
              )}
              {t.location.store_number && (
                <p className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Store #{t.location.store_number}</p>
              )}
              {t.location.lat != null && t.location.lon != null && (
                <a
                  href={`https://www.google.com/maps?q=${t.location.lat},${t.location.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] text-[#0066CC] underline"
                  style={{ fontFamily: 'JetBrains Mono,monospace' }}
                >
                  {t.location.lat.toFixed(5)}, {t.location.lon.toFixed(5)} ↗
                </a>
              )}
            </div>
          )}

          {/* Transaction ID */}
          {t.plaid_transaction_id && (
            <div className="border-t border-[#e5e7eb] pt-4">
              <p className="text-[11px] text-[#bbb] break-all" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                {t.plaid_transaction_id}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function TransactionRow({ transaction, onClick }) {
  const amt = Number(transaction.amount)
  const isCredit = amt < 0
  const displayAmt = isCredit
    ? `+$${Math.abs(amt).toFixed(2)}`
    : `-$${Math.abs(amt).toFixed(2)}`
  const amtColor = isCredit ? 'text-[#155dfc]' : 'text-[#f54900]'

  return (
    <div
      className="flex h-[32px] shrink-0 items-center justify-between gap-2 rounded-[8px] px-1 py-0 cursor-pointer hover:bg-[#f5f5f5] transition-colors"
      onClick={() => onClick?.(transaction)}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {(() => {
          const logo = bestLogoUrl(transaction)
          const initial = (transaction.name ?? '?')[0].toUpperCase()
          if (logo) return (
            <div className="relative h-5 w-5 shrink-0">
              <img src={logo} alt="" className="h-5 w-5 rounded-full border border-[#e5e7eb] object-contain bg-white"
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
              />
              <div className="absolute inset-0 hidden items-center justify-center rounded-full border border-[#e5e7eb] bg-[#f9fafb] text-[8px] font-bold text-[#4a5565]"
                style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
            </div>
          )
          return (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-[#f9fafb] text-[8px] font-bold text-[#4a5565]"
              style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
          )
        })()}
        <p
          className="shrink-0 font-medium text-[14px] leading-5 tracking-[-0.1px] text-[#101828]"
          style={{ fontFamily: 'JetBrains Mono,monospace' }}
        >
          {transaction.name}
        </p>
        {transaction.account_name && (
          <span
            className="min-w-0 shrink truncate inline-block max-w-full rounded-[6px] border border-[#d1d5dc] bg-[#f9fafb] px-1.5 py-[2px] text-[11px] font-medium leading-4 text-[#4a5565]"
            style={{ fontFamily: 'JetBrains Mono,monospace' }}
            title={transaction.account_name}
          >
            {transaction.account_name}
          </span>
        )}
        {transaction.pending && (
          <span
            className="shrink-0 inline-block rounded-[6px] border border-[#f59e0b] bg-[#fffbeb] px-1.5 py-[2px] text-[11px] font-medium leading-4 text-[#b45309]"
            style={{ fontFamily: 'JetBrains Mono,monospace' }}
            title="Not yet settled"
          >
            Pending
          </span>
        )}
      </div>
      <span className={`shrink-0 text-right font-bold text-[14px] leading-5 tracking-[-0.05px] ${amtColor}`} style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        {displayAmt}
      </span>
    </div>
  )
}

export function TransactionList({ transactions, loading, title, subtitle, headerRight, canGoNewer, canGoOlder, onLoadNewer, onLoadOlder }) {
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const groups = groupTransactionsByDate(transactions)
  const showPagination = [onLoadNewer, onLoadOlder].some(Boolean)
  const contentHeightPx =
    transactions.length > 0
      ? groups.length * TRANSACTION_DATE_HEADER_HEIGHT_PX +
        transactions.length * TRANSACTION_ROW_HEIGHT_PX +
        (groups.length > 1 ? (groups.length - 1) * TRANSACTION_GROUP_GAP_PX : 0)
      : undefined
  return (
    <>
    <TransactionDetailPanel transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} />
    <div className="flex h-full flex-col rounded-[14px] border border-[#e5e7eb] bg-white">
      <div className="shrink-0 flex items-center justify-between border-b border-[#e5e7eb] px-5 py-3">
        <div>
          <h2 className="text-[18px] font-semibold leading-5 tracking-[-0.31px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            {title ?? 'Recent Transactions'}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-[16px] leading-6 tracking-[-0.31px] text-[#4a5565]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {headerRight}
      </div>
      <div
        className="flex-1 overflow-hidden px-4 pb-4"
        style={{ height: contentHeightPx }}
      >
        {loading ? (
          <p className="text-[14px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading transactions…</p>
        ) : transactions.length === 0 ? (
          <p className="text-[14px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            No transactions yet. Link an account to see activity.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {groups.map((group) => (
              <div key={group.date} className="flex flex-col gap-0">
                <div className="flex h-[26px] shrink-0 items-center border-b border-[#d1d5dc] pb-0 pt-1">
                  <p className="text-[12px] font-extrabold uppercase leading-5 tracking-[0.3px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    {group.label}
                  </p>
                </div>
                {group.items.map((t) => (
                  <TransactionRow key={t.plaid_transaction_id ?? t.id} transaction={t} onClick={setSelectedTransaction} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      {showPagination && (
        <div className="shrink-0 flex items-center justify-center gap-2 border-t border-[#e5e7eb] px-4 py-3">
          <button
            type="button"
            onClick={onLoadNewer}
            disabled={!canGoNewer || loading}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d1d5dc] bg-white text-[#4a5565] transition-colors hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ fontFamily: 'JetBrains Mono,monospace' }}
            title="More recent"
            aria-label="More recent transactions"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onLoadOlder}
            disabled={!canGoOlder || loading}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d1d5dc] bg-white text-[#4a5565] transition-colors hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ fontFamily: 'JetBrains Mono,monospace' }}
            title="Older"
            aria-label="Older transactions"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      )}
    </div>
    </>
  )
}

function ConnectionRow({ connection, accounts, onRefresh, onRemove, onReconnect }) {
  const isError = connection.status === 'error'
  const needsReconnect = isError && connection.error_code === 'ITEM_LOGIN_REQUIRED'
  const { balanceText } = getAccountSummary(accounts ?? connection.accounts)
  const displayName = connection.institution_name ?? connection.name ?? 'Unknown'
  return (
    <div className="flex min-h-[80px] items-center justify-between rounded-[10px] border border-black/10 px-[13px] py-0.5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] ${connection.institution_logo ? 'bg-[#f3f4f6]' : 'bg-[#dbeafe] text-[#1e40af]'}`}>
          {connection.institution_logo ? (
            <img
              src={connection.institution_logo}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <Building2Icon />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-[14px] leading-5 tracking-[-0.15px] text-[#0a0a0a]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              {displayName}
            </h4>
            <span
              className={`inline-flex items-center gap-1 rounded-[8px] border px-2 py-0.5 text-[12px] font-medium leading-4 ${
                isError
                  ? 'border-[#ffc9c9] bg-[#fef2f2] text-[#c10007]'
                  : 'border-[#b9f8cf] bg-[#f0fdf4] text-[#008236]'
              }`}
              style={{ fontFamily: 'JetBrains Mono,monospace' }}
            >
              {isError && <AlertCircleIcon />}
              {isError ? 'Error' : 'Connected'}
            </span>
          </div>
          {balanceText && (
            <p className="text-[12px] font-medium leading-4 text-[#0a0a0a]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              Balance: {balanceText}
            </p>
          )}
          <p className="text-[12px] leading-4 text-[#99a1af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            Last synced {formatLastSynced(connection.last_synced_at ?? connection.lastSynced)}
          </p>
          {needsReconnect && (
            <button
              type="button"
              onClick={() => onReconnect?.(connection)}
              className="mt-1 rounded-md bg-[#FF3B30] px-2.5 py-1 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ fontFamily: 'JetBrains Mono,monospace' }}
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState([])
  const [txnStartIndex, setTxnStartIndex] = useState(0)
  const [txnPageStarts, setTxnPageStarts] = useState([0])
  const [txnLoading, setTxnLoading] = useState(true)
  const [hasMoreOlderOnServer, setHasMoreOlderOnServer] = useState(false)
  const [linkToken, setLinkToken] = useState(null)
  const [linkMode, setLinkMode] = useState('add')
  const [addError, setAddError] = useState(null)
  const [exchanging, setExchanging] = useState(false)
  const [linkLoading, setLinkLoading] = useState(false)
  const [showConnectionTypeModal, setShowConnectionTypeModal] = useState(false)
  const [oauthRedirectUri, setOauthRedirectUri] = useState(null)
  const spendingRef = useRef(null)
  const cashFlowRef = useRef(null)
  const netWorthRef = useRef(null)
  const [recurringRefreshTrigger, setRecurringRefreshTrigger] = useState(0)
  const investmentRef = useRef(null)

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
      setTxnLoading(true)
      const data = await apiFetch('/api/plaid/transactions?limit=200', { getToken: getIdToken })
      const list = data.transactions ?? []
      setTransactions(list)
      setTxnStartIndex(0)
      setTxnPageStarts([0])
      setHasMoreOlderOnServer(list.length === 200)
    } catch (err) {
      console.error('Failed to load transactions:', err)
      setTransactions([])
      setTxnStartIndex(0)
      setTxnPageStarts([0])
      setHasMoreOlderOnServer(false)
    } finally {
      setTxnLoading(false)
    }
  }, [getIdToken])

  const fetchMoreOlderTransactions = useCallback(async (beforeDate) => {
    try {
      setTxnLoading(true)
      const data = await apiFetch(`/api/plaid/transactions?limit=200&before_date=${encodeURIComponent(beforeDate)}`, { getToken: getIdToken })
      const batch = data.transactions ?? []
      setTransactions((prev) => [...prev, ...batch])
      setHasMoreOlderOnServer(batch.length === 200)
    } catch (err) {
      console.error('Failed to load older transactions:', err)
      setHasMoreOlderOnServer(false)
    } finally {
      setTxnLoading(false)
    }
  }, [getIdToken])

  const displayedTransactions = useMemo(
    () => getTransactionsThatFit(transactions, txnStartIndex),
    [transactions, txnStartIndex]
  )
  const canGoNewerLocal = txnPageStarts.length > 1
  const hasNextPageLocal = txnStartIndex + displayedTransactions.length < transactions.length
  const canGoOlderLocal = hasNextPageLocal || hasMoreOlderOnServer

  const loadOlderTransactions = useCallback(() => {
    if (hasNextPageLocal) {
      const nextStart = txnStartIndex + displayedTransactions.length
      setTxnStartIndex(nextStart)
      setTxnPageStarts((prev) => [...prev, nextStart])
    } else if (hasMoreOlderOnServer && transactions.length > 0) {
      fetchMoreOlderTransactions(transactions[transactions.length - 1].authorized_date || transactions[transactions.length - 1].date)
    }
  }, [hasNextPageLocal, hasMoreOlderOnServer, transactions, txnStartIndex, displayedTransactions.length, fetchMoreOlderTransactions])

  const loadNewerTransactions = useCallback(() => {
    if (txnPageStarts.length <= 1) return
    const newStarts = txnPageStarts.slice(0, -1)
    setTxnPageStarts(newStarts)
    setTxnStartIndex(newStarts[newStarts.length - 1])
  }, [txnPageStarts])

  useEffect(() => {
    fetchConnections()
    fetchTransactions()

    const fullResync = typeof localStorage !== 'undefined' && !localStorage.getItem('plaid_logos_resynced')
    if (fullResync) localStorage.setItem('plaid_logos_resynced', '1')

    apiFetch('/api/plaid/sync', {
      method: 'POST',
      body: fullResync ? { full_resync: true } : undefined,
      getToken: getIdToken,
    })
      .then((data) => {
        if (data.synced > 0) {
          fetchConnections()
          fetchTransactions()
          spendingRef.current?.refresh()
          cashFlowRef.current?.refresh()
          netWorthRef.current?.refresh()
          investmentRef.current?.refresh()
          setRecurringRefreshTrigger((k) => k + 1)
        }
      })
      .catch((err) => console.error('Background sync failed:', err))
  }, [fetchConnections, fetchTransactions])

  useEffect(() => {
    const oauthStateId = searchParams.get('oauth_state_id')
    if (!oauthStateId) return

    const redirectUri = `${window.location.origin}${window.location.pathname}`
    setOauthRedirectUri(redirectUri)
    setLinkLoading(true)
    setSearchParams({}, { replace: true })

    apiFetch('/api/plaid/link-token', { method: 'POST', getToken: getIdToken })
      .then((data) => {
        if (data.link_token) setLinkToken(data.link_token)
        else { setAddError('Could not resume connection'); setLinkLoading(false) }
      })
      .catch((err) => {
        setAddError(err.message ?? 'Could not resume connection')
        setLinkLoading(false)
      })
  }, [])

  const handlePlaidSuccess = useCallback(
    async (public_token, metadata) => {
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
        spendingRef.current?.refresh()
        cashFlowRef.current?.refresh()
        netWorthRef.current?.refresh()
        investmentRef.current?.refresh()
      } catch (err) {
        setAddError(err.message ?? 'Failed to add connection')
      } finally {
        setLinkToken(null)
        setLinkMode('add')
        setExchanging(false)
        setOauthRedirectUri(null)
      }
    },
    [linkMode, getIdToken, fetchConnections, fetchTransactions],
  )

  const handlePlaidExit = useCallback((err, metadata) => {
    setLinkToken(null)
    setLinkMode('add')
    setLinkLoading(false)
    setOauthRedirectUri(null)
    if (err) {
      const msg = err.display_message || err.error_message || err.error_code || 'Plaid Link closed with an error'
      setAddError(`${msg} (code: ${err.error_code ?? 'unknown'}, type: ${err.error_type ?? 'unknown'})`)
    }
  }, [])

  const handlePlaidReady = useCallback(() => {
    setLinkLoading(false)
  }, [])

  async function handleAddConnection(linkModeOverride) {
    if (linkModeOverride === undefined) {
      setShowConnectionTypeModal(true)
      return
    }
    setShowConnectionTypeModal(false)
    setLinkToken(null)
    setAddError(null)
    setLinkLoading(true)
    try {
      const body = linkModeOverride === 'investments' ? { link_mode: 'investments' } : undefined
      const data = await apiFetch('/api/plaid/link-token', {
        method: 'POST',
        body,
        getToken: getIdToken,
      })
      if (data.link_token) {
        setLinkToken(data.link_token)
      } else {
        setAddError('Could not start connection')
        setLinkLoading(false)
      }
    } catch (err) {
      setAddError(err.message ?? 'Could not start connection')
      setLinkLoading(false)
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
      spendingRef.current?.refresh()
      cashFlowRef.current?.refresh()
      netWorthRef.current?.refresh()
      investmentRef.current?.refresh()
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
      spendingRef.current?.refresh()
      cashFlowRef.current?.refresh()
      netWorthRef.current?.refresh()
      investmentRef.current?.refresh()
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
      {linkToken && (
        <PlaidLinkOpener
          token={linkToken}
          receivedRedirectUri={oauthRedirectUri}
          onSuccess={handlePlaidSuccess}
          onExit={handlePlaidExit}
          onReady={handlePlaidReady}
        />
      )}

      {showConnectionTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowConnectionTypeModal(false)}>
          <div
            className="w-full max-w-md rounded-[14px] border border-[#e5e7eb] bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[18px] font-semibold tracking-tight text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              What do you want to connect?
            </h3>
            <p className="mt-1 text-[14px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              Choose the type of accounts to link. Plaid will open next.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => handleAddConnection('transactions')}
                disabled={linkLoading}
                className="flex items-center gap-4 rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-3 text-left transition-colors hover:bg-[#f9fafb] disabled:opacity-60"
                style={{ fontFamily: 'JetBrains Mono,monospace' }}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#dbeafe] text-[#1e40af]">
                  <LandmarkIcon />
                </span>
                <div>
                  <p className="font-medium text-[#101828]">Credit Cards, Checking and Savings</p>
                  <p className="text-[12px] text-[#6a7282]">Link bank and credit card accounts</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleAddConnection('investments')}
                disabled={linkLoading}
                className="flex items-center gap-4 rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-3 text-left transition-colors hover:bg-[#f9fafb] disabled:opacity-60"
                style={{ fontFamily: 'JetBrains Mono,monospace' }}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#dbeafe] text-[#1e40af]">
                  <TrendingUpIcon />
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
              style={{ fontFamily: 'JetBrains Mono,monospace' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <main className="px-4 pt-6 pb-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1280px]">
          <div className="grid grid-cols-8 gap-x-6 gap-y-4 items-start content-start">
            {/* Left 5 cols: same total height as transaction column (826px); spending = half, bottom row (3-col + recurring) = half */}
            <div className="col-span-8 min-w-0 lg:col-span-5 flex flex-col h-[826px] gap-4">
              {/* Spending: half the height of transaction module */}
              <div className="min-h-0 shrink-0 h-[404px]">
                <SpendingCharts ref={spendingRef} connections={connections} getToken={getIdToken} embeddedHeight={404} />
              </div>
              {/* Bottom row: 3-col + recurring, each half the height of transaction module (404px), 3:2 width ratio on lg */}
              <div className="flex flex-col lg:flex-row gap-6 min-h-0 shrink-0 h-[404px]">
                <div className="min-w-0 w-full lg:flex-[3] h-[404px] overflow-hidden">
                  <CashFlowChart ref={cashFlowRef} getToken={getIdToken} embeddedHeight={404} />
                </div>
                <div className="min-w-0 w-full lg:flex-[2] rounded-[14px] border border-[#e5e7eb] bg-white overflow-hidden flex flex-col h-[404px]">
                  <div className="shrink-0 border-b border-[#e5e7eb] px-5 py-3">
                    <h2 className="text-[18px] font-semibold leading-5 tracking-[-0.31px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                      Upcoming Payments
                    </h2>
                  </div>
                  <div className="min-h-0 flex-1 flex flex-col">
                    <UpcomingPayments getToken={getIdToken} refreshTrigger={recurringRefreshTrigger} />
                  </div>
                </div>
              </div>
            </div>
            {/* Transactions: 3 columns, top-aligned with left block */}
            <div className="col-span-8 flex min-w-0 h-[826px] flex-col lg:col-span-3">
              <TransactionList
                transactions={displayedTransactions}
                loading={txnLoading}
                canGoNewer={canGoNewerLocal}
                canGoOlder={canGoOlderLocal}
                onLoadNewer={loadNewerTransactions}
                onLoadOlder={loadOlderTransactions}
                headerRight={
                  <button
                    type="button"
                    onClick={() => navigate('/app/transactions')}
                    className="shrink-0 rounded-lg border border-black/10 px-3 py-1.5 text-[13px] font-medium text-[#101828] transition-colors hover:bg-black/5 cursor-pointer"
                    style={{ fontFamily: 'JetBrains Mono,monospace' }}
                  >
                    View All
                  </button>
                }
              />
            </div>
            {/* Net Worth + Connections: 4 columns — sits directly below left block (top-aligned) */}
            <div className="col-span-8 flex min-w-0 flex-col lg:col-span-4">
              <div className="rounded-[14px] border border-[#e5e7eb] bg-white overflow-hidden">
              <NetWorthChart ref={netWorthRef} getToken={getIdToken} embedded />
              <div className="border-t border-[#e5e7eb] px-6 pt-4 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-medium tracking-[-0.2px] text-[#0a0a0a]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    Connected accounts
                  </h2>
                  <p className="mt-0.5 text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                    Included in net worth above
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddConnection()}
                  disabled={exchanging || linkLoading}
                  className="shrink-0 flex h-8 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#030213] px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1a1a2e] disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ fontFamily: 'JetBrains Mono,monospace' }}
                >
                  <PlusIcon />
                  {linkLoading ? 'Opening…' : exchanging ? 'Connecting…' : 'Add Connection'}
                </button>
              </div>
              </div>
              <div className="px-6 pb-2">
              {addError && (
                <p className="pb-4 text-[14px] text-red-600" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  {addError}
                </p>
              )}

              <div className="pb-6">
                {loading ? (
                  <p className="text-[14px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading connections…</p>
                ) : connections.length === 0 ? (
                  <p className="text-[14px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
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
              </div>
            </div>

            {/* Investment Portfolio: 4 columns */}
            <div className="col-span-8 min-w-0 lg:col-span-4">
              <InvestmentPortfolio ref={investmentRef} getToken={getIdToken} />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
