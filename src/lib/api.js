const BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')

/**
 * Call the backend with optional auth. getToken should be useAuth().getIdToken.
 * @param {string} path - e.g. '/api/plaid/connections'
 * @param {{ method?: string, body?: object, getToken?: () => Promise<string|null> }} options
 */
export async function apiFetch(path, { method = 'GET', body, getToken } = {}) {
  const url = `${BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
  const headers = { 'Content-Type': 'application/json' }
  if (getToken) {
    const token = await getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(url, {
    method,
    headers,
    ...(body != null && { body: JSON.stringify(body) }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.error || res.statusText)
    err.status = res.status
    err.data = data
    throw err
  }
  return res.json()
}
