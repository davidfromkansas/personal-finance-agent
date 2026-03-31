/**
 * ConnectAccountOverlay — semi-transparent overlay for charts/sections that
 * have no data because no relevant account type is connected.
 * Renders over its parent (parent must have position: relative).
 */
import { usePlaidLinkContext } from '../context/PlaidLinkContext'

const MONO = { fontFamily: 'JetBrains Mono,monospace' }

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function ConnectAccountOverlay({ message = 'No investment accounts connected', linkMode = 'investments' }) {
  const { openLink, linkLoading } = usePlaidLinkContext()

  return (
    <div className="mb-4 flex flex-col items-center justify-center rounded-[14px] border border-[#e5e7eb] bg-white px-8 py-16 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[10px] bg-[#f3f4f6] text-[#6a7282]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      </div>
      <p className="text-[15px] font-semibold text-[#101828]" style={MONO}>{message}</p>
      <p className="mt-1.5 max-w-[340px] text-[13px] text-[#6a7282]" style={MONO}>
        Connect a brokerage or investment account to see your portfolio, holdings, and performance.
      </p>
      <button
        type="button"
        onClick={() => openLink(linkMode)}
        disabled={linkLoading}
        className="mt-5 flex items-center gap-1.5 rounded-[8px] bg-[#111113] px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-50"
        style={MONO}
      >
        <PlusIcon />
        {linkLoading ? 'Opening…' : 'Connect investment account'}
      </button>
    </div>
  )
}
