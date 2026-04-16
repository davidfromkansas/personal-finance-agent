import { enterDemoMode } from '../lib/demoMode.js'

export function LoggedOutLandingPage() {
  return (
    <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center">
      <button
        type="button"
        onClick={() => { enterDemoMode(); window.location.replace('/app') }}
        className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-black border border-black rounded-full text-white font-medium text-lg hover:bg-black/80 transition-colors font-[Roboto,sans-serif] cursor-pointer"
      >
        Try Demo
      </button>
    </div>
  )
}
