# Spendime

Spendime is a self-hosted personal-finance application focused on true financial
utility: ordinary spending, amortized costs, recurring entries, liabilities,
and asset growth.

The implementation includes the PostgreSQL schema, Raspberry Pi ARM64 Compose
deployment, Email/Password authentication, financial CRUD APIs, DCA contribution
history, timezone-aware analytics, and an installable responsive React PWA.

```bash
docker compose up -d --build
docker compose --profile test run --rm --build auth-test
```

Documentation:

- `docs/project-structure.md`
- `docs/deployment.md`
- `docs/authentication.md`
- `docs/api.md`
- `docs/frontend.md`
