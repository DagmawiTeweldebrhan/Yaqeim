import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasSupabase, siteUrl, universityDomain } from "@/lib/config";
import { isUniversityEmail, safeNext } from "@/lib/validation";
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = new URL(siteUrl()).origin;
  const code = searchParams.get("code");
  if (hasSupabase() && code) {
    const client = await createSupabaseServer();
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error && data.user?.email_confirmed_at && isUniversityEmail(data.user.email || "", universityDomain)) return NextResponse.redirect(new URL(safeNext(searchParams.get("next")), origin));
    await client.auth.signOut();
  }
  return NextResponse.redirect(new URL("/?message=This+sign-in+link+is+invalid+or+expired.+Please+request+a+new+one.", origin));
}
