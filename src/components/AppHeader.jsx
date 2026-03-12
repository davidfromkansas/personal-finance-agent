import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import Markdown from 'react-markdown'

function NavigationArrowIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="10 10 36 36" width="16" height="16" className={className}>
      <path d="M42 14 L14 28 L28 32 L32 42 Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

function DocumentIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" className={className}>
      <path d="M6 2h8l6 6v14a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 13h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 17h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CreditCardNavIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" className={className}>
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="2" />
      <rect x="5" y="13" width="5" height="2" rx="1" fill="currentColor" />
    </svg>
  )
}

function LayersIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" className={className}>
      <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" />
      <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/app', icon: NavigationArrowIcon },
  { label: 'Transactions', path: '/app/transactions', icon: LayersIcon },
  { label: 'Investments', path: '/app/investments', icon: DocumentIcon },
  { label: 'Accounts', path: '/app/accounts', icon: CreditCardNavIcon },
]

function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 8C22.06 8 14 16.06 14 26C14 32.14 17.09 37.55 21.82 40.73C23.19 41.65 24 43.19 24 44.83V48C24 49.1 24.9 50 26 50H38C39.1 50 40 49.1 40 48V44.83C40 43.19 40.81 41.65 42.18 40.73C46.91 37.55 50 32.14 50 26C50 16.06 41.94 8 32 8Z" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="27" y1="54" x2="37" y2="54" stroke="white" strokeWidth="3" strokeLinecap="round"/>
      <line x1="29" y1="58" x2="35" y2="58" stroke="white" strokeWidth="3" strokeLinecap="round"/>
      <path d="M25 28L29 36L32 30L35 36L39 28" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="32" y1="2" x2="32" y2="5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <line x1="12" y1="12" x2="14" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <line x1="50" y1="12" x2="52" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

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

    // Build history from current messages before adding the new user message
    const history = messages
      .filter((m) => !m.isError && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ role: m.role, content: m.text }))

    setMessages((prev) => [...prev, { role: 'user', text }])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)

    try {
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
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed left-0 top-0 z-50 flex h-full w-1/3 flex-col border-r border-[#d9d9d9] bg-white shadow-xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#d9d9d9] px-5 py-4">
          <span className="text-[16px] font-normal text-[#1e1e1e]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
            Assistant
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[#999] hover:text-[#1e1e1e] transition-colors text-xl leading-none cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-[14px] text-[#999]" style={{ fontFamily: 'JetBrains Mono,monospace' }}>
              Ask me anything about your finances.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-[14px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[#1e1e1e] text-white'
                    : m.isError
                    ? 'bg-[#fff0f0] text-[#cc0000]'
                    : 'bg-[#f5f5f5] text-[#1e1e1e]'
                }`}
                style={{ fontFamily: 'JetBrains Mono,monospace' }}
              >
                {m.role === 'user' || m.isError ? m.text : (
                  <Markdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      table: ({ children }) => <table className="border-collapse text-[13px] my-1 w-full">{children}</table>,
                      th: ({ children }) => <th className="border border-[#d9d9d9] px-2 py-1 text-left bg-[#ebebeb]">{children}</th>,
                      td: ({ children }) => <td className="border border-[#d9d9d9] px-2 py-1">{children}</td>,
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
              <div
                className="rounded-lg px-3 py-2 text-[18px] bg-[#f5f5f5] text-[#999]"
                style={{ fontFamily: 'JetBrains Mono,monospace' }}
              >
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

        {/* Input */}
        <div className="border-t border-[#d9d9d9] px-5 py-4">
          <div className="rounded-xl border border-[#d9d9d9] bg-white focus-within:border-[#1e1e1e] transition-colors">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14px] text-[#1e1e1e] placeholder-[#999] outline-none overflow-hidden"
              style={{ fontFamily: 'JetBrains Mono,monospace' }}
            />
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-0.5 rounded-lg bg-[#f5f5f5] p-0.5">
                {CHAT_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-md px-2 py-1 text-[11px] leading-none transition-colors cursor-pointer ${
                      mode === m
                        ? 'bg-[#0066CC] text-white'
                        : 'text-[#666] hover:text-[#1e1e1e]'
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
                className="rounded-lg bg-[#1e1e1e] px-3 py-1.5 text-[13px] text-white transition-opacity hover:opacity-80 cursor-pointer disabled:opacity-40 disabled:cursor-default"
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

export function AppHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()
  const [chatOpen, setChatOpen] = useState(false)

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <>
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
      <header className="sticky top-0 z-30 border-b border-[#d9d9d9] bg-white">
        <div className="flex w-full items-center justify-between px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => setChatOpen((o) => !o)}
            className="flex items-center justify-center rounded-full bg-[#0066CC] p-1.5 shadow-md transition-opacity hover:opacity-85 cursor-pointer"
          >
            <Logo />
          </button>
          <div className="flex items-center gap-2.5">
            {NAV_ITEMS.map(({ label, path, icon: Icon }) => {
              const isActive = path && location.pathname === path
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => path && navigate(path)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-[16px] font-normal leading-none transition-colors ${
                    isActive
                      ? 'border-[#1e1e1e] bg-[#1e1e1e] text-white'
                      : 'border-[#d9d9d9] bg-white text-[#1e1e1e] hover:bg-black/5'
                  } ${!path ? 'opacity-50 cursor-default' : 'cursor-pointer'}`}
                  style={{ fontFamily: 'JetBrains Mono,monospace' }}
                >
                  {Icon && <Icon />}
                  {label}
                </button>
              )
            })}
            <div className="mx-1 h-8 w-px bg-[#d9d9d9]" />
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg bg-[#FF3B30] px-3 py-2.5 text-[16px] font-normal leading-none text-white transition-opacity hover:opacity-90 cursor-pointer"
              style={{ fontFamily: 'JetBrains Mono,monospace' }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>
    </>
  )
}
