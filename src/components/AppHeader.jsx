import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function NavigationArrowIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="10 10 36 36" width="16" height="16" className={className}>
      <path d="M42 14 L14 28 L28 32 L32 42 Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

function DocumentIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" className={className}>
      <path d="M6 2h8l6 6v14a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 13h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 17h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CreditCardNavIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" className={className}>
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="2" />
      <rect x="5" y="13" width="5" height="2" rx="1" fill="currentColor" />
    </svg>
  )
}

function LayersIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" className={className}>
      <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" />
      <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/app', icon: NavigationArrowIcon },
  { label: 'Transactions', path: '/app/transactions', icon: LayersIcon },
  { label: 'Investments', path: '/app/investments', icon: DocumentIcon },
  { label: 'Accounts', path: '/app/accounts', icon: CreditCardNavIcon },
]

export function AppHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <header className="border-b border-[#d9d9d9] bg-white">
      <div className="flex w-full items-center justify-end px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          {NAV_ITEMS.map(({ label, path, icon: Icon }) => {
            const isActive = path && location.pathname === path
            return (
              <button
                key={label}
                type="button"
                onClick={() => path && navigate(path)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-[16px] font-normal leading-none transition-colors ${
                  isActive
                    ? 'border-[#1e1e1e] bg-[#1e1e1e] text-white'
                    : 'border-[#d9d9d9] bg-white text-[#1e1e1e] hover:bg-black/5'
                } ${!path ? 'opacity-50 cursor-default' : ''}`}
                style={{ fontFamily: 'Inter,sans-serif' }}
              >
                {Icon && <Icon />}
                {label}
              </button>
            )
          })}
          <div className="mx-1 h-8 w-px bg-[#d9d9d9]" />
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg bg-[#FF3B30] px-3 py-2.5 text-[16px] font-normal leading-none text-white transition-opacity hover:opacity-90"
            style={{ fontFamily: 'Inter,sans-serif' }}
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}
