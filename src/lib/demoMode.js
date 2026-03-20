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
  try { return sessionStorage.getItem('crumbs_demo') === '1' } catch { return false }
}

export function enterDemoMode() {
  try { sessionStorage.setItem('crumbs_demo', '1') } catch {}
}

export function exitDemoMode() {
  try { sessionStorage.removeItem('crumbs_demo') } catch {}
}
