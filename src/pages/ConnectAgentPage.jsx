import { useState } from 'react'
import { AppHeader } from '../components/AppHeader'

const MONO = { fontFamily: 'JetBrains Mono,monospace' }
const MCP_URL = 'https://getabacus.xyz/mcp'
const CLAUDE_CODE_CMD = 'claude mcp add --transport http abacus https://getabacus.xyz/mcp'

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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  )
}

function AgentCard({ title, icon, children }) {
  return (
    <div className="rounded-[14px] border border-[#e5e7eb] bg-white overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[#e5e7eb] px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f3f4f6]">
          {icon}
        </span>
        <h2 className="text-[16px] font-semibold text-[#18181b]" style={MONO}>{title}</h2>
      </div>
      <div className="px-5 py-5">
        {children}
      </div>
    </div>
  )
}

export function ConnectAgentPage() {
  return (
    <div className="min-h-screen bg-[#f8f8f8]" style={{ paddingLeft: 'var(--sidebar-w)' }}>
      <AppHeader />

      {/* Page header */}
      <div className="flex items-center justify-between border-b border-[#9ca3af] bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.5px] text-[#18181b]" style={MONO}>
            Connect Agent (MCP)
          </h1>
          <p className="mt-1 text-[13px] text-[#6a7282]" style={MONO}>
            Connect Abacus to your AI agent via the Model Context Protocol
          </p>
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 max-w-xl mx-auto">

          {/* Claude.ai */}
          <AgentCard
            title="Claude.ai (Web App + Mobile)"
            icon={<img src="/claude-logo.png" alt="Claude" width="20" height="20" />}
          >
            <div className="space-y-4">
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
                  <code className="flex-1 rounded-md bg-white border border-[#e5e7eb] px-3 py-2 text-[13px] text-[#18181b]" style={MONO}>
                    {MCP_URL}
                  </code>
                  <CopyButton text={MCP_URL} />
                </div>
              </div>
            </div>
          </AgentCard>

          {/* Claude Code */}
          <AgentCard
            title="Claude Code"
            icon={<img src="/claude-code-logo.png" alt="Claude Code" width="20" height="20" />}
          >
            <div className="space-y-4">
              <ol className="space-y-3 text-[13px] text-[#374151]" style={MONO}>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[11px] font-semibold text-[#6a7282]">1</span>
                  <span>Open your terminal and run the command below to register the Abacus MCP server.</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[11px] font-semibold text-[#6a7282]">2</span>
                  <span>Start a new Claude Code session by running <strong>"claude"</strong> in your terminal.</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[11px] font-semibold text-[#6a7282]">3</span>
                  <span>Claude Code will prompt you to authenticate — a browser window will open for you to sign in with Google.</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[11px] font-semibold text-[#6a7282]">4</span>
                  <span>Once authenticated, Abacus tools will be available in all Claude Code sessions.</span>
                </li>
              </ol>

              <div className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6a7282] mb-2" style={MONO}>Terminal Command</p>
                <div className="flex items-center gap-3">
                  <code className="flex-1 rounded-md bg-white border border-[#e5e7eb] px-3 py-2 text-[13px] text-[#18181b] overflow-x-auto" style={MONO}>
                    {CLAUDE_CODE_CMD}
                  </code>
                  <CopyButton text={CLAUDE_CODE_CMD} />
                </div>
              </div>
            </div>
          </AgentCard>

          {/* ChatGPT */}
          <AgentCard
            title="ChatGPT"
            icon={<img src="/chatgpt-logo.png" alt="ChatGPT" width="20" height="20" />}
          >
            <div className="space-y-4">
              <ol className="space-y-3 text-[13px] text-[#374151]" style={MONO}>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[11px] font-semibold text-[#6a7282]">1</span>
                  <span>Open ChatGPT. Go to <strong>"Settings"</strong>, then <strong>"Apps & Connectors"</strong>, then <strong>"Advanced settings"</strong>.</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[11px] font-semibold text-[#6a7282]">2</span>
                  <span>Enable <strong>"Developer Mode"</strong>.</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[11px] font-semibold text-[#6a7282]">3</span>
                  <span>Go to the <strong>"Connectors"</strong> tab, click <strong>"Create"</strong>, and enter a name, description, and the server URL below.</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[11px] font-semibold text-[#6a7282]">4</span>
                  <span>Complete the OAuth login when prompted to connect your Abacus account.</span>
                </li>
              </ol>

              <div className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6a7282] mb-2" style={MONO}>Abacus MCP Server URL</p>
                <div className="flex items-center gap-3">
                  <code className="flex-1 rounded-md bg-white border border-[#e5e7eb] px-3 py-2 text-[13px] text-[#18181b]" style={MONO}>
                    {MCP_URL}
                  </code>
                  <CopyButton text={MCP_URL} />
                </div>
              </div>
            </div>
          </AgentCard>

        </div>
      </div>
    </div>
  )
}
