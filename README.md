# Yaqeim

A private NYUAD course and professor archive, implemented from [architecture.md](architecture.md). The interface follows the user-confirmed **Academic Archive** design: parchment, Georgia headings, Verdana text, an 800px reading column, classic links, and native controls.

The repository contains the Next.js application, Supabase/PostgreSQL migrations, a separate Python ingestion package, and executable tests. Supabase and Vercel connection is intentionally left to the owner; the application does not pretend that a sample preview is a live deployment.

## Run locally

Use Node.js 24 LTS and Python 3.12+.

```sh
npm ci
```

Copy `.env.example` to `.env.local`. For a fictional local preview, set `DEMO_MODE=true` and leave both Supabase variables empty. Then:

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). Sample reviews and votes are deliberately not persisted. To use real accounts and data, configure Supabase and apply the migrations as described in [the operations guide](docs/operations.md).

On the original Windows workstation, Node was installed portably. If a new terminal cannot find `npm`, first run:

```powershell
$env:PATH = "$env:LOCALAPPDATA\YaqeimTools\node-v24.22.2-win-x64;$env:PATH"
```

## Features

- University magic-link authentication and database-enforced private access.
- Weighted text search, partial matches, typo tolerance, and exact tag intersections.
- Professor statistics, course comparisons, confidence-ranked recommendations, and progressive review feeds.
- Anonymous or named reviews, owner-only editing/deletion, duplicate protection, and helpful votes.
- Durable rate limits and anonymous author protection in API responses.
- Authorized Selenium collection, validated Gemini extraction, editorial review, and idempotent imports.
- Separate staging/production migration workflow and Vercel Git deployment configuration.

## Verify

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

From `pipeline/`, run `python -m unittest discover -s tests -v`. The database tests apply the actual Drizzle migrations to isolated PostgreSQL WASM, then exercise authentication policies and SQL procedures. They also execute the Python importer's exact bound SQL. Browser tests run separate sample and locked-down production-mode servers.

Tests use synthetic accounts and content. Real email delivery, hosted provider configuration, and live Facebook/Gemini execution require service access and are listed separately from local verification.

## Project map

| Location              | Responsibility                                                              |
| --------------------- | --------------------------------------------------------------------------- |
| `src/app/`            | Server-rendered routes, authentication callback, validated actions          |
| `src/components/`     | Forms, review feeds, metrics, and navigation helpers                        |
| `src/lib/`            | Authentication, data access, validation, taxonomy, explicit sample fixtures |
| `src/db/`, `drizzle/` | Type-safe schema and reviewed SQL migrations                                |
| `supabase/`           | Database integration tests and administrator operations                     |
| `pipeline/`           | Separate ingestion package, Docker image, tests, and runbook                |
| `tests/`              | Application/security/component and browser tests                            |
| `.github/workflows/`  | Validation and environment-specific migrations                              |

See [verification results](docs/implementation-report.md), [architecture coverage](docs/architecture-checklist.md), [operations](docs/operations.md), [database administration](supabase/ADMINISTRATION.md), and [ingestion instructions](pipeline/README.md).

## Architecture decisions

The confirmed Phase 1 visual design supersedes the contradictory dark/brutalist paragraphs. All displayed ratings use 1–5; imported 1–10 sentiment is converted explicitly, and unreported metrics stay null. Authentication verifies university-mailbox ownership, not enrollment. Aggregates are calculated from current rows so edits/deletions cannot leave stale averages. Sensitive writes use authenticated database procedures with persistent rate limits; privileged credentials are used only by administrative tools and the server's sign-in limiter. Review forms show a pending state and confirm success only after persistence.

Never commit `.env` files, session cookies, raw source posts, database credentials, or service-role keys. The repository ignores those artifacts by default.
