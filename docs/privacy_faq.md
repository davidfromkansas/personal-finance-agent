# Privacy & Security FAQ

> **Early Preview — Use at Your Own Risk.** Abacus is an early-stage personal project, not a commercial product. While we take data protection seriously and encrypt all sensitive information, this software has not been independently audited, and we make no guarantees about its security or reliability. Do not rely on Abacus as your sole financial record. By using Abacus you acknowledge that it is provided "as is" without warranty of any kind.

## What data does Abacus store?

Abacus stores your transaction history, account balances, investment holdings, and portfolio snapshots so you can view trends over time. We also store your Plaid connection tokens (so we can sync new data) and basic account metadata like account names and institution names.

## Is my data encrypted?

Yes. All sensitive fields are encrypted at the application layer using AES-256-GCM before they are written to the database. This includes transaction amounts, merchant names, categories, account names, balances, investment holdings, and more. Even someone with direct access to the database sees only unreadable ciphertext.

## Can Abacus employees read my data?

A developer who logs into the database will see encrypted gibberish for all financial data. Your identity is also protected: your Google account is mapped to a random anonymous ID, so there is no way to tell whose data belongs to whom just by looking at the database.

## What can someone see if they access the database?

Only two things are stored in plaintext: **dates** (needed for filtering and database constraints) and **Plaid identifiers** (opaque IDs used internally by Plaid). Everything else — amounts, names, categories, balances, tickers — is encrypted. Combined with anonymous user IDs, even the dates are meaningless without knowing who they belong to.

## How does Plaid connect to my bank?

Abacus uses [Plaid](https://plaid.com) to securely connect to your financial institutions. Plaid handles the bank login process directly — Abacus never sees your bank username or password. The connection token Plaid gives us is encrypted before storage.

## Does the AI assistant have access to my data?

Yes. When you ask the AI assistant a question, it can query your decrypted data to answer questions about your spending, investments, and cash flow. This is the same data you see on the dashboard. The AI does not store conversation history or share your data with third parties.

## What happens if the database is breached?

An attacker who obtains a copy of the database would see only encrypted values and anonymous user IDs. Without the encryption key (which is stored separately from the database), the financial data cannot be decrypted.

## Can I delete my data?

You can disconnect any linked account at any time from the Accounts page. When you disconnect an account, we remove the Plaid connection. For a full data deletion request, contact us and we will remove all records associated with your account.

## Where is my data stored?

Your data is stored in a PostgreSQL database hosted on [Railway](https://railway.app), a US-based cloud platform. All connections to the database use TLS encryption in transit.
