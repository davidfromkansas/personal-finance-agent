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

export function PlaidLinkProvider({ children, onConnectSuccess }) {
  const { getIdToken } = useAuth()
  const [linkToken, setLinkToken] = useState(null)
  const [linkMode, setLinkMode] = useState('add')
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkError, setLinkError] = useState(null)

  const openLink = useCallback(async (mode = 'add') => {
    if (linkLoading) return
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
  }, [getIdToken])

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
  }, [getIdToken])

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
        invalidateAfterConnect()
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
