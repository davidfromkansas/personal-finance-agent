import { Link } from 'react-router-dom'

export function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#f8f8f8] font-[Roboto,sans-serif] text-black">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link
          to="/"
          className="text-sm text-gray-500 hover:text-black transition-colors"
        >
          &larr; Back to home
        </Link>

        <h1 className="text-4xl font-medium mt-8 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-12">
          Last updated: February 2026
        </p>

        <div className="space-y-10 text-[15px] leading-relaxed text-gray-800">
          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              1. Acceptance of terms
            </h2>
            <p>
              By accessing or using Crumbs Money ("the Service"), you agree to
              be bound by these Terms of Service and our{' '}
              <Link to="/privacy" className="underline">
                Privacy Policy
              </Link>
              . If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              2. Description of service
            </h2>
            <p>
              Crumbs Money is a read-only personal finance dashboard. The
              Service allows you to:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>
                Link bank accounts, credit cards, and investment accounts
                through Plaid.
              </li>
              <li>View account balances and transaction history.</li>
              <li>View investment holdings.</li>
            </ul>
            <p className="mt-3">
              The Service is <strong>read-only</strong>. We do not initiate
              transactions, transfer funds, or make any changes to your
              financial accounts.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              3. Account &amp; authentication
            </h2>
            <p>
              You sign in using your Google account through Firebase
              Authentication. You are responsible for maintaining the security
              of your Google account. We do not store any passwords.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              4. Financial data
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Financial data is provided by your financial institutions
                through Plaid. We display it as-is and do not guarantee its
                accuracy, completeness, or timeliness.
              </li>
              <li>
                Account balances and investment holdings are fetched live and may
                be subject to delays from your financial institution.
              </li>
              <li>
                Transaction data is synced periodically and may not reflect the
                most recent activity.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              5. Not financial advice
            </h2>
            <p>
              Crumbs Money is an informational tool only. Nothing in the Service
              constitutes financial, investment, tax, or legal advice. You
              should consult a qualified professional before making financial
              decisions. We are not responsible for any decisions you make based
              on information displayed in the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              6. Third-party services
            </h2>
            <p>
              The Service relies on third-party providers including Plaid,
              Google/Firebase, and Railway. Your use of these services is
              subject to their respective terms and privacy policies. We are not
              responsible for the availability, accuracy, or conduct of
              third-party services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              7. Data &amp; privacy
            </h2>
            <p>
              Your use of the Service is also governed by our{' '}
              <Link to="/privacy" className="underline">
                Privacy Policy
              </Link>
              , which describes what data we collect, how we use it, and your
              rights regarding your data. By using the Service, you consent to
              the collection, processing, and storage of your data as described
              in the Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              8. Disconnecting &amp; data deletion
            </h2>
            <p>
              You may disconnect any financial institution at any time through
              the app. Disconnecting permanently deletes all stored data for
              that connection and revokes the access token with Plaid. You may
              also request complete deletion of all your data by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              9. Prohibited use
            </h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>
                Use the Service for any unlawful purpose or in violation of any
                applicable laws.
              </li>
              <li>
                Attempt to access another user's data or interfere with the
                Service's security.
              </li>
              <li>
                Reverse-engineer, decompile, or attempt to extract the source
                code of the Service.
              </li>
              <li>
                Use automated tools (bots, scrapers) to access the Service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              10. Limitation of liability
            </h2>
            <p>
              To the maximum extent permitted by law, Crumbs Money and its
              operators shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages, or any loss of
              profits, data, or goodwill, arising from or related to your use of
              the Service. The Service is provided "as is" and "as available"
              without warranties of any kind, express or implied.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              11. Changes to these terms
            </h2>
            <p>
              We may update these Terms from time to time. If we make material
              changes, we will notify you through the Service. Continued use of
              the Service after changes constitutes acceptance of the updated
              Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-black mb-3">
              12. Contact
            </h2>
            <p>
              For questions about these Terms, contact us at{' '}
              <strong>[contact to be added]</strong>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
