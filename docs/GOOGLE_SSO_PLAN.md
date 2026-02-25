# Plan: Google SSO (Login + Signup)

## User experience (target)

1. **Already authenticated** → Show logged-in page (`/app`).
2. **Not authenticated** → Show logged-out page (`/`).
3. **User clicks "Continue with Google"** → Start Google SSO (user picks account and approves).
4. **Success** → Show logged-in page.
5. **Failure** → Stay on logged-out page and show a clear error message (reason why auth failed).

---

## High-level options

| Approach | Pros | Cons |
|----------|------|------|
| **A) Backend OAuth (your API)** | Full control, session in HTTP-only cookie, no vendor lock-in. | Need to build and host a backend (e.g. Node/Express). |
| **B) Firebase Auth** | No backend for auth, Google popup/redirect built-in, quick to ship. | Depends on Google/Firebase; tokens in frontend (mitigate with short-lived + refresh). |
| **C) Supabase Auth** | Same idea as Firebase; open-source, can self-host. | Same “auth in frontend” considerations. |

**Recommendation:** Use **Firebase Auth** or **Supabase Auth** to get Google SSO working quickly with no backend. If you later need sessions in your own API, add a small backend that verifies the ID token and sets a cookie.

---

## Option B: Firebase Auth (recommended for speed)

### 1. Setup

- Create a [Firebase project](https://console.firebase.google.com) and enable **Authentication** → **Sign-in method** → **Google**.
- In the same project, add a **Web app**; copy the Firebase config (apiKey, authDomain, projectId, etc.).
- Store the config in env (e.g. `.env`):  
  `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, etc.  
  (Vite exposes only `VITE_*` to the client.)

### 2. Install and init

- Install: `npm install firebase`
- Add a small **auth** module (e.g. `src/lib/firebase.js` or `src/auth/firebase.js`) that:
  - Calls `initializeApp(firebaseConfig)` once.
  - Exports `getAuth(app)` and (if you use popup) `signInWithPopup(auth, new GoogleAuthProvider())`, plus `signOut(auth)` and `onAuthStateChanged(auth, callback)`.

### 3. Replace mock auth with Firebase

- **AuthContext** (or equivalent):
  - On mount, call `onAuthStateChanged(auth, (user) => { ... })`.  
  - If `user`: set app “user” state from `user.displayName`, `user.email`, `user.photoURL`, `user.uid` (and optionally persist minimal profile in `localStorage` only if needed for offline display).
  - If no user: set app user to `null`.
- **Logged-out page**  
  - “Continue with Google” no longer calls a mock `login()`.  
  - It calls Firebase `signInWithPopup(auth, new GoogleAuthProvider())` (or `signInWithRedirect` if you prefer redirect).
  - **On success:** Firebase’s `onAuthStateChanged` will fire; your context updates and you `navigate('/app')` (or rely on existing route guard that sends authenticated users to `/app`).
  - **On failure:** Catch the error from `signInWithPopup` and set an **error state** (e.g. `authError` in context or local state). Don’t navigate; stay on the logged-out page and render the error message (see below).

### 4. Error handling on the logged-out page

- In the component that handles “Continue with Google”:
  - `try { await signInWithPopup(...) } catch (err) { ... }`
  - Map `err.code` to user-friendly messages, e.g.:
    - `auth/popup-closed-by-user` → “Sign-in was cancelled. Try again when you’re ready.”
    - `auth/popup-blocked` → “Sign-in popup was blocked. Allow popups for this site and try again.”
    - `auth/network-request-failed` → “Network error. Check your connection and try again.”
    - `auth/unauthorized-domain` → “This domain isn’t authorized for sign-in. Contact support.”
    - `auth/cancelled-popup-request` → ignore (multiple clicks).
  - Set `authError` (or similar) to that message and clear it when the user clicks “Continue with Google” again or after a few seconds.
- In the **logged-out page UI**:  
  - If `authError` is set, show it above or below the “Continue with Google” button (e.g. a small alert or inline text). Keep the button visible so the user can retry.

### 5. Logged-in page and sign-out

- **Logged-in page** already shows for authenticated users; no change to the “show logged-in vs logged-out” logic beyond wiring it to Firebase’s `user`.
- **Logout:** Call Firebase `signOut(auth)`. Then clear app user state and navigate to `/` (or let the route guard do it when user becomes null).

### 6. “Already authenticated” behavior

- Your existing guard already sends unauthenticated users from `/app` to `/` and (optionally) authenticated users from `/` to `/app`.
- With Firebase, “authenticated” = `onAuthStateChanged` gave you a non-null `user`. So:
  - User lands on `/` → guard checks auth → if Firebase user exists, redirect to `/app`.
  - User lands on `/app` → guard checks auth → if no Firebase user, redirect to `/`.

Result: **If user is already authenticated (Firebase user exists), they see the logged-in page; otherwise the logged-out page**, with clear errors on the logged-out page when Google SSO fails.

---

## Option A: Backend OAuth (your own API)

Use this if you want sessions in your own backend (e.g. HTTP-only cookies) and no Firebase.

### 1. Backend (e.g. Node/Express)

- Create a Google Cloud project and OAuth 2.0 client (Web application). Get client ID and client secret; set redirect URI to `https://your-api.com/auth/google/callback` (and same for localhost in dev).
- Routes:
  - `GET /auth/google` — Redirect to Google’s authorization URL (scope: `openid email profile`).
  - `GET /auth/google/callback` — Receives `?code=...`. Exchange code for tokens, verify ID token, create or find user in your DB, set session (e.g. HTTP-only cookie), redirect to frontend: `https://your-app.com/app` (or `https://your-app.com?logged_in=1`).
- Optional: `GET /me` — Reads session cookie, returns `{ id, email, name }` or 401. Frontend calls this on load to know if user is logged in.

### 2. Frontend

- “Continue with Google” → `window.location.href = 'https://your-api.com/auth/google'` (full redirect).
- User goes to Google → then to your callback → backend sets cookie and redirects to your app (e.g. `/app`).
- On app load (and when landing on `/` or `/app`), call `GET /me`. If 200, set user and show logged-in page; if 401, show logged-out page.
- **Errors:** Backend can redirect to `https://your-app.com?error=access_denied` (or similar) with a query param; frontend reads it and shows the message on the logged-out page, then strips the param from the URL.

---

## Implementation checklist (Firebase path)

- [ ] Create Firebase project and enable Google sign-in.
- [ ] Add Web app and copy config into `.env` (VITE_FIREBASE_*).
- [ ] Add `src/lib/firebase.js` (or `src/auth/firebase.js`) with init and auth exports.
- [ ] Update AuthContext to use `onAuthStateChanged` and Firebase user (and remove mock login).
- [ ] Logged-out page: “Continue with Google” calls `signInWithPopup`, with try/catch and user-friendly error messages; set/clear `authError`, render it on the page.
- [ ] Logout on logged-in page calls `signOut(auth)` and navigates to `/`.
- [ ] Ensure route guards use Firebase auth state so: authenticated → logged-in page, not authenticated → logged-out page.
- [ ] Test: already logged in → see `/app`; log out → see `/`; fail Google (e.g. close popup) → see error on `/`; succeed → see `/app`.

---

## Summary

- **UX:** Already authenticated → logged-in page; not → logged-out page. “Continue with Google” runs real Google SSO. Success → logged-in page; failure → stay on logged-out page with a clear error.
- **Fastest path:** Firebase Auth (or Supabase) in the frontend, with error handling and error state on the logged-out page.
- **More control later:** Add a thin backend that verifies the Firebase ID token and issues your own session cookie; frontend still uses Firebase for the Google popup/redirect and can then rely on `GET /me` for session.
