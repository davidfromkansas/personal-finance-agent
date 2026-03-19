import { useState, useEffect, useRef, useMemo } from 'react'
import { AppHeader } from '../components/AppHeader'
import { TransactionDetailPanel, bestLogoUrl, formatCategory, formatPaymentChannel } from '../components/TransactionDetailPanel'
import { useTransactionAccounts, useTransactionCategories, useTransactions } from '../hooks/usePlaidQueries'

function toDateKey(raw) {
  if (!raw) return ''
  const s = String(raw)
  return s.length >= 10 ? s.slice(0, 10) : s
}

function formatTransactionDate(dateStr) {
  const key = toDateKey(dateStr)
  const d = new Date(key + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return String(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()
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
              <img src={logo} alt="" className="h-5 w-5 rounded-full border border-[#9ca3af] object-contain bg-white"
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
              />
              <div className="absolute inset-0 hidden items-center justify-center rounded-full border border-[#9ca3af] bg-[#f9fafb] text-[8px] font-bold text-[#4a5565]"
                style={{ fontFamily: 'JetBrains Mono,monospace' }}>{initial}</div>
            </div>
          )
          return (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#9ca3af] bg-[#f9fafb] text-[8px] font-bold text-[#4a5565]"
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
        {(transaction.personal_finance_category_detailed === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' ||
          transaction.personal_finance_category_detailed === 'LOAN_PAYMENTS_LINE_OF_CREDIT_PAYMENT') && (
          <span className="shrink-0 inline-block rounded-[6px] border border-[#c7d7fe] bg-[#eef2ff] px-1.5 py-[2px] text-[11px] font-medium leading-4 text-[#3730a3]"
            style={{ fontFamily: 'JetBrains Mono,monospace' }}
            title="Credit card payment — excluded from spending totals to avoid double-counting individual transactions">
            Excluded from spending
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
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-[10px] border border-[#9ca3af] bg-white py-1 shadow-lg">
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

// ─── Filter helpers ───────────────────────────────────────────────────────────

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

function useDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    function handleClick(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])
  return { open, setOpen, ref }
}

const FILTER_BTN_BASE = 'flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[13px] font-medium transition-colors'
const FILTER_BTN_IDLE = 'border-[#d1d5dc] bg-white text-[#374151] hover:bg-[#f9fafb]'
const FILTER_BTN_ACTIVE = 'border-[#18181b] bg-[#18181b] text-white'
const FILTER_CHEVRON = (active, open) =>
  `h-3 w-3 transition-transform ${open ? 'rotate-180' : ''} ${active ? 'text-white' : 'text-[#9ca3af]'}`

function FilterChevron({ active, open }) {
  return (
    <svg className={FILTER_CHEVRON(active, open)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function FilterFooter({ onClear, onApply }) {
  return (
    <div className="flex items-center justify-between border-t border-[#f3f4f6] px-4 py-3">
      <button onClick={onClear} className="text-[13px] text-[#6b7280] hover:text-[#374151] transition-colors" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Clear</button>
      <button onClick={onApply} className="rounded-[8px] bg-[#18181b] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#374151] transition-colors" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Apply</button>
    </div>
  )
}

// ─── Account Filter Button ────────────────────────────────────────────────────

function AccountFilterButton({ filters, accounts, loading, onChange }) {
  const { open, setOpen, ref } = useDropdown()
  const [draft, setDraft] = useState(filters.account_ids)
  useEffect(() => { if (open) setDraft(filters.account_ids) }, [open])

  const active = filters.account_ids.length > 0
  const label = active
    ? filters.account_ids.length === 1
      ? (accounts.find(a => a.account_id === filters.account_ids[0])?.account_name ?? 'Account')
      : `${filters.account_ids.length} accounts`
    : 'Account'

  function toggle(id) {
    setDraft(d => d.includes(id) ? d.filter(a => a !== id) : [...d, id])
  }
  function apply() { onChange({ ...filters, account_ids: draft }); setOpen(false) }
  function clear() { onChange({ ...filters, account_ids: [] }); setOpen(false) }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className={`${FILTER_BTN_BASE} ${active ? FILTER_BTN_ACTIVE : FILTER_BTN_IDLE}`} style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        {label}
        <FilterChevron active={active} open={open} />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-56 rounded-[12px] border border-[#9ca3af] bg-white shadow-xl overflow-hidden">
          <div className="px-4 pt-4 pb-3 max-h-[280px] overflow-y-auto">
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-3 w-40 rounded bg-[#f3f4f6]" />)}</div>
            ) : accounts.length === 0 ? (
              <p className="text-[13px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>No accounts</p>
            ) : (
              <div className="space-y-1">
                {accounts.map(acc => (
                  <label key={acc.account_id} className="flex items-center gap-2 cursor-pointer rounded-[6px] px-1 py-1 hover:bg-[#f9fafb]">
                    <input type="checkbox" checked={draft.includes(acc.account_id)} onChange={() => toggle(acc.account_id)} className="h-3.5 w-3.5 rounded accent-[#18181b]" />
                    <span className="text-[13px] text-[#374151]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{acc.account_name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <FilterFooter onClear={clear} onApply={apply} />
        </div>
      )}
    </div>
  )
}

// ─── Date Filter Button ───────────────────────────────────────────────────────

function DateFilterButton({ filters, onChange }) {
  const { open, setOpen, ref } = useDropdown()
  const [draft, setDraft] = useState({ after_date: filters.after_date, before_date: filters.before_date, preset: filters.preset })
  useEffect(() => { if (open) setDraft({ after_date: filters.after_date, before_date: filters.before_date, preset: filters.preset }) }, [open])

  const active = !!(filters.after_date || filters.before_date)
  const currentPresetLabel = (() => {
    if (filters.preset === 'custom' && (filters.after_date || filters.before_date)) return 'Custom range'
    return DATE_PRESETS.find(p => p.after_date && p.after_date() === filters.after_date)?.label ?? 'All time'
  })()
  const label = active ? currentPresetLabel : 'Date'

  function selectPreset(preset) {
    if (preset.label === 'Custom range') {
      setDraft(d => ({ ...d, preset: 'custom' }))
    } else {
      setDraft({ after_date: preset.after_date(), before_date: null, preset: preset.label })
    }
  }
  function apply() { onChange({ ...filters, after_date: draft.after_date, before_date: draft.before_date, preset: draft.preset }); setOpen(false) }
  function clear() { onChange({ ...filters, after_date: null, before_date: null, preset: 'All time' }); setOpen(false) }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className={`${FILTER_BTN_BASE} ${active ? FILTER_BTN_ACTIVE : FILTER_BTN_IDLE}`} style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        {label}
        <FilterChevron active={active} open={open} />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-48 rounded-[12px] border border-[#9ca3af] bg-white shadow-xl overflow-hidden">
          <div className="px-3 pt-3 pb-2">
            <div className="space-y-0.5">
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
                  <input type="date" value={draft.after_date ?? ''} onChange={e => setDraft(d => ({ ...d, after_date: e.target.value || null }))} className="w-full rounded-[6px] border border-[#d1d5dc] px-2 py-1 text-[12px] text-[#374151]" style={{ fontFamily: 'JetBrains Mono,monospace' }} />
                </div>
                <div className="flex-1">
                  <label className="block text-[11px] text-[#9ca3af] mb-0.5" style={{ fontFamily: 'JetBrains Mono,monospace' }}>To</label>
                  <input type="date" value={draft.before_date ?? ''} onChange={e => setDraft(d => ({ ...d, before_date: e.target.value || null }))} className="w-full rounded-[6px] border border-[#d1d5dc] px-2 py-1 text-[12px] text-[#374151]" style={{ fontFamily: 'JetBrains Mono,monospace' }} />
                </div>
              </div>
            )}
          </div>
          <FilterFooter onClear={clear} onApply={apply} />
        </div>
      )}
    </div>
  )
}

// ─── Category Filter Button ───────────────────────────────────────────────────

function CategoryFilterButton({ filters, allCategories, loading, onChange }) {
  const { open, setOpen, ref } = useDropdown()
  const [draft, setDraft] = useState(filters.categories)
  useEffect(() => { if (open) setDraft(filters.categories) }, [open])

  const active = filters.categories.length > 0
  const label = active
    ? filters.categories.length === 1 ? formatCategory(filters.categories[0]) : `${filters.categories.length} categories`
    : 'Category'

  function toggle(cat) {
    setDraft(d => d.includes(cat) ? d.filter(c => c !== cat) : [...d, cat])
  }
  function apply() { onChange({ ...filters, categories: draft }); setOpen(false) }
  function clear() { onChange({ ...filters, categories: [] }); setOpen(false) }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className={`${FILTER_BTN_BASE} ${active ? FILTER_BTN_ACTIVE : FILTER_BTN_IDLE}`} style={{ fontFamily: 'JetBrains Mono,monospace' }}>
        {label}
        <FilterChevron active={active} open={open} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-[12px] border border-[#9ca3af] bg-white shadow-xl overflow-hidden">
          <div className="px-4 pt-4 pb-3 max-h-[300px] overflow-y-auto">
            {loading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-3 w-36 rounded bg-[#f3f4f6]" />)}</div>
            ) : allCategories.length === 0 ? (
              <p className="text-[13px] text-[#9ca3af]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>No categories</p>
            ) : (
              <div className="space-y-1">
                {allCategories.map(cat => (
                  <label key={cat} className="flex items-center gap-2 cursor-pointer rounded-[6px] px-1 py-1 hover:bg-[#f9fafb]">
                    <input type="checkbox" checked={draft.includes(cat)} onChange={() => toggle(cat)} className="h-3.5 w-3.5 rounded accent-[#18181b]" />
                    <span className="text-[13px] text-[#374151]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>{formatCategory(cat)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <FilterFooter onClear={clear} onApply={apply} />
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

const EMPTY_FILTERS = { account_ids: [], categories: [], after_date: null, before_date: null, preset: 'All time' }

export function TransactionsPage() {
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [sort, setSort] = useState('recent')
  const [filters, setFilters] = useState(EMPTY_FILTERS)

  const { data: txAcctData, isLoading: txAcctLoading } = useTransactionAccounts()
  const { data: txCatData, isLoading: txCatLoading } = useTransactionCategories()
  const accounts = txAcctData?.accounts ?? []
  const allCategories = txCatData?.categories ?? []
  const refDataLoading = txAcctLoading || txCatLoading

  const {
    data,
    isLoading: loading,
    isFetchingNextPage: loadingMore,
    fetchNextPage,
    hasNextPage,
  } = useTransactions(filters)

  const rawTransactions = useMemo(() => data?.pages.flatMap(p => p.transactions) ?? [], [data])
  const total = data?.pages?.at(-1)?.total ?? 0
  const transactions = useMemo(() => sortTransactions(rawTransactions, sort), [rawTransactions, sort])

  const sentinelRef = useRef(null)
  const fetchNextPageRef = useRef(fetchNextPage)
  const hasNextPageRef = useRef(hasNextPage)
  fetchNextPageRef.current = fetchNextPage
  hasNextPageRef.current = hasNextPage

  // Infinite scroll — create observer once; callback reads live values via refs
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasNextPageRef.current) fetchNextPageRef.current() },
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
    <div className="min-h-screen bg-[#f8f8f8] pl-[220px]">
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
              <AccountFilterButton filters={filters} accounts={accounts} loading={refDataLoading} onChange={handleFiltersChange} />
              <DateFilterButton filters={filters} onChange={handleFiltersChange} />
              <CategoryFilterButton filters={filters} allCategories={allCategories} loading={refDataLoading} onChange={handleFiltersChange} />
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
