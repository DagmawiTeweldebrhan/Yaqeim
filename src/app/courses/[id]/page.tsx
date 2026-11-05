import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getCourseComparisons, getReviews } from "@/lib/data";
import { rating } from "@/components/metrics-table";
import { ProgressiveReviewFeed } from "@/components/progressive-review-feed";
import { first, pageNumber, Pagination, type QueryParams } from "@/components/pagination";

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<QueryParams>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  const page = pageNumber(query.page);
  const sort = first(query.sort) === "newest" ? "newest" : "helpful";
  const [comparison, reviews] = await Promise.all([
    getCourseComparisons(id),
    getReviews({ courseId: id, page, sort }),
  ]);
  if (!comparison) notFound();
  const { course, professors } = comparison;
  return (
    <>
      <p className="meta">
        <Link href="/dashboard">← Back to the archive</Link>
      </p>
      <div className="page-intro">
        <p className="section-label">
          <code>{course.code}</code> · Course record
        </p>
        <h1>{course.title}</h1>
        <p className="meta">
          {course.department} · {professors.length}{" "}
          {professors.length === 1 ? "professor" : "professors"} with student feedback
        </p>
      </div>
      <h2>Compare professors</h2>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Professor comparison table"
      >
        <table className="comparison-table">
          <caption>Ratings for this course only · all averages out of 5</caption>
          <thead>
            <tr>
              <th scope="col">Professor</th>
              <th scope="col">Overall</th>
              <th scope="col">Workload</th>
              <th scope="col">Grading</th>
              <th scope="col">Reviews</th>
            </tr>
          </thead>
          <tbody>
            {professors.map((professor) => (
              <tr key={professor.id}>
                <th scope="row">
                  <Link href={`/professors/${professor.id}`}>{professor.full_name}</Link>
                </th>
                <td>{rating(professor.overall_rating)}</td>
                <td>{rating(professor.workload_rating)}</td>
                <td>{rating(professor.grading_difficulty)}</td>
                <td>{professor.review_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!professors.length && (
        <p className="archive-note">No professor comparisons are available yet.</p>
      )}
      <p className="archive-note">
        Higher overall is better; higher workload and grading difficulty mean more demanding. A dash
        means no rating was reported. These are past experiences, not current course offerings.
      </p>
      <p>
        <Link href={`/submit?course=${id}`}>Review your experience in this course →</Link>
      </p>
      <hr />
      <section>
        <div className="feed-heading">
          <h2>Student experiences</h2>
          <nav className="sort-links" aria-label="Review order">
            <Link
              href={`/courses/${id}?sort=helpful`}
              aria-current={sort === "helpful" ? "page" : undefined}
            >
              Most helpful
            </Link>
            <span aria-hidden="true"> | </span>
            <Link
              href={`/courses/${id}?sort=newest`}
              aria-current={sort === "newest" ? "page" : undefined}
            >
              Newest
            </Link>
          </nav>
        </div>
        <ProgressiveReviewFeed
          key={`${id}-${sort}-${page}`}
          initialReviews={reviews}
          initialPage={page}
          courseId={id}
          sort={sort}
        />
        <Pagination page={page} count={reviews.length} path={`/courses/${id}`} query={{ sort }} />
      </section>
    </>
  );
}
