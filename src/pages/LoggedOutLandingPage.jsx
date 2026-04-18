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

export function LoggedOutLandingPage() {
  const [waitlistOpen, setWaitlistOpen] = useState(false)
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
      <div className="flex-1 flex flex-col justify-center max-w-[1200px] mx-auto px-6 w-full">
        <div>
          <h1 className="text-[56px] sm:text-[72px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#18181b]" style={MONO}>
            Ask Claude about<br />your money.
          </h1>
          <p className="mt-5 text-[16px] text-[#6a7282]" style={MONO}>
            Abacus generates AI-powered insights about your personal spending, investments, and net-worth.
          </p>
          <div className="mt-8 flex items-center gap-3 relative">
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
            <WaitlistPopover open={waitlistOpen} onClose={() => setWaitlistOpen(false)} anchorRef={waitlistBtnRef} />
          </div>
        </div>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <img src="/hero-demo.png" alt="Abacus spending visualization" className="w-full rounded-2xl shadow-2xl" />
          <img src="/hero-chat.png" alt="Abacus AI chat analysis" className="w-full rounded-2xl shadow-2xl" />
        </div>
      </div>
    </div>
  )
}
