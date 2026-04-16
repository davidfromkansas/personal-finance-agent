import { useState, useRef, useEffect } from 'react'
import { AppHeader } from '../components/AppHeader'
import { useAuth } from '../context/AuthContext'
import { isDemoMode } from '../lib/demoMode.js'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'

const MONO = { fontFamily: 'JetBrains Mono,monospace' }
const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')
const CHAT_MODES = ['Auto', 'Transactions', 'Investments', 'Accounts', 'Research']
const CHART_COLORS = ['#60a5fa', '#34d399', '#f472b6', '#fbbf24', '#a78bfa', '#fb923c']

const TOOL_LABELS = {
  get_spending_summary: 'Querying spending summary',
  get_transactions: 'Reading transactions',
  get_cash_flow: 'Fetching cash flow',
  get_portfolio_summary: 'Querying portfolio',
  get_holdings: 'Fetching holdings',
  get_investment_history: 'Fetching investment history',
  get_investment_accounts: 'Loading investment accounts',
  get_holdings_history: 'Fetching holdings history',
  get_accounts: 'Loading accounts',
  get_monthly_spending_by_account: 'Fetching account spending',
  display_data: 'Displaying chart',
  get_current_balances: 'Fetching balances',
  get_net_worth: 'Calculating net worth',
  get_balance_history: 'Fetching balance history',
  get_connected_accounts: 'Loading connected accounts',
  get_market_overview: 'Fetching market overview',
  get_market_movers: 'Loading market movers',
  get_sector_performance: 'Checking sector performance',
  get_stock_quote: 'Fetching stock quote',
  get_stock_fundamentals: 'Analyzing fundamentals',
  get_analyst_ratings: 'Fetching analyst ratings',
  get_insider_activity: 'Checking insider activity',
  get_earnings_data: 'Loading earnings data',
  get_company_news: 'Fetching company news',
  get_market_news: 'Fetching market news',
  get_company_profile: 'Loading company profile',
  get_company_peers: 'Finding company peers',
  get_social_sentiment: 'Checking social sentiment',
  search_symbol: 'Searching symbols',
  get_user_holdings: 'Loading your holdings',
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin shrink-0 text-blue-500" width="10" height="10" viewBox="0 0 10 10" fill="none">
      <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="16" strokeDashoffset="6" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="shrink-0 text-[#9ca3af]" width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ActivitySummary({ steps }) {
  const [expanded, setExpanded] = useState(false)
  if (!steps || steps.length === 0) return null
  return (
    <div className="mb-2 text-[11px]" style={MONO}>
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1 text-white/25 hover:text-white/45 transition-colors cursor-pointer"
      >
        <span>{steps.length} tool{steps.length !== 1 ? 's' : ''} used</span>
        <span className={`transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`} style={{ display: 'inline-block' }}>∨</span>
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1 pl-2 border-l border-black/10">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[#9ca3af]">
              <CheckIcon />
              <span>{s.label}</span>
              {s.count != null && <span className="text-[#d1d5db]">· {s.count} rows</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChartArtifact({ chart_type, title, data, x_key, y_keys, y_label }) {
  if (!data || data.length === 0) return null
  const axisStyle = { fill: '#9ca3af', fontSize: 11, fontFamily: 'JetBrains Mono,monospace' }
  const tooltipStyle = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11, fontFamily: 'JetBrains Mono,monospace' }
  const gridStroke = 'rgba(0,0,0,0.06)'

  return (
    <div className="mt-2 mb-3 rounded-lg bg-[#f9fafb] border border-[#e5e7eb] p-3">
      {title && <p className="text-[11px] text-[#6a7282] mb-2" style={MONO}>{title}</p>}
      <ResponsiveContainer width="100%" height={180}>
        {chart_type === 'bar' ? (
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey={x_key} tick={axisStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}`} label={y_label ? { value: y_label, angle: -90, position: 'insideLeft', style: axisStyle } : undefined} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.05)' }} formatter={v => [`$${parseFloat(v).toFixed(2)}`, '']} />
            {y_keys.map((k, i) => <Bar key={k} dataKey={k} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />)}
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey={x_key} tick={axisStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} label={y_label ? { value: y_label, angle: -90, position: 'insideLeft', style: axisStyle } : undefined} />
            <Tooltip contentStyle={tooltipStyle} />
            {chart_type === 'multi_line' && y_keys.length > 1 && <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono,monospace', color: 'rgba(255,255,255,0.4)' }} />}
            {y_keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i % CHART_COLORS.length]} dot={false} strokeWidth={1.5} />)}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

export function AskAbacusPage() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState('Auto')
  const [loading, setLoading] = useState(false)
  const [activitySteps, setActivitySteps] = useState([])
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const { getIdToken } = useAuth()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, activitySteps])

  async function doSend(text) {
    const history = messages
      .filter((m) => !m.isError && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ role: m.role, content: m.text }))
    setLoading(true)
    setActivitySteps([])

    try {
      const isDemo = isDemoMode()

      if (isDemo) {
        // Fully client-side demo chat — no server needed
        const { getDemoChatEvents } = await import('../lib/demoData.js')
        const events = getDemoChatEvents(text)
        let replyText = ''
        let finalSteps = []
        let artifacts = []

        for (const event of events) {
          await new Promise(r => setTimeout(r, event.type === 'text' ? 30 : event.type === 'tool_call' ? 200 : event.type === 'tool_done' ? 300 : 0))
          if (event.type === 'tool_call') {
            const step = { callId: event.callId, tool: event.tool, label: TOOL_LABELS[event.tool] ?? event.tool, status: 'active' }
            finalSteps = [...finalSteps, step]
            setActivitySteps([...finalSteps])
          } else if (event.type === 'tool_done') {
            finalSteps = finalSteps.map(s => s.callId === event.callId ? { ...s, status: 'done', count: event.count } : s)
            setActivitySteps([...finalSteps])
          } else if (event.type === 'artifact') {
            artifacts = [...artifacts, event]
          } else if (event.type === 'text') {
            replyText += event.text
          }
        }

        setMessages((prev) => [...prev, { role: 'assistant', text: replyText, activity: finalSteps, artifacts }])
      } else {
        const token = await getIdToken()
        const fetchOptions = {
          url: `${API_BASE}/api/agent/chat`,
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({ message: text, history, mode }),
        }

        const res = await fetch(fetchOptions.url, {
          method: 'POST',
          headers: fetchOptions.headers,
          body: fetchOptions.body,
        })
        if (!res.ok) throw new Error('Chat request failed')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let replyText = ''
        let finalSteps = []
        let artifacts = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            let event
            try { event = JSON.parse(line.slice(6)) } catch { continue }

            if (event.type === 'tool_call') {
              const step = { callId: event.callId, tool: event.tool, label: TOOL_LABELS[event.tool] ?? event.tool, status: 'active' }
              finalSteps = [...finalSteps, step]
              setActivitySteps([...finalSteps])
            } else if (event.type === 'tool_done') {
              finalSteps = finalSteps.map(s => s.callId === event.callId ? { ...s, status: 'done', count: event.count } : s)
              setActivitySteps([...finalSteps])
            } else if (event.type === 'artifact') {
              artifacts = [...artifacts, event]
            } else if (event.type === 'text') {
              replyText += event.text
            }
          }
        }

        setMessages((prev) => [...prev, { role: 'assistant', text: replyText, activity: finalSteps, artifacts }])
      }
    } catch (err) {
      console.error('Chat error:', err)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Something went wrong. Please try again.', isError: true },
      ])
    } finally {
      setLoading(false)
    }
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return
    setMessages((prev) => [...prev, { role: 'user', text }])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await doSend(text)
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
    <div className="min-h-screen bg-[#f8f8f8]" style={{ paddingLeft: 'var(--sidebar-w)' }}>
      <AppHeader />

      <div className="flex h-screen flex-col">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center pt-12 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/5 mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-[#6a7282]">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                </div>
                <h2 className="text-[16px] font-semibold text-[#18181b]" style={MONO}>Ask Abacus</h2>
                <p className="mt-1 text-[12px] text-[#9ca3af] max-w-sm" style={MONO}>
                  Your finances, investments, cash flow, and market research — all in one conversation.
                </p>

                <div className="mt-4 w-full max-w-lg grid grid-cols-2 gap-2" style={MONO}>
                  <div className="flex items-start gap-2 rounded-lg bg-white border border-[#9ca3af] px-3 py-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-[#9ca3af]"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    <div className="text-left">
                      <p className="text-[11px] font-semibold text-[#374151]">Your data only</p>
                      <p className="text-[10px] text-[#9ca3af] leading-[1.4]">Answers from connected accounts and transactions</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg bg-white border border-[#9ca3af] px-3 py-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-[#9ca3af]"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                    <div className="text-left">
                      <p className="text-[11px] font-semibold text-[#374151]">Market research</p>
                      <p className="text-[10px] text-[#9ca3af] leading-[1.4]">Quotes, analyst ratings, news, and earnings built in</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg bg-white border border-[#9ca3af] px-3 py-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-[#9ca3af]"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
                    <div className="text-left">
                      <p className="text-[11px] font-semibold text-[#374151]">No web browsing</p>
                      <p className="text-[10px] text-[#9ca3af] leading-[1.4]">Cannot visit URLs or pull from external sources</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg bg-white border border-[#9ca3af] px-3 py-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-[#9ca3af]"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                    <div className="text-left">
                      <p className="text-[11px] font-semibold text-[#374151]">Read-only</p>
                      <p className="text-[10px] text-[#9ca3af] leading-[1.4]">Can never move money, make trades, or modify accounts</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 w-full max-w-lg flex flex-col gap-1.5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af] mb-0.5" style={MONO}>Try asking</h3>
                  {[
                    'Full financial snapshot — balances, net worth, and where my money went this month',
                    'Visualize my spending for the last 30 days — biggest purchases and top categories',
                    'Portfolio performance over the past 2 weeks and biggest drivers of change',
                    'How has my savings rate changed over the past 3 months?',
                    'How has my coffee spending varied over time?',
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => { setMessages([{ role: 'user', text: q }]); doSend(q) }}
                      className="group flex items-center gap-3 rounded-lg border border-[#9ca3af] bg-white px-3.5 py-2 text-left text-[11px] leading-[1.4] text-[#374151] hover:border-[#6a7282] hover:bg-[#f9fafb] transition-colors cursor-pointer"
                      style={MONO}
                    >
                      <span className="flex-1">{q}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#d1d5db] group-hover:text-[#6a7282] transition-colors">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-lg px-4 py-3 text-[13px] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#111113] text-white'
                      : m.isError
                      ? 'bg-red-50 text-red-600 border border-red-200'
                      : 'bg-white text-[#374151] border border-[#e5e7eb]'
                  }`}
                  style={MONO}
                >
                  {m.role === 'user' || m.isError ? m.text : (
                    <>
                      <ActivitySummary steps={m.activity} />
                      {m.artifacts?.map((a, j) => (
                        <ChartArtifact key={j} {...a} />
                      ))}
                      <Markdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold text-[#18181b]">{children}</strong>,
                          table: ({ children }) => <table className="border-collapse text-[12px] my-1 w-full">{children}</table>,
                          th: ({ children }) => <th className="border border-[#e5e7eb] px-2 py-1 text-left bg-[#f9fafb]">{children}</th>,
                          td: ({ children }) => <td className="border border-[#e5e7eb] px-2 py-1">{children}</td>,
                          ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                          li: ({ children }) => <li className="mb-1">{children}</li>,
                        }}
                      >
                        {m.text}
                      </Markdown>
                    </>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                {activitySteps.length === 0 ? (
                  <div className="rounded-lg px-3 py-2 text-[18px] bg-white text-[#9ca3af] border border-[#e5e7eb]" style={MONO}>
                    <span className="inline-flex gap-1">
                      <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                      <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                      <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
                    </span>
                  </div>
                ) : (
                  <div className="max-w-[75%] rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 space-y-1.5" style={MONO}>
                    {activitySteps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        {step.status === 'active' ? <SpinnerIcon /> : <CheckIcon />}
                        <span className={step.status === 'active' ? 'text-[#374151]' : 'text-[#9ca3af]'}>
                          {step.label}
                        </span>
                        {step.count != null && (
                          <span className="text-[#d1d5db] ml-1">· {step.count} rows</span>
                        )}
                      </div>
                    ))}
                    {activitySteps.every(s => s.status === 'done') && (
                      <div className="flex items-center gap-2 text-[11px] pt-1 border-t border-[#e5e7eb] mt-1">
                        <SpinnerIcon />
                        <span className="text-[#6a7282] animate-pulse">Putting it all together...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-[#e5e7eb] bg-white px-6 py-4">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] focus-within:border-[#9ca3af] transition-colors">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Message..."
                className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[13px] text-[#18181b] placeholder-[#9ca3af] outline-none overflow-hidden"
                style={MONO}
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <div className="flex items-center gap-0.5 rounded-lg bg-black/5 p-0.5">
                  {CHAT_MODES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`rounded-md px-2 py-1 text-[11px] leading-none transition-colors cursor-pointer ${
                        mode === m ? 'bg-[#111113] text-white' : 'text-[#6a7282] hover:text-[#18181b]'
                      }`}
                      style={MONO}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={loading}
                  className="rounded-lg bg-[#111113] px-3 py-1.5 text-[12px] text-white transition-opacity hover:bg-[#1e293b] cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  style={MONO}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
