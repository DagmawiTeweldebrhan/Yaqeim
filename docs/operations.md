# Operating Yaqeim

Yaqeim has two deployable concerns: the Next.js web application on Vercel and a separate administrator-run Python ingestion pipeline. Supabase provides PostgreSQL and authentication. The web runtime must use user-scoped Supabase credentials; direct database and ingestion credentials belong only in trusted administrative environments.

Deployment preparation is included in the repository. The user will connect Supabase and Vercel separately; hosted deployment, SMTP delivery, real university sign-in, and live provider checks remain deferred until those services are connected. No local preview or passing test is described as a live production deployment.

## Local development

1. Install Node.js 24 LTS and Python 3.12 or newer.
2. Run `npm ci` in the repository root.
3. Copy `.env.example` to `.env.local` and fill the web configuration. Keep credentials out of Git.
4. Run `npm run dev` and open `http://localhost:3000`.

For a local visual preview, explicitly enable `DEMO_MODE=true`. Demo content is fictional. It is not a replacement for configuring Supabase and must remain disabled in deployed environments containing real reviews.

Run the web checks with `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db`, and `npm run build`. Database tests execute the reviewed SQL against isolated PostgreSQL-compatible PGlite without external credentials. Install the browser with `npx playwright install chromium`, then run `npm run test:e2e`. Run offline ingestion tests with `python -m unittest discover -s pipeline/tests -v`. See the pipeline's own README for its install and execution commands.

## Environment separation

Create separate Supabase projects for staging and production. Use a region near the student population that is available in the provider account; measure actual latency before choosing. Never connect preview deployments to the production database.

Use distinct Vercel environment variables for Preview and Production:

| Variable                        | Meaning                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL of that environment's Supabase project                                                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Its publishable/anonymous API key; RLS protects access                                           |
| `NEXT_PUBLIC_SITE_URL`          | Canonical HTTPS origin for that environment                                                      |
| `UNIVERSITY_EMAIL_DOMAIN`       | Exact allowed domain; default `nyu.edu`; keep in sync with SQL policy                            |
| `DEMO_MODE`                     | `false` for real staging and production                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server-only credential for magic-link rate-limit bookkeeping; never used for student data access |

The web deployment does not need `DATABASE_URL`, Facebook cookies, or an LLM API key. Keep these outside Vercel. A server-only Supabase service-role credential is used exclusively for unauthenticated magic-link rate-limit bookkeeping; never use it to fetch or mutate student-facing review data. Public environment variables are embedded in browser assets: changing them requires a rebuild.

## Supabase authentication setup

Configure Supabase Auth's Site URL to the canonical site origin and allow only the application's intended callback URLs (for example, `https://your-domain.example/auth/callback` and the local-development equivalent). Avoid unrestricted wildcard callbacks in production. Configure a verified SMTP sender and enable provider rate limits/abuse controls before onboarding students. The application uses magic links; no external OAuth configuration is required unless that flow is explicitly added.

Keep the exact permitted email domain consistent between application configuration and the database domain restriction. `nyu.edu.evil.example` is not an allowed university address. A verified mailbox is proof of mailbox control, not independent enrollment verification.

In staging, exercise a valid university address, a non-university address, an expired link, reuse of a link, logout, and direct navigation to a protected URL without a session. Check that anonymous review responses never disclose author identifiers or email addresses. Never include a real magic-link URL in tickets or logs.

## Schema changes and deployment

The Drizzle schema and versioned SQL are authoritative. Generate and review migrations locally; do not edit an already-applied migration or use schema-push commands against production. Include custom RLS, grants, triggers and search functions in the reviewed SQL. Schema changes should be additive first: deploy compatible readers/writers, backfill separately, and remove obsolete fields in a later release.

The repository provides a manually dispatched **Apply database migrations** workflow with separate `staging` and `production` GitHub environments. Each environment needs its own `DATABASE_URL` secret. Configure the production environment to permit only the production branch. The workflow validates the source and runs `npm run db:migrate`; it does not create Supabase projects or fabricate missing credentials. Test schema and data-access policies in staging before dispatching production. GitHub environment protection can enforce your team's release policy.

Connect the GitHub repository to Vercel using the Next.js preset. `vercel.json` uses `npm ci` and `npm run build`. Set the intended production branch, configure the environment variables, and allow Vercel's Git integration to build preview/production deployments. Apply backward-compatible database migrations before deploying code that depends on them. Require the validation workflow to pass before merging. A successful local build or Git push is not proof of a successful hosted deployment: inspect Vercel's deployment state and then run the hosted smoke tests.

Record the commit SHA, migration version, deployment URL and test outcome for each release. The [Supabase environment guide](https://supabase.com/docs/guides/deployment/managing-environments) describes separate staging/production projects; the [Playwright CI guide](https://playwright.dev/docs/ci) documents browser installation and diagnostics.

## Release smoke test

Use staging accounts and synthetic review text first:

1. Confirm an unauthenticated visitor sees the login page and cannot read data through direct API requests.
2. Sign in through a real university magic link; confirm session persistence on reload and logout invalidation.
3. Search by professor, code and title. Combine Easy A and Light Workload and verify results are supported by reviews carrying both tags.
4. Compare professors for one course and check aggregate counts/means against known fixture data.
5. Create a review, reject a duplicate, edit it, and delete it. Recalculate the expected aggregates after every step.
6. Sign in as a second user. Verify no author-only controls or direct edit access; verify helpful-vote changes persist.
7. Inspect anonymous API responses and page source for identity leakage. Verify review text containing HTML displays as text.
8. Test a narrow viewport, keyboard navigation, empty search results and missing-record pages.

Offline tests cannot verify SMTP delivery, external provider credentials, live RLS configuration, Vercel/Supabase region latency, or Facebook group markup. Report those checks separately and do not mark them complete without evidence.

## Backups, rollback and maintenance

Enable a Supabase backup schedule appropriate to the data and account plan. Retain an encrypted export before significant migrations and rehearse restoration to an isolated project. Never restore over the live database merely to test a backup. Application rollback uses a previous Vercel deployment that remains compatible with the current schema; destructive migrations generally need a forward repair or a separately planned restore.

Monitor provider errors, failed auth attempts, migration failures, query latency and database growth. Avoid logging review bodies, email addresses, cookies, access tokens or raw scraped posts. Review recommendation counts and imported/native proportions after every ingestion run; unusually large shifts should be investigated before publishing the import.

At the end of each semester, the designated administrator runs the pipeline with their own authorized session, reviews the extracted and normalized output, redacts identifying information, verifies source deduplication and imports into staging first. Only approved, validated records should be imported into production. Keep raw source files and cookies in encrypted local storage outside the repository, with a documented retention period. The importer must remain safe to rerun; the source hash prevents duplicate historical reviews.

For profile/catalog maintenance, use a trusted administrator database role and reviewed transaction. Repoint related reviews before merging duplicate profiles, resolve resulting duplicate user/professor/course combinations explicitly, then verify aggregates and foreign keys. Never expose administrative credentials or merge operations in a student browser session.
