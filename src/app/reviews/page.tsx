import type { Metadata } from "next";
import Link from "next/link";
import { getMyReviews } from "@/lib/data";
import { ReviewFeed } from "@/components/review-feed";
import { first, pageNumber, Pagination, type QueryParams } from "@/components/pagination";
export const metadata: Metadata = { title: "My reviews" };

export default async function MyReviews({ searchParams }: { searchParams: Promise<QueryParams> }) {
  const query = await searchParams;
  const page = pageNumber(query.page);
  const reviews = await getMyReviews(page);
  return (
    <>
      <div className="page-intro">
        <p className="section-label">Your contributions</p>
        <h1>My reviews</h1>
        <p className="meta">
          Keep your experience up to date. Only you can edit or delete the reviews you have written.
        </p>
      </div>
      {first(query.deleted) === "1" && (
        <p className="success" role="status">
          Your review has been deleted.
        </p>
      )}
      {reviews.length ? (
        <ReviewFeed reviews={reviews} />
      ) : (
        <div className="empty-state">
          <h2>A blank page, for now.</h2>
          <p>You have no reviews to display.</p>
          <Link href="/submit">Write your first review →</Link>
        </div>
      )}
      <Pagination page={page} count={reviews.length} path="/reviews" />
    </>
  );
}
