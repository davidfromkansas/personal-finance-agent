import { useState, useEffect } from 'react'

const MARKET_HOLIDAYS_2025 = new Set([
  '2025-01-01','2025-01-20','2025-02-17','2025-04-18','2025-05-26',
  '2025-06-19','2025-07-04','2025-09-01','2025-11-27','2025-12-25',
])
const MARKET_HOLIDAYS_2026 = new Set([
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25',
  '2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
])
const MARKET_HOLIDAYS = new Set([...MARKET_HOLIDAYS_2025, ...MARKET_HOLIDAYS_2026])

export function useMarketClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1_000)
    return () => clearInterval(id)
  }, [])

  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  const et = new Date(etStr)
  const dayOfWeek = et.getDay()
  const totalMin = et.getHours() * 60 + et.getMinutes()
  const dateKey = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  const isHoliday = MARKET_HOLIDAYS.has(dateKey)
  const isOpen = !isWeekend && !isHoliday && totalMin >= 570 && totalMin < 960

  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const timeStr = now.toLocaleTimeString('en-US', { timeZone: userTz, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
  const dateStr = now.toLocaleDateString('en-US', { timeZone: userTz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const tzAbbr = now.toLocaleDateString('en-US', { timeZone: userTz, timeZoneName: 'short' }).split(', ').pop()
    || now.toLocaleTimeString('en-US', { timeZone: userTz, timeZoneName: 'short' }).split(' ').pop()

  return { isOpen, timeStr, dateStr, tzAbbr }
}
