import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabase, isDemo, universityDomain } from "@/lib/config";
import { isUniversityEmail } from "@/lib/validation";
import { authCookieOptions } from "@/lib/supabase/options";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const privateRoute = /^\/(dashboard|professors|courses|submit|reviews)(\/|$)/.test(
    request.nextUrl.pathname,
  );
  if (isDemo()) return response;
  if (!hasSupabase()) {
    if (privateRoute) return NextResponse.redirect(new URL("/", request.url));
    return response;
  }
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (
    privateRoute &&
    (error || !user?.email_confirmed_at || !isUniversityEmail(user.email || "", universityDomain))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    url.searchParams.set("message", "Please sign in with your university email.");
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  if (privateRoute) response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|icon.svg).*)"],
};
