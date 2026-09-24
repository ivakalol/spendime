import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, PageHeader } from '../components/ui';

const contact = 'ivaylo.s.chernev@gmail.com';

function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Spendime`;
    return () => { document.title = previous; };
  }, [title]);
  return <div className="min-h-dvh px-4 pb-10 safe-top sm:px-6">
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3 pt-6">
        <Link to="/" className="text-xl font-bold tracking-tight text-brand hover:text-accent">Spendime</Link>
        <nav aria-label="Legal pages" className="flex flex-wrap gap-5 text-sm font-semibold text-brand">
          <Link className="hover:underline" to="/privacy">Privacy Policy</Link>
          <Link className="hover:underline" to="/terms">Terms of Service</Link>
          <Link className="hover:underline" to="/login">Sign in</Link>
        </nav>
      </header>
      <main>
        <PageHeader eyebrow="Spendime" title={title} description="Last updated 24 September 2026" />
        <Card><article className="space-y-7 text-sm leading-7 text-ink [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-brand [&_p+p]:mt-3 [&_ul]:ml-5 [&_ul]:list-disc [&_a]:font-semibold [&_a]:text-brand [&_a]:underline">
          {children}
        </article></Card>
      </main>
      <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>© {new Date().getFullYear()} Spendime · Ivaylo Chernev</span>
        <span><Link className="underline" to="/privacy">Privacy</Link> · <Link className="underline" to="/terms">Terms</Link></span>
      </footer>
    </div>
  </div>;
}

export function PrivacyPage() {
  return <LegalLayout title="Privacy Policy">
    <section><h2>Who operates Spendime</h2>
      <p>Spendime is operated by Ivaylo Chernev in Bulgaria. For questions about this notice or your data, contact <a href={`mailto:${contact}`}>{contact}</a>.</p>
      <p>Spendime lets registered users record and review their personal finances. Its bank connection is a separate feature available only to the one Spendime account designated by the operator. Other users cannot connect banks through Spendime.</p>
    </section>
    <section><h2>Information we handle</h2>
      <ul>
        <li><strong>Account and sign-in:</strong> your name, email address, password hash, account settings, and session records. Session records may include an IP address and browser user-agent, along with creation time and expiry.</li>
        <li><strong>Finance records you enter:</strong> money accounts, opening balances, transactions, categories, assets, liabilities, recurring templates, descriptions, and related amounts, currencies, and dates.</li>
        <li><strong>Owner-only bank connection, if activated:</strong> selected institution, authorization and consent status, linked account identifiers and names, balances, and transaction dates, amounts, currencies, descriptions, and available merchant or counterparty names. Spendime stores a provider session identifier in encrypted form.</li>
      </ul>
      <p>We use this information to provide sign-in, maintain the finance records you request, calculate balances and reports, prevent unauthorized access, and, for the designated owner only, import authorized bank data. Spendime does not ask you to type your bank password into this site.</p>
    </section>
    <section><h2>Bank authorization and third parties</h2>
      <p>The ordinary finance features do not require a bank connection. If the owner chooses to connect a bank, Spendime sends the selected institution and requested account-information scope to Enable Banking. The owner then authorizes access on the bank and Enable Banking authorization pages. The bank makes authorized account information available through Enable Banking to Spendime. Ordinary finance entries entered in Spendime are not sent to Enable Banking. The owner can disconnect the connection in Spendime and may also need to revoke access at the bank.</p>
      <p>Enable Banking and the bank handle information under their own notices and authorization terms. See <a href="https://enablebanking.com/privacy/" target="_blank" rel="noreferrer">Enable Banking’s privacy notice</a>. Infrastructure used to deliver Spendime, including its hosting and Cloudflare if configured as the site’s reverse proxy or CDN, carries requests and responses that may contain information you submit, as well as connection metadata such as IP address and browser information. The current banking import does not send real financial data to Google Gemini; automatic AI categorization is disabled. The application code does not include advertising or third-party analytics integrations.</p>
    </section>
    <section><h2>Cookies, device storage, and security</h2>
      <p>Spendime uses an HttpOnly session cookie to keep you signed in. The browser stores your chosen interface language and chart display preferences on your device. The installable web app may cache the app shell and navigation pages; financial API responses are configured for network access rather than offline caching.</p>
      <p>Passwords are stored as hashes, server sessions can be revoked, banking session identifiers are encrypted, and database access is scoped to each user. These measures reduce risk but cannot guarantee absolute security.</p>
    </section>
    <section><h2>Retention and your choices</h2>
      <p>Spendime currently has no automatic account deletion or fixed retention schedule in the application. Records remain until they are removed by an available app action or through an operator-assisted request. Disconnecting a bank stops local access but does not erase transactions already posted to the finance ledger. After disconnection, the owner can remove stored connection and staging data separately. Backup copies may remain until the relevant backup is retired.</p>
      <p>To ask for access, correction, export, or deletion of your data, email <a href={`mailto:${contact}`}>{contact}</a>. There is no self-service whole-account export or deletion feature at present. Requests will be assessed under applicable law, and identity may need to be verified. You may also complain to a data protection authority, including Bulgaria’s <a href="https://cpdp.bg/en/lodging-complaints-and-alerts/" target="_blank" rel="noreferrer">Commission for Personal Data Protection</a>.</p>
    </section>
    <section><h2>Changes</h2>
      <p>This notice may be updated when Spendime’s data handling changes. The date above identifies the current version. Material changes should be communicated to affected users through the service or another appropriate channel.</p>
    </section>
  </LegalLayout>;
}

export function TermsPage() {
  return <LegalLayout title="Terms of Service">
    <section><h2>About the service</h2>
      <p>Spendime is a personal finance recordkeeping application operated by Ivaylo Chernev in Bulgaria. Contact <a href={`mailto:${contact}`}>{contact}</a> with questions about these terms. By creating or using a Spendime account, you agree to use the service for lawful personal finance tracking.</p>
      <p>Spendime lets you enter accounts, transactions, categories, assets, liabilities, and recurring planning templates. Reports and balances are calculated from the information available to the app. Spendime does not initiate bank payments, hold your money, or provide financial, tax, or investment advice.</p>
    </section>
    <section><h2>Your account and records</h2>
      <p>Provide an email address you control, protect your password, and contact the operator if you suspect unauthorized access. You are responsible for checking the accuracy of records you enter and for reviewing imported records before relying on them for decisions. Do not enter another person’s sensitive financial information unless you are authorized to do so.</p>
      <p>Finance records belong to the account in which they were created. Access to another user’s account or attempts to interfere with the service are not permitted. Contact the operator to request account closure or help with your data; whole-account closure is not currently a self-service action.</p>
    </section>
    <section><h2>Owner-only bank connection</h2>
      <p>Banking is available only to the account specifically configured by the operator. Other registered users have the ordinary finance features without banking access. Even for the owner, real banking remains unavailable until the operator activates it and a separate Enable Banking production application is authorized for personal linked accounts.</p>
      <p>Connecting a bank requires a separate authorization through Enable Banking and the bank. Their terms, consent screens, availability, and limits also apply; see <a href="https://enablebanking.com/terms/" target="_blank" rel="noreferrer">Enable Banking’s terms</a>. Spendime does not collect your bank password. Bank access can expire or be revoked, and bank data may arrive late, be incomplete, or change. The first booked transaction history requires explicit reconciliation before later imports can post automatically. Review account balances and transactions against your bank’s own records.</p>
    </section>
    <section><h2>Availability and changes</h2>
      <p>Spendime may be unavailable during maintenance, network outages, or provider incidents. Features and these terms may change as the application develops. The operator should communicate material changes to affected users. If you no longer wish to use Spendime, contact the operator about closing your account.</p>
      <p>These terms do not remove rights that cannot lawfully be excluded. For information about personal data, see the <Link to="/privacy">Privacy Policy</Link>.</p>
    </section>
  </LegalLayout>;
}
