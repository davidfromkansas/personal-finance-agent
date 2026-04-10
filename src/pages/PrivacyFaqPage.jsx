import { Link } from 'react-router-dom'

export function PrivacyFaqPage() {
  return (
    <div className="min-h-screen bg-[#f8f8f8] font-[Roboto,sans-serif] text-black">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link
          to="/app"
          className="text-sm text-gray-500 hover:text-black transition-colors"
        >
          &larr; Back to dashboard
        </Link>

        <h1 className="text-4xl font-medium mt-8 mb-2">Privacy &amp; Security FAQ</h1>
        <p className="text-sm text-gray-500 mb-12">
          Last updated: April 2026
        </p>

        <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 mb-12">
          <p className="text-[15px] font-medium text-amber-900 mb-2">
            Early Preview &mdash; Use at Your Own Risk
          </p>
          <p className="text-[14px] leading-relaxed text-amber-800">
            Abacus is an early-stage personal project, not a commercial product. While we take
            data protection seriously and encrypt all sensitive information, this software has
            not been independently audited, and we make no guarantees about its security or
            reliability. Do not rely on Abacus as your sole financial record. By using Abacus
            you acknowledge that it is provided &ldquo;as is&rdquo; without warranty of any kind.
          </p>
        </div>

        <div className="space-y-10 text-[15px] leading-relaxed text-gray-800">
          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              What data does Abacus store?
            </h2>
            <p>
              Abacus stores your transaction history, account balances, investment holdings,
              and portfolio snapshots so you can view trends over time. We also store your
              Plaid connection tokens (so we can sync new data) and basic account metadata
              like account names and institution names.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              Is my data encrypted?
            </h2>
            <p>
              Yes. All sensitive fields are encrypted at the application layer using
              AES-256-GCM before they are written to the database. This includes
              transaction amounts, merchant names, categories, account names, balances,
              investment holdings, and more. Even someone with direct access to the
              database sees only unreadable ciphertext.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              Can Abacus employees read my data?
            </h2>
            <p>
              A developer who logs into the database will see encrypted gibberish for
              all financial data. Your identity is also protected: your Google account
              is mapped to a random anonymous ID, so there is no way to tell whose data
              belongs to whom just by looking at the database.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              What can someone see if they access the database?
            </h2>
            <p>
              Only two things are stored in plaintext: <strong>dates</strong> (needed for
              filtering and database constraints) and <strong>Plaid identifiers</strong>{' '}
              (opaque IDs used internally by Plaid). Everything else &mdash; amounts,
              names, categories, balances, tickers &mdash; is encrypted. Combined with
              anonymous user IDs, even the dates are meaningless without knowing who
              they belong to.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              How does Plaid connect to my bank?
            </h2>
            <p>
              Abacus uses{' '}
              <a href="https://plaid.com" target="_blank" rel="noopener noreferrer"
                className="underline hover:text-black">
                Plaid
              </a>{' '}
              to securely connect to your financial institutions. Plaid handles the bank
              login process directly &mdash; Abacus never sees your bank username or
              password. The connection token Plaid gives us is encrypted before storage.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              Does the AI assistant have access to my data?
            </h2>
            <p>
              Yes. When you ask the AI assistant a question, it can query your decrypted
              data to answer questions about your spending, investments, and cash flow.
              This is the same data you see on the dashboard. The AI does not store
              conversation history or share your data with third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              What happens if the database is breached?
            </h2>
            <p>
              An attacker who obtains a copy of the database would see only encrypted
              values and anonymous user IDs. Without the encryption key (which is stored
              separately from the database), the financial data cannot be decrypted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              Can I delete my data?
            </h2>
            <p>
              You can disconnect any linked account at any time from the Accounts page.
              When you disconnect an account, we remove the Plaid connection. For a full
              data deletion request, contact us and we will remove all records associated
              with your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              Where is my data stored?
            </h2>
            <p>
              Your data is stored in a PostgreSQL database hosted on{' '}
              <a href="https://railway.app" target="_blank" rel="noopener noreferrer"
                className="underline hover:text-black">
                Railway
              </a>
              , a US-based cloud platform. All connections to the database use TLS
              encryption in transit.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            Have more questions?{' '}
            <Link to="/privacy" className="underline hover:text-black">
              Read our full Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
