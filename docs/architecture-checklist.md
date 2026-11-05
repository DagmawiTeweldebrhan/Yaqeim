# Architecture acceptance checklist

`architecture.md` is the product specification. Checked items below have source or local automated-test evidence; they do not imply a hosted deployment. Unchecked external acceptance items are intentionally deferred: the user will connect Supabase/Vercel and provide the administrator's source/model access separately.

Local review on 2026-11-05: the complete TypeScript project passed type checking; UI routes/components passed ESLint; the production build served both the explicit fictional preview and the locked authentication configuration. All **27 browser acceptance cases passed**, followed by a **2-case responsive/screenshot check**. Desktop and mobile screenshots are generated into ignored `.local/screenshots/`. Database tests exercise the actual migration and RLS/RPC behavior using isolated PostgreSQL; pipeline tests use offline fixtures and an exact-SQL import contract. Live SMTP, Supabase Auth/PostgREST, Facebook, Gemini, and Vercel checks remain separate release gates.

## Decisions that resolve conflicting requirements

- **Visual design:** the user confirmed the Phase 1 **Academic Archive** style. It supersedes the dark/brutalist styling references in Phases 2, 6, and 7. The warm palette, Georgia/Verdana fonts, 800px reading column, native controls, and text navigation remain authoritative.
- **Rating scale:** native reviews and database aggregates use **1–5**. Imported LLM sentiment is explicitly converted from **1–10**, while unobserved workload/grading metrics remain absent rather than fabricated. UI labels state the displayed scale.
- **Authentication:** verifying a university mailbox establishes control of that address; it does not independently prove current student enrollment. The application must not claim stronger verification.
- **Anonymity:** anonymous identity redaction applies to API results as well as the rendered interface. Database accountability remains private.
- **Private historical content:** import tools are separate administrator commands. Sample preview data must be fictional and clearly labelled. No private group data is fetched as part of a build or test.

## Phase 1 — System and design

- [x] Web app and Python ingestion are separate packages with independently documented commands.
- [x] Supabase production data/auth integration and Vercel deployment configuration are implemented; connecting hosted services is deferred.
- [x] Background `#F9F8F6`, text `#222222`, metadata `#666666`, classic blue/visited-purple links, violet active states, ash dividers.
- [x] Georgia headings, Verdana body, Courier New course codes; 28px page heading and 14px/1.6 body copy.
- [x] Main reading column is centered and at most 800px, with no horizontal page overflow on mobile.
- [x] No animation, sticky header, modal, hamburger menu, decorative cards, or decorative shadows. Native buttons retain the specified raised inset treatment.
- [x] Plain underlined navigation, keyboard focus indicators, semantic labels, native controls and bracketed tags.

Evidence: browser inspection at desktop/mobile sizes, screenshot review, keyboard navigation, stylesheet review.

## Phase 2 — Infrastructure

- [x] Next.js App Router with TypeScript strict checking, Server Components and Tailwind.
- [x] Supabase SSR session integration; database/admin credentials are restricted to server modules.
- [x] Drizzle schema and versioned SQL migrations with a repeatable migration command.
- [x] Dependency lockfile, ignored secrets/artifacts, environment template, and reproducible CI.
- [x] Production build serves both explicitly enabled fictional demo data and a separate demo-disabled authentication boundary; the root layout forces dynamic rendering to prevent cached demo/auth content.

Evidence: clean install, lint, typecheck, unit tests, production build and CI configuration.

## Phase 3 — Ingestion

- [x] Authenticated Selenium extraction implements administrator-provided sessions, bounded scrolling, deduplication, target validation and useful failure messages; actual source access is deferred.
- [x] Extraction and LLM processing are separate, resumable commands; input/output artifacts stay outside version control.
- [x] LLM output is schema-validated, uses only the ten fixed tags, and cannot dictate executable SQL or instructions.
- [x] Prompt treats scraped text as untrusted data; missing fields and malformed results fail validation or enter review.
- [x] Import normalizes professors/courses, converts scores correctly, marks legacy reviews imported, and preserves null author IDs.
- [x] Deterministic source keys make repeated imports idempotent; import writes are transactional and parameterized, covered by the PostgreSQL import contract tests.
- [x] Import requires administrator review/redaction approval; no real historical content has been collected or published.

Evidence: offline unit tests for validation, scale boundaries, duplicate handling and import contract; local database import test. Live Facebook and LLM runs require valid administrator access and are reported separately.

## Phase 4 — Data model

- [x] UUID users tied to Supabase Auth, exact allowed university domain and verification state.
- [x] Professors, courses, reviews and helpful votes have required keys, constraints and timestamps.
- [x] Ratings enforce integer 1–5; tags enforce the fixed taxonomy; native author IDs cannot be null.
- [x] One native review per user/professor/course is enforced by a SQL unique constraint, including simultaneous requests.
- [x] One vote per user/review, valid vote type, and cascading deletion behavior.
- [x] Search indexes cover names/codes, full text and typo tolerance; tag intersection has suitable indexing.
- [x] Query-time aggregates remain correct after insert, update and deletion. An administrator merge procedure is documented; actual catalog merges require staging verification.

Evidence: schema review and executable SQL assertions against PostgreSQL/Supabase.

## Phase 5 — Security

- [x] Non-university login is rejected before sending a link and again at the database authorization boundary.
- [x] Protected pages, data routes, Server Actions and SQL reads enforce authentication; local browser/database tests cover rejected access.
- [x] RLS is enabled on every application table, with least-privilege grants and fixed-search-path security-definer functions.
- [x] Authors can edit/delete only their own reviews; forged author IDs and imported flags are rejected by SQL.
- [x] Anonymous RPC data contains neither author UUID nor email; other students cannot select private identity fields directly.
- [x] Vote mutations cannot impersonate another user or produce duplicate votes.
- [x] Review/mutation/login counters persist in the database across serverless instances; provider abuse-protection setup is documented for deployment.
- [ ] Cookie/session refresh, safe callback redirects, trusted origin handling, secure production cookies and logout work.
- [x] Review text renders as escaped plain text; database writes use parameters and review content is never executable markup.

Evidence: database tests under anon/authenticated roles, API request tests, browser tests and live auth smoke test on staging.

## Phase 6 — Routes and presentation

- [x] `/`: two-paragraph introduction, labelled email input, Request Access button and terms link.
- [x] `/dashboard`: search, native multi-select tag filters, ranked text/table results, recent global review feed and empty states.
- [x] `/professors/[id]`: department/count, aggregate table, tag frequencies and progressive review loading with ordinary pagination fallback.
- [x] `/courses/[id]`: course metadata, comparable professor metrics side by side, and progressive review feed.
- [x] `/submit`: searchable native course/professor controls, ratings, text, tags, anonymity toggle and truthful success/error feedback; failed requests preserve the draft.
- [x] `/reviews/[id]/edit`: owner-only editing/deletion with inline confirmation; SQL ownership is tested, real authenticated browser mutations remain a hosted smoke test.
- [x] `/terms`, not-found, loading and error routes exist; terms/not-found were exercised in browsers.
- [x] Mobile controls remain usable and links retain classic affordances; desktop/mobile screenshots were reviewed.

Evidence: end-to-end route navigation, direct deep links, not-found tests and responsive inspection.

## Phase 7 — Workflows

- [ ] Valid magic link establishes a session and redirects to the dashboard; expired/invalid links have a recovery path.
- [x] Search matches course title, course code and professor name in browsers; PostgreSQL tests cover prefixes and typo-tolerant production search.
- [x] Filters use the exact intersection **within a review**, then group by professor/course.
- [x] Recommendations display review counts and an explained Wilson confidence measure, with deterministic ordering.
- [x] Search/filter state is represented in URLs; pagination retains it; reset restores an unfiltered list.
- [x] Review submission validates on the server, blocks duplicates in SQL, preserves input on failure and confirms only after persistence. Demo validation explicitly reports that nothing was saved.
- [ ] Anonymous/named reviews, edits, deletion, helpful/unhelpful votes and vote removal work end to end.

Evidence: unit tests for query/filter/scoring behavior, browser tests and authenticated staging write/readback.

## Phase 8 — Data access

- [x] `getAggregatedProfessorStats` calculates all metric means with correct null handling and tag frequency counts.
- [x] `getCourseComparisons` groups reviews by professor for the requested course only.
- [x] `submitNewReview` verifies authentication, validates input and uses SQL-enforced uniqueness.
- [x] Client-facing data access uses user-scoped RPCs rather than a privileged service role. Drizzle owns schema/migrations; reviewed SQL functions preserve the JWT authorization boundary.
- [x] Data failures are visible errors; they never silently fall back to demo content. Demo requires an explicit flag and absence of Supabase configuration.

Evidence: focused service tests, SQL assertions and source review.

## Phase 9 — Release and maintenance

- [x] GitHub CI is configured to run web checks, database tests, browser acceptance and Python tests on pushes/PRs.
- [ ] Staging and production use distinct Supabase projects and environment-scoped secrets.
- [ ] Versioned migrations are applied to staging first, verified, then production; applied migrations are immutable.
- [ ] Vercel Git integration uses the intended branches and correct environment configuration.
- [ ] Supabase Site URL, allowed redirect URLs, email template/SMTP and exact domain policy are configured.
- [ ] Demo mode is disabled and no fixture credentials/data appear in production.
- [x] Backups, restore rehearsal, error/latency monitoring and semester import ownership are documented.
- [ ] Repository commits/pushes, deployed commit, actual live URL and verification results are recorded accurately.

Evidence: CI run, migration log, hosted smoke test, owner-reviewed release configuration. Local test success alone does not prove these external conditions.
