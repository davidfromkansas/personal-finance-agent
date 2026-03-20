import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import { isDemoMode } from '../lib/demoMode.js'
import Markdown from 'react-markdown'

function DashboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  )
}

function TransactionsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <rect x="5" y="13" width="5" height="2" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function InvestmentsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  )
}

function AccountsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 12l10 5 10-5" />
      <path d="M2 17l10 5 10-5" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function SidebarToggleIcon({ collapsed }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      {collapsed
        ? <path d="M13 9l3 3-3 3" />
        : <path d="M15 9l-3 3 3 3" />
      }
    </svg>
  )
}

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/app', icon: DashboardIcon },
  { label: 'Transactions', path: '/app/transactions', icon: TransactionsIcon },
  { label: 'Investments', path: '/app/investments', icon: InvestmentsIcon },
  { label: 'Accounts', path: '/app/accounts', icon: AccountsIcon },
]

const CHAT_MODES = ['Auto', 'Transactions', 'Investments', 'Accounts']

function ChatPanel({ open, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState('Auto')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const { getIdToken } = useAuth()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    const history = messages
      .filter((m) => !m.isError && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ role: m.role, content: m.text }))

    setMessages((prev) => [...prev, { role: 'user', text }])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)

    try {
      if (isDemoMode()) {
        const { getDemoAgentContext } = await import('../lib/demoData.js')
        const demoContext = getDemoAgentContext()
        const apiBase = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')
        const res = await fetch(`${apiBase}/api/agent/chat-demo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history, mode, demoContext }),
        })
        if (!res.ok) throw new Error('Demo chat request failed')
        const { reply } = await res.json()
        setMessages((prev) => [...prev, { role: 'assistant', text: reply }])
        return
      }
      const { reply } = await apiFetch('/api/agent/chat', {
        method: 'POST',
        body: { message: text, history, mode },
        getToken: getIdToken,
      })
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }])
    } catch (err) {
      console.error('[agent chat error]', err)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Something went wrong. Please try again.', isError: true },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInput(e) {
    const el = e.target
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
    setInput(el.value)
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      )}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-[585px] flex-col border-l border-white/15 bg-slate-900/95 backdrop-blur-xl shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/15 px-5 py-4">
          <span className="text-[15px] font-semibold text-white" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            Assistant
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors text-xl leading-none cursor-pointer"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-[13px] text-white/40" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              Ask me anything about your finances.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-white/20 text-white'
                    : m.isError
                    ? 'bg-red-950/50 text-red-300'
                    : 'bg-white/8 text-white/85'
                }`}
                style={{ fontFamily: 'JetBrains Mono,monospace' }}
              >
                {m.role === 'user' || m.isError ? m.text : (
                  <Markdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      table: ({ children }) => <table className="border-collapse text-[12px] my-1 w-full">{children}</table>,
                      th: ({ children }) => <th className="border border-white/20 px-2 py-1 text-left bg-white/10">{children}</th>,
                      td: ({ children }) => <td className="border border-white/15 px-2 py-1">{children}</td>,
                      ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                      li: ({ children }) => <li className="mb-1">{children}</li>,
                    }}
                  >
                    {m.text}
                  </Markdown>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-lg px-3 py-2 text-[18px] bg-white/8 text-white/40" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                <span className="inline-flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-white/15 px-5 py-4">
          <div className="rounded-xl border border-white/20 bg-white/8 focus-within:border-white/40 transition-colors">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[13px] text-white placeholder-white/30 outline-none overflow-hidden"
              style={{ fontFamily: 'JetBrains Mono,monospace' }}
            />
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-0.5 rounded-lg bg-white/8 p-0.5">
                {CHAT_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-md px-2 py-1 text-[11px] leading-none transition-colors cursor-pointer ${
                      mode === m ? 'bg-[#0066CC] text-white' : 'text-white/40 hover:text-white'
                    }`}
                    style={{ fontFamily: 'JetBrains Mono,monospace' }}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleSend}
                disabled={loading}
                className="rounded-lg bg-white/15 px-3 py-1.5 text-[12px] text-white transition-opacity hover:bg-white/25 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                style={{ fontFamily: 'JetBrains Mono,monospace' }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

const SIDEBAR_EXPANDED = 220
const SIDEBAR_COLLAPSED = 64
const ANIM_MS = 220

export function AppHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()
  const isCurrentlyCollapsed = document.documentElement.style.getPropertyValue('--sidebar-w') === `${SIDEBAR_COLLAPSED}px`
  const collapsedRef = useRef(isCurrentlyCollapsed)
  const [collapsed, setCollapsed] = useState(isCurrentlyCollapsed) // only for toggle icon
  const [layout, setLayout] = useState(isCurrentlyCollapsed)       // only for label opacity
  const [chatOpen, setChatOpen] = useState(false)

  function handleToggle() {
    const next = !collapsedRef.current
    collapsedRef.current = next
    setCollapsed(next)

    // One CSS variable change — @property on :root interpolates it natively.
    // All consumers (sidebar width, page padding) animate in perfect sync,
    // zero JS runs during the animation.
    document.documentElement.style.setProperty(
      '--sidebar-w',
      next ? `${SIDEBAR_COLLAPSED}px` : `${SIDEBAR_EXPANDED}px`
    )

    if (next) {
      setTimeout(() => setLayout(true), ANIM_MS)
    } else {
      setTimeout(() => setLayout(false), ANIM_MS)
    }
  }

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <>
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />

      {/* Floating agent trigger */}
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#18181b] text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl cursor-pointer"
        title="Open assistant"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </button>

      <aside
        className="fixed left-0 top-0 z-30 flex h-full flex-col bg-[#f8f8f8] border-r border-black/8 overflow-hidden"
        style={{ width: 'var(--sidebar-w)', willChange: 'width' }}
      >
        {/* Brand row — pill is absolute so it never crowds the toggle button */}
        <div className="relative flex items-center justify-center px-2 pt-5 pb-2" style={{ minHeight: 44 }}>
          <span
            className="absolute left-3 rounded-full bg-black px-3.5 py-1.5 text-[13px] font-semibold text-white tracking-tight whitespace-nowrap"
            style={{
              fontFamily: 'JetBrains Mono,monospace',
              opacity: layout ? 0 : 1,
              transition: `opacity ${ANIM_MS * 0.4}ms ease`,
              pointerEvents: layout ? 'none' : 'auto',
            }}
          >
            Abacus
          </span>
          <button
            type="button"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={handleToggle}
            className="relative flex h-7 w-7 items-center justify-center rounded-lg text-black/25 hover:bg-black/6 hover:text-black/50 transition-colors cursor-pointer shrink-0"
          >
            <SidebarToggleIcon collapsed={collapsed} />
          </button>
        </div>

        {/* Nav — icon always at fixed left position, label fades */}
        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ label, path, icon: Icon }) => {
            const isActive = path && location.pathname === path
            return (
              <button
                key={label}
                type="button"
                onClick={() => path && navigate(path)}
                title={layout ? label : undefined}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-black/8 text-[#111113]'
                    : 'text-[#111113] hover:bg-black/5'
                }`}
                style={{ fontFamily: 'JetBrains Mono,monospace' }}
              >
                <span className="shrink-0 text-[#111113] transition-colors">
                  <Icon />
                </span>
                <span
                  className="whitespace-nowrap overflow-hidden"
                  style={{
                    opacity: layout ? 0 : 1,
                    transition: `opacity ${ANIM_MS * 0.4}ms ease`,
                    pointerEvents: 'none',
                  }}
                >
                  {label}
                </span>
              </button>
            )
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 pb-5 flex flex-col gap-1">
          {/* Demo mode badge */}
          {isDemoMode() && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200"
              style={{
                opacity: layout ? 0 : 1,
                transition: `opacity ${ANIM_MS * 0.4}ms ease`,
              }}
            >
              <span className="shrink-0 h-2 w-2 rounded-full bg-amber-400" />
              <span className="text-[11px] font-semibold text-amber-700 whitespace-nowrap overflow-hidden" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
                Demo mode
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium text-[#111113] hover:bg-black/5 transition-colors cursor-pointer"
            style={{ fontFamily: 'JetBrains Mono,monospace' }}
            title={isDemoMode() && layout ? 'Exit Demo' : undefined}
          >
            <span className="shrink-0 text-[#111113]">
              <LogoutIcon />
            </span>
            <span
              className="whitespace-nowrap overflow-hidden"
              style={{
                opacity: layout ? 0 : 1,
                transition: `opacity ${ANIM_MS * 0.4}ms ease`,
                pointerEvents: 'none',
              }}
            >
              {isDemoMode() ? 'Exit Demo' : 'Logout'}
            </span>
          </button>
        </div>
      </aside>
    </>
  )
}
