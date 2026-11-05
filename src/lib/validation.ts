import { z } from "zod";
import { TAGS } from "./taxonomy";
export function isUniversityEmail(email: string, domain = "nyu.edu") {
  const parsed = z.email().safeParse(email.trim());
  return parsed.success && email.trim().toLowerCase().split("@")[1] === domain.toLowerCase();
}
export function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return "/dashboard";
  try { return new URL(value, "https://archive.invalid").origin === "https://archive.invalid" ? value : "/dashboard"; }
  catch { return "/dashboard"; }
}
export const reviewSchema = z.object({
  professor_id: z.uuid(), course_id: z.uuid(),
  body: z.string().trim().min(20, "Please write at least 20 characters.").max(5000, "Keep reviews under 5,000 characters."),
  overall_rating: z.coerce.number().int().min(1).max(5),
  workload_rating: z.coerce.number().int().min(1).max(5),
  grading_difficulty: z.coerce.number().int().min(1).max(5),
  tags: z.array(z.enum(TAGS)).max(TAGS.length).transform(tags => [...new Set(tags)]),
  is_anonymous: z.boolean()
});
export type ReviewInput = z.infer<typeof reviewSchema>;
export function parseReviewForm(form: FormData) {
  return reviewSchema.safeParse({ professor_id: form.get("professor_id"), course_id: form.get("course_id"), body: form.get("body"), overall_rating: form.get("overall_rating"), workload_rating: form.get("workload_rating"), grading_difficulty: form.get("grading_difficulty"), tags: form.getAll("tags"), is_anonymous: form.get("is_anonymous") === "on" });
}
