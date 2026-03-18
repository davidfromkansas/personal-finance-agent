# Product Principles

Guiding principles for planning, feature design, and decision-making in Crumbs Money. When evaluating options or tradeoffs, these principles take precedence.

---

## 1. Accuracy over coverage

> "We should only do what results in us being able to give as close to 100% accurate answers. If there's a risk of tainting the accuracy of the data, I would rather be more conservative."

When there's a choice between showing more data with lower confidence vs. showing less data with high confidence, choose less. Never fabricate, extrapolate, or reconstruct data in a way that introduces unverifiable error. It is better to show blank than to show wrong.

Applied examples:
- No balance backfill: back-calculating historical balances from transactions compounds errors we can't verify. Live snapshots only, going forward.
- Investment backfill: exclude securities with no ticker rather than carrying forward a stale value. Show blank for dates where data doesn't exist rather than interpolating.
- Agent responses: if the agent doesn't have the data, it says so clearly. It never guesses at specific numbers.

---

## 2. Transparency about data provenance

> "We should differentiate between what is 1st party data from Plaid and what is either 3rd party data from other sources or calculated/derived ourselves."

Users (and the AI agent) should always be able to tell where a number came from. Data is labeled by source:
- 🟦 **1st party** — raw data fetched directly from Plaid
- 🟨 **3rd party** — data from external sources (e.g. Yahoo Finance historical prices)
- 🟩 **Derived** — computed or reconstructed by us from other data we already have

The agent treats these differently: 1st party = ground truth; derived/backfill = approximate context, hedged language.

---

## 3. Declarative UI — inform users, guard against edge cases

> "Our UI should be declarative so it informs users. We should also guard against edge cases of people connecting both buttons separately so it causes double-counting."

The interface should communicate what's actually happening, not just surface happy-path states. Users shouldn't have to guess what data access they granted, whether a sync is running, or why something looks off.

Applied examples:
- Show a badge per connection indicating which products were actually granted (transactions, investments, or both)
- Show account sync status so users know when data is loading vs. complete
- Prevent UI states that could silently lead to bad data (e.g. duplicate connections causing double-counted net worth)

---

## 4. Hard blocks over soft warnings for data integrity risks

> "I don't think we should allow the person to add a redundant connection to an account that already exists."

When a user action would create a state that corrupts the data (e.g. double-counting, duplicate connections), the system should hard-block it — not allow it with a warning. A soft warning relies on users reading and understanding the consequences; a hard block guarantees data integrity.

Applied examples:
- Duplicate institution detection: reject the new connection outright, call `itemRemove` to clean up the orphaned token, and redirect the user to update mode for their existing connection.

---

## 6. Surgical solutions over blunt ones

Prefer targeted, specific rules over broad exclusions or inclusions. Overly broad rules create silent gaps or unintended double-counting — problems that are hard to detect because the data looks plausible but is quietly wrong.

When filtering or categorizing data, identify the exact pattern causing the problem and scope the fix to that pattern only. Avoid catching more than you intend to.

Applied examples:
- Credit card payments fall under `LOAN_PAYMENTS` (primary category), but blanket-excluding all `LOAN_PAYMENTS` would also remove mortgages and car loans that are legitimate spending. Instead, exclude only `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` and `LOAN_PAYMENTS_LINE_OF_CREDIT_PAYMENT` via the detailed category field.
- Duplicate institution detection blocks re-adding the same institution, but allows updating an existing connection — hard block for the bad path, clear escape hatch for the valid one.

---

## 5. No catastrophic failures — degrade gracefully

> "In principle we shouldn't have edge cases that result in all-out failure."

Edge cases are inevitable. The system should handle them in a way that degrades gracefully rather than breaking the whole experience. A failure in one part (e.g. investment snapshot fails) should not block or corrupt another part (e.g. balance display).

Applied examples:
- Investment snapshot errors are caught per-user in the cron job; one failure doesn't stop others
- Missing investment data for an account (e.g. checking account) is silently skipped
- If a price lookup fails for a ticker during backfill, exclude that holding for that day rather than using zero or aborting the entire backfill
