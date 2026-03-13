import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import { AppHeader } from '../components/AppHeader'

// ─── Shared helpers (duplicated from LoggedInPage to avoid a circular import) ─

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
    const key = toDateKey(t.authorized_date || t.date)
    if (!current || current.date !== key) {
      current = { date: key, label: formatTransactionDate(key), items: [] }
      groups.push(current)
    }
    current.items.push(t)
  }
  return groups
}

function bestLogoUrl(t) {
  if (t.logo_url) return t.logo_url
  const website = t.website ?? t.counterparties?.[0]?.website ?? null
  if (!website) return null
  const domain = website.replace(/^https?:\/\//, '').split('/')[0]
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
}

function formatCategory(raw) {
  if (!raw) return null
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatPaymentChannel(raw) {
  if (!raw) return null
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─── Transaction Row ──────────────────────────────────────────────────────────

function TransactionRow({ transaction, onClick }) {
  const amt = Number(transaction.amount)
  const isCredit = amt < 0
  const displayAmt = isCredit
    ? `+$${Math.abs(amt).toFixed(2)}`
    : `-$${Math.abs(amt).toFixed(2)}`
  const amtColor = isCredit ? 'text-[#155dfc]' : 'text-[#f54900]'

  return (
    <div
      className="flex h-[36px] shrink-0 items-center justify-between gap-2 rounded-[8px] px-2 cursor-pointer hover:bg-[#f0f0f0] transition-colors"
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
        <p className="shrink-0 font-medium text-[14px] leading-5 tracking-[-0.1px] text-[#101828]"
          style={{ fontFamily: 'JetBrains Mono,monospace' }}>
          {transaction.name}
        </p>
        {transaction.account_name && (
          <span className="min-w-0 shrink truncate inline-block max-w-full rounded-[6px] border border-[#d1d5dc] bg-[#f9fafb] px-1.5 py-[2px] text-[11px] font-medium leading-4 text-[#4a5565]"
            style={{ fontFamily: 'JetBrains Mono,monospace' }}
            title={transaction.account_name}>
            {transaction.account_name}
          </span>
        )}
        {transaction.pending && (
          <span className="shrink-0 inline-block rounded-[6px] border border-[#f59e0b] bg-[#fffbeb] px-1.5 py-[2px] text-[11px] font-medium leading-4 text-[#b45309]"
            style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            Pending
          </span>
        )}
      </div>
      <span className={`shrink-0 text-right font-bold text-[14px] leading-5 tracking-[-0.05px] ${amtColor}`}
        style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        {displayAmt}
      </span>
    </div>
  )
}

// ─── Transaction Detail Panel ─────────────────────────────────────────────────

function TransactionDetailPanel({ transaction, onClose }) {
  const open = !!transaction
  const t = transaction ?? {}
  const amt = Number(t.amount)
  const isCredit = amt < 0
  const displayAmt = isCredit ? `+$${Math.abs(amt).toFixed(2)}` : `-$${Math.abs(amt).toFixed(2)}`
  const amtColor = isCredit ? 'text-[#155dfc]' : 'text-[#f54900]'

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      )}
      <div className={`fixed right-0 top-0 z-50 flex h-full w-1/3 flex-col border-l border-[#d9d9d9] bg-white shadow-xl transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-[#d9d9d9] px-5 py-4">
          <span className="text-[16px] font-normal text-[#1e1e1e]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Transaction</span>
          <button type="button" onClick={onClose}
            className="text-[#999] hover:text-[#1e1e1e] transition-colors text-xl leading-none cursor-pointer">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {bestLogoUrl(t) ? (
                <img src={bestLogoUrl(t)} alt="" className="h-10 w-10 shrink-0 rounded-full border border-[#e5e7eb] object-contain"
                  onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                />
              ) : null}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-[#f9fafb] text-[14px] font-bold text-[#4a5565]"
                style={{ fontFamily: 'JetBrains Mono,monospace', display: bestLogoUrl(t) ? 'none' : 'flex' }}>
                {(t.name ?? '?')[0].toUpperCase()}
              </div>
              <p className="text-[16px] font-semibold text-[#101828] leading-tight" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{t.name}</p>
            </div>
            <span className={`shrink-0 text-[22px] font-bold leading-tight ${amtColor}`} style={{ fontFamily: 'JetBrains Mono,monospace' }}>{displayAmt}</span>
          </div>
          <div className="border-t border-[#e5e7eb]" />
          <div className="space-y-4">
            {[
              { label: 'Status', value: t.pending ? 'Pending' : 'Posted' },
              { label: 'Category', value: formatCategory(t.personal_finance_category) },
              { label: 'Detailed Category', value: formatCategory(t.personal_finance_category_detailed) },
              { label: 'Category Confidence', value: t.personal_finance_category_confidence ? t.personal_finance_category_confidence.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) : null },
              { label: 'Payment Method', value: formatPaymentChannel(t.payment_channel) },
              { label: 'Account', value: t.account_name },
              { label: 'Transaction Date', value: t.authorized_date ? new Date(String(t.authorized_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null },
              { label: 'Post Date', value: t.date ? new Date(String(t.date).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null },
              { label: 'Merchant', value: t.merchant_name ?? null },
              { label: 'Check #', value: t.check_number ?? null },
              { label: 'Original Description', value: t.original_description ?? null },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between gap-4">
                <span className="shrink-0 text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{label}</span>
                <span className={`text-right text-[14px] ${value ? 'text-[#101828]' : 'text-[#bbb]'}`} style={{ fontFamily: 'JetBrains Mono,monospace' }}>{value ?? '—'}</span>
              </div>
            ))}
            <div className="flex items-start justify-between gap-4">
              <span className="shrink-0 text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Website</span>
              {t.website ? (
                <a href={t.website.startsWith('http') ? t.website : `https://${t.website}`} target="_blank" rel="noopener noreferrer"
                  className="text-right text-[14px] text-[#0066CC] underline" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  {t.website.replace(/^https?:\/\//, '')} ↗
                </a>
              ) : (
                <span className="text-right text-[14px] text-[#bbb]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>—</span>
              )}
            </div>
          </div>
          {t.counterparties?.length > 0 && (
            <div className="border-t border-[#e5e7eb] pt-4 space-y-3">
              <p className="text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Counterparties</p>
              {t.counterparties.map((cp, i) => {
                const cpLogo = cp.logo_url ?? (cp.website ? `https://www.google.com/s2/favicons?domain=${cp.website.replace(/^https?:\/\//, '').split('/')[0]}&sz=64` : null)
                return (
                  <div key={i} className="flex items-center gap-3">
                    {cpLogo ? (
                      <img src={cpLogo} alt="" className="h-7 w-7 shrink-0 rounded-full border border-[#e5e7eb] object-contain bg-white" onError={(e) => { e.target.style.display = 'none' }} />
                    ) : (
                      <div className="h-7 w-7 shrink-0 rounded-full border border-[#e5e7eb] bg-[#f9fafb]" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[14px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{cp.name}</p>
                      <p className="text-[12px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                        {cp.type?.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())}
                        {cp.confidence_level ? ` · ${cp.confidence_level.toLowerCase()}` : ''}
                      </p>
                      {cp.website && (
                        <a href={cp.website.startsWith('http') ? cp.website : `https://${cp.website}`} target="_blank" rel="noopener noreferrer"
                          className="text-[12px] text-[#0066CC] underline" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                          {cp.website.replace(/^https?:\/\//, '')} ↗
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {t.payment_meta && (() => {
            const pm = t.payment_meta
            const pmRows = [
              { label: 'Reference #', value: pm.reference_number },
              { label: 'PPD ID', value: pm.ppd_id },
              { label: 'Processor', value: pm.payment_processor },
              { label: 'Payer', value: pm.payer },
              { label: 'Payee', value: pm.payee },
              { label: 'Reason', value: pm.reason },
              { label: 'By Order Of', value: pm.by_order_of },
            ].filter(r => r.value)
            if (!pmRows.length) return null
            return (
              <div className="border-t border-[#e5e7eb] pt-4 space-y-3">
                <p className="text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Payment Details</p>
                {pmRows.map(({ label, value }) => (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <span className="shrink-0 text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{label}</span>
                    <span className="text-right text-[14px] text-[#101828] break-all" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{value}</span>
                  </div>
                ))}
              </div>
            )
          })()}
          {t.location && Object.values(t.location).some(Boolean) && (
            <div className="border-t border-[#e5e7eb] pt-4 space-y-1">
              <p className="text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Location</p>
              {t.location.address && <p className="text-[14px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{t.location.address}</p>}
              {(t.location.city || t.location.region || t.location.postal_code) && (
                <p className="text-[14px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  {[t.location.city, t.location.region, t.location.postal_code].filter(Boolean).join(', ')}
                </p>
              )}
              {t.location.country && <p className="text-[14px] text-[#101828]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{t.location.country}</p>}
              {t.location.store_number && <p className="text-[13px] text-[#6a7282]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Store #{t.location.store_number}</p>}
              {t.location.lat != null && t.location.lon != null && (
                <a href={`https://www.google.com/maps?q=${t.location.lat},${t.location.lon}`} target="_blank" rel="noopener noreferrer"
                  className="text-[13px] text-[#0066CC] underline" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  {t.location.lat.toFixed(5)}, {t.location.lon.toFixed(5)} ↗
                </a>
              )}
            </div>
          )}
          {t.plaid_transaction_id && (
            <div className="border-t border-[#e5e7eb] pt-4">
              <p className="text-[11px] text-[#bbb] break-all" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{t.plaid_transaction_id}</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Sort Button ──────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'recent',      label: 'Most recent' },
  { value: 'oldest',      label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc',  label: 'Amount: low to high' },
]

function SortButton({ sort, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const current = SORT_OPTIONS.find(o => o.value === sort) ?? SORT_OPTIONS[0]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-[8px] border border-[#d1d5dc] bg-white px-3 py-1.5 text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors"
        style={{ fontFamily: 'JetBrains Mono,monospace' }}
      >
        <svg className="h-3.5 w-3.5 text-[#6b7280]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 2v12M4 2L2 4.5M4 2l2 2.5" />
          <path d="M12 14V2M12 14l-2-2.5M12 14l2-2.5" />
        </svg>
        {current.label}
        <svg className={`h-3 w-3 text-[#9ca3af] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-[10px] border border-[#e5e7eb] bg-white py-1 shadow-lg">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`flex w-full items-center justify-between px-3 py-2 text-[13px] hover:bg-[#f9fafb] transition-colors ${sort === opt.value ? 'font-semibold text-[#101828]' : 'font-normal text-[#374151]'}`}
              style={{ fontFamily: 'JetBrains Mono,monospace' }}
            >
              {opt.label}
              {sort === opt.value && (
                <svg className="h-3.5 w-3.5 text-[#18181b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Filter Button & Panel ────────────────────────────────────────────────────

const DATE_PRESETS = [
  { label: 'Last 7 days',  after_date: () => daysAgo(7) },
  { label: 'Last 30 days', after_date: () => daysAgo(30) },
  { label: 'Last 90 days', after_date: () => daysAgo(90) },
  { label: 'This year',    after_date: () => `${new Date().getFullYear()}-01-01` },
  { label: 'All time',     after_date: () => null },
  { label: 'Custom range', after_date: null },
]

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function FilterButton({ filters, accounts, allCategories, refDataLoading, onChange }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(filters)
  const ref = useRef(null)

  // Sync draft when panel opens
  useEffect(() => { if (open) setDraft(filters) }, [open])

  useEffect(() => {
    if (!open) return
    function handleClick(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const activeCount = [
    filters.account_ids.length > 0,
    filters.categories.length > 0,
    filters.after_date || filters.before_date,
  ].filter(Boolean).length

  function toggleAccount(id) {
    setDraft(d => ({
      ...d,
      account_ids: d.account_ids.includes(id)
        ? d.account_ids.filter(a => a !== id)
        : [...d.account_ids, id],
    }))
  }

  function toggleCategory(cat) {
    setDraft(d => ({
      ...d,
      categories: d.categories.includes(cat)
        ? d.categories.filter(c => c !== cat)
        : [...d.categories, cat],
    }))
  }

  function selectPreset(preset) {
    if (preset.label === 'Custom range') {
      setDraft(d => ({ ...d, preset: 'custom' }))
    } else {
      const after = preset.after_date()
      setDraft(d => ({ ...d, after_date: after, before_date: null, preset: preset.label }))
    }
  }

  function apply() {
    onChange(draft)
    setOpen(false)
  }

  function clearAll() {
    const cleared = { account_ids: [], categories: [], after_date: null, before_date: null, preset: 'All time' }
    setDraft(cleared)
    onChange(cleared)
    setOpen(false)
  }

  const currentPresetLabel = (() => {
    if (filters.preset === 'custom' && (filters.after_date || filters.before_date)) return 'Custom range'
    return DATE_PRESETS.find(p => p.after_date && p.after_date() === filters.after_date)?.label ?? 'All time'
  })()

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-[8px] border border-[#d1d5dc] bg-white px-3 py-1.5 text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors"
        style={{ fontFamily: 'JetBrains Mono,monospace' }}
      >
        <svg className="h-3.5 w-3.5 text-[#6b7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 8h10M11 12h2" />
        </svg>
        Filter
        {activeCount > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#18181b] text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-[12px] border border-[#e5e7eb] bg-white shadow-xl overflow-hidden">
          <div className="max-h-[520px] overflow-y-auto">

            {/* Accounts */}
            {refDataLoading ? (
              <div className="px-4 pt-4 pb-3 space-y-2">
                <div className="h-2.5 w-16 rounded bg-[#f3f4f6]" />
                {[1,2,3].map(i => <div key={i} className="h-3 w-40 rounded bg-[#f3f4f6]" />)}
              </div>
            ) : accounts.length > 0 && (
              <div className="px-4 pt-4 pb-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.6px] text-[#6b7280]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Account</p>
                <div className="space-y-1">
                  {accounts.map(acc => (
                    <label key={acc.account_id} className="flex items-center gap-2 cursor-pointer rounded-[6px] px-1 py-1 hover:bg-[#f9fafb]">
                      <input
                        type="checkbox"
                        checked={draft.account_ids.includes(acc.account_id)}
                        onChange={() => toggleAccount(acc.account_id)}
                        className="h-3.5 w-3.5 rounded accent-[#18181b]"
                      />
                      <span className="text-[13px] text-[#374151]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                        {acc.account_name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-[#f3f4f6]" />

            {/* Date */}
            <div className="px-4 pt-3 pb-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.6px] text-[#6b7280]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Date</p>
              <div className="space-y-1">
                {DATE_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => selectPreset(preset)}
                    className={`flex w-full items-center justify-between rounded-[6px] px-2 py-1.5 text-[13px] transition-colors hover:bg-[#f9fafb] ${
                      (draft.preset ?? currentPresetLabel) === preset.label ? 'font-semibold text-[#101828]' : 'text-[#374151]'
                    }`}
                    style={{ fontFamily: 'JetBrains Mono,monospace' }}
                  >
                    {preset.label}
                    {(draft.preset ?? currentPresetLabel) === preset.label && (
                      <svg className="h-3.5 w-3.5 text-[#18181b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              {draft.preset === 'custom' && (
                <div className="mt-2 flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[11px] text-[#9ca3af] mb-0.5" style={{ fontFamily: 'JetBrains Mono,monospace' }}>From</label>
                    <input
                      type="date"
                      value={draft.after_date ?? ''}
                      onChange={e => setDraft(d => ({ ...d, after_date: e.target.value || null }))}
                      className="w-full rounded-[6px] border border-[#d1d5dc] px-2 py-1 text-[12px] text-[#374151]"
                      style={{ fontFamily: 'JetBrains Mono,monospace' }}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[11px] text-[#9ca3af] mb-0.5" style={{ fontFamily: 'JetBrains Mono,monospace' }}>To</label>
                    <input
                      type="date"
                      value={draft.before_date ?? ''}
                      onChange={e => setDraft(d => ({ ...d, before_date: e.target.value || null }))}
                      className="w-full rounded-[6px] border border-[#d1d5dc] px-2 py-1 text-[12px] text-[#374151]"
                      style={{ fontFamily: 'JetBrains Mono,monospace' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Categories */}
            {(refDataLoading || allCategories.length > 0) && (
              <>
                <div className="border-t border-[#f3f4f6]" />
                {refDataLoading ? (
                  <div className="px-4 pt-3 pb-4 space-y-2">
                    <div className="h-2.5 w-16 rounded bg-[#f3f4f6]" />
                    {[1,2,3,4].map(i => <div key={i} className="h-3 w-36 rounded bg-[#f3f4f6]" />)}
                  </div>
                ) : (
                  <div className="px-4 pt-3 pb-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.6px] text-[#6b7280]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Category</p>
                    <div className="space-y-1">
                      {allCategories.map(cat => (
                        <label key={cat} className="flex items-center gap-2 cursor-pointer rounded-[6px] px-1 py-1 hover:bg-[#f9fafb]">
                          <input
                            type="checkbox"
                            checked={draft.categories.includes(cat)}
                            onChange={() => toggleCategory(cat)}
                            className="h-3.5 w-3.5 rounded accent-[#18181b]"
                          />
                          <span className="text-[13px] text-[#374151]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                            {formatCategory(cat)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[#e5e7eb] px-4 py-3">
            <button onClick={clearAll} className="text-[13px] text-[#6b7280] hover:text-[#374151] transition-colors" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              Clear all
            </button>
            <button onClick={apply}
              className="rounded-[8px] bg-[#18181b] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#374151] transition-colors"
              style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Active Filter Pills ──────────────────────────────────────────────────────

function ActiveFilterPills({ filters, accounts, onRemove }) {
  const pills = []

  if (filters.account_ids.length > 0) {
    const names = filters.account_ids.map(id => accounts.find(a => a.account_id === id)?.account_name ?? id)
    pills.push({ key: 'accounts', label: names.join(', '), onRemove: () => onRemove('account_ids') })
  }

  if (filters.after_date || filters.before_date) {
    const preset = DATE_PRESETS.find(p => p.after_date && p.after_date() === filters.after_date && !filters.before_date)
    const label = preset ? preset.label
      : filters.after_date && filters.before_date ? `${filters.after_date} – ${filters.before_date}`
      : filters.after_date ? `From ${filters.after_date}`
      : `Until ${filters.before_date}`
    pills.push({ key: 'date', label, onRemove: () => onRemove('date') })
  }

  if (filters.categories.length > 0) {
    pills.push({
      key: 'categories',
      label: filters.categories.map(formatCategory).join(', '),
      onRemove: () => onRemove('categories'),
    })
  }

  if (pills.length === 0) return null

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {pills.map(pill => (
        <span key={pill.key}
          className="flex items-center gap-1.5 rounded-full border border-[#d1d5dc] bg-white px-3 py-1 text-[12px] text-[#374151]"
          style={{ fontFamily: 'JetBrains Mono,monospace' }}>
          {pill.label}
          <button onClick={pill.onRemove} className="text-[#9ca3af] hover:text-[#374151] transition-colors leading-none">×</button>
        </span>
      ))}
    </div>
  )
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

function sortTransactions(txns, sort) {
  const copy = [...txns]
  copy.sort((a, b) => {
    if (sort === 'amount_desc') return Number(b.amount) - Number(a.amount)
    if (sort === 'amount_asc')  return Number(a.amount) - Number(b.amount)
    const dateA = a.authorized_date || a.date || ''
    const dateB = b.authorized_date || b.date || ''
    if (sort === 'oldest') return dateA < dateB ? -1 : dateA > dateB ? 1 : 0
    return dateA > dateB ? -1 : dateA < dateB ? 1 : 0 // 'recent' default
  })
  return copy
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

function last30DaysDate() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

const EMPTY_FILTERS = { account_ids: [], categories: [], after_date: last30DaysDate(), before_date: null, preset: 'Last 30 days' }

function buildQueryString(filters, offset) {
  const params = new URLSearchParams()
  params.set('limit', String(PAGE_SIZE))
  params.set('offset', String(offset))
  if (filters.after_date) params.set('after_date', filters.after_date)
  if (filters.before_date) params.set('before_date', filters.before_date)
  filters.account_ids.forEach(id => params.append('account_ids', id))
  filters.categories.forEach(cat => params.append('categories', cat))
  return params.toString()
}

export function TransactionsPage() {
  const { getIdToken } = useAuth()
  // rawTransactions: all fetched pages in server order (always 'recent' from server)
  const [rawTransactions, setRawTransactions] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [sort, setSort] = useState('recent')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [accounts, setAccounts] = useState([])
  const [allCategories, setAllCategories] = useState([])
  const [refDataLoading, setRefDataLoading] = useState(true)
  const cache = useRef(new Map())
  const offsetRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const sentinelRef = useRef(null)
  // Refs so the IntersectionObserver callback always reads current values
  const hasMoreRef = useRef(false)
  const loadingRef = useRef(true)
  const filtersRef = useRef(filters)
  const fetchPageRef = useRef(null)

  // Sorted view — derived from raw pool, no fetch needed when sort changes
  const transactions = useMemo(() => sortTransactions(rawTransactions, sort), [rawTransactions, sort])

  // Load reference data once
  useEffect(() => {
    async function loadRefData() {
      try {
        const [acctData, catData] = await Promise.all([
          apiFetch('/api/plaid/transactions/accounts', { getToken: getIdToken }),
          apiFetch('/api/plaid/transactions/categories', { getToken: getIdToken }),
        ])
        setAccounts(acctData.accounts ?? [])
        setAllCategories(catData.categories ?? [])
      } catch (err) {
        console.error('Failed to load filter reference data:', err)
      } finally {
        setRefDataLoading(false)
      }
    }
    loadRefData()
  }, [getIdToken])

  const fetchPage = useCallback(async (currentFilters, offset, append) => {
    const qs = buildQueryString(currentFilters, offset)

    if (cache.current.has(qs)) {
      const cached = cache.current.get(qs)
      if (append) {
        setRawTransactions(prev => [...prev, ...cached.transactions])
      } else {
        setRawTransactions(cached.transactions)
      }
      setTotal(cached.total)
      return
    }

    try {
      const data = await apiFetch(`/api/plaid/transactions?${qs}`, { getToken: getIdToken })
      const result = { transactions: data.transactions ?? [], total: data.total ?? 0 }
      cache.current.set(qs, result)
      if (append) {
        setRawTransactions(prev => [...prev, ...result.transactions])
      } else {
        setRawTransactions(result.transactions)
      }
      setTotal(result.total)
    } catch (err) {
      console.error('Failed to load transactions:', err)
      if (!append) setRawTransactions([])
    }
  }, [getIdToken])

  // Keep refs current on every render so the observer callback always has fresh values
  const hasMore = rawTransactions.length < total
  hasMoreRef.current = hasMore
  loadingRef.current = loading
  filtersRef.current = filters
  fetchPageRef.current = fetchPage

  // Refetch only when filters change
  useEffect(() => {
    offsetRef.current = 0
    setLoading(true)
    fetchPage(filters, 0, false).finally(() => setLoading(false))
  }, [filters, fetchPage])

  async function loadMore() {
    if (loadingMoreRef.current || loadingRef.current || !hasMoreRef.current) return
    loadingMoreRef.current = true
    const nextOffset = offsetRef.current + PAGE_SIZE
    offsetRef.current = nextOffset
    setLoadingMore(true)
    await fetchPageRef.current(filtersRef.current, nextOffset, true)
    setLoadingMore(false)
    loadingMoreRef.current = false
  }

  // Infinite scroll — create observer once; callback reads live values via refs
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore() },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleFiltersChange(newFilters) {
    setFilters(newFilters)
  }

  function handleRemoveFilter(key) {
    setFilters(prev => {
      if (key === 'account_ids') return { ...prev, account_ids: [] }
      if (key === 'categories') return { ...prev, categories: [] }
      if (key === 'date') return { ...prev, after_date: null, before_date: null, preset: 'All time' }
      return prev
    })
  }

  const groups = groupTransactionsByDate(transactions)

  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <AppHeader />
      <TransactionDetailPanel transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} />

      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">

          {/* Header row */}
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[20px] font-semibold text-[#18181b]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                Transactions
              </h1>
              {!loading && (
                <p className="mt-0.5 text-[13px] text-[#71717a]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                  {total === 0 ? 'No transactions' : `Showing ${transactions.length} of ${total}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <SortButton sort={sort} onChange={setSort} />
              <FilterButton
                filters={filters}
                accounts={accounts}
                allCategories={allCategories}
                refDataLoading={refDataLoading}
                onChange={handleFiltersChange}
              />
            </div>
          </div>

          {/* Active filter pills */}
          <ActiveFilterPills
            filters={filters}
            accounts={accounts}
            onRemove={handleRemoveFilter}
          />

          {/* Transaction list */}
          {loading ? (
            <div className="py-16 text-center text-[14px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              Loading…
            </div>
          ) : groups.length === 0 ? (
            <div className="py-16 text-center">
              {filters.account_ids.length > 0 || filters.categories.length > 0 || filters.after_date || filters.before_date ? (
                <>
                  <p className="text-[14px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>No transactions match your filters.</p>
                  <button
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="mt-3 text-[13px] text-[#374151] underline"
                    style={{ fontFamily: 'JetBrains Mono,monospace' }}
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <p className="text-[14px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>No transactions yet.</p>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {groups.map(group => (
                <div key={group.date}>
                  <div className="sticky top-0 z-10 bg-[#f8f8f8] pt-4 pb-1">
                    <p className="text-[11px] font-semibold tracking-[0.6px] text-[#9ca3af]"
                      style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                      {group.label}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map(t => (
                      <TransactionRow
                        key={t.plaid_transaction_id ?? t.id}
                        transaction={t}
                        onClick={setSelectedTransaction}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-8" />
          {loadingMore && (
            <div className="pb-6 text-center text-[13px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              Loading…
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
