import type { Tag } from "./taxonomy";
export type Professor = { id: string; full_name: string; department: string };
export type Course = { id: string; code: string; title: string; department: string };
export type Metrics = {
  review_count: number;
  overall_rating: number | null;
  workload_rating: number | null;
  grading_difficulty: number | null;
};
export type ProfessorStats = Professor &
  Metrics & { tag_counts: { tag: Tag; count: number; percentage: number }[] };
export type SearchResult = Metrics & {
  professor_id: string;
  professor_name: string;
  department: string;
  course_id: string;
  course_code: string;
  course_title: string;
  matching_reviews: number;
  confidence_score: number;
};
export type Review = {
  id: string;
  professor_id: string;
  professor_name: string;
  course_id: string;
  course_code: string;
  course_title: string;
  body: string;
  overall_rating: number;
  workload_rating: number | null;
  grading_difficulty: number | null;
  tags: Tag[];
  created_at: string;
  updated_at: string;
  imported: boolean;
  is_anonymous: boolean;
  author_label: string;
  is_owner: boolean;
  helpful_count: number;
  unhelpful_count: number;
  my_vote: number;
};
export type OwnReview = Pick<
  Review,
  | "id"
  | "professor_id"
  | "course_id"
  | "body"
  | "overall_rating"
  | "workload_rating"
  | "grading_difficulty"
  | "tags"
  | "is_anonymous"
>;
export type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fields?: Record<string, string[]>;
};
