/**
 * Demo mode: bypasses Firebase auth and all API calls, serving static fake data.
 * State lives in sessionStorage — persists across in-app navigation, clears on tab close.
 */

export const DEMO_USER = {
  uid: 'demo-user',
  email: 'alex.rivera@example.com',
  name: 'Alex Rivera',
  picture: null,
}

export function isDemoMode() {
  try { return sessionStorage.getItem('abacus_demo') === '1' } catch { return false }
}

export function enterDemoMode() {
  try { sessionStorage.setItem('abacus_demo', '1') } catch {}
}

export function exitDemoMode() {
  try { sessionStorage.removeItem('abacus_demo') } catch {}
}
