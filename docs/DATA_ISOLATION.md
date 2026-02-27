# How we keep each user's data separate

This doc explains how we make sure **User A never sees User B's data**—no matter what.

---

## Plain-language version (non-technical)

**The short answer:** We treat your identity like a verified badge. We only ever show you data that’s labeled as yours. We never use “who do you want to see?” from the screen—we only use “who are you?” from a check we do ourselves.

**How we know who you are**

When you sign in with Google, our system gets a secure, tamper-proof “proof” that you’re you (like a stamp only Google can create). Every time the app asks our servers for your transactions or account info, it sends that proof. Our server **checks the proof** (with Google) and then knows: “This request is from Sarah” or “This request is from Mike.” We **never** decide who you are based on something typed or sent from the screen (e.g. a name or ID in the address bar or a form). So nobody can pretend to be someone else and ask for their data.

**How we keep your data separate**

- Every piece of your data we store (your linked bank, your transactions) is **tagged with your identity**—the same one we get from that proof.
- Whenever we look up or send data, we **only look in your drawer**: we only pull records that are tagged with the identity we just verified. We never pull from another user’s drawer.
- We don’t have a “show me everyone’s data” button. We only have “show me **this person’s** data,” where “this person” is always the one we identified from the proof.

**Simple analogy**

Think of a bank with safe-deposit boxes. When you show up, the bank checks your ID (the proof). They don’t ask you “which box do you want to open?” and take your word for it—they look at their records and only give you the key to **your** box. Your transactions and linked accounts are in a box labeled with your identity; we only ever open that box when the request comes with a valid proof that it’s you.

**Bottom line**

We make sure one person doesn’t see another’s data by (1) **only** trusting who you are from a verified sign-in, not from anything the app or a user types, and (2) **only** ever loading or showing data that’s labeled for that verified person. So your data stays yours.

---

## The golden rule (technical)

**Every request that touches user data must:**

1. **Know who is making the request** — from the **auth token** (e.g. Firebase ID token), not from anything the frontend sends in the URL or body.
2. **Only read or write data for that user** — filter by that user's id in the database and in any calls to Plaid.

We **never** trust the frontend to tell us "I'm user X." We **always** derive the user from the verified token on the backend.

---

## How we know who is making the request

| Layer | What we use | How it works |
|-------|-------------|--------------|
| **Frontend** | Firebase Auth | User signs in with Google. Firebase gives the app an **ID token** (JWT) that represents "this person is logged in as this Google account." The frontend sends this token with every request to our API (e.g. in the `Authorization: Bearer <token>` header). |
| **Backend** | Verify the token, read the user id | Backend receives the request, reads the token from the header, and **verifies** it (using Firebase's public keys or your Firebase Admin SDK). If valid, we read the **user id** (e.g. Firebase UID) from inside the token. That UID is the only source of truth for "who is this request from?" We **never** use a `user_id` from the request body or query params for authorization. |

So: **identity comes from the verified token, not from user input.** That way a malicious or buggy client can't say "give me user B's data" and get it.

---

## How we scope data to that user

| Data | Where it's stored | How we scope it |
|------|-------------------|------------------|
| **Plaid link** (access_token, item_id) | `plaid_items` table | Each row has a `user_id` (Firebase UID). When we create a row (after exchanging the public token), we set `user_id` from the **verified token**. When we read or update, we always add `WHERE user_id = ?` with the UID from the token. So we only ever touch items that belong to the person making the request. |
| **Transactions** | `transactions` table | Each row has a `user_id`. We only insert transactions for items we already associated with that user. For every read (list, search, export), we filter: `WHERE user_id = ?` with the UID from the token. We never return a transaction whose `user_id` doesn't match the requestor. |
| **Plaid API calls** | We use a stored `access_token` | We only fetch the access_token for the **current user** (from our DB, filtered by `user_id` from the token). We never use another user's access_token. So when we call Plaid's `/transactions/sync`, we're only ever asking for data for the accounts that **this** user linked. |

So: **every DB query and every Plaid call is explicitly scoped to the user id we got from the verified token.** There is no "get all transactions" API; there is only "get transactions for the user in this request."

---

## Concrete flow (example)

1. User Alice is logged in. Her browser has a Firebase ID token that says "uid = alice-123."
2. She opens the transactions page. Frontend sends: `GET /api/plaid/transactions` with header `Authorization: Bearer <alice's token>`.
3. Backend: Validates the token → extracts `uid = alice-123`. Ignores any other params for "who am I?"
4. Backend: Runs `SELECT * FROM transactions WHERE user_id = 'alice-123'` (plus any filters like date range). Returns only those rows.
5. Bob cannot see Alice's data because Bob's token says `uid = bob-456`. When Bob calls the same endpoint, we filter by `bob-456` and return only Bob's rows.

If someone tried to send a forged token or Alice's token from a different machine, we'd either reject it (invalid signature) or treat it as Alice and still only return Alice's data—never Bob's.

---

## Checklist for implementation

When we build the backend, we will:

- [ ] **Auth middleware** — Extract Bearer token from `Authorization` header; verify with Firebase Admin SDK; attach `req.user` (or similar) with the Firebase UID. Reject request with 401 if missing or invalid.
- [ ] **No user_id in body/query for auth** — Never use `user_id` from the request to decide whose data to return. Always use `req.user.uid` (or equivalent) from the middleware.
- [ ] **All queries filtered by user** — Every SELECT/UPDATE/DELETE on `plaid_items` or `transactions` includes `WHERE user_id = req.user.uid` (or equivalent).
- [ ] **Plaid tokens per user** — When exchanging a public token, store the resulting access_token with `user_id = req.user.uid`. When calling Plaid, load the access_token only for that same user.

---

## Summary

We make sure one user doesn't see another's data by:

1. **Identifying the user only from the verified auth token** (Firebase ID token), not from anything the client sends.
2. **Storing all user-specific data with a `user_id`** (Firebase UID) in the database.
3. **Filtering every read and write by that `user_id`** so we only ever access the data for the person making the request.

That way, even if the frontend is buggy or an attacker tries to ask for "another user's" data, the backend only ever returns or modifies data for the user in the token.
