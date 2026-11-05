import "server-only";
import { isDemo } from "./config";
import { requireUser } from "./auth";
import { createSupabaseServer } from "./supabase/server";
import * as demo from "./demo";
import type { Course, OwnReview, Professor, ProfessorStats, Review, SearchResult } from "./types";
import type { Tag } from "./taxonomy";
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  await requireUser();
  const client = await createSupabaseServer();
  const { data, error } = await client.rpc(name, args);
  if (error) {
    console.error("Archive query failed", { operation: name, code: error.code });
    throw new Error("The archive could not be loaded. Please try again shortly.");
  }
  return data as T;
}
export async function getCatalog() {
  await requireUser();
  return isDemo()
    ? { professors: demo.professors, courses: demo.courses }
    : rpc<{ professors: Professor[]; courses: Course[] }>("get_catalog");
}
export async function searchCatalog(query: string, tags: Tag[], page = 1) {
  await requireUser();
  return isDemo()
    ? demo.demoSearch(query, tags).slice((page - 1) * 20, page * 20)
    : rpc<SearchResult[]>("search_catalog", {
        p_query: query,
        p_tags: tags,
        p_limit: 20,
        p_offset: (page - 1) * 20,
      });
}
export async function getAggregatedProfessorStats(id: string) {
  await requireUser();
  if (isDemo()) {
    const p = demo.professors.find((p) => p.id === id);
    return p ? demo.demoStats(p) : null;
  }
  return rpc<ProfessorStats | null>("get_professor_stats", { p_professor_id: id });
}
export async function getCourseComparisons(id: string) {
  await requireUser();
  if (isDemo()) {
    const course = demo.courses.find((c) => c.id === id);
    if (!course) return null;
    return {
      course,
      professors: demo.professors
        .filter((p) => demo.reviews.some((r) => r.course_id === id && r.professor_id === p.id))
        .map((p) =>
          demo.demoStats(
            p,
            demo.reviews.filter((r) => r.professor_id === p.id && r.course_id === id),
          ),
        ),
    };
  }
  return rpc<{ course: Course; professors: ProfessorStats[] } | null>("get_course_comparisons", {
    p_course_id: id,
  });
}
export async function getReviews(
  options: { professorId?: string; courseId?: string; page?: number; sort?: string } = {},
) {
  await requireUser();
  const { professorId, courseId, page = 1, sort = "helpful" } = options;
  if (isDemo())
    return demo.reviews
      .filter(
        (r) =>
          (!professorId || r.professor_id === professorId) &&
          (!courseId || r.course_id === courseId),
      )
      .sort((a, b) =>
        sort === "newest"
          ? b.created_at.localeCompare(a.created_at)
          : b.helpful_count - a.helpful_count,
      )
      .slice((page - 1) * 20, page * 20);
  return rpc<Review[]>("get_reviews", {
    p_professor_id: professorId || null,
    p_course_id: courseId || null,
    p_limit: 20,
    p_offset: (page - 1) * 20,
    p_sort: sort,
  });
}
export async function getMyReviews(page = 1) {
  await requireUser();
  return isDemo()
    ? []
    : rpc<Review[]>("get_my_reviews", { p_limit: 20, p_offset: (page - 1) * 20 });
}
export async function getOwnReview(id: string) {
  await requireUser();
  return isDemo() ? null : rpc<OwnReview | null>("get_own_review", { p_review_id: id });
}
