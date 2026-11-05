"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { hasSupabase, isDemo, universityDomain } from "@/lib/config";
import { isUniversityEmail, parseReviewForm } from "@/lib/validation";
import type { ActionState } from "@/lib/types";
import { getReviews } from "@/lib/data";
const fail = (message: string): ActionState => ({ status: "error", message });
function databaseError(code?: string) {
  if (code === "23505")
    return "You have already reviewed this professor for this course. You can edit your existing review from My reviews.";
  if (code === "P0001" || code === "54000")
    return "This request could not be accepted. You may have reached the request limit; please wait a few minutes and try again.";
  if (code === "42501")
    return "You do not have permission to change this review. Sign in again and try once more.";
  return "Your change could not be saved. Please check your connection and try again.";
}
export async function requestAccess(_previous: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") || "")
    .trim()
    .toLowerCase();
  if (!isUniversityEmail(email, universityDomain))
    return fail(`Use your @${universityDomain} university email address.`);
  if (!hasSupabase()) return fail("Sign-in is not configured yet. No email has been sent.");
  let callback: string;
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || "");
    if (
      origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(origin.hostname) &&
        !process.env.VERCEL
      )
    )
      return fail("Sign-in is not configured correctly. No email has been sent.");
    callback = new URL("/auth/callback", origin.origin).href;
  } catch {
    return fail("Sign-in is not configured correctly. No email has been sent.");
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return fail("Sign-in is temporarily unavailable. No email has been sent.");
  const requestHeaders = await headers();
  // Vercel sets x-vercel-forwarded-for. Outside Vercel a shared bucket fails safely.
  const ip = process.env.VERCEL
    ? requestHeaders.get("x-vercel-forwarded-for") || "unknown"
    : "local";
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const [scope, value, limit] of [
    ["ip", ip, 20],
    ["email", email, 4],
  ] as const) {
    const key = createHash("sha256").update(`${scope}:${value}:${serviceKey}`).digest("hex");
    const { data: allowed, error } = await admin.rpc("consume_rate_limit", {
      p_key: `login:${key}`,
      p_limit: limit,
      p_window_seconds: 900,
    });
    if (error || !allowed)
      return fail("Too many access requests. Please wait 15 minutes and try again.");
  }
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback },
  });
  if (error) return fail("An access link could not be sent. Please wait a moment and try again.");
  return {
    status: "success",
    message:
      "Check your university inbox for your sign-in link. Open it in this browser to continue.",
  };
}
export async function logout() {
  if (hasSupabase()) {
    const client = await createSupabaseServer();
    await client.auth.signOut();
  }
  redirect("/");
}
export async function submitNewReview(previous: ActionState, form: FormData): Promise<ActionState> {
  void previous;
  return saveReview(null, form);
}
export async function updateReview(
  id: string,
  previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  void previous;
  return saveReview(id, form);
}
async function saveReview(id: string | null, form: FormData): Promise<ActionState> {
  const parsed = parseReviewForm(form);
  if (!parsed.success)
    return {
      status: "error",
      message: "Please check the fields below.",
      fields: z.flattenError(parsed.error).fieldErrors,
    };
  if (isDemo())
    return fail(
      "Sample archive: this review was validated but was not saved. Sign in to the live archive to publish a review.",
    );
  const user = await currentUser();
  if (!user) return fail("Please sign in with your university email before submitting a review.");
  if (id && !z.uuid().safeParse(id).success) return fail("Invalid review.");
  const client = await createSupabaseServer();
  const payload = Object.fromEntries(
    Object.entries(parsed.data).map(([key, value]) => [`p_${key}`, value]),
  );
  if (id) {
    delete payload.p_professor_id;
    delete payload.p_course_id;
    payload.p_review_id = id;
  }
  const { error } = await client.rpc(id ? "update_review" : "submit_review", payload);
  if (error) return fail(databaseError(error.code));
  revalidatePath("/dashboard");
  revalidatePath("/reviews");
  revalidatePath(`/professors/${parsed.data.professor_id}`);
  revalidatePath(`/courses/${parsed.data.course_id}`);
  return {
    status: "success",
    message: id
      ? "Success: Your review has been updated."
      : "Success: Your review has been recorded.",
  };
}
export async function loadMoreReviews(input: {
  professorId?: string;
  courseId?: string;
  page: number;
  sort: "helpful" | "newest";
}) {
  const query = z
    .object({
      professorId: z.uuid().optional(),
      courseId: z.uuid().optional(),
      page: z.number().int().min(1).max(5001),
      sort: z.enum(["helpful", "newest"]),
    })
    .parse(input);
  return getReviews(query);
}
export async function voteReview(
  id: string,
  vote: number,
  _previous: ActionState,
): Promise<ActionState> {
  void _previous;
  if (isDemo()) return fail("Sample archive: votes are not saved.");
  if (!z.uuid().safeParse(id).success || ![-1, 0, 1].includes(vote)) return fail("Invalid vote.");
  if (!(await currentUser())) return fail("Please sign in to vote.");
  const client = await createSupabaseServer();
  const { error } = await client.rpc("vote_review", { p_review_id: id, p_vote: vote });
  if (error) return fail(databaseError(error.code));
  revalidatePath("/professors/[id]", "page");
  revalidatePath("/courses/[id]", "page");
  return {
    status: "success",
    message: vote ? "Your vote has been recorded." : "Your vote has been removed.",
  };
}
export async function deleteReview(
  id: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (form.get("confirm") !== "on")
    return fail("Check the confirmation box to delete this review.");
  if (!z.uuid().safeParse(id).success || !(await currentUser()))
    return fail("Please sign in to manage your review.");
  const client = await createSupabaseServer();
  const { error } = await client.rpc("delete_review", { p_review_id: id });
  if (error) return fail(databaseError(error.code));
  revalidatePath("/dashboard");
  revalidatePath("/reviews");
  revalidatePath("/professors/[id]", "page");
  revalidatePath("/courses/[id]", "page");
  redirect("/reviews?deleted=1");
}
