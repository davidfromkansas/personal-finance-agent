import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function HamburgerIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M3 6h18M3 12h18M3 18h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function LoggedInPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#f8f8f8]" data-name="Logged-In Dashboard">
      <header className="bg-white border-b border-[#d9d9d9]">
        <div className="w-full flex items-center justify-between px-5 py-4 sm:px-6">
          <button
            type="button"
            className="p-2 -ml-2 text-[#1e1e1e] hover:bg-black/5 rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <HamburgerIcon />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="bg-[#2c2c2c] text-[#f5f5f5] font-normal text-base leading-none px-3 py-3 rounded-lg hover:opacity-90 transition-opacity"
          >
            Logout
          </button>
        </div>
      </header>
      <main className="min-h-[calc(100vh-65px)] bg-white" />
    </div>
  )
}
