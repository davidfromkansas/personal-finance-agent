import { AppHeader } from '../components/AppHeader'
import { SpendingCharts } from '../components/SpendingCharts'
import { useConnections } from '../hooks/usePlaidQueries'

export function SpendingPage() {
  const { data: connectionsData } = useConnections()
  const connections = connectionsData?.connections ?? []

  return (
    <div className="min-h-screen bg-[#f8f8f8]" style={{ paddingLeft: 'var(--sidebar-w)' }}>
      <AppHeader />

      <SpendingCharts connections={connections} standalone />
    </div>
  )
}
