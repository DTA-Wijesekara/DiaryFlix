# DiaryFLIX operations

## Current architecture
React/Vite frontend, Express API, PostgreSQL using pg, and a privileged local stdio MCP process. Diary and wishlist caches are in memory and are cleared on logout; only session credentials and TMDB preferences remain in browser storage. Data pages subscribe to cache updates. Full history is fetched in bounded pages for current client-side statistics.

## Local setup
Use Node 22.13 or newer and PostgreSQL. In server and frontend run npm ci, copy the respective .env.example to .env and supply local configuration. Never commit real environment files.

From server: run npm run db:migrate, then npm start. From frontend: run npm run dev. Set DATABASE_URL and use DB_SSL=false only for local PostgreSQL without TLS. Real cloud database TLS verifies certificates; use DB_SSL_CA for a private CA. Connection-string SSL flags do not override this policy.

Configure working SMTP before offering password registration/recovery. New password accounts receive no session until email recovery proves ownership and sets a password. The recovery page is also the initial verification flow. SMTP failures do not disclose account existence; monitor delivery failures. Real recovery tokens are not logged.

## Existing deployment rollout
1. Back up PostgreSQL and verify restore access. Rotate any real credentials previously committed in .env files; removing Git tracking does not remove history or revoke credentials.
2. Configure SMTP, APP_URL, CORS_ORIGIN, JWT_SECRET, and verified database TLS. JWT_SECRET must be at least 32 characters. All VITE_ settings are browser-visible.
3. Pause writes during migration. Run npm run db:audit. Its output contains record IDs and should remain private.
4. Run npm run db:migrate. Migrations are serialized and recorded. Existing ambiguous duplicates, invalid external media types, or dangling watch references stop constraint installation without deleting data. Review and repair these using the backup and known metadata, then retry. The migration intentionally does not guess which overwritten movie metadata was correct.
5. Deploy backend and frontend together. Old tokens lack the session version and will be rejected. Existing recovery links are invalidated while their timestamps are migrated to timezone-aware storage; request a new link after deployment. Existing password accounts must use Forgot password to prove email ownership. Recovery removes historic Google links on unverified accounts; users may explicitly relink Google in Settings. Google-only accounts can prove ownership with Google.
6. Run npm run graph:refresh. Schedule this command hourly in the hosting provider's scheduler. It atomically publishes a shared snapshot and removes expired rate/reset records. A failed graph build preserves the previous snapshot. No deployment schedule is installed automatically by the code.
7. Verify registration/recovery email, login, linking, admin revocation, diary, wishlist, and recommendations before reopening writes.

Run migrations only with a deployment role. HTTP/MCP startup validates the schema; it never creates tables or seeds accounts. Admin seeding is an explicit db:migrate option and still requires email recovery.

There is a maximum of three admin accounts, including inactive or unverified bootstrap accounts. HTTP and MCP promotions require a verified email, and promotions and admin seeding share a transaction lock to enforce the cap. Demote an existing admin to free a slot. The last verified active admin cannot be removed, demoted, or deactivated. Bootstrap accounts still require email recovery before sign-in. Keep `SEED_ADMIN=false` after provisioning so a removed seeded account is not recreated by a later migration.

## Deployment details
Production rate limits share PostgreSQL counters. Configure TRUST_PROXY with the actual trusted upstream addresses/CIDRs; incorrect settings can group clients or permit forged client addresses. The default trusts no proxy. Never enable a blanket trust-all setting.

The API serves paginated array responses for logs/wishlist: limit (default 200, maximum 500), offset. Existing clients must load remaining pages. Recommendations load the published PostgreSQL snapshot, with no cold-start rebuild or background interval. Rebuild budgets are 100,000 input watches and 100,000 candidate pairs; larger deployments need partitioned candidate generation before raising these bounds.

The MCP process has database-level administrative authority. Restrict its local environment and access. It uses the same account mutation service as HTTP, including last-active-admin protection and session revocation.

## Verification
From server: npm test. For real PostgreSQL tests, set TEST_DATABASE_URL to a dedicated localhost database whose name ends in _test, then run npm run test:integration. These tests truncate fixtures: never use a production copy containing valuable data. CI creates an isolated PostgreSQL service.

From frontend: npm run lint, npm run build, then npx playwright install chromium and npm run test:e2e. On Windows, PW_CHANNEL=msedge can use an installed Edge browser. Browser tests mock the API and external services; PostgreSQL integration tests separately exercise real backend behavior. A build warning about bundle size is advisory; no production deployment is performed by these commands.

## Rollback
Keep the database backup and previous deployment available. Schema additions are forward-compatible at the storage level, but the old application's authorization behavior is unsafe. Prefer a forward fix. Do not restore old JWT acceptance or automatic Google email linking as a rollback shortcut. Database restore is an operator decision and is never invoked by migrations.

## Local sign-in troubleshooting
The Vite dev server uses port 5173 with strictPort, so it cannot silently switch to an unauthorized Google origin. In the Google Cloud web OAuth client, register the exact frontend origin (http://localhost:5173). Backend GOOGLE_CLIENT_ID and frontend VITE_GOOGLE_CLIENT_ID must match. Restart Vite after environment changes.

For a deployed build, set `VITE_GOOGLE_CLIENT_ID` in the frontend hosting project's build environment and rebuild; changing only the backend variable or setting a frontend container runtime variable cannot update an existing Vite bundle. Docker builds accept `--build-arg VITE_GOOGLE_CLIENT_ID=...`. Configure the live frontend origin in Google Cloud as well. Without a frontend client ID, only email/password sign-in is shown. A blocked or failed Google script now shows a visible fallback message.

If Neon connections are refused over IPv6 on the local network, set DB_IP_FAMILY=4 in server/.env. This changes database TCP address selection only; the hostname and TLS verification remain unchanged. Connections time out after 15 seconds, and queries are not automatically replayed.

An EMAIL_UNVERIFIED response requires the existing email recovery flow; it is not repaired by disabling verification or creating a replacement account.
