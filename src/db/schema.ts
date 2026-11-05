import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Auth owns this table; it is intentionally not exported for Drizzle generation.
const authUsers = pgSchema("auth").table("users", { id: uuid("id").primaryKey() });
const privateSchema = pgSchema("private");
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const settings = privateSchema.table("settings", {
  singleton: boolean("singleton").primaryKey().default(true),
  universityDomain: text("university_domain").default("nyu.edu").notNull(),
}, (t) => [
  check("settings_singleton_check", sql`${t.singleton}`),
  check("settings_university_domain_check", sql`${t.universityDomain} = lower(${t.universityDomain}) and ${t.universityDomain} ~ '^[a-z0-9.-]+\\.[a-z]{2,}$'`),
]).enableRLS();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  createdAt: createdAt(),
  verified: boolean("verified").default(false).notNull(),
}).enableRLS();

export const professors = pgTable("professors", {
  id: uuid("id").defaultRandom().primaryKey(),
  fullName: text("full_name").notNull(),
  department: text("department").default("Unspecified").notNull(),
  createdAt: createdAt(),
}, (t) => [
  check("professors_full_name_check", sql`length(btrim(${t.fullName})) between 1 and 200`),
  check("professors_department_check", sql`length(btrim(${t.department})) between 1 and 200`),
  uniqueIndex("professors_name_unique").on(sql`lower(btrim(${t.fullName}))`),
  index("professors_full_name_idx").on(t.fullName),
  index("professors_name_trgm_idx").using("gin", sql`${t.fullName} extensions.gin_trgm_ops`),
  index("professors_search_idx").using("gin", sql`to_tsvector('english', ${t.fullName} || ' ' || ${t.department})`),
]).enableRLS();

export const courses = pgTable("courses", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  department: text("department").default("Unspecified").notNull(),
  createdAt: createdAt(),
}, (t) => [
  check("courses_code_check", sql`length(btrim(${t.code})) between 1 and 40`),
  check("courses_title_check", sql`length(btrim(${t.title})) between 1 and 200`),
  check("courses_department_check", sql`length(btrim(${t.department})) between 1 and 200`),
  uniqueIndex("courses_code_unique").on(sql`lower(btrim(${t.code}))`),
  index("courses_code_idx").on(t.code),
  index("courses_title_trgm_idx").using("gin", sql`${t.title} extensions.gin_trgm_ops`),
  index("courses_code_trgm_idx").using("gin", sql`${t.code} extensions.gin_trgm_ops`),
  index("courses_search_idx").using("gin", sql`to_tsvector('english', ${t.code} || ' ' || ${t.title})`),
]).enableRLS();

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  professorId: uuid("professor_id").notNull().references(() => professors.id, { onDelete: "restrict" }),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "restrict" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  overallRating: integer("overall_rating").notNull(),
  workloadRating: integer("workload_rating"),
  gradingDifficulty: integer("grading_difficulty"),
  tags: text("tags").array().default(sql`'{}'::text[]`).notNull(),
  isAnonymous: boolean("is_anonymous").default(true).notNull(),
  imported: boolean("imported").default(false).notNull(),
  sourceHash: text("source_hash"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("reviews_body_check", sql`length(btrim(${t.body})) between 20 and 10000`),
  check("reviews_overall_rating_check", sql`${t.overallRating} between 1 and 5`),
  check("reviews_workload_rating_check", sql`${t.workloadRating} between 1 and 5`),
  check("reviews_grading_difficulty_check", sql`${t.gradingDifficulty} between 1 and 5`),
  check("reviews_tags_check", sql`${t.tags} <@ ARRAY['Heavy Workload','Light Workload','Reading Heavy','Easy A','Harsh Grader','Generous Curve','Lecture Heavy','Discussion Based','Accessible Office Hours','Self-Taught']::text[] and cardinality(${t.tags}) <= 10 and array_position(${t.tags}, NULL) is null`),
  check("reviews_origin_check", sql`(${t.imported} and ${t.userId} is null and ${t.isAnonymous} and ${t.sourceHash} ~ '^[0-9a-f]{64}$' and ${t.sourceHash} is not null) or (not ${t.imported} and ${t.userId} is not null and ${t.sourceHash} is null and ${t.workloadRating} is not null and ${t.gradingDifficulty} is not null)`),
  unique("reviews_user_professor_course_unique").on(t.userId, t.professorId, t.courseId),
  uniqueIndex("reviews_source_hash_unique").on(t.sourceHash).where(sql`${t.sourceHash} is not null`),
  index("reviews_professor_created_idx").on(t.professorId, t.createdAt.desc(), t.id),
  index("reviews_course_created_idx").on(t.courseId, t.createdAt.desc(), t.id),
  index("reviews_tags_idx").using("gin", t.tags),
]).enableRLS();

export const helpfulVotes = pgTable("helpful_votes", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reviewId: uuid("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  voteType: integer("vote_type").notNull(),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.reviewId] }),
  check("helpful_votes_vote_type_check", sql`${t.voteType} in (-1,1)`),
  index("helpful_votes_review_idx").on(t.reviewId),
]).enableRLS();

export const rateLimits = privateSchema.table("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
}, (t) => [check("rate_limits_count_check", sql`${t.count} > 0`)]).enableRLS();

export type Professor = typeof professors.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Review = typeof reviews.$inferSelect;
