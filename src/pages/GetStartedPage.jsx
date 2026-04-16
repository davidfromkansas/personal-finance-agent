import { useNavigate, Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { usePlaidLinkContext } from '../context/PlaidLinkContext'
import { isDemoMode } from '../lib/demoMode.js'

const MONO = { fontFamily: 'JetBrains Mono,monospace' }

export function GetStartedPage() {
  const navigate = useNavigate()
  const { openLink, linkLoading } = usePlaidLinkContext()
  const demo = isDemoMode()

  return (
    <div className="min-h-screen bg-[#f8f8f8]" style={{ paddingLeft: 'var(--sidebar-w)' }}>
      <AppHeader />

      <div className="px-4 py-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="space-y-3">

          {/* Step 1: Connect accounts */}
          <div className="flex gap-3 rounded-[14px] border border-[#9ca3af] bg-white p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-[#374151]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 12l10 5 10-5" /><path d="M2 17l10 5 10-5" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#111113] text-[11px] font-bold text-white">1</span>
                <h3 className="text-[14px] font-semibold text-[#18181b]" style={MONO}>Connect your accounts</h3>
              </div>
              <p className="mt-1 text-[12px] leading-[1.5] text-[#6a7282]" style={MONO}>
                Link bank accounts, credit cards, and investments through Plaid. Read-only access to balances and transactions — we can never move money or initiate transfers.
              </p>

              <div className="mt-2 space-y-1.5 rounded-[10px] border border-[#f3f4f6] bg-[#fafafa] px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-[#6a7282]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                  </span>
                  <p className="text-[11px] leading-[1.4] text-[#4a5565]" style={MONO}>
                    <strong>Bank-grade security.</strong> Plaid is used by Venmo, Robinhood, Coinbase, and thousands more. Credentials are entered in Plaid's interface and never touch our servers.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-[#6a7282]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  </span>
                  <p className="text-[11px] leading-[1.4] text-[#4a5565]" style={MONO}>
                    <strong>Encrypted at every layer.</strong> AES-256 at rest, TLS in transit, app-layer AES-256-GCM for connection tokens.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-[#6a7282]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  </span>
                  <p className="text-[11px] leading-[1.4] text-[#4a5565]" style={MONO}>
                    <strong>Your data is yours.</strong> Never sold or shared. No analytics, no profiling, no ads. Disconnect an account and all its data is permanently deleted.
                  </p>
                </div>
              </div>

              <p className="mt-1.5 text-[11px] text-[#9ca3af]" style={MONO}>
                Read our full <Link to="/privacy" className="underline hover:text-[#6a7282]">Privacy Policy</Link> and <Link to="/privacy-faq" className="underline hover:text-[#6a7282]">Privacy FAQ</Link>.
              </p>

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => !demo && openLink()}
                  disabled={linkLoading || demo}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${demo ? 'bg-[#d1d5db] text-[#9ca3af] line-through cursor-not-allowed' : 'bg-[#111113] text-white hover:bg-[#1e293b] cursor-pointer disabled:opacity-50'}`}
                  style={MONO}
                  title={demo ? 'Not available in demo mode' : undefined}
                >
                  {linkLoading ? 'Connecting…' : 'Connect Account'}
                </button>
                <button type="button" onClick={() => navigate('/app/accounts')} className="rounded-lg bg-[#111113] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1e293b] transition-colors cursor-pointer" style={MONO}>
                  Go to Accounts
                </button>
              </div>
            </div>
          </div>

          {/* Step 2: Explore dashboard */}
          <div className="flex gap-3 rounded-[14px] border border-[#9ca3af] bg-white p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-[#374151]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" /><path d="M9 21V12h6v9" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#111113] text-[11px] font-bold text-white">2</span>
                <h3 className="text-[14px] font-semibold text-[#18181b]" style={MONO}>Explore your dashboard</h3>
              </div>
              <p className="mt-1 text-[12px] leading-[1.5] text-[#6a7282]" style={MONO}>
                See your net worth, spending trends, cash flow, and investment portfolio — all in one place, updated automatically.
              </p>
              <button type="button" onClick={() => navigate('/app')} className="mt-2 rounded-lg bg-[#111113] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1e293b] transition-colors cursor-pointer" style={MONO}>
                Go to Dashboard
              </button>
            </div>
          </div>

          {/* Step 3: AI assistant & agent */}
          <div className="flex gap-3 rounded-[14px] border border-[#9ca3af] bg-white p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-[#374151]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#111113] text-[11px] font-bold text-white">3</span>
                <h3 className="text-[14px] font-semibold text-[#18181b]" style={MONO}>Use your AI assistant</h3>
              </div>
              <p className="mt-1 text-[12px] leading-[1.5] text-[#6a7282]" style={MONO}>
                Ask questions about your spending, investments, cash flow, and more. Get instant answers with charts and breakdowns.
              </p>

              <div className="mt-2 space-y-1.5 rounded-[10px] border border-[#f3f4f6] bg-[#fafafa] px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-[#6a7282]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                  </span>
                  <p className="text-[11px] leading-[1.4] text-[#4a5565]" style={MONO}>
                    <strong>Ask Abacus.</strong> Chat in the app — ask about spending patterns, balances, portfolio performance, market research, and more.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-[#6a7282]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
                  </span>
                  <p className="text-[11px] leading-[1.4] text-[#4a5565]" style={MONO}>
                    <strong>Connect via MCP.</strong> Bring your data into Claude, ChatGPT, Claude Code, or any MCP-compatible agent. Build custom workflows and automate analysis.
                  </p>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={() => navigate('/app/ask')} className="rounded-lg bg-[#111113] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1e293b] transition-colors cursor-pointer" style={MONO}>
                  Ask Abacus
                </button>
                <button type="button" onClick={() => navigate('/app/connect-agent')} className="rounded-lg bg-[#111113] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1e293b] transition-colors cursor-pointer" style={MONO}>
                  Connect Agent (MCP)
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
