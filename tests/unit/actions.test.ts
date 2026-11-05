import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ActionState } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  configured: true,
  demo: false,
  user: vi.fn(),
  requireUser: vi.fn(),
  rpc: vi.fn(),
  adminRpc: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  getUser: vi.fn(),
  createServer: vi.fn(),
  createAdmin: vi.fn(),
  createSsr: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createAdmin }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createSsr }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServer: mocks.createServer }));
vi.mock("@/lib/auth", () => ({ currentUser: mocks.user, requireUser: mocks.requireUser }));
vi.mock("@/lib/config", () => ({
  hasSupabase: () => mocks.configured,
  isDemo: () => mocks.demo,
  universityDomain: "nyu.edu",
  siteUrl: () => "https://archive.example",
}));

import { deleteReview, loadMoreReviews, logout, requestAccess, submitNewReview, updateReview, voteReview } from "@/app/actions";
import { proxy } from "@/proxy";
import { safeNext } from "@/lib/validation";

const ID = "10000000-0000-4000-8000-000000000001";
const COURSE = "20000000-0000-4000-8000-000000000001";
const REVIEW = "30000000-0000-4000-8000-000000000001";
const USER = { id: "40000000-0000-4000-8000-000000000001", email: "student@nyu.edu", email_confirmed_at: "2026-01-01T00:00:00Z" };
const INITIAL: ActionState = { status: "idle", message: "" };

function emailForm(email = "student@nyu.edu") {
  const form = new FormData();
  form.set("email", email);
  return form;
}

function reviewForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    professor_id: ID, course_id: COURSE, body: "Clear lectures with useful feedback on every assignment.",
    overall_rating: "5", workload_rating: "3", grading_difficulty: "2", is_anonymous: "on",
  })) form.set(key, value);
  form.append("tags", "Easy A");
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.configured = true;
  mocks.demo = false;
  mocks.user.mockResolvedValue(USER);
  mocks.requireUser.mockResolvedValue(USER);
  mocks.rpc.mockResolvedValue({ data: REVIEW, error: null });
  mocks.adminRpc.mockResolvedValue({ data: true, error: null });
  mocks.signIn.mockResolvedValue({ data: {}, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: USER }, error: null });
  const client = { rpc: mocks.rpc, auth: { signInWithOtp: mocks.signIn, signOut: mocks.signOut, getUser: mocks.getUser } };
  mocks.createServer.mockResolvedValue(client);
  mocks.createAdmin.mockReturnValue({ rpc: mocks.adminRpc });
  mocks.createSsr.mockReturnValue(client);
  mocks.headers.mockResolvedValue(new Headers({ "x-vercel-forwarded-for": "192.0.2.10" }));
  mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-not-a-real-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anonymous-key");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://archive.example");
  vi.stubEnv("VERCEL", "1");
});

afterEach(() => vi.unstubAllEnvs());

describe("magic-link action security", () => {
  it.each(["student@nyu.edu.attacker.example", "student@evilnyu.edu", "student@sub.nyu.edu", "bad-address"])("rejects non-university input %s before any provider call", async email => {
    expect((await requestAccess(INITIAL, emailForm(email))).status).toBe("error");
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("normalizes university email and sends only after both distributed limits pass", async () => {
    const result = await requestAccess(INITIAL, emailForm("  STUDENT@NYU.EDU  "));
    expect(result.status).toBe("success");
    expect(mocks.adminRpc).toHaveBeenCalledTimes(2);
    expect(mocks.adminRpc.mock.calls.map(([, payload]) => payload.p_limit)).toEqual([20, 4]);
    for (const [name, payload] of mocks.adminRpc.mock.calls) {
      expect(name).toBe("consume_rate_limit");
      expect(payload.p_key).toMatch(/^login:[a-f0-9]{64}$/);
      expect(payload.p_key).not.toContain("student");
      expect(payload.p_window_seconds).toBe(900);
    }
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "student@nyu.edu", options: { emailRedirectTo: "https://archive.example/auth/callback" } });
    expect(mocks.adminRpc.mock.invocationCallOrder[1]).toBeLessThan(mocks.signIn.mock.invocationCallOrder[0]);
  });

  it.each([
    { data: false, error: null },
    { data: null, error: null },
    { data: true, error: { message: "database failure" } },
  ])("fails closed when the IP rate-limit response is %j", async response => {
    mocks.adminRpc.mockResolvedValue(response);
    expect((await requestAccess(INITIAL, emailForm())).status).toBe("error");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("fails closed when the email bucket is exhausted", async () => {
    mocks.adminRpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    expect((await requestAccess(INITIAL, emailForm())).status).toBe("error");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("sends nothing without the privileged throttling credential", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect((await requestAccess(INITIAL, emailForm())).status).toBe("error");
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("does not report sent links when Supabase is unconfigured", async () => {
    mocks.configured = false;
    const result = await requestAccess(INITIAL, emailForm());
    expect(result.status).toBe("error");
    expect(result.message).toContain("No email has been sent");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("does not report provider failure as success or disclose provider details", async () => {
    mocks.signIn.mockResolvedValue({ error: { message: "secret provider details" } });
    const result = await requestAccess(INITIAL, emailForm());
    expect(result.status).toBe("error");
    expect(result.message).not.toContain("secret provider details");
  });

  it.each(["", "not-a-url", "javascript:alert(1)", "http://archive.example", "http://localhost:3000"])("rejects an invalid deployed callback origin %s", async origin => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
    expect((await requestAccess(INITIAL, emailForm())).status).toBe("error");
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });

  it("allows an explicit local HTTP origin only outside Vercel", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000");
    vi.stubEnv("VERCEL", "");
    expect((await requestAccess(INITIAL, emailForm())).status).toBe("success");
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "student@nyu.edu", options: { emailRedirectTo: "http://127.0.0.1:3000/auth/callback" } });
  });
});

describe("review mutations", () => {
  it("never accepts a client-supplied author, provenance, or source hash", async () => {
    const form = reviewForm();
    form.set("user_id", "forged-user");
    form.set("imported", "true");
    form.set("source_hash", "forged-source");
    expect((await submitNewReview(INITIAL, form)).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("submit_review", {
      p_professor_id: ID, p_course_id: COURSE,
      p_body: "Clear lectures with useful feedback on every assignment.",
      p_overall_rating: 5, p_workload_rating: 3, p_grading_difficulty: 2,
      p_tags: ["Easy A"], p_is_anonymous: true,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith(`/professors/${ID}`);
  });

  it("requires a verified current user before writes", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await submitNewReview(INITIAL, reviewForm())).status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid form fields before any database operation", async () => {
    const form = reviewForm();
    form.set("overall_rating", "6");
    form.append("tags", "Invented Tag");
    const result = await submitNewReview(INITIAL, form);
    expect(result.status).toBe("error");
    expect(result.fields?.overall_rating).toBeDefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("makes demo submission explicitly unsaved", async () => {
    mocks.demo = true;
    const result = await submitNewReview(INITIAL, reviewForm());
    expect(result.status).toBe("error");
    expect(result.message).toContain("not saved");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps duplicate reviews to an actionable error and does not revalidate", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "23505", message: "private SQL details" } });
    const result = await submitNewReview(INITIAL, reviewForm());
    expect(result.status).toBe("error");
    expect(result.message).toContain("already reviewed");
    expect(result.message).not.toContain("private SQL");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("updates through the owner-checking RPC without changing professor or course", async () => {
    expect((await updateReview(REVIEW, INITIAL, reviewForm())).status).toBe("success");
    const [method, payload] = mocks.rpc.mock.calls[0];
    expect(method).toBe("update_review");
    expect(payload.p_review_id).toBe(REVIEW);
    expect(payload).not.toHaveProperty("p_professor_id");
    expect(payload).not.toHaveProperty("p_course_id");
    expect(payload).not.toHaveProperty("p_user_id");
  });

  it("does not claim success for denied ownership", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "42501" } });
    expect((await updateReview(REVIEW, INITIAL, reviewForm())).status).toBe("error");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("rejects invalid mutation identifiers before RPC calls", async () => {
    expect((await updateReview("not-a-uuid", INITIAL, reviewForm())).status).toBe("error");
    expect((await voteReview("not-a-uuid", 1, INITIAL)).status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([-2, 0.5, 2, NaN])("rejects invalid vote %s", async vote => {
    expect((await voteReview(REVIEW, vote, INITIAL)).status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("supports removing a vote without accepting an author ID", async () => {
    expect((await voteReview(REVIEW, 0, INITIAL)).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("vote_review", { p_review_id: REVIEW, p_vote: 0 });
  });

  it("makes demo votes explicitly unsaved", async () => {
    mocks.demo = true;
    const result = await voteReview(REVIEW, 1, INITIAL);
    expect(result.status).toBe("error");
    expect(result.message).toContain("not saved");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires an explicit confirmation before deletion", async () => {
    expect((await deleteReview(REVIEW, INITIAL, new FormData())).status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not redirect after a rejected deletion", async () => {
    const form = new FormData(); form.set("confirm", "on");
    mocks.rpc.mockResolvedValue({ error: { code: "42501" } });
    expect((await deleteReview(REVIEW, INITIAL, form)).status).toBe("error");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects only after successful owner-checked deletion", async () => {
    const form = new FormData(); form.set("confirm", "on");
    await expect(deleteReview(REVIEW, INITIAL, form)).rejects.toThrow("REDIRECT:/reviews?deleted=1");
    expect(mocks.rpc).toHaveBeenCalledWith("delete_review", { p_review_id: REVIEW });
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
  });

  it("signs out then redirects to the public gate", async () => {
    await expect(logout()).rejects.toThrow("REDIRECT:/");
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});

describe("verified identity and private-route boundary", () => {
  it("requires verified access for directly invoked review pagination actions", async () => {
    mocks.requireUser.mockRejectedValue(new Error("REDIRECT:sign-in"));
    await expect(loadMoreReviews({ professorId: ID, page: 2, sort: "helpful" })).rejects.toThrow("REDIRECT:sign-in");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, 5002, Infinity])("rejects an unbounded or invalid review page %s", async page => {
    await expect(loadMoreReviews({ professorId: ID, page, sort: "helpful" })).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("retrieves the next review page through an authenticated bounded RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect(await loadMoreReviews({ professorId: ID, page: 2, sort: "newest" })).toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledWith("get_reviews", { p_professor_id: ID, p_course_id: null, p_limit: 20, p_offset: 20, p_sort: "newest" });
    expect(mocks.requireUser).toHaveBeenCalled();
  });

  it.each([
    { user: null, error: null },
    { user: { ...USER, email_confirmed_at: null }, error: null },
    { user: { ...USER, email: "student@nyu.edu.attacker.example" }, error: null },
    { user: USER, error: { message: "invalid JWT" } },
  ])("rejects an invalid identity in currentUser: %j", async result => {
    const auth = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
    mocks.getUser.mockResolvedValue({ data: { user: result.user }, error: result.error });
    expect(await auth.currentUser()).toBeNull();
  });

  it("accepts only a provider-verified, confirmed university identity", async () => {
    const auth = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
    expect(await auth.currentUser()).toEqual(USER);
    expect(mocks.getUser).toHaveBeenCalledOnce();
  });

  it.each(["/dashboard", "/professors/example", "/courses/example", "/submit", "/reviews/example/edit"])("protects %s from anonymous access", async path => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await proxy(new NextRequest(`https://archive.example${path}`));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/");
  });

  it("protects private routes when configuration is absent", async () => {
    mocks.configured = false;
    const response = await proxy(new NextRequest("https://archive.example/dashboard"));
    expect(response.status).toBe(307);
    expect(mocks.createSsr).not.toHaveBeenCalled();
  });

  it("prevents private-page caching for valid sessions", async () => {
    const response = await proxy(new NextRequest("https://archive.example/dashboard"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects an auth provider error even when a stale user object is present", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: USER }, error: { message: "invalid JWT" } });
    const response = await proxy(new NextRequest("https://archive.example/dashboard"));
    expect(response.status).toBe(307);
  });

  it("allows explicitly configured sample browsing without contacting auth", async () => {
    mocks.demo = true;
    const response = await proxy(new NextRequest("https://archive.example/dashboard"));
    expect(response.status).toBe(200);
    expect(mocks.createSsr).not.toHaveBeenCalled();
  });

  it("does not let URL parser control-character normalization create an external redirect", () => {
    const destination = safeNext("/\t/attacker.example");
    expect(new URL(destination, "https://archive.example").origin).toBe("https://archive.example");
  });
});
