import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getAggregatedProfessorStats, getReviews } from "@/lib/data";
import { MetricsTable } from "@/components/metrics-table";
import { ProgressiveReviewFeed } from "@/components/progressive-review-feed";
import { first, pageNumber, Pagination, type QueryParams } from "@/components/pagination";

export default async function ProfessorPage({
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
  const [professor, reviews] = await Promise.all([
    getAggregatedProfessorStats(id),
    getReviews({ professorId: id, page, sort }),
  ]);
  if (!professor) notFound();
  return (
    <>
      <p className="meta">
        <Link href="/dashboard">← Back to the archive</Link>
      </p>
      <div className="page-intro">
        <p className="section-label">Professor record</p>
        <h1>{professor.full_name}</h1>
        <p className="meta">
          {professor.department} · {professor.review_count}{" "}
          {Number(professor.review_count) === 1 ? "review" : "reviews"}
        </p>
      </div>
      <MetricsTable stats={professor} />
      {!!professor.tag_counts.length && (
        <section className="section">
          <h2>Often mentioned</h2>
          <div className="tags">
            {professor.tag_counts.map(({ tag, count, percentage }) => (
              <span className="tag" key={tag}>
                [ {tag} ] {Math.round(Number(percentage))}% <span className="meta">({count})</span>
              </span>
            ))}
          </div>
          <p className="meta">Percentage of this professor’s reviews mentioning each trait.</p>
        </section>
      )}
      <p className="section">
        <Link href={`/submit?professor=${id}`}>Review a course with this professor →</Link>
      </p>
      <hr />
      <section>
        <div className="feed-heading">
          <h2>Student experiences</h2>
          <nav className="sort-links" aria-label="Review order">
            <Link
              href={`/professors/${id}?sort=helpful`}
              aria-current={sort === "helpful" ? "page" : undefined}
            >
              Most helpful
            </Link>
            <span aria-hidden="true"> | </span>
            <Link
              href={`/professors/${id}?sort=newest`}
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
          professorId={id}
          sort={sort}
        />
        <Pagination
          page={page}
          count={reviews.length}
          path={`/professors/${id}`}
          query={{ sort }}
        />
      </section>
    </>
  );
}
