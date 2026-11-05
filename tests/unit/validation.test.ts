import { describe, expect, it } from "vitest";
import { isUniversityEmail, parseReviewForm, reviewSchema, safeNext } from "@/lib/validation";
const valid = {
  professor_id: "10000000-0000-4000-8000-000000000001",
  course_id: "20000000-0000-4000-8000-000000000001",
  body: "Clear lectures and thoughtful feedback on every assignment.",
  overall_rating: 5,
  workload_rating: 3,
  grading_difficulty: 2,
  tags: ["Easy A"],
  is_anonymous: true,
};
describe("university-only authentication", () => {
  it.each(["student@nyu.edu", " STUDENT@NYU.EDU "])("accepts exact domain %s", (email) =>
    expect(isUniversityEmail(email)).toBe(true),
  );
  it.each([
    "student@evilnyu.edu",
    "student@nyu.edu.attacker.com",
    "student@sub.nyu.edu",
    "@nyu.edu",
    "x@y@nyu.edu",
    "student@example.com",
  ])("rejects %s", (email) => expect(isUniversityEmail(email)).toBe(false));
  it("supports a deployment's exact configured domain", () =>
    expect(isUniversityEmail("test@university.edu", "university.edu")).toBe(true));
});
describe("authentication redirects", () => {
  it.each([
    "https://attacker.com",
    "//attacker.com",
    "/\\attacker.com",
    "/dashboard\nLocation:bad",
    null,
  ])("contains unsafe destination %s", (next) => expect(safeNext(next)).toBe("/dashboard"));
  it("keeps local destinations", () =>
    expect(safeNext("/courses/123?tab=reviews")).toBe("/courses/123?tab=reviews"));
});
describe("review input boundary", () => {
  it("validates all fields and trims text", () =>
    expect(reviewSchema.parse({ ...valid, body: ` ${valid.body} ` }).body).toBe(valid.body));
  it.each([0, 6, 1.5, "five", null])("rejects out-of-scale ratings %s", (rating) =>
    expect(reviewSchema.safeParse({ ...valid, overall_rating: rating }).success).toBe(false),
  );
  it("rejects unknown tags, short text and non-UUID foreign keys", () => {
    for (const overrides of [
      { tags: ["Invented"] },
      { body: "short" },
      { professor_id: "sql injection" },
      { body: "x".repeat(5001) },
    ])
      expect(reviewSchema.safeParse({ ...valid, ...overrides }).success).toBe(false);
  });
  it("deduplicates tags", () =>
    expect(reviewSchema.parse({ ...valid, tags: ["Easy A", "Easy A"] }).tags).toEqual(["Easy A"]));
  it("reads native forms and preserves the anonymity toggle", () => {
    const form = new FormData();
    Object.entries(valid).forEach(([key, value]) => {
      if (key !== "tags" && key !== "is_anonymous") form.set(key, String(value));
    });
    form.append("tags", "Easy A");
    form.set("is_anonymous", "on");
    expect(parseReviewForm(form).data?.is_anonymous).toBe(true);
    form.delete("is_anonymous");
    expect(parseReviewForm(form).data?.is_anonymous).toBe(false);
  });
});
