/**
 * Finnhub REST API client with in-memory caching.
 * All market-research code (agent + MCP) should call finnhubGet() instead of raw fetch.
 */

const BASE = 'https://finnhub.io/api/v1'

const cache = new Map()

function getKey(path, params) {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b))
  return `${path}?${sorted.map(([k, v]) => `${k}=${v}`).join('&')}`
}

/**
 * GET a Finnhub endpoint with caching.
 * @param {string} path   e.g. '/company-news'
 * @param {Record<string,string>} params  query params (token added automatically)
 * @param {number} ttl    cache TTL in ms (default 180_000 = 3 min)
 * @returns {Promise<any>} parsed JSON, or { error, premium } on failure
 */
export async function finnhubGet(path, params = {}, ttl = 180_000) {
  const token = process.env.FINNHUB_API_KEY
  if (!token) return { error: 'Finnhub API key not configured', premium: false }

  const key = getKey(path, params)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.ts < ttl) return cached.data

  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('token', token)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  try {
    const res = await fetch(url.toString())
    if (res.status === 403) {
      return { error: 'This data requires a premium Finnhub plan and is not available on the free tier.', premium: true }
    }
    if (res.status === 429) {
      return { error: 'Finnhub rate limit exceeded. Try again shortly.', premium: false }
    }
    if (!res.ok) {
      return { error: `Finnhub returned HTTP ${res.status}`, premium: false }
    }
    const data = await res.json()
    cache.set(key, { data, ts: Date.now() })
    return data
  } catch (err) {
    return { error: `Finnhub request failed: ${err.message}`, premium: false }
  }
}

/** Helper: format YYYY-MM-DD from a Date */
export function toDateStr(d) {
  return d.toISOString().slice(0, 10)
}
