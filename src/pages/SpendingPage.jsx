import { AppHeader } from '../components/AppHeader'
import { SpendingCharts } from '../components/SpendingCharts'
import { RecurringCalendar } from '../components/RecurringCalendar'
import { useConnections } from '../hooks/usePlaidQueries'

export function SpendingPage() {
  const { data: connectionsData } = useConnections()
  const connections = connectionsData?.connections ?? []

  return (
    <div className="min-h-screen bg-[#f8f8f8]" style={{ paddingLeft: 'var(--sidebar-w)' }}>
      <AppHeader />

      <div className="border-b border-[#9ca3af] bg-white px-4 py-4 sm:px-6 lg:px-8">
        <h1 className="text-[24px] font-semibold">Spending</h1>
      </div>

      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[960px]">
          <SpendingCharts connections={connections} standalone />
          <div className="mt-6">
            <RecurringCalendar />
          </div>
        </div>
      </main>
    </div>
  )
}
