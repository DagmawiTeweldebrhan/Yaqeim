import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "./supabase/server";
import { hasSupabase, isDemo, universityDomain } from "./config";
import { isUniversityEmail } from "./validation";
export async function currentUser() {
  if (!hasSupabase()) return null;
  const supabase = await createSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && user?.email_confirmed_at && isUniversityEmail(user.email || "", universityDomain) ? user : null;
}
export async function requireUser() {
  if (isDemo()) return null;
  const user = await currentUser();
  if (!user) redirect("/?message=Please+sign+in+with+your+university+email.");
  return user;
}
