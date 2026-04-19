import { useState, useRef, useEffect } from 'react'
import { enterDemoMode } from '../lib/demoMode.js'

const MONO = { fontFamily: 'JetBrains Mono,monospace' }

function WaitlistPopover({ open, onClose, anchorRef }) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState(null) // 'sending' | 'sent' | 'error'
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target) && !anchorRef.current?.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose, anchorRef])

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('sending')
    try {
      await fetch(`https://formsubmit.co/ajax/david.lietjauw@gmail.com`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim(), message: message.trim() || undefined, _subject: 'Abacus Waitlist Signup' }),
      })
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div ref={popoverRef} className="absolute left-0 top-full mt-2 w-80 rounded-xl border border-black/10 bg-white p-4 shadow-xl z-50">
      {status === 'sent' ? (
        <div className="text-center py-2">
          <p className="text-[14px] font-medium text-[#18181b]" style={MONO}>You're on the list!</p>
          <p className="mt-1 text-[12px] text-[#6a7282]" style={MONO}>We'll reach out when Abacus is ready.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <label className="block text-[12px] font-medium text-[#18181b] mb-1.5" style={MONO}>Email address</label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-black/15 px-3 py-2 text-[14px] outline-none focus:border-black/40 transition-colors"
            style={MONO}
            autoFocus
          />
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Feel free to send a message to David"
            rows={3}
            className="mt-2 w-full rounded-lg border border-black/15 px-3 py-2 text-[13px] outline-none focus:border-black/40 transition-colors resize-none"
            style={MONO}
          />
          {status === 'error' && (
            <p className="mt-1.5 text-[11px] text-red-500" style={MONO}>Something went wrong. Please try again.</p>
          )}
          <button
            type="submit"
            disabled={status === 'sending'}
            className="mt-3 w-full rounded-lg bg-black px-4 py-2 text-[13px] font-medium text-white hover:bg-black/80 transition-colors cursor-pointer disabled:opacity-50"
            style={MONO}
          >
            {status === 'sending' ? 'Submitting...' : 'Submit'}
          </button>
        </form>
      )}
    </div>
  )
}

const MCP_URL = 'https://getabacus.xyz/mcp'

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-lg bg-[#101828] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1e293b] transition-colors cursor-pointer"
      style={MONO}
    >
      {copied ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          Copied
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
          Copy
        </>
      )}
    </button>
  )
}

const HERO_IMAGES = ['/hero-demo.png', '/hero-chat.png', '/hero-heatmap.png']

function HeroCarousel() {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setCurrent(i => (i + 1) % HERO_IMAGES.length), 4000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="hidden lg:block flex-shrink-0 w-[480px]">
      <div className="relative">
        {HERO_IMAGES.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            draggable={false}
            className={`w-full rounded-2xl border border-black/10 shadow-xl transition-opacity duration-700 ease-in-out ${i === 0 ? 'relative' : 'absolute top-0 left-0'} ${i === current ? 'opacity-100' : 'opacity-0'}`}
          />
        ))}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
          {HERO_IMAGES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrent(i)}
              className={`w-2 h-2 rounded-full transition-colors cursor-pointer ${i === current ? 'bg-black/70' : 'bg-black/20'}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ConnectClaudeModal({ open, onClose }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-[#e5e7eb] bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-[#6a7282] hover:text-[#18181b] cursor-pointer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        <div className="flex items-center gap-3 border-b border-[#e5e7eb] px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f3f4f6]">
            <img src="/claude-logo.png" alt="Claude" width="20" height="20" />
          </span>
          <h2 className="text-[16px] font-semibold text-[#18181b]" style={MONO}>How to connect to Claude</h2>
        </div>
        <div className="px-5 py-5 space-y-4">
          <ol className="space-y-3 text-[13px] text-[#374151]" style={MONO}>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[11px] font-semibold text-[#6a7282]">1</span>
              <span>Copy the Abacus MCP server URL below.</span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[11px] font-semibold text-[#6a7282]">2</span>
              <span>Visit <a href="https://claude.ai/settings/connectors?modal=add-custom-connector" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">Claude Connectors</a> and paste the URL.</span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[11px] font-semibold text-[#6a7282]">3</span>
              <span>Follow the directions to login and connect your accounts.</span>
            </li>
          </ol>
          <div className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6a7282] mb-2" style={MONO}>Abacus MCP Server URL</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 rounded-md bg-white border border-[#e5e7eb] px-3 py-2 text-[13px] text-[#18181b]" style={MONO}>{MCP_URL}</code>
              <CopyButton text={MCP_URL} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function LoggedOutLandingPage() {
  const [waitlistOpen, setWaitlistOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const waitlistBtnRef = useRef(null)

  return (
    <div className="min-h-screen bg-[#f8f8f8] flex flex-col">
      <nav className="w-full border-b border-black/8 bg-white/60 backdrop-blur-sm">
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center">
          <div className="flex items-center gap-2">
            <img src="/ai-icon.svg" alt="" className="h-7 w-7" />
            <span className="text-[18px] font-semibold text-[#18181b]" style={MONO}>Abacus</span>
          </div>
        </div>
      </nav>
      <div className="flex-1 flex items-center max-w-[1200px] mx-auto px-6 w-full gap-12">
        <div className="flex-1 min-w-0">
          <h1 className="text-[56px] sm:text-[72px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#18181b]" style={MONO}>
            Ask Claude about<br />your money.
          </h1>
          <p className="mt-5 text-[16px] text-[#6a7282]" style={MONO}>
            Abacus generates AI-powered insights about your personal spending, investments, and net-worth.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3 relative">
            <button
              type="button"
              onClick={() => { enterDemoMode(); window.location.replace('/app/get-started') }}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-black border border-black rounded-full text-white font-medium text-lg hover:bg-black/80 transition-colors font-[Roboto,sans-serif] cursor-pointer"
            >
              Try Demo
            </button>
            <button
              ref={waitlistBtnRef}
              type="button"
              onClick={() => setWaitlistOpen(v => !v)}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white border border-black/20 rounded-full text-[#18181b] font-medium text-lg hover:border-black/40 transition-colors font-[Roboto,sans-serif] cursor-pointer"
            >
              Join Waitlist
            </button>
            <button
              type="button"
              onClick={() => setConnectOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white border border-black/20 rounded-full text-[#18181b] font-medium text-lg hover:border-black/40 transition-colors font-[Roboto,sans-serif] cursor-pointer"
            >
              <img src="/claude-logo.png" alt="" className="h-5 w-5" />
              Connect to Claude
            </button>
            <WaitlistPopover open={waitlistOpen} onClose={() => setWaitlistOpen(false)} anchorRef={waitlistBtnRef} />
            <ConnectClaudeModal open={connectOpen} onClose={() => setConnectOpen(false)} />
          </div>
        </div>
        <HeroCarousel />
      </div>
    </div>
  )
}
