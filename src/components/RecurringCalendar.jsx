import { useState, useMemo } from 'react'
import { useRecurring } from '../hooks/usePlaidQueries'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const FREQUENCY_LABELS = {
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Every 2 weeks',
  SEMI_MONTHLY: 'Twice a month',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
  ANNUALLY: 'Yearly',
  UNKNOWN: 'Recurring',
}

function formatCurrency(value) {
  if (value == null) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function PaymentLogo({ payment, size = 4 }) {
  const name = payment.merchant_name || payment.description || 'Payment'
  const initial = name[0].toUpperCase()
  const logo = payment.logo_url ?? (payment.website ? `https://www.google.com/s2/favicons?domain=${payment.website.replace(/^https?:\/\//, '').split('/')[0]}&sz=64` : null)
  const px = size * 4

  if (logo) {
    return (
      <div className="relative shrink-0" style={{ width: px, height: px }}>
        <img src={logo} alt="" className="rounded-full object-contain bg-white border border-[#e5e7eb]" style={{ width: px, height: px }}
          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
        <div className="absolute inset-0 hidden items-center justify-center rounded-full bg-[#f3f4f6] font-bold text-[#4a5565]"
          style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: px * 0.4 }}>{initial}</div>
      </div>
    )
  }
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] font-bold text-[#4a5565]"
      style={{ width: px, height: px, fontFamily: 'JetBrains Mono,monospace', fontSize: px * 0.4 }}>{initial}</div>
  )
}

function PaymentDetailPanel({ payment, onClose }) {
  if (!payment) return null
  const name = payment.merchant_name || payment.description || 'Payment'
  const amt = payment.last_amount ?? payment.average_amount
  const freq = FREQUENCY_LABELS[payment.frequency] || payment.frequency || 'Recurring'
  const sourceLabel = payment.source === 'liability' ? 'Credit card bill' : payment.source === 'subscription' ? 'Subscription' : 'Recurring payment'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-[380px] flex-col border-l border-[#d9d9d9] bg-white shadow-xl transition-transform duration-300 ease-in-out translate-x-0">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#d9d9d9] px-5 py-4">
          <span className="text-[16px] font-medium text-[#1e1e1e]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            Payment Details
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
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Merchant header */}
          <div className="flex items-center gap-3 mb-6">
            <PaymentLogo payment={payment} size={10} />
            <div className="min-w-0">
              <p className="text-[18px] font-semibold text-[#101828] truncate" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                {name}
              </p>
              <p className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                {sourceLabel}
              </p>
            </div>
          </div>

          {/* Amount */}
          <div className="rounded-xl bg-[#f8f8f8] px-4 py-4 mb-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#9ca3af] mb-1" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              Amount
            </p>
            <p className="text-[28px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              {formatCurrency(amt)}
            </p>
          </div>

          {/* Details grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-[#f3f4f6]">
              <span className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Frequency</span>
              <span className="text-[12px] font-medium text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{freq}</span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-[#f3f4f6]">
              <span className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Next Payment</span>
              <span className="text-[12px] font-medium text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{formatDate(payment.predicted_next_date)}</span>
            </div>

            {payment.last_date && (
              <div className="flex items-center justify-between py-2 border-b border-[#f3f4f6]">
                <span className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Last Charged</span>
                <span className="text-[12px] font-medium text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{formatDate(payment.last_date)}</span>
              </div>
            )}

            {payment.first_date && (
              <div className="flex items-center justify-between py-2 border-b border-[#f3f4f6]">
                <span className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>First Charged</span>
                <span className="text-[12px] font-medium text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{formatDate(payment.first_date)}</span>
              </div>
            )}

            {payment.average_amount != null && payment.last_amount != null && payment.average_amount !== payment.last_amount && (
              <div className="flex items-center justify-between py-2 border-b border-[#f3f4f6]">
                <span className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Avg. Amount</span>
                <span className="text-[12px] font-medium text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{formatCurrency(payment.average_amount)}</span>
              </div>
            )}

            {payment.category && (
              <div className="flex items-center justify-between py-2 border-b border-[#f3f4f6]">
                <span className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Category</span>
                <span className="text-[12px] font-medium text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{payment.category}</span>
              </div>
            )}

            {payment.status && (
              <div className="flex items-center justify-between py-2 border-b border-[#f3f4f6]">
                <span className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Status</span>
                <span className={`text-[12px] font-medium ${payment.status === 'ACTIVE' ? 'text-[#059669]' : 'text-[#6a7282]'}`} style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  {payment.status === 'ACTIVE' ? 'Active' : payment.status}
                </span>
              </div>
            )}

            {payment.description && payment.description !== payment.merchant_name && (
              <div className="flex items-center justify-between py-2 border-b border-[#f3f4f6]">
                <span className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Description</span>
                <span className="text-[12px] font-medium text-[#101828] text-right max-w-[180px]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{payment.description}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function DayPopover({ payments, dateStr, onSelect, onClose }) {
  const dateLabel = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-30 bg-white border border-[#e5e7eb] rounded-xl shadow-lg py-2 min-w-[200px]">
        <p className="text-[11px] font-medium text-[#9ca3af] px-3 pb-1.5 border-b border-[#f3f4f6] mb-1" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
          {dateLabel}
        </p>
        {payments.map((p) => {
          const name = p.merchant_name || p.description || 'Payment'
          const amt = p.last_amount ?? p.average_amount
          return (
            <button
              key={p.stream_id}
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect(p) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f9fafb] transition-colors cursor-pointer"
            >
              <PaymentLogo payment={p} size={6} />
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[12px] font-medium text-[#101828] truncate" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{name}</p>
              </div>
              <span className="text-[12px] font-medium text-[#101828] shrink-0" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                {formatCurrency(amt)}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

export function RecurringCalendar() {
  const { data, isLoading } = useRecurring()
  const payments = data?.payments ?? []

  const [viewDate, setViewDate] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [popover, setPopover] = useState(null) // { dateStr, payments }

  // Project recurring payments across the viewed month
  const paymentsByDate = useMemo(() => {
    const map = {}
    const monthStart = new Date(viewDate.year, viewDate.month, 1)
    const monthEnd = new Date(viewDate.year, viewDate.month + 1, 0)

    for (const p of payments) {
      if (!p.predicted_next_date) continue
      const nextDate = new Date(p.predicted_next_date + 'T00:00:00')

      if (nextDate >= monthStart && nextDate <= monthEnd) {
        const key = nextDate.toISOString().slice(0, 10)
        if (!map[key]) map[key] = []
        map[key].push(p)
      }

      if (p.last_date && p.frequency) {
        const projectedDates = projectDates(p.last_date, p.frequency, monthStart, monthEnd)
        for (const d of projectedDates) {
          const key = d.toISOString().slice(0, 10)
          if (!map[key]) map[key] = []
          if (!map[key].some(existing => existing.stream_id === p.stream_id)) {
            map[key].push(p)
          }
        }
      }
    }
    return map
  }, [payments, viewDate])

  // Compute monthly totals
  const { monthlyTotal, monthlyCount } = useMemo(() => {
    let total = 0
    let count = 0
    for (const dayPayments of Object.values(paymentsByDate)) {
      for (const p of dayPayments) {
        total += p.last_amount ?? p.average_amount ?? 0
        count++
      }
    }
    return { monthlyTotal: total, monthlyCount: count }
  }, [paymentsByDate])

  const monthLabel = new Date(viewDate.year, viewDate.month).toLocaleDateString('en-US', { month: 'long' })

  const firstDay = new Date(viewDate.year, viewDate.month, 1).getDay()
  const daysInMonth = new Date(viewDate.year, viewDate.month + 1, 0).getDate()
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  function prevMonth() {
    setViewDate(v => {
      const d = new Date(v.year, v.month - 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
    setPopover(null)
  }

  function nextMonth() {
    setViewDate(v => {
      const d = new Date(v.year, v.month + 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
    setPopover(null)
  }

  return (
    <>
      <PaymentDetailPanel payment={selectedPayment} onClose={() => setSelectedPayment(null)} />

      <div className="rounded-[14px] border border-[#9ca3af] bg-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pl-8 pr-5 py-4 border-b border-[#e5e7eb]">
          <h2 className="text-[18px] font-semibold leading-5 tracking-[-0.31px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            Recurring Payments
          </h2>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('open-assistant', {
                detail: { prompt: 'Summarize my recurring payments. List all active subscriptions and recurring bills, their amounts, and frequencies. Highlight any that seem unusually high or that I might want to review.' },
              }))
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-[#3d3d42] hover:opacity-80 transition-opacity cursor-pointer"
            title="Ask AI about recurring payments"
          >
            <img src="/ai-icon.svg" alt="" className="h-5 w-5" />
            <span className="text-[12px] font-semibold text-white" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Ask AI</span>
          </button>
        </div>
        {/* Month nav */}
        <div className="flex items-center justify-between px-8 pt-4 mb-4">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[20px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                {monthLabel} <span className="text-[#9ca3af] font-normal">{viewDate.year}</span>
              </span>
            </div>
            {!isLoading && monthlyCount > 0 && (
              <div className="flex items-center gap-1.5 border-l border-[#e5e7eb] pl-4 self-end mb-0.5">
                <span className="text-[14px] font-semibold text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  {formatCurrency(monthlyTotal)}
                </span>
                <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  in {monthlyCount} recurring expense{monthlyCount !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevMonth}
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-[#f3f4f6] transition-colors text-[#6a7282] hover:text-[#101828]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-[#f3f4f6] transition-colors text-[#6a7282] hover:text-[#101828]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-8 pb-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Loading…</span>
          </div>
        ) : (
          <>
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map(d => (
                <div key={d} className="text-center text-[13px] font-medium uppercase tracking-wide text-[#9ca3af] py-2" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 border-t border-l border-[#d1d5db]">
              {Array.from({ length: totalCells }, (_, i) => {
                const dayNum = i - firstDay + 1
                const inMonth = dayNum >= 1 && dayNum <= daysInMonth
                const dateStr = inMonth
                  ? `${viewDate.year}-${String(viewDate.month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
                  : null
                const dayPayments = dateStr ? (paymentsByDate[dateStr] ?? []) : []
                const isToday = dateStr === todayStr
                const hasPopover = popover?.dateStr === dateStr

                return (
                  <div
                    key={i}
                    className={`relative border-r border-b border-[#d1d5db] min-h-[96px] p-2 ${
                      !inMonth ? 'bg-[#fafafa]' : dayPayments.length > 0 ? 'bg-[#f0f5ff]' : 'bg-white'
                    }`}
                  >
                    {inMonth && (
                      <>
                        <span
                          className={`text-[14px] font-medium ${
                            isToday
                              ? 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#101828] text-white'
                              : 'text-[#6a7282]'
                          }`}
                          style={{ fontFamily: 'JetBrains Mono,monospace' }}
                        >
                          {dayNum}
                        </span>
                        <div className="mt-1 space-y-1">
                          {dayPayments.slice(0, 2).map((p) => {
                            const name = p.merchant_name || p.description || 'Payment'
                            const amt = p.last_amount ?? p.average_amount
                            return (
                              <button
                                key={p.stream_id}
                                type="button"
                                onClick={() => setSelectedPayment(p)}
                                className="w-full flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-[#e5e7eb] transition-colors cursor-pointer"
                              >
                                <PaymentLogo payment={p} size={5} />
                                <span className="text-[12px] text-[#4a5565] truncate flex-1 text-left" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                                  {formatCurrency(amt)}
                                </span>
                              </button>
                            )
                          })}
                          {dayPayments.length > 2 && (
                            <button
                              type="button"
                              onClick={() => setPopover(hasPopover ? null : { dateStr, payments: dayPayments })}
                              className="text-[12px] text-[#4f46e5] hover:text-[#3730a3] pl-1 cursor-pointer"
                              style={{ fontFamily: 'JetBrains Mono,monospace' }}
                            >
                              +{dayPayments.length - 2} more
                            </button>
                          )}
                        </div>
                        {hasPopover && (
                          <DayPopover
                            payments={popover.payments}
                            dateStr={popover.dateStr}
                            onSelect={(p) => { setSelectedPayment(p); setPopover(null) }}
                            onClose={() => setPopover(null)}
                          />
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
        </div>
      </div>
    </>
  )
}

function projectDates(lastDateStr, frequency, monthStart, monthEnd) {
  const dates = []
  const last = new Date(lastDateStr + 'T00:00:00')
  const increments = {
    WEEKLY: 7,
    BIWEEKLY: 14,
  }

  if (increments[frequency]) {
    const step = increments[frequency]
    const d = new Date(last)
    while (d <= monthEnd) {
      d.setDate(d.getDate() + step)
      if (d >= monthStart && d <= monthEnd) {
        dates.push(new Date(d))
      }
    }
  } else if (frequency === 'MONTHLY' || frequency === 'SEMI_MONTHLY') {
    const dayOfMonth = last.getDate()
    const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), dayOfMonth)
    if (d >= monthStart && d <= monthEnd) {
      dates.push(new Date(d))
    }
    if (frequency === 'SEMI_MONTHLY') {
      const d2 = new Date(monthStart.getFullYear(), monthStart.getMonth(), dayOfMonth + 15)
      if (d2 >= monthStart && d2 <= monthEnd) {
        dates.push(new Date(d2))
      }
    }
  } else if (frequency === 'QUARTERLY') {
    const d = new Date(last)
    while (d <= monthEnd) {
      d.setMonth(d.getMonth() + 3)
      if (d >= monthStart && d <= monthEnd) {
        dates.push(new Date(d))
      }
    }
  } else if (frequency === 'YEARLY' || frequency === 'ANNUALLY') {
    const d = new Date(last)
    while (d <= monthEnd) {
      d.setFullYear(d.getFullYear() + 1)
      if (d >= monthStart && d <= monthEnd) {
        dates.push(new Date(d))
      }
    }
  }

  return dates
}
