import { createContext, useContext, useState, useEffect } from 'react'
import { onAuthStateChanged, signInWithPopup as firebaseSignInWithPopup, signOut as firebaseSignOut } from 'firebase/auth'
import { auth, googleAuthProvider } from '../lib/firebase'

const AuthContext = createContext(null)

function getMessageForCode(code) {
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled. Try again when you’re ready.'
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked. Allow popups for this site and try again.'
    case 'auth/cancelled-popup-request':
      return null // user clicked twice; ignore
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.'
    case 'auth/unauthorized-domain':
      return "This domain isn't authorized for sign-in. Contact support."
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled. Contact support.'
    default:
      return 'Sign-in failed. Please try again.'
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? null,
          name: firebaseUser.displayName ?? null,
          picture: firebaseUser.photoURL ?? null,
        })
      } else {
        setUser(null)
      }
      setReady(true)
    })
    return () => unsubscribe()
  }, [])

  async function signInWithGoogle() {
    try {
      await firebaseSignInWithPopup(auth, googleAuthProvider)
    } catch (err) {
      const message = getMessageForCode(err?.code)
      if (message) throw new Error(message)
      throw err
    }
  }

  /** Returns the current Firebase ID token for API auth, or null if not logged in. */
  async function getIdToken() {
    const u = auth.currentUser
    if (!u) return null
    return u.getIdToken()
  }

  function logout() {
    firebaseSignOut(auth)
  }

  const value = { user, signInWithGoogle, logout, getIdToken, ready }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
