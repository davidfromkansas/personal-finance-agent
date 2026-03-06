# Deploy checklist (Railway)

**Stack:** Frontend (Vite/React), backend (Node + Express under `/server`), and Postgres all on Railway.

Before or right after you deploy:

- [ ] **Firebase Authorized domains**  
  In **Firebase Console → Authentication → Settings → Authorized domains**, add your live domain (e.g. `yourapp.up.railway.app` or your custom domain).  
  Otherwise Google sign-in will fail in production (localhost is already allowed for local testing).

- [ ] **Env in production (frontend)**  
  Set `VITE_FIREBASE_*` variables in Railway so the built app has the Firebase config.

- [ ] **Env in production (backend)**  
  For the `/server` API: `DATABASE_URL` (Railway Postgres), `PLAID_CLIENT_ID`, `PLAID_SECRET`, and Firebase config. Use `FIREBASE_SERVICE_ACCOUNT` (JSON string in env) on Railway since there is no file mount; locally you can use `FIREBASE_SERVICE_ACCOUNT_PATH` or `GOOGLE_APPLICATION_CREDENTIALS`. Optional: `CORS_ORIGIN`, `PLAID_WEBHOOK_URL` (full URL where Plaid sends SYNC_UPDATES_AVAILABLE; we verify the request and sync in the background).
