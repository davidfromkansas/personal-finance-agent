const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

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
    const err = new Error(await res.json().then((d) => d.error || res.statusText).catch(() => res.statusText))
    err.status = res.status
    throw err
  }
  return res.json()
}
