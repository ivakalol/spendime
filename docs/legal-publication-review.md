# Public legal pages: operator review before publication

The draft pages are implemented at `/privacy` and `/terms`. They are public React routes and do not require a Spendime session. They have **not** been legally reviewed. Ivaylo Chernev provided the operator name, contact email (`ivaylo.s.chernev@gmail.com`), and country (Bulgaria).

## Facts verified from this repository

- Registration uses name, email, and an Argon2id password hash. Server session rows store a token hash, user-agent, IP address, and expiry. The browser receives an HttpOnly session cookie.
- Users store accounts, transactions, categories, assets, liabilities, and recurring templates in PostgreSQL. No budget table or budget entry UI was found. There is no whole-account deletion/export endpoint and no implemented automatic retention period.
- Language and chart display preferences are stored on the device. The PWA may cache the app shell and navigation pages. API responses are configured as network-only and `no-store`.
- Banking is server-restricted to one configured internal user UUID. Enable Banking receives authorization requests; the bank and Enable Banking return authorized accounts, balances, and transactions. The owner may disconnect and separately remove connection/staging data; posted ledger records remain.
- Gemini is present as an optional module, but the current banking worker does not call it and the banking UI rejects enabling automatic AI categorization. Current real financial imports are not sent to Gemini.
- The application code has no ad or analytics SDK. The production hosting, reverse proxy, CDN, logs, and backups are operational configuration outside this repository.

## Confirm before treating the drafts as final

1. Have a qualified adviser confirm the applicable legal bases for account/finance processing, session security, and optional bank import. Bank authorization through Enable Banking is separate from determining a GDPR legal basis; do not describe them as equivalent without review. [GDPR Article 13](https://eur-lex.europa.eu/eli/reg/2016/679/oj) specifies information that a privacy notice must provide.
2. Confirm the actual production hosting location, Cloudflare configuration, logging, backup providers, any other subprocessors, and whether data is transferred outside the EEA. The draft identifies infrastructure recipients by role because the live setup was not accessed.
3. Set and document operational retention criteria for active accounts, inactive accounts, security/session records, support emails, banking staging data, server logs, and backups. The application does not enforce a general retention schedule.
4. Establish a documented process for access, correction, portability/export, and deletion requests, including how identities are checked, who executes database deletion, and how backup copies age out. The current application has no self-service whole-account workflow.
5. Confirm whether additional operator contact details, service eligibility conditions, or Bulgarian-language notices are required for the actual audience and legal setup. No business registration, postal address, minimum age, or company details were supplied, so the drafts make none of those claims.
6. Confirm the exact Enable Banking Restricted Mode agreement and the accounts linked in its Control Panel. Do not activate real banking or describe it as generally available to Spendime users. Enable Banking requires accessible application privacy and terms URLs but the pages must accurately reflect the live deployment.
7. Review the final text and date before deployment, then verify public HTTPS responses for `/privacy` and `/terms` while signed out. Check both in a browser and with an unauthenticated HTTP request. No deployment or live provider request was performed in this task.

Primary references: [GDPR Article 13](https://eur-lex.europa.eu/eli/reg/2016/679/oj), [Bulgarian data protection authority complaint information](https://cpdp.bg/en/lodging-complaints-and-alerts/), and [Enable Banking Control Panel guidance](https://enablebanking.com/docs/api/control-panel/).
