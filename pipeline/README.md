# Legacy feedback ingestion

This administrator-operated Python application is independent of the Next.js runtime. It collects post **bodies** from an existing authorized Facebook group session, structures eligible feedback using Gemini, validates a fixed taxonomy, and imports reviewed records through a privileged PostgreSQL connection. It never runs in a user's browser or in a Vercel request.

## Local setup

Use Python 3.11 or newer and Chrome/Chromium for collection. From this directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -c requirements.lock -e .
python -m unittest discover -s tests -v
```

Set `GEMINI_API_KEY` and `GEMINI_MODEL` in the process environment for extraction. Choose a model enabled for your Gemini account that supports structured output. Set `INGESTION_DATABASE_URL` to an administrator PostgreSQL connection for imports. The application deliberately does not load the repository's `.env` file. Do not put credentials in command-line arguments, source files, screenshots, or logs. Hosted database connections require TLS; use `sslmode=verify-full` and the provider's CA configuration where available.

`requirements.lock` pins the tested dependency set (Selenium 4.52.0, google-genai 2.34.0, Psycopg 3.3.8). Update and retest that set deliberately rather than resolving new dependencies during production imports.

## Semester workflow

1. Export your own currently authorized Facebook session cookies as a JSON array into a private directory outside the repository. Limit the file's Windows ACL to your account. Treat the file like a password. Obtain the group administrator's permission and review the source platform's terms before collection. The script uses that existing session; it stops at login or authentication checkpoints.
2. Collect only the intended group/search results. The message selector is configurable because Facebook's DOM can change. Collection is bounded by post count, scroll count, and consecutive idle rounds. It does not promise a complete historical archive, expand every truncated post, collect comments, or evade access restrictions.

```powershell
python -m yaqeim_ingest scrape --url "https://www.facebook.com/groups/YOUR_GROUP/search/?q=professor" --cookies "C:\Private\facebook-cookies.json" --output data/raw-semester.jsonl --max-posts 1000
python -m yaqeim_ingest extract --input data/raw-semester.jsonl --output data/structured-semester.jsonl
```

3. Review **every** structured record locally before import. Check the professor/course identity against the catalog, remove any residual student names or identifying context, verify the paraphrase and tags against the source, and discard ambiguous or unsupported claims. Email addresses, links, handles, and obvious international phone numbers are filtered automatically; this is not a complete personal-information detector. The LLM receives redacted post bodies only. Ensure that sending those bodies to your configured model provider is permitted before running extraction.
4. Validation and dry runs require neither a database connection nor an LLM call. Once reviewed, import with the explicit editorial-review flag:

```powershell
python -m yaqeim_ingest validate --input data/structured-semester.jsonl
python -m yaqeim_ingest import --input data/structured-semester.jsonl --dry-run
python -m yaqeim_ingest import --input data/structured-semester.jsonl --reviewed --batch-size 100
```

5. Check the inserted/skipped counts and authenticated UI. Keep an access-controlled audit of the run and delete local raw text/cookies according to your retention policy. Do not commit them. `data/`, cookies, JSONL output, and `.env` are ignored; this does not replace correct filesystem permissions.

Output files are created exclusively and never silently overwrite a previous run. A failed or interrupted scrape/extraction can leave a partial file; use a fresh output filename for a retry and review any partial file before use. Only successful commands return status zero. Logs contain counts and controlled errors, never raw posts, cookies, database URLs, or provider error bodies.

## Data contract and deliberate decisions

- Source sentiment uses the document's 1–10 scale. Database ratings use 1–5: source scores 1–2 become 1, 3–4 become 2, 5–6 become 3, 7–8 become 4, and 9–10 become 5. This conversion is explicit and tested.
- Workload and grading difficulty remain `NULL` unless the source explicitly provides a numeric rating on the 1–5 scale. Tags do not manufacture numeric ratings.
- The only permitted tags are the ten architecture tags in `yaqeim_ingest/models.py`.
- Professor identity normalizes whitespace/case using the database's unique name index; courses normalize codes. Existing entity names, titles, and departments are preserved. Administrators must merge ambiguous people or fix catalog mappings before import.
- Every imported review has `imported=true`, `is_anonymous=true`, and `user_id=NULL`. No source author account, profile URL, cookie, or raw permalink enters the application database.
- SHA256 over stable post identity plus professor/course identifies a source review. Re-running a batch skips previously inserted hashes. If no permalink is exposed, the scraper hashes the group and post body; edited posts can then appear new and require review. Content updates do not overwrite previous reviews silently.
- `captured_at` is the collection timestamp, stored as `reviews.created_at`. It is **not** the original post date; the scraper does not invent historical dates. Imported UI dates must be described as archive/import dates.
- Inputs are validated before any writes. Each database batch is transactional; a failed batch rolls back. Earlier successful batches remain committed and can be safely resumed because source hashes are unique.
- Imports use parameterized SQL and these schema columns: `professors(full_name,department)`, `courses(code,title,department)`, `reviews(professor_id,course_id,user_id,body,overall_rating,workload_rating,grading_difficulty,tags,imported,is_anonymous,source_hash,created_at)`. Expression indexes on `lower(btrim(full_name))` and `lower(btrim(code))`, and a unique partial source-hash index, are required by the migrations.

## Container

```text
docker build -t yaqeim-ingestion pipeline
docker run --rm --env GEMINI_API_KEY --env GEMINI_MODEL --mount type=bind,src=/private/archive,dst=/data yaqeim-ingestion extract --input /data/raw.jsonl --output /data/structured.jsonl
```

The image runs as UID 10001. Grant that user access to the private mounted directory. For Chromium collection use an environment that permits Chromium's sandbox (or run the local workflow); the script does not disable browser sandboxing.

## Validation boundaries

The dependency-free test suite covers model-schema rejection, rating conversion, privacy filtering, idempotency, transactional failure behavior, SQL parameterization, cookie filtering, URL restrictions, bounded scrolling, and CLI dry runs. These tests simulate Selenium/Gemini/database interfaces. A real group session, real model account, and a migrated staging Supabase database are needed for external integration acceptance. No production source data or credentials are bundled.

Implementation references: [Selenium cookie handling](https://www.selenium.dev/documentation/webdriver/interactions/cookies/), [Gemini structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [Psycopg transactions](https://www.psycopg.org/psycopg3/docs/basic/transactions.html).
