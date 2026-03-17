# Account Disconnection Flow

What happens when a user disconnects a bank, credit card, or investment account — from clicking "Disconnect" to the UI settling into its updated state.

---

## Step-by-step

### 1. User confirms disconnect

The user clicks the disconnect (trash) icon on a connection row. A browser `confirm()` dialog appears:

> "Disconnect [Chase]? This will remove all linked accounts."

If the user cancels, nothing happens. If they confirm, the disconnect flow begins.

### 2. Optimistic UI update (instant)

Before the server responds, the connection is **immediately removed from the connections list** in the UI. This is an optimistic update — it makes the interface feel instant. If the server call fails, the connection is restored and an error is shown.

### 3. Server: delete all data for the item

`POST /api/plaid/disconnect` runs the following **in parallel**:

- `DELETE FROM transactions` — all transaction history for the item
- `DELETE FROM account_balance_snapshots` — all historical balance snapshots
- `DELETE FROM portfolio_account_snapshots` — per-account investment value history
- `DELETE FROM holdings_snapshots` — per-security holding detail history
- `DELETE FROM investment_transactions` — all investment activity (buys, sells, dividends, etc.)

Then, once those complete:

- `DELETE FROM plaid_items` — removes the connection record itself (and returns the `access_token` for the next step)

### 4. Server: revoke Plaid access

Using the returned `access_token`, the server calls Plaid's `itemRemove` API. This tells Plaid to revoke our read access to the user's accounts at that institution. Even if this call fails (e.g. the item was already removed on Plaid's side), the DB deletion already happened — the failure is logged but does not affect the user.

### 5. Server: clear in-memory balance cache

The server-side in-memory balance cache (5 min TTL, per item) is cleared for all of this user's items. This ensures the next balance or net worth fetch pulls fresh data from Plaid — without the disconnected account.

### 6. Frontend: reset and refresh all charts

On success, the frontend:

1. **Removes** cached `net-worth` and `portfolio-history` query data — so those charts immediately show a loading skeleton rather than frozen stale values
2. **Invalidates** all other queries (`connections`, `accounts`, `investments`, `transactions`, `spending`, `cash-flow`, `recurring`) — triggering refetches for each

Charts refresh with data that no longer includes the disconnected account.

---

## What data is deleted vs. retained

| Data | Deleted on disconnect | Notes |
|---|---|---|
| Plaid connection (access token, item ID) | ✅ Yes | Access revoked at Plaid too |
| Transaction history | ✅ Yes | All transactions for the item |
| Account balance snapshots | ✅ Yes | All historical balance rows for the item |
| Investment holdings snapshots | ✅ Yes | All per-security daily history |
| Portfolio account snapshots | ✅ Yes | Per-account investment value history |
| Investment transactions | ✅ Yes | All buys, sells, dividends, etc. |
| `portfolio_snapshots` (user-level total) | ❌ Not deleted | See open question below |
| Securities metadata | ❌ Not deleted | Harmless — no PII, shared reference data |

---

## What the user sees

- The connection disappears from the connections list instantly (optimistic)
- Charts briefly show a loading skeleton as they refetch
- All charts (spending, net worth, investments, cash flow) reflect the removal once the refetch completes
- The net worth and investment charts require a live Plaid balance call for the remaining accounts, so they may take a few seconds longer to update than the spending chart

---

## Open questions and risks

### 🔲 `portfolio_snapshots` is not deleted on disconnect

`portfolio_snapshots` stores a **user-level total** portfolio value (one row per user per day). It has no `item_id` column, so we can't cleanly delete just the contribution from the disconnected account.

**Current behavior:** the rows remain in the table. This is harmless for the live charts (they use live Plaid data, not this table), but could affect the agent if it queries historical portfolio values — it would see a higher value in the past than is accurate post-disconnect.

**Options:**
1. Accept the inaccuracy (the data is historical and labeled `source = 'live'` or `'backfill'`)
2. Recalculate and overwrite `portfolio_snapshots` rows after disconnect (expensive — requires re-running `snapshotInvestments` for remaining items)
3. Add an `is_active` flag or soft-delete mechanism so the agent knows to distrust rows that include a now-disconnected item

### 🔲 No user-facing confirmation of what was deleted

The UI just removes the connection and refreshes. There's no summary of what data was deleted (e.g. "2 years of Chase transactions removed"). This is probably fine for now but could be useful as a transparency feature.

### 🔲 `confirm()` dialog is a browser native prompt

Currently uses `window.confirm()`. This is functional but can't be styled to match the app's design. A modal confirmation with clearer language and a styled "Delete" button would be better UX.

### ⚠️ If Plaid `itemRemove` fails, the token is orphaned on Plaid's side

Our DB is cleaned up regardless. But if the `itemRemove` call fails silently, Plaid still has an active item on their end (though we've lost the access token and can't use it). This is low-risk — Plaid items expire automatically — but worth noting.

### ⚠️ No undo

Disconnecting is permanent and immediate. All historical data is deleted. There is no soft-delete, recycle bin, or grace period. If a user disconnects by accident, they must reconnect and wait for transaction history to re-sync (up to 2 years, but Plaid history availability varies by institution).
