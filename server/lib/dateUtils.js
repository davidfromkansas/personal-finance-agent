/**
 * Shared date utilities — all dates use America/New_York timezone
 * to stay consistent with market hours and snapshot keys.
 */

const TZ = 'America/New_York'

/** Returns today's date string in YYYY-MM-DD format (ET). */
export function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

/** Converts a Date object to YYYY-MM-DD string in ET. */
export function toDateStrET(d) {
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

/** Returns a Date object representing N days ago (midnight local). */
export function daysAgoDate(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}
