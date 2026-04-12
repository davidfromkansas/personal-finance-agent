import { AppHeader } from '../components/AppHeader'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import releaseNotes from '../../docs/release_notes.md?raw'

const MONO = { fontFamily: 'JetBrains Mono,monospace' }

export function WhatsNewPage() {
  return (
    <div className="min-h-screen bg-[#f8f8f8]" style={{ paddingLeft: 'var(--sidebar-w)' }}>
      <AppHeader />

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <article
          className="prose prose-sm max-w-none"
          style={MONO}
        >
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => {
                const text = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : String(children ?? '')
                const match = text.match(/^(.+?)\s*—\s*Shipped:\s*(.+)$/)
                if (match) {
                  return (
                    <div className="mt-10 mb-4 first:mt-0">
                      <p className="text-[18px] font-bold text-[#18181b] mb-1" style={MONO}>{match[2].trim()}</p>
                      <h1 className="text-[22px] font-bold text-[#18181b] leading-tight" style={MONO}>{match[1].trim()}</h1>
                    </div>
                  )
                }
                return <h1 className="text-[22px] font-bold text-[#18181b] mt-10 mb-3 first:mt-0" style={MONO}>{children}</h1>
              },
              h2: ({ children }) => (
                <h2 className="text-[15px] font-semibold text-[#18181b] mt-6 mb-2" style={MONO}>{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-[13px] font-semibold text-[#374151] mt-4 mb-1" style={MONO}>{children}</h3>
              ),
              p: ({ children }) => (
                <p className="text-[13px] leading-[1.7] text-[#4a5565] mb-3" style={MONO}>{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="text-[13px] leading-[1.7] text-[#4a5565] list-disc pl-5 mb-3 space-y-1" style={MONO}>{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="text-[13px] leading-[1.7] text-[#4a5565] list-decimal pl-5 mb-3 space-y-1" style={MONO}>{children}</ol>
              ),
              li: ({ children }) => (
                <li className="text-[13px] leading-[1.7] text-[#4a5565]" style={MONO}>{children}</li>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-[#18181b]">{children}</strong>
              ),
              hr: () => (
                <hr className="my-8 border-[#e5e7eb]" />
              ),
              code: ({ children }) => (
                <code className="text-[12px] bg-[#f3f4f6] px-1.5 py-0.5 rounded text-[#374151]" style={MONO}>{children}</code>
              ),
              pre: ({ children }) => (
                <pre className="text-[12px] bg-[#f3f4f6] p-4 rounded-lg overflow-x-auto mb-3" style={MONO}>{children}</pre>
              ),
              a: ({ href, children }) => (
                <a href={href} className="text-[#2563eb] hover:underline">{children}</a>
              ),
            }}
          >
            {releaseNotes}
          </Markdown>
        </article>
      </div>
    </div>
  )
}
