import { Link } from 'react-router-dom'

export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#f8f8f8] font-[Roboto,sans-serif] text-black">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link
          to="/"
          className="text-sm text-gray-500 hover:text-black transition-colors"
        >
          &larr; Back to home
        </Link>

        <h1 className="text-4xl font-medium mt-8 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-12">
          Last updated: February 2026
        </p>

        <div className="space-y-10 text-[15px] leading-relaxed text-gray-800">
          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              What is Crumbs Money?
            </h2>
            <p>
              Crumbs Money is a read-only personal finance dashboard that lets
              you view your bank accounts, credit cards, investments, and
              transactions in one place. We use{' '}
              <a
                href="https://plaid.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Plaid
              </a>{' '}
              to securely connect to your financial institutions. We never
              initiate transfers, move funds, or store your bank login
              credentials.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              What data we collect
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Identity:</strong> Your name and email address from
                Google Sign-In, used to authenticate you.
              </li>
              <li>
                <strong>Financial connections:</strong> When you link a bank
                account through Plaid, we store a secure token that lets us
                retrieve your financial data. We never see or store your bank
                username or password.
              </li>
              <li>
                <strong>Transactions:</strong> We sync and store your recent
                transaction history (name, amount, date, account) so you can
                view spending across all your accounts.
              </li>
              <li>
                <strong>Balances &amp; holdings:</strong> Account balances and
                investment holdings are fetched live each time you open the app.
                They are <strong>not stored</strong> in our database.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              What we do NOT collect
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Bank login credentials (handled entirely by Plaid)</li>
              <li>Social Security numbers</li>
              <li>Full account or routing numbers</li>
              <li>
                Passwords (authentication is delegated to Google)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              How we use your data
            </h2>
            <p>
              Your financial data is used for one purpose:{' '}
              <strong>displaying it back to you</strong> in the Crumbs Money
              dashboard. We do not use your data for analytics, profiling,
              advertising, or model training. We do not sell or share your
              personal or financial data with any third party for marketing
              purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              How we protect your data
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>All data is encrypted at rest (AES-256) and in transit (TLS).</li>
              <li>
                Every API request requires authentication. All data access is
                scoped to your verified identity — no one else can see your data.
              </li>
              <li>
                Bank credentials are entered directly in Plaid's secure
                interface and never pass through our servers.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              Data retention &amp; deletion
            </h2>
            <p>
              We retain your financial data only while your connection is active.
              When you disconnect a financial institution:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>All stored transactions for that connection are permanently deleted.</li>
              <li>The connection token is revoked with Plaid.</li>
              <li>No financial data is retained after disconnection.</li>
            </ul>
            <p className="mt-3">
              You can request complete deletion of all your data at any time by
              contacting us. We will process deletion requests within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              Third-party services
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Plaid</strong> — Connects to your financial institutions
                and provides account and transaction data. See{' '}
                <a
                  href="https://plaid.com/legal/#end-user-privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Plaid's End User Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong>Google / Firebase</strong> — Handles authentication. See{' '}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Google's Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong>Railway</strong> — Hosts the application and database
                with encryption at rest and in transit.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              Your rights
            </h2>
            <p>
              Depending on where you live, you may have the right to:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>
                <strong>Access</strong> your data — visible directly in the app.
              </li>
              <li>
                <strong>Delete</strong> your data — disconnect connections in the
                app or request full account deletion.
              </li>
              <li>
                <strong>Know</strong> what data we collect — described in this
                policy.
              </li>
            </ul>
            <p className="mt-3">
              We do not sell your personal information. Because no sale or
              sharing for advertising occurs, no opt-out mechanism is needed.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              Contact us
            </h2>
            <p>
              For privacy questions or data deletion requests, contact us at{' '}
              <strong>[privacy contact to be added]</strong>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
