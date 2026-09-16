# Spendime

Spendime is a self-hosted personal-finance application focused on true financial
utility: ordinary spending, amortized costs, recurring entries, liabilities,
and asset growth.

The current implementation includes the PostgreSQL schema, Raspberry Pi ARM64
Compose deployment, and the Email/Password authentication API.

```bash
docker compose up -d --build
docker compose --profile test run --rm --build auth-test
```

Documentation:

- `docs/project-structure.md`
- `docs/deployment.md`
- `docs/authentication.md`
