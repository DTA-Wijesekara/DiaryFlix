# DiaryFLIX

A personal film and TV diary built with React, Express, and PostgreSQL / Neon.

Record dated watches, ratings, moods, notes, favourite songs and quotes. Track TV episodes, keep a watchlist, browse recommendations, and export your diary to CSV.

The cinema journal theme uses warm paper, burgundy accents, and original illustrated posters. The public sample diary contains fictional titles. In your own diary, select **All months** and a year to revisit past watches, search titles and notes, or filter by rating. Mark a title as a **Favourite** from its detail page; the choice applies across its rewatches and is available in the library filter and CSV export.

This release requires schema migration **7**, which adds the per-user title favourite flag without removing existing records. Deploy the migrated backend together with the updated frontend.

## Repository layout

```text
.github/workflows/       GitHub Actions checks
frontend/
  public/                Static assets
  src/
    components/          Shared UI and styles
    context/             Authentication state
    hooks/               Shared React hooks
    pages/               Screens and screen styles
    services/            API clients, caches, and recommendations
  e2e/                   Playwright browser tests
server/
  routes/                Auth, diary, TV, wishlist, admin, recommendations
  lib/                   Shared domain logic and database helpers
  mcp/                   Privileged local MCP tools
  tests/                 Mocked unit/API tests
  integration/           Isolated PostgreSQL tests
  db.js                  Database pool and transaction helpers
  migrate.js             Explicit, versioned schema migrations
  audit-db.js            Read-only database integrity audit
  refresh-graph.js       Recommendation snapshot rebuild
  server.js              API entry point
docs/
  OPERATIONS.md          Deployment, security, recovery, and testing
  TV_TRACKING.md         Episode logging and progress rules
```

Each application keeps its own package manifest, lockfile, deployment configuration, and `.env.example`. Run npm commands from the appropriate application folder. There is no root npm package.

## Run locally

Use Node.js 22.13 or newer and an existing PostgreSQL database (local or Neon).

1. Copy `server/.env.example` to `server/.env` and configure `DATABASE_URL`, a strong `JWT_SECRET`, and `CORS_ORIGIN`.
2. For Neon, set `DB_SSL=true`. Use `DB_SSL=false` only with a local database without TLS. On networks with broken IPv6, `DB_IP_FAMILY=4` selects IPv4 without weakening TLS verification.
3. Configure SMTP and `APP_URL` for email verification and password recovery. Keep `SEED_ADMIN=false` unless explicitly provisioning an initial admin.
4. Copy `frontend/.env.example` to `frontend/.env`. The default API URL is `http://localhost:5000/api`. TMDB and Google sign-in settings are optional. All `VITE_` values are public browser configuration.

Start the API:

```sh
cd server
npm ci
npm run db:migrate
npm run dev
```

Migrations affect the database selected by `DATABASE_URL`. Back up an existing database before migrating. API startup checks the schema and does not run migrations automatically.

In another terminal, start the frontend:

```sh
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Register and complete email verification. Google sign-in requires matching client IDs and the exact frontend origin configured in Google Cloud.

## Administration

Admins can manage account roles, activation, and deletion. There are at most three admin accounts, including inactive admins. Promotions require a verified email; the last verified active admin is protected. Registration always creates a regular user.

For bootstrap and deployment details, see [Operations](docs/OPERATIONS.md). For film versus episode behaviour, see [TV tracking](docs/TV_TRACKING.md).

## Checks

From `server`:

```sh
npm test -- --runInBand
npm run db:audit
```

`db:audit` reads the configured database. Integration tests require a separate localhost database with a name ending in `_test`; they erase their fixtures. Set `TEST_DATABASE_URL` to that database, then run `npm run test:integration`. Never point integration tests at Neon or valuable data.

From `frontend`:

```sh
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

On Windows, an installed Edge browser can be used by setting `PW_CHANNEL=msedge`. Browser tests mock API and external-service responses. GitHub Actions also runs the PostgreSQL integration tests.

## Local MCP setup

Copy `.mcp.example.json` to `.mcp.json` for a client launched from this repository root. If your client uses another working directory, set the local config argument to the absolute path of `server/mcp/index.js`. The local MCP process has database administrative privileges. Keep `.mcp.json` and real environment files private.

## Before publishing

- Commit source, tests, package lockfiles, deployment configuration, and `.env.example` templates.
- Keep `.env`, local tool settings, notes, database dumps, local PostgreSQL data, dependencies, build output, and test reports ignored.
- Existing Git history contains previously tracked environment files. Ignoring them now does not remove old secrets: rotate exposed credentials before making the repository public. History cleanup is a separate operation that rewrites commits.
- Deploy backend and frontend together and configure their environment variables in the hosting provider. A Git push alone is not proof that migrations or deployment succeeded.

See [Operations](docs/OPERATIONS.md) for the full rollout procedure.
