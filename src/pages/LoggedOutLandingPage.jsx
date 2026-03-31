import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { GoogleLogo } from '../components/GoogleLogo'
import { enterDemoMode } from '../lib/demoMode.js'

const INSTALL_TABS = ['CLI', 'MCP']

export function LoggedOutLandingPage() {
  const { signInWithGoogle } = useAuth()
  const [authError, setAuthError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [installTab, setInstallTab] = useState('CLI')
  const [copied, setCopied] = useState(null)

  function handleCopy(text, key) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  async function handleContinueWithGoogle(e) {
    e.preventDefault()
    setAuthError(null)
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setAuthError(err?.message ?? 'Sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        {authError && (
          <p role="alert" className="text-center text-sm text-red-600 font-[Roboto,sans-serif]">
            {authError}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleContinueWithGoogle}
            disabled={loading}
            className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-white border border-black rounded-full text-black font-medium text-lg hover:bg-gray-50 transition-colors font-[Roboto,sans-serif] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <GoogleLogo />
            {loading ? 'Signing in…' : 'Continue with Google'}
          </button>
          <button
            type="button"
            onClick={() => { enterDemoMode(); window.location.replace('/app') }}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-transparent border border-black/20 rounded-full text-black/60 font-medium text-lg hover:border-black/40 hover:text-black/80 transition-colors font-[Roboto,sans-serif] cursor-pointer"
          >
            Try Demo
          </button>
        </div>
        {/* Install tabs */}
        <div className="w-full max-w-md mt-2 overflow-hidden" style={{ height: '820px' }}>
          <div className="flex gap-2 mb-3">
            {INSTALL_TABS.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setInstallTab(t)}
                className={`px-4 py-2 rounded-full text-sm font-medium font-[Roboto,sans-serif] transition-colors cursor-pointer border ${
                  installTab === t
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-black border-black/20 hover:border-black/40'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {installTab === 'CLI' && (
            <div>
            <h3 className="text-lg font-semibold text-black font-[Roboto,sans-serif] mb-2">Install the CLI via NPM (macOS, Linux, Windows)</h3>
            <div className="bg-white border border-black/10 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-black/10">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-black/30">
                  <path d="M2 4l4 4-4 4M8 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <button type="button" onClick={() => handleCopy('npm install -g abacus-agent', 'install')} className="text-black/30 hover:text-black/60 transition-colors cursor-pointer">
                  {copied === 'install' ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M11 5V4a1 1 0 00-1-1H4a1 1 0 00-1 1v6a1 1 0 001 1h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  )}
                </button>
              </div>
              <div className="px-5 py-3">
                <code className="text-sm font-mono">
                  <span className="text-orange-500">npm</span>
                  <span className="text-black/60"> install -g abacus-agent</span>
                </code>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-black font-[Roboto,sans-serif] mt-4 mb-2">After installing CLI, authenticate with your Abacus account:</h3>
            <div className="bg-white border border-black/10 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-black/10">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-black/30">
                  <path d="M2 4l4 4-4 4M8 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <button type="button" onClick={() => handleCopy('abacus login', 'login')} className="text-black/30 hover:text-black/60 transition-colors cursor-pointer">
                  {copied === 'login' ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M11 5V4a1 1 0 00-1-1H4a1 1 0 00-1 1v6a1 1 0 001 1h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  )}
                </button>
              </div>
              <div className="px-5 py-3">
                <code className="text-sm font-mono">
                  <span className="text-orange-500">abacus</span>
                  <span className="text-black/60"> login</span>
                </code>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-black font-[Roboto,sans-serif] mt-4 mb-2">Ask a question</h3>
            <div className="bg-white border border-black/10 rounded-2xl overflow-hidden">
              <div className="flex items-center px-4 py-2 border-b border-black/10">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-black/30">
                  <path d="M2 4l4 4-4 4M8 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="px-5 py-3 flex flex-col gap-2">
                <div className="text-sm font-mono">
                  <span className="text-orange-500">abacus</span>
                  <span className="text-black/60"> "How much did I spend on Uber in January vs February?"</span>
                </div>
                <div className="text-sm font-mono text-black/30 pl-0">
                  # or launch the interactive REPL for a full conversation
                </div>
                <div className="text-sm font-mono">
                  <span className="text-orange-500">abacus</span>
                </div>
                <div className="text-sm font-mono text-black/50 mt-1">› What did I spend on food last month?</div>
                <div className="text-sm font-mono text-black/40 mt-1">
                  <div>• Spending ("Summarize food spending in February 2026")</div>
                  <div className="pl-4">↳ spending summary</div>
                  <div>└ Called 1 data source in 2.1s</div>
                </div>
                <div className="text-sm font-mono text-black/70 mt-2">You spent $843.20 on Food &amp; Drink in February — up from $710.50 in January, driven mostly by a few larger restaurant bills mid-month.</div>
              </div>
            </div>
            </div>
          )}
          {installTab === 'MCP' && (
            <div className="bg-white border border-black/10 rounded-2xl px-6 py-4">
              <code className="text-sm font-mono text-black/70 whitespace-pre">{`{
  "mcpServers": {
    "abacus": {
      "url": "https://abacus-money.com/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}`}</code>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
