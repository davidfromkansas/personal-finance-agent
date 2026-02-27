import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import { AppHeader } from '../components/AppHeader'
import { TransactionList } from './LoggedInPage'

export function TransactionsPage() {
  const { getIdToken } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchTransactions = useCallback(async () => {
    try {
      const data = await apiFetch('/api/plaid/transactions?limit=100', { getToken: getIdToken })
      setTransactions(data.transactions ?? [])
    } catch (err) {
      console.error('Failed to load transactions:', err)
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }, [getIdToken])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <AppHeader />
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[700px]">
          <TransactionList
            transactions={transactions}
            loading={loading}
            title="All Transactions"
            subtitle="Complete transaction history across all accounts"
          />
        </div>
      </main>
    </div>
  )
}
