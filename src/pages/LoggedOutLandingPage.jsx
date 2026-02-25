import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { GoogleLogo } from '../components/GoogleLogo'

export function LoggedOutLandingPage() {
  const { signInWithGoogle } = useAuth()
  const [authError, setAuthError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleContinueWithGoogle(e) {
    e.preventDefault()
    setAuthError(null)
    setLoading(true)
    try {
      await signInWithGoogle()
      // onAuthStateChanged will fire; route guard redirects to /app
    } catch (err) {
      setAuthError(err?.message ?? 'Sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-[#f8f8f8] flex flex-col items-center justify-center px-6 py-16"
      data-name="Logged-Out Landing Page"
    >
      <main className="flex flex-col items-center gap-16 max-w-4xl w-full">
        <h1 className="font-medium text-black text-center text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-tight font-[Roboto,sans-serif]">
          <span className="block">Your money.</span>
          <span className="block">Simply Organized.</span>
          <span className="block">All in one place.</span>
        </h1>

        <div className="flex flex-col items-center gap-4 w-full max-w-sm">
          {authError && (
            <p
              role="alert"
              className="text-center text-sm text-red-600 font-[Roboto,sans-serif]"
            >
              {authError}
            </p>
          )}
          <button
            type="button"
            onClick={handleContinueWithGoogle}
            disabled={loading}
            className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-white border border-black rounded-full text-black font-medium text-lg hover:bg-gray-50 transition-colors font-[Roboto,sans-serif] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <GoogleLogo />
            {loading ? 'Signing in…' : 'Continue with Google'}
          </button>
        </div>
      </main>
    </div>
  )
}
