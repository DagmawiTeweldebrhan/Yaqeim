import { describe, expect, it } from "vitest";
import { demoSearch, demoStats, professors, reviews } from "@/lib/demo";
describe("sample archive contract", () => {
  it("requires all selected tags on the same review", () => {
    const results = demoSearch("", ["Easy A", "Light Workload"]);
    expect(results).toHaveLength(1);
    expect(results[0].professor_name).toBe("Alex Morgan (sample)");
    expect(results[0].matching_reviews).toBe(2);
    expect(demoSearch("", ["Easy A", "Heavy Workload"])).toHaveLength(0);
  });
  it("searches professor, course code and title case-insensitively", () => {
    for (const q of ["alex MORGAN", "CS-UH 1001", "Introduction Computer"])
      expect(demoSearch(q, []).some((r) => r.professor_id === professors[0].id)).toBe(true);
  });
  it("excludes unknown legacy workload rather than assigning zero", () => {
    const stats = demoStats(professors[0]);
    expect(stats.workload_rating).toBe(2.5);
    expect(stats.review_count).toBe(3);
  });
  it("uses only labelled fictional people and never real author identifiers", () => {
    expect(professors.every((p) => p.full_name.endsWith("(sample)"))).toBe(true);
    expect(reviews.every((r) => !("user_id" in r) && !("email" in r))).toBe(true);
  });
});
