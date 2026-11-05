import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to the intended Supabase database before migrating.");
  const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  try { await migrate(drizzle(client), { migrationsFolder: "./drizzle" }); console.log("Database migrations applied."); }
  finally { await client.end(); }
}
main().catch(() => { console.error("Migration failed. Check database connectivity and the reviewed SQL migration. Credentials are never printed."); process.exitCode = 1; });
