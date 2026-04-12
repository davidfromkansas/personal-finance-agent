/**
 * PlaidLinkContext — shared Plaid Link trigger usable by any component.
 * Owns the linkToken + PlaidLinkOpener so the onboarding modal and
 * per-chart overlays can open Plaid without going through LoggedInPage.
 */
import { createContext, useContext, useState, useCallback, memo, useEffect } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { useAuth } from './AuthContext'
import { apiFetch } from '../lib/api'
import { useConnections, invalidateAfterConnect } from '../hooks/usePlaidQueries'
import queryClient from '../lib/queryClient'

const MONO = { fontFamily: 'JetBrains Mono,monospace' }
const PlaidLinkContext = createContext(null)

export function usePlaidLinkContext() {
  return useContext(PlaidLinkContext)
}

const PlaidLinkOpener = memo(function PlaidLinkOpener({ token, receivedRedirectUri, onSuccess, onExit, onReady }) {
  const config = { token, onSuccess, onExit, onEvent: () => {} }
  if (receivedRedirectUri) config.receivedRedirectUri = receivedRedirectUri
  const { open, ready } = usePlaidLink(config)
  useEffect(() => { if (ready) { onReady?.(); open() } }, [ready, open, onReady])
  return null
})

function ConnectionTypeModal({ onSelect, onClose, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-[14px] bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[18px] font-semibold tracking-tight text-[#101828]" style={MONO}>
          What do you want to connect?
        </h3>
        <p className="mt-1 text-[14px] text-[#6a7282]" style={MONO}>
          Choose the type of accounts to link. Plaid will open next.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => onSelect('add')}
            disabled={loading}
            className="flex items-center gap-4 rounded-[10px] border border-[#9ca3af] bg-white px-4 py-3 text-left transition-colors hover:bg-[#f9fafb] disabled:opacity-60 cursor-pointer"
            style={MONO}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#dbeafe] text-[#1e40af]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M3 10h18" /><path d="M5 6l7-3 7 3" /><line x1="4" y1="10" x2="4" y2="21" /><line x1="20" y1="10" x2="20" y2="21" /><line x1="8" y1="14" x2="8" y2="17" /><line x1="12" y1="14" x2="12" y2="17" /><line x1="16" y1="14" x2="16" y2="17" /></svg>
            </span>
            <div>
              <p className="font-medium text-[#101828]">Credit Cards, Checking and Savings</p>
              <p className="text-[12px] text-[#6a7282]">Link bank and credit card accounts</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onSelect('investments')}
            disabled={loading}
            className="flex items-center gap-4 rounded-[10px] border border-[#9ca3af] bg-white px-4 py-3 text-left transition-colors hover:bg-[#f9fafb] disabled:opacity-60 cursor-pointer"
            style={MONO}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#dbeafe] text-[#1e40af]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
            </span>
            <div>
              <p className="font-medium text-[#101828]">Investments</p>
              <p className="text-[12px] text-[#6a7282]">Link brokerage, IRA, and investment accounts</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

export function PlaidLinkProvider({ children, onConnectSuccess }) {
  const { getIdToken } = useAuth()
  const [linkToken, setLinkToken] = useState(null)
  const [linkMode, setLinkMode] = useState('add')
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkError, setLinkError] = useState(null)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [waitingForSync, setWaitingForSync] = useState(false)
  const { data: connectionsData } = useConnections({
    refetchInterval: waitingForSync ? 3000 : false,
  })

  // When sync completes (no connections still syncing), invalidate all queries
  useEffect(() => {
    if (!waitingForSync) return
    const connections = connectionsData?.connections ?? []
    if (connections.length > 0 && !connections.some(c => c.syncing)) {
      setWaitingForSync(false)
      invalidateAfterConnect()
    }
  }, [waitingForSync, connectionsData])

  const startLink = useCallback(async (mode) => {
    if (linkLoading) return
    setShowTypeModal(false)
    setLinkToken(null)
    setLinkError(null)
    setLinkMode(mode)
    setLinkLoading(true)
    try {
      const body = mode === 'investments' ? { link_mode: 'investments' } : undefined
      const data = await apiFetch('/api/plaid/link-token', { method: 'POST', body, getToken: getIdToken })
      if (data.link_token) setLinkToken(data.link_token)
      else { setLinkError('Could not start connection'); setLinkLoading(false) }
    } catch (err) {
      setLinkError(err.message ?? 'Could not start connection')
      setLinkLoading(false)
    }
  }, [getIdToken, linkLoading])

  const openLink = useCallback((mode) => {
    if (mode === 'add' || mode === 'investments') {
      startLink(mode)
    } else {
      // No explicit mode — show the account type chooser
      setShowTypeModal(true)
    }
  }, [startLink])

  const reconnect = useCallback(async (itemId) => {
    if (linkLoading) return
    setLinkToken(null)
    setLinkError(null)
    setLinkMode('reconnect')
    setLinkLoading(true)
    try {
      const data = await apiFetch('/api/plaid/link-token/update', {
        method: 'POST',
        body: { item_id: itemId },
        getToken: getIdToken,
      })
      if (data.link_token) setLinkToken(data.link_token)
      else { setLinkError('Could not start reconnection'); setLinkLoading(false) }
    } catch (err) {
      setLinkError(err.message ?? 'Could not start reconnection')
      setLinkLoading(false)
    }
  }, [getIdToken, linkLoading])

  const handleSuccess = useCallback(async (public_token, metadata) => {
    setLinkError(null)
    try {
      if (linkMode === 'reconnect') {
        // Reconnect mode — trigger sync to clear error state and refresh data
        await apiFetch('/api/plaid/sync', { method: 'POST', getToken: getIdToken })
        await queryClient.refetchQueries({ queryKey: ['connections'] })
        invalidateAfterConnect()
      } else {
        await apiFetch('/api/plaid/exchange-token', {
          method: 'POST',
          body: { public_token, institution_name: metadata?.institution?.name ?? null },
          getToken: getIdToken,
        })
        await queryClient.refetchQueries({ queryKey: ['connections'] })
        setWaitingForSync(true)
        onConnectSuccess?.()
      }
    } catch (err) {
      setLinkError(err.message ?? 'Failed to add connection')
    } finally {
      setLinkToken(null)
      setLinkMode('add')
      setLinkLoading(false)
    }
  }, [getIdToken, onConnectSuccess, linkMode])

  const handleExit = useCallback(() => {
    setLinkToken(null)
    setLinkMode('add')
    setLinkLoading(false)
  }, [])

  const handleReady = useCallback(() => {
    setLinkLoading(false)
  }, [])

  return (
    <PlaidLinkContext.Provider value={{ openLink, reconnect, linkLoading, linkError }}>
      {children}
      {showTypeModal && (
        <ConnectionTypeModal
          onSelect={startLink}
          onClose={() => setShowTypeModal(false)}
          loading={linkLoading}
        />
      )}
      {linkToken && (
        <PlaidLinkOpener
          token={linkToken}
          onSuccess={handleSuccess}
          onExit={handleExit}
          onReady={handleReady}
        />
      )}
    </PlaidLinkContext.Provider>
  )
}
