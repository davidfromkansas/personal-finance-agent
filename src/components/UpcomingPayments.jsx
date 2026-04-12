import { useState } from 'react'
import { useRecurring } from '../hooks/usePlaidQueries'
import { usePlaidLinkContext } from '../context/PlaidLinkContext'

const FREQUENCY_LABELS = {
  WEEKLY: 'Every week',
  BIWEEKLY: 'Every 2 weeks',
  SEMI_MONTHLY: 'Twice a month',
  MONTHLY: 'Every month',
  QUARTERLY: 'Every quarter',
  YEARLY: 'Every year',
  ANNUALLY: 'Every year',
  UNKNOWN: 'Recurring',
}

const PAGE_SIZE = 5
const ROW_HEIGHT_PX = 60

function formatDue(predictedNextDate) {
  if (!predictedNextDate) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(predictedNextDate + 'T00:00:00')
  due.setHours(0, 0, 0, 0)
  const diffMs = due - today
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays > 0 && diffDays <= 30) return `in ${diffDays} days`
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatAmount(amount) {
  const n = Number(amount)
  if (Number.isNaN(n)) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

function PaymentRow({ payment }) {
  const rawName = payment.merchant_name || 'Unknown'
  const description = payment.description?.trim() || null
  const name = (rawName === 'Unknown' && description) ? description : (rawName || 'Unknown')
  const initial = (name.charAt(0) || '?').toUpperCase()
  const logoUrl = payment.logo_url || null
  const frequency = FREQUENCY_LABELS[payment.frequency] || payment.frequency || 'Recurring'
  const amount = payment.last_amount ?? payment.average_amount ?? 0
  const due = formatDue(payment.predicted_next_date)
  const subtitle = payment.source === 'liability' ? 'Credit card bill' : frequency

  return (
    <div className="flex h-[60px] shrink-0 items-center gap-3 py-2">
      <div
        className="flex h-9 w-9 min-h-9 min-w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e5e7eb] text-[13px] font-semibold text-[#374151]"
        style={{ fontFamily: 'JetBrains Mono,monospace' }}
        aria-hidden
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-[14px] font-medium text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            {name}
          </p>
        </div>
        <p className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
          {subtitle}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[14px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
          {formatAmount(amount)}
        </p>
        <p className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
          {due}
        </p>
      </div>
    </div>
  )
}

export function UpcomingPayments() {
  const { data, isLoading: loading } = useRecurring()
  const { openLink } = usePlaidLinkContext()
  const payments = data?.payments ?? []
  const [page, setPage] = useState(0)

  const start = page * PAGE_SIZE
  const displayedPayments = payments.slice(start, start + PAGE_SIZE)
  const canGoNewer = page > 0
  const canGoOlder = start + PAGE_SIZE < payments.length
  const showPagination = payments.length > PAGE_SIZE

  if (loading) {
    return (
      <div className="flex-1 overflow-hidden px-4 pb-4" style={{ height: PAGE_SIZE * ROW_HEIGHT_PX }}>
        <div className="flex flex-col divide-y divide-[#e5e7eb]">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className="flex h-[60px] shrink-0 items-center gap-3 py-2">
              <div className="h-9 w-9 min-h-9 min-w-9 shrink-0 animate-pulse rounded-full bg-[#e5e7eb]" />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="h-4 w-28 animate-pulse rounded bg-[#e5e7eb]" />
                <div className="h-3 w-20 animate-pulse rounded bg-[#f3f4f6]" />
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="h-4 w-16 animate-pulse rounded bg-[#e5e7eb]" />
                <div className="h-3 w-12 animate-pulse rounded bg-[#f3f4f6]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (payments.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
        <h3 className="mt-1 text-[14px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>No upcoming payments</h3>
        <p className="max-w-[240px] text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
          Connect an account to see recurring charges and credit card bills.
        </p>
        <button
          type="button"
          onClick={() => openLink()}
          className="mt-3 flex items-center gap-1.5 rounded-[8px] bg-[#111113] px-4 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-80 cursor-pointer"
          style={{ fontFamily: 'JetBrains Mono,monospace' }}
        >
          Connect Account
        </button>
      </div>
    )
  }

  return (
    <>
      <div
        className="flex-1 overflow-hidden px-4 pb-4"
        style={{ height: PAGE_SIZE * ROW_HEIGHT_PX }}
      >
        <div className="flex flex-col divide-y divide-[#e5e7eb]">
          {displayedPayments.map((p) => (
            <PaymentRow key={p.stream_id} payment={p} />
          ))}
        </div>
      </div>
      {showPagination && (
        <div className="shrink-0 flex items-center justify-center gap-2 border-t border-[#9ca3af] px-4 py-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={!canGoNewer || loading}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d1d5dc] bg-white text-[#4a5565] transition-colors hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ fontFamily: 'JetBrains Mono,monospace' }}
            title="More recent"
            aria-label="More recent"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={!canGoOlder || loading}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d1d5dc] bg-white text-[#4a5565] transition-colors hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ fontFamily: 'JetBrains Mono,monospace' }}
            title="More"
            aria-label="More"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      )}
    </>
  )
}
