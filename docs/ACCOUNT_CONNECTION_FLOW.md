# Account Connection Flow

What happens behind the scenes when a user connects a bank, credit card, or investment account — from clicking "Add Account" to seeing data in the dashboard.

---

## Data flow map

Where each piece of data comes from and where it ends up. Three types of data are distinguished:
- 🟦 **1st party** — raw data fetched directly from Plaid
- 🟨 **3rd party** — data from external sources other than Plaid
- 🟩 **Derived** — computed or reconstructed by us from other data we already have

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PLAID API  (1st party 🟦)                                              │
│                                                                         │
│  transactionsSync ─────────────────────────► transactions               │
│                                                (DB table)               │
│  accountsBalanceGet ──────────────────────► [live display]              │
│                        │                   account_balance_snapshots    │
│                        │                    (today's row, DB table) 🟦  │
│                        │                                                │
│                        └──► [reconstructed history] ──────────────────► account_balance_snapshots
│                                  (back-calculated by us)                 (historical rows) 🟩
│                                                                         │
│  accountsGet ─────────────────────────────► plaid_items.accounts_cache  │
│                                                (DB column, ephemeral)   │
│                                                                         │
│  investmentsHoldingsGet ──────────────────► holdings_snapshots          │
│                         │                   (DB table) 🟦               │
│                         ├─────────────────► portfolio_account_snapshots │
│                         │                   (DB table) 🟦               │
│                         └─────────────────► portfolio_snapshots         │
│                                              (today's row, source=live) │
│                                              (DB table) 🟦              │
│                                                                         │
│  investmentsTransactionsGet ──────────────► investment_transactions     │
│                                              (DB table) 🟦              │
│                                                                         │
│  institutionsGetById ─────────────────────► [in-memory logo cache only] │
│                                              (never written to DB)      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  YAHOO FINANCE API  (3rd party 🟨)                                      │
│                                                                         │
│  Historical stock prices ─────────────────► portfolio_snapshots         │
│  (adjusted closing prices)                   (historical rows,          │
│                                              source=backfill) 🟩        │
│                                              * prices are 3rd party,    │
│                                              quantities are derived from │
│                                              Plaid holdings + txns      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  COMPUTED ON-THE-FLY  (derived 🟩, never written to DB)                 │
│                                                                         │
│  transactions ─────────────────────────────► Spending graph             │
│                                              Cash flow chart            │
│                                              Net worth history chart    │
│                                              Recurring payments         │
│                                                                         │
│  portfolio_snapshots + account_balance_snapshots ──► Net worth history  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Overview

Crumbs uses **Plaid** as the middleman between the user's bank and our app. The user logs in to their bank through Plaid's secure login screen (we never see their bank username or password). Once connected, Plaid gives us read-only access to their transaction history and balances.

---

## Step-by-step

### 1. Opening the bank login screen

Before the Plaid login screen can appear, our server asks Plaid for a temporary "session key" (called a link token). This key tells Plaid what kind of account the user is trying to connect:

- **Default (bank or credit card):** We ask for transaction data. Investment data is requested as a bonus if the institution supports it.
- **Investment-only flow:** If the user clicks "Add Investment Account" specifically, we ask for investment data first. Transaction data becomes the bonus.

We also tell Plaid to fetch up to **2 years of transaction history** for new connections.

### 2. The user logs in to their bank

The user goes through Plaid's login screen, authenticates with their institution, and selects which accounts to share. This all happens inside Plaid's UI — Crumbs never handles the bank credentials.

When the user finishes, Plaid gives us a short-lived code (a `public_token`) that we use in the next step.

### 3. Saving the connection

Our server exchanges that short-lived code for a permanent access credential and saves the connection to our database. The user immediately sees the new account appear in their dashboard — we don't make them wait.

In the background (without blocking the user), we kick off two tasks:

- **Fetch transactions** (see step 4)
- **Fetch investment holdings** (see step 5)

We also clear any cached balance data so the next balance refresh pulls fresh numbers.

### 4. Pulling transaction history

This runs for all account types — checking, savings, credit cards, and brokerages.

We ask Plaid for all transactions going back up to 2 years. For a new connection this can take anywhere from a few seconds to a minute depending on how much history the institution has. Because it can be slow, it runs in the background — the user can use the dashboard while this is happening.

We save each transaction with enriched data: merchant name, logo, spending category, location, and more.

After the initial pull, Plaid automatically notifies us (via a "webhook" — essentially a push notification from Plaid to our server) whenever new transactions arrive, like when a pending charge settles or a new purchase is posted. We use these notifications to stay up to date without polling.

### 5. Snapshotting investment holdings

This runs for **all of the user's connected items**, not just the new one — because adding a new account changes the total portfolio picture.

For each connected item, we try to fetch the current investment holdings (stocks, ETFs, etc.) and their values. If an account has no investment data (e.g. it's a checking account), we silently skip it.

For accounts that do have investment data, we record:
- Each individual holding (security, quantity, price, value)
- A per-account total
- A grand total across all investment accounts

We also pull up to 2 years of investment transaction history (buys, sells, dividends, etc.) on initial connection, and 90 days on subsequent refreshes.

### 6. Staying up to date after the initial sync

Going forward, Plaid sends us a notification every time new transaction data is available. We process just the new/changed/removed transactions — we don't re-download everything from scratch.

Investment data works differently: Plaid doesn't send notifications for holdings changes. Investment values are refreshed on-demand when the user visits the Investments page or manually triggers a refresh.

---

## How different account types behave

| Account type | Transactions | Investment data | Shows in Spending graph | Shows in Net Worth |
|---|---|---|---|---|
| Credit card | ✅ Full history | — | ✅ Yes | ✅ Yes (as debt) |
| Checking / Savings | ✅ Full history | — | Rarely — debit card purchases only; transfers and income are excluded | ✅ Yes |
| Brokerage / IRA | ✅ If user consented | ✅ Holdings + transactions | ❌ No | ✅ Yes |
| Loan | ✅ Full history | — | ✅ Loan payments show as spending | ✅ Yes (as debt) |

**What's excluded from the Spending graph:** Transfers between accounts (TRANSFER_IN/TRANSFER_OUT), income (direct deposits), and bank fees. Rent, utilities, and loan payments **are included** as spending — they are real cash outflows.

**How double-counting is avoided:** The TRANSFER_IN/TRANSFER_OUT exclusion is the primary guard. When you pay your credit card from checking, the checking side is TRANSFER_OUT (excluded) while the individual credit card charges show through on the card feed. Rent goes to an external party so there's no second side. Loan payments: if both a checking and loan account are connected, the loan account side shows as a negative (credit) which is never counted as spending.

---

## What gets stored in our database

We use a Postgres database (hosted on Railway) to store everything we've pulled from Plaid. Here's what lives there and when it's written:

| Data | When it's written | Notes |
|---|---|---|
| The connection itself (institution name, internal IDs) | Immediately on connection | Never contains bank login credentials |
| Transaction history | During initial sync, then incrementally as new transactions arrive | Up to 2 years of history per account |
| Investment holdings (what you own, how much it's worth) | On connection, then on-demand when you visit the Investments page | One snapshot per day |
| Investment transaction history (buys, sells, dividends) | Same as above | 2 years on initial connection; 90 days on subsequent refreshes |
| Security metadata (ticker symbols, names) | Alongside holdings | Cached to avoid re-fetching |
| Account balances (checking, savings, credit, loans) | Every time live balances are fetched from Plaid | One snapshot per account per day; enables historical balance tracking and agent analysis |

**How balance snapshotting works:** Current balances are still fetched live from Plaid each time the Connections page loads (with a 5-minute in-memory cache to avoid redundant calls). After each successful live fetch, we also write a snapshot to the database in the background — so the user experience is unaffected, but we build up a daily history over time. If balances are fetched multiple times in one day, the snapshot is updated with the latest reading.

**Why store historical balances?** This enables the AI agent to answer questions like "what was my checking balance last month?" or "how has my credit card debt changed this year?" — questions that require looking back in time, not just the current moment.

---

## Why there are two "Add Account" buttons

The UI presents two options: **Add Bank / Credit Card** and **Add Investment Account**. This isn't just cosmetic — it reflects a constraint in how Plaid works.

When we ask Plaid to open its login screen, we must declare at least one "required" product (e.g. transactions, or investments). Plaid won't let us require both simultaneously. So we pick one as the primary and request the other as an optional bonus:

| Button clicked | Required product | Optional (bonus if supported) |
|---|---|---|
| Add Bank / Credit Card | Transactions | Investments |
| Add Investment Account | Investments | Transactions |

**In practice, a single connection can grant both.** If the user's institution supports it and they consent when Plaid asks, we get transactions AND investment data from one login session. The two buttons just control which product Plaid emphasizes — they don't limit what can be granted.

The optional product is silently skipped if the institution doesn't support it or the user declines. We detect this and proceed with whatever was actually granted.

---

## What's implemented vs. what's planned

### ✅ Already implemented

- Transaction sync (up to 2 years of history on initial connection, then incremental via webhooks)
- Investment holdings snapshot on connection and on-demand refresh
- Investment transaction history (2 years on initial connection, 90 days on refresh)
- Live balance snapshotting — after each live balance fetch, a daily snapshot is written to the DB for agent analysis and historical queries; one snapshot per account per day, updated if fetched multiple times

### 🔲 Planned: Show users what data access was actually granted

Currently the UI shows two buttons but gives no feedback on what was actually granted after connection. A user who clicked "Add Bank" but whose institution didn't support optional investment access would have no idea their brokerage data wasn't pulled. We plan to display a badge or indicator per connection showing whether transactions, investments, or both are active.

### 🔲 Planned: Prevent duplicate institution connections + support account expansion

**The problem:** A user could click both "Add Bank / Credit Card" and "Add Investment Account" for the same institution (e.g. Chase), creating two separate Plaid connections. This causes investment accounts to be counted twice in Net Worth.

**The solution:**

At token exchange time, we call `itemGet` to get the `institution_id` of the newly connected institution and compare it against existing connections for this user.

- **If the institution is already connected:** reject the new connection immediately (call `plaid.itemRemove` to clean up the orphaned access token), and return a clear error to the UI.
- **If the institution is not yet connected:** proceed normally.

**Supporting the legitimate "add more accounts" case:**

A user may have connected Chase earlier and only linked their checking account, then later want to add their 401k. This is valid — and should not be blocked. Instead of creating a new connection, the UI should redirect them to Plaid's **update mode** for their existing Chase connection. Update mode lets the user log in again and add accounts they previously skipped, without creating a duplicate item.

The existing `POST /api/plaid/link-token/update` endpoint already creates update-mode link tokens — this same mechanism handles the "add skipped accounts" flow.

**Full decision tree at token exchange:**

```
New institution_id already in plaid_items for this user?
  → YES: reject new item + call itemRemove
         Return error to frontend:
         "You already have [Chase] connected.
          To add more accounts, update your existing connection."
         Frontend offers "Update Chase connection" button
           → triggers Plaid Link in update mode for existing item_id
           → user selects additional accounts (e.g. 401k)
           → no new item created, no double-counting possible
  → NO:  save new item, proceed with sync
```

**What gets stored:** `institution_id` is stored on `plaid_items` at connection time (sourced from `itemGet`, same call used for `products_granted`). No extra API call needed.

### ✅ Implemented: Nightly investment refresh without user activity

A Railway cron job calls `POST /api/cron/refresh-investments` nightly (6 AM UTC). It loops all users with connected items and runs `snapshotInvestments` for each, so investment values stay fresh even for users who haven't opened the app. Protected by a `CRON_SECRET` env var.

---

## Known limitations

- **Investment data isn't real-time.** Since Plaid doesn't notify us of holdings changes, investment values are only as fresh as the last time the user visited the Investments page or hit refresh. A nightly cron job runs at 6 AM UTC to keep data reasonably fresh for inactive users.
- **New connections show up instantly, but transactions take time.** The account card appears in the dashboard right away, but it can take up to a minute for historical transactions to finish loading in the background.
- **Investment access is optional.** If a user connects a bank account at an institution that also offers brokerage accounts, Plaid asks for investment consent separately. If the user declines, we only get banking data — no investment holdings. The UI doesn't currently surface this distinction — a per-connection badge showing which products were granted is planned (see above).
- **No historical balance data before first connection.** Account balance history only goes back to the first time a live balance was fetched after connecting. There is no backfill of historical balances.
- **Spending on unlinked credit cards is not captured.** Credit card payments (`LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`) are excluded from spending and cash flow to prevent double-counting when the card is linked and its individual transactions are already tracked. If a user pays a credit card that is *not* linked in Plaid, that payment is excluded and the underlying purchases are invisible. Users should link all credit cards to ensure complete spending coverage.
