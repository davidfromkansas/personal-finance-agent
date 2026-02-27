import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/app' },
  { label: 'Transactions', path: '/app/transactions' },
  { label: 'Investments', path: '/app/investments' },
  { label: 'Accounts', path: '/app/accounts' },
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
          {NAV_ITEMS.map(({ label, path }) => {
            const isActive = path && location.pathname === path
            return (
              <button
                key={label}
                type="button"
                onClick={() => path && navigate(path)}
                className={`rounded-lg border px-3 py-2.5 text-[16px] font-normal leading-none transition-colors ${
                  isActive
                    ? 'border-[#1e1e1e] bg-[#1e1e1e] text-white'
                    : 'border-[#d9d9d9] bg-white text-[#1e1e1e] hover:bg-black/5'
                } ${!path ? 'opacity-50 cursor-default' : ''}`}
                style={{ fontFamily: 'Inter,sans-serif' }}
              >
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
