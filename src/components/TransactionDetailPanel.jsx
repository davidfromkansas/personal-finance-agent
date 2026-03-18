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
