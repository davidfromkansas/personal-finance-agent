import { AppHeader } from '../components/AppHeader'
import { RecurringCalendar } from '../components/RecurringCalendar'

export function RecurringPage() {
  return (
    <div className="min-h-screen bg-[#f8f8f8]" style={{ paddingLeft: 'var(--sidebar-w)' }}>
      <AppHeader />

      <div className="flex items-center justify-between border-b border-[#9ca3af] bg-white px-4 py-4 sm:px-6 lg:px-8">
        <h1 className="text-[24px] font-semibold">Recurring Payments</h1>
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('open-assistant', {
              detail: { prompt: 'Summarize my recurring payments. List all active subscriptions and recurring bills, their amounts, and frequencies. Highlight any that seem unusually high or that I might want to review.' },
            }))
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-[#3d3d42] hover:opacity-80 transition-opacity cursor-pointer"
          title="Ask Abacus about recurring payments"
        >
          <img src="/ai-icon.svg" alt="" className="h-5 w-5" />
          <span className="text-[12px] font-semibold text-white" style={{ fontFamily: 'JetBrains Mono,monospace' }}>Ask Abacus</span>
        </button>
      </div>

      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[960px]">
          <RecurringCalendar />
        </div>
      </main>
    </div>
  )
}
