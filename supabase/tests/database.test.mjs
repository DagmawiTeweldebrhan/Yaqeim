import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

// The real migration runs against PostgreSQL WASM. Only Supabase-owned auth
// objects are stubbed, so SQL, privileges, RLS, constraints and RPCs execute.
const db = new PGlite({ extensions: { pg_trgm } });
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
const alice = "10000000-0000-4000-8000-000000000001";
const bob = "10000000-0000-4000-8000-000000000002";
const unverified = "10000000-0000-4000-8000-000000000003";
const professor = "20000000-0000-4000-8000-000000000001";
const professorTwo = "20000000-0000-4000-8000-000000000002";
const course = "30000000-0000-4000-8000-000000000001";
const otherCourse = "30000000-0000-4000-8000-000000000002";
const anonymousReview = "40000000-0000-4000-8000-000000000001";
const importedReview = "40000000-0000-4000-8000-000000000002";

before(async () => {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE supabase_auth_admin NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz,
      created_at timestamptz DEFAULT now(), banned_until timestamptz
    );
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
  `);
  await migrate(drizzle(db), { migrationsFolder });
  await db.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'alice@nyu.edu',now()),($2,'bob@nyu.edu',now()),($3,'pending@nyu.edu',null)", [alice, bob, unverified]);
  await db.query("INSERT INTO public.professors(id,full_name,department) VALUES($1,'Ada Example','Computer Science'),($2,'Grace Sample','Computer Science')", [professor, professorTwo]);
  await db.query("INSERT INTO public.courses(id,code,title,department) VALUES($1,'CS-UH 1001','Introduction to Computer Science','Computer Science'),($2,'CS-UH 1002','Data Structures','Computer Science')", [course, otherCourse]);
  await db.query(`INSERT INTO public.reviews(id,professor_id,course_id,user_id,body,overall_rating,workload_rating,grading_difficulty,tags)
    VALUES($1,$2,$3,$4,'Clear explanations and manageable weekly assignments.',5,2,2,ARRAY['Easy A','Light Workload'])`, [anonymousReview, professor, course, alice]);
  await db.query(`INSERT INTO public.reviews(id,professor_id,course_id,body,overall_rating,tags,imported,source_hash)
    VALUES($1,$2,$3,'Archived course feedback with useful discussion sessions.',4,ARRAY['Discussion Based'],true,$4)`, [importedReview, professorTwo, course, "a".repeat(64)]);
});
after(() => db.close());

async function signedIn(user = alice) {
  await db.exec("SET LOCAL ROLE authenticated");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
}
function dbTest(name, run) {
  test(name, async () => {
    await db.exec("BEGIN");
    try { await run(); }
    finally { await db.exec("ROLLBACK"); }
  });
}
async function submit(overrides = {}) {
  const values = {
    professor, course: otherCourse, body: "Thoughtful teaching and plenty of clear worked examples.",
    overall: 4, workload: 3, grading: 3, tags: ["Discussion Based"], anonymous: true,
    ...overrides,
  };
  return db.query("SELECT public.submit_review($1,$2,$3,$4,$5,$6,$7,$8) AS id", Object.values(values));
}

dbTest("all application tables enable row level security", async () => {
  const result = await db.query("SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind='r'");
  assert.equal(result.rows.length, 7);
  for (const row of result.rows) assert.equal(row.relrowsecurity, true, row.relname);
});
dbTest("Drizzle journal makes subsequent deployments idempotent", async () => {
  await migrate(drizzle(db), { migrationsFolder });
  assert.equal((await db.query('SELECT count(*) AS count FROM drizzle.__drizzle_migrations')).rows[0].count, 2);
});
dbTest("anonymous roles cannot read catalogs or raw reviews", async () => {
  await db.exec("SET LOCAL ROLE anon");
  await assert.rejects(db.query("SELECT public.get_catalog()"), /permission denied/);
});
dbTest("authenticated role without a user cannot read private data", async () => {
  await signedIn("");
  await assert.rejects(db.query("SELECT public.get_catalog()"), /verified university account/);
});
dbTest("unverified users are denied independently of their JWT", async () => {
  await signedIn(unverified);
  await assert.rejects(db.query("SELECT public.get_catalog()"), /verified university account/);
});
dbTest("banned university accounts are denied", async () => {
  await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1", [alice]);
  await signedIn();
  await assert.rejects(db.query("SELECT public.get_catalog()"), /verified university account/);
});
dbTest("signup rejects lookalike domains at the database boundary", async () => {
  await assert.rejects(db.query("INSERT INTO auth.users(id,email) VALUES(gen_random_uuid(),'fake@nyu.edu.evil.test')"), /University email domain required/);
});
dbTest("changing an existing account to an external email is rejected", async () => {
  await assert.rejects(db.query("UPDATE auth.users SET email='alice@example.com' WHERE id=$1", [alice]), /University email domain required/);
});
dbTest("Auth before-user-created hook accepts exact domain only", async () => {
  const allowed = await db.query("SELECT public.before_user_created($1) AS result", [{ user: { email: "New@NYU.EDU" } }]);
  assert.deepEqual(allowed.rows[0].result, {});
  const rejected = await db.query("SELECT public.before_user_created($1) AS result", [{ user: { email: "new@nyu.edu.evil.test" } }]);
  assert.equal(rejected.rows[0].result.error.http_code, 403);
});
dbTest("verified students can read the catalog", async () => {
  await signedIn();
  const { rows } = await db.query("SELECT public.get_catalog() AS catalog");
  assert.equal(rows[0].catalog.professors.length, 2);
  assert.equal(rows[0].catalog.courses.length, 2);
});
dbTest("RLS hides every other author's raw review and account", async () => {
  await signedIn(bob);
  assert.equal((await db.query("SELECT * FROM public.reviews")).rows.length, 0);
  const users = (await db.query("SELECT * FROM public.users")).rows;
  assert.equal(users.length, 1);
  assert.equal(users[0].id, bob);
});
dbTest("read RPC redacts anonymous author identity and source metadata", async () => {
  await signedIn(bob);
  const { rows } = await db.query("SELECT * FROM public.get_reviews()");
  const row = rows.find((review) => review.id === anonymousReview);
  assert.equal(row.author_label, "Anonymous student");
  assert.equal(row.is_owner, false);
  assert.equal(row.my_vote, 0);
  const encoded = JSON.stringify(rows);
  assert.ok(!encoded.includes(alice));
  assert.ok(!encoded.includes("alice@"));
  assert.ok(!encoded.includes("source_hash"));
  assert.equal(rows.find((review) => review.imported).workload_rating, null);
});
dbTest("named review labels use the consenting author's university handle", async () => {
  await db.query("UPDATE public.reviews SET is_anonymous=false WHERE id=$1", [anonymousReview]);
  await signedIn(bob);
  const { rows } = await db.query("SELECT * FROM public.get_reviews($1)", [professor]);
  assert.equal(rows[0].author_label, "alice");
});
dbTest("direct writes cannot bypass validation or rate limits", async () => {
  await signedIn();
  await assert.rejects(db.query("UPDATE public.reviews SET body='bypassed validation' WHERE id=$1", [anonymousReview]), /permission denied/);
});
dbTest("review submission binds author to the authenticated identity", async () => {
  await signedIn(bob);
  const { rows } = await submit();
  const stored = await db.query("SELECT * FROM public.reviews WHERE id=$1", [rows[0].id]);
  assert.equal(stored.rows[0].user_id, bob);
  assert.equal(stored.rows[0].imported, false);
  assert.equal(stored.rows[0].source_hash, null);
});
dbTest("duplicate anonymous reviews for the same professor/course are prevented", async () => {
  await signedIn();
  await assert.rejects(submit({ course }), /reviews_user_professor_course_unique/);
});
dbTest("invalid rating is rejected by a database constraint", async () => {
  await signedIn();
  await assert.rejects(submit({ overall: 6 }), /reviews_overall_rating_check/);
});
dbTest("unrecognized tags are rejected by a database constraint", async () => {
  await signedIn();
  await assert.rejects(submit({ tags: ["Unapproved"] }), /reviews_tags_check/);
});
dbTest("native reviews cannot invent missing workload ratings", async () => {
  await signedIn();
  await assert.rejects(submit({ workload: null }), /reviews_origin_check/);
});
dbTest("short review bodies are rejected", async () => {
  await signedIn();
  await assert.rejects(submit({ body: "Too short" }), /reviews_body_check/);
});
dbTest("duplicate tag labels are normalized before storage", async () => {
  await signedIn();
  const { rows } = await submit({ tags: ["Easy A", "Easy A"] });
  const review = await db.query("SELECT public.get_own_review($1) AS review", [rows[0].id]);
  assert.deepEqual(review.rows[0].review.tags, ["Easy A"]);
});
dbTest("other users cannot retrieve an editable review payload", async () => {
  await signedIn(bob);
  assert.equal((await db.query("SELECT public.get_own_review($1) AS review", [anonymousReview])).rows[0].review, null);
});
dbTest("other users cannot edit a review", async () => {
  await signedIn(bob);
  await assert.rejects(db.query("SELECT public.update_review($1,'Attempting to change another review.',1,1,1,'{}',false)", [anonymousReview]), /not owned/);
});
dbTest("other users cannot delete a review", async () => {
  await signedIn(bob);
  await assert.rejects(db.query("SELECT public.delete_review($1)", [anonymousReview]), /not owned/);
});
dbTest("own review edits immediately recalculate live aggregates", async () => {
  await signedIn();
  await db.query("SELECT public.update_review($1,'Revised feedback after finishing the entire course.',3,4,4,ARRAY['Heavy Workload'],false)", [anonymousReview]);
  const { rows } = await db.query("SELECT public.get_professor_stats($1) AS stats", [professor]);
  assert.equal(rows[0].stats.overall_rating, 3);
  assert.deepEqual(rows[0].stats.tag_counts, [{ tag: "Heavy Workload", count: 1, percentage: 100 }]);
});
dbTest("my reviews includes only owned reviews with pagination", async () => {
  await signedIn();
  const rows = (await db.query("SELECT * FROM public.get_my_reviews(1,0)")).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, anonymousReview);
  assert.equal(rows[0].is_owner, true);
  assert.equal((await db.query("SELECT * FROM public.get_my_reviews(1,1)")).rows.length, 0);
});
dbTest("deleting an owned review removes votes and updates aggregates", async () => {
  await signedIn(bob);
  await db.query("SELECT public.vote_review($1,1)", [anonymousReview]);
  await signedIn();
  await db.query("SELECT public.delete_review($1)", [anonymousReview]);
  const { rows } = await db.query("SELECT public.get_professor_stats($1) AS stats", [professor]);
  assert.equal(rows[0].stats.review_count, 0);
  assert.equal(rows[0].stats.overall_rating, null);
  await signedIn(bob);
  assert.equal((await db.query("SELECT * FROM public.helpful_votes")).rows.length, 0);
});
dbTest("helpful voting is idempotent, reversible and private", async () => {
  await signedIn(bob);
  await db.query("SELECT public.vote_review($1,1)", [anonymousReview]);
  await db.query("SELECT public.vote_review($1,1)", [anonymousReview]);
  let rows = (await db.query("SELECT * FROM public.get_reviews($1)", [professor])).rows;
  assert.equal(Number(rows[0].helpful_count), 1);
  assert.equal(rows[0].my_vote, 1);
  await db.query("SELECT public.vote_review($1,-1)", [anonymousReview]);
  rows = (await db.query("SELECT * FROM public.get_reviews($1)", [professor])).rows;
  assert.equal(Number(rows[0].helpful_count), 0);
  assert.equal(Number(rows[0].unhelpful_count), 1);
  await db.query("SELECT public.vote_review($1,0)", [anonymousReview]);
  rows = (await db.query("SELECT * FROM public.get_reviews($1)", [professor])).rows;
  assert.equal(rows[0].my_vote, 0);
});
dbTest("students cannot vote for their own review", async () => {
  await signedIn();
  await assert.rejects(db.query("SELECT public.vote_review($1,1)", [anonymousReview]), /another review/);
});
dbTest("course comparison aggregates the correct professor/course pairs", async () => {
  await signedIn();
  const { rows } = await db.query("SELECT public.get_course_comparisons($1) AS comparison", [course]);
  assert.equal(rows[0].comparison.course.code, "CS-UH 1001");
  assert.equal(rows[0].comparison.professors.length, 2);
  assert.equal(rows[0].comparison.professors[0].overall_rating, 5);
});
dbTest("recommendations require exact tag intersection on a single review", async () => {
  await db.query(`INSERT INTO public.reviews(professor_id,course_id,user_id,body,overall_rating,workload_rating,grading_difficulty,tags)
    VALUES($1,$2,$3,'A second independent review emphasizes classroom discussions.',3,3,3,ARRAY['Discussion Based'])`, [professor, course, bob]);
  await signedIn();
  const match = await db.query("SELECT * FROM public.search_catalog('',ARRAY['Easy A','Light Workload'])");
  assert.equal(match.rows.length, 1);
  assert.equal(match.rows[0].professor_id, professor);
  assert.ok(Number(match.rows[0].confidence_score) > 0);
  const noMatch = await db.query("SELECT * FROM public.search_catalog('',ARRAY['Easy A','Discussion Based'])");
  assert.equal(noMatch.rows.length, 0);
});
dbTest("search finds codes, partial names, full text and misspellings", async () => {
  await signedIn();
  for (const query of ["CS-UH 1001", "Ada", "Computer Science", "Ada Exampel", "Ada CS-UH 1001"]) {
    const { rows } = await db.query("SELECT * FROM public.search_catalog($1)", [query]);
    assert.ok(rows.some((row) => row.professor_id === professor), query);
  }
});
dbTest("pagination rejects NULL rather than accidentally removing the limit", async () => {
  await signedIn();
  await assert.rejects(db.query("SELECT * FROM public.get_reviews(null,null,null)"), /Invalid pagination/);
});
dbTest("imported hashes prevent repeat ingestion", async () => {
  await assert.rejects(db.query(`INSERT INTO public.reviews(professor_id,course_id,body,overall_rating,imported,source_hash)
    VALUES($1,$2,'Duplicate archived feedback must not be counted twice.',4,true,$3)`, [professorTwo, course, "a".repeat(64)]), /reviews_source_hash_unique/);
});
dbTest("university domain is configurable at the database boundary", async () => {
  await db.query("UPDATE private.settings SET university_domain='university.example' WHERE singleton");
  await db.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(gen_random_uuid(),'student@university.example',now())");
  await signedIn();
  await assert.rejects(db.query("SELECT public.get_catalog()"), /verified university account/);
});
dbTest("server-only limiter increments atomically and expires old windows", async () => {
  await db.exec("SET LOCAL ROLE service_role");
  for (const expected of [true, true, false, false]) {
    assert.equal((await db.query("SELECT public.consume_rate_limit('login:hashed-ip',2,60) AS allowed")).rows[0].allowed, expected);
  }
  await db.exec("RESET ROLE");
  await db.query("UPDATE private.rate_limits SET window_start=now()-interval '2 minutes' WHERE key='login:hashed-ip'");
  await db.exec("SET LOCAL ROLE service_role");
  assert.equal((await db.query("SELECT public.consume_rate_limit('login:hashed-ip',2,60) AS allowed")).rows[0].allowed, true);
});
dbTest("students cannot reset or use arbitrary server-only rate limit keys", async () => {
  await signedIn();
  await assert.rejects(db.query("SELECT public.consume_rate_limit('login:hashed-ip',1000,1)"), /permission denied/);
});
dbTest("review RPC enforces the durable per-user hourly limit", async () => {
  await db.query("INSERT INTO private.rate_limits(key,window_start,count) VALUES($1,now(),10)", [`review:${alice}`]);
  await signedIn();
  await assert.rejects(submit(), /Too many requests/);
});
dbTest("security-definer functions pin their search paths", async () => {
  const { rows } = await db.query("SELECT proname,proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND prosecdef");
  for (const row of rows) assert.ok(row.proconfig.some((value) => value.startsWith("search_path=")), row.proname);
});
dbTest("students cannot merge professor profiles", async () => {
  await signedIn();
  await assert.rejects(db.query("SELECT public.merge_professors($1,$2)", [professorTwo, professor]), /permission denied/);
});
dbTest("anonymous visitors cannot merge professor profiles", async () => {
  await db.exec("SET LOCAL ROLE anon");
  await assert.rejects(db.query("SELECT public.merge_professors($1,$2)", [professorTwo, professor]), /permission denied/);
});
dbTest("admin merge preserves review identity, archive hashes and votes", async () => {
  await signedIn(bob);
  await db.query("SELECT public.vote_review($1,1)", [importedReview]);
  await db.exec("SET LOCAL ROLE service_role");
  const { rows } = await db.query("SELECT public.merge_professors($1,$2) AS result", [professorTwo, professor]);
  assert.equal(rows[0].result.reviews_moved, 1);
  const reviews = (await db.query("SELECT * FROM public.reviews WHERE id=$1", [importedReview])).rows;
  assert.equal(reviews[0].professor_id, professor);
  assert.equal(reviews[0].source_hash, "a".repeat(64));
  assert.equal(reviews[0].user_id, null);
  assert.equal((await db.query("SELECT * FROM public.professors WHERE id=$1", [professorTwo])).rows.length, 0);
  assert.equal((await db.query("SELECT * FROM public.helpful_votes WHERE review_id=$1", [importedReview])).rows.length, 1);
  await signedIn();
  const stats = (await db.query("SELECT public.get_professor_stats($1) AS stats", [professor])).rows[0].stats;
  assert.equal(stats.review_count, 2);
  assert.equal(stats.overall_rating, 4.5);
});
dbTest("admin merge rejects conflicting student reviews without changing data", async () => {
  await db.query(`INSERT INTO public.reviews(professor_id,course_id,user_id,body,overall_rating,workload_rating,grading_difficulty)
    VALUES($1,$2,$3,'A separate review exists for what may be a duplicate professor.',4,3,3)`, [professorTwo, course, alice]);
  await db.exec("SAVEPOINT merge_attempt");
  await db.exec("SET LOCAL ROLE service_role");
  await assert.rejects(db.query("SELECT public.merge_professors($1,$2)", [professorTwo, professor]), /Cannot merge/);
  await db.exec("ROLLBACK TO SAVEPOINT merge_attempt");
  assert.equal((await db.query("SELECT * FROM public.professors")).rows.length, 2);
  assert.equal((await db.query("SELECT * FROM public.reviews WHERE professor_id=$1", [professorTwo])).rows.length, 2);
  assert.equal((await db.query("SELECT * FROM public.reviews WHERE professor_id=$1", [professor])).rows.length, 1);
});
dbTest("admin merge rejects identical source and target", async () => {
  await db.exec("SET LOCAL ROLE service_role");
  await assert.rejects(db.query("SELECT public.merge_professors($1,$1)", [professor]), /different professor/);
});
dbTest("admin merge rejects missing profiles", async () => {
  await db.exec("SET LOCAL ROLE service_role");
  await assert.rejects(db.query("SELECT public.merge_professors($1,gen_random_uuid())", [professor]), /must exist/);
});
