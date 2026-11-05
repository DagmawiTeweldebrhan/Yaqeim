import type { Metadata } from "next";
import Link from "next/link";
import { getReviews, searchCatalog } from "@/lib/data";
import { TAGS } from "@/lib/taxonomy";
import { first, pageNumber, Pagination, type QueryParams } from "@/components/pagination";
import { rating } from "@/components/metrics-table";
import { ReviewFeed } from "@/components/review-feed";
export const metadata: Metadata = { title: "Search the archive" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<QueryParams> }) {
  const query = await searchParams;
  const q = first(query.q).trim().slice(0, 200);
  const selected = new Set(Array.isArray(query.tag) ? query.tag : query.tag ? [query.tag] : []);
  const tags = TAGS.filter((tag) => selected.has(tag));
  const page = pageNumber(query.page);
  const [results, recent] = await Promise.all([
    searchCatalog(q, tags, page),
    !q && !tags.length && page === 1
      ? getReviews({ sort: "newest" }).then((reviews) => reviews.slice(0, 3))
      : Promise.resolve([]),
  ]);
  return (
    <>
      <div className="page-intro">
        <p className="section-label">The reading room</p>
        <h1>Find your next course.</h1>
        <p className="meta">
          Search the archive, compare experiences, and decide what fits your semester.
        </p>
      </div>
      <form action="/dashboard" method="get" className="search-form">
        <label htmlFor="search">Search courses or professors</label>
        <input
          id="search"
          className="search-input"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="A course title, course code, or professor’s name"
          maxLength={200}
        />
        <fieldset>
          <legend>What matters to you?</legend>
          <p className="meta">
            Select any combination. Results must have reviews mentioning every selected trait.
          </p>
          <div className="checkbox-grid">
            {TAGS.map((tag) => (
              <label className="checkbox-label filter-label" key={tag}>
                <input type="checkbox" name="tag" value={tag} defaultChecked={selected.has(tag)} />
                {tag}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="search-actions">
          <button type="submit">Search</button>
          <Link href="/dashboard">Clear search &amp; filters</Link>
        </div>
      </form>
      <div className="results-heading">
        <h2>{tags.length ? "Matches for your semester" : "Browse the archive"}</h2>
        <span className="meta">
          {results.length} {results.length === 1 ? "result" : "results"} on this page
        </span>
      </div>
      {!!tags.length && <p className="meta">Matching all: {tags.join(" + ")}</p>}
      {results.length ? (
        <dl className="results">
          {results.map((result) => (
            <div className="result-row" key={`${result.professor_id}-${result.course_id}`}>
              <dt>
                <Link href={`/professors/${result.professor_id}`}>{result.professor_name}</Link>
                <span className="result-rating">
                  Overall: <strong>{rating(result.overall_rating)}/5</strong>
                </span>
              </dt>
              <dd className="result-course">
                <Link href={`/courses/${result.course_id}`}>
                  <code>{result.course_code}</code> · {result.course_title}
                </Link>
              </dd>
              <dd className="result-details">
                {result.department} · {result.review_count}{" "}
                {Number(result.review_count) === 1 ? "review" : "reviews"} · Workload{" "}
                {rating(result.workload_rating)}/5 · Grading {rating(result.grading_difficulty)}/5
              </dd>
              {!!tags.length && (
                <dd className="result-details">
                  {result.matching_reviews} of {result.review_count} reviews match · Evidence
                  confidence: {Number(result.confidence_score).toFixed(0)}%
                </dd>
              )}
            </div>
          ))}
        </dl>
      ) : (
        <div className="empty-state">
          <h3>No matching results.</h3>
          <p>
            Try a shorter search or remove a filter. The archive grows with each student’s
            experience.
          </p>
          <Link href="/dashboard">Browse all available reviews</Link>
        </div>
      )}
      <Pagination page={page} count={results.length} path="/dashboard" query={{ q, tag: tags }} />
      <p className="archive-note">
        Ratings use a 1–5 scale. Higher workload and grading numbers mean more demanding courses.{" "}
        {tags.length > 0 &&
          "Evidence confidence is the conservative lower bound of the matching-review proportion (Wilson, 95%); small samples receive lower confidence."}
      </p>
      {!!recent.length && (
        <section className="section">
          <h2>Recent additions</h2>
          <p className="meta">The latest experiences shared across the archive.</p>
          <ReviewFeed reviews={recent} />
        </section>
      )}
      <section className="section">
        <hr />
        <h2>Add a page to the archive.</h2>
        <p>Remember the advice you wanted before registration? Leave it for the next student.</p>
        <Link href="/submit">Submit a review →</Link>
      </section>
    </>
  );
}
