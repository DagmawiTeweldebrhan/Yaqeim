import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { hasSupabase } from "../config";
export async function createSupabaseServer() {
  if (!hasSupabase()) throw new Error("The university archive is not configured yet.");
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll() { return cookieStore.getAll(); }, setAll(items) { try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Server Components use the session refreshed by proxy. */ } } }
  });
}
