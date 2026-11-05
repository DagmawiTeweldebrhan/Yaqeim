import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const pipelineRoot = fileURLToPath(new URL("..", import.meta.url));
const fixtures = JSON.parse(execFileSync(process.env.PYTHON || "python", ["tests/emit_import_contract.py"], {
  cwd: pipelineRoot, encoding: "utf8", env: { ...process.env, PYTHONPATH: pipelineRoot },
}));

function numberedParameters(sql) {
  let index = 0;
  return sql.replace(/%s/g, () => `$${++index}`);
}

test("Python importer executes its real SQL and bound values against the migrated PostgreSQL schema", async (context) => {
  const db = new PGlite({ extensions: { pg_trgm } });
  try {
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
    await migrate(drizzle(db), { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
    await db.exec("SET ROLE service_role");

    async function executeImport(statements) {
      const ids = new Map();
      let last;
      await db.exec("BEGIN");
      try {
        for (const statement of statements) {
          const parameters = statement.parameters.map(value => typeof value === "string" && ids.has(value) ? ids.get(value) : value);
          last = await db.query(numberedParameters(statement.sql), parameters);
          if (statement.sql.includes("public.professors")) ids.set("00000000-0000-4000-8000-000000000001", last.rows[0].id);
          if (statement.sql.includes("public.courses")) ids.set("00000000-0000-4000-8000-000000000002", last.rows[0].id);
        }
        await db.exec("COMMIT");
        return last;
      } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
      }
    }

    await context.test("imports validated anonymous provenance and preserves unknown ratings", async () => {
      const result = await executeImport(fixtures[0]);
      assert.equal(result.rows.length, 1);
      const stored = (await db.query("SELECT * FROM public.reviews")).rows[0];
      assert.equal(stored.overall_rating, 5);
      assert.equal(stored.workload_rating, null);
      assert.equal(stored.grading_difficulty, null);
      assert.equal(stored.user_id, null);
      assert.equal(stored.imported, true);
      assert.equal(stored.is_anonymous, true);
      assert.equal(stored.source_hash, "a".repeat(64));
      assert.deepEqual(stored.tags, ["Easy A", "Light Workload"]);
      assert.equal(new Date(stored.created_at).toISOString(), "2026-01-01T12:00:00.000Z");
    });

    await context.test("repeated imports deduplicate hashes and normalized entities without overwriting metadata", async () => {
      const result = await executeImport(fixtures[1]);
      assert.equal(result.rows.length, 0);
      assert.equal((await db.query("SELECT * FROM public.reviews")).rows.length, 1);
      const professors = (await db.query("SELECT * FROM public.professors")).rows;
      const courses = (await db.query("SELECT * FROM public.courses")).rows;
      assert.equal(professors.length, 1);
      assert.equal(courses.length, 1);
      assert.equal(professors[0].full_name, "O'Reilly; DROP TABLE users;--");
      assert.equal(courses[0].title, "Synthetic Import Contract");
    });

    await context.test("SQL-shaped professor names remain bound data and cannot execute", async () => {
      assert.equal((await db.query("SELECT to_regclass('public.users') AS table_name")).rows[0].table_name, "users");
      assert.equal((await db.query("SELECT count(*) AS count FROM public.professors")).rows[0].count, 1);
    });

    await context.test("a rejected import rolls back entity creation along with the review", async () => {
      const invalid = structuredClone(fixtures[0]);
      invalid[0].parameters[0] = "Rollback-only Professor";
      invalid[1].parameters[0] = "ROLLBACK-UH 1001";
      invalid[2].parameters[3] = 6;
      invalid[2].parameters[7] = "b".repeat(64);
      await assert.rejects(executeImport(invalid), /reviews_overall_rating_check/);
      assert.equal((await db.query("SELECT * FROM public.professors WHERE full_name='Rollback-only Professor'")).rows.length, 0);
      assert.equal((await db.query("SELECT * FROM public.courses WHERE code='ROLLBACK-UH 1001'")).rows.length, 0);
      assert.equal((await db.query("SELECT * FROM public.reviews")).rows.length, 1);
    });
  } finally {
    await db.close();
  }
});
