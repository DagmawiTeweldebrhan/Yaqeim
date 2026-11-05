export const TAGS = [
  "Heavy Workload",
  "Light Workload",
  "Reading Heavy",
  "Easy A",
  "Harsh Grader",
  "Generous Curve",
  "Lecture Heavy",
  "Discussion Based",
  "Accessible Office Hours",
  "Self-Taught",
] as const;
export type Tag = (typeof TAGS)[number];
export const QUICK_TAGS: Tag[] = [
  "Easy A",
  "Light Workload",
  "Discussion Based",
  "Accessible Office Hours",
];
