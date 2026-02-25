# Deploy checklist (e.g. Railway)

Before or right after you deploy:

- [ ] **Firebase Authorized domains**  
  In **Firebase Console → Authentication → Settings → Authorized domains**, add your live domain (e.g. `yourapp.up.railway.app` or your custom domain).  
  Otherwise Google sign-in will fail in production (localhost is already allowed for local testing).

- [ ] **Env in production**  
  Set the same `VITE_FIREBASE_*` variables in your Railway (or host) environment so the built app has the Firebase config.
