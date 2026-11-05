import { expect, it } from "vitest";
import { confidenceScore } from "@/lib/scoring";
it("rewards corroborated tag matches over a single favourable review", () => {
  expect(confidenceScore(1, 1)).toBeCloseTo(20.65, 2);
  expect(confidenceScore(20, 20)).toBeGreaterThan(confidenceScore(1, 1));
  expect(confidenceScore(1, 20)).toBeLessThan(confidenceScore(20, 20));
  expect(confidenceScore(0, 0)).toBe(0);
  expect(confidenceScore(2, 1)).toBe(0);
});
