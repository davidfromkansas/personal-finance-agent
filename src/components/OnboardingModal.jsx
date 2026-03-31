/**
 * OnboardingModal — blocking overlay shown to users with 0 connected accounts.
 * Cannot be dismissed. Disappears automatically once an account is successfully linked.
 */
import { usePlaidLinkContext } from '../context/PlaidLinkContext'

const MONO = { fontFamily: 'JetBrains Mono,monospace' }

function BankIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

export function OnboardingModal() {
  const { openLink, linkLoading, linkError } = usePlaidLinkContext()

  return (
    <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center p-4">
      <div
        className="w-full max-w-[460px] overflow-hidden rounded-[18px] border border-black/10 bg-white shadow-2xl"
        style={MONO}
      >
        {/* Top accent bar */}
        <div className="h-1 w-full bg-[#111113]" />

        <div className="px-8 py-8">
          {/* Icon */}
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-[12px] bg-[#f3f4f6] text-[#101828]">
            <BankIcon />
          </div>

          {/* Heading */}
          <h2 className="text-[20px] font-bold tracking-[-0.4px] text-[#101828]">
            Connect your first account
          </h2>
          <p className="mt-2 text-[13px] leading-[1.6] text-[#6a7282]">
            Abacus needs at least one linked account to show your balances, transactions, and net worth. You can connect bank accounts, credit cards, and investment accounts.
          </p>

          {/* How it works */}
          <div className="mt-5 space-y-3 rounded-[10px] border border-[#f3f4f6] bg-[#fafafa] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.8px] text-[#9ca3af]">How it works</p>
            {[
              ['Click the button below — we\'ll open Plaid, a secure bank connection service used by thousands of apps.', '1'],
              ['Search for your bank or credit card, then sign in with your banking credentials.', '2'],
              ['Abacus gets read-only access to your balances and transactions. We can never move money.', '3'],
            ].map(([text, num]) => (
              <div key={num} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#111113] text-[10px] font-bold text-white">{num}</span>
                <p className="text-[12px] leading-[1.5] text-[#4a5565]">{text}</p>
              </div>
            ))}
          </div>

          {/* Error */}
          {linkError && (
            <p className="mt-4 rounded-[8px] bg-[#fef2f2] px-3 py-2 text-[12px] text-[#dc2626]" style={MONO}>
              Could not connect to Abacus — make sure the server is running and try again.
            </p>
          )}

          {/* CTA */}
          <button
            type="button"
            onClick={() => openLink('add')}
            disabled={linkLoading}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#111113] px-4 py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {linkLoading ? 'Opening…' : 'Connect your first account'}
          </button>

          {/* Trust line */}
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[#9ca3af]">
            <LockIcon />
            <span>Read-only access · Secured by Plaid · Your credentials are never stored</span>
          </div>
        </div>
      </div>
    </div>
  )
}
