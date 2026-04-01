import { useState, useEffect, useRef } from 'react'
import { PLAID_CATEGORIES, PRIMARY_CATEGORIES } from '../lib/plaidCategories.js'
import { useUpdateTransactionCategory, useUpdateTransactionRecurring } from '../hooks/usePlaidQueries.js'

export function bestLogoUrl(t) {
  if (t.logo_url) return t.logo_url
  const website = t.website ?? t.counterparties?.[0]?.website ?? null
  if (!website) return null
  const domain = website.replace(/^https?:\/\//, '').split('/')[0]
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
}

export function formatCategory(raw) {
  if (!raw) return null
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function formatPaymentChannel(raw) {
  if (!raw) return null
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const MONO = { fontFamily: 'JetBrains Mono,monospace' }

function SaveIndicator({ status }) {
  if (status === 'saving') {
    return (
      <svg className="ml-1.5 h-3.5 w-3.5 shrink-0 animate-spin text-[#6a7282]" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
      </svg>
    )
  }
  if (status === 'saved') {
    return (
      <svg className="ml-1.5 h-3.5 w-3.5 shrink-0 text-[#16a34a]" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    )
  }
  if (status === 'error') {
    return (
      <svg className="ml-1.5 h-3.5 w-3.5 shrink-0 text-[#dc2626]" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    )
  }
  return null
}

const RECURRING_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Bi-weekly' },
  { value: 'SEMI_MONTHLY', label: 'Semi-monthly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'YEARLY', label: 'Yearly' },
  { value: 'ANNUALLY', label: 'Annually' },
]

function CategoryDropdowns({ transaction }) {
  const t = transaction
  const [primary, setPrimary] = useState(t.personal_finance_category ?? '')
  const [detailed, setDetailed] = useState(t.personal_finance_category_detailed ?? '')
  const [recurring, setRecurring] = useState(t.recurring ?? '')
  const [catSaveStatus, setCatSaveStatus] = useState('idle')
  const [recSaveStatus, setRecSaveStatus] = useState('idle')
  const [showRecurringPrompt, setShowRecurringPrompt] = useState(false)
  const catTimerRef = useRef(null)
  const recTimerRef = useRef(null)
  const catMutation = useUpdateTransactionCategory()
  const recMutation = useUpdateTransactionRecurring()

  useEffect(() => {
    setPrimary(t.personal_finance_category ?? '')
    setDetailed(t.personal_finance_category_detailed ?? '')
    setRecurring(t.recurring ?? '')
    setCatSaveStatus('idle')
    setRecSaveStatus('idle')
    setShowRecurringPrompt(false)
    return () => {
      if (catTimerRef.current) clearTimeout(catTimerRef.current)
      if (recTimerRef.current) clearTimeout(recTimerRef.current)
    }
  }, [t.plaid_transaction_id])

  const detailedOptions = PLAID_CATEGORIES[primary] ?? []
  const isSubscription = primary === 'SUBSCRIPTION'

  function saveCategory(newPrimary, newDetailed) {
    if (!t.plaid_transaction_id) return
    if (catTimerRef.current) clearTimeout(catTimerRef.current)
    setCatSaveStatus('saving')
    catMutation.mutate(
      { plaidTransactionId: t.plaid_transaction_id, category: newPrimary, detailedCategory: newDetailed },
      {
        onSuccess: () => {
          setCatSaveStatus('saved')
          catTimerRef.current = setTimeout(() => setCatSaveStatus('idle'), 1500)
        },
        onError: () => {
          setCatSaveStatus('error')
          catTimerRef.current = setTimeout(() => setCatSaveStatus('idle'), 2000)
        },
      }
    )
  }

  function saveRecurring(value) {
    if (!t.plaid_transaction_id) return
    if (recTimerRef.current) clearTimeout(recTimerRef.current)
    setRecSaveStatus('saving')
    recMutation.mutate(
      { plaidTransactionId: t.plaid_transaction_id, recurring: value || null },
      {
        onSuccess: () => {
          setRecSaveStatus('saved')
          recTimerRef.current = setTimeout(() => setRecSaveStatus('idle'), 1500)
        },
        onError: () => {
          setRecSaveStatus('error')
          recTimerRef.current = setTimeout(() => setRecSaveStatus('idle'), 2000)
        },
      }
    )
  }

  function handlePrimaryChange(e) {
    const newPrimary = e.target.value
    setPrimary(newPrimary)
    const subs = PLAID_CATEGORIES[newPrimary] ?? []
    const newDetailed = subs[0] ?? ''
    setDetailed(newDetailed)
    saveCategory(newPrimary, newDetailed)
    // If switching to subscription and no recurring set, prompt the user
    if (newPrimary === 'SUBSCRIPTION' && !recurring) {
      setShowRecurringPrompt(true)
    } else {
      setShowRecurringPrompt(false)
    }
  }

  function handleDetailedChange(e) {
    const newDetailed = e.target.value
    setDetailed(newDetailed)
    saveCategory(primary, newDetailed)
  }

  function handleRecurringChange(e) {
    const value = e.target.value
    setRecurring(value)
    saveRecurring(value)
    if (value) setShowRecurringPrompt(false)
  }

  const selectClass = 'w-full appearance-none rounded border border-[#d9d9d9] bg-white px-2 py-1 text-right text-[13px] text-[#101828] outline-none hover:border-[#9ca3af] focus:border-[#155dfc] focus:ring-1 focus:ring-[#155dfc] cursor-pointer'
  const requiredSelectClass = selectClass.replace('border-[#d9d9d9]', 'border-[#f59e0b]') + ' ring-1 ring-[#f59e0b]'

  return (
    <>
      {/* Primary Category */}
      <div className="flex items-center justify-between gap-4">
        <span className="shrink-0 text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={MONO}>Category</span>
        <div className="flex items-center">
          <select value={primary} onChange={handlePrimaryChange} className={selectClass} style={MONO}>
            {!PRIMARY_CATEGORIES.includes(primary) && primary && (
              <option value={primary}>{formatCategory(primary)}</option>
            )}
            {PRIMARY_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{formatCategory(cat)}</option>
            ))}
          </select>
          <SaveIndicator status={catSaveStatus} />
        </div>
      </div>
      {/* Detailed Category */}
      <div className="flex items-center justify-between gap-4">
        <span className="shrink-0 text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={MONO}>Detailed Category</span>
        <div className="flex items-center">
          <select value={detailed} onChange={handleDetailedChange} className={selectClass} style={MONO}>
            {detailedOptions.length === 0 && detailed && (
              <option value={detailed}>{formatCategory(detailed)}</option>
            )}
            {detailedOptions.map(cat => (
              <option key={cat} value={cat}>{formatCategory(cat)}</option>
            ))}
          </select>
          <SaveIndicator status={catSaveStatus} />
        </div>
      </div>
      {/* Recurring */}
      <div className="flex items-center justify-between gap-4">
        <span className="shrink-0 text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={MONO}>Recurring</span>
        <div className="flex items-center">
          <select
            value={recurring}
            onChange={handleRecurringChange}
            className={isSubscription && !recurring ? requiredSelectClass : selectClass}
            style={MONO}
          >
            {RECURRING_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <SaveIndicator status={recSaveStatus} />
        </div>
      </div>
      {/* Subscription requires recurring prompt */}
      {showRecurringPrompt && (
        <div className="flex items-center gap-2 rounded border border-[#f59e0b] bg-[#fffbeb] px-3 py-2">
          <svg className="h-4 w-4 shrink-0 text-[#f59e0b]" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <p className="text-[12px] text-[#92400e]" style={MONO}>Pick a frequency to track this subscription in upcoming payments</p>
        </div>
      )}
    </>
  )
}

export function TransactionDetailPanel({ transaction, onClose, zBackdrop = 'z-40', zPanel = 'z-50' }) {
  const open = !!transaction
  const t = transaction ?? {}
  const amt = Number(t.amount)
  const isCredit = amt < 0
  const displayAmt = isCredit ? `+$${Math.abs(amt).toFixed(2)}` : `-$${Math.abs(amt).toFixed(2)}`
  const amtColor = isCredit ? 'text-[#155dfc]' : 'text-[#dc2626]'

  return (
    <>
      {open && (
        <div className={`fixed inset-0 ${zBackdrop} bg-black/20 backdrop-blur-sm`} onClick={onClose} />
      )}
      <div className={`fixed right-0 top-0 ${zPanel} flex h-full w-1/3 flex-col border-l border-[#d9d9d9] bg-white shadow-xl transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-[#d9d9d9] px-5 py-4">
          <span className="text-[16px] font-normal text-[#1e1e1e]" style={MONO}>Transaction</span>
          <button type="button" onClick={onClose}
            className="text-[#999] hover:text-[#1e1e1e] transition-colors text-xl leading-none cursor-pointer">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {bestLogoUrl(t) ? (
                <img src={bestLogoUrl(t)} alt="" className="h-10 w-10 shrink-0 rounded-full border border-[#9ca3af] object-contain"
                  onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                />
              ) : null}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#9ca3af] bg-[#f9fafb] text-[14px] font-bold text-[#4a5565]"
                style={{ ...MONO, display: bestLogoUrl(t) ? 'none' : 'flex' }}>
                {(t.name ?? '?')[0].toUpperCase()}
              </div>
              <p className="text-[16px] font-semibold text-[#101828] leading-tight" style={MONO}>{t.name}</p>
            </div>
            <span className={`shrink-0 text-[22px] font-bold leading-tight ${amtColor}`} style={MONO}>{displayAmt}</span>
          </div>
          <div className="border-t border-[#9ca3af]" />
          <div className="space-y-4">
            {/* Status — static row */}
            <div className="flex items-start justify-between gap-4">
              <span className="shrink-0 text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={MONO}>Status</span>
              <span className="text-right text-[14px] text-[#101828]" style={MONO}>{t.pending ? 'Pending' : 'Posted'}</span>
            </div>
            {/* Category dropdowns */}
            {open && <CategoryDropdowns transaction={t} />}
            {/* Remaining static rows */}
            {[
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
                <span className="shrink-0 text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={MONO}>{label}</span>
                <span className={`text-right text-[14px] ${value ? 'text-[#101828]' : 'text-[#bbb]'}`} style={MONO}>{value ?? '—'}</span>
              </div>
            ))}
            <div className="flex items-start justify-between gap-4">
              <span className="shrink-0 text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={MONO}>Website</span>
              {t.website ? (
                <a href={t.website.startsWith('http') ? t.website : `https://${t.website}`} target="_blank" rel="noopener noreferrer"
                  className="text-right text-[14px] text-[#0066CC] underline" style={MONO}>
                  {t.website.replace(/^https?:\/\//, '')} ↗
                </a>
              ) : (
                <span className="text-right text-[14px] text-[#bbb]" style={MONO}>—</span>
              )}
            </div>
          </div>
          {t.counterparties?.length > 0 && (
            <div className="border-t border-[#9ca3af] pt-4 space-y-3">
              <p className="text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={MONO}>Counterparties</p>
              {t.counterparties.map((cp, i) => {
                const cpLogo = cp.logo_url ?? (cp.website ? `https://www.google.com/s2/favicons?domain=${cp.website.replace(/^https?:\/\//, '').split('/')[0]}&sz=64` : null)
                return (
                  <div key={i} className="flex items-center gap-3">
                    {cpLogo ? (
                      <img src={cpLogo} alt="" className="h-7 w-7 shrink-0 rounded-full border border-[#9ca3af] object-contain bg-white" onError={(e) => { e.target.style.display = 'none' }} />
                    ) : (
                      <div className="h-7 w-7 shrink-0 rounded-full border border-[#9ca3af] bg-[#f9fafb]" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[14px] text-[#101828]" style={MONO}>{cp.name}</p>
                      <p className="text-[12px] text-[#6a7282]" style={MONO}>
                        {cp.type?.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())}
                        {cp.confidence_level ? ` · ${cp.confidence_level.toLowerCase()}` : ''}
                      </p>
                      {cp.website && (
                        <a href={cp.website.startsWith('http') ? cp.website : `https://${cp.website}`} target="_blank" rel="noopener noreferrer"
                          className="text-[12px] text-[#0066CC] underline" style={MONO}>
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
              <div className="border-t border-[#9ca3af] pt-4 space-y-3">
                <p className="text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={MONO}>Payment Details</p>
                {pmRows.map(({ label, value }) => (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <span className="shrink-0 text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={MONO}>{label}</span>
                    <span className="text-right text-[14px] text-[#101828] break-all" style={MONO}>{value}</span>
                  </div>
                ))}
              </div>
            )
          })()}
          {t.location && Object.values(t.location).some(Boolean) && (
            <div className="border-t border-[#9ca3af] pt-4 space-y-1">
              <p className="text-[12px] font-medium uppercase tracking-[0.5px] text-[#6a7282]" style={MONO}>Location</p>
              {t.location.address && <p className="text-[14px] text-[#101828]" style={MONO}>{t.location.address}</p>}
              {(t.location.city || t.location.region || t.location.postal_code) && (
                <p className="text-[14px] text-[#101828]" style={MONO}>
                  {[t.location.city, t.location.region, t.location.postal_code].filter(Boolean).join(', ')}
                </p>
              )}
              {t.location.country && <p className="text-[14px] text-[#101828]" style={MONO}>{t.location.country}</p>}
              {t.location.store_number && <p className="text-[13px] text-[#6a7282]" style={MONO}>Store #{t.location.store_number}</p>}
              {t.location.lat != null && t.location.lon != null && (
                <a href={`https://www.google.com/maps?q=${t.location.lat},${t.location.lon}`} target="_blank" rel="noopener noreferrer"
                  className="text-[13px] text-[#0066CC] underline" style={MONO}>
                  {t.location.lat.toFixed(5)}, {t.location.lon.toFixed(5)} ↗
                </a>
              )}
            </div>
          )}
          {t.plaid_transaction_id && (
            <div className="border-t border-[#9ca3af] pt-4">
              <p className="text-[11px] text-[#bbb] break-all" style={MONO}>{t.plaid_transaction_id}</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
