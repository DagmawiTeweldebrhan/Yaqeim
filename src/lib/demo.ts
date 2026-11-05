import type { Course, Professor, ProfessorStats, Review, SearchResult } from "./types";
import type { Tag } from "./taxonomy";
import { confidenceScore } from "./scoring";
export const professors: Professor[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    full_name: "Alex Morgan (sample)",
    department: "Computer Science",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    full_name: "Samira Noor (sample)",
    department: "Arts & Humanities",
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    full_name: "Jordan Lee (sample)",
    department: "Computer Science",
  },
];
export const courses: Course[] = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    code: "CS-UH 1001",
    title: "Introduction to Computer Science (sample)",
    department: "Computer Science",
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    code: "CORE-UH 1000",
    title: "Reading the City (sample)",
    department: "Arts & Humanities",
  },
];
const samples: [number, number, string, number, number, number, Tag[], boolean][] = [
  [
    0,
    0,
    "The weekly exercises made the ideas click. Office hours were welcoming, and the grading rubric was clear. Start the final project early and you will have room to experiment.",
    5,
    2,
    2,
    ["Accessible Office Hours", "Light Workload", "Easy A"],
    false,
  ],
  [
    0,
    0,
    "A thoughtful introduction with plenty of worked examples. The pace picks up after the midpoint. Discussion with classmates helped me get more out of the practical assignments.",
    4,
    3,
    3,
    ["Discussion Based", "Accessible Office Hours"],
    false,
  ],
  [
    1,
    1,
    "The seminar connects reading to the places around us. Come prepared to contribute each week. There is a substantial reading list, but the feedback on essays is careful and useful.",
    5,
    4,
    3,
    ["Reading Heavy", "Discussion Based"],
    false,
  ],
  [
    2,
    0,
    "Clear lectures and challenging problem sets. This version of the course asks for consistent work throughout the semester. The generous curve made the final result feel fair.",
    4,
    4,
    4,
    ["Heavy Workload", "Lecture Heavy", "Generous Curve"],
    false,
  ],
  [
    0,
    0,
    "An approachable introduction with helpful examples and a manageable weekly rhythm. This synthetic entry demonstrates how imported feedback is distinguished from new reviews.",
    4,
    2,
    2,
    ["Light Workload", "Easy A"],
    true,
  ],
];
export const reviews: Review[] = samples.map(
  ([pi, ci, body, overall, workload, grading, tags, imported], i) => ({
    id: `30000000-0000-4000-8000-00000000000${i + 1}`,
    professor_id: professors[pi].id,
    professor_name: professors[pi].full_name,
    course_id: courses[ci].id,
    course_code: courses[ci].code,
    course_title: courses[ci].title,
    body,
    overall_rating: overall,
    workload_rating: imported ? null : workload,
    grading_difficulty: imported ? null : grading,
    tags,
    created_at: `2026-09-${String(12 + i).padStart(2, "0")}T12:00:00Z`,
    updated_at: "2026-09-20T12:00:00Z",
    imported,
    is_anonymous: true,
    author_label: imported ? "Archive import" : "Anonymous student",
    is_owner: false,
    helpful_count: 8 - i,
    unhelpful_count: 0,
    my_vote: 0,
  }),
);
function mean(items: Review[], key: "overall_rating" | "workload_rating" | "grading_difficulty") {
  const values = items.map((r) => r[key]).filter((n): n is number => n !== null);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
export function demoStats(
  professor: Professor,
  items = reviews.filter((r) => r.professor_id === professor.id),
): ProfessorStats {
  const tags = [...new Set(items.flatMap((r) => r.tags))];
  return {
    ...professor,
    review_count: items.length,
    overall_rating: mean(items, "overall_rating"),
    workload_rating: mean(items, "workload_rating"),
    grading_difficulty: mean(items, "grading_difficulty"),
    tag_counts: tags
      .map((tag) => {
        const count = items.filter((r) => r.tags.includes(tag)).length;
        return { tag, count, percentage: items.length ? (count * 100) / items.length : 0 };
      })
      .sort((a, b) => b.count - a.count),
  };
}
export function demoSearch(query: string, tags: Tag[]): SearchResult[] {
  const result: SearchResult[] = [];
  for (const professor of professors)
    for (const course of courses) {
      const all = reviews.filter(
        (r) => r.professor_id === professor.id && r.course_id === course.id,
      );
      const matches = all.filter((r) => tags.every((tag) => r.tags.includes(tag)));
      const haystack =
        `${professor.full_name} ${course.code} ${course.title} ${professor.department}`.toLowerCase();
      if (
        !all.length ||
        !matches.length ||
        !query
          .toLowerCase()
          .split(/\s+/)
          .every((word) => haystack.includes(word))
      )
        continue;
      result.push({
        professor_id: professor.id,
        professor_name: professor.full_name,
        course_id: course.id,
        course_code: course.code,
        course_title: course.title,
        ...demoStats(professor, all),
        matching_reviews: matches.length,
        confidence_score: confidenceScore(matches.length, all.length),
      });
    }
  return result.sort(
    (a, b) =>
      (tags.length ? b.confidence_score - a.confidence_score : 0) ||
      (b.overall_rating ?? 0) - (a.overall_rating ?? 0) ||
      b.review_count - a.review_count,
  );
}
